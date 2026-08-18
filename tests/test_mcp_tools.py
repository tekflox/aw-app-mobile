"""Tests for the 13 ported MCP tools and the registration that makes them exist.

Three things are genuinely at risk here, and the file is organised around them.

**1. Registration.** ``contributes.mcp`` in the manifest registers NOTHING —
the gateway only ever finds an upstream by scanning for a root ``mcp.json``.
An app that declares the block and never writes the file installs clean,
passes doctor, and serves zero tools with no error anywhere. So: the file gets
written, it names ``aw-mobile-app``, and it points at this app's own route.

**2. The names.** The gateway prefixes by server name, so these become
``aw__aw_mobile_app__<tool>``. Any drift from the monolith's names silently
breaks every agent prompt that cites one. The 13 are pinned literally.

**3. Every tool reaches the backend it should.** A tool that accepts the call
and quietly does nothing is worse than an absent tool — the writes especially.
Each handler is exercised against a recording client and asserted on the
method, namespace and path it used.
"""

from __future__ import annotations

import asyncio
import functools
import json
from pathlib import Path

import pytest

from mobile_app import mcp_config
from mobile_app.health_client import HealthBackendError, NotConfigured
from mobile_app.mcp import http_handler, self_register, tools

APP_DIR = Path(__file__).resolve().parents[1]

#: The 13, exactly as the monolith named them. Written out rather than derived
#: from the code so a rename has to be a deliberate edit here too.
EXPECTED_TOOLS = [
    "get_location",
    "get_location_history",
    "get_location_stops",
    "save_location_annotation",
    "search_location_annotations",
    "list_location_annotations",
    "update_location_annotation",
    "delete_location_annotation",
    "log_health_event",
    "list_health_log",
    "get_health_samples",
    "sync_health_now",
    "get_devices",
]


def _async_test(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        return asyncio.run(fn(*args, **kwargs))
    return wrapper


class _FakeClient:
    """Records every request and replays canned responses by path."""

    def __init__(self, responses=None, raises=None):
        self.calls = []
        self.responses = responses or {}
        self.raises = raises
        self.configured = True
        self.backend_url = "http://backend:9025"
        self.workspace = "aw"
        self.token = "awlk_secret_value"

    async def request(self, method, path, params=None, json_body=None, namespace="health"):
        self.calls.append({"method": method, "path": path, "namespace": namespace,
                           "params": params or {}, "json": json_body})
        if self.raises:
            raise self.raises
        return self.responses.get(path, {})

    async def get(self, path, params=None, namespace="health"):
        return await self.request("GET", path, params=params, namespace=namespace)

    async def post(self, path, json_body=None, namespace="health"):
        return await self.request("POST", path, json_body=json_body or {}, namespace=namespace)

    async def patch(self, path, json_body=None, namespace="health"):
        return await self.request("PATCH", path, json_body=json_body or {}, namespace=namespace)

    async def delete(self, path, namespace="health"):
        return await self.request("DELETE", path, namespace=namespace)


# ---------------------------------------------------------------------------
# Registration — the trap that ships silently
# ---------------------------------------------------------------------------


def test_manifest_declares_the_same_thirteen():
    manifest = json.loads((APP_DIR / "aw-app.json").read_text())
    assert manifest["contributes"]["mcp"]["provides"] == EXPECTED_TOOLS


def test_the_server_name_matches_the_monolith():
    """The gateway prefixes by server name. `aw-mobile-app` is what makes the
    tools land on aw__aw_mobile_app__*, which is what the report tells people
    to update their prompts to."""
    assert self_register.MCP_SERVER_NAME == "aw-mobile-app"
    assert mcp_config.SERVER_NAME == "aw-mobile-app"


def test_write_mcp_json_creates_the_file_the_gateway_scans(tmp_path, monkeypatch):
    monkeypatch.setenv("AW_WORKSPACE_API_KEY", "k-123")
    doc = mcp_config.write_mcp_json(str(tmp_path), port=9030)

    written = json.loads((tmp_path / "mcp.json").read_text())
    assert written == doc
    entry = written["mcpServers"]["aw-mobile-app"]
    assert entry["type"] == "http"
    assert entry["enabled"] is True
    assert entry["url"].endswith("/api/apps/mobile/mcp")
    # Tier-1 routes are IdentityGuard-gated; without the header the gateway
    # reaches the route and gets a 401.
    assert entry["headers"]["X-Api-Key"] == "k-123"


def test_write_mcp_json_skips_an_unchanged_write(tmp_path, monkeypatch):
    """Not an optimisation: the gateway reloads on mtime, and each reload drops
    every tool it proxies. An unconditional rewrite on activate is a loop."""
    monkeypatch.setenv("AW_WORKSPACE_API_KEY", "k-123")
    mcp_config.write_mcp_json(str(tmp_path), port=9030)
    first = (tmp_path / "mcp.json").stat().st_mtime_ns
    mcp_config.write_mcp_json(str(tmp_path), port=9030)
    assert (tmp_path / "mcp.json").stat().st_mtime_ns == first


def test_the_url_is_not_loopback(monkeypatch):
    """127.0.0.1 would resolve inside the GATEWAY's netns, not this process's."""
    entry = self_register.build_self_entry(port=9030)
    assert "127.0.0.1" not in entry["url"] and "localhost" not in entry["url"]


def test_mcp_route_is_not_under_the_reserved_ui_prefix():
    assert not self_register.ROUTE_PATH.startswith("/api/apps/mobile/ui")


# ---------------------------------------------------------------------------
# The schema
# ---------------------------------------------------------------------------


def test_exactly_the_thirteen_are_served():
    assert [t["name"] for t in tools.TOOLS_SCHEMA] == EXPECTED_TOOLS


def test_every_schema_entry_has_a_handler():
    """A tool in the schema with no handler appears in tools/list and fails on
    call — the exact "tool exists but does nothing" failure this port avoids."""
    assert set(tools.DISPATCH) == set(EXPECTED_TOOLS)


def test_every_tool_has_a_description_and_an_input_schema():
    for t in tools.TOOLS_SCHEMA:
        assert t["description"].strip(), t["name"]
        assert t["inputSchema"]["type"] == "object", t["name"]


def test_required_fields_match_the_monolith():
    required = {t["name"]: t["inputSchema"].get("required", []) for t in tools.TOOLS_SCHEMA}
    assert required["save_location_annotation"] == ["annotation"]
    assert required["search_location_annotations"] == ["query"]
    assert required["update_location_annotation"] == ["annotation_id", "annotation"]
    assert required["delete_location_annotation"] == ["annotation_id"]
    assert required["log_health_event"] == ["text"]
    assert required["get_health_samples"] == ["metric_type"]
    assert required["get_location"] == []


# ---------------------------------------------------------------------------
# JSON-RPC envelope
# ---------------------------------------------------------------------------


@_async_test
async def test_tools_list_returns_all_thirteen():
    r = await http_handler.handle_request({"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                                          _FakeClient())
    assert [t["name"] for t in r["result"]["tools"]] == EXPECTED_TOOLS


@_async_test
async def test_initialize_reports_the_server_identity():
    r = await http_handler.handle_request({"jsonrpc": "2.0", "id": 1, "method": "initialize"},
                                          _FakeClient())
    info = r["result"]["serverInfo"]
    assert info["name"] == "aw-mobile-app"
    assert info["version"] == "2.0.0"


@_async_test
async def test_initialized_notification_gets_no_response():
    assert await http_handler.handle_request(
        {"jsonrpc": "2.0", "method": "notifications/initialized"}, _FakeClient()) is None


@_async_test
async def test_unknown_tool_is_an_error_result_not_a_crash():
    r = await http_handler.handle_request(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
         "params": {"name": "send_push_notification", "arguments": {}}}, _FakeClient())
    assert r["result"]["isError"] is True
    assert "Unknown tool" in r["result"]["content"][0]["text"]


@_async_test
async def test_missing_credential_is_explained_once_not_thirteen_times():
    client = _FakeClient(raises=NotConfigured("missing AW_WORKSPACE_HOST_TOKEN"))
    r = await http_handler.handle_request(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
         "params": {"name": "get_location", "arguments": {}}}, client)
    assert r["result"]["isError"] is True
    assert "AW_WORKSPACE_HOST_TOKEN" in r["result"]["content"][0]["text"]


@_async_test
async def test_tenant_refusal_is_named_not_reported_as_an_outage():
    client = _FakeClient(raises=HealthBackendError("does not own the dataset", status_code=403))
    r = await http_handler.handle_request(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
         "params": {"name": "get_devices", "arguments": {}}}, client)
    assert "does not own" in r["result"]["content"][0]["text"]


# ---------------------------------------------------------------------------
# Each tool hits the right door
# ---------------------------------------------------------------------------


@_async_test
async def test_get_location_formats_the_fix_and_nearby_annotations():
    client = _FakeClient({"/location/latest": {
        "source": "iphone", "latitude": 40.19558, "longitude": -8.40112,
        "accuracy_m": 12.0, "fix_time": "2026-08-18T12:06:00+00:00",
        "reported_at": "2026-08-18T12:06:04+00:00",
        "formatted_address": "Rua Larga, Coimbra", "city": "Coimbra",
        "state": None, "postal_code": "3000", "country": "PT",
        "timezone": "Europe/Lisbon",
        "nearby_annotations": [{"annotation": "o escritório", "distance_m": 34.0}],
    }})
    text, is_error = await tools.get_location(client, {"source": "iphone"})

    assert is_error is False
    assert client.calls[0]["namespace"] == "mobile"
    assert client.calls[0]["path"] == "/location/latest"
    assert "40.19558, -8.40112" in text
    assert "±12m" in text
    assert "Rua Larga, Coimbra" in text
    assert "Europe/Lisbon" in text
    assert "o escritório" in text and "~34m away" in text


@_async_test
async def test_get_location_explains_a_404_rather_than_raising():
    client = _FakeClient(raises=HealthBackendError("no location reported yet", status_code=404))
    text, is_error = await tools.get_location(client, {})
    assert is_error is True
    assert "location permission" in text


@_async_test
async def test_get_location_history_passes_its_filters():
    client = _FakeClient({"/location/history": {"fixes": [
        {"source": "iphone", "latitude": 40.1, "longitude": -8.4, "accuracy_m": 9.0,
         "fix_time": "2026-08-18T10:00:00+00:00", "timezone": "Europe/Lisbon"},
    ]}})
    text, _ = await tools.get_location_history(
        client, {"source": "iphone", "device_uuid": "d-1", "since_ts": 1000, "limit": 25})

    call = client.calls[0]
    assert call["namespace"] == "mobile" and call["path"] == "/location/history"
    assert call["params"]["device_uuid"] == "d-1"
    assert call["params"]["since_ts"] == 1000
    assert call["params"]["limit"] == 25
    assert "1 most recent location fix(es)" in text
    assert "[Europe/Lisbon]" in text


@_async_test
async def test_get_location_stops_reports_the_considered_count_when_empty():
    client = _FakeClient({"/location/stops": {"stops": [], "fixes_considered": 42}})
    text, is_error = await tools.get_location_stops(client, {})
    assert is_error is False
    assert "42 fix(es) considered" in text


@_async_test
async def test_get_location_stops_prefers_an_annotation_label():
    client = _FakeClient({"/location/stops": {"fixes_considered": 100, "stops": [{
        "latitude": 40.2, "longitude": -8.4, "arrival_time": "A", "departure_time": "B",
        "duration_minutes": 95.0, "fix_count": 12, "formatted_address": "Rua X",
        "city": "Coimbra", "annotation_label": "o escritório", "timezone": "Europe/Lisbon",
    }]}})
    text, _ = await tools.get_location_stops(client, {})
    # The saved name beats the geocoded street — it is what the user calls it.
    assert text.count("o escritório") == 1
    assert "Rua X" not in text


@_async_test
async def test_save_annotation_uses_the_current_fix_by_default():
    client = _FakeClient({"/annotations": {
        "ok": True, "id": 7, "latitude": 40.19, "longitude": -8.4,
        "address": "Rua Larga, Coimbra", "used_current_fix": True}})
    text, is_error = await tools.save_location_annotation(client, {"annotation": "o escritório"})

    call = client.calls[0]
    assert call["method"] == "POST" and call["namespace"] == "mobile"
    assert call["json"] == {"annotation": "o escritório"}
    assert is_error is False
    assert "#7" in text and "Rua Larga, Coimbra" in text


@_async_test
async def test_save_annotation_forwards_explicit_coordinates():
    client = _FakeClient({"/annotations": {
        "ok": True, "id": 8, "latitude": -23.55, "longitude": -46.63,
        "address": "Av. Paulista", "used_current_fix": False}})
    await tools.save_location_annotation(client, {
        "annotation": "o Legatal", "latitude": -23.55, "longitude": -46.63,
        "address": "Av. Paulista"})
    assert client.calls[0]["json"] == {
        "annotation": "o Legatal", "latitude": -23.55, "longitude": -46.63,
        "address": "Av. Paulista"}


@_async_test
async def test_save_annotation_rejects_blank_text_without_calling_out():
    client = _FakeClient()
    text, is_error = await tools.save_location_annotation(client, {"annotation": "  "})
    assert is_error is True
    assert client.calls == []


@_async_test
async def test_search_distinguishes_empty_corpus_from_no_match():
    """The user's next move differs: "save one first" vs "try other words"."""
    empty = _FakeClient({"/annotations/search": {"annotations": [], "total": 0}})
    text, _ = await tools.search_location_annotations(empty, {"query": "casa"})
    assert "No location annotations saved yet" in text

    populated = _FakeClient({"/annotations/search": {"annotations": [], "total": 9}})
    text, _ = await tools.search_location_annotations(populated, {"query": "casa"})
    assert "No location annotations found matching: casa" in text


@_async_test
async def test_search_renders_scores():
    client = _FakeClient({"/annotations/search": {"total": 1, "annotations": [
        {"id": 3, "annotation": "casa da mãe", "created_at": "2026-01-01",
         "address": "Rua Y", "latitude": 1.0, "longitude": 2.0, "score": 0.87},
    ]}})
    text, _ = await tools.search_location_annotations(client, {"query": "casa"})
    assert "#3" in text and "score: 0.870" in text and "Rua Y" in text


@_async_test
async def test_update_and_delete_use_the_right_verbs():
    client = _FakeClient({"/annotations/5": {"ok": True}})
    await tools.update_location_annotation(client, {"annotation_id": 5, "annotation": "novo"})
    await tools.delete_location_annotation(client, {"annotation_id": 5})

    assert client.calls[0]["method"] == "PATCH"
    assert client.calls[0]["path"] == "/annotations/5"
    assert client.calls[0]["json"] == {"annotation": "novo"}
    assert client.calls[1]["method"] == "DELETE"
    assert client.calls[1]["path"] == "/annotations/5"


@_async_test
async def test_update_and_delete_turn_a_404_into_a_readable_message():
    client = _FakeClient(raises=HealthBackendError("no annotation #99", status_code=404))
    text, is_error = await tools.update_location_annotation(
        client, {"annotation_id": 99, "annotation": "x"})
    assert is_error is True and "#99" in text

    text, is_error = await tools.delete_location_annotation(client, {"annotation_id": 99})
    assert is_error is True and "#99" in text


@_async_test
async def test_update_requires_both_arguments():
    client = _FakeClient()
    for args in ({"annotation": "x"}, {"annotation_id": 1}, {"annotation_id": 1, "annotation": " "}):
        _, is_error = await tools.update_location_annotation(client, args)
        assert is_error is True
    assert client.calls == []


@_async_test
async def test_log_health_event_writes_and_surfaces_the_enrichment():
    client = _FakeClient({"/log": {"ok": True, "entry": {
        "text": "dormi mal", "category": "note",
        "location_label": "Coimbra, PT", "temperature_c": 21.4,
        "weather_desc": "parcialmente nublado"}}})
    text, is_error = await tools.log_health_event(client, {"text": "dormi mal", "category": "note"})

    call = client.calls[0]
    assert call["method"] == "POST"
    assert call["namespace"] == "health" and call["path"] == "/log"
    assert call["json"]["text"] == "dormi mal"
    assert is_error is False
    # Surfaced so the caller knows the context got captured, not just the text.
    assert "Coimbra, PT" in text and "21.4°C" in text and "parcialmente nublado" in text


@_async_test
async def test_log_health_event_validates_the_category_closed_set():
    client = _FakeClient()
    _, is_error = await tools.log_health_event(client, {"text": "x", "category": "breakfast"})
    assert is_error is True
    _, is_error = await tools.log_health_event(client, {"text": "  "})
    assert is_error is True
    assert client.calls == []


@_async_test
async def test_log_health_event_defaults_to_note():
    client = _FakeClient({"/log": {"ok": True, "entry": {}}})
    await tools.log_health_event(client, {"text": "almoço"})
    assert client.calls[0]["json"]["category"] == "note"


@_async_test
async def test_list_health_log_formats_timestamps_and_context():
    client = _FakeClient({"/log": {"entries": [
        {"category": "meal", "text": "almoço", "ts": 1787059200.0,
         "location_label": "Coimbra", "temperature_c": 20.0, "weather_desc": "sol"},
    ]}})
    text, _ = await tools.list_health_log(client, {"category": "meal", "limit": 5})
    assert client.calls[0]["params"]["category"] == "meal"
    assert "(meal) almoço" in text
    assert "Coimbra · 20.0°C, sol" in text


@_async_test
async def test_get_health_samples_asks_newest_first():
    """"how's my heart rate" means the newest readings — the window's
    from/until addressing is a different question with its own caller."""
    client = _FakeClient({"/samples": {"samples": [
        {"start_ts": 1787059200.0, "value": 62.0, "unit": "count/min",
         "text_value": None, "device_uuid": "abcdef123456"},
    ]}})
    text, is_error = await tools.get_health_samples(
        client, {"metric_type": "heart_rate", "since_ts": 100, "limit": 5})

    params = client.calls[0]["params"]
    assert params["metric_type"] == "heart_rate"
    assert params["order"] == "desc"
    assert params["from_ts"] == 100
    assert params["limit"] == 5
    assert is_error is False
    assert "62.0 count/min" in text and "(abcdef12)" in text


@_async_test
async def test_get_health_samples_prefers_text_value_for_text_metrics():
    client = _FakeClient({"/samples": {"samples": [
        {"start_ts": 1787059200.0, "value": None, "unit": None,
         "text_value": "asleep_core", "device_uuid": "abcdef123456"},
    ]}})
    text, _ = await tools.get_health_samples(client, {"metric_type": "sleep_analysis"})
    assert "asleep_core" in text and "None" not in text


@_async_test
async def test_get_health_samples_requires_a_metric_type():
    client = _FakeClient()
    _, is_error = await tools.get_health_samples(client, {})
    assert is_error is True
    assert client.calls == []


@_async_test
async def test_sync_health_now_reports_a_disconnected_phone_as_normal():
    client = _FakeClient({"/health/sync-request": {
        "ok": True, "sent": False, "reason": "iPhone not connected on this session"}})
    text, is_error = await tools.sync_health_now(client, {})
    # Not an error: the caller's next move (read the last synced values) is the
    # same either way.
    assert is_error is False
    assert "iPhone not connected" in text
    assert client.calls[0]["namespace"] == "mobile"


@_async_test
async def test_sync_health_now_confirms_a_delivered_request():
    client = _FakeClient({"/health/sync-request": {"ok": True, "sent": True}})
    text, is_error = await tools.sync_health_now(client, {"session_id": "s1"})
    assert is_error is False and "fresh HealthKit sync" in text
    assert client.calls[0]["json"] == {"session_id": "s1"}


@_async_test
async def test_get_devices_renders_presence():
    import time
    client = _FakeClient({"/devices": {"devices": [
        {"device_uuid": "uuid-1", "device_type": "iphone", "name": "iPhone de Frederico",
         "online": True, "last_seen": time.time()},
        {"device_uuid": "uuid-2abcdef", "device_type": "watch", "name": None,
         "online": False, "last_seen": time.time() - 3600},
    ]}})
    text, is_error = await tools.get_devices(client, {})
    assert is_error is False
    assert client.calls[0]["namespace"] == "mobile"
    assert "iPhone de Frederico [iphone] — online" in text
    # No name -> the uuid prefix, so the row is still identifiable.
    assert "uuid-2ab [watch] — offline (last seen 60m ago)" in text


@_async_test
async def test_every_tool_is_callable_through_the_dispatch():
    """Nothing in the schema is a dead entry — each one runs and returns text."""
    client = _FakeClient()
    minimal = {
        "save_location_annotation": {"annotation": "x"},
        "search_location_annotations": {"query": "x"},
        "update_location_annotation": {"annotation_id": 1, "annotation": "x"},
        "delete_location_annotation": {"annotation_id": 1},
        "log_health_event": {"text": "x"},
        "get_health_samples": {"metric_type": "heart_rate"},
    }
    for name in EXPECTED_TOOLS:
        r = await http_handler.handle_request(
            {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
             "params": {"name": name, "arguments": minimal.get(name, {})}},
            _FakeClient({} if name not in ("save_location_annotation",)
                        else {"/annotations": {"ok": True, "id": 1}}),
        )
        body = r["result"]["content"][0]["text"]
        assert isinstance(body, str) and body, name
        assert "Unknown tool" not in body, name
