import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Plus, Minus, Layers, Crosshair } from 'lucide-react';
import { MAP_CONFIG, CALIBRATED_SITE } from '../constants/config';

const LeafletMap = forwardRef(function LeafletMap(
  {
    location,
    setLocation,
    mapZoom,
    setMapZoom,
    provider,
    setProvider,
    isCapturing,
  },
  ref
) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const isInternalMoveRef = useRef(false);

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return undefined;

    const initialProvider =
      MAP_CONFIG.tileProviders[provider] || MAP_CONFIG.tileProviders.google;

    const map = L.map(mapContainerRef.current, {
      center: [location.lat, location.lon],
      zoom: mapZoom || MAP_CONFIG.analysisZoom,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
    });

    const tileLayer = L.tileLayer(initialProvider.url, {
      maxZoom: MAP_CONFIG.maxZoom,
      maxNativeZoom: initialProvider.maxNativeZoom,
      crossOrigin: 'anonymous',
    }).addTo(map);

    mapInstanceRef.current = map;
    tileLayerRef.current = tileLayer;

    map.on('moveend', () => {
      const center = map.getCenter();
      const currentZ = map.getZoom();
      isInternalMoveRef.current = true;
      setLocation({
        lat: parseFloat(center.lat.toFixed(6)),
        lon: parseFloat(center.lng.toFixed(6)),
      });
      setMapZoom(currentZ);
      setTimeout(() => {
        isInternalMoveRef.current = false;
      }, 50);
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch satellite tile provider when user toggles Google / Esri
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const selectedProvider =
      MAP_CONFIG.tileProviders[provider] || MAP_CONFIG.tileProviders.google;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    tileLayerRef.current = L.tileLayer(selectedProvider.url, {
      maxZoom: MAP_CONFIG.maxZoom,
      maxNativeZoom: selectedProvider.maxNativeZoom,
      crossOrigin: 'anonymous',
    }).addTo(map);
  }, [provider]);

  // Sync external coordinate changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || isInternalMoveRef.current) return;

    const center = map.getCenter();
    const dist =
      Math.abs(center.lat - location.lat) + Math.abs(center.lng - location.lon);
    if (dist > 0.00005) {
      map.setView([location.lat, location.lon], map.getZoom(), { animate: true });
    }
  }, [location.lat, location.lon]);

  // Expose flyToAnalysisLevel() to parent component
  useImperativeHandle(ref, () => ({
    flyToLocationAndZoom(targetLat, targetLon, targetZoom = MAP_CONFIG.analysisZoom) {
      return new Promise((resolve) => {
        const map = mapInstanceRef.current;
        if (!map) {
          resolve();
          return;
        }

        const currentCenter = map.getCenter();
        const currentZoom = map.getZoom();
        const sameSpot =
          Math.abs(currentCenter.lat - targetLat) < 0.00005 &&
          Math.abs(currentCenter.lng - targetLon) < 0.00005 &&
          currentZoom === targetZoom;

        if (sameSpot) {
          resolve();
          return;
        }

        let resolved = false;
        const done = () => {
          if (!resolved) {
            resolved = true;
            map.off('moveend', done);
            resolve();
          }
        };

        map.on('moveend', done);
        map.flyTo([targetLat, targetLon], targetZoom, {
          animate: true,
          duration: 0.9,
        });

        setTimeout(done, 1100);
      });
    },
    setZoomLevel(newZoom) {
      const map = mapInstanceRef.current;
      if (map) {
        map.setZoom(newZoom);
      }
    },
  }));

  const activeProviderConfig =
    MAP_CONFIG.tileProviders[provider] || MAP_CONFIG.tileProviders.google;

  return (
    <div className="w-full h-full min-h-[440px] rounded-xl border border-[var(--border-subtle)] bg-[#182321] relative overflow-hidden flex flex-col justify-between">
      {/* Interactive Leaflet Map Container */}
      <div
        ref={mapContainerRef}
        className="absolute inset-0 z-0 w-full h-full"
        style={{ background: '#182321' }}
      />

      {/* Center Solar Target Reticle */}
      <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
        <div className="relative flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-[#F5AD46] bg-[#F5AD46]/15 flex items-center justify-center shadow-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-[#F5AD46]" />
          </div>
        </div>
      </div>

      {/* Top HUD Overlay (Graphite HUD over Satellite Imagery) */}
      <div className="relative z-20 p-4 flex items-center justify-between gap-3 pointer-events-none">
        {/* Provider Toggle Pill */}
        <div className="pointer-events-auto inline-flex items-center gap-1 p-1 rounded-full bg-[#182321]/90 border border-[#F6F5EF]/15 backdrop-blur-md">
          {Object.values(MAP_CONFIG.tileProviders).map((p) => {
            const active = provider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                  active
                    ? 'bg-[#F6F5EF] text-[#182321] shadow-xs'
                    : 'text-[#F6F5EF]/75 hover:text-[#F6F5EF]'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-[#F5AD46] shrink-0 -translate-y-px" />
                <span className="leading-none">{p.name}</span>
              </button>
            );
          })}
        </div>

        {/* Live Coordinates Badge */}
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="text-xs font-bold tabular-nums px-3 py-1.5 rounded-full bg-[#182321]/90 border border-[#F6F5EF]/15 text-[#F6F5EF] backdrop-blur-md leading-none">
            {location.lat.toFixed(4)}°N, {location.lon.toFixed(4)}°E
          </span>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1 pointer-events-none" />

      {/* Bottom Controls Overlay */}
      <div className="relative z-20 p-4 pointer-events-none">
        <div className="pointer-events-auto flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#182321]/92 p-3 rounded-xl border border-[#F6F5EF]/15 backdrop-blur-md">
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            {/* Zoom Controls */}
            <div className="flex items-center bg-[#233330] border border-[#F6F5EF]/15 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  const nextZ = Math.min((mapZoom || MAP_CONFIG.analysisZoom) + 1, MAP_CONFIG.maxZoom);
                  mapInstanceRef.current?.setZoom(nextZ);
                }}
                className="px-3 py-1.5 text-[#F6F5EF] hover:bg-[#37645C] transition-colors cursor-pointer"
                title="Zoom In"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <span className="px-3 text-xs font-bold tabular-nums text-[#F6F5EF] border-x border-[#F6F5EF]/15 leading-none py-1.5">
                Zoom {mapZoom}/{MAP_CONFIG.maxZoom}
              </span>
              <button
                type="button"
                onClick={() => {
                  const nextZ = Math.max((mapZoom || MAP_CONFIG.analysisZoom) - 1, MAP_CONFIG.minZoom);
                  mapInstanceRef.current?.setZoom(nextZ);
                }}
                className="px-3 py-1.5 text-[#F6F5EF] hover:bg-[#37645C] transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
            </div>

            <span className="text-xs text-[#F6F5EF]/80 leading-none">
              {mapZoom === MAP_CONFIG.analysisZoom ? (
                <span className="text-[#84C5B9] font-semibold">
                  Locked at Analysis Zoom ({MAP_CONFIG.analysisZoom}x)
                </span>
              ) : (
                <span>Auto-zooms to {MAP_CONFIG.analysisZoom}x on Analyze</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => {
                mapInstanceRef.current?.flyTo(
                  [CALIBRATED_SITE.lat, CALIBRATED_SITE.lon],
                  MAP_CONFIG.analysisZoom,
                  { duration: 0.9 }
                );
              }}
              disabled={isCapturing}
              className="px-3.5 py-1.5 rounded-lg bg-[#233330] hover:bg-[#37645C] text-[#F6F5EF] border border-[#F6F5EF]/15 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Reset to Calibrated Beylikdüzü Site at Zoom 19"
            >
              <Crosshair className="w-3.5 h-3.5 text-[#F5AD46] shrink-0 -translate-y-px" />
              <span className="leading-none">Snap {MAP_CONFIG.analysisZoom}x</span>
            </button>
            <span className="text-[10px] text-[#F6F5EF]/50 hidden md:inline leading-none tabular-nums">
              {activeProviderConfig.attribution}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default LeafletMap;
