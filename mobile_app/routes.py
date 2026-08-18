"""The app's FastAPI sub-app, mounted at ``/api/apps/mobile``.

Every route is a thin, read-only pass-through to aw-backend's
``/api/workspaces/{slug}/health/*`` surface (see ``health_client.py`` for why
the browser cannot call that directly). Deliberately thin: the aggregation
already happens in SQL on the far side, and re-shaping it here would create a
second place for "what a bucket means" to drift.

What this layer DOES own:

* **The credential.** The bundle calls same-origin ``/api/apps/mobile/...``,
  which the runtime has already put behind IdentityGuard; the ``awlk_`` host
  token is attached server-side and never reaches a browser.
* **Turning a client error into an honest one.** A missing credential is a
  503 saying so, not an empty result set — "no data" and "no route to the
  data" look identical in a chart and must not.

Paths are RELATIVE (no ``/api/apps/mobile`` prefix); the runtime mounts them.

NOTE: nothing here may live under ``/api/apps/mobile/ui/`` — core serves app
ESM bundles on that prefix and would shadow it.
"""

from __future__ import annotations

import logging

from fastapi import Body, FastAPI, HTTPException
from fastapi.responses import JSONResponse, Response

from . import mcp_config
from .health_client import HealthBackendError, HealthClient, NotConfigured
from .mcp import tools as mcp_tools

log = logging.getLogger("aw_apps.mobile")


def build_routes(config: dict | None = None) -> FastAPI:
    config = config or {}
    app = FastAPI(title="mobile")
    client = HealthClient()

    async def _proxy(path: str, params: dict) -> dict:
        try:
            return await client.get(path, params)
        except NotConfigured as e:
            raise HTTPException(status_code=503, detail=str(e)) from e
        except HealthBackendError as e:
            # Pass the far side's status through where it is a real HTTP
            # status. A 403 from the tenant gate must not be laundered into a
            # 500 — the window says something different for each.
            code = e.status_code if 400 <= e.status_code < 600 else 502
            raise HTTPException(status_code=code, detail=str(e)) from e

    @app.get("/health/status")
    async def status():
        """Whether this workspace can reach the dataset at all.

        The window asks this first so a workspace with no ``/link`` handshake
        gets one clear sentence instead of five charts that each fail
        separately.
        """
        return {
            "configured": client.configured,
            "backend_url": client.backend_url,
            "workspace": client.workspace,
            "mcp_server": mcp_config.SERVER_NAME,
            "tools": mcp_tools.TOOL_NAMES,
        }

    @app.get("/health/metrics")
    async def metrics(device_uuid: str = ""):
        return await _proxy("/metrics", {"device_uuid": device_uuid})

    @app.get("/health/series")
    async def series(
        metric_type: str,
        bucket: str = "day",
        from_ts: float | None = None,
        until_ts: float | None = None,
        device_uuid: str = "",
        tz_offset_minutes: int = 0,
    ):
        return await _proxy("/series", {
            "metric_type": metric_type,
            "bucket": bucket,
            "from_ts": from_ts,
            "until_ts": until_ts,
            "device_uuid": device_uuid,
            "tz_offset_minutes": tz_offset_minutes,
        })

    @app.get("/health/samples")
    async def samples(
        metric_type: str = "",
        from_ts: float | None = None,
        until_ts: float | None = None,
        device_uuid: str = "",
        order: str = "asc",
        limit: int = 500,
        offset: int = 0,
    ):
        return await _proxy("/samples", {
            "metric_type": metric_type,
            "from_ts": from_ts,
            "until_ts": until_ts,
            "device_uuid": device_uuid,
            "order": order,
            "limit": limit,
            "offset": offset,
        })

    @app.get("/health/locations")
    async def locations(
        from_ts: float | None = None,
        until_ts: float | None = None,
        source: str = "",
        limit: int = 2000,
    ):
        return await _proxy("/locations", {
            "from_ts": from_ts,
            "until_ts": until_ts,
            "source": source,
            "limit": limit,
        })

    @app.get("/health/log")
    async def log_entries(
        from_ts: float | None = None,
        until_ts: float | None = None,
        category: str = "",
        limit: int = 200,
    ):
        return await _proxy("/log", {
            "from_ts": from_ts,
            "until_ts": until_ts,
            "category": category,
            "limit": limit,
        })

    # ------------------------------------------------------------------
    # MCP — Streamable HTTP, auto-discovered by aw-mcp-gateway's app-scan.
    #
    # Mounted here rather than anywhere under /api/apps/mobile/ui/, which core
    # reserves for app ESM bundles and would shadow.
    # ------------------------------------------------------------------

    @app.get("/mcp.json")
    async def mcp_json() -> dict:
        """What this app registers with the gateway. Purely diagnostic — the
        gateway reads the file on disk, not this route — but it answers "is the
        entry the one I think it is" without a shell in the container."""
        return {"mcpServers": mcp_config.build_mcp_servers()}

    @app.post("/mcp")
    async def mcp_post(data: dict | list = Body(...)):
        from .mcp.http_handler import handle_request

        messages = data if isinstance(data, list) else [data]
        responses = []
        for m in messages:
            r = await handle_request(m, client)
            if r is not None:
                responses.append(r)
        if not responses:
            return Response(status_code=202)
        return JSONResponse(responses if isinstance(data, list) else responses[0])

    @app.get("/mcp")
    async def mcp_get():
        return Response(status_code=405)

    return app
