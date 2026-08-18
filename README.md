# aw-app-mobile

The workspace half of **aw-mobile** — the AW iPhone app, the Apple Watch app
and the Meta glasses webapp.

It contributes two things:

* the **Health window** — a React view over the HealthKit samples and
  location history the phone has been syncing since 2017 (see below);
* the **agents** those clients talk to, plus the skill that tells them how to
  answer on a wrist.

Installing this app into a workspace creates the agents in that tenant's
Agents Platform and adds `Health` to the Workspace nav.

## The Health window

~10M samples across 20 metric types, and until now none of it was readable.
aw-backend's `GET /api/health/samples` takes `since_ts` but no upper bound,
orders `start_ts DESC` and caps at 1000 rows — so "the last 1000 heart-rate
readings" is about 40 hours, and no parameter reaches 2019.

The companion change in **aw-backend** opens
`/api/workspaces/{slug}/health/*`: a metric catalog, buckets aggregated in
SQL by hour/day/week/month, and a sample read with a real window
(`from_ts` + `until_ts` + sort direction). This app is the credential
boundary in front of it.

**Why a proxy and not a direct call.** The original route sits behind
aw-backend's legacy single-owner gate (`aw_jwt` cookie or `X-Api-Key`), and
nothing in a workspace holds either. What a workspace holds is
`AW_WORKSPACE_HOST_TOKEN`, the durable `awlk_` credential from the
`aw-remote-host` `/link` handshake — accepted only by
`require_workspace_actor`, and only on routes carrying the workspace slug.
So the window calls same-origin `/api/apps/mobile/health/*`, already behind
the runtime's IdentityGuard, and `health_client.py` attaches the token
server-side. It never reaches a browser.

```
browser ──/api/apps/mobile/health/*──▶ this app ──Bearer awlk_──▶ aw-backend
          (IdentityGuard)                                        (require_workspace_actor
                                                                  + legacy-schema tenant gate)
```

The window asks for the catalog first, then for buckets, and fetches raw
readings only when you click into one bucket — so the payload is bounded by
bucket count (six years of months = 72 rows), never by sample count.

`GET /api/apps/mobile/health/status` answers whether this workspace has a
credential at all. It exists because "no data" and "no route to the data"
look identical in a chart, and only one of them is a true claim about
someone's health history.

### Frontend

`ui/src/plugin.jsx` → `ui/dist/mobile.js` (`cd ui && npm run build`). **The
built bundle is committed**: nothing in the marketplace install path builds
it, so an un-committed bundle installs cleanly and renders an empty window.

Two rules that bundle lives under, both learned the expensive way:

* **Only Tailwind classes core already ships.** The SPA's CSS was compiled
  long before this bundle loads, from its own source, so a class this file
  invents is simply absent at runtime — silently, and the symptom reads as a
  layout bug. Everything dimensional goes through `style={{…}}`.
* **Chart colours are fixed hexes, not `var(--color-accent)`.** The accent is
  theme-dependent, so a chart built on it changes hue per theme and can never
  be validated once. The palette is slots 1–3 of the reference categorical
  palette, each mode's own steps, chosen at runtime from the computed
  `--color-bg-primary` luminance.

| Agent | Model | For |
|---|---|---|
| `watch-sonnet` | `claude-runner-sonnet` | the default |
| `watch-opus` | `claude-runner-opus` | a question worth the latency |
| `watch-fable` | `claude-runner-fable` | the fast back-and-forth |

All three run under `agent-config-aw-full` and load the `aw-agent-watch`
skill.

## Why it exists

An aw-mobile client picks an agent out of whatever its tenant's Agents
Platform happens to hold. Today that is ~40 development agents whose replies
are pages of markdown — correct in a terminal, unusable on a 40mm screen, and
actively wrong through text-to-speech, which pronounces every asterisk.

The agents are the same agents; what this app adds is a channel contract.
`skills/aw-agent-watch/SKILL.md` is the whole point of the package: answer in
the first sentence, emit no markdown, and budget length by source device
(`watch` ≤ 40 words, voice ≤ 60, `iphone` ≤ 120).

## How the seeding works

The app writes no network code. It declares, and the workspace dispatches:

```
aw-app.json  contributes.agents
      │  aw-workspace reads it on activate  (src/apps/agents.py)
      ▼
agent_provisioner.py  (in aw-app-agents-platform-runners —
      │                it holds the AP base URL and identity token)
      │  POST in this exact order: models → agent_configs → groups → agents → flows
      ▼
agents-platform-multitenant
```

`agents-platform-runners` is declared as a **non-required** dependency: a
declaration that arrives before the provider is held and replayed when one
appears, so this app installs cleanly either way and the skill stays usable
by hand in the meantime.

**Seed-once, by slug.** An agent whose slug already exists is left completely
alone, and nothing is removed on uninstall. A corrected system prompt in a
new version does *not* reach an existing installation — ship it under a new
slug, or edit it in the Agents Platform UI. This is deliberate: a system
prompt is exactly the field a user spends weeks tuning.

## The one dependency that isn't declared

`agent-config-aw-full` is referenced by all three agents and **declared by
nobody** — not by this app, not by any other. It lives in the platform
because someone created it there.

It is not inlined here on purpose: its `mcp_config` carries a live gateway
bearer token, and this repo is public.

The consequence is real and worth knowing: installing into a workspace whose
Agents Platform has never had that config produces three agents pointing at a
bundle that does not exist. The platform stores the reference as a plain
string, so nothing errors — the agents are created, and the failure surfaces
the first time someone dictates into their watch.
`tests/test_manifest.py` pins the slug so the assumption is at least written
down, and asserts the token can never be pasted back in.

## Tests

```bash
pytest tests/
```

The manifest *is* the app, so that is what the tests check: that every agent
names a real runner model, that all three use different ones, that the skill
they load is the skill this app ships, that the declared prompt and skill
files exist, and that no `Authorization` header ever appears in the manifest.
