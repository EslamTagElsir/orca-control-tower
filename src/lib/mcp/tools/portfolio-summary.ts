import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sourceRows } from "@/lib/orca/source-data";

export default defineTool({
  name: "portfolio_summary",
  title: "Summarize ORCA portfolio",
  description:
    "Aggregate the bundled ORCA demo shipment portfolio by country, shipment mode, vendor or product group (counts and total line-item value). No model scores involved.",
  inputSchema: {
    group_by: z
      .enum(["country", "shipment_mode", "vendor", "product_group"])
      .default("country")
      .describe("Dimension to aggregate on."),
    top: z.number().int().min(1).max(50).default(10).describe("How many top groups to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ group_by, top }) => {
    const rows = sourceRows();
    const acc = new Map<
      string,
      { key: string; shipments: number; total_line_item_value: number }
    >();

    for (const row of rows) {
      const key = String(row[group_by] ?? "UNKNOWN") || "UNKNOWN";
      const entry = acc.get(key) ?? { key, shipments: 0, total_line_item_value: 0 };
      entry.shipments += 1;
      entry.total_line_item_value += row.line_item_value || 0;
      acc.set(key, entry);
    }

    const groups = [...acc.values()]
      .sort(
        (a, b) => b.shipments - a.shipments || b.total_line_item_value - a.total_line_item_value,
      )
      .slice(0, top)
      .map((g) => ({
        ...g,
        total_line_item_value: Math.round(g.total_line_item_value * 100) / 100,
      }));

    const payload = {
      group_by,
      total_shipments: rows.length,
      groups,
      provenance: "REAL DATA (bundled ORCA demo export)",
    };

    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
