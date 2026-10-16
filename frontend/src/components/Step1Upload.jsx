import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  MapPin,
  DollarSign,
  Sliders,
  Sparkles,
  ArrowRight,
  AlertCircle,
  Search,
  Plus,
  Minus,
} from 'lucide-react';
import {
  CALIBRATED_SITE,
  DEFAULT_FINANCIALS,
  DEFAULT_PHYSICS,
  MAP_CONFIG,
  CURRENCY,
} from '../constants/config';

export default function Step1Upload({
  file,
  setFile,
  previewUrl,
  setPreviewUrl,
  location,
  setLocation,
  financials,
  setFinancials,
  gsd,
  setGsd,
  onRunDetection,
  isDetecting,
  error,
}) {
  const fileInputRef = useRef(null);
  const [sourceMode, setSourceMode] = useState('upload'); // 'upload' | 'location'
  const [dragActive, setDragActive] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchAddress, setSearchAddress] = useState('');
  const [mapZoom, setMapZoom] = useState(MAP_CONFIG.defaultZoom);
  const [isLocating, setIsLocating] = useState(false);

  const handleFiles = (selectedFile) => {
    if (!selectedFile) return;
    if (!selectedFile.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPEG, WEBP).');
      return;
    }
    setFile(selectedFile);
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files[0]);
    }
  };

  const loadSampleImage = async () => {
    try {
      setLoadingSample(true);
      const res = await fetch('/sample_satellite.png');
      if (!res.ok) throw new Error('Sample not found');
      const blob = await res.blob();
      const sampleFile = new File([blob], 'sample_satellite.png', { type: 'image/png' });
      handleFiles(sampleFile);
      setLocation({ lat: CALIBRATED_SITE.lat, lon: CALIBRATED_SITE.lon });
      setSearchAddress(CALIBRATED_SITE.name);
    } catch (err) {
      alert('Could not load sample image: ' + err.message);
    } finally {
      setLoadingSample(false);
    }
  };

  const handleAddressChange = (e) => {
    const val = e.target.value;
    setSearchAddress(val);

    // If user enters or pastes direct coordinates (e.g. "41.0026, 28.6417")
    const coordMatch = val.trim().match(/^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[3]);
      if (!isNaN(lat) && !isNaN(lon)) {
        setLocation({ lat, lon });
      }
    }
  };

  const handleAddressSubmit = (e) => {
    if (e) e.preventDefault();
    const query = searchAddress.trim();
    if (!query) return;

    setIsLocating(true);
    // 1. Direct coordinate format
    const coordMatch = query.match(/^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[3]);
      if (!isNaN(lat) && !isNaN(lon)) {
        setLocation({ lat, lon });
        setIsLocating(false);
        return;
      }
    }

    // 2. Named geocoding simulation
    const lower = query.toLowerCase();
    if (lower.includes('beylikdüzü') || lower.includes('beylikduzu') || lower.includes('istanbul')) {
      setLocation({ lat: CALIBRATED_SITE.lat, lon: CALIBRATED_SITE.lon });
    } else {
      let hash = 0;
      for (let i = 0; i < query.length; i++) hash = (hash << 5) - hash + query.charCodeAt(i);
      const latOffset = ((Math.abs(hash) % 600) / 10000) * (hash % 2 === 0 ? 1 : -1);
      const lonOffset = (((Math.abs(hash) >> 3) % 600) / 10000) * (hash % 2 === 0 ? -1 : 1);
      setLocation({
        lat: parseFloat((CALIBRATED_SITE.lat + latOffset).toFixed(4)),
        lon: parseFloat((CALIBRATED_SITE.lon + lonOffset).toFixed(4)),
      });
    }

    setTimeout(() => setIsLocating(false), 250);
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5 -translate-y-px" />
          <div className="text-xs">
            <p className="font-semibold text-rose-100 leading-none">Detection Error</p>
            <p className="text-rose-200/90 text-[11px] mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Main Two-Column Grid: Natural Heights (items-start eliminates dead space) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Rooftop Imagery Source (Upload OR Location Search) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Top Bar with Title & Dual Mode Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-none">
                Rooftop Imagery Source
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Provide aerial imagery via file upload or location lookup.
              </p>
            </div>

            {/* Mode Switcher Pill */}
            <div className="inline-flex p-1 bg-zinc-900 border border-zinc-800 rounded-xl self-start sm:self-auto shrink-0 shadow-inner">
              <button
                type="button"
                onClick={() => setSourceMode('upload')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  sourceMode === 'upload'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5 shrink-0 -translate-y-px" />
                <span className="leading-none">Upload Screenshot</span>
              </button>

              <button
                type="button"
                onClick={() => setSourceMode('location')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  sourceMode === 'location'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 shrink-0 -translate-y-px" />
                <span className="leading-none">Location Search</span>
              </button>
            </div>
          </div>

          {/* MODE 1: FILE UPLOAD DROPZONE */}
          {sourceMode === 'upload' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="leading-none">Top-down aerial screenshot (Google Maps, Apple Maps, or Earth).</span>
                <button
                  type="button"
                  onClick={loadSampleImage}
                  disabled={loadingSample || isDetecting}
                  className="px-3 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 inline-flex items-center gap-1.5 font-medium transition-colors shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 -translate-y-px" />
                  <span className="leading-none">{loadingSample ? 'Loading...' : 'Use Sample Image'}</span>
                </button>
              </div>

              {/* Upload Dropzone Container - Natural Height */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`min-h-[380px] sm:min-h-[420px] rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors flex flex-col items-center justify-center overflow-hidden ${
                  dragActive
                    ? 'border-zinc-400 bg-zinc-900/60'
                    : previewUrl
                    ? 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700'
                    : 'border-zinc-800/80 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-900/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files[0])}
                />

                {previewUrl ? (
                  <div className="w-full flex flex-col items-center space-y-4">
                    <div className="relative w-full max-h-[380px] rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 flex items-center justify-center">
                      <img
                        src={previewUrl}
                        alt="Satellite Preview"
                        className="w-full h-full object-contain max-h-[380px] mx-auto"
                      />
                      <div className="absolute bottom-3 right-3 px-3 py-1 bg-zinc-950/90 border border-zinc-800 rounded-lg text-xs text-zinc-300 font-mono shadow-md">
                        {file?.name || 'satellite_image.png'} •{' '}
                        {file?.size ? (file.size / (1024 * 1024)).toFixed(2) + ' MB' : 'Loaded'}
                      </div>
                    </div>
                    <p className="text-xs text-zinc-400 font-medium leading-none">
                      Click or drag a new screenshot anywhere to replace
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-w-sm py-6">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
                      <UploadCloud className="w-6 h-6 text-zinc-200" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-zinc-200 leading-none">
                        Drop high-res aerial screenshot here, or browse
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">
                        Supports PNG, JPG, WEBP captures up to 15 MB
                      </p>
                    </div>
                    <div className="pt-2">
                      <span className="inline-block px-5 py-2 rounded-full bg-white text-zinc-950 text-xs font-semibold hover:bg-zinc-200 transition-colors shadow-sm leading-none">
                        Browse Files
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MODE 2: LOCATION & ADDRESS SEARCH */}
          {sourceMode === 'location' && (
            <div className="space-y-3">
              {/* Address Search Bar - Synchronizes Coordinates Automatically */}
              <form onSubmit={handleAddressSubmit} className="relative w-full">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchAddress}
                  onChange={handleAddressChange}
                  placeholder="Enter street address, city, or coordinates (e.g. Istanbul, 41.0026, 28.6417)..."
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-500 rounded-xl pl-10 pr-24 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none transition-colors font-sans"
                />
                <button
                  type="submit"
                  disabled={isLocating}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5"
                >
                  {isLocating ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                  ) : (
                    <span className="leading-none">Locate</span>
                  )}
                </button>
              </form>

              {/* Viewfinder Canvas - Clean & Uncluttered (No target box) */}
              <div className="min-h-[380px] sm:min-h-[420px] rounded-2xl border border-zinc-800 bg-zinc-950 relative overflow-hidden flex flex-col justify-between p-4">
                {/* Visual Imagery Background Layer */}
                {previewUrl ? (
                  <div className="absolute inset-0 z-0">
                    <img
                      src={previewUrl}
                      alt="Satellite Map View"
                      className="w-full h-full object-cover opacity-85"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-zinc-950/80 pointer-events-none" />
                  </div>
                ) : (
                  <div className="absolute inset-0 z-0 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:20px_20px] flex items-center justify-center opacity-60">
                    <div className="w-72 h-72 rounded-full border border-zinc-800/80 flex items-center justify-center">
                      <div className="w-48 h-48 rounded-full border border-zinc-800/60 flex items-center justify-center">
                        <div className="w-24 h-24 rounded-full border border-zinc-700/40" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Viewfinder Header Overlay */}
                <div className="relative z-10 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900/90 border border-zinc-800 text-[11px] text-zinc-300 font-medium backdrop-blur-sm">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span className="leading-none">Phoebe Spatial Tile Stream</span>
                  </span>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-zinc-900/90 border border-zinc-800 text-zinc-400 backdrop-blur-sm leading-none">
                      {location.lat.toFixed(4)}°N, {location.lon.toFixed(4)}°E
                    </span>
                  </div>
                </div>

                {/* Spacer */}
                <div className="relative z-10 flex-1 min-h-[140px]" />

                {/* Viewfinder Bottom Controls & Stage Action */}
                <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-3 bg-zinc-950/80 p-3 rounded-xl border border-zinc-800/80 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setMapZoom((z) => Math.min(z + 1, MAP_CONFIG.maxZoom))}
                        className="px-2.5 py-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                        title="Zoom In"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-2 text-[11px] font-mono text-zinc-400 border-x border-zinc-800">
                        {mapZoom}x
                      </span>
                      <button
                        type="button"
                        onClick={() => setMapZoom((z) => Math.max(z - 1, MAP_CONFIG.minZoom))}
                        className="px-2.5 py-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                        title="Zoom Out"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="text-[11px] text-zinc-400 hidden sm:inline leading-none">
                      High-Res Spatial Imagery (GSD ~{gsd}m)
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={loadSampleImage}
                    disabled={loadingSample || isDetecting}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-white text-zinc-950 text-xs font-semibold hover:bg-zinc-200 transition-all inline-flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98]"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-zinc-950 shrink-0 -translate-y-px" />
                    <span className="leading-none">
                      {previewUrl
                        ? 'Rooftop Staged • Reload'
                        : loadingSample
                        ? 'Staging...'
                        : 'Stage Rooftop for AI Vision'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Natural Stacking (No Dead Space) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Geographical Coordinates Section */}
          <div className="p-5 sm:p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-3.5">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-400 shrink-0 -translate-y-px" />
                  <span className="leading-none">Geographical Coordinates</span>
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 leading-none">
                  PVGIS 5.3
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Required to query European Commission solar radiation databases.
              </p>
            </div>

            {/* Calibrated Site Selection (Beylikdüzü only) */}
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => {
                  setLocation({ lat: CALIBRATED_SITE.lat, lon: CALIBRATED_SITE.lon });
                  setSearchAddress(CALIBRATED_SITE.name);
                }}
                className={`text-xs px-3.5 py-1.5 rounded-full border transition-all inline-flex items-center gap-2 ${
                  Math.abs(location.lat - CALIBRATED_SITE.lat) < 0.001 &&
                  Math.abs(location.lon - CALIBRATED_SITE.lon) < 0.001
                    ? 'bg-zinc-100 text-zinc-950 font-semibold border-zinc-100 shadow-sm'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <span className="leading-none">{CALIBRATED_SITE.name}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium leading-none ${
                    Math.abs(location.lat - CALIBRATED_SITE.lat) < 0.001 &&
                    Math.abs(location.lon - CALIBRATED_SITE.lon) < 0.001
                      ? 'bg-zinc-300 text-zinc-950'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  Calibrated Site
                </span>
              </button>
            </div>

            {/* Lat / Lon Inputs (Freely editable by user) */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1 leading-none">
                  Latitude (°N)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={location.lat}
                  onChange={(e) =>
                    setLocation({ ...location, lat: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-mono transition-colors"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1 leading-none">
                  Longitude (°E)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={location.lon}
                  onChange={(e) =>
                    setLocation({ ...location, lon: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-mono transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Financial & Energy Profile */}
          <div className="p-5 sm:p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-3.5">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400 shrink-0 -translate-y-px" />
                <span className="leading-none">Utility & Electricity Economics</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Calibrates net-metering savings and payback schedules.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1 leading-none">
                  Grid Tariff Rate
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    value={financials.electricityRate}
                    onChange={(e) =>
                      setFinancials({
                        ...financials,
                        electricityRate: parseFloat(e.target.value) || DEFAULT_FINANCIALS.electricityRate,
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-mono pr-14 transition-colors"
                  />
                  <span className="absolute right-2.5 top-2 text-[11px] text-zinc-500 font-mono leading-none">
                    {CURRENCY.symbol}/kWh
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1 leading-none">
                  Monthly Electric Bill
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="50"
                    min="50"
                    value={financials.monthlyBill}
                    onChange={(e) =>
                      setFinancials({
                        ...financials,
                        monthlyBill: parseFloat(e.target.value) || DEFAULT_FINANCIALS.monthlyBill,
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-mono pr-12 transition-colors"
                  />
                  <span className="absolute right-2.5 top-2 text-[11px] text-zinc-500 font-mono leading-none">
                    {CURRENCY.symbol}/ay
                  </span>
                </div>
              </div>
            </div>

            {/* Advanced Engineering Settings Toggle */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1.5 transition-colors font-medium"
              >
                <Sliders className="w-3.5 h-3.5 shrink-0 -translate-y-px" />
                <span className="leading-none">
                  {showAdvanced ? 'Hide Advanced Settings' : 'Advanced Engineering Settings'}
                </span>
              </button>

              {showAdvanced && (
                <div className="grid grid-cols-2 gap-3 pt-3 mt-3 border-t border-zinc-800">
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-400 mb-1 leading-none">
                      Turnkey Cost ({CURRENCY.symbol}/kWp)
                    </label>
                    <input
                      type="number"
                      step="1000"
                      min="5000"
                      value={financials.installCostPerKwp}
                      onChange={(e) =>
                        setFinancials({
                          ...financials,
                          installCostPerKwp: parseFloat(e.target.value) || DEFAULT_FINANCIALS.installCostPerKwp,
                        })
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        className={`block text-[11px] font-medium leading-none ${
                          sourceMode === 'location' ? 'text-zinc-500' : 'text-zinc-400'
                        }`}
                      >
                        GSD (meters/pixel)
                      </label>
                      {sourceMode === 'location' && (
                        <span className="text-[9px] text-zinc-500 font-mono leading-none">
                          Auto-calibrated
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0.05"
                      max="1.0"
                      value={gsd}
                      disabled={sourceMode === 'location'}
                      onChange={(e) => setGsd(parseFloat(e.target.value) || DEFAULT_PHYSICS.gsd)}
                      className={`w-full rounded-xl px-3 py-1.5 text-xs font-mono transition-colors ${
                        sourceMode === 'location'
                          ? 'bg-zinc-900/60 border border-zinc-800/60 text-zinc-500 cursor-not-allowed select-none opacity-60'
                          : 'bg-zinc-950 border border-zinc-800 text-white focus:outline-none focus:border-zinc-500'
                      }`}
                      title={
                        sourceMode === 'location'
                          ? 'GSD is automatically fixed by map tile resolution in Location Search mode'
                          : 'Ground Sampling Distance'
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Launch CTA Button - Sits directly below Financial Card with natural spacing */}
          <button
            type="button"
            onClick={onRunDetection}
            disabled={!file || isDetecting}
            className={`w-full py-3.5 sm:py-4 px-6 rounded-full font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-all shadow-sm ${
              !file || isDetecting
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/60'
                : 'bg-white hover:bg-zinc-200 text-zinc-950 active:scale-[0.99]'
            }`}
          >
            {isDetecting ? (
              <>
                <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="leading-none">Scanning Rooftops with U-Net Vision...</span>
              </>
            ) : (
              <>
                <span className="leading-none">Detect Rooftops & Verify Footprint</span>
                <ArrowRight className="w-4 h-4 shrink-0 -translate-y-px" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
