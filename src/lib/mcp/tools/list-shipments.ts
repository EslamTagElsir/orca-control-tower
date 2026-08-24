import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sourceRows } from "@/lib/orca/source-data";

export default defineTool({
  name: "list_shipments",
  title: "List ORCA shipments",
  description:
    "List the real ORCA demo shipment rows bundled with the app, with optional filters on destination country, shipment mode or vendor.",
  inputSchema: {
    country: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Filter by destination country (case-insensitive substring)."),
    shipment_mode: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Filter by shipment mode, e.g. Air, Ocean, Truck."),
    vendor: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Filter by vendor (case-insensitive substring)."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(25)
      .describe("Maximum number of shipments to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ country, shipment_mode, vendor, limit }) => {
    const has = (value: string, needle?: string) =>
      !needle || value.toLowerCase().includes(needle.toLowerCase());

    const rows = sourceRows()
      .filter(
        (r) =>
          has(r.country, country) && has(r.shipment_mode, shipment_mode) && has(r.vendor, vendor),
      )
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        country: r.country,
        vendor: r.vendor,
        shipment_mode: r.shipment_mode,
        fulfill_via: r.fulfill_via,
        line_item_value: r.line_item_value,
        scheduled_transit_days: r.scheduled_transit_days,
        product_group: r.product_group,
      }));

    return {
      content: [
        { type: "text", text: JSON.stringify({ count: rows.length, shipments: rows }, null, 2) },
      ],
      structuredContent: {
        count: rows.length,
        shipments: rows,
        provenance: "REAL DATA (bundled ORCA demo export)",
      },
    };
  },
});
