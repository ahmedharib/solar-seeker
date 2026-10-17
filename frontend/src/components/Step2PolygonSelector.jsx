import React, { useState, useMemo } from 'react';
import { Check, Zap, Sparkles, ArrowRight, ArrowLeft, Layers, Info } from 'lucide-react';
import { getThemeColors } from '../constants/theme';
import { DEFAULT_PHYSICS } from '../constants/config';

export default function Step2PolygonSelector({
  detectionResult,
  previewUrl,
  selectedPolygonIds,
  setSelectedPolygonIds,
  onCalculateSolar,
  isCalculating,
  onBack,
  isDark = false,
}) {
  const [hoveredPolygon, setHoveredPolygon] = useState(null);
  const themeColors = getThemeColors(isDark);

  const polygons = useMemo(() => detectionResult?.polygons || [], [detectionResult]);
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
    <div className="space-y-6">
      {/* Top instruction banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl ss-card">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#37645C]" />
            <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
              Rooftop Boundary Verification
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full ss-badge-field font-bold tabular-nums">
              {polygons.length} detected
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Click on the <strong>polygon(s) that belong to your building</strong>. Neighbors and detached structures can be toggled off.
          </p>
        </div>

        {/* Quick bulk action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={selectAll}
            className="text-xs px-3.5 py-1.5 rounded-full ss-btn-secondary font-semibold cursor-pointer"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={selectLargest}
            className="text-xs px-3.5 py-1.5 rounded-full bg-[#F5AD46] hover:bg-[#E59A2E] text-[#182321] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#182321] shrink-0 -translate-y-px" />
            <span className="leading-none">Select Main Roof</span>
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="text-xs px-3.5 py-1.5 rounded-full ss-btn-secondary text-[var(--text-muted)] font-semibold cursor-pointer"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Interactive Screenshot & SVG Polygon Layer */}
        <div className="lg:col-span-7 flex flex-col justify-between p-6 rounded-2xl ss-card space-y-4">
          <div className="relative flex-1 min-h-[460px] rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[#182321] flex items-center justify-center">
            {/* The Uploaded Screenshot */}
            <img
              src={previewUrl}
              alt="Uploaded Satellite View"
              className="w-full h-auto max-h-[560px] object-contain select-none pointer-events-none block"
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
                      className={`roof-polygon cursor-pointer ${
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
                        fill={
                          isSelected
                            ? themeColors.polygons.selected.badgeFill
                            : themeColors.polygons.unselected.badgeFill
                        }
                        stroke={
                          isSelected
                            ? themeColors.polygons.selected.badgeStroke
                            : themeColors.polygons.unselected.badgeStroke
                        }
                        strokeWidth={isSelected ? 2 : 1.5}
                      />
                      <text
                        y="3.5"
                        textAnchor="middle"
                        fill={
                          isSelected
                            ? themeColors.polygons.selected.badgeText
                            : themeColors.polygons.unselected.badgeText
                        }
                        className="text-[11px] font-bold tabular-nums"
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
              <div className="absolute top-4 left-4 bg-[#182321]/95 border border-[#F6F5EF]/20 px-3.5 py-2.5 rounded-xl text-xs space-y-1 pointer-events-none shadow-lg text-[#F6F5EF]">
                {(() => {
                  const p = polygons.find((x) => x.id === hoveredPolygon);
                  if (!p) return null;
                  const isSel = selectedPolygonIds.has(p.id);
                  return (
                    <>
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isSel ? 'bg-[#599E92]' : 'bg-[#F5AD46]'
                          }`}
                        />
                        <span className="font-bold text-[#F6F5EF]">Rooftop #{p.id}</span>
                        <span className="text-[10px] text-[#F6F5EF]/70">
                          ({isSel ? 'Selected' : 'Click to Select'})
                        </span>
                      </div>
                      <div className="text-[11px] text-[#F6F5EF]/80 tabular-nums">
                        Gross: <strong className="text-[#F6F5EF]">{p.gross_area_m2} m²</strong> · Net Usable:{' '}
                        <strong className="text-[#84C5B9]">{p.net_usable_area_m2} m²</strong>
                      </div>
                      <div className="text-[11px] text-[#F6F5EF]/80 tabular-nums">
                        PV Capacity: <strong className="text-[#F5AD46]">{p.estimated_kwp} kWp</strong>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Visual Legend Overlay (bottom left) */}
            <div className="absolute bottom-4 left-4 bg-[#182321]/90 border border-[#F6F5EF]/15 px-3.5 py-2 rounded-full flex items-center gap-4 text-xs backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full border"
                  style={{
                    backgroundColor: themeColors.polygons.selected.fill,
                    borderColor: themeColors.polygons.selected.stroke,
                  }}
                />
                <span className="text-[#F6F5EF] text-[11px] font-medium">Selected (Field)</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full border border-dashed"
                  style={{
                    backgroundColor: `${themeColors.polygons.unselected.fill}66`,
                    borderColor: themeColors.polygons.unselected.stroke,
                  }}
                />
                <span className="text-[#F6F5EF]/75 text-[11px] font-medium">Unselected (Solar)</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] px-1">
            <span>Click any polygon or center pin to toggle selection.</span>
            <span className="tabular-nums">
              Zoom factor:{' '}
              <strong className="text-[var(--text-secondary)]">
                GSD {detectionResult?.gsd || DEFAULT_PHYSICS.gsd} m/px
              </strong>
            </span>
          </div>
        </div>

        {/* Right Column: Selection Summary & Rooftop List */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-6">
          <div className="space-y-6">
            {/* Live Calculation HUD Card */}
            <div className="p-6 rounded-2xl ss-card space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Live Selection Sizing
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full ss-badge-field font-bold tabular-nums">
                  {summary.count} of {polygons.length} Selected
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-1">
                <div className="p-4 rounded-xl ss-well">
                  <div className="text-[11px] text-[var(--text-secondary)] font-semibold">
                    Gross Footprint
                  </div>
                  <div className="text-2xl font-bold text-[var(--text-primary)] tabular-nums mt-1">
                    {summary.grossArea}{' '}
                    <span className="text-xs font-medium text-[var(--text-muted)]">m²</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl ss-well">
                  <div className="text-[11px] text-[var(--text-secondary)] font-semibold">
                    Net Usable ({packingPercent}%)
                  </div>
                  <div className="text-2xl font-bold text-[#37645C] dark:text-[#84C5B9] tabular-nums mt-1">
                    {summary.netArea}{' '}
                    <span className="text-xs font-medium text-[var(--text-muted)]">m²</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#182321] text-[#F6F5EF] border border-[#182321] dark:border-[#3E5651] flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[11px] font-medium text-[#F6F5EF]/70">
                    Recommended Array
                  </span>
                  <div className="text-2xl font-bold text-[#F6F5EF] tabular-nums">
                    {summary.kwp}{' '}
                    <span className="text-sm font-bold text-[#F5AD46]">kWp</span>
                  </div>
                </div>
                <div className="text-right text-[11px] text-[#F6F5EF]/80 tabular-nums">
                  <span className="font-bold text-[#F6F5EF]">
                    ~{Math.round(summary.netArea / DEFAULT_PHYSICS.sqmPerPanel)} Panels
                  </span>
                  <div className="text-[10px] text-[#F6F5EF]/60">
                    ({Math.round(DEFAULT_PHYSICS.panelDensityKwpPerM2 * DEFAULT_PHYSICS.sqmPerPanel * 1000)}W Mono)
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-[var(--text-muted)] flex items-start gap-2 leading-relaxed">
                <Info className="w-3.5 h-3.5 text-[#37645C] dark:text-[#F5AD46] shrink-0 mt-0.5" />
                <span>
                  The <strong>{packingPercent}% packing factor</strong> reserves fire setbacks, maintenance corridors, and pitch margins automatically.
                </span>
              </div>
            </div>

            {/* List of Detected Roofs */}
            <div className="p-6 rounded-2xl ss-card space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-[#37645C] dark:text-[#F5AD46]" />
                  <span>Detected Polygons</span>
                </h3>
                <span className="text-xs text-[var(--text-muted)] font-semibold tabular-nums">
                  {summary.count} enabled
                </span>
              </div>

              <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
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
                          ? 'bg-[var(--brand-field-subtle)] border-[var(--brand-field-border)] text-[var(--text-primary)] font-semibold'
                          : 'ss-well text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                            isSel
                              ? 'bg-[#37645C] border-[#37645C] text-[#F6F5EF]'
                              : 'bg-[var(--bg-surface)] border-[var(--border-strong)] text-transparent'
                          }`}
                        >
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                        <span className="font-bold text-[var(--text-primary)]">
                          Roof #{p.id}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 tabular-nums text-[11px]">
                        <span className="text-[var(--text-secondary)]">{p.gross_area_m2} m²</span>
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold ${
                            isSel
                              ? 'bg-[#F5AD46] text-[#182321]'
                              : 'text-[var(--text-muted)]'
                          }`}
                        >
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
              className={`w-full py-4 px-6 rounded-full font-bold text-sm inline-flex items-center justify-center gap-2.5 transition-all shadow-sm ${
                summary.count === 0 || isCalculating
                  ? 'ss-well text-[var(--text-muted)] cursor-not-allowed opacity-60'
                  : 'ss-btn-primary active:scale-[0.99] cursor-pointer'
              }`}
            >
              {isCalculating ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                  <span className="leading-none">Querying European Commission PVGIS...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-[#F5AD46] shrink-0 -translate-y-px" />
                  <span className="leading-none tabular-nums">
                    Calculate Solar Potential & ROI ({summary.netArea} m²)
                  </span>
                  <ArrowRight className="w-4 h-4 shrink-0 -translate-y-px" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onBack}
              disabled={isCalculating}
              className="w-full py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
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
