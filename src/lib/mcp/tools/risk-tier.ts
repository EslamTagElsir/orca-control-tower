import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { RISK_THRESHOLDS, TIER_LABEL, TIER_RANGE, riskTier } from "@/lib/orca/risk";

export default defineTool({
  name: "risk_tier",
  title: "Classify ORCA risk tier",
  description:
    "Classify a predicted late probability (0-1) into the authoritative ORCA risk tier: LOW_RISK <= 0.30, WATCH <= 0.60, HIGH_RISK <= 0.85, CRITICAL > 0.85.",
  inputSchema: {
    probability_late: z
      .number()
      .min(0)
      .max(1)
      .describe("Model probability of late delivery, 0 to 1."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ probability_late }) => {
    const tier = riskTier(probability_late);
    const payload = {
      probability_late,
      tier,
      label: TIER_LABEL[tier],
      range: TIER_RANGE[tier],
      thresholds: RISK_THRESHOLDS,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
