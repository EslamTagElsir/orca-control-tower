import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sourceRow } from "@/lib/orca/source-data";

export default defineTool({
  name: "get_shipment",
  title: "Get ORCA shipment",
  description:
    "Return one ORCA shipment by ID, including its verbatim source columns and the backend-ready feature map used by the /predict endpoint.",
  inputSchema: {
    id: z.string().trim().min(1).describe("Shipment ID from list_shipments."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ id }) => {
    const row = sourceRow(id);
    if (!row) throw new ToolError(`No ORCA shipment found with ID "${id}".`);

    const payload = {
      id: row.id,
      country: row.country,
      vendor: row.vendor,
      manufacturing_site: row.manufacturing_site,
      shipment_mode: row.shipment_mode,
      fulfill_via: row.fulfill_via,
      line_item_value: row.line_item_value,
      scheduled_transit_days: row.scheduled_transit_days,
      sub_classification: row.sub_classification,
      product_group: row.product_group,
      t_pred: row.t_pred,
      features: row.features,
      provenance: "REAL DATA (bundled ORCA demo export) — no model score included",
    };

    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
