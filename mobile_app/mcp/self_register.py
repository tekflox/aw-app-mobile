"""Entry describing this app's own ``/mcp`` endpoint, for aw-mcp-gateway's
app-scan (``scan_app_mcp_servers()``, which reads ``<app dir>/mcp.json``).

``contributes.mcp.provides`` in aw-app.json registers **nothing** — it is the
marketplace's "what you get" list. An app that declares only that installs
clean, passes ``aw-workspace-cli doctor``, and serves zero tools, with no error
anywhere. The gateway only ever finds an upstream by scanning for the file
``mcp_config.write_mcp_json`` writes.

Tier-1 (in-process): this *is* the aw-workspace process, so
``socket.gethostname()`` is exactly the value ContainerSupervisor injects into
sibling containers as ``AW_WORKSPACE_HOST`` — ``127.0.0.1`` would resolve
inside the gateway's own netns, not ours. ``AW_WORKSPACE_API_KEY`` is already
in this process's environment; the header is required because Tier-1 routes sit
behind IdentityGuard.
"""

from __future__ import annotations

import os
import socket

#: Kept identical to the monolith's server name so the gateway's prefix lands
#: on ``aw__aw_mobile_app__<tool>`` and an agent prompt that already cites one
#: of these tools needs only the prefix updated, not the tool name.
MCP_SERVER_NAME = "aw-mobile-app"
ROUTE_PATH = "/api/apps/mobile/mcp"


def build_self_entry(port: int | None = None) -> dict:
    host = socket.gethostname()
    port = port or int(os.environ.get("AW_PORT") or 9030)
    entry: dict = {
        "type": "http",
        "url": f"http://{host}:{port}{ROUTE_PATH}",
        "enabled": True,
    }
    api_key = os.environ.get("AW_WORKSPACE_API_KEY")
    if api_key:
        entry["headers"] = {"X-Api-Key": api_key}
    return entry
