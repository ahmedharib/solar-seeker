import math
import requests

# ==========================================
# 0. Shared Physical & Financial Constants
# ==========================================
# Single source of truth — imported by main.py so every endpoint uses the same assumptions.
PACKING_FACTOR = 0.65               # Usable fraction of gross roof (setbacks, fire paths, edges)
PANEL_DENSITY_KWP_PER_M2 = 0.20     # Modern monocrystalline panels (~400 W per 2 m²)
SYSTEM_LOSS_PERCENT = 14.0          # Cabling, inverter, soiling, shading losses
PROJECT_LIFETIME_YEARS = 25
GRID_EMISSION_FACTOR_KG_PER_KWH = 0.40  # Approx. Turkish / EU-average grid carbon intensity
CO2_ABSORBED_PER_TREE_KG_PER_YEAR = 21.0  # Commonly cited figure for one mature tree

# Realistic Financial Modeling Constants
ANNUAL_PANEL_DEGRADATION_RATE = 0.005      # 0.5% efficiency loss per year (NREL standard)
ANNUAL_TARIFF_ESCALATION_RATE = 0.04       # 4.0% annual grid electricity price escalation
INVERTER_REPLACEMENT_YEAR = 11            # Inverter replacement year (typical 10-12 year inverter lifespan)
INVERTER_REPLACEMENT_COST_FRACTION = 0.12 # ~12% of initial turnkey installation CapEx
ANNUAL_OM_COST_FRACTION = 0.005           # 0.5% annual Operations & Maintenance of CapEx

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def calculate_system_size(gross_area_m2, packing_factor=PACKING_FACTOR,
                          panel_density_kwp_per_m2=PANEL_DENSITY_KWP_PER_M2):
    """
    Converts a gross rooftop area into net usable area and installable peak power.

    Returns:
        dict: gross_area_m2, net_usable_area_m2, peakpower_kwp
    """
    gross_area_m2 = max(0.0, float(gross_area_m2))
    net_usable_area_m2 = gross_area_m2 * packing_factor
    peakpower_kwp = net_usable_area_m2 * panel_density_kwp_per_m2
    return {
        "gross_area_m2": round(gross_area_m2, 2),
        "net_usable_area_m2": round(net_usable_area_m2, 2),
        "peakpower_kwp": round(peakpower_kwp, 2),
        "packing_factor": packing_factor,
        "panel_density_kwp_per_m2": panel_density_kwp_per_m2,
    }


# ==========================================
# 1. Physics Engine (PVGIS API Integration)
# ==========================================
def get_pvgis_yield(lat, lon, peakpower_kwp, loss=SYSTEM_LOSS_PERCENT):
    """
    Fetches the estimated annual solar energy yield from the EU PVGIS API.
    
    Args:
        lat (float): Latitude of the location (e.g., 41.0 for Istanbul)
        lon (float): Longitude of the location (e.g., 28.6 for Beylikduzu)
        peakpower_kwp (float): Installed peak power in kWp.
        loss (float): System losses in percentage (default 14%).
        
    Returns:
        dict: A dictionary containing annual yield and monthly data.
    """
    url = "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc"
    
    params = {
        "lat": lat,
        "lon": lon,
        "peakpower": peakpower_kwp,
        "loss": loss,
        "optimalinclination": 1, # Automatically calculates for the best roof pitch
        "outputformat": "json"
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        # Extract the annual yield (kWh)
        annual_yield_kwh = data['outputs']['totals']['fixed']['E_y']
        monthly_data = data['outputs']['monthly']['fixed']

        # Optimal tilt chosen by PVGIS (useful to show in the UI)
        optimal_tilt_deg = None
        try:
            optimal_tilt_deg = data['inputs']['mounting_system']['fixed']['slope']['value']
        except (KeyError, TypeError):
            pass
        
        return {
            "success": True,
            "source": "pvgis",
            "annual_yield_kwh": annual_yield_kwh,
            "monthly_data": monthly_data,
            "optimal_tilt_deg": optimal_tilt_deg,
        }
    except (requests.exceptions.RequestException, KeyError, ValueError) as e:
        print(f"PVGIS API Error: {e}")
        return {
            "success": False,
            "error": str(e)
        }


def estimate_yield_fallback(lat, peakpower_kwp, loss=SYSTEM_LOSS_PERCENT):
    """
    Physics-based fallback used when PVGIS is unreachable or the location is outside coverage.

    Specific yield (kWh/kWp/year) is approximated from latitude:
      - ~1650 kWh/kWp in the sunbelt (|lat| <= 25°)
      - drops ~20 kWh/kWp per degree beyond that (Istanbul ≈ 1330, PVGIS ≈ 1390)
    The 1650 baseline already reflects typical (~14%) losses; it is rescaled if a
    different loss value is supplied. Monthly values follow a seasonal cosine whose
    amplitude grows with latitude and flips for the southern hemisphere.
    """
    abs_lat = min(abs(float(lat)), 70.0)
    specific_yield = 1650.0 if abs_lat <= 25 else 1650.0 - 20.0 * (abs_lat - 25.0)
    specific_yield = max(specific_yield, 700.0)
    specific_yield *= (100.0 - loss) / (100.0 - SYSTEM_LOSS_PERCENT)

    annual_yield_kwh = specific_yield * peakpower_kwp

    # Seasonal distribution (peak mid-June in the north, mid-December in the south)
    amplitude = min(0.6, abs_lat / 70.0)
    peak_month = 6.5 if lat >= 0 else 0.5
    weights = [1.0 + amplitude * math.cos(2 * math.pi * (m - peak_month) / 12.0) for m in range(1, 13)]
    total_w = sum(weights)

    monthly_data = [
        {"month": m, "E_m": round(annual_yield_kwh * w / total_w, 2)}
        for m, w in zip(range(1, 13), weights)
    ]

    return {
        "success": True,
        "source": "fallback_estimate",
        "annual_yield_kwh": round(annual_yield_kwh, 2),
        "monthly_data": monthly_data,
        "optimal_tilt_deg": round(abs_lat * 0.76 + 3.1, 1),  # Common rule-of-thumb tilt
    }


def get_solar_yield(lat, lon, peakpower_kwp, loss=SYSTEM_LOSS_PERCENT):
    """
    Preferred entry point for the API: tries PVGIS first, then falls back to the
    latitude-based estimator so the app always returns a result.
    Output always contains 'source' ('pvgis' or 'fallback_estimate').
    """
    result = get_pvgis_yield(lat, lon, peakpower_kwp, loss=loss)
    if result.get("success"):
        return result

    fallback = estimate_yield_fallback(lat, peakpower_kwp, loss=loss)
    fallback["pvgis_error"] = result.get("error")
    return fallback


def format_monthly_chart(monthly_data):
    """
    Normalizes PVGIS / fallback monthly output into a frontend-ready list:
    [{"month": 1, "label": "Jan", "energy_kwh": 812.4}, ...]
    """
    chart = []
    for row in monthly_data or []:
        m = int(row.get("month", 0))
        chart.append({
            "month": m,
            "label": MONTH_NAMES[m - 1] if 1 <= m <= 12 else str(m),
            "energy_kwh": round(float(row.get("E_m", 0.0)), 1),
        })
    return chart


# ==========================================
# 2. Financial Math Engine
# ==========================================
def calculate_roi(annual_yield_kwh, peakpower_kwp, electricity_rate=3.50, install_cost_per_kwp=40000.0,
                  monthly_bill=1500.0, lifetime_years=PROJECT_LIFETIME_YEARS):
    """
    Calculates the financial ROI and payback period.
    
    Args:
        annual_yield_kwh (float): Energy generated per year in kWh.
        peakpower_kwp (float): Size of the solar system in kWp.
        electricity_rate (float): Cost of electricity per kWh (e.g., $0.10/kWh or local equivalent).
        install_cost_per_kwp (float): Cost to install 1 kWp of solar panels (default $1000/kWp).
        monthly_bill (float, optional): User's average monthly electricity bill. Enables bill-offset metrics.
        lifetime_years (int): Projection horizon for the cashflow schedule (default 25).
        
    Returns:
        dict: Financial metrics including total cost, annual savings, payback period,
              bill offset (if monthly_bill given), and a year-by-year cashflow schedule.
    """
    
    # 1. Total Installation Cost
    total_installation_cost = peakpower_kwp * install_cost_per_kwp
    
    # 2. Year 1 Baseline Annual Savings (Yield * Rate)
    annual_savings_year1 = annual_yield_kwh * electricity_rate
    simple_payback_years = (total_installation_cost / annual_savings_year1) if annual_savings_year1 > 0 else None

    # 3. 25-Year Realistic Cash Flow Projection
    # Accounts for 0.5% annual panel degradation, 4.0% utility tariff escalation,
    # 0.5% annual O&M, and Year 11 inverter replacement.
    cashflow_schedule = [{
        "year": 0,
        "annual_yield_kwh": 0.0,
        "effective_rate_tl": round(electricity_rate, 2),
        "annual_savings": 0.0,
        "om_cost": 0.0,
        "inverter_cost": 0.0,
        "net_cashflow": round(-total_installation_cost, 2),
        "cumulative_savings": 0.0,
        "cumulative_net": round(-total_installation_cost, 2),
        "is_inverter_replacement": False,
    }]

    cumulative_savings = 0.0
    cumulative_net = -total_installation_cost
    realistic_payback_years = None

    for year in range(1, lifetime_years + 1):
        # 0.5% annual panel degradation: year 1 = 100%, year 2 = 99.5%, ...
        degradation_factor = (1.0 - ANNUAL_PANEL_DEGRADATION_RATE) ** (year - 1)
        year_yield = annual_yield_kwh * degradation_factor

        # 4.0% annual electricity tariff escalation
        inflation_factor = (1.0 + ANNUAL_TARIFF_ESCALATION_RATE) ** (year - 1)
        year_rate = electricity_rate * inflation_factor

        # Electricity savings value generated this year
        year_savings = year_yield * year_rate

        # 0.5% annual O&M of CapEx, escalating with inflation
        om_cost = (total_installation_cost * ANNUAL_OM_COST_FRACTION) * inflation_factor

        # Inverter replacement at Year 11 (~12% of initial installation cost)
        inverter_cost = (total_installation_cost * INVERTER_REPLACEMENT_COST_FRACTION) if year == INVERTER_REPLACEMENT_YEAR else 0.0

        net_cashflow = year_savings - om_cost - inverter_cost
        prev_cumulative_net = cumulative_net

        cumulative_savings += year_savings
        cumulative_net += net_cashflow

        # Exact linear interpolation for the break-even crossing point
        if prev_cumulative_net < 0 and cumulative_net >= 0 and realistic_payback_years is None:
            needed = -prev_cumulative_net
            gained = cumulative_net - prev_cumulative_net
            fraction = (needed / gained) if gained > 0 else 0.0
            realistic_payback_years = round((year - 1) + fraction, 2)

        cashflow_schedule.append({
            "year": year,
            "annual_yield_kwh": round(year_yield, 1),
            "effective_rate_tl": round(year_rate, 2),
            "annual_savings": round(year_savings, 2),
            "om_cost": round(om_cost, 2),
            "inverter_cost": round(inverter_cost, 2),
            "net_cashflow": round(net_cashflow, 2),
            "cumulative_savings": round(cumulative_savings, 2),
            "cumulative_net": round(cumulative_net, 2),
            "is_inverter_replacement": year == INVERTER_REPLACEMENT_YEAR,
        })

    payback_period_years = realistic_payback_years if realistic_payback_years is not None else (
        round(simple_payback_years, 2) if simple_payback_years is not None else None
    )

    result = {
        "total_installation_cost": round(total_installation_cost, 2),
        "annual_savings": round(annual_savings_year1, 2),
        "monthly_savings": round(annual_savings_year1 / 12.0, 2),
        "payback_period_years": payback_period_years,
        "simple_payback_years": round(simple_payback_years, 2) if simple_payback_years is not None else None,
        "lifetime_savings_25yr": round(cumulative_savings, 2),
        "net_profit_25yr": round(cumulative_net, 2),
        "roi_percent_25yr": round(cumulative_net / total_installation_cost * 100.0, 1) if total_installation_cost > 0 else None,
        "cashflow_schedule": cashflow_schedule,
        "financial_model": {
            "type": "realistic_lifecycle",
            "degradation_rate_percent": round(ANNUAL_PANEL_DEGRADATION_RATE * 100, 2),
            "tariff_escalation_rate_percent": round(ANNUAL_TARIFF_ESCALATION_RATE * 100, 2),
            "inverter_replacement_year": INVERTER_REPLACEMENT_YEAR,
            "inverter_replacement_cost": round(total_installation_cost * INVERTER_REPLACEMENT_COST_FRACTION, 2),
            "annual_om_rate_percent": round(ANNUAL_OM_COST_FRACTION * 100, 2),
        },
    }

    # 6. Bill offset metrics (only when the user supplied their monthly bill)
    if monthly_bill is not None and monthly_bill > 0 and electricity_rate > 0:
        annual_bill = monthly_bill * 12.0
        annual_consumption_kwh = annual_bill / electricity_rate
        bill_offset_percent = annual_yield_kwh / annual_consumption_kwh * 100.0
        net_monthly_bill = max(0.0, monthly_bill - annual_savings_year1 / 12.0)
        surplus_kwh = max(0.0, annual_yield_kwh - annual_consumption_kwh)

        result["bill_offset"] = {
            "monthly_bill": round(monthly_bill, 2),
            "annual_bill": round(annual_bill, 2),
            "estimated_annual_consumption_kwh": round(annual_consumption_kwh, 1),
            "bill_offset_percent": round(bill_offset_percent, 1),
            "net_monthly_bill_after_solar": round(net_monthly_bill, 2),
            "annual_surplus_kwh": round(surplus_kwh, 1),
        }

    return result


# ==========================================
# 3. Environmental Impact Engine
# ==========================================
def calculate_environmental_impact(annual_yield_kwh, lifetime_years=PROJECT_LIFETIME_YEARS,
                                   emission_factor_kg_per_kwh=GRID_EMISSION_FACTOR_KG_PER_KWH):
    """
    Estimates avoided CO2 emissions and the equivalent number of trees.
    """
    annual_co2_kg = annual_yield_kwh * emission_factor_kg_per_kwh
    return {
        "annual_co2_offset_tonnes": round(annual_co2_kg / 1000.0, 2),
        "lifetime_co2_offset_tonnes": round(annual_co2_kg * lifetime_years / 1000.0, 1),
        "equivalent_trees_planted": int(round(annual_co2_kg / CO2_ABSORBED_PER_TREE_KG_PER_YEAR)),
        "emission_factor_kg_per_kwh": emission_factor_kg_per_kwh,
    }


# ==========================================
# Example Usage
# ==========================================
if __name__ == "__main__":
    # Test Data: Beylikduzu, Istanbul
    LAT = 41.0026
    LON = 28.6417
    
    # Assuming the U-Net model output gave us 40 square meters of usable roof space
    # and standard panels generate about 0.20 kWp per square meter.
    usable_area_m2 = 40.0
    panel_density_kwp_per_m2 = 0.20
    peakpower = usable_area_m2 * panel_density_kwp_per_m2
    
    print(f"Simulating for {usable_area_m2} m2 of usable roof ({peakpower} kWp)...")
    
    # 1. Run Physics Engine (PVGIS with automatic fallback)
    pvgis_result = get_solar_yield(LAT, LON, peakpower)
    
    if pvgis_result["success"]:
        yield_kwh = pvgis_result["annual_yield_kwh"]
        print(f"Estimated Annual Yield ({pvgis_result['source']}): {yield_kwh} kWh")
        
        # 2. Run Financial Engine (Assuming $0.12/kWh electricity rate and a $120/month bill)
        financials = calculate_roi(yield_kwh, peakpower, electricity_rate=0.12, monthly_bill=120.0)
        impact = calculate_environmental_impact(yield_kwh)
        
        print("\n--- Financial ROI Report ---")
        print(f"Total System Cost:      ${financials['total_installation_cost']}")
        print(f"Annual Energy Savings:  ${financials['annual_savings']}")
        print(f"Payback Period:         {financials['payback_period_years']} years")
        print(f"25-Year Net Profit:     ${financials['net_profit_25yr']}")
        print(f"Bill Offset:            {financials['bill_offset']['bill_offset_percent']}%")
        print(f"CO2 Avoided / year:     {impact['annual_co2_offset_tonnes']} t ({impact['equivalent_trees_planted']} trees)")
    else:
        print("Failed to get PVGIS data.")
