import { useEffect, useRef } from "react";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { OrcaShipment } from "@/lib/orca/types";
import { TIER_CSS_VAR, TIER_LABEL } from "@/lib/orca/risk";
import { pct } from "@/lib/orca/format";

/**
 * Interactive risk heat map over the ORCA `map_points` payload.
 * Coordinates come from the API; nothing is invented here.
 *
 * Client-only: this module is lazy-loaded behind <ClientOnly> because MapLibre
 * touches browser globals at import time.
 */
export default function RiskMap({
  points,
  selectedId,
  onSelect,
}: {
  points: OrcaShipment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          basemap: {
            type: "raster",
            tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors © CARTO",
          },
        },
        layers: [
          { id: "background", type: "background", paint: { "background-color": "#12172a" } },
          { id: "basemap", type: "raster", source: "basemap", paint: { "raster-opacity": 0.85 } },
        ],
      },
      center: [22, 8],
      zoom: 1.35,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.scrollZoom.disable();
    map.on("load", () => map.resize());
    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const point of points) {
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
      const color = TIER_CSS_VAR[point.risk_tier];
      const size = 10 + point.risk * 16;
      const active = point.id === selectedId;

      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `Shipment ${point.id}, ${TIER_LABEL[point.risk_tier]} risk`);
      el.style.cssText = `width:${size}px;height:${size}px;border-radius:9999px;background:${color};opacity:.9;cursor:pointer;border:${
        active ? "2px solid var(--foreground)" : "1px solid rgba(255,255,255,.35)"
      };box-shadow:0 0 0 ${Math.round(size / 2)}px ${color}22, 0 0 ${Math.round(size)}px ${color}55;`;

      const popup = new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(
        `<div style="padding:8px 10px;min-width:180px">
           <div style="font-size:12px;font-weight:600">${point.id}</div>
           <div style="font-size:11px;opacity:.75;margin-top:2px">${point.route}</div>
           <div style="font-size:11px;margin-top:6px">
             <span style="color:${color};font-weight:600">${TIER_LABEL[point.risk_tier]} ${pct(point.risk, 1)}</span>
             <span style="opacity:.7"> · ${point.issue}</span>
           </div>
           <div style="font-size:10px;opacity:.6;margin-top:4px">${point.provenance}</div>
         </div>`,
      );

      el.addEventListener("click", () => selectRef.current(point.id));

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([point.lon, point.lat])
        .setPopup(popup)
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [points, selectedId]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-hairline bg-surface/90 px-3 py-2 backdrop-blur">
        <p className="orca-label mb-1.5 text-[10px]">Model risk tier</p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Low</span>
          <span
            className="h-1.5 w-28 rounded-full"
            style={{
              background: `linear-gradient(to right, ${TIER_CSS_VAR.LOW_RISK}, ${TIER_CSS_VAR.WATCH}, ${TIER_CSS_VAR.HIGH_RISK}, ${TIER_CSS_VAR.CRITICAL})`,
            }}
            aria-hidden
          />
          <span className="text-[10px] text-muted-foreground">Critical</span>
        </div>
      </div>
    </div>
  );
}
