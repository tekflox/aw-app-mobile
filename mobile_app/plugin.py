"""
Entrypoint referenced by aw-app.json's runtime.entrypoint
("mobile_app.plugin:MobileAppPlugin").

Most of what this app delivers — the three Watch channel agents and the
``aw-agent-watch`` skill that defines how they answer — is *declared* in
``aw-app.json`` and seeded by the workspace's own contribution surfaces
(``contributes.agents``, ``contributes.skills``), with nothing for
``activate`` to do.

The one runtime surface is the **Health** window: ``routes.build_routes()``
mounted at ``/api/apps/mobile``, proxying aw-backend's workspace-scoped
health reads so the ``awlk_`` host token stays server-side (see
``health_client.py``). Registering the routes is unconditional even when that
credential is absent — the sub-app answers ``/health/status`` with
``configured: false``, which is how the window can say "this workspace has no
route to the data" instead of drawing an empty chart that reads as "you have
no health history".

Why the app exists at all, then: an aw-mobile client (iPhone, Apple Watch,
Meta glasses) picks an agent out of whatever the tenant's Agents Platform
happens to hold. Before this app, that list was 40 development agents whose
replies are pages of markdown — correct on a terminal, unusable on a wrist
and actively wrong when read aloud by text-to-speech, which pronounces every
asterisk. Installing this app is what puts agents that know they are talking
to a watch into a workspace.

``agent-config-aw-full`` — the config bundle the three agents run under — is
declared here **by reference**: ``mcp_servers: ["aw-gateway"]``, never a
literal ``mcp_config``. The provisioner expands that name against this
workspace's own ``.mcp.json`` at activation, so the live URL and bearer token
are resolved at deploy time and nothing credential-bearing is committed to
this (public) repo.

It used to be left undeclared, on the reasoning that its ``mcp_config``
carries a live token and a manifest cannot hold one. True, but it answered
the wrong question: the by-reference form exists precisely so an app can
declare a gateway-backed config without holding the credential. Leaving it
undeclared meant nobody owned the row. It sat in the platform DB with a
hand-set address (``127.0.0.1:9200``, which is the agent's OWN container, not
the gateway's) and a bearer token that had since been rotated. Every agent
running under it got **zero** MCP tools — not a missing tool, all of them —
and said so only as "I don't have access to that", which reads like a
capability limit rather than a broken connection (Frederico, 2026-08-18:
"o agente que roda nele tá falando que nao consegue ver minha localização").

Declaring it also makes the repair automatic rather than a one-off: the
provisioner seeds content once but **re-asserts credentials on every
activation** for by-reference entries (see ``_refresh_mcp_credentials``), so a
rotated token or a changed gateway address heals itself on the next install
or restart, in every workspace, instead of needing someone to notice and run
an UPDATE by hand.

Seed-once, never updated (see aw-workspace's ``src/apps/agents.py``):
re-installing will not overwrite a system prompt the user has since tuned.
Shipping a corrected prompt means a new slug, or an edit in the UI.
"""

from __future__ import annotations

import logging
import os

from . import mcp_config, routes as routes_mod
from .mcp import tools as mcp_tools

log = logging.getLogger("aw_apps.mobile")


class MobileAppPlugin:
    """Tier-1 in-process plugin: the Health window's backend, plus the
    declared agents/skill the runtime seeds on its own."""

    def __init__(self, ctx=None):
        self.ctx = ctx

    async def activate(self, ctx=None) -> None:
        if ctx is not None:
            self.ctx = ctx
        # The contribution registries run from the framework's own activation
        # path, not from here — an app declares, the runtime dispatches. All
        # this needs to do is come up cleanly so that dispatch happens.
        if self.ctx is not None and getattr(self.ctx, "routes", None) is not None:
            self.ctx.routes.register(
                routes_mod.build_routes(getattr(self.ctx, "config", {}) or {})
            )
            log.info("aw-app-mobile: routes mounted at /api/apps/mobile")

        # THIS is what makes the tools exist. contributes.mcp in aw-app.json
        # registers nothing — the gateway only ever finds an upstream by
        # scanning for this file. Rebuilt every boot rather than persisted:
        # the entry embeds this process's hostname and API key, both of which
        # change when the workspace container is recreated.
        package_dir = getattr(self.ctx, "package_dir", None) if self.ctx else None
        if package_dir:
            port = int(os.environ.get("AW_PORT") or 9030)
            doc = mcp_config.write_mcp_json(package_dir, port)
            log.info(
                "aw-app-mobile: MCP server=%s, %d tools registered for the gateway scan",
                sorted(doc["mcpServers"]), len(mcp_tools.TOOL_NAMES),
            )
        log.info(
            "aw-app-mobile active — watch agents and the aw-agent-watch skill "
            "are seeded by the workspace from aw-app.json's contributes block"
        )

    async def deactivate(self) -> None:
        log.info("aw-app-mobile deactivated")
