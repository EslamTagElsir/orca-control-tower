# ORCA Control Tower — Enterprise Frontend Rebuild

## What I found in your ZIP

The intelligence layer stays exactly as it is. I inspected it and will build against these contracts:

| Endpoint | Returns |
|---|---|
| `GET /health` | `model_version`, `registry_role`, `evidence_labels` |
| `POST /predict` | calibrated `probability_late`, `risk_tier`, `severity_p50` + 90% interval, thresholds, contract version |
| `POST /explain` | top predictive drivers, SHAP contributions, exploratory causal candidates |
| `POST /recommend` | recommendation, decision reasons, impact type, robustness, approval flag |
| `GET /demo/overview` | KPIs, `priority_exceptions`, `map_points` (lat/lon), `risk_distribution` (low/watch/high/critical), `top_destinations`, `events`, `evidence` block, `model_version` |
| `GET /demo/shipments/{id}` | route, status, progress, vendor, mode, line item value, `risk_drivers` (SHAP), `timeline` stages |
| `GET /demo/scenarios` | 4 scenarios: steady state, vendor reliability, lane disruption, transport switch |
| `POST /demo/scenario` | baseline vs result risk/severity, `risk_delta_pp`, economics, `feature_audit`, disclaimer |

Backend risk tiers are `LOW_RISK ≤0.30 · WATCH ≤0.60 · HIGH_RISK ≤0.85 · CRITICAL`. Every payload already carries provenance strings (`REAL HOLDOUT ANCHOR`, `MODEL OUTPUT`, `SYNTHETIC DEMO OVERLAY`, `SIMULATED SCENARIO`) — the UI will surface those verbatim rather than inventing its own labels. No Python is rewritten, no contract is changed.

## Framework constraint — please read

This Lovable project cannot run Next.js. Lovable builds and hosts React on TanStack Start (Vite), and there is no supported path to swap the framework inside this workspace. So the choice is not "Next.js vs TanStack Start" — it is "build here on TanStack Start" or "don't build here".

My recommendation: build it here, but mirror your Next.js architecture exactly so the work ports back to your repo with minimal friction. Everything you asked for architecturally is preserved; only the framework primitive changes:

| Your Next.js app | What I build here | Porting effort |
|---|---|---|
| `app/api/orca/[...path]/route.ts` proxy | `src/routes/api/orca/$.ts` server route, same proxy behaviour, same `/api/orca/*` public path | Rewrite one ~35-line file |
| `ORCA_API_INTERNAL_URL` env var | Same env var name, read server-side inside the handler | None |
| React 19 + TS components | React 19 + TS components, framework-agnostic | Copy as-is |
| Centralised service layer | `src/lib/orca/*` — identical, no framework imports | Copy as-is |
| `app/globals.css` tokens | `src/styles.css` tokens | Copy values |

Components, types, adapters, fixtures, charts and the whole service layer are plain React/TypeScript with zero framework coupling — that's the great majority of this work. Only the proxy route and route-file wrappers are framework-specific. If you'd rather I not build here at all and instead hand you the code for your own Next.js repo, say so and I'll change course.

## Connection model

Same chain you specified, with the proxy on this side:

```text
Browser → /api/orca/*  (server proxy, this app)
        → FastAPI (ORCA_API_INTERNAL_URL, default http://localhost:8000)
        → ORCA intelligence layer
```

Components never see a FastAPI URL. They call `src/lib/orca/client.ts`, which only ever hits the relative `/api/orca/*` path. Moving the backend to a tunnelled HTTPS endpoint later is a single env-var change with no UI edits.

Because the proxy is server-side and same-origin, **no CORS is needed for the normal path**. I'll still include the minimal, env-configurable CORS snippet for FastAPI (`CORSMiddleware` with `allow_origins` read from an `ORCA_ALLOWED_ORIGINS` env var, no wildcard) so direct browser calls work if you ever want them — that is the only backend change proposed, and nothing in the model, registry, calibration, conformal, SHAP, decision engine or API contracts is touched.

A connection controller polls `/api/orca/health`. Three states, always visible in the top bar:

- **LIVE — ORCA v{model_version}** (green): real API
- **CONNECTING** (amber): retrying with backoff
- **OFFLINE FIXTURE DATA — NOT ORCA OUTPUT** (red): backend unreachable — falls back to fixtures shaped exactly like the real payloads. Persistent full-width banner, red-tinted chrome, and a `FIXTURE` badge on every panel. Auto-reconnects and swaps back to live data as soon as `/health` answers.

Fixtures are labelled at panel level, not just globally, so no fixture number can ever be mistaken for ORCA output.


## Phase 1 — Flagship Control Tower (this pass)

Everything below is real, working UI wired to `/demo/overview` and `/demo/shipments/{id}`:

- **App shell** — collapsible sidebar (ORCA / CONTROL TOWER brand, 10 nav items, icons, active + hover states), top bar with menu toggle, connection pill, shipment selector fed by `priority_exceptions`, New Scenario, Reset Demo, notifications from the event stream, clock, avatar.
- **KPI row** — Active Shipments, Exceptions (≥0.30), Critical (≥0.45), Intervention Candidates, Modeled On-Time Likelihood, Average Risk. Each mapped 1:1 to a real `kpis` field with its own evidence badge. No invented "vs yesterday" deltas — the API has no prior period, so the sublabel states the definition instead.
- **Risk Heat Map** — real interactive map (MapLibre GL + free raster basemap, dark styled) plotting `map_points` by lat/lon, radius/colour by risk tier, zoom, pan, tooltips, click-to-select shipment.
- **Exception Summary** — donut over the real issue categories produced by `_issue_for` (Network disruption, Customs review, ETA variance, Origin readiness, Reliability watch, Normal operations) with count + percentage legend.
- **Live Event Stream** — real `events` array (timestamp, type, shipment, detail), severity derived from event type and shipment risk, click-through to the shipment.
- **Priority Exceptions table** — `priority_exceptions` with Shipment, Origin → Destination, Issue, Risk, Predicted Delay (severity p50), Decision, Exposure. Sortable, searchable, tier filter, row selection, drill-down.
- **Top Risky Lanes** — horizontal bars from `top_destinations` (mean risk + shipment count).
- **Node Congestion** — destination-level pressure panel derived from portfolio aggregation (mean risk, exception count, direction), labelled as derived from demo overlay.
- **Shipment Tracking Timeline** — real `timeline` stages for the selected shipment, active stage emphasised.
- **Risk Score Trend** — sparkline over the selected shipment's risk against the 90% severity band; where the API exposes no time series, the panel shows the current risk plus interval and says so, rather than fabricating history.
- **Risk Distribution** — donut over the real `risk_distribution` tiers using backend thresholds.
- Full loading skeletons, error + retry, and empty states on every panel. Desktop-first, tablet/laptop reflow.

## Phase 2 — Routes and shell (this pass)

All ten routes created and reachable with the same shell and design system, each with real (initially lighter) content and its own head metadata: `/control-tower` (index redirects here), `/shipments`, `/exceptions`, `/network-map`, `/analytics`, `/simulator`, `/decision-economics`, `/reports`, `/model-monitor`, `/settings`.

## Phases 3–5 (subsequent passes, after Control Tower is stable)

3. Deep integration — Shipment Intelligence with SHAP drivers and recommendations, What-If Simulator on `/demo/scenarios` + `/demo/scenario` (baseline vs scenario, delta, feature audit, economics sliders), Decision Economics on `/recommend`, Exceptions filtering, full-page Network Map.
4. Analytics, Reports, Model Monitor (only `/health` fields: model version, registry role, evidence labels), Settings.
5. Polish — accessibility, contrast, focus states, chart refinement, performance, reconnect behaviour.

## Design system

Midnight navy background, layered blue-gray surfaces, hairline borders, compact enterprise type scale. Semantic tokens only in `src/styles.css` (oklch): background, surface, elevated surface, border, text/muted, primary blue, success green, warn amber, danger red, critical, plus a distinct purple reserved for model-derived values. Restrained motion — transitions only to communicate state change.

## Technical notes

- TanStack Start + TanStack Query. One centralised `src/lib/orca/` service layer: typed client, response adapters, zod-checked shapes, fixture module, connection controller. No fetch calls inside components.
- Query keys per endpoint with sensible stale times; auto-refresh interval configurable in Settings; no duplicate calls across panels.
- Charts: lightweight SVG/Recharts; map lazy-loaded client-side only (SSR-safe dynamic import).
- Provenance is a first-class component (`EvidenceBadge`) reading the API's own provenance strings.

## What you need to do

Add CORS to `src/delay_intelligence/api/main.py` so the browser can call your local API — I'll paste the exact snippet when the build lands.
