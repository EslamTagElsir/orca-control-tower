import { defineMcp, type McpDefinitionInput } from "@lovable.dev/mcp-js";
import listShipments from "./tools/list-shipments";
import getShipment from "./tools/get-shipment";
import riskTierTool from "./tools/risk-tier";
import portfolioSummary from "./tools/portfolio-summary";

export default defineMcp({
  name: "orca-command",
  title: "ORCA Command",
  version: "0.1.0",
  instructions:
    "Tools for ORCA Command, a supply-chain delay-intelligence control tower. Use `list_shipments` and `get_shipment` to inspect the real bundled ORCA demo shipment rows and their backend-ready feature maps, `portfolio_summary` to aggregate the portfolio, and `risk_tier` to classify a predicted late probability using ORCA's authoritative thresholds (LOW_RISK <= 0.30, WATCH <= 0.60, HIGH_RISK <= 0.85, CRITICAL > 0.85). These tools return source data only; live model scores come from the ORCA FastAPI backend inside the app.",
  tools: [listShipments, getShipment, riskTierTool, portfolioSummary],
});
