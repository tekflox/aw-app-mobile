"""The ``aw-mobile-app`` MCP server, over Streamable HTTP (``POST /mcp``).

The monolith served these over **stdio**, as a subprocess its gateway
respawned. That shape does not port: aw-mcp-gateway spawns stdio children
inside its own container, which has neither this app's code nor this
workspace's ``awlk_`` credential. Serving MCP from this app's own
already-authenticated route sidesteps both — the gateway just makes an HTTP
call. Same mechanism as aw-app-google-maps and aw-app-notion.

The tool logic itself lives in ``tools.py``; this module is only the JSON-RPC
envelope around it, plus the one thing worth doing here rather than in each
handler: turning a missing credential or an unreachable aw-backend into a
sentence an agent can act on, instead of thirteen different tracebacks.
"""

from __future__ import annotations

import logging

from ..health_client import HealthBackendError, HealthClient, NotConfigured
from . import tools

log = logging.getLogger("aw_apps.mobile")

SERVER_NAME = "aw-mobile-app"
#: Matches the monolith's server version — same tools, same contract.
SERVER_VERSION = "2.0.0"

TOOLS_SCHEMA = tools.TOOLS_SCHEMA


def _result(req_id, text: str, is_error: bool) -> dict:
    return {"jsonrpc": "2.0", "id": req_id,
            "result": {"content": [{"type": "text", "text": text}],
                       "isError": is_error}}


async def handle_request(request: dict, client: HealthClient | None = None) -> dict | None:
    method = request.get("method", "")
    req_id = request.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0", "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
            },
        }
    if method == "notifications/initialized":
        return None
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": TOOLS_SCHEMA}}
    if method != "tools/call":
        return {"jsonrpc": "2.0", "id": req_id,
                "error": {"code": -32601, "message": f"Unknown method: {method}"}}

    params = request.get("params") or {}
    name = params.get("name", "")
    args = params.get("arguments") or {}

    handler = tools.DISPATCH.get(name)
    if not handler:
        return _result(req_id, f"Unknown tool: {name}", True)

    client = client or HealthClient()
    try:
        text, is_error = await handler(client, args)
    except NotConfigured as exc:
        # A workspace that never completed the aw-remote-host /link handshake
        # has no route to this data at all. Saying so beats every tool failing
        # with its own variation of "could not reach aw-backend".
        return _result(req_id, f"{name} unavailable: {exc}", True)
    except HealthBackendError as exc:
        # 403 here means the tenant gate refused — a different problem from a
        # network one, and worth naming so nobody goes looking for an outage.
        if exc.status_code == 403:
            return _result(
                req_id,
                f"{name} refused: this workspace does not own the mobile/health "
                f"dataset ({exc}).",
                True,
            )
        return _result(req_id, f"{name} failed: {exc}", True)
    except Exception as exc:  # noqa: BLE001 — last resort, must not 500 the route
        log.exception("aw-mobile-app MCP tool %s failed", name)
        return _result(req_id, f"{name} failed: {exc}", True)

    return _result(req_id, text, is_error)
