import { createFileRoute, redirect } from "@tanstack/react-router";

const TITLE = "ORCA Command Center — Performance & Decision Intelligence";
const DESCRIPTION = "Unified supply-chain performance, forward risk and decision intelligence.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/command-center" });
  },
});
