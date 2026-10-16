/**
 * Global Theme & Color Tokens for SolarSeeker
 *
 * Centralized color definitions to easily customize colors across
 * the entire application (charts, polygons, badges, KPI cards, and UI).
 */

export const THEME_COLORS = {
  // Brand & Accent Colors
  accent: {
    yellow: '#facc15',       // Primary brand & report value highlight (Tailwind yellow-400)
    yellowHover: '#eab308',  // Yellow hover (Tailwind yellow-500)
    amber: '#f59e0b',        // Secondary amber accent
  },

  // Interactive Rooftop Polygons (Step 2 Verification)
  polygons: {
    unselected: {
      fill: '#f59e0b',
      fillOpacity: 0.35,
      hoverFill: '#fbbf24',
      hoverFillOpacity: 0.55,
      stroke: '#f59e0b',
      strokeWidth: 2,
      badgeFill: '#18181b', // zinc-900
      badgeStroke: '#f59e0b',
      badgeText: '#fcd34d', // amber-300
    },
    selected: {
      fill: '#10b981',
      fillOpacity: 0.65,
      hoverFillOpacity: 0.80,
      stroke: '#059669',
      strokeWidth: 3,
      badgeFill: '#10b981',
      badgeStroke: '#09090b',
      badgeText: '#09090b',
    },
  },

  // Chart Color Schemes (Step 3 Feasibility & Phoebe HEMS)
  charts: {
    monthlyBar: '#facc15',        // Yellow solar monthly generation bars
    cashflowProfit: '#22c55e',    // Green profit area (cumulative net savings > 0)
    cashflowLoss: '#ef4444',      // Red loss area (payback / CapEx investment phase)
    withoutModelUsage: '#ef4444', // Red line/area: Grid usage without Phoebe AI
    withModelUsage: '#22c55e',    // Green line/area: Grid usage with Phoebe AI
    batteryDischarge: '#facc15',  // Yellow line/bar: Phoebe BESS output (kW)
    withoutModelCost: '#ef4444',  // Red line/area: Cumulative cost without model (₺)
    withModelCost: '#22c55e',     // Green line/area: Cumulative cost with Phoebe AI (₺)
    gridLines: '#27272a',         // zinc-800 grid lines
    axisText: '#71717a',          // zinc-500 axis labels
    referenceLine: '#52525b',     // zinc-600 zero break-even line
    tooltipBg: '#18181b',         // zinc-900 tooltip container
    tooltipBorder: '#3f3f46',     // zinc-700
  },

  // Semantic Status Colors
  status: {
    profit: '#22c55e',
    loss: '#ef4444',
    warning: '#f59e0b',
    info: '#06b6d4',
  },

  // Global Surface & Neutral Colors
  surface: {
    bg: '#09090b',
    cardBg: 'bg-zinc-900/40',
    cardBorder: 'border-zinc-800',
    subtleBorder: 'border-zinc-800/80',
    elevatedBg: 'bg-zinc-950',
  },
};
