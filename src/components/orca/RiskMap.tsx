import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { ShipmentRow } from "@/lib/orca/types";
import type { SimRouteGeometry } from "@/lib/orca/simulation/selectors";
import { TIER_CSS_VAR, TIER_LABEL, TIER_MAP_HEX } from "@/lib/orca/risk";
import { pct } from "@/lib/orca/format";

/**
 * Interactive risk map.
 *
 * Marker colour is the ORCA model tier (or neutral UNSCORED when the model has
 * not scored the shipment). Coordinates and route polylines are the synthetic
 * operational overlay — never GPS/AIS telemetry.
 *
 * Client-only: lazy-loaded behind <ClientOnly> because MapLibre touches browser
 * globals at import time.
 */
export default function RiskMap({
  points,
  routes,
  selectedId,
  onSelect,
}: {
  points: ShipmentRow[];
  routes?: SimRouteGeometry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const markers = markersRef.current;

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
    map.on("load", () => {
      map.resize();
      const empty = { type: "FeatureCollection", features: [] } as const;
      map.addSource("orca-routes", { type: "geojson", data: empty as never });
      map.addLayer({
        id: "orca-routes-remaining",
        type: "line",
        source: "orca-routes",
        filter: ["==", ["get", "segment"], "remaining"],
        paint: {
          "line-color": ["get", "color"],
          "line-width": 1.4,
          "line-opacity": 0.5,
          "line-dasharray": [2, 2],
        },
      });
      map.addLayer({
        id: "orca-routes-travelled",
        type: "line",
        source: "orca-routes",
        filter: ["==", ["get", "segment"], "travelled"],
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["case", ["get", "selected"], 3.2, 2],
          "line-opacity": ["case", ["get", "selected"], 1, 0.85],
        },
      });
      readyRef.current = true;
    });
    mapRef.current = map;
    (window as unknown as { __orcaMap?: unknown }).__orcaMap = map;

    return () => {
      markers.forEach((m) => m.remove());
      markers.clear();
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* Route polylines --------------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource("orca-routes") as GeoJSONSource | undefined;
      if (!source) return;
      const features = (routes ?? []).flatMap((route) => {
        const color = TIER_MAP_HEX[route.tier];
        const selected = route.id === selectedId;
        return (
          [
            ["travelled", route.travelled],
            ["remaining", route.remaining],
          ] as const
        )
          .filter(([, coords]) => coords.length >= 2)
          .map(([segment, coords]) => ({
            type: "Feature" as const,
            properties: { id: route.id, segment, color, selected },
            geometry: {
              type: "LineString" as const,
              coordinates: coords.map(([lat, lon]) => [lon, lat]),
            },
          }));
      });
      console.log("[dbg] routes", (routes ?? []).length, "features", features.length);
      source.setData({ type: "FeatureCollection", features } as never);
    };

    console.log("[dbg] effect ready=", readyRef.current, "routes=", (routes ?? []).length);
    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [routes, selectedId]);

  /* Markers ----------------------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();

    for (const point of points) {
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
      seen.add(point.id);
      const color = TIER_CSS_VAR[point.risk_tier];
      const size = 10 + (point.risk_tier === "UNSCORED" ? 2 : point.risk * 16);
      const active = point.id === selectedId;

      const html = `<div style="padding:8px 10px;min-width:190px">
           <div style="font-size:12px;font-weight:600">${point.id}</div>
           <div style="font-size:11px;opacity:.75;margin-top:2px">${point.route}</div>
           <div style="font-size:11px;margin-top:6px">
             <span style="color:${color};font-weight:600">${TIER_LABEL[point.risk_tier]}${
               point.risk_tier === "UNSCORED" ? "" : ` ${pct(point.risk, 1)}`
             }</span>
             <span style="opacity:.7"> · ${point.issue}</span>
           </div>
           <div style="font-size:11px;opacity:.7;margin-top:2px">${point.status}</div>
           <div style="font-size:10px;opacity:.6;margin-top:4px">${point.provenance}</div>
         </div>`;

      const existing = markersRef.current.get(point.id);
      if (existing) {
        existing.setLngLat([point.lon, point.lat]);
        existing.getPopup()?.setHTML(html);
        const el = existing.getElement();
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.background = color;
        el.style.border = active
          ? "2px solid var(--foreground)"
          : "1px solid rgba(255,255,255,.35)";
        el.style.boxShadow = `0 0 0 ${Math.round(size / 2)}px ${color}22, 0 0 ${Math.round(size)}px ${color}55`;
        continue;
      }

      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `Shipment ${point.id}, ${TIER_LABEL[point.risk_tier]} risk`);
      el.style.cssText = `width:${size}px;height:${size}px;border-radius:9999px;background:${color};opacity:.9;cursor:pointer;border:${
        active ? "2px solid var(--foreground)" : "1px solid rgba(255,255,255,.35)"
      };box-shadow:0 0 0 ${Math.round(size / 2)}px ${color}22, 0 0 ${Math.round(size)}px ${color}55;`;
      el.addEventListener("click", () => selectRef.current(point.id));

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([point.lon, point.lat])
        .setPopup(new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(html))
        .addTo(map);
      markersRef.current.set(point.id, marker);
    }

    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
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
