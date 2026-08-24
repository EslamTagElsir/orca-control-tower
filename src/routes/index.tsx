import { createFileRoute, redirect } from "@tanstack/react-router";

const TITLE = "ORCA Control Tower — Supply Chain Delay Intelligence";
const DESCRIPTION =
  "Enterprise control tower for the ORCA delay-intelligence model: calibrated shipment risk, exception triage and intervention economics.";

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
    throw redirect({ to: "/control-tower" });
  },
});
