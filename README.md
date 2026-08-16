# aw-app-mobile

The workspace half of **aw-mobile** — the AW iPhone app, the Apple Watch app
and the Meta glasses webapp.

Installing this app into a workspace creates, in that tenant's Agents
Platform, the agents those clients talk to, and ships the skill that tells
them how to answer on a wrist.

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
