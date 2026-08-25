# Diagnosis: production shows OFFLINE FIXTURE DATA

## What the code does

`src/routes/api/orca/$.ts` reads the upstream base URL at request time:

```ts
process.env["ORCA_API_INTERNAL_URL"] ?? process.env["ORCA_API_URL"] ?? null
```

When both are absent it returns the `orca_api_not_configured` envelope with the exact
message production is showing, and the client falls back to labelled fixture data.
So the banner is not a backend fault and not a proxy bug — it is a missing
server-side environment variable in the hosted runtime.

## What I verified in this project

- No `.env` file exists in the checkout (only `.env.example`, which contains a
  placeholder URL, not the Railway host). Correct for a public repo, but it means
  the hosted server has no value to read.
- The project's configured secrets are only `LOVABLE_API_KEY` and
  `LOVABLE_CRON_SECRET`. There is **no** `ORCA_API_INTERNAL_URL` and no
  `ORCA_API_URL` secret configured for this project.
- Railway health is not the issue; the request never leaves the app server because
  `upstreamBase()` returns `null` before any fetch is attempted.

## Can the agent set it?

Partly, and it is worth being precise:

- I can create a **project secret** named `ORCA_API_INTERNAL_URL` from the agent
  (server-side, never committed, never exposed to the browser). That is the right
  mechanism here — it is not a `.env` recommit and not a hardcoded URL in source.
- I cannot configure workspace-level **build secrets**, and I cannot edit hosting
  environment variables outside the project secret store. Those remain user actions.

Since this is a diagnose-only pass, I have not created anything.

## Exact UI path for the user

Project Settings → Secrets → Add secret

- Name: `ORCA_API_INTERNAL_URL`
- Value: `https://orca-backend-production-2a11.up.railway.app`

(Open Project Settings from the gear/project menu in the top bar of the editor.)

Notes:
- No trailing slash; the proxy appends `/health`, `/predict`, `/explain`, `/recommend`.
- The value must be a publicly reachable HTTPS host — the proxy's `isLoopback`
  branch exists because `127.0.0.1` cannot be reached from the hosted app server.
- Backend/server-side config takes effect for the server runtime; a fresh
  Publish/Update is the reliable way to guarantee the production worker picks it up.

## Verification once it is set (next pass, on your go-ahead)

1. `curl` the production proxy: `GET https://orca-control-tower.lovable.app/api/orca/health`
   — expect the real ORCA health payload (`status`, `model_version`), not
   `orca_api_not_configured`.
2. Load `/control-tower` in production and confirm the banner switches from
   OFFLINE FIXTURE DATA to LIVE with the model version shown.
3. Settings → Test connection, still in Server proxy mode.

No code change is required for this fix. If you would rather I create the secret
from the agent instead of doing it in the UI, say so and I will do exactly that
and nothing else.
