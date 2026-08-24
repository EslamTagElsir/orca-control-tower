import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  FlaskConical,
  Gauge,
  Globe2,
  LayoutDashboard,
  Menu,
  RotateCcw,
  Settings as SettingsIcon,
  ScrollText,
  Coins,
  Waves,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useOrca, useOverview } from "@/lib/orca/context";
import { pct } from "@/lib/orca/format";
import { SimulationBar } from "./SimulationBar";

const NAV = [
  { to: "/control-tower", label: "Control Tower", icon: LayoutDashboard },
  { to: "/shipments", label: "Shipments", icon: Boxes },
  { to: "/exceptions", label: "Exceptions", icon: AlertTriangle },
  { to: "/network-map", label: "Network Map", icon: Globe2 },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/simulator", label: "What-If Simulator", icon: FlaskConical },
  { to: "/decision-economics", label: "Decision Economics", icon: Coins },
  { to: "/reports", label: "Reports", icon: ScrollText },
  { to: "/model-monitor", label: "Model Monitor", icon: Gauge },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

function ConnectionPill() {
  const { connection, modelVersion } = useOrca();

  const map = {
    live: {
      cls: "border-success/30 bg-success/10 text-success",
      dot: "bg-success",
      text: `LIVE — ORCA ${modelVersion ?? ""}`.trim(),
    },
    connecting: {
      cls: "border-warn/30 bg-warn/10 text-warn",
      dot: "bg-warn",
      text: "CONNECTING",
    },
    offline: {
      cls: "border-danger/40 bg-danger/10 text-danger",
      dot: "bg-danger",
      text: "OFFLINE FIXTURE DATA",
    },
  } as const;

  const state = map[connection];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide",
        state.cls,
      )}
    >
      <span className="relative flex size-2">
        <span className={cn("absolute inline-flex size-2 rounded-full orca-pulse", state.dot)} />
        <span className={cn("relative inline-flex size-2 rounded-full", state.dot)} />
      </span>
      {state.text}
    </span>
  );
}

function ShipmentSelector() {
  const { selectedShipmentId, setSelectedShipmentId } = useOrca();
  const { data } = useOverview();
  const options = data?.data.priority_exceptions ?? [];
  const value = selectedShipmentId ?? options[0]?.id ?? "";

  return (
    <label className="hidden items-center gap-2 lg:flex">
      <span className="sr-only">Focused shipment</span>
      <select
        value={value}
        onChange={(event) => setSelectedShipmentId(event.target.value)}
        className="orca-num h-8 min-w-[15rem] rounded-md border border-hairline bg-surface px-2.5 text-xs text-foreground outline-none transition-colors hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.length === 0 ? <option value="">No shipments loaded</option> : null}
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.id} · {s.route} · {pct(s.risk, 0)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Clock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="orca-num hidden text-xs text-muted-foreground md:inline">{now ?? "—"}</span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { connection, resetDemo, autoRefresh, setAutoRefresh } = useOrca();
  const { data } = useOverview();

  const exceptionCount = data?.data.kpis.exceptions ?? 0;
  const eventCount = data?.data.events.length ?? 0;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex",
          collapsed ? "w-[68px]" : "w-[232px]",
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
            <Waves className="size-4.5" aria-hidden />
          </span>
          {!collapsed ? (
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold tracking-tight">ORCA</span>
              <span className="block truncate text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">
                CONTROL TOWER
              </span>
            </span>
          ) : null}
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <span
                  className={cn(
                    "absolute left-0 h-5 w-0.5 rounded-r-full bg-primary transition-opacity",
                    active ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden
                />
                <Icon className={cn("size-4 shrink-0", active && "text-primary")} aria-hidden />
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
                {!collapsed && item.to === "/exceptions" && exceptionCount > 0 ? (
                  <span className="orca-num ml-auto rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                    {exceptionCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span
              className={cn(
                "size-2 rounded-full",
                connection === "live"
                  ? "bg-success"
                  : connection === "connecting"
                    ? "bg-warn"
                    : "bg-danger",
              )}
              aria-hidden
            />
            {!collapsed ? (
              <span className="truncate">
                {connection === "live"
                  ? "System healthy"
                  : connection === "connecting"
                    ? "Connecting…"
                    : "Fixture mode"}
              </span>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-hairline bg-surface-sunken/95 px-4 backdrop-blur">
          <button
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Menu className="size-4.5" aria-hidden />
          </button>

          <ConnectionPill />
          <ShipmentSelector />

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={cn(
                "hidden items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors sm:inline-flex",
                autoRefresh
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-hairline bg-surface text-muted-foreground hover:bg-accent",
              )}
            >
              <Activity className="size-3.5" aria-hidden />
              Auto-refresh {autoRefresh ? "on" : "off"}
            </button>
            <button
              onClick={resetDemo}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Reset
            </button>
            <span className="relative grid size-8 place-items-center rounded-md text-muted-foreground">
              <Bell className="size-4.5" aria-hidden />
              {eventCount > 0 ? (
                <span className="orca-num absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-danger-foreground">
                  {eventCount}
                </span>
              ) : null}
            </span>
            <Clock />
            <span className="grid size-8 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
              OP
            </span>
          </div>
        </header>

        <SimulationBar />

        <main className="min-w-0 flex-1">{children}</main>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline px-4 py-2.5 text-[11px] text-muted-foreground">
          <span>ORCA Control Tower · Decision intelligence for resilient supply chains</span>
          <span className="orca-num">
            {connection === "live"
              ? "Connected to ORCA intelligence layer"
              : "Offline fixture data — not ORCA output"}
          </span>
        </footer>
      </div>
    </div>
  );
}
