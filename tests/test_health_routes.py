"""Tests for the Health window's backend — the manifest surface it needs, the
credential handling, and the pass-through routes.

The theme running through all of them is that this app is a CREDENTIAL BOUNDARY
and nothing else. The data lives in aw-backend; the browser cannot reach it;
the only thing that can is the ``awlk_`` host token, and the only place it may
exist is server-side. So what is worth pinning is: the manifest declares the
capabilities without which none of this loads, the token never appears in a
response body, and an unreachable/refused backend turns into a distinguishable
HTTP status rather than an empty result set — because in a chart, "no data" and
"no route to the data" look identical, and only one of them is a true statement
about the user's health history.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from mobile_app import routes as routes_mod
from mobile_app.health_client import (
    HealthBackendError,
    HealthClient,
    NotConfigured,
)

APP_DIR = Path(__file__).resolve().parents[1]
MANIFEST = APP_DIR / "aw-app.json"


@pytest.fixture(scope="module")
def manifest() -> dict:
    return json.loads(MANIFEST.read_text())


# ---------------------------------------------------------------------------
# Manifest surface
# ---------------------------------------------------------------------------


def test_declares_every_capability_the_window_needs(manifest):
    """Each of these is load-bearing and each fails differently when absent:
    without ``ui:code`` the bundle is never imported (empty window body, the
    chrome still draws); without the slot grant the nav row is dropped with a
    console warning; without ``routes:register`` every fetch 404s; without
    ``net:outbound`` the Tier-1 code may not call aw-backend at all."""
    perms = set(manifest["permissions"])
    assert {"ui:code", "ui:slots:core.nav.workspace",
            "routes:register", "net:outbound"} <= perms


def test_window_and_bundle_are_declared_together(manifest):
    """A component-mode bundle registers a body into a window id the MANIFEST
    has to declare — register alone doesn't create the window, so the nav
    button would open nothing."""
    windows = manifest["contributes"]["windows"]
    assert [w["id"] for w in windows] == ["mobile.health"]
    assert windows[0]["body"]["type"] == "component"
    assert manifest["contributes"]["frontend"]["mode"] == "component"
    assert manifest["contributes"]["frontend"]["bundle"] == "ui/dist/mobile.js"


def test_the_declared_bundle_actually_exists():
    """Nothing in the install path builds it (release.yml only cuts a tag), so
    an un-committed bundle installs cleanly and renders nothing."""
    assert (APP_DIR / "ui" / "dist" / "mobile.js").is_file()


def test_routes_are_not_mounted_under_the_reserved_ui_prefix(manifest):
    """Core serves app ESM bundles on /api/apps/<slug>/ui/ and shadows
    anything an app mounts there."""
    for r in manifest["contributes"]["routes"]:
        assert not r["prefix"].rstrip("/").endswith("/ui")
    app = routes_mod.build_routes()
    for route in app.routes:
        assert not getattr(route, "path", "").startswith("/ui")


def test_httpx_is_declared_as_a_dependency(manifest):
    """The client imports it at module scope; core installs pip_requires on
    activation, and without the declaration activation fails on import."""
    assert "httpx" in manifest["runtime"]["pip_requires"]


def test_agents_contribution_survived_the_window_addition(manifest):
    """The window is additive — the three Watch agents are still why most of
    this app exists."""
    assert "agents:contribute" in manifest["permissions"]
    slugs = {a["slug"] for a in manifest["contributes"]["agents"]["agents"]}
    assert slugs == {"watch-sonnet", "watch-opus", "watch-fable"}


# ---------------------------------------------------------------------------
# Credential resolution
# ---------------------------------------------------------------------------


def test_client_reports_unconfigured_when_the_token_is_missing(monkeypatch, tmp_path):
    monkeypatch.setenv("AW_WORKSPACE_ENV_FILE", str(tmp_path / "absent.env"))
    monkeypatch.delenv("AW_WORKSPACE_HOST_TOKEN", raising=False)
    monkeypatch.setenv("AW_BACKEND_URL", "http://backend")
    monkeypatch.setenv("AW_WORKSPACE", "aw")

    client = HealthClient()
    assert client.configured is False
    with pytest.raises(NotConfigured) as ei:
        client._require_configured()
    assert "AW_WORKSPACE_HOST_TOKEN" in str(ei.value)


def test_client_falls_back_to_the_workspace_env_file(monkeypatch, tmp_path):
    """A process on the shared /opt/aw-workspace mount may have its own
    unrelated $HOME, so the env file is resolved against the container dir —
    never Path.home()."""
    env = tmp_path / ".env"
    env.write_text(
        "AW_BACKEND_URL=http://backend:9025\n"
        "AW_WORKSPACE=aw\n"
        "AW_WORKSPACE_HOST_TOKEN=awlk_abc_def\n"
    )
    monkeypatch.setenv("AW_WORKSPACE_ENV_FILE", str(env))
    for k in ("AW_BACKEND_URL", "AW_WORKSPACE", "AW_WORKSPACE_HOST_TOKEN"):
        monkeypatch.delenv(k, raising=False)

    client = HealthClient()
    assert client.configured is True
    assert client.workspace == "aw"
    assert client.token == "awlk_abc_def"


def test_env_wins_over_the_file(monkeypatch, tmp_path):
    env = tmp_path / ".env"
    env.write_text("AW_WORKSPACE=from-file\n")
    monkeypatch.setenv("AW_WORKSPACE_ENV_FILE", str(env))
    monkeypatch.setenv("AW_WORKSPACE", "from-env")
    assert HealthClient().workspace == "from-env"


# ---------------------------------------------------------------------------
# The routes
# ---------------------------------------------------------------------------


class _FakeClient:
    """Stands in for HealthClient, recording what the routes asked for."""

    def __init__(self, result=None, raises=None, configured=True):
        self.result = result if result is not None else {"ok": True}
        self.raises = raises
        self.configured = configured
        self.backend_url = "http://backend:9025"
        self.workspace = "aw"
        self.token = "awlk_secret_value"
        self.calls = []

    async def get(self, path, params=None):
        self.calls.append((path, params or {}))
        if self.raises:
            raise self.raises
        return self.result


@pytest.fixture()
def make_client(monkeypatch):
    def _make(**kwargs):
        fake = _FakeClient(**kwargs)
        monkeypatch.setattr(routes_mod, "HealthClient", lambda: fake)
        return fake, TestClient(routes_mod.build_routes())
    return _make


def test_status_never_leaks_the_token(make_client):
    fake, client = make_client()
    r = client.get("/health/status")
    assert r.status_code == 200
    body = r.json()
    assert body["configured"] is True
    assert "awlk_secret_value" not in json.dumps(body)
    assert "token" not in body


def test_status_reports_an_unconfigured_workspace_without_erroring(make_client):
    """The window asks this first so it can say "no route to the data" in one
    sentence instead of five charts failing separately."""
    fake, client = make_client(configured=False)
    assert client.get("/health/status").json()["configured"] is False


def test_series_forwards_every_window_parameter(make_client):
    fake, client = make_client(result={"points": []})
    r = client.get("/health/series", params={
        "metric_type": "heart_rate", "bucket": "week",
        "from_ts": 1000, "until_ts": 2000, "tz_offset_minutes": -180,
    })
    assert r.status_code == 200
    path, params = fake.calls[0]
    assert path == "/series"
    assert params["metric_type"] == "heart_rate"
    assert params["bucket"] == "week"
    assert params["from_ts"] == 1000
    assert params["until_ts"] == 2000
    assert params["tz_offset_minutes"] == -180


def test_samples_forwards_the_upper_bound(make_client):
    """until_ts is the whole point of the new backend route — the old read
    path had none, so nine years of history were unaddressable."""
    fake, client = make_client(result={"samples": []})
    client.get("/health/samples", params={
        "metric_type": "heart_rate", "from_ts": 1_500_000_000,
        "until_ts": 1_500_086_400, "order": "asc",
    })
    _, params = fake.calls[0]
    assert params["from_ts"] == 1_500_000_000
    assert params["until_ts"] == 1_500_086_400
    assert params["order"] == "asc"


def test_missing_credential_is_a_503_that_says_so(make_client):
    fake, client = make_client(raises=NotConfigured("missing AW_WORKSPACE_HOST_TOKEN"))
    r = client.get("/health/metrics")
    assert r.status_code == 503
    assert "AW_WORKSPACE_HOST_TOKEN" in r.json()["detail"]


def test_backend_403_is_passed_through_not_laundered(make_client):
    """The tenant gate on aw-backend answers 403 for a workspace that doesn't
    own the dataset. Collapsing that into a 500 would send the reader looking
    for an outage instead of reading the one sentence that explains it."""
    fake, client = make_client(
        raises=HealthBackendError("this workspace does not own the health dataset",
                                  status_code=403))
    r = client.get("/health/metrics")
    assert r.status_code == 403
    assert "does not own" in r.json()["detail"]


def test_unreachable_backend_becomes_a_502(make_client):
    fake, client = make_client(
        raises=HealthBackendError("could not reach aw-backend: timed out", status_code=0))
    r = client.get("/health/metrics")
    assert r.status_code == 502


def test_every_health_route_is_a_read(make_client):
    """The /health/* proxy stays read-only.

    Narrowed from "every route on this app is a read" once the MCP endpoint
    arrived: JSON-RPC is POST by protocol, and some of the tools behind it
    legitimately write (log an event, save a place). What must not drift is
    this surface — the window reads, and a chart endpoint that grew a mutation
    would be a surprise. The MCP POST is asserted separately below.
    """
    fake, client = make_client()
    app = routes_mod.build_routes()
    for route in app.routes:
        path = getattr(route, "path", "")
        if not path.startswith("/health/"):
            continue
        methods = getattr(route, "methods", set()) or set()
        assert methods <= {"GET", "HEAD"}, f"{path} exposes {methods}"


def test_the_mcp_endpoint_is_the_only_post(make_client):
    fake, client = make_client()
    app = routes_mod.build_routes()
    posts = {
        getattr(r, "path", "")
        for r in app.routes
        if "POST" in (getattr(r, "methods", set()) or set())
    }
    assert posts == {"/mcp"}


def test_mcp_json_route_describes_the_registered_upstream(make_client):
    """Diagnostic only — the gateway reads the file on disk, not this route —
    but it answers "is the entry the one I think it is" without a shell."""
    fake, client = make_client()
    body = client.get("/mcp.json").json()
    assert "aw-mobile-app" in body["mcpServers"]
    assert body["mcpServers"]["aw-mobile-app"]["url"].endswith("/api/apps/mobile/mcp")


def test_status_advertises_the_tool_surface(make_client):
    fake, client = make_client()
    body = client.get("/health/status").json()
    assert body["mcp_server"] == "aw-mobile-app"
    assert len(body["tools"]) == 13


def test_the_five_read_routes_are_all_mounted(make_client):
    app = routes_mod.build_routes()
    paths = {getattr(r, "path", "") for r in app.routes}
    assert {"/health/status", "/health/metrics", "/health/series",
            "/health/samples", "/health/locations", "/health/log"} <= paths


def test_blank_params_are_dropped_before_the_backend_sees_them():
    """An omitted bound must stay omitted rather than becoming the literal
    string "None"/"" in the query — aw-backend would reject that as an
    unparseable float and the window would report a mysterious 422."""
    seen = {}

    class _Recorder(HealthClient):
        async def get(self, path, params=None):  # noqa: D102
            seen.update({k: v for k, v in (params or {}).items()
                         if v is not None and v != ""})
            return {}

    client = _Recorder(backend_url="http://x", workspace="aw", token="awlk_a_b")
    import asyncio
    asyncio.run(client.get("/samples", {"metric_type": "heart_rate",
                                        "from_ts": None, "device_uuid": ""}))
    assert seen == {"metric_type": "heart_rate"}
