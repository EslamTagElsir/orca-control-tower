import { Activity, AlertOctagon, Clock3, Cpu, MapPin, Scale } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { EventType, OrcaEvent, OrcaShipment } from "@/lib/orca/types";
import { riskTier, TIER_CLASSES, TIER_LABEL } from "@/lib/orca/risk";
import { PanelEmpty } from "./primitives";

const ICONS: Record<EventType, LucideIcon> = {
  POSITION: MapPin,
  ETA: Clock3,
  EXCEPTION: AlertOctagon,
  MODEL: Cpu,
  DECISION: Scale,
};

const TYPE_TONE: Record<EventType, string> = {
  POSITION: "text-chart-6",
  ETA: "text-warn",
  EXCEPTION: "text-danger",
  MODEL: "text-model",
  DECISION: "text-primary",
};

/** Presentation-only extension: synthetic live-operations events carry a label. */
export type StreamEvent = OrcaEvent & { ops_label?: string };

export function EventStream({
  events,
  shipments,
  onSelect,
}: {
  events: StreamEvent[];
  shipments: OrcaShipment[];
  onSelect: (id: string) => void;
}) {

  if (events.length === 0) return <PanelEmpty message="No events in the current feed." />;

  const riskById = new Map(shipments.map((s) => [s.id, s.risk]));

  return (
    <ul className="max-h-[320px] space-y-0.5 overflow-y-auto pr-1">
      {events.map((event, index) => {
        const Icon = ICONS[event.event_type] ?? Activity;
        const risk = riskById.get(event.shipment_id);
        const tier = risk !== undefined ? riskTier(risk) : null;
        return (
          <li key={`${event.timestamp}-${event.shipment_id}-${index}`}>
            <button
              onClick={() => onSelect(event.shipment_id)}
              className="group flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-raised"
            >
              <Icon
                className={cn("mt-0.5 size-3.5 shrink-0", TYPE_TONE[event.event_type])}
                aria-hidden
              />
              <span className="orca-num shrink-0 text-[11px] text-muted-foreground">
                {event.timestamp}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-foreground/90">{event.detail}</span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span className="orca-num text-[10px] text-muted-foreground">
                    {event.ops_label ?? event.event_type} · {event.shipment_id}
                  </span>

                  <span className="truncate text-[10px] text-muted-foreground/60">
                    {event.provenance}
                  </span>
                </span>
              </span>
              {tier ? (
                <span
                  className={cn(
                    "shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold",
                    TIER_CLASSES[tier],
                  )}
                >
                  {TIER_LABEL[tier]}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
