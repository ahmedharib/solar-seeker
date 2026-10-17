/**
 * Global Theme & Color Tokens for SolarSeeker
 *
 * Centralized, harmonious color definitions following an 8px design pattern
 * with consistent surface, status, and chart palettes.
 */

export const THEME_COLORS = {
  // Brand & Accent Colors
  accent: {
    amber: '#f59e0b',        // Primary solar accent
    amberHover: '#d97706',   // Amber hover
    emerald: '#10b981',      // Savings & verified accent
  },

  // Interactive Rooftop Polygons (Step 2 Verification)
  polygons: {
    unselected: {
      fill: '#f59e0b',
      fillOpacity: 0.25,
      hoverFill: '#fbbf24',
      hoverFillOpacity: 0.45,
      stroke: '#f59e0b',
      strokeWidth: 2,
      badgeFill: '#18181b', // zinc-900
      badgeStroke: '#f59e0b',
      badgeText: '#fcd34d', // amber-300
    },
    selected: {
      fill: '#10b981',
      fillOpacity: 0.50,
      hoverFillOpacity: 0.70,
      stroke: '#059669',
      strokeWidth: 2.5,
      badgeFill: '#10b981',
      badgeStroke: '#09090b',
      badgeText: '#09090b',
    },
  },

  // Chart Color Schemes (Feasibility & Phoebe HEMS)
  charts: {
    monthlyBar: '#f59e0b',        // Amber solar generation bars
    cashflowProfit: '#10b981',    // Emerald profit area
    cashflowLoss: '#f43f5e',      // Rose loss area
    withoutModelUsage: '#f43f5e', // Rose line: Grid usage without model
    naiveBatteryUsage: '#f59e0b', // Amber line: Naive battery
    withModelUsage: '#10b981',    // Emerald line: Phoebe AI
    batteryDischarge: '#38bdf8',  // Cyan line: Battery discharge output
    withoutModelCost: '#f43f5e',  // Rose line: Cumulative cost without model
    naiveBatteryCost: '#f59e0b',  // Amber line: Cumulative cost with naive battery
    withModelCost: '#10b981',     // Emerald line: Cumulative cost with Phoebe AI
    gridLines: '#27272a',         // zinc-800 grid lines
    axisText: '#71717a',          // zinc-500 axis labels
    referenceLine: '#52525b',     // zinc-600 reference line
    tooltipBg: '#18181b',         // zinc-900 tooltip container
    tooltipBorder: '#3f3f46',     // zinc-700 tooltip border
  },

  // Semantic Status Colors
  status: {
    profit: '#10b981',
    loss: '#f43f5e',
    warning: '#f59e0b',
    info: '#38bdf8',
  },

  // Global Surface & Neutral Colors
  surface: {
    bg: '#09090b',
    cardBg: 'bg-zinc-900/40',
    cardBorder: 'border-zinc-800',
    subtleBorder: 'border-zinc-800/80',
    elevatedBg: 'bg-zinc-900',
  },
};
