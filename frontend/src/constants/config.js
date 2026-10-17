/**
 * Global Configuration & Physics Defaults for SolarSeeker
 *
 * Eliminates magic numbers and centralizes all defaults across the app.
 */

// Currency Configuration (1 USD = 50 TL exchange rate benchmark)
export const CURRENCY = {
  symbol: '₺',
  code: 'TRY',
  locale: 'tr-TR',
};

// Calibrated Test Site: Beylikdüzü, Istanbul
export const CALIBRATED_SITE = {
  name: 'Beylikdüzü, Istanbul',
  lat: 41.0026,
  lon: 28.6417,
  tag: 'Calibrated Site',
};

// Default Financial Parameters (Turkish Market EPDK Benchmark)
export const DEFAULT_FINANCIALS = {
  electricityRate: 3.50,    // ₺/kWh (Standard residential consumption tariff)
  monthlyBill: 1500,        // ₺/mo (Typical household electric bill)
  installCostPerKwp: 40000, // ₺/kWp (~$800/kWp * 50 TL/$)
};

// Default Physical & Engineering Constraints
export const DEFAULT_PHYSICS = {
  gsd: 0.15,                        // meters/pixel (Google Maps Zoom 19-20 calibrated)
  packingFactor: 0.65,              // Usable fraction of gross rooftop area (setbacks, fire paths)
  panelDensityKwpPerM2: 0.20,       // Modern monocrystalline panels (~400W per 2 m²)
  systemLossPercent: 14.0,          // Cabling, inverter, soiling, temperature losses (%)
  lifetimeYears: 25,                // Standard solar assessment projection horizon
  defaultTiltDeg: 33,               // Optimal pitch for Istanbul latitude
  sqmPerPanel: 2.0,                 // ~2 m² per residential monocrystalline panel
  gridEmissionFactorKgPerKwh: 0.40, // Avoided CO2 emissions per kWh
  co2AbsorbedPerTreeKgPerYear: 21.0,// Tree carbon sink equivalence
};

// Spatial Map Viewfinder Configuration
// Max zoom is 20; penultimate zoom ("level before last") is 19 (~0.15m/px GSD)
export const MAP_CONFIG = {
  defaultZoom: 19,
  analysisZoom: 19,
  minZoom: 3,
  maxZoom: 20,
  captureSizePx: 512,
  defaultProvider: 'google',
  nominatimUrl: 'https://nominatim.openstreetmap.org/search',
  tileProviders: {
    google: {
      id: 'google',
      name: 'Google Satellite',
      url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
      maxNativeZoom: 20,
      attribution: 'Imagery © Google',
    },
    esri: {
      id: 'esri',
      name: 'Esri World Imagery',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      maxNativeZoom: 19,
      attribution: 'Tiles © Esri, Maxar, Earthstar Geographics',
    },
  },
};

// Phoebe HEMS (AI Home Energy Management System) Defaults
export const PHOEBE_CONFIG = {
  batteryCapacityKwh: 10.0,
  initialSocPercent: 45,
  maxOutputKw: 5.0,
  historyWindowMinutes: 180,
  forecastHorizonMinutes: 300, // 5 hours: 17:00–22:00 (Full EPDK Evening Peak Window)
  tariffs: {
    nightTl: 2.94,  // 22:00 - 06:00
    dayTl: 4.38,    // 06:00 - 17:00
    peakTl: 6.17,   // 17:00 - 22:00 (EPDK Peak)
    peakSpikeTl: 10.18, // Overload surcharge on unshaved peak spikes
    exportTl: 3.50,
  },
  playbackSpeeds: [
    { label: '1x', intervalMs: 140 },
    { label: '2x', intervalMs: 70 },
    { label: '4x', intervalMs: 30 },
  ],
  presets: [
    {
      id: 'evening_peak',
      label: 'Evening Peak Surge',
      badge: 'Typical Household',
      description: 'Standard residential evening routine with heating & cooking (~3.3 kW baseline)',
    },
    {
      id: 'high_variance',
      label: 'High-Spike Stress Test',
      badge: 'Heavy Appliances',
      description: 'Demanding intermittent spikes up to 7.0 kW testing predictive battery rationing',
    },
  ],
};

