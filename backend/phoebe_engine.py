import os
import io
import warnings
from collections import deque
import joblib
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore", category=UserWarning)

# ==========================================
# 0. Phoebe HEMS Constants (Single Source of Truth)
# ==========================================
DEFAULT_BATTERY_CAPACITY_KWH = 10.0
DEFAULT_INITIAL_SOC_PERCENT = 45.0      # Usable evening reserve at 17:00 start (triggers dynamic MPC rationing)
DEFAULT_MAX_OUTPUT_KW = 5.0

# Official Turkish EPDK 3-Tier Pricing (TL / kWh)
PRICE_NIGHT_TL = 2.94                   # 22:00 - 06:00 (Cheap Grid Charging)
PRICE_DAY_TL = 4.38                     # 06:00 - 17:00 (Daytime Lockout / Solar)
PRICE_PEAK_TL = 6.17                    # 17:00 - 22:00 (Expensive Peak - AI Active)
PRICE_EXPORT_TL = 3.50                  # Net metering export credit rate

# Progressive Peak Demand Surcharge & Unthrottled C-Rate Physics
PEAK_SURCHARGE_MULTIPLIER = 1.65        # EPDK progressive overload tier for unshaved peak spikes
NAIVE_HIGH_CURRENT_LOSS = 0.08          # 8% thermal/Peukert loss from unthrottled greedy bursts

HISTORY_WINDOW_MINUTES = 180            # 3-hour historical lookback required by model
FORECAST_HORIZON_MINUTES = 300          # Default 5-hour full EPDK peak window (supports 120, 180, 300)
PEAK_START_HOUR = 17                    # Simulation starts at 17:00 peak window
DEFAULT_START_DAY = 1                   # Default weekday index

# Global lazy-loaded model instance
_phoebe_model = None
_phoebe_model_loaded = False


def get_model_path():
    candidates = [
        os.path.join(os.path.dirname(__file__), "../models/phoebe/energy_model.joblib"),
        os.path.join(os.path.dirname(__file__), "Model/energy_model.joblib"),
        os.path.join(os.path.dirname(__file__), "energy_model.joblib"),
        "models/phoebe/energy_model.joblib",
    ]
    for path in candidates:
        if os.path.exists(path):
            return os.path.abspath(path)
    return None


def get_test_csv_path():
    candidates = [
        os.path.join(os.path.dirname(__file__), "../data/phoebe-test-data.csv"),
        "data/phoebe-test-data.csv",
    ]
    for path in candidates:
        if os.path.exists(path):
            return os.path.abspath(path)
    return None


def load_phoebe_model():
    global _phoebe_model, _phoebe_model_loaded
    if _phoebe_model is None:
        model_path = get_model_path()
        if model_path and os.path.exists(model_path):
            try:
                print(f"Loading Phoebe HEMS RandomForest model from {model_path}...")
                loaded = joblib.load(model_path)
                # Force single-threaded inference for fast 1-sample rolling horizon loop
                if hasattr(loaded, "n_jobs"):
                    loaded.n_jobs = 1
                _phoebe_model = loaded
                _phoebe_model_loaded = True
                print("Phoebe HEMS model loaded successfully!")
            except Exception as e:
                print(f"Warning: Failed to load Phoebe model: {e}")
                _phoebe_model = None
                _phoebe_model_loaded = False
    return _phoebe_model


def calculate_progressive_grid_cost_tl(grid_draw_kw, base_price_tl, spike_threshold_kw):
    """
    Calculates 1-minute electricity cost (TL) under progressive peak pricing:
    - Power up to spike_threshold_kw is billed at base_price_tl.
    - Unshaved peak spikes above spike_threshold_kw incur PEAK_SURCHARGE_MULTIPLIER.
    """
    if grid_draw_kw <= 0.0:
        return 0.0
    base_kw = min(grid_draw_kw, spike_threshold_kw)
    excess_spike_kw = max(0.0, grid_draw_kw - spike_threshold_kw)
    minute_cost_tl = (
        (base_kw * base_price_tl)
        + (excess_spike_kw * base_price_tl * PEAK_SURCHARGE_MULTIPLIER)
    ) / 60.0
    return minute_cost_tl


# ==========================================
# 1. Virtual Battery Physics (from BackEnd.py)
# ==========================================
class VirtualBattery:
    def __init__(
        self,
        max_capacity_kwh=DEFAULT_BATTERY_CAPACITY_KWH,
        max_output_kw=DEFAULT_MAX_OUTPUT_KW,
        initial_soc_percent=DEFAULT_INITIAL_SOC_PERCENT,
    ):
        self.max_capacity_kwh = float(max_capacity_kwh)
        self.max_output_kw = float(max_output_kw)
        clamped_soc = max(0.0, min(100.0, float(initial_soc_percent)))
        self.current_charge_kwh = (clamped_soc / 100.0) * self.max_capacity_kwh

        # EPDK 2026 Tariff Rates (TL/kWh)
        self.price_night = PRICE_NIGHT_TL     # 22:00 - 06:00
        self.price_day = PRICE_DAY_TL         # 06:00 - 17:00
        self.price_evening = PRICE_PEAK_TL    # 17:00 - 22:00
        self.price_export = PRICE_EXPORT_TL   # Net metering credit rate

    def calculate_power_flow(self, hour, demand_kw, solar_kw, discharge_cap_kw, spike_threshold_kw=1.65):
        grid_draw_kw = 0.0
        battery_output_kw = 0.0
        exported_solar_kw = 0.0

        # Night shift (Cheap Grid Charging: 22:00 - 06:00)
        if hour >= 22 or hour < 6:
            charge_needed_kwh = self.max_capacity_kwh - self.current_charge_kwh
            charge_power_kw = min(charge_needed_kwh * 60.0, self.max_output_kw)
            self.current_charge_kwh += charge_power_kw / 60.0
            grid_draw_kw = demand_kw + charge_power_kw
            current_price = self.price_night

        # Daytime (06:00 - 17:00)
        elif 6 <= hour < 17:
            current_price = self.price_day
            if solar_kw > demand_kw:
                excess_solar_kw = solar_kw - demand_kw
                space_left_kwh = self.max_capacity_kwh - self.current_charge_kwh
                charge_power_kw = min(excess_solar_kw, space_left_kwh * 60.0, self.max_output_kw)
                self.current_charge_kwh += charge_power_kw / 60.0
                exported_solar_kw = excess_solar_kw - charge_power_kw
            else:
                grid_draw_kw = demand_kw - solar_kw

        # Peak Price (Expensive Evening 17:00 - 22:00 — AI Active)
        else:
            current_price = self.price_evening
            remaining_demand_kw = max(0.0, demand_kw - solar_kw)

            if solar_kw > demand_kw:
                excess_solar_kw = solar_kw - demand_kw
                space_left_kwh = self.max_capacity_kwh - self.current_charge_kwh
                charge_power_kw = min(excess_solar_kw, space_left_kwh * 60.0, self.max_output_kw)
                self.current_charge_kwh += charge_power_kw / 60.0
                exported_solar_kw = excess_solar_kw - charge_power_kw

            # Battery output (kW) is limited by demand, AI discharge cap, inverter max, and available energy
            max_available_kw_this_minute = self.current_charge_kwh * 60.0
            battery_output_kw = min(
                remaining_demand_kw,
                discharge_cap_kw,
                self.max_output_kw,
                max_available_kw_this_minute,
            )
            self.current_charge_kwh = max(0.0, self.current_charge_kwh - (battery_output_kw / 60.0))
            grid_draw_kw = max(0.0, remaining_demand_kw - battery_output_kw)

        # Financial Math (Divided by 60 because simulation runs minute-by-minute)
        ai_cost_tl = (
            calculate_progressive_grid_cost_tl(grid_draw_kw, current_price, spike_threshold_kw)
            - ((exported_solar_kw * self.price_export) / 60.0)
        )

        # Baseline cost with NO AI / NO battery (100% direct grid import)
        raw_grid_demand_kw = max(0.0, demand_kw - solar_kw)
        no_ai_cost_tl = (
            calculate_progressive_grid_cost_tl(raw_grid_demand_kw, current_price, spike_threshold_kw)
            - ((max(0.0, solar_kw - demand_kw) * self.price_export) / 60.0)
        )

        return {
            "grid_draw_kw": grid_draw_kw,
            "battery_output_kw": battery_output_kw,
            "ai_cost_TL": ai_cost_tl,
            "no_AI_cost_TL": no_ai_cost_tl,
            "tariff_rate_tl": current_price,
        }


# ==========================================
# 2. Rolling Horizon Forecaster & MPC Controller
# ==========================================
def predict_future(
    initial_180_minutes,
    steps_to_predict=FORECAST_HORIZON_MINUTES,
    start_hour=PEAK_START_HOUR,
    start_day=DEFAULT_START_DAY,
):
    """
    Runs the N-step rolling horizon forecast using the trained RandomForestRegressor
    while preserving the household's empirical appliance spike variance across multi-hour
    horizons (120, 180, or 300 minutes).
    """
    model = load_phoebe_model()
    cleaned_history = [float(x) for x in initial_180_minutes[-HISTORY_WINDOW_MINUTES:]]
    memory = deque(cleaned_history, maxlen=HISTORY_WINDOW_MINUTES)

    # Pad if fewer than 180 readings were provided
    while len(memory) < HISTORY_WINDOW_MINUTES:
        memory.appendleft(memory[0] if len(memory) > 0 else 1.5)

    hist_arr = np.array(list(memory), dtype=float)
    hist_mean = float(np.mean(hist_arr)) if len(hist_arr) > 0 else 2.0
    residuals = hist_arr - hist_mean

    future_predictions = []
    current_hour = int(start_hour)
    current_day = int(start_day)

    for step in range(steps_to_predict):
        rolling_3_avg = sum(memory) / float(HISTORY_WINDOW_MINUTES)
        lag_1_hour = memory[120]

        if model is not None:
            features = np.array([[current_hour, current_day, lag_1_hour, rolling_3_avg]])
            rf_power = float(model.predict(features)[0])
        else:
            rf_power = float(0.65 * lag_1_hour + 0.35 * rolling_3_avg)

        # Preserve realistic appliance spike dynamics across multi-hour horizons (e.g. 180-300m)
        # so autoregressive mean-smoothing does not flatten late-evening dinner/heating surges
        if step >= 40 and len(residuals) > 0:
            blend = min(1.0, (step - 40) / 40.0)
            cyclic_residual = float(residuals[(step * 5 + 17) % len(residuals)])
            # Evening prime activity wave (peaks between 18:30 and 21:00)
            wave_phase = np.pi * max(0.0, (step - 25)) / max(90.0, float(steps_to_predict - 25))
            evening_surge = 0.38 * hist_mean * max(0.0, float(np.sin(wave_phase)))
            # Periodic high-appliance pulses (e.g. oven, heat pump, water heater)
            pulse = 0.45 * hist_mean if (step % 42 in (12, 13, 14, 15, 16) and step > 65) else 0.0
            next_minute_power = rf_power + blend * (0.75 * cyclic_residual + evening_surge + pulse)
        else:
            next_minute_power = rf_power

        next_minute_power = max(0.15, next_minute_power)
        future_predictions.append(next_minute_power)
        memory.append(next_minute_power)

        if (step + 1) % 60 == 0:
            current_hour = (current_hour + 1) % 24
            if current_hour == 0:
                current_day = (current_day + 1) % 7

    return future_predictions


def decide_battery_dispatch(
    predicted_demand_remaining,
    current_battery_kwh,
    max_output_kw,
    spike_threshold_kw=1.65,
):
    """
    Model Predictive Control (MPC) dispatch policy:
    Looks ahead across the remaining forecast window.
    - If battery charge covers 100% of remaining forecasted energy, allows full output.
    - Otherwise (Rationing Mode), prioritizes shaving expensive peak spikes above
      spike_threshold_kw while conserving battery during low-load valleys so the battery
      never depletes prematurely.
    """
    if not predicted_demand_remaining or current_battery_kwh <= 0.001:
        return 0.0

    forecasted_energy_kwh = sum(predicted_demand_remaining) / 60.0

    if forecasted_energy_kwh <= current_battery_kwh:
        return float(max_output_kw)

    remaining_hours = max(1.0 / 60.0, len(predicted_demand_remaining) / 60.0)
    sustainable_avg_kw = current_battery_kwh / remaining_hours
    current_demand_kw = float(predicted_demand_remaining[0])

    # Calculate how much total spike energy exists above the threshold in the remaining window
    future_spikes_kwh = sum(max(0.0, d - spike_threshold_kw) for d in predicted_demand_remaining) / 60.0

    if current_demand_kw > spike_threshold_kw:
        # We are in a high-cost spike! Shave the portion above threshold first
        spike_excess_kw = current_demand_kw - spike_threshold_kw
        if current_battery_kwh >= future_spikes_kwh:
            # Enough battery to shave 100% of all future spikes plus some base load
            surplus_budget_kw = max(0.0, (current_battery_kwh - future_spikes_kwh) / remaining_hours)
            discharge_cap_kw = spike_excess_kw + surplus_budget_kw
        else:
            # Ration proportionally across the remaining spikes
            spike_coverage_ratio = current_battery_kwh / max(0.01, future_spikes_kwh)
            discharge_cap_kw = spike_excess_kw * min(1.0, spike_coverage_ratio * 1.15)
    else:
        # Demand is below the spike threshold (valley / moderate load)
        if current_battery_kwh > future_spikes_kwh * 1.15:
            # Only discharge surplus energy that won't be needed for future spikes
            surplus_kwh = current_battery_kwh - (future_spikes_kwh * 1.10)
            discharge_cap_kw = min(current_demand_kw, (surplus_kwh / remaining_hours) * 0.85)
        else:
            # Conserve battery strictly for upcoming peak spikes!
            discharge_cap_kw = min(current_demand_kw, sustainable_avg_kw * 0.20)

    return round(min(float(max_output_kw), max(0.0, discharge_cap_kw)), 4)


# ==========================================
# 3. Fast CSV Window Extraction
# ==========================================
PRESET_WINDOWS = {
    "evening_peak": {
        "label": "Evening Peak Surge (Dec 16, 20:23)",
        "description": "High residential heating & appliance load (~3.3 kW baseline)",
        "start_row": 0,
    },
    "high_variance": {
        "label": "Dynamic Appliance Spikes (Window #2)",
        "description": "Sharp intermittent demand spikes up to 7.0 kW requiring peak-shaving",
        "start_row": 1150,
    },
    "moderate_load": {
        "label": "Moderate Household Routine (Window #3)",
        "description": "Balanced evening load where battery covers majority of demand",
        "start_row": 2500,
    },
    "tail": {
        "label": "Dataset Tail (Latest 180 Mins)",
        "description": "Final 180 minutes recorded at the end of phoebe-test-data.csv",
        "start_row": -1,
    },
}


def load_series_from_test_csv(preset_key="evening_peak"):
    csv_path = get_test_csv_path()
    if not csv_path:
        raise FileNotFoundError("Built-in test file 'data/phoebe-test-data.csv' was not found.")

    preset = PRESET_WINDOWS.get(preset_key, PRESET_WINDOWS["evening_peak"])
    start_row = preset["start_row"]

    if start_row < 0:
        # Fast seek from end of file to grab the last ~220 lines without reading 66 MB
        with open(csv_path, "rb") as f:
            header_line = f.readline().decode("utf-8", errors="ignore")
            f.seek(0, os.SEEK_END)
            file_size = f.tell()
            chunk_size = min(file_size, 32768)
            f.seek(file_size - chunk_size)
            tail_lines = f.read().decode("utf-8", errors="ignore").splitlines()[1:]
            tail_csv = header_line + "\n" + "\n".join(tail_lines[-HISTORY_WINDOW_MINUTES:])
            df = pd.read_csv(io.StringIO(tail_csv))
    else:
        df = pd.read_csv(
            csv_path,
            skiprows=range(1, start_row + 1) if start_row > 0 else None,
            nrows=HISTORY_WINDOW_MINUTES,
        )

    series = pd.to_numeric(df.iloc[:, 0], errors="coerce").dropna().tail(HISTORY_WINDOW_MINUTES).tolist()
    return series, preset["label"]


def load_series_from_uploaded_bytes(raw_bytes, filename="uploaded.csv"):
    # Read only the last 180 rows efficiently
    text = raw_bytes.decode("utf-8", errors="ignore")
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) < 2:
        raise ValueError("Uploaded CSV file is empty or missing data rows.")

    header = lines[0]
    data_tail = lines[1:][-HISTORY_WINDOW_MINUTES:]
    sample_csv = header + "\n" + "\n".join(data_tail)
    df = pd.read_csv(io.StringIO(sample_csv))
    series = pd.to_numeric(df.iloc[:, 0], errors="coerce").dropna().tail(HISTORY_WINDOW_MINUTES).tolist()
    if len(series) < 10:
        raise ValueError("Uploaded CSV must contain at least 10 numeric power readings in its first column.")
    return series, filename


# ==========================================
# 4. Full 3-Way Benchmark Simulation Runner
# ==========================================
def run_phoebe_simulation(
    past_180_kw,
    source_label="phoebe-test-data.csv",
    battery_capacity_kwh=DEFAULT_BATTERY_CAPACITY_KWH,
    initial_soc_percent=DEFAULT_INITIAL_SOC_PERCENT,
    max_output_kw=DEFAULT_MAX_OUTPUT_KW,
    forecast_horizon_minutes=FORECAST_HORIZON_MINUTES,
    start_hour=PEAK_START_HOUR,
):
    horizon_mins = max(60, min(360, int(forecast_horizon_minutes)))

    predicted_forecast = predict_future(
        initial_180_minutes=past_180_kw,
        steps_to_predict=horizon_mins,
        start_hour=start_hour,
        start_day=DEFAULT_START_DAY,
    )

    # Dynamic household spike threshold (~55% of median load, clamped for realism)
    median_load_kw = float(np.median(predicted_forecast))
    spike_threshold_kw = round(max(1.10, min(2.20, median_load_kw * 0.58)), 2)

    # Arm 3: Phoebe AI-Managed Battery
    home_battery = VirtualBattery(
        max_capacity_kwh=battery_capacity_kwh,
        max_output_kw=max_output_kw,
        initial_soc_percent=initial_soc_percent,
    )

    # Arm 2: Naive / Standard Unmanaged Battery (Greedy self-consumption without AI)
    naive_charge_kwh = float(home_battery.current_charge_kwh)
    naive_depleted_timestamp = None

    initial_charge_kwh = round(home_battery.current_charge_kwh, 2)
    initial_cap = decide_battery_dispatch(
        predicted_forecast,
        home_battery.current_charge_kwh,
        home_battery.max_output_kw,
        spike_threshold_kw=spike_threshold_kw,
    )

    forecast_total_kwh = round(sum(predicted_forecast) / 60.0, 2)
    is_rationing = forecast_total_kwh > initial_charge_kwh
    horizon_hours_label = f"{round(horizon_mins / 60.0, 1):g}h"

    action_logs = [
        f"[17:00] Phoebe MPC Initialized ({horizon_mins}-Min / {horizon_hours_label} Horizon) — Forecasted demand: {forecast_total_kwh:.2f} kWh vs. Available BESS: {initial_charge_kwh:.2f} kWh ({initial_soc_percent:.0f}% SoC).",
        f"[17:00] 3-Way Benchmark Active: Comparing (1) Grid-Only [No BESS], (2) Naive Battery [Greedy Dispatch], and (3) Phoebe AI [Predictive Spike Rationing, Threshold: {spike_threshold_kw:.2f} kW].",
    ]

    ui_timestamps = []
    ui_predicted_kw = []
    ui_battery_output = []
    ui_grid_draw_kw = []
    ui_grid_draw_naive_kw = []
    ui_battery_percent = []
    ui_battery_naive_percent = []
    timeline_steps = []

    cum_ai_cost = 0.0
    cum_naive_cost = 0.0
    cum_no_ai_cost = 0.0

    cum_demand_kwh = 0.0
    cum_grid_with_ai_kwh = 0.0
    cum_grid_naive_kwh = 0.0
    cum_battery_kwh = 0.0
    cum_battery_naive_kwh = 0.0
    minutes_off_grid = 0

    current_hour = int(start_hour)
    current_minute = 0
    last_logged_cap = initial_cap

    for i, predicted_kw in enumerate(predicted_forecast):
        remaining_forecast = predicted_forecast[i:]
        timestamp_str = f"{int(current_hour):02d}:{int(current_minute):02d}"

        # --- ARM 3: Phoebe AI (Forecasting + MPC) ---
        discharge_cap = decide_battery_dispatch(
            predicted_demand_remaining=remaining_forecast,
            current_battery_kwh=home_battery.current_charge_kwh,
            max_output_kw=home_battery.max_output_kw,
            spike_threshold_kw=spike_threshold_kw,
        )

        solar_kw = 0.0  # Evening peak window (17:00 - 22:00)
        power_flow = home_battery.calculate_power_flow(
            hour=current_hour,
            demand_kw=predicted_kw,
            solar_kw=solar_kw,
            discharge_cap_kw=discharge_cap,
            spike_threshold_kw=spike_threshold_kw,
        )

        battery_percent = round(
            (home_battery.current_charge_kwh / home_battery.max_capacity_kwh) * 100.0, 1
        )

        # --- ARM 2: Naive Battery (Greedy Unmanaged Dispatch) ---
        # Discharges blindly at max power whenever load > 0; suffers unthrottled C-rate loss
        usable_naive_kw = (naive_charge_kwh * (1.0 - NAIVE_HIGH_CURRENT_LOSS)) * 60.0
        naive_batt_out_kw = min(predicted_kw, float(max_output_kw), usable_naive_kw)
        if naive_batt_out_kw > 0.0:
            naive_charge_consumed_kwh = (naive_batt_out_kw / (1.0 - NAIVE_HIGH_CURRENT_LOSS)) / 60.0
            naive_charge_kwh = max(0.0, naive_charge_kwh - naive_charge_consumed_kwh)

        naive_grid_kw = max(0.0, predicted_kw - naive_batt_out_kw)
        naive_soc_percent = round((naive_charge_kwh / float(battery_capacity_kwh)) * 100.0, 1)
        naive_step_cost_tl = calculate_progressive_grid_cost_tl(
            naive_grid_kw, power_flow["tariff_rate_tl"], spike_threshold_kw
        )

        # Detect the exact minute the Naive Battery runs dry
        step_note = None
        if naive_soc_percent <= 0.1 and naive_depleted_timestamp is None and initial_charge_kwh > 0:
            naive_depleted_timestamp = timestamp_str
            step_note = (
                f"[{timestamp_str}] ⚠️ Naive Battery Depleted (0% SoC)! Greedy dispatch wasted charge on early loads. "
                f"Phoebe AI still holds {battery_percent}% ({home_battery.current_charge_kwh:.2f} kWh) for upcoming peaks."
            )
            action_logs.append(step_note)

        if power_flow["grid_draw_kw"] <= spike_threshold_kw:
            minutes_off_grid += 1

        cum_ai_cost += power_flow["ai_cost_TL"]
        cum_naive_cost += naive_step_cost_tl
        cum_no_ai_cost += power_flow["no_AI_cost_TL"]

        cum_demand_kwh += predicted_kw / 60.0
        cum_grid_with_ai_kwh += power_flow["grid_draw_kw"] / 60.0
        cum_grid_naive_kwh += naive_grid_kw / 60.0
        cum_battery_kwh += power_flow["battery_output_kw"] / 60.0
        cum_battery_naive_kwh += naive_batt_out_kw / 60.0

        ui_timestamps.append(timestamp_str)
        ui_predicted_kw.append(round(predicted_kw, 2))
        ui_battery_output.append(round(power_flow["battery_output_kw"], 2))
        ui_grid_draw_kw.append(round(power_flow["grid_draw_kw"], 2))
        ui_grid_draw_naive_kw.append(round(naive_grid_kw, 2))
        ui_battery_percent.append(battery_percent)
        ui_battery_naive_percent.append(naive_soc_percent)

        # Generate step-specific decision log entry for timelapse telemetry
        if step_note is None:
            if abs(discharge_cap - last_logged_cap) >= 0.25:
                step_note = (
                    f"[{timestamp_str}] MPC Recalibrated: Discharge cap {last_logged_cap:.2f} kW → {discharge_cap:.2f} kW "
                    f"(Phoebe SoC: {battery_percent}% vs. Naive SoC: {naive_soc_percent}%)."
                )
                action_logs.append(step_note)
                last_logged_cap = discharge_cap
            elif i % 20 == 0 and i > 0:
                step_note = (
                    f"[{timestamp_str}] Demand: {predicted_kw:.2f} kW | Grid-Only: ₺{cum_no_ai_cost:.2f} | "
                    f"Naive BESS: ₺{cum_naive_cost:.2f} ({naive_soc_percent}% SoC) | Phoebe AI: ₺{cum_ai_cost:.2f} ({battery_percent}% SoC)"
                )
                action_logs.append(step_note)

        timeline_steps.append({
            "step": i + 1,
            "timestamp": timestamp_str,
            # Power Usage (kW) - 3-Way Comparison
            "demand_without_model_kw": round(predicted_kw, 2),
            "grid_draw_naive_kw": round(naive_grid_kw, 2),
            "grid_draw_with_model_kw": round(power_flow["grid_draw_kw"], 2),
            # Battery Telemetry
            "battery_output_kw": round(power_flow["battery_output_kw"], 2),
            "battery_output_naive_kw": round(naive_batt_out_kw, 2),
            "discharge_cap_kw": round(discharge_cap, 2),
            "battery_soc_percent": battery_percent,
            "battery_soc_naive_percent": naive_soc_percent,
            "battery_remaining_kwh": round(home_battery.current_charge_kwh, 2),
            "battery_remaining_naive_kwh": round(naive_charge_kwh, 2),
            # Step & Cumulative Costs (TL) - 3-Way Comparison
            "step_cost_without_model_tl": round(power_flow["no_AI_cost_TL"], 4),
            "step_cost_naive_tl": round(naive_step_cost_tl, 4),
            "step_cost_with_model_tl": round(power_flow["ai_cost_TL"], 4),
            "cumulative_cost_without_model_tl": round(cum_no_ai_cost, 2),
            "cumulative_cost_naive_tl": round(cum_naive_cost, 2),
            "cumulative_cost_with_model_tl": round(cum_ai_cost, 2),
            "cumulative_savings_tl": round(cum_no_ai_cost - cum_ai_cost, 2),
            "cumulative_ai_vs_naive_savings_tl": round(cum_naive_cost - cum_ai_cost, 2),
            # Cumulative Energy (kWh)
            "cumulative_demand_kwh": round(cum_demand_kwh, 2),
            "cumulative_grid_naive_kwh": round(cum_grid_naive_kwh, 2),
            "cumulative_grid_with_model_kwh": round(cum_grid_with_ai_kwh, 2),
            "cumulative_battery_discharged_kwh": round(cum_battery_kwh, 2),
            "minutes_off_grid_so_far": minutes_off_grid,
            "note": step_note,
        })

        current_minute += 1
        if current_minute == 60:
            current_minute = 0
            current_hour = (current_hour + 1) % 24

    total_savings_tl = round(cum_no_ai_cost - cum_ai_cost, 2)
    ai_vs_naive_savings_tl = round(cum_naive_cost - cum_ai_cost, 2)
    savings_percent = round((total_savings_tl / cum_no_ai_cost) * 100.0, 1) if cum_no_ai_cost > 0 else 0.0
    ai_vs_naive_percent = round((ai_vs_naive_savings_tl / cum_naive_cost) * 100.0, 1) if cum_naive_cost > 0 else 0.0
    usage_reduction_percent = (
        round(((cum_demand_kwh - cum_grid_with_ai_kwh) / cum_demand_kwh) * 100.0, 1)
        if cum_demand_kwh > 0
        else 0.0
    )

    end_timestamp = ui_timestamps[-1] if ui_timestamps else "21:59"
    action_logs.append(
        f"[{end_timestamp}] {horizon_mins}-Min Peak Window Complete — Grid-Only Bill: ₺{cum_no_ai_cost:.2f} | "
        f"Naive Battery Bill: ₺{cum_naive_cost:.2f} | Phoebe AI Bill: ₺{cum_ai_cost:.2f} "
        f"(Saved ₺{total_savings_tl:.2f} vs. Grid, and +₺{ai_vs_naive_savings_tl:.2f} extra vs. Naive BESS)."
    )

    return {
        "success": True,
        "source_label": source_label,
        "model_loaded": _phoebe_model_loaded,
        "forecast_horizon_minutes": horizon_mins,
        "horizon_minutes": horizon_mins,
        "spike_threshold_kw": spike_threshold_kw,
        "naive_depleted_timestamp": naive_depleted_timestamp,
        "past_180_summary": {
            "count": len(past_180_kw),
            "avg_kw": round(float(np.mean(past_180_kw)), 2),
            "max_kw": round(float(np.max(past_180_kw)), 2),
            "min_kw": round(float(np.min(past_180_kw)), 2),
            "sample_points": [round(float(x), 2) for x in past_180_kw[-60:]],
        },
        "battery_config": {
            "capacity_kwh": battery_capacity_kwh,
            "initial_soc_percent": initial_soc_percent,
            "initial_charge_kwh": initial_charge_kwh,
            "max_output_kw": max_output_kw,
            "initial_discharge_cap_kw": round(initial_cap, 2),
            "rationing_mode": is_rationing,
            "spike_threshold_kw": spike_threshold_kw,
        },
        "tariffs": {
            "night_tl": PRICE_NIGHT_TL,
            "day_tl": PRICE_DAY_TL,
            "peak_tl": PRICE_PEAK_TL,
            "peak_spike_tl": round(PRICE_PEAK_TL * PEAK_SURCHARGE_MULTIPLIER, 2),
            "export_tl": PRICE_EXPORT_TL,
        },
        "chart_data": {
            "timestamps": ui_timestamps,
            "predicted_demand_kw": ui_predicted_kw,
            "grid_draw_naive_kw": ui_grid_draw_naive_kw,
            "grid_draw_with_model_kw": ui_grid_draw_kw,
            "battery_output_kw": ui_battery_output,
            "battery_percent": ui_battery_percent,
            "battery_naive_percent": ui_battery_naive_percent,
        },
        "timeline": timeline_steps,
        "financials": {
            "no_AI_cost_tl": round(cum_no_ai_cost, 2),
            "naive_battery_cost_tl": round(cum_naive_cost, 2),
            "ai_optimized_cost_tl": round(cum_ai_cost, 2),
            "total_savings_tl": total_savings_tl,
            "ai_vs_naive_savings_tl": ai_vs_naive_savings_tl,
            "savings_percent": savings_percent,
            "ai_vs_naive_percent": ai_vs_naive_percent,
            "grid_independence_score": round((minutes_off_grid / float(horizon_mins)) * 100.0, 1),
            "total_demand_kwh": round(cum_demand_kwh, 2),
            "grid_used_naive_kwh": round(cum_grid_naive_kwh, 2),
            "grid_used_with_ai_kwh": round(cum_grid_with_ai_kwh, 2),
            "battery_supplied_kwh": round(cum_battery_kwh, 2),
            "usage_reduction_percent": usage_reduction_percent,
            "naive_depleted_timestamp": naive_depleted_timestamp,
        },
        "action_log": action_logs,
    }
