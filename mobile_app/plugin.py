"""
Entrypoint referenced by aw-app.json's runtime.entrypoint
("mobile_app.plugin:MobileAppPlugin").

This app is deliberately almost empty. Everything it delivers — the three
Watch channel agents and the ``aw-agent-watch`` skill that defines how they
answer — is *declared* in ``aw-app.json`` and seeded by the workspace's own
contribution surfaces (``contributes.agents``, ``contributes.skills``).
There is no HTTP route, no window and no CLI, so there is nothing for
``activate`` to register.

Why the app exists at all, then: an aw-mobile client (iPhone, Apple Watch,
Meta glasses) picks an agent out of whatever the tenant's Agents Platform
happens to hold. Before this app, that list was 40 development agents whose
replies are pages of markdown — correct on a terminal, unusable on a wrist
and actively wrong when read aloud by text-to-speech, which pronounces every
asterisk. Installing this app is what puts agents that know they are talking
to a watch into a workspace.

Deliberately NOT declared here: ``agent-config-aw-full``, the config bundle
the three agents run under. It exists in the platform already and its
``mcp_config`` carries a live gateway bearer token — an app repo is public,
so the token cannot ride in a manifest. The agents reference the slug and
the platform resolves it. The cost is that installing into a workspace that
has never had that config produces agents pointing at a bundle that isn't
there, and the provisioner will not complain (Agents Platform stores the
reference as a plain string). ``tests/test_manifest.py`` pins the slug so
the assumption is at least written down and checked.

Seed-once, never updated (see aw-workspace's ``src/apps/agents.py``):
re-installing will not overwrite a system prompt the user has since tuned.
Shipping a corrected prompt means a new slug, or an edit in the UI.
"""

from __future__ import annotations

import logging

log = logging.getLogger("aw_apps.mobile")


class MobileAppPlugin:
    """Tier-1 in-process plugin with no runtime surface of its own."""

    def __init__(self, ctx=None):
        self.ctx = ctx

    async def activate(self, ctx=None) -> None:
        if ctx is not None:
            self.ctx = ctx
        # The contribution registries run from the framework's own activation
        # path, not from here — an app declares, the runtime dispatches. All
        # this needs to do is come up cleanly so that dispatch happens.
        log.info(
            "aw-app-mobile active — watch agents and the aw-agent-watch skill "
            "are seeded by the workspace from aw-app.json's contributes block"
        )

    async def deactivate(self) -> None:
        log.info("aw-app-mobile deactivated")
