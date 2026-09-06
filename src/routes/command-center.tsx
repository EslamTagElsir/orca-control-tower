import { createFileRoute } from "@tanstack/react-router";
import { CommandCenter } from "@/components/orca/CommandCenter";

const TITLE = "ORCA Command Center — Performance & Decision Intelligence";
const DESCRIPTION = "Unified supply-chain performance, forward risk and decision intelligence.";

export const Route = createFileRoute("/command-center")({
  head: () => ({ meta: [
    { title: TITLE },
    { name: "description", content: DESCRIPTION },
    { property: "og:title", content: TITLE },
    { property: "og:description", content: DESCRIPTION },
  ] }),
  component: CommandCenter,
});
