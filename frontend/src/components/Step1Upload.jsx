import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  MapPin,
  DollarSign,
  Sparkles,
  ArrowRight,
  AlertCircle,
  Search,
} from 'lucide-react';
import {
  CALIBRATED_SITE,
  DEFAULT_FINANCIALS,
  DEFAULT_PHYSICS,
  MAP_CONFIG,
  CURRENCY,
} from '../constants/config';
import LeafletMap from './LeafletMap';

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
  const mapRef = useRef(null);
  const [sourceMode, setSourceMode] = useState('upload'); // 'upload' | 'location'
  const [dragActive, setDragActive] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [searchAddress, setSearchAddress] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [mapZoom, setMapZoom] = useState(MAP_CONFIG.analysisZoom);
  const [tileProvider, setTileProvider] = useState(MAP_CONFIG.defaultProvider);
  const [isLocating, setIsLocating] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [locationError, setLocationError] = useState(null);

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
    setLocationError(null);

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

  // Fly to a target coordinate and automatically zoom in to the penultimate zoom level (Zoom 19)
  const applyTargetLocation = async (lat, lon, displayLabel) => {
    const cleanLat = parseFloat(Number(lat).toFixed(6));
    const cleanLon = parseFloat(Number(lon).toFixed(6));
    setLocation({ lat: cleanLat, lon: cleanLon });
    setMapZoom(MAP_CONFIG.analysisZoom);
    if (displayLabel) {
      setSearchAddress(displayLabel);
    }
    setSearchSuggestions([]);
    await mapRef.current?.flyToLocationAndZoom(cleanLat, cleanLon, MAP_CONFIG.analysisZoom);
  };

  const handleAddressSubmit = async (e) => {
    if (e) e.preventDefault();
    const query = searchAddress.trim();
    if (!query) return;

    setIsLocating(true);
    setLocationError(null);
    setSearchSuggestions([]);

    try {
      // 1. Direct coordinate format (e.g. "41.0026, 28.6417")
      const coordMatch = query.match(/^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/);
      if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lon = parseFloat(coordMatch[3]);
        if (!isNaN(lat) && !isNaN(lon)) {
          await applyTargetLocation(lat, lon);
          return;
        }
      }

      // 2. Calibrated site shortcut
      const lower = query.toLowerCase();
      if (lower === 'beylikdüzü' || lower === 'beylikduzu' || lower === 'beylikdüzü, istanbul') {
        await applyTargetLocation(CALIBRATED_SITE.lat, CALIBRATED_SITE.lon, CALIBRATED_SITE.name);
        return;
      }

      // 3. Free OpenStreetMap Nominatim Geocoding via Backend
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (res.ok && data.success && data.results && data.results.length > 0) {
        const top = data.results[0];
        await applyTargetLocation(top.lat, top.lon, top.display_name);
        if (data.results.length > 1) {
          setSearchSuggestions(data.results.slice(0, 4));
        }
      } else {
        setLocationError('Location not found. Try a street, district, city, or lat, lon coordinates.');
      }
    } catch {
      setLocationError('Could not reach geocoding service. You can pan the map or enter coordinates directly.');
    } finally {
      setIsLocating(false);
    }
  };

  // Unified Analyze CTA: If in Location Search mode, auto-zooms to level before last (19x), captures satellite frame, and runs U-Net
  const handleAnalyzeClick = async () => {
    if (sourceMode === 'upload') {
      onRunDetection();
      return;
    }

    try {
      setIsCapturing(true);
      setLocationError(null);

      // 1. Automatically zoom map to the penultimate level (Zoom 19 of 20)
      if (mapZoom !== MAP_CONFIG.analysisZoom) {
        setMapZoom(MAP_CONFIG.analysisZoom);
      }
      await mapRef.current?.flyToLocationAndZoom(
        location.lat,
        location.lon,
        MAP_CONFIG.analysisZoom
      );

      // 2. Capture the 512x512 Zoom-19 satellite image centered on (lat, lon)
      const params = new URLSearchParams({
        lat: location.lat.toString(),
        lon: location.lon.toString(),
        zoom: MAP_CONFIG.analysisZoom.toString(),
        size: MAP_CONFIG.captureSizePx.toString(),
        provider: tileProvider,
      });

      const res = await fetch(`/api/capture_satellite?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to capture satellite imagery at current coordinates.');
      }

      const blob = await res.blob();
      const capturedFile = new File([blob], 'satellite_location_capture.png', {
        type: 'image/png',
      });
      const url = URL.createObjectURL(blob);

      setFile(capturedFile);
      setPreviewUrl(url);
      setGsd(DEFAULT_PHYSICS.gsd);

      // 3. Immediately run U-Net rooftop detection with the captured satellite image
      await onRunDetection(capturedFile);
    } catch (err) {
      setLocationError(err.message || 'Failed to capture satellite view for analysis.');
    } finally {
      setIsCapturing(false);
    }
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

      {/* Main Two-Column Grid: Symmetrical Equal Heights */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Rooftop Imagery Source (Upload OR Location Search) */}
        <div className="lg:col-span-7 flex flex-col justify-between p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-4">
          {/* Top Bar with Title & Dual Mode Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
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
            <div className="flex-1 flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="leading-none">Top-down aerial screenshot (Google Maps, Apple Maps, or Earth).</span>
                <button
                  type="button"
                  onClick={loadSampleImage}
                  disabled={loadingSample || isDetecting}
                  className="px-3.5 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 inline-flex items-center gap-1.5 font-medium transition-colors shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 -translate-y-px" />
                  <span className="leading-none">{loadingSample ? 'Loading...' : 'Use Sample Image'}</span>
                </button>
              </div>

              {/* Upload Dropzone Container - Symmetrical Flexible Height */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex-1 min-h-[440px] rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors flex flex-col items-center justify-center overflow-hidden ${
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
                  <div className="w-full h-full flex flex-col items-center justify-center space-y-4">
                    <div className="relative w-full flex-1 max-h-[400px] rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 flex items-center justify-center">
                      <img
                        src={previewUrl}
                        alt="Satellite Preview"
                        className="w-full h-full object-contain max-h-[400px] mx-auto"
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

          {/* MODE 2: LOCATION & ADDRESS SEARCH (Interactive Leaflet Satellite Map) */}
          {sourceMode === 'location' && (
            <div className="flex-1 flex flex-col space-y-4">
              {/* Address Search Bar */}
              <div className="relative w-full">
                <form onSubmit={handleAddressSubmit} className="relative w-full">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchAddress}
                    onChange={handleAddressChange}
                    placeholder="Search street address, district, city, or coordinates (e.g. Beylikdüzü, 41.0026, 28.6417)..."
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-500 rounded-xl pl-10 pr-24 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none transition-colors font-sans"
                  />
                  <button
                    type="submit"
                    disabled={isLocating}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {isLocating ? (
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                    ) : (
                      <span className="leading-none">Locate</span>
                    )}
                  </button>
                </form>

                {/* Optional Geocoding Disambiguation Dropdown */}
                {searchSuggestions.length > 1 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-zinc-950 border border-zinc-800 rounded-xl shadow-xl overflow-hidden divide-y divide-zinc-800/80">
                    {searchSuggestions.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => applyTargetLocation(item.lat, item.lon, item.display_name)}
                        className="w-full text-left px-3.5 py-2 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="truncate">{item.display_name}</span>
                        <span className="text-[10px] font-mono text-yellow-400 shrink-0">
                          {item.lat.toFixed(4)}, {item.lon.toFixed(4)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {locationError && (
                <div className="px-3.5 py-2 rounded-xl bg-amber-950/60 border border-amber-800/70 text-amber-200 text-[11px] flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 -translate-y-px" />
                  <span className="leading-none">{locationError}</span>
                </div>
              )}

              {/* Interactive Satellite Map Viewfinder (Leaflet + Google/Esri Satellite) */}
              <div className="flex-1 min-h-[440px] flex flex-col">
                <LeafletMap
                  ref={mapRef}
                  location={location}
                  setLocation={setLocation}
                  mapZoom={mapZoom}
                  setMapZoom={setMapZoom}
                  provider={tileProvider}
                  setProvider={setTileProvider}
                  isCapturing={isCapturing || isDetecting}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Symmetrical Stacking with Fixed Heights & Zero Layout Shift */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-6">
          {/* Geographical Coordinates Section */}
          <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-4">
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

            {/* Calibrated Site Selection (Beylikdüzü) */}
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() =>
                  applyTargetLocation(CALIBRATED_SITE.lat, CALIBRATED_SITE.lon, CALIBRATED_SITE.name)
                }
                className={`text-xs px-3.5 py-1.5 rounded-full border transition-all inline-flex items-center gap-2 cursor-pointer ${
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

            {/* Lat / Lon Inputs */}
            <div className="grid grid-cols-2 gap-4 pt-1">
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

          {/* Electricity Economics & System Parameters Card (Stable 2x2 Grid, Zero Layout Shift) */}
          <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400 shrink-0 -translate-y-px" />
                <span className="leading-none">Electricity & Engineering Economics</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Calibrates net-metering savings, payback schedules, and satellite resolution.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-500 rounded-xl px-3 py-2 text-xs text-white font-mono transition-colors"
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
                  className={`w-full rounded-xl px-3 py-2 text-xs font-mono transition-colors ${
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
          </div>

          {/* Launch CTA Button */}
          <button
            type="button"
            onClick={handleAnalyzeClick}
            disabled={(sourceMode === 'upload' && !file) || isDetecting || isCapturing}
            className={`w-full py-4 px-6 rounded-full font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-all shadow-sm ${
              (sourceMode === 'upload' && !file) || isDetecting || isCapturing
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/60'
                : 'bg-white hover:bg-zinc-200 text-zinc-950 active:scale-[0.99] cursor-pointer'
            }`}
          >
            {isCapturing ? (
              <>
                <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="leading-none">
                  Locking {MAP_CONFIG.analysisZoom}x Zoom & Capturing Satellite Frame...
                </span>
              </>
            ) : isDetecting ? (
              <>
                <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="leading-none">Scanning Rooftops with U-Net Vision...</span>
              </>
            ) : (
              <>
                <span className="leading-none">
                  {sourceMode === 'location'
                    ? `Zoom ${MAP_CONFIG.analysisZoom}x & Analyze Rooftops`
                    : 'Detect Rooftops & Verify Footprint'}
                </span>
                <ArrowRight className="w-4 h-4 shrink-0 -translate-y-px" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

