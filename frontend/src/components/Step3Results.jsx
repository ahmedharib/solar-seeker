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
import { getThemeColors } from '../constants/theme';
import { DEFAULT_PHYSICS, DEFAULT_FINANCIALS, CURRENCY } from '../constants/config';

export default function Step3Results({ results, onBackToSelector, onReset, isDark = false }) {
  const themeColors = getThemeColors(isDark);
  const cashflow = useMemo(() => results?.financials?.cashflow_schedule || [], [results]);

  // Calculate split color offset: Field (#37645C) above 0 (profit), Terracotta below 0 (loss)
  const gradientOffset = useMemo(() => {
    if (!cashflow || cashflow.length === 0) return 0;
    const dataMax = Math.max(...cashflow.map((i) => i.cumulative_net ?? 0));
    const dataMin = Math.min(...cashflow.map((i) => i.cumulative_net ?? 0));

    if (dataMax <= 0) return 0;
    if (dataMin >= 0) return 1;

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
    <div className="space-y-6 print:p-0">
      {/* Top Banner / Assessment Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 p-6 sm:p-7 rounded-2xl ss-card">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2.5 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] leading-none">
              Solar Assessment Report
            </span>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full ss-badge-field font-bold tabular-nums leading-none">
              Source: {yield_source === 'pvgis' ? 'Official EU PVGIS 5.3' : 'Physical Insolation Model'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight leading-none mt-1">
            25-Year Feasibility & Generation Overview
          </h2>
          <p className="text-xs text-[var(--text-secondary)] tabular-nums mt-1">
            Calibrated for coordinates ({location?.lat?.toFixed(4)}°N, {location?.lon?.toFixed(4)}°E) at{' '}
            {optimal_tilt_deg || DEFAULT_PHYSICS.defaultTiltDeg}° optimal pitch.
          </p>
        </div>

        <div className="flex items-center gap-2.5 print:hidden flex-wrap">
          <button
            type="button"
            onClick={() => window.print()}
            className="text-xs px-4 py-2 rounded-full ss-btn-secondary inline-flex items-center gap-1.5 font-semibold cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 -translate-y-px" />
            <span className="leading-none">Print Report</span>
          </button>
          <button
            type="button"
            onClick={onReset}
            className="text-xs px-4 py-2 rounded-full bg-[#F5AD46] hover:bg-[#E59A2E] text-[#182321] inline-flex items-center gap-1.5 font-bold transition-colors cursor-pointer shadow-xs"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0 -translate-y-px" />
            <span className="leading-none">New Scan</span>
          </button>
        </div>
      </div>

      {/* Top Metric KPI Cards — Brand System 05 Tabular Figures Hierarchy */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
        {/* KPI 1: Usable Area */}
        <div className="p-6 rounded-2xl ss-card flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold">
            <span className="leading-none">Usable Solar Area</span>
            <span className="px-2 py-0.5 rounded-full ss-badge-solar text-[10px] font-bold tabular-nums leading-none">
              {assumptions?.packing_factor
                ? Math.round(assumptions.packing_factor * 100)
                : Math.round(DEFAULT_PHYSICS.packingFactor * 100)}
              % Factor
            </span>
          </div>
          <div>
            <div className="text-3xl font-bold text-[var(--text-primary)] tracking-tight tabular-nums leading-none">
              {net_usable_area_m2}
            </div>
            <div className="text-xs text-[var(--text-muted)] font-medium mt-1.5 tabular-nums">
              m² · Gross {gross_area_m2} m²
            </div>
          </div>
        </div>

        {/* KPI 2: Peak Power */}
        <div className="p-6 rounded-2xl ss-card flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold">
            <span className="leading-none">Peak Capacity</span>
            <span className="w-6 h-6 rounded-lg ss-icon-solar inline-flex items-center justify-center shrink-0">
              <Zap className="w-3.5 h-3.5" />
            </span>
          </div>
          <div>
            <div className="text-3xl font-bold text-[var(--text-primary)] tracking-tight tabular-nums leading-none">
              {peakpower_kwp}
            </div>
            <div className="text-xs text-[var(--text-muted)] font-medium mt-1.5 tabular-nums">
              kWp · ~{Math.round(net_usable_area_m2 / (assumptions?.sqm_per_panel || DEFAULT_PHYSICS.sqmPerPanel))} Panels
            </div>
          </div>
        </div>

        {/* KPI 3: Annual Energy (Brand System 05 Showcase Metric: "21,840 / kWh / year") */}
        <div className="p-6 rounded-2xl ss-card flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold">
            <span className="leading-none">Annual Solar Yield</span>
            <span className="w-6 h-6 rounded-lg ss-icon-solar inline-flex items-center justify-center shrink-0">
              <Sun className="w-3.5 h-3.5" />
            </span>
          </div>
          <div>
            <div className="text-3xl font-bold text-[var(--text-primary)] tracking-tight tabular-nums leading-none">
              {annual_yield_kwh?.toLocaleString()}
            </div>
            <div className="text-xs text-[var(--text-muted)] font-medium mt-1.5 tabular-nums">
              kWh / year · {specific_yield_kwh_per_kwp} kWh/kWp
            </div>
          </div>
        </div>

        {/* KPI 4: Payback Period */}
        <div className="p-6 rounded-2xl ss-card flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-semibold">
            <span className="leading-none">Payback Period</span>
            <span className="w-6 h-6 rounded-lg bg-[#37645C] text-[#F6F5EF] inline-flex items-center justify-center shrink-0">
              <TrendingUp className="w-3.5 h-3.5" />
            </span>
          </div>
          <div>
            <div className="text-3xl font-bold text-[var(--text-primary)] tracking-tight tabular-nums leading-none">
              {financials?.payback_period_years ? `${financials.payback_period_years} Yrs` : 'N/A'}
            </div>
            <div className="text-xs text-[#37645C] dark:text-[#84C5B9] font-bold mt-1.5 tabular-nums">
              +{CURRENCY.symbol}{financials?.net_profit_25yr?.toLocaleString()} · 25-Yr Net
            </div>
          </div>
        </div>
      </div>

      {/* Bill Offset Banner */}
      {billOffset && (
        <div className="p-6 rounded-2xl ss-card flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl ss-icon-solar flex items-center justify-center font-bold shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-[var(--text-secondary)] font-bold uppercase tracking-wider leading-none">
                Electric Bill Coverage
              </div>
              <p className="text-sm text-[var(--text-primary)] mt-1.5">
                This solar array produces enough electricity to cover{' '}
                <strong className="px-2 py-0.5 rounded-md ss-badge-field font-bold tabular-nums">
                  {billOffset.bill_offset_percent}%
                </strong>{' '}
                of your monthly usage.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-8 text-xs text-right tabular-nums">
            <div>
              <div className="text-[var(--text-muted)] text-xs font-medium leading-none">Original Bill</div>
              <div className="text-[var(--text-primary)] font-bold text-base mt-1">
                {CURRENCY.symbol}{billOffset.monthly_bill?.toLocaleString()}/mo
              </div>
            </div>
            <div>
              <div className="text-[var(--text-muted)] text-xs font-medium leading-none">Net Bill After Solar</div>
              <div className="text-[#37645C] dark:text-[#84C5B9] font-bold text-base mt-1">
                {CURRENCY.symbol}{billOffset.net_monthly_bill_after_solar?.toLocaleString()}/mo
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dual Charts Grid: Symmetrical Equal Heights */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Monthly Solar Generation Bar Chart */}
        <div className="lg:col-span-7 p-6 sm:p-8 rounded-2xl ss-card flex flex-col justify-between space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] inline-flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg ss-icon-solar inline-flex items-center justify-center shrink-0">
                  <Calendar className="w-3.5 h-3.5" />
                </span>
                <span className="leading-none">Monthly Solar Energy Yield (kWh)</span>
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5">
                PVGIS satellite-calibrated monthly irradiance schedule.
              </p>
            </div>
            <span className="text-xs font-bold tabular-nums px-2.5 py-1 rounded-full ss-well text-[var(--text-secondary)] leading-none">
              kWh / Month
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly_chart} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={themeColors.charts.gridLines} />
                <XAxis dataKey="label" stroke={themeColors.charts.axisText} fontSize={11} tickLine={false} />
                <YAxis stroke={themeColors.charts.axisText} fontSize={11} tickLine={false} />
                <Tooltip
                  cursor={{ fill: isDark ? 'rgba(246, 245, 239, 0.04)' : 'rgba(24, 35, 33, 0.04)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const valTl = Math.round(
                        data.energy_kwh * (assumptions?.electricity_rate || DEFAULT_FINANCIALS.electricityRate)
                      );
                      return (
                        <div
                          className="border p-3 rounded-xl text-xs space-y-1 shadow-lg tabular-nums"
                          style={{
                            backgroundColor: themeColors.charts.tooltipBg,
                            borderColor: themeColors.charts.tooltipBorder,
                            color: themeColors.charts.tooltipText,
                          }}
                        >
                          <p className="font-bold leading-none">{data.label}</p>
                          <p className="font-bold text-sm">
                            {data.energy_kwh} <span className="text-[#F5AD46]">kWh</span>
                          </p>
                          <p className="text-[var(--text-secondary)]">
                            ≈ {CURRENCY.symbol}{valTl.toLocaleString()} value
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="energy_kwh" fill={themeColors.charts.monthlyBar} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] tabular-nums pt-3 border-t border-[var(--border-subtle)]">
            <span>Optimal Tilt: {optimal_tilt_deg || DEFAULT_PHYSICS.defaultTiltDeg}°</span>
            <span>
              Annual Total:{' '}
              <strong className="text-[var(--text-primary)]">{annual_yield_kwh?.toLocaleString()} kWh</strong>
            </span>
          </div>
        </div>

        {/* Right: 25-Year Cumulative Cashflow Chart */}
        <div className="lg:col-span-5 p-6 sm:p-8 rounded-2xl ss-card flex flex-col justify-between space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] inline-flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-[#37645C] text-[#F6F5EF] inline-flex items-center justify-center shrink-0">
                  <TrendingUp className="w-3.5 h-3.5" />
                </span>
                <span className="leading-none">25-Year Net Cashflow ({CURRENCY.symbol})</span>
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5">
                Compounding model with degradation & tariff inflation.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full ss-badge-field leading-none">
                Profit
              </span>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full ss-badge-danger leading-none">
                Payoff
              </span>
            </div>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashflow} margin={{ top: 10, right: 10, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="cashflowSplitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={0} stopColor={themeColors.charts.cashflowProfit} stopOpacity={0.28} />
                    <stop offset={gradientOffset} stopColor={themeColors.charts.cashflowProfit} stopOpacity={0.05} />
                    <stop offset={gradientOffset} stopColor={themeColors.charts.cashflowLoss} stopOpacity={0.05} />
                    <stop offset={1} stopColor={themeColors.charts.cashflowLoss} stopOpacity={0.28} />
                  </linearGradient>

                  <linearGradient id="cashflowSplitStroke" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={0} stopColor={themeColors.charts.cashflowProfit} stopOpacity={1} />
                    <stop offset={gradientOffset} stopColor={themeColors.charts.cashflowProfit} stopOpacity={1} />
                    <stop offset={gradientOffset} stopColor={themeColors.charts.cashflowLoss} stopOpacity={1} />
                    <stop offset={1} stopColor={themeColors.charts.cashflowLoss} stopOpacity={1} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke={themeColors.charts.gridLines} />
                <XAxis dataKey="year" stroke={themeColors.charts.axisText} fontSize={11} tickLine={false} />
                <YAxis
                  stroke={themeColors.charts.axisText}
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v) => `${CURRENCY.symbol}${(v / 1000).toFixed(0)}k`}
                />
                <ReferenceLine y={0} stroke={themeColors.charts.referenceLine} strokeDasharray="3 3" />
                <Tooltip
                  cursor={{ stroke: themeColors.charts.cursorStroke, strokeWidth: 1, strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      const isProfit = (d.cumulative_net || 0) >= 0;
                      return (
                        <div
                          className="border p-3 rounded-xl text-xs space-y-1.5 shadow-lg tabular-nums min-w-[210px]"
                          style={{
                            backgroundColor: themeColors.charts.tooltipBg,
                            borderColor: themeColors.charts.tooltipBorder,
                            color: themeColors.charts.tooltipText,
                          }}
                        >
                          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5">
                            <span className="font-bold">Year {d.year}</span>
                            {d.is_inverter_replacement ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full ss-badge-solar font-bold leading-none">
                                Inverter Refresh
                              </span>
                            ) : isProfit ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full ss-badge-field font-bold leading-none">
                                Profitable
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full ss-badge-danger font-bold leading-none">
                                Payoff Phase
                              </span>
                            )}
                          </div>
                          {d.annual_yield_kwh > 0 && (
                            <p className="text-[var(--text-secondary)] text-xs leading-tight flex justify-between">
                              <span>Annual Yield:</span>
                              <strong className="text-[var(--text-primary)]">{d.annual_yield_kwh?.toLocaleString()} kWh</strong>
                            </p>
                          )}
                          {d.effective_rate_tl > 0 && (
                            <p className="text-[var(--text-secondary)] text-xs leading-tight flex justify-between">
                              <span>Est. Tariff:</span>
                              <strong className="text-[var(--text-primary)]">{CURRENCY.symbol}{d.effective_rate_tl}/kWh</strong>
                            </p>
                          )}
                          <p className="text-[var(--text-secondary)] text-xs leading-tight flex justify-between">
                            <span>Annual Value:</span>
                            <strong className="text-[#37645C] dark:text-[#84C5B9]">
                              +{CURRENCY.symbol}{d.annual_savings?.toLocaleString()}
                            </strong>
                          </p>
                          {d.inverter_cost > 0 && (
                            <p className="text-[var(--brand-solar-ink)] text-xs leading-tight font-bold flex justify-between">
                              <span>Inverter Refresh:</span>
                              <span>-{CURRENCY.symbol}{d.inverter_cost?.toLocaleString()}</span>
                            </p>
                          )}
                          <div className="pt-1.5 border-t border-[var(--border-subtle)] flex justify-between font-bold">
                            <span>{isProfit ? 'Net Profit:' : 'Net Position:'}</span>
                            <span className={isProfit ? 'text-[#37645C] dark:text-[#84C5B9]' : 'text-[#C2452D] dark:text-[#E0634B]'}>
                              {isProfit ? '+' : ''}{CURRENCY.symbol}{d.cumulative_net?.toLocaleString()}
                            </span>
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
                  strokeWidth={2}
                  fill="url(#cashflowSplitFill)"
                  baseValue={0}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)] tabular-nums pt-3 border-t border-[var(--border-subtle)]">
            <span>Model: 0.5%/yr degradation · 4.0%/yr tariff inflation</span>
            <span>Year 11 Inverter Replacement</span>
          </div>
        </div>
      </div>

      {/* Financial Breakdown & Environmental Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        {/* Financial Details */}
        <div className="p-6 rounded-2xl ss-card space-y-4">
          <h3 className="text-sm font-bold text-[var(--text-primary)] inline-flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-[#37645C] text-[#F6F5EF] inline-flex items-center justify-center shrink-0">
              <DollarSign className="w-3.5 h-3.5" />
            </span>
            <span className="leading-none">Financial Breakdown ({CURRENCY.code})</span>
          </h3>
          <div className="space-y-2.5 text-xs divide-y divide-[var(--border-subtle)] tabular-nums">
            <div className="flex justify-between pt-1">
              <span className="text-[var(--text-secondary)]">Turnkey Installation (CapEx):</span>
              <span className="font-bold text-[var(--text-primary)]">
                {CURRENCY.symbol}{financials?.total_installation_cost?.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-[var(--text-secondary)]">Annual Energy Value:</span>
              <span className="font-bold text-[var(--text-primary)]">
                +{CURRENCY.symbol}{financials?.annual_savings?.toLocaleString()} / yr
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-[var(--text-secondary)]">Monthly Utility Savings:</span>
              <span className="font-bold text-[var(--text-primary)]">
                +{CURRENCY.symbol}{financials?.monthly_savings?.toLocaleString()} / mo
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-[var(--text-secondary)] font-semibold">25-Year Net Profit:</span>
              <span className="font-bold text-[#37645C] dark:text-[#84C5B9] text-sm">
                +{CURRENCY.symbol}{financials?.net_profit_25yr?.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Environmental Impact */}
        <div className="p-6 rounded-2xl ss-card space-y-4">
          <h3 className="text-sm font-bold text-[var(--text-primary)] inline-flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-[#37645C] text-[#F6F5EF] inline-flex items-center justify-center shrink-0">
              <Leaf className="w-3.5 h-3.5" />
            </span>
            <span className="leading-none">Carbon Offset</span>
          </h3>
          <div className="space-y-3 pt-1 tabular-nums">
            <div className="p-3.5 rounded-xl ss-well flex items-center justify-between">
              <div>
                <div className="text-[11px] text-[var(--text-secondary)] font-medium leading-none">
                  Avoided CO₂ / year
                </div>
                <div className="text-lg font-bold text-[var(--text-primary)] mt-1">
                  {environmental?.annual_co2_offset_tonnes} tonnes
                </div>
              </div>
              <div className="text-right text-[11px] text-[var(--text-muted)]">
                Lifetime: <strong className="text-[var(--text-primary)]">{environmental?.lifetime_co2_offset_tonnes} t</strong>
              </div>
            </div>

            <div className="p-3.5 rounded-xl ss-well flex items-center justify-between">
              <div>
                <div className="text-[11px] text-[var(--text-secondary)] font-medium leading-none">
                  Tree Equivalent
                </div>
                <div className="text-lg font-bold text-[#37645C] dark:text-[#84C5B9] mt-1">
                  {environmental?.equivalent_trees_planted} Trees
                </div>
              </div>
              <div className="text-right text-[11px] text-[var(--text-muted)]">
                Annual carbon sink
              </div>
            </div>
          </div>
        </div>

        {/* Engineering Assumptions */}
        <div className="p-6 rounded-2xl ss-card space-y-4">
          <h3 className="text-sm font-bold text-[var(--text-primary)] inline-flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-[#6750A4] text-[#F6F5EF] inline-flex items-center justify-center shrink-0">
              <Compass className="w-3.5 h-3.5" />
            </span>
            <span className="leading-none">Engineering Standards</span>
          </h3>
          <div className="space-y-2.5 text-xs divide-y divide-[var(--border-subtle)] tabular-nums">
            <div className="flex justify-between pt-1">
              <span className="text-[var(--text-secondary)]">Roof Packing Factor:</span>
              <span className="text-[var(--text-primary)] font-bold">
                {Math.round((assumptions?.packing_factor ?? DEFAULT_PHYSICS.packingFactor) * 100)}%
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-[var(--text-secondary)]">PV Panel Density:</span>
              <span className="text-[var(--text-primary)] font-bold">
                {assumptions?.panel_density_kwp_per_m2 ?? DEFAULT_PHYSICS.panelDensityKwpPerM2} kWp / m²
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-[var(--text-secondary)]">System Losses:</span>
              <span className="text-[var(--text-primary)] font-bold">
                {assumptions?.system_loss_percent ?? DEFAULT_PHYSICS.systemLossPercent}%
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-[var(--text-secondary)]">Optimal Tilt Angle:</span>
              <span className="text-[var(--text-primary)] font-bold">
                {optimal_tilt_deg ?? DEFAULT_PHYSICS.defaultTiltDeg}°
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-[var(--text-secondary)]">PV Degradation:</span>
              <span className="text-[var(--text-primary)] font-bold">
                {assumptions?.degradation_rate_percent ?? 0.5}% / yr
              </span>
            </div>
            <div className="flex justify-between pt-2.5">
              <span className="text-[var(--text-secondary)]">Tariff Escalation:</span>
              <span className="text-[var(--text-primary)] font-bold">
                +{assumptions?.tariff_escalation_rate_percent ?? 4.0}% / yr
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 border-t border-[var(--border-subtle)] print:hidden">
        <button
          type="button"
          onClick={onBackToSelector}
          className="text-xs px-5 py-2.5 rounded-full ss-btn-secondary font-semibold inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5 shrink-0 -translate-y-px" />
          <span className="leading-none">Modify Selected Roof Polygons</span>
        </button>

        <button
          type="button"
          onClick={onReset}
          className="text-xs px-6 py-2.5 rounded-full ss-btn-primary font-bold inline-flex items-center gap-2 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 shrink-0 -translate-y-px" />
          <span className="leading-none">Analyze Another Property</span>
        </button>
      </div>
    </div>
  );
}
