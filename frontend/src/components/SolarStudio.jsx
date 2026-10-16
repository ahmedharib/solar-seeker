import React, { useState, useMemo } from 'react';
import {
  Sliders,
  BatteryCharging,
  Sun,
  DollarSign,
  TrendingUp,
  Zap,
  ShieldCheck,
  RotateCcw,
  RefreshCw,
  Layers,
  ArrowUpRight,
  Info,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

export default function SolarStudio({ scanResults, onNavigateToVision }) {
  // State: System Sizing
  const [pvCapacityKwp, setPvCapacityKwp] = useState(
    scanResults?.peakpower_kwp ? Math.round(scanResults.peakpower_kwp * 10) / 10 : 10.0
  );
  const [panelTech, setPanelTech] = useState('topcon'); // topcon, bifacial, mono
  const [inverterSizeKw, setInverterSizeKw] = useState(8.0);

  // State: Battery Storage (BESS)
  const [batteryEnabled, setBatteryEnabled] = useState(true);
  const [batteryKwh, setBatteryKwh] = useState(10.0);
  const [batteryChemistry, setBatteryChemistry] = useState('lfp'); // lfp (Lithium Iron Phosphate)

  // State: Grid & Tariffs
  const [tariffModel, setTariffModel] = useState('tou'); // tou (Time-of-Use), flat
  const [peakRate, setPeakRate] = useState(0.32); // $/kWh
  const [offPeakRate, setOffPeakRate] = useState(0.09); // $/kWh
  const [shoulderRate, setShoulderRate] = useState(0.18); // $/kWh
  const [feedInTariff, setFeedInTariff] = useState(0.06); // export credit $/kWh
  const [dailyLoadKwh, setDailyLoadKwh] = useState(24.0); // kWh/day
  const [loadProfileType, setLoadProfileType] = useState('evening'); // evening, daytime, ev

  // State: Financing
  const [financingMode, setFinancingMode] = useState('cash'); // cash, loan
  const [loanApr, setLoanApr] = useState(5.5);
  const [loanTermYears, setLoanTermYears] = useState(10);

  // Sync with scanner if available
  const handleSyncWithScan = () => {
    if (scanResults?.peakpower_kwp) {
      setPvCapacityKwp(Math.round(scanResults.peakpower_kwp * 10) / 10);
      setInverterSizeKw(Math.round(scanResults.peakpower_kwp * 0.8 * 10) / 10);
    }
  };

  // Preset Configurations
  const applyPreset = (presetName) => {
    if (presetName === 'residential') {
      setPvCapacityKwp(8.0);
      setBatteryEnabled(true);
      setBatteryKwh(10.0);
      setDailyLoadKwh(22.0);
      setInverterSizeKw(7.0);
    } else if (presetName === 'powerwall') {
      setPvCapacityKwp(12.0);
      setBatteryEnabled(true);
      setBatteryKwh(15.0);
      setDailyLoadKwh(30.0);
      setInverterSizeKw(10.0);
    } else if (presetName === 'solar-only') {
      setPvCapacityKwp(10.0);
      setBatteryEnabled(false);
      setBatteryKwh(0);
      setDailyLoadKwh(24.0);
      setInverterSizeKw(8.0);
    } else if (presetName === 'commercial') {
      setPvCapacityKwp(25.0);
      setBatteryEnabled(true);
      setBatteryKwh(30.0);
      setDailyLoadKwh(75.0);
      setInverterSizeKw(20.0);
    }
  };

  // Simulation Calculations
  const simulation = useMemo(() => {
    // 24-hour simulation profiles
    const hourlyData = [];
    const effBattery = batteryEnabled ? batteryKwh : 0;

    // Load distribution weights based on profile type (24 hrs)
    const loadWeights = {
      evening: [
        0.02, 0.02, 0.02, 0.02, 0.02, 0.03, // 0-5 AM
        0.05, 0.06, 0.04, 0.03, 0.03, 0.03, // 6-11 AM
        0.03, 0.03, 0.03, 0.04, 0.05, 0.08, // 12-17 PM
        0.11, 0.12, 0.09, 0.06, 0.04, 0.02, // 18-23 PM
      ],
      daytime: [
        0.02, 0.02, 0.02, 0.02, 0.02, 0.03,
        0.04, 0.06, 0.08, 0.09, 0.09, 0.09,
        0.09, 0.08, 0.07, 0.06, 0.05, 0.05,
        0.04, 0.03, 0.03, 0.02, 0.02, 0.02,
      ],
      ev: [
        0.09, 0.09, 0.08, 0.04, 0.02, 0.02,
        0.04, 0.05, 0.03, 0.03, 0.03, 0.03,
        0.03, 0.03, 0.03, 0.04, 0.05, 0.07,
        0.09, 0.08, 0.05, 0.03, 0.02, 0.01,
      ],
    }[loadProfileType] || loadWeights.evening;

    // Solar generation bell curve normalized for 1 kWp (daily ~4.5 kWh/kWp average)
    const solarBellWeights = [
      0, 0, 0, 0, 0, 0.01, 0.04, 0.08, 0.12, 0.15, 0.16, 0.16, 0.13, 0.09, 0.04, 0.02, 0, 0, 0, 0, 0, 0, 0, 0,
    ];

    let currentSocKwh = effBattery * 0.4; // start day with 40% state of charge
    let totalSolarGenKwh = 0;
    let totalDirectSolarUsed = 0;
    let totalBatteryDischarge = 0;
    let totalGridExport = 0;
    let totalGridImport = 0;

    for (let h = 0; h < 24; h++) {
      const solarKwh = Math.round(pvCapacityKwp * 4.4 * solarBellWeights[h] * 10) / 10;
      const loadKwh = Math.round(dailyLoadKwh * loadWeights[h] * 10) / 10;
      totalSolarGenKwh += solarKwh;

      let batteryFlow = 0; // positive = charging, negative = discharging
      let gridExport = 0;
      let gridImport = 0;
      let directUsed = 0;

      if (solarKwh >= loadKwh) {
        directUsed = loadKwh;
        const surplus = solarKwh - loadKwh;
        // Charge battery if available
        if (batteryEnabled && currentSocKwh < effBattery) {
          const room = effBattery - currentSocKwh;
          const chargeAmount = Math.min(surplus, room, 3.5); // max 3.5 kW charge rate
          currentSocKwh += chargeAmount * 0.92; // 92% round trip
          batteryFlow = chargeAmount;
          gridExport = surplus - chargeAmount;
        } else {
          gridExport = surplus;
        }
      } else {
        directUsed = solarKwh;
        const deficit = loadKwh - solarKwh;
        // Discharge battery
        if (batteryEnabled && currentSocKwh > effBattery * 0.1) {
          const available = currentSocKwh - effBattery * 0.1;
          const dischargeAmount = Math.min(deficit, available, 4.0); // max 4 kW discharge
          currentSocKwh -= dischargeAmount;
          batteryFlow = -dischargeAmount;
          gridImport = deficit - dischargeAmount;
          totalBatteryDischarge += dischargeAmount;
        } else {
          gridImport = deficit;
        }
      }

      totalDirectSolarUsed += directUsed;
      totalGridExport += gridExport;
      totalGridImport += gridImport;

      // Determine tariff rate for this hour
      let hourlyRate = shoulderRate;
      if (h >= 17 && h <= 21) {
        hourlyRate = peakRate;
      } else if (h >= 23 || h <= 6) {
        hourlyRate = offPeakRate;
      }

      hourlyData.push({
        hour: `${h.toString().padStart(2, '0')}:00`,
        solar: solarKwh,
        load: loadKwh,
        batteryFlow: Math.round(batteryFlow * 10) / 10,
        batterySoc: effBattery > 0 ? Math.round((currentSocKwh / effBattery) * 100) : 0,
        gridImport: Math.round(gridImport * 10) / 10,
        gridExport: Math.round(gridExport * 10) / 10,
        hourlyRate,
      });
    }

    // Annualized Metrics
    const annualSolarGenKwh = Math.round(pvCapacityKwp * 1380);
    const annualDemandKwh = Math.round(dailyLoadKwh * 365);
    const dailySelfConsumed = totalDirectSolarUsed + totalBatteryDischarge;
    const selfConsumptionRate = Math.min(
      95,
      Math.round((dailySelfConsumed / (totalSolarGenKwh || 1)) * 100)
    );
    const selfSufficiencyIndex = Math.min(
      98,
      Math.round((dailySelfConsumed / (dailyLoadKwh || 1)) * 100)
    );

    // Turnkey System CapEx ($)
    const pvCostPerKwp = panelTech === 'topcon' ? 1050 : panelTech === 'bifacial' ? 1150 : 950;
    const batteryCostPerKwh = 550; // LFP turnkey cost
    const inverterCost = inverterSizeKw * 220;
    const installationBalance = 1500;

    const totalSystemCapex = Math.round(
      pvCapacityKwp * pvCostPerKwp + (batteryEnabled ? batteryKwh * batteryCostPerKwh : 0) + inverterCost + installationBalance
    );

    // Financial Cashflows
    // Baseline annual grid utility bill without solar:
    const avgGridRate = tariffModel === 'tou' ? 0.20 : peakRate;
    const baselineAnnualBill = Math.round(annualDemandKwh * avgGridRate);

    // Bill with Solar + Storage:
    const annualGridImportKwh = Math.round(totalGridImport * 365);
    const annualGridExportKwh = Math.round(totalGridExport * 365);
    const newAnnualGridExpense = Math.round(annualGridImportKwh * (avgGridRate * 0.95));
    const annualExportRevenue = Math.round(annualGridExportKwh * feedInTariff);
    const newNetAnnualBill = Math.max(0, newAnnualGridExpense - annualExportRevenue);

    const annualNetSavings = baselineAnnualBill - newNetAnnualBill;
    const paybackYears = Math.round((totalSystemCapex / (annualNetSavings || 1)) * 10) / 10;
    const netProfit25Yr = Math.round(annualNetSavings * 25 - totalSystemCapex);

    // LCOE calculation: (Total Capex + 25-yr O&M) / 25-yr Lifetime Generation
    const lifetimeGenKwh = annualSolarGenKwh * 25 * 0.92; // 8% degradation factor
    const lcoePerKwh = Math.round((totalSystemCapex * 1.15 / (lifetimeGenKwh || 1)) * 100) / 100;

    return {
      hourlyData,
      annualSolarGenKwh,
      annualDemandKwh,
      selfConsumptionRate,
      selfSufficiencyIndex,
      totalSystemCapex,
      baselineAnnualBill,
      newNetAnnualBill,
      annualNetSavings,
      paybackYears,
      netProfit25Yr,
      lcoePerKwh,
      avgGridRate,
    };
  }, [
    pvCapacityKwp,
    panelTech,
    inverterSizeKw,
    batteryEnabled,
    batteryKwh,
    tariffModel,
    peakRate,
    offPeakRate,
    shoulderRate,
    feedInTariff,
    dailyLoadKwh,
    loadProfileType,
  ]);

  return (
    <div className="space-y-8">
      {/* Top Header & Presets */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 p-6 sm:p-7 rounded-2xl bg-zinc-900/40 border border-zinc-800">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Interactive Hardware & Tariff Studio
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Solar PV & Battery Energy Storage (BESS) Configurator
          </h2>
          <p className="text-xs text-zinc-400">
            Simulate 24-hour battery dispatch curves, peak-demand clipping, and financial return under variable utility tariffs.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {scanResults?.peakpower_kwp && (
            <button
              type="button"
              onClick={handleSyncWithScan}
              className="text-xs px-3.5 py-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 font-medium transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Import from Vision Scan ({scanResults.peakpower_kwp} kWp)</span>
            </button>
          )}

          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-full border border-zinc-800">
            <button
              type="button"
              onClick={() => applyPreset('residential')}
              className="text-xs px-3 py-1 rounded-full text-zinc-300 hover:text-white transition-colors"
            >
              Home (8 kWp + 10 kWh)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('powerwall')}
              className="text-xs px-3 py-1 rounded-full text-zinc-300 hover:text-white transition-colors"
            >
              Powerwall (12 kWp + 15 kWh)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('solar-only')}
              className="text-xs px-3 py-1 rounded-full text-zinc-300 hover:text-white transition-colors"
            >
              PV Only
            </button>
          </div>
        </div>
      </div>

      {/* KPI Highlights Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Self-Consumption */}
        <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Solar Self-Consumption</span>
            <BatteryCharging className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-white tracking-tight">
            {simulation.selfConsumptionRate}%
          </div>
          <p className="text-[11px] text-zinc-500">
            Grid independence: <strong className="text-emerald-400">{simulation.selfSufficiencyIndex}% autarky</strong>
          </p>
        </div>

        {/* KPI 2: Annual Savings */}
        <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Annual Utility Savings</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 tracking-tight">
            ${simulation.annualNetSavings.toLocaleString()} <span className="text-xs font-normal text-zinc-500">/ yr</span>
          </div>
          <p className="text-[11px] text-zinc-500">
            Cuts bill from ${simulation.baselineAnnualBill}/yr to ${simulation.newNetAnnualBill}/yr
          </p>
        </div>

        {/* KPI 3: LCOE vs Grid */}
        <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Solar LCOE</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-amber-400 tracking-tight">
            ${simulation.lcoePerKwh} <span className="text-xs font-normal text-zinc-500">/ kWh</span>
          </div>
          <p className="text-[11px] text-zinc-500">
            Grid electricity: <strong className="text-zinc-300">${simulation.avgGridRate.toFixed(2)}/kWh</strong>
          </p>
        </div>

        {/* KPI 4: Payback & Capex */}
        <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Est. Payback & CapEx</span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-extrabold text-cyan-400 tracking-tight">
            {simulation.paybackYears} <span className="text-base font-normal text-zinc-500">Years</span>
          </div>
          <p className="text-[11px] text-zinc-500">
            Turnkey CapEx: <strong className="text-zinc-200">${simulation.totalSystemCapex.toLocaleString()}</strong>
          </p>
        </div>
      </div>

      {/* Main Studio Body: Controls on Left, Dynamic Charts on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Studio Hardware Controls */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 1: Solar Array Sizing */}
          <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sun className="w-4 h-4 text-amber-400" />
                Solar PV Array Parameters
              </h3>
              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                {pvCapacityKwp} kWp
              </span>
            </div>

            <div>
              <div className="flex justify-between text-xs text-zinc-400 mb-1">
                <span>Array Capacity</span>
                <span className="font-mono text-zinc-200">{pvCapacityKwp} kWp (~{Math.round(pvCapacityKwp * 2.5)} Panels)</span>
              </div>
              <input
                type="range"
                min="2.0"
                max="40.0"
                step="0.5"
                value={pvCapacityKwp}
                onChange={(e) => setPvCapacityKwp(parseFloat(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Panel Technology</label>
                <select
                  value={panelTech}
                  onChange={(e) => setPanelTech(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                >
                  <option value="topcon">N-Type TOPCon (22.5%)</option>
                  <option value="bifacial">Glass-Glass Bifacial (21.8%)</option>
                  <option value="mono">Standard Mono (20.5%)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Inverter Sizing (kWac)</label>
                <input
                  type="number"
                  step="0.5"
                  value={inverterSizeKw}
                  onChange={(e) => setInverterSizeKw(parseFloat(e.target.value) || 6)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Battery Storage (BESS) */}
          <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <BatteryCharging className="w-4 h-4 text-emerald-400" />
                Battery Energy Storage (BESS)
              </h3>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={batteryEnabled}
                  onChange={(e) => setBatteryEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            {batteryEnabled ? (
              <div className="space-y-3 pt-1">
                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>Usable Capacity</span>
                    <span className="font-mono text-emerald-400 font-bold">{batteryKwh} kWh</span>
                  </div>
                  <input
                    type="range"
                    min="3.0"
                    max="45.0"
                    step="1.0"
                    value={batteryKwh}
                    onChange={(e) => setBatteryKwh(parseFloat(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div className="flex gap-2">
                  {[5, 10, 15, 20].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setBatteryKwh(size)}
                      className={`text-[11px] py-1 px-3 rounded-full border transition-colors ${
                        batteryKwh === size
                          ? 'bg-emerald-500 text-zinc-950 font-bold border-emerald-500'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {size} kWh
                    </button>
                  ))}
                </div>

                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
                  <div className="flex justify-between">
                    <span>Chemistry:</span>
                    <strong className="text-zinc-200">Lithium Iron Phosphate (LFP)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Cycle Life:</span>
                    <strong className="text-zinc-200">6,000 Cycles @ 90% DoD</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-zinc-950 text-xs text-zinc-500 text-center">
                Battery disabled. Surplus solar will be exported directly to the grid at ${feedInTariff}/kWh.
              </div>
            )}
          </div>

          {/* Card 3: Tariff & Load Profile */}
          <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-400" />
                Consumption & Utility Tariffs
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Daily Usage (kWh/day)</label>
                <input
                  type="number"
                  step="1"
                  value={dailyLoadKwh}
                  onChange={(e) => setDailyLoadKwh(parseFloat(e.target.value) || 15)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Load Profile</label>
                <select
                  value={loadProfileType}
                  onChange={(e) => setLoadProfileType(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                >
                  <option value="evening">Evening Heavy (5PM - 10PM)</option>
                  <option value="daytime">Daytime Heavy (Work Home)</option>
                  <option value="ev">EV Charging Overnight</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-xs font-mono">
              <div>
                <span className="text-[10px] text-zinc-500 block">Peak Rate</span>
                <input
                  type="number"
                  step="0.01"
                  value={peakRate}
                  onChange={(e) => setPeakRate(parseFloat(e.target.value) || 0.2)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-rose-400"
                />
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 block">Shoulder</span>
                <input
                  type="number"
                  step="0.01"
                  value={shoulderRate}
                  onChange={(e) => setShoulderRate(parseFloat(e.target.value) || 0.15)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-amber-400"
                />
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 block">Off-Peak</span>
                <input
                  type="number"
                  step="0.01"
                  value={offPeakRate}
                  onChange={(e) => setOffPeakRate(parseFloat(e.target.value) || 0.08)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-emerald-400"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: 24-Hour Simulation & Comparative Analytics */}
        <div className="lg:col-span-7 space-y-6">
          {/* Chart 1: 24-Hour Dispatch Simulation */}
          <div className="p-7 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  24-Hour Energy Dispatch Simulation
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Solar production curve vs household load profile vs battery state of charge (SOC).
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="flex items-center gap-1.5 text-amber-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span> Solar
                </span>
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span> Load
                </span>
                {batteryEnabled && (
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Battery SOC %
                  </span>
                )}
              </div>
            </div>

            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={simulation.hourlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="hour" stroke="#71717a" fontSize={10} tickLine={false} />
                  <YAxis yAxisId="power" stroke="#71717a" fontSize={10} tickLine={false} unit=" kW" />
                  <YAxis yAxisId="soc" orientation="right" stroke="#10b981" fontSize={10} tickLine={false} unit="%" domain={[0, 100]} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-xl text-xs space-y-1 shadow-lg font-mono">
                            <p className="font-semibold text-white">{d.hour}</p>
                            <p className="text-amber-400">Solar Gen: {d.solar} kW</p>
                            <p className="text-cyan-400">Load: {d.load} kW</p>
                            {batteryEnabled && <p className="text-emerald-400">Battery SOC: {d.batterySoc}%</p>}
                            <p className="text-zinc-400">Grid Import: {d.gridImport} kW</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area yAxisId="power" type="monotone" dataKey="solar" fill="#f59e0b" fillOpacity={0.25} stroke="#f59e0b" strokeWidth={2} />
                  <Line yAxisId="power" type="monotone" dataKey="load" stroke="#38bdf8" strokeWidth={2} dot={false} />
                  {batteryEnabled && (
                    <Line yAxisId="soc" type="monotone" dataKey="batterySoc" stroke="#10b981" strokeWidth={2} strokeDasharray="3 3" dot={false} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Tariff Arbitrage Note:</strong> Notice how midday solar surplus charges the battery to 100% capacity. When peak utility rates kick in at 5 PM, the battery discharges to completely eliminate expensive grid draw!
              </span>
            </div>
          </div>

          {/* Bill of Materials (BOM) & Technical Summary */}
          <div className="p-7 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-zinc-300" />
              Equipment Bill of Materials (BOM) & Turnkey Estimate
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 uppercase text-[10px] tracking-wider">
                    <th className="pb-2">Component</th>
                    <th className="pb-2">Specification</th>
                    <th className="pb-2">Quantity</th>
                    <th className="pb-2 text-right">Est. Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono text-zinc-300">
                  <tr>
                    <td className="py-2.5 text-white font-sans font-medium">PV Modules</td>
                    <td className="py-2.5 text-zinc-400">{panelTech === 'topcon' ? '410W TOPCon Monocrystalline' : '400W Bifacial Glass-Glass'}</td>
                    <td className="py-2.5">~{Math.round(pvCapacityKwp * 2.5)} units</td>
                    <td className="py-2.5 text-right font-bold">${Math.round(pvCapacityKwp * 850).toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 text-white font-sans font-medium">Hybrid Inverter</td>
                    <td className="py-2.5 text-zinc-400">{inverterSizeKw} kW Pure Sine Hybrid Inverter</td>
                    <td className="py-2.5">1 unit</td>
                    <td className="py-2.5 text-right font-bold">${Math.round(inverterSizeKw * 220).toLocaleString()}</td>
                  </tr>
                  {batteryEnabled && (
                    <tr>
                      <td className="py-2.5 text-white font-sans font-medium">Battery Storage</td>
                      <td className="py-2.5 text-zinc-400">{batteryKwh} kWh LiFePO4 Module + BMS</td>
                      <td className="py-2.5">1 pack</td>
                      <td className="py-2.5 text-right font-bold text-emerald-400">${Math.round(batteryKwh * 550).toLocaleString()}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="py-2.5 text-white font-sans font-medium">Rooftop Racking & Balance</td>
                    <td className="py-2.5 text-zinc-400">Anodized Aluminum + Rapid Shutdown + Permits</td>
                    <td className="py-2.5">Turnkey</td>
                    <td className="py-2.5 text-right font-bold">$1,500</td>
                  </tr>
                  <tr className="border-t-2 border-zinc-700 font-bold text-white">
                    <td colSpan={3} className="pt-3 font-sans">Total Turnkey Investment (Pre-Incentive)</td>
                    <td className="pt-3 text-right text-emerald-400 text-sm">${simulation.totalSystemCapex.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
