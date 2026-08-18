"""HTTP client for aw-backend's ``/api/workspaces/{slug}/health/*`` routes.

The health data this app visualises does NOT live in the workspace. It lives
in aw-backend's Postgres (``health_samples``, ~10M rows going back to 2017,
and ``device_location_history``), which is a different service on a different
host. So the window cannot query a database — it has to cross a service
boundary, and that boundary has exactly one door.

**Why the browser cannot go direct.** aw-backend's original
``GET /api/health/samples`` sits behind the legacy single-owner gate in
``src/api/app.py``'s ``AuthMiddleware`` — an ``aw_jwt`` cookie or the
``X-Api-Key``. Nothing in a workspace holds either. What a workspace holds is
``AW_WORKSPACE_HOST_TOKEN``, the durable ``awlk_`` credential from the
``aw-remote-host`` ``/link`` handshake, and the only thing that accepts it is
``require_workspace_actor`` — on routes carrying the workspace slug in the
path. Hence this app talks to ``/api/workspaces/{slug}/health/*`` and the
token never leaves the server: the bundle calls the app's own
``/api/apps/mobile/health/*``, which is already behind the workspace's
IdentityGuard, and this client attaches the credential on the far side.

Config resolution copies ``aw-app-remote-host-cli``'s ``client.py`` verbatim
in shape (env first, then ``<AW_WORKSPACE_HOME>/.env``) — same three
variables, same reason: a process on the shared ``/opt/aw-workspace`` mount
may have its own unrelated ``$HOME``, so the env file is resolved against
``AW_WORKSPACE_CONTAINER_DIR``, never ``Path.home()``.
"""

from __future__ import annotations

import os

import httpx

DEFAULT_BACKEND_URL = "http://127.0.0.1:9025"
DEFAULT_WORKSPACE_CONTAINER_DIR = "/opt/aw-workspace"

#: Comfortably under the ~30s tunnel edge cut. The catalog is a GROUP BY over
#: the whole sample table and is the slowest call here by construction; if it
#: ever exceeds this the failure should be a clean error, not a request the
#: edge kills with a "workspace offline" that points at the wrong component.
DEFAULT_TIMEOUT = 25.0


def _default_env_file() -> str:
    home = os.environ.get("AW_WORKSPACE_HOME") or os.path.join(
        os.environ.get("AW_WORKSPACE_CONTAINER_DIR", DEFAULT_WORKSPACE_CONTAINER_DIR),
        ".aw-workspace",
    )
    return os.path.join(home, ".env")


def _read_env_file_value(key: str) -> str | None:
    path = os.environ.get("AW_WORKSPACE_ENV_FILE") or _default_env_file()
    prefix = f"{key}="
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith(prefix):
                    return line[len(prefix):].strip() or None
    except FileNotFoundError:
        return None
    return None


def _resolve(explicit: str | None, key: str, default: str = "") -> str:
    if explicit:
        return explicit
    return os.environ.get(key) or _read_env_file_value(key) or default


class NotConfigured(RuntimeError):
    """Raised when the three variables aren't all present.

    Surfaced to the window as a 503 with this message rather than an empty
    chart — a workspace that never completed the ``/link`` handshake has no
    route to the data at all, and silently drawing "no samples" would read as
    "you have no health history", which is a different and much worse claim.
    """


class HealthBackendError(RuntimeError):
    """Non-2xx from aw-backend, carrying its message where one was parseable."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


class HealthClient:
    def __init__(
        self,
        backend_url: str | None = None,
        workspace: str | None = None,
        token: str | None = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.backend_url = _resolve(backend_url, "AW_BACKEND_URL", DEFAULT_BACKEND_URL).rstrip("/")
        self.workspace = _resolve(workspace, "AW_WORKSPACE")
        self.token = _resolve(token, "AW_WORKSPACE_HOST_TOKEN")
        self.timeout = timeout

    @property
    def configured(self) -> bool:
        return bool(self.backend_url and self.workspace and self.token)

    def _require_configured(self) -> None:
        if not self.configured:
            missing = [
                k for k, v in (
                    ("AW_BACKEND_URL", self.backend_url),
                    ("AW_WORKSPACE", self.workspace),
                    ("AW_WORKSPACE_HOST_TOKEN", self.token),
                ) if not v
            ]
            raise NotConfigured(
                f"missing {', '.join(missing)} — health data lives in aw-backend "
                "and this workspace has no credential to reach it."
            )

    async def request(
        self,
        method: str,
        path: str,
        params: dict | None = None,
        json_body: dict | None = None,
        namespace: str = "health",
    ) -> dict:
        """``<method> /api/workspaces/{slug}/{namespace}{path}`` with the host token.

        ``namespace`` picks which of aw-backend's two workspace-scoped
        surfaces to hit: ``health`` (samples, series, log) or ``mobile``
        (location, annotations, devices). Both sit behind the same
        ``require_workspace_actor`` plus the same legacy-tenant gate, so the
        credential and the failure modes are identical — only the prefix
        differs.

        ``params`` is filtered of ``None``/``""`` before sending so an omitted
        bound stays omitted rather than becoming the literal string "None" in
        the query — which aw-backend would reject as an unparseable float and
        the caller would report as a mysterious 422.
        """
        self._require_configured()
        url = f"{self.backend_url}/api/workspaces/{self.workspace}/{namespace}{path}"
        clean = {k: v for k, v in (params or {}).items() if v is not None and v != ""}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.request(
                    method, url, params=clean, json=json_body,
                    headers={"Authorization": f"Bearer {self.token}"},
                )
        except httpx.HTTPError as e:
            raise HealthBackendError(f"could not reach aw-backend: {e}") from e

        try:
            data = resp.json()
        except ValueError:
            data = {}
        if resp.status_code >= 400:
            raise HealthBackendError(
                data.get("detail") or data.get("error") or f"HTTP {resp.status_code}",
                status_code=resp.status_code,
            )
        return data

    async def get(self, path: str, params: dict | None = None,
                  namespace: str = "health") -> dict:
        return await self.request("GET", path, params=params, namespace=namespace)

    async def post(self, path: str, json_body: dict | None = None,
                   namespace: str = "health") -> dict:
        return await self.request("POST", path, json_body=json_body or {},
                                  namespace=namespace)

    async def patch(self, path: str, json_body: dict | None = None,
                    namespace: str = "health") -> dict:
        return await self.request("PATCH", path, json_body=json_body or {},
                                  namespace=namespace)

    async def delete(self, path: str, namespace: str = "health") -> dict:
        return await self.request("DELETE", path, namespace=namespace)
