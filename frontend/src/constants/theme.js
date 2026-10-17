/**
 * Global Theme & Color Tokens for SolarSeeker — Daylight Precision (Brand System 04 & 05)
 *
 * Core Brand Swatches:
 * - Graphite : #182321 (RGB 24 / 35 / 33)
 * - Daylight : #F6F5EF (RGB 246 / 245 / 239)
 * - Solar    : #F5AD46 (RGB 245 / 173 / 70)
 * - Field    : #37645C (RGB 55 / 100 / 92)
 * - Signal   : #6750A4 (RGB 103 / 80 / 164)
 */

export const BRAND_SWATCHES = {
  graphite: '#182321',
  daylight: '#F6F5EF',
  solar: '#F5AD46',
  field: '#37645C',
  signal: '#6750A4',
};

export const getThemeColors = (isDark = false) => ({
  accent: {
    solar: '#F5AD46',
    solarHover: '#E59A2E',
    field: isDark ? '#599E92' : '#37645C',
    signal: isDark ? '#9B84DC' : '#6750A4',
    graphite: '#182321',
    daylight: '#F6F5EF',
  },

  polygons: {
    unselected: {
      fill: '#F5AD46',
      fillOpacity: 0.34,
      hoverFill: '#E59A2E',
      hoverFillOpacity: 0.52,
      stroke: '#F5AD46',
      strokeWidth: 2,
      badgeFill: '#182321',
      badgeStroke: '#F5AD46',
      badgeText: '#F6F5EF',
    },
    selected: {
      fill: '#37645C',
      fillOpacity: 0.66,
      hoverFillOpacity: 0.80,
      stroke: '#F6F5EF',
      strokeWidth: 2.5,
      badgeFill: '#37645C',
      badgeStroke: '#F6F5EF',
      badgeText: '#F6F5EF',
    },
  },

  charts: {
    monthlyBar: '#F5AD46',                             // Solar (#F5AD46) generation bars
    cashflowProfit: isDark ? '#599E92' : '#37645C',    // Field (#37645C) profit area
    cashflowLoss: isDark ? '#E0634B' : '#C2452D',      // Terracotta payoff area
    withoutModelUsage: isDark ? '#E0634B' : '#C2452D', // Grid-Only baseline
    naiveBatteryUsage: '#F5AD46',                      // Solar (#F5AD46) Naive battery
    withModelUsage: isDark ? '#599E92' : '#37645C',    // Field (#37645C) Phoebe AI
    batteryDischarge: isDark ? '#9B84DC' : '#6750A4',  // Signal (#6750A4) BESS discharge output
    withoutModelCost: isDark ? '#E0634B' : '#C2452D',  // Grid-Only cumulative cost
    naiveBatteryCost: '#F5AD46',                       // Solar (#F5AD46) Naive battery cost
    withModelCost: isDark ? '#599E92' : '#37645C',     // Field (#37645C) Phoebe AI cost
    gridLines: isDark ? '#2C3E3A' : '#E2DFD3',         // Subtle architectural grid lines
    axisText: isDark ? '#8B9C98' : '#657370',          // Accessible axis labels
    referenceLine: isDark ? '#4E6762' : '#B5B1A3',     // Reference line
    cursorStroke: isDark ? '#599E92' : '#37645C',      // Clean dashed hover cursor
    tooltipBg: isDark ? '#1F2D2A' : '#FFFFFF',         // Tooltip surface
    tooltipBorder: isDark ? '#3E5651' : '#DFDDD2',     // Tooltip border
    tooltipText: isDark ? '#F6F5EF' : '#182321',       // Tooltip primary text
  },
});

// Default export for static references
export const THEME_COLORS = getThemeColors(false);
