import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

import type { ShipmentRow } from "@/lib/orca/types";
import type { SimRouteGeometry } from "@/lib/orca/simulation/selectors";
import { TIER_CSS_VAR, TIER_LABEL, TIER_MAP_HEX } from "@/lib/orca/risk";
import { pct } from "@/lib/orca/format";

// Bundlers cannot reliably infer MapLibre's worker path from import.meta.url.
// Vite's worker pipeline emits a self-contained, hashed same-origin worker.
maplibregl.setWorkerUrl(workerUrl);

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
  const svgRef = useRef<SVGSVGElement | null>(null);
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
      readyRef.current = true;
    });

    mapRef.current = map;

    return () => {
      markers.forEach((m) => m.remove());
      markers.clear();
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* Route polylines — SVG overlay above the MapLibre canvas ------------ */
  const routesRef = useRef(routes);
  routesRef.current = routes;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  useEffect(() => {
    const map = mapRef.current;
    const svg = svgRef.current;
    if (!map || !svg) return;

    const SVG_NS = "http://www.w3.org/2000/svg";
    let frame: number | null = null;

    /** Project one lat/lon polyline to screen-space SVG path data. */
    const toPathData = (coords: readonly (readonly [number, number])[], width: number) => {
      const parts: string[] = [];
      let prevX: number | null = null;
      for (const [lat, lon] of coords) {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const p = map.project([lon, lat]);
        // Break the path when the projection wraps across the antimeridian.
        const wrapped = prevX !== null && Math.abs(p.x - prevX) > width * 0.6;
        parts.push(
          `${parts.length === 0 || wrapped ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
        );
        prevX = p.x;
      }
      return parts.length >= 2 ? parts.join(" ") : "";
    };

    const draw = () => {
      frame = null;
      const rect = map.getCanvas().getBoundingClientRect();
      const width = rect.width || 1;
      const height = rect.height || 1;
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

      const selected = selectedRef.current;
      const hasFocus = Boolean(
        selected && (routesRef.current ?? []).some((r) => r.id === selected),
      );
      const frag = document.createDocumentFragment();

      for (const route of routesRef.current ?? []) {
        const color = TIER_MAP_HEX[route.tier];
        const isSelected = route.id === selected;
        const dim = hasFocus && !isSelected;

        for (const segment of ["remaining", "travelled"] as const) {
          const coords = segment === "travelled" ? route.travelled : route.remaining;
          const d = toPathData(coords, width);
          if (!d) continue;
          const path = document.createElementNS(SVG_NS, "path");
          path.setAttribute("d", d);
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", color);
          path.setAttribute("stroke-linecap", "round");
          path.setAttribute("stroke-linejoin", "round");
          if (segment === "travelled") {
            path.setAttribute("stroke-width", isSelected ? "3.4" : "1.9");
            path.setAttribute("opacity", dim ? "0.22" : isSelected ? "1" : "0.85");
          } else {
            path.setAttribute("stroke-width", isSelected ? "2" : "1.3");
            path.setAttribute("stroke-dasharray", "5 5");
            path.setAttribute("opacity", dim ? "0.12" : isSelected ? "0.7" : "0.42");
          }
          frag.appendChild(path);
        }
      }

      svg.replaceChildren(frag);
    };

    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(draw);
    };

    map.on("move", schedule);
    map.on("zoom", schedule);
    map.on("resize", schedule);
    map.on("load", schedule);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (observer && containerRef.current) observer.observe(containerRef.current);
    const interval = setInterval(schedule, 200);
    schedule();

    return () => {
      map.off("move", schedule);
      map.off("zoom", schedule);
      map.off("resize", schedule);
      map.off("load", schedule);
      observer?.disconnect();
      clearInterval(interval);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  /* Markers ----------------------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();
    const hasFocus = selectedId !== null && points.some((p) => p.id === selectedId);

    for (const point of points) {
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
      seen.add(point.id);
      const color = TIER_CSS_VAR[point.risk_tier];
      const size = 10 + (point.risk_tier === "UNSCORED" ? 2 : point.risk * 16);
      const active = point.id === selectedId;
      const opacity = hasFocus && !active ? "0.35" : "0.9";

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
        el.style.opacity = opacity;
        continue;
      }

      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `Shipment ${point.id}, ${TIER_LABEL[point.risk_tier]} risk`);
      el.style.cssText = `width:${size}px;height:${size}px;border-radius:9999px;background:${color};opacity:${opacity};cursor:pointer;border:${
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
      <svg
        ref={svgRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
        preserveAspectRatio="none"
      />
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
