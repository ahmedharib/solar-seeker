import React, { useMemo } from 'react';
import {
  Sun,
  Zap,
  DollarSign,
  TrendingUp,
  Leaf,
  Calendar,
  RotateCcw,
  Printer,
  Compass,
  ArrowLeft,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { THEME_COLORS } from '../constants/theme';
import { DEFAULT_PHYSICS, DEFAULT_FINANCIALS, CURRENCY } from '../constants/config';

export default function Step3Results({ results, onBackToSelector, onReset }) {
  const cashflow = results?.financials?.cashflow_schedule || [];

  // Calculate split color offset: Green above 0 (profit), Red below 0 (loss)
  const gradientOffset = useMemo(() => {
    if (!cashflow || cashflow.length === 0) return 0;
    const dataMax = Math.max(...cashflow.map((i) => i.cumulative_net ?? 0));
    const dataMin = Math.min(...cashflow.map((i) => i.cumulative_net ?? 0));

    if (dataMax <= 0) return 0; // All loss
    if (dataMin >= 0) return 1; // All profit

    return dataMax / (dataMax - dataMin);
  }, [cashflow]);

  if (!results) return null;

  const {
    location,
    gross_area_m2,
    net_usable_area_m2,
    peakpower_kwp,
    annual_yield_kwh,
    specific_yield_kwh_per_kwp,
    yield_source,
    optimal_tilt_deg,
    monthly_chart,
    financials,
    environmental,
    assumptions,
  } = results;

  const billOffset = financials?.bill_offset;

  return (
    <div className="space-y-8 print:p-0">
      {/* Top Banner / Assessment Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 p-6 sm:p-7 rounded-2xl bg-zinc-900/40 border border-zinc-800">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2.5">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400 leading-none">
              Solar Assessment Report
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono leading-none">
              Source: {yield_source === 'pvgis' ? 'Official EU PVGIS 5.3' : 'Physical Insolation Model'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-none mt-1">
            25-Year Feasibility & Generation Overview
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Calibrated for coordinates ({location?.lat?.toFixed(4)}°N, {location?.lon?.toFixed(4)}°E) at {optimal_tilt_deg || DEFAULT_PHYSICS.defaultTiltDeg}° optimal pitch.
          </p>
        </div>

        <div className="flex items-center gap-2.5 print:hidden flex-wrap">
          <button
            type="button"
            onClick={() => window.print()}
            className="text-xs px-4 py-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 inline-flex items-center gap-1.5 font-medium transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-zinc-400 shrink-0 -translate-y-px" />
            <span className="leading-none">Print Report</span>
          </button>
          <button
            type="button"
            onClick={onReset}
            className="text-xs px-4 py-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 inline-flex items-center gap-1.5 font-medium transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0 -translate-y-px" />
            <span className="leading-none">New Scan</span>
          </button>
        </div>
      </div>

      {/* Top Metric KPI Cards - Clean White Tabular Figures with Semantic Accents */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* KPI 1: Usable Area */}
        <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="leading-none">Usable Solar Area</span>
            <span className="text-amber-400 font-mono text-xs font-semibold leading-none">
              {(assumptions?.packing_factor ? Math.round(assumptions.packing_factor * 100) : Math.round(DEFAULT_PHYSICS.packingFactor * 100))}% Factor
            </span>
          </div>
          <div className="text-3xl font-bold text-white tracking-tight">
            {net_usable_area_m2} <span className="text-base font-normal text-zinc-400">m²</span>
          </div>
          <p className="text-xs text-zinc-500 leading-none mt-1">
            Gross Footprint: <strong className="text-zinc-300 font-mono">{gross_area_m2} m²</strong>
          </p>
        </div>

        {/* KPI 2: Peak Power */}
        <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="leading-none">Peak Capacity</span>
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
          </div>
          <div className="text-3xl font-bold text-white tracking-tight">
            {peakpower_kwp} <span className="text-base font-semibold text-amber-400">kWp</span>
          </div>
          <p className="text-xs text-zinc-500 leading-none mt-1">
            ~{Math.round(net_usable_area_m2 / (assumptions?.sqm_per_panel || DEFAULT_PHYSICS.sqmPerPanel))} Monocrystalline Panels
          </p>
        </div>

        {/* KPI 3: Annual Energy */}
        <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="leading-none">Annual Solar Yield</span>
            <Sun className="w-4 h-4 text-amber-400 shrink-0" />
          </div>
          <div className="text-3xl font-bold text-white tracking-tight">
            {annual_yield_kwh?.toLocaleString()} <span className="text-base font-semibold text-amber-400">kWh</span>
          </div>
          <p className="text-xs text-zinc-500 leading-none mt-1">
            Specific: <strong className="text-zinc-300 font-mono">{specific_yield_kwh_per_kwp} kWh/kWp</strong>
          </p>
        </div>

        {/* KPI 4: Payback Period */}
        <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="leading-none">Payback Period</span>
            <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>
          <div className="text-3xl font-bold text-white tracking-tight">
            {financials?.payback_period_years ? `${financials.payback_period_years} Yrs` : 'N/A'}
          </div>
          <p className="text-xs text-zinc-500 leading-none mt-1">
            25-Yr Net Profit: <strong className="text-emerald-400 font-mono">{CURRENCY.symbol}{financials?.net_profit_25yr?.toLocaleString()}</strong>
          </p>
        </div>
      </div>

      {/* Bill Offset Banner */}
      {billOffset && (
        <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-400 font-semibold shrink-0">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="text-xs text-zinc-400 font-semibold uppercase tracking-wider leading-none">
                Electric Bill Coverage
              </div>
              <p className="text-sm text-zinc-200 mt-1.5">
                This solar array produces enough electricity to cover{' '}
                <strong className="text-emerald-400 font-semibold">{billOffset.bill_offset_percent}%</strong> of your monthly usage.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-8 text-xs text-right font-mono">
            <div>
              <div className="text-zinc-500 text-xs leading-none">Original Bill</div>
              <div className="text-white font-bold text-sm mt-1">{CURRENCY.symbol}{billOffset.monthly_bill?.toLocaleString()}/mo</div>
            </div>
            <div>
              <div className="text-zinc-500 text-xs leading-none">Net Bill After Solar</div>
              <div className="text-emerald-400 font-bold text-sm mt-1">{CURRENCY.symbol}{billOffset.net_monthly_bill_after_solar?.toLocaleString()}/mo</div>
            </div>
          </div>
        </div>
      )}

      {/* Dual Charts Grid: Symmetrical Equal Heights */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Monthly Solar Generation Bar Chart */}
        <div className="lg:col-span-7 p-6 sm:p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400 shrink-0 -translate-y-px" />
                <span className="leading-none">Monthly Solar Energy Yield (kWh)</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-1.5">PVGIS satellite-calibrated monthly irradiance schedule.</p>
            </div>
            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 leading-none">
              kWh / Month
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly_chart} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={THEME_COLORS.charts.gridLines} />
                <XAxis dataKey="label" stroke={THEME_COLORS.charts.axisText} fontSize={11} tickLine={false} />
                <YAxis stroke={THEME_COLORS.charts.axisText} fontSize={11} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const valTl = Math.round(data.energy_kwh * (assumptions?.electricity_rate || DEFAULT_FINANCIALS.electricityRate));
                      return (
                        <div
                          className="border p-3 rounded-xl text-xs space-y-1 shadow-lg font-mono"
                          style={{
                            backgroundColor: THEME_COLORS.charts.tooltipBg,
                            borderColor: THEME_COLORS.charts.tooltipBorder,
                          }}
                        >
                          <p className="font-semibold text-white leading-none">{data.label}</p>
                          <p className="text-white font-bold">{data.energy_kwh} <span className="text-amber-400">kWh</span></p>
                          <p className="text-zinc-400">≈ {CURRENCY.symbol}{valTl.toLocaleString()} value</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="energy_kwh" fill={THEME_COLORS.charts.monthlyBar} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-500 font-mono pt-2 border-t border-zinc-800/80">
            <span>Optimal Tilt: {optimal_tilt_deg || DEFAULT_PHYSICS.defaultTiltDeg}°</span>
            <span>Annual Total: <strong className="text-zinc-300">{annual_yield_kwh?.toLocaleString()} kWh</strong></span>
          </div>
        </div>

        {/* Right: 25-Year Cumulative Cashflow Chart */}
        <div className="lg:col-span-5 p-6 sm:p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0 -translate-y-px" />
                <span className="leading-none">25-Year Net Cashflow ({CURRENCY.symbol})</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-1.5">Compounding model with degradation & tariff inflation.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 leading-none">
                Profit
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 leading-none">
                Loss
              </span>
            </div>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashflow} margin={{ top: 10, right: 10, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="cashflowSplitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={0} stopColor={THEME_COLORS.charts.cashflowProfit} stopOpacity={0.45} />
                    <stop offset={gradientOffset} stopColor={THEME_COLORS.charts.cashflowProfit} stopOpacity={0.12} />
                    <stop offset={gradientOffset} stopColor={THEME_COLORS.charts.cashflowLoss} stopOpacity={0.12} />
                    <stop offset={1} stopColor={THEME_COLORS.charts.cashflowLoss} stopOpacity={0.45} />
                  </linearGradient>

                  <linearGradient id="cashflowSplitStroke" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={0} stopColor={THEME_COLORS.charts.cashflowProfit} stopOpacity={1} />
                    <stop offset={gradientOffset} stopColor={THEME_COLORS.charts.cashflowProfit} stopOpacity={1} />
                    <stop offset={gradientOffset} stopColor={THEME_COLORS.charts.cashflowLoss} stopOpacity={1} />
                    <stop offset={1} stopColor={THEME_COLORS.charts.cashflowLoss} stopOpacity={1} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke={THEME_COLORS.charts.gridLines} />
                <XAxis dataKey="year" stroke={THEME_COLORS.charts.axisText} fontSize={11} tickLine={false} />
                <YAxis
                  stroke={THEME_COLORS.charts.axisText}
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v) => `${CURRENCY.symbol}${(v / 1000).toFixed(0)}k`}
                />
                <ReferenceLine y={0} stroke={THEME_COLORS.charts.referenceLine} strokeDasharray="3 3" />
                <Tooltip
                  cursor={{ stroke: '#52525b', strokeWidth: 1, strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      const isProfit = (d.cumulative_net || 0) >= 0;
                      return (
                        <div
                          className="border p-3 rounded-xl text-xs space-y-1.5 shadow-lg font-mono min-w-[210px]"
                          style={{
                            backgroundColor: THEME_COLORS.charts.tooltipBg,
                            borderColor: THEME_COLORS.charts.tooltipBorder,
                          }}
                        >
                          <div className="flex items-center justify-between border-b border-zinc-800 pb-1">
                            <span className="font-bold text-white">Year {d.year}</span>
                            {d.is_inverter_replacement ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 leading-none">
                                Inverter Refresh
                              </span>
                            ) : isProfit ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 leading-none">
                                Profitable
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 leading-none">
                                Payoff Phase
                              </span>
                            )}
                          </div>
                          {d.annual_yield_kwh > 0 && (
                            <p className="text-zinc-400 text-xs leading-tight">
                              Annual Yield: <strong className="text-zinc-200">{d.annual_yield_kwh?.toLocaleString()} kWh</strong>
                            </p>
                          )}
                          {d.effective_rate_tl > 0 && (
                            <p className="text-zinc-400 text-xs leading-tight">
                              Est. Tariff: <strong className="text-zinc-200">{CURRENCY.symbol}{d.effective_rate_tl}/kWh</strong>
                            </p>
                          )}
                          <p className="text-zinc-400 text-xs leading-tight">
                            Annual Value: <strong className="text-emerald-400">+{CURRENCY.symbol}{d.annual_savings?.toLocaleString()}</strong>
                          </p>
                          {d.inverter_cost > 0 && (
                            <p className="text-amber-400 text-xs leading-tight font-semibold">
                              Inverter Refresh: -{CURRENCY.symbol}{d.inverter_cost?.toLocaleString()}
                            </p>
                          )}
                          <div className="pt-1 border-t border-zinc-800">
                            <p className={`font-bold leading-tight ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isProfit ? 'Net Profit: +' : 'Net Position: '}
                              {CURRENCY.symbol}{d.cumulative_net?.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative_net"
                  stroke="url(#cashflowSplitStroke)"
                  strokeWidth={2.5}
                  fill="url(#cashflowSplitFill)"
                  baseValue={0}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 font-mono pt-2 border-t border-zinc-800/80">
            <span>Model: 0.5%/yr degradation · 4.0%/yr tariff inflation</span>
            <span>Year 11 Inverter Replacement</span>
          </div>
        </div>
      </div>

      {/* Financial Breakdown & Environmental Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Financial Details */}
        <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-4">
          <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400 shrink-0 -translate-y-px" />
            <span className="leading-none">Financial Breakdown ({CURRENCY.code})</span>
          </h3>
          <div className="space-y-2.5 text-xs divide-y divide-zinc-800/80">
            <div className="flex justify-between pt-1">
              <span className="text-zinc-400">Turnkey Installation (CapEx):</span>
              <span className="font-semibold text-white font-mono">
                {CURRENCY.symbol}{financials?.total_installation_cost?.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-zinc-400">Annual Energy Value:</span>
              <span className="font-semibold text-white font-mono">
                +{CURRENCY.symbol}{financials?.annual_savings?.toLocaleString()} / yr
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-zinc-400">Monthly Utility Savings:</span>
              <span className="font-semibold text-white font-mono">
                +{CURRENCY.symbol}{financials?.monthly_savings?.toLocaleString()} / mo
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-zinc-400 font-medium">25-Year Net Profit:</span>
              <span className="font-bold text-emerald-400 font-mono text-sm">
                +{CURRENCY.symbol}{financials?.net_profit_25yr?.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Environmental Impact */}
        <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-4">
          <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2">
            <Leaf className="w-4 h-4 text-emerald-400 shrink-0 -translate-y-px" />
            <span className="leading-none">Carbon Offset</span>
          </h3>
          <div className="space-y-3 pt-1">
            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-zinc-400 leading-none">Avoided CO₂ / year</div>
                <div className="text-lg font-bold text-white font-mono mt-1">
                  {environmental?.annual_co2_offset_tonnes} tonnes
                </div>
              </div>
              <div className="text-right text-[11px] text-zinc-500 font-mono">
                Lifetime: <strong className="text-zinc-300">{environmental?.lifetime_co2_offset_tonnes} t</strong>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-zinc-400 leading-none">Tree Equivalent</div>
                <div className="text-lg font-bold text-white font-mono mt-1">
                  {environmental?.equivalent_trees_planted} Trees
                </div>
              </div>
              <div className="text-right text-[11px] text-zinc-500">
                Annual carbon sink
              </div>
            </div>
          </div>
        </div>

        {/* Engineering Assumptions */}
        <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-4">
          <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2">
            <Compass className="w-4 h-4 text-cyan-400 shrink-0 -translate-y-px" />
            <span className="leading-none">Engineering Standards</span>
          </h3>
          <div className="space-y-2.5 text-xs divide-y divide-zinc-800/80">
            <div className="flex justify-between pt-1">
              <span className="text-zinc-400">Roof Packing Factor:</span>
              <span className="text-zinc-200 font-mono">
                {Math.round((assumptions?.packing_factor ?? DEFAULT_PHYSICS.packingFactor) * 100)}%
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-zinc-400">PV Panel Density:</span>
              <span className="text-zinc-200 font-mono">
                {assumptions?.panel_density_kwp_per_m2 ?? DEFAULT_PHYSICS.panelDensityKwpPerM2} kWp / m²
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-zinc-400">System Losses:</span>
              <span className="text-zinc-200 font-mono">
                {assumptions?.system_loss_percent ?? DEFAULT_PHYSICS.systemLossPercent}%
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-zinc-400">Optimal Tilt Angle:</span>
              <span className="text-zinc-200 font-mono">
                {optimal_tilt_deg ?? DEFAULT_PHYSICS.defaultTiltDeg}°
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-zinc-400">PV Degradation:</span>
              <span className="text-zinc-200 font-mono">
                {assumptions?.degradation_rate_percent ?? 0.5}% / yr
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-zinc-400">Tariff Escalation:</span>
              <span className="text-zinc-200 font-mono">
                +{assumptions?.tariff_escalation_rate_percent ?? 4.0}% / yr
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 border-t border-zinc-800 print:hidden">
        <button
          type="button"
          onClick={onBackToSelector}
          className="text-xs px-5 py-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-medium inline-flex items-center gap-2 border border-zinc-800 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 shrink-0 -translate-y-px" />
          <span className="leading-none">Back to Roof Verification</span>
        </button>

        <button
          type="button"
          onClick={onReset}
          className="text-xs px-6 py-2.5 rounded-full bg-white hover:bg-zinc-200 text-zinc-950 font-semibold transition-all inline-flex items-center gap-2 shadow-sm"
        >
          <RotateCcw className="w-3.5 h-3.5 shrink-0 -translate-y-px" />
          <span className="leading-none">New Assessment</span>
        </button>
      </div>
    </div>
  );
}
