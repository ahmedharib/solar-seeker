import React, { useState, useMemo } from 'react';
import { Check, CheckSquare, Square, Zap, Sparkles, ArrowRight, ArrowLeft, Layers, Info } from 'lucide-react';
import { THEME_COLORS } from '../constants/theme';
import { DEFAULT_PHYSICS } from '../constants/config';

export default function Step2PolygonSelector({
  detectionResult,
  previewUrl,
  selectedPolygonIds,
  setSelectedPolygonIds,
  onCalculateSolar,
  isCalculating,
  onBack,
}) {
  const [hoveredPolygon, setHoveredPolygon] = useState(null);

  const polygons = detectionResult?.polygons || [];
  const imageWidth = detectionResult?.image_width || 800;
  const imageHeight = detectionResult?.image_height || 600;

  // Toggle single polygon selection
  const togglePolygon = (id) => {
    setSelectedPolygonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Bulk actions
  const selectAll = () => {
    setSelectedPolygonIds(new Set(polygons.map((p) => p.id)));
  };

  const clearAll = () => {
    setSelectedPolygonIds(new Set());
  };

  const selectLargest = () => {
    if (polygons.length > 0) {
      setSelectedPolygonIds(new Set([polygons[0].id]));
    }
  };

  // Selected totals
  const summary = useMemo(() => {
    let grossArea = 0;
    let netArea = 0;
    let kwp = 0;
    let count = 0;

    polygons.forEach((p) => {
      if (selectedPolygonIds.has(p.id)) {
        grossArea += p.gross_area_m2 || 0;
        netArea += p.net_usable_area_m2 || 0;
        kwp += p.estimated_kwp || 0;
        count += 1;
      }
    });

    return {
      count,
      grossArea: Math.round(grossArea * 10) / 10,
      netArea: Math.round(netArea * 10) / 10,
      kwp: Math.round(kwp * 10) / 10,
    };
  }, [polygons, selectedPolygonIds]);

  const packingPercent = Math.round(DEFAULT_PHYSICS.packingFactor * 100);

  return (
    <div className="space-y-8">
      {/* Top instruction banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <h2 className="text-base font-semibold text-white tracking-tight">Rooftop Boundary Verification</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono">
              {polygons.length} detected
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Click on the <strong>polygon(s) that belong to your building</strong>. Neighbors and detached carports can be toggled off.
          </p>
        </div>

        {/* Quick bulk action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={selectAll}
            className="text-xs px-3.5 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors font-medium"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={selectLargest}
            className="text-xs px-3.5 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-zinc-800 transition-colors font-medium inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3 h-3 text-amber-400 shrink-0 -translate-y-px" />
            <span className="leading-none">Select Main Roof</span>
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="text-xs px-3.5 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-500 border border-zinc-800 transition-colors font-medium"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Interactive Screenshot & SVG Polygon Layer */}
        <div className="lg:col-span-8 space-y-3">
          <div className="relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 flex items-center justify-center">
            {/* The Uploaded Screenshot */}
            <img
              src={previewUrl}
              alt="Uploaded Satellite View"
              className="w-full h-auto max-h-[580px] object-contain select-none pointer-events-none block"
            />

            {/* SVG Polygon Overlay */}
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox={`0 0 ${imageWidth} ${imageHeight}`}
              preserveAspectRatio="xMidYMid meet"
            >
              {polygons.map((poly) => {
                const isSelected = selectedPolygonIds.has(poly.id);
                const pointsStr = poly.points.map(([x, y]) => `${x},${y}`).join(' ');

                return (
                  <g key={poly.id}>
                    <polygon
                      points={pointsStr}
                      onClick={() => togglePolygon(poly.id)}
                      onMouseEnter={() => setHoveredPolygon(poly.id)}
                      onMouseLeave={() => setHoveredPolygon(null)}
                      className={`roof-polygon ${
                        isSelected ? 'roof-polygon-selected' : 'roof-polygon-unselected'
                      }`}
                    />

                    {/* Centered Roof Badge with Centralized Theme Tokens */}
                    <g
                      transform={`translate(${poly.center[0]}, ${poly.center[1]})`}
                      pointerEvents="none"
                      className="select-none"
                    >
                      <circle
                        r="12"
                        fill={isSelected ? THEME_COLORS.polygons.selected.badgeFill : THEME_COLORS.polygons.unselected.badgeFill}
                        stroke={isSelected ? THEME_COLORS.polygons.selected.badgeStroke : THEME_COLORS.polygons.unselected.badgeStroke}
                        strokeWidth={isSelected ? 2 : 1}
                      />
                      <text
                        y="3.5"
                        textAnchor="middle"
                        fill={isSelected ? THEME_COLORS.polygons.selected.badgeText : THEME_COLORS.polygons.unselected.badgeText}
                        className="text-[11px] font-bold"
                      >
                        {poly.id}
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>

            {/* Floating Hover Tooltip */}
            {hoveredPolygon && (
              <div className="absolute top-4 left-4 bg-zinc-900/95 border border-zinc-700 px-3.5 py-2.5 rounded-xl text-xs space-y-0.5 pointer-events-none shadow-lg">
                {(() => {
                  const p = polygons.find((x) => x.id === hoveredPolygon);
                  if (!p) return null;
                  const isSel = selectedPolygonIds.has(p.id);
                  return (
                    <>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isSel ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                        <span className="font-semibold text-white">Rooftop #{p.id}</span>
                        <span className="text-[10px] text-zinc-400">({isSel ? 'Selected' : 'Click to Select'})</span>
                      </div>
                      <div className="text-[11px] text-zinc-300 font-mono">
                        Gross: <strong className="text-white">{p.gross_area_m2} m²</strong> • Net Usable: <strong className="text-emerald-400">{p.net_usable_area_m2} m²</strong>
                      </div>
                      <div className="text-[11px] text-zinc-300 font-mono">
                        PV Capacity: <strong className="text-amber-400">{p.estimated_kwp} kWp</strong>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Visual Legend Overlay (bottom left) */}
            <div className="absolute bottom-4 left-4 bg-zinc-900/90 border border-zinc-800 px-3.5 py-2 rounded-full flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full border"
                  style={{
                    backgroundColor: THEME_COLORS.polygons.selected.fill,
                    borderColor: THEME_COLORS.polygons.selected.stroke,
                  }}
                />
                <span className="text-zinc-200 text-[11px]">Selected (Target)</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full border border-dashed"
                  style={{
                    backgroundColor: `${THEME_COLORS.polygons.unselected.fill}55`,
                    borderColor: THEME_COLORS.polygons.unselected.stroke,
                  }}
                />
                <span className="text-zinc-400 text-[11px]">Unselected (Neighbor)</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
            <span>Click any polygon or center pin to toggle selection.</span>
            <span>Zoom factor: <strong className="text-zinc-400 font-mono">GSD {detectionResult?.gsd || DEFAULT_PHYSICS.gsd} m/px</strong></span>
          </div>
        </div>

        {/* Right Column: Selection Summary & Rooftop List */}
        <div className="lg:col-span-4 space-y-6 flex flex-col justify-between">
          <div className="space-y-5">
            {/* Live Calculation HUD Card */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Live Selection Sizing</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-medium">
                  {summary.count} of {polygons.length} Selected
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80">
                  <div className="text-[11px] text-zinc-400 font-medium">Gross Footprint</div>
                  <div className="text-xl font-bold text-white mt-0.5">{summary.grossArea} <span className="text-xs font-normal text-zinc-500">m²</span></div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80">
                  <div className="text-[11px] text-zinc-400 font-medium">Net Usable ({packingPercent}%)</div>
                  <div className="text-xl font-bold text-emerald-400 mt-0.5">{summary.netArea} <span className="text-xs font-normal text-zinc-500">m²</span></div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[11px] font-medium text-zinc-400">Recommended Array</span>
                  <div className="text-2xl font-bold text-amber-400">{summary.kwp} <span className="text-sm font-normal text-zinc-400">kWp</span></div>
                </div>
                <div className="text-right text-[11px] text-zinc-400 font-mono">
                  ~{Math.round(summary.netArea / DEFAULT_PHYSICS.sqmPerPanel)} Panels
                  <div className="text-[10px] text-zinc-500">({Math.round(DEFAULT_PHYSICS.panelDensityKwpPerM2 * DEFAULT_PHYSICS.sqmPerPanel * 1000)}W Monocrystalline)</div>
                </div>
              </div>

              <div className="text-[11px] text-zinc-500 flex items-start gap-2 leading-relaxed">
                <Info className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                <span>
                  The <strong>{packingPercent}% packing factor</strong> reserves fire setbacks, maintenance corridors, and pitch margins automatically.
                </span>
              </div>
            </div>

            {/* List of Detected Roofs (Scrollable) */}
            <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Detected Polygons</span>
                </h3>
                <span className="text-xs text-zinc-500 font-mono">
                  {summary.count} enabled
                </span>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {polygons.map((p) => {
                  const isSel = selectedPolygonIds.has(p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => togglePolygon(p.id)}
                      onMouseEnter={() => setHoveredPolygon(p.id)}
                      onMouseLeave={() => setHoveredPolygon(null)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                        isSel
                          ? 'bg-zinc-900 border-zinc-700 text-white'
                          : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                            isSel
                              ? 'bg-emerald-500 border-emerald-500 text-zinc-950'
                              : 'bg-zinc-900 border-zinc-700 text-transparent'
                          }`}
                        >
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                        <span className="font-medium text-zinc-200">Roof #{p.id}</span>
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[11px]">
                        <span className="text-zinc-400">{p.gross_area_m2} m²</span>
                        <span className={isSel ? 'text-amber-400 font-semibold' : 'text-zinc-500'}>
                          ~{p.estimated_kwp} kWp
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Navigation Action Buttons */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={onCalculateSolar}
              disabled={summary.count === 0 || isCalculating}
              className={`w-full py-4 px-6 rounded-full font-semibold text-sm inline-flex items-center justify-center gap-2.5 transition-all shadow-sm ${
                summary.count === 0 || isCalculating
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/60'
                  : 'bg-white hover:bg-zinc-200 text-zinc-950 active:scale-[0.99]'
              }`}
            >
              {isCalculating ? (
                <>
                  <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span className="leading-none">Querying European Commission PVGIS...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-zinc-950 shrink-0 -translate-y-px" />
                  <span className="leading-none">Calculate Solar Potential & ROI ({summary.netArea} m²)</span>
                  <ArrowRight className="w-4 h-4 shrink-0 -translate-y-px" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onBack}
              disabled={isCalculating}
              className="w-full py-2 text-xs font-medium text-zinc-500 hover:text-zinc-300 inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0 -translate-y-px" />
              <span className="leading-none">Back to Screenshot Upload</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
