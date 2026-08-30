from pathlib import Path

p = Path("src/components/orca/SimShipmentDetail.tsx")
s = p.read_text()

if 'import { Link } from "@tanstack/react-router";' not in s:
    s = s.replace(
        'import { useMutation } from "@tanstack/react-query";\n',
        'import { useMutation } from "@tanstack/react-query";\nimport { Link } from "@tanstack/react-router";\n',
        1,
    )

old = '''  const model = shipment.model;
  const scored = model.phase === "scored";
'''
new = '''  const model = shipment.model;
  const scored = model.phase === "scored";
  const pendingEpisode = snapshot.episodes.find(
    (episode) => episode.shipmentId === shipment.id && episode.status === "PENDING",
  );
'''
if old in s:
    s = s.replace(old, new, 1)
elif "const pendingEpisode = snapshot.episodes.find" not in s:
    raise SystemExit("pending episode insertion point not found")

old = '''            {model.recommendation.human_approval_required ? (
              <span className="rounded-sm border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                HUMAN APPROVAL REQUIRED
              </span>
            ) : null}
'''
new = '''            {model.recommendation.human_approval_required ? (
              <span className="rounded-sm border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                BACKEND HUMAN APPROVAL REQUIRED
              </span>
            ) : null}
            {pendingEpisode ? (
              <Link
                to="/resolution-hub"
                className="rounded-sm border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/15"
              >
                Human decision required · Open Resolution Hub
              </Link>
            ) : null}
'''
if old in s:
    s = s.replace(old, new, 1)
elif "Human decision required · Open Resolution Hub" not in s:
    raise SystemExit("recommendation indicator insertion point not found")

p.write_text(s)
