"""The 32 ``aw-mobile-app`` tools, ported from the monolith's
``src/mcp/mobile_app.py``.

**Names are identical to the monolith's on purpose.** The gateway prefixes by
server name, so ``get_location`` becomes ``aw__aw_mobile_app__get_location`` —
an agent prompt that already cites one of these needs the prefix added and
nothing else. Renaming here would have meant auditing every prompt for a tool
that silently no longer exists.

**What changed in the port, and what did not.** The output text is the same —
these are strings an agent reads aloud or summarises, and drifting them would
change how every answer sounds. What changed is the transport underneath: the
monolith called ``http://127.0.0.1:9123/api/...`` with the single-owner
``x-api-key``, which does not exist here. Everything now goes through
``health_client`` to ``/api/workspaces/{slug}/{health,mobile}/...`` with the
workspace's ``awlk_`` credential. Consequences worth knowing:

* ``get_location``'s nearby-annotation lookup moved server-side (the route
  returns ``nearby_annotations`` with the fix) — the monolith read pgvector
  directly from the MCP process, which a workspace cannot do.
* ``get_health_samples`` gained a real upper bound underneath, but keeps the
  monolith's ``since_ts``/``limit`` signature so callers are unaffected.
* Every handler is async, because the transport is.

**The 19 ported here on 2026-08-23** (session/device control, push/wake,
watch diagnostics, glasses display) all drive Frederico's real, live device
or session state rather than reading a per-workspace-separable dataset — see
``aw-backend``'s ``workspace_mobile.py`` module docstring for the gating
split: pinned faces got a real ``workspace_slug`` column (any workspace may
read/write its OWN pins), everything else here stays behind
``legacy_tenant.authorize_legacy`` (only the legacy owner workspace, i.e.
Frederico's own, may call it — any other workspace gets a named 403, not a
silent no-op). ``request_dump``/``request_db_reset``'s ``delivered`` field is
a bool here (aw-backend checks live presence), not the monolith's broadcast
recipient count — the tool text below reflects that rather than copying a
count phrasing that no longer matches what the route returns.

``list_display_apps`` is a deliberate reduction, not a straight port: the
monolith resolved it from the legacy single-tenant deployment's own
``aw.json`` ``workspace_apps`` config, which has no multi-tenant equivalent
in aw-backend. The ported version tells the caller to pass a URL/presentation
id directly to ``open_on_display`` instead of returning a lookup list.
"""

from __future__ import annotations

import datetime as _dt
import json
import logging
import urllib.parse

from ..health_client import HealthBackendError, NotConfigured

log = logging.getLogger("aw_apps.mobile")

#: Meta Display device-session bucket real hardware (Watch/iPhone) actually
#: reads/writes — NOT "meta-default", an unrelated orphan fallback. See
#: aw-backend's src/meta_display/routes.py module docstring.
_SHARED_DEVICE_SESSION = "aw-meta-shared"


def _fmt_ts(ts) -> str:
    try:
        return _dt.datetime.fromtimestamp(float(ts)).strftime("%Y-%m-%d %H:%M")
    except Exception:
        return str(ts)


def _format_annotation(r: dict, show_score: bool) -> str:
    parts = [f"#{r['id']} [{r.get('created_at') or '?'}]"]
    if show_score and r.get("score") is not None:
        parts[0] += f" (score: {r['score']:.3f})"
    line = f"{parts[0]} \"{r['annotation']}\""
    bits = []
    if r.get("address"):
        bits.append(r["address"])
    if r.get("latitude") is not None and r.get("longitude") is not None:
        bits.append(f"{r['latitude']}, {r['longitude']}")
    if bits:
        line += "\n    " + " — ".join(bits)
    return line


# ---------------------------------------------------------------------------
# Location
# ---------------------------------------------------------------------------


async def get_location(client, args: dict) -> tuple[str, bool]:
    source = (args.get("source") or "").strip()
    try:
        resp = await client.get("/location/latest", {"source": source}, namespace="mobile")
    except HealthBackendError as e:
        if e.status_code == 404:
            return ("No location has been reported yet — the companion app may not have "
                    "location permission, or hasn't sent a fix."), True
        raise

    lines = [
        f"Source: {resp.get('source')}",
        f"Coordinates: {resp.get('latitude')}, {resp.get('longitude')}"
        + (f" (±{resp['accuracy_m']:.0f}m)" if resp.get("accuracy_m") is not None else ""),
        f"Fix time: {resp.get('fix_time')}",
        f"Reported to server: {resp.get('reported_at')}",
    ]
    if resp.get("formatted_address"):
        lines.append(f"Address: {resp['formatted_address']}")
    if resp.get("city") or resp.get("state") or resp.get("postal_code") or resp.get("country"):
        lines.append(
            "City/State/Zip/Country: "
            f"{resp.get('city') or '?'}, {resp.get('state') or '?'}, "
            f"{resp.get('postal_code') or '?'}, {resp.get('country') or '?'}"
        )
    if resp.get("timezone"):
        lines.append(f"Timezone: {resp['timezone']}")

    nearby = resp.get("nearby_annotations") or []
    if nearby:
        lines.append("\nNearby saved location annotation(s):")
        for n in nearby:
            lines.append(f"- \"{n['annotation']}\" (~{n['distance_m']:.0f}m away)")

    return "\n".join(lines), False


async def get_location_history(client, args: dict) -> tuple[str, bool]:
    resp = await client.get("/location/history", {
        "source": (args.get("source") or "").strip(),
        "device_uuid": (args.get("device_uuid") or "").strip(),
        "since_ts": args.get("since_ts") or None,
        "limit": args.get("limit", 100),
    }, namespace="mobile")
    fixes = resp.get("fixes") or []
    if not fixes:
        return "No location history recorded yet for that filter.", False
    lines = [f"{len(fixes)} most recent location fix(es):\n"]
    for f in fixes:
        acc = f" (±{f['accuracy_m']:.0f}m)" if f.get("accuracy_m") is not None else ""
        tz = f" [{f['timezone']}]" if f.get("timezone") else ""
        lines.append(f"- [{f['fix_time']}] {f['source']}: {f['latitude']}, {f['longitude']}{acc}{tz}")
    return "\n".join(lines), False


async def get_location_stops(client, args: dict) -> tuple[str, bool]:
    resp = await client.get("/location/stops", {
        "source": (args.get("source") or "").strip(),
        "since_ts": args.get("since_ts") or None,
        "limit": args.get("limit", 500),
    }, namespace="mobile")
    stops = resp.get("stops") or []
    considered = resp.get("fixes_considered", 0)
    if not stops:
        return (f"No stops detected ({considered} fix(es) considered — all in transit "
                "or too brief)."), False

    lines = [f"{len(stops)} stop(s) detected (from {considered} fix(es)):\n"]
    for s in stops:
        place = s.get("annotation_label") or s.get("formatted_address") or s.get("city") or "unknown place"
        tz = f" [{s['timezone']}]" if s.get("timezone") else ""
        lines.append(
            f"- {place} — {s['latitude']}, {s['longitude']}{tz} — "
            f"{s['arrival_time']} to {s['departure_time']} "
            f"({s['duration_minutes']}min, {s['fix_count']} fixes)"
        )
    return "\n".join(lines), False


# ---------------------------------------------------------------------------
# Location annotations
# ---------------------------------------------------------------------------


async def save_location_annotation(client, args: dict) -> tuple[str, bool]:
    annotation = (args.get("annotation") or "").strip()
    if not annotation:
        return "Please provide 'annotation' (e.g. 'This is my mom's house').", True

    body = {"annotation": annotation}
    lat, lon = args.get("latitude"), args.get("longitude")
    if lat is not None and lon is not None:
        body["latitude"] = lat
        body["longitude"] = lon
        if (args.get("address") or "").strip():
            body["address"] = args["address"].strip()

    resp = await client.post("/annotations", body, namespace="mobile")

    if resp.get("address"):
        note = f" → {resp['address']}"
    elif resp.get("used_current_fix"):
        note = " (location saved, no address resolved)"
    elif resp.get("latitude") is not None:
        note = " (explicit coordinates saved, no address given)"
    else:
        note = " (no location available — saved without it)"
    return f"Saved location annotation #{resp['id']}: \"{annotation}\"{note}", False


async def search_location_annotations(client, args: dict) -> tuple[str, bool]:
    query = (args.get("query") or "").strip()
    if not query:
        return "Please provide a search 'query'.", True

    resp = await client.get("/annotations/search", {
        "query": query, "n_results": args.get("n_results", 5),
    }, namespace="mobile")
    results = resp.get("annotations") or []
    if not results:
        # Distinguishes an empty corpus from a query that matched nothing —
        # the user's next move differs ("save one first" vs "try other words").
        if not resp.get("total"):
            return "No location annotations saved yet.", True
        return f"No location annotations found matching: {query}", True

    lines = [f"Found {len(results)} location annotation(s) for: {query}\n"]
    for r in results:
        lines.append(_format_annotation(r, show_score=True))
    return "\n".join(lines), False


async def list_location_annotations(client, args: dict) -> tuple[str, bool]:
    resp = await client.get("/annotations", {"limit": args.get("limit", 20)},
                            namespace="mobile")
    rows = resp.get("annotations") or []
    if not rows:
        return "No location annotations saved yet.", False
    lines = [f"{len(rows)} most recent location annotation(s):\n"]
    for r in rows:
        lines.append(_format_annotation(r, show_score=False))
    return "\n".join(lines), False


async def update_location_annotation(client, args: dict) -> tuple[str, bool]:
    annotation_id = args.get("annotation_id")
    if annotation_id is None:
        return ("Please provide 'annotation_id' — the id of the annotation to update "
                "(see list_location_annotations)."), True
    new_text = (args.get("annotation") or "").strip()
    if not new_text:
        return "Please provide 'annotation' — the corrected text.", True

    try:
        await client.patch(f"/annotations/{int(annotation_id)}",
                           {"annotation": new_text}, namespace="mobile")
    except HealthBackendError as e:
        if e.status_code == 404:
            return f"No location annotation found with id #{annotation_id}.", True
        raise
    return f"Updated location annotation #{annotation_id}: \"{new_text}\"", False


async def delete_location_annotation(client, args: dict) -> tuple[str, bool]:
    annotation_id = args.get("annotation_id")
    if annotation_id is None:
        return ("Please provide 'annotation_id' — the id of the annotation to delete "
                "(see list_location_annotations)."), True
    try:
        await client.delete(f"/annotations/{int(annotation_id)}", namespace="mobile")
    except HealthBackendError as e:
        if e.status_code == 404:
            return f"No location annotation found with id #{annotation_id}.", True
        raise
    return f"Deleted location annotation #{annotation_id}.", False


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


async def log_health_event(client, args: dict) -> tuple[str, bool]:
    text = (args.get("text") or "").strip()
    if not text:
        return "Please provide 'text' — what to log (e.g. 'comendo um X-tudo').", True
    category = (args.get("category") or "note").strip().lower()
    if category not in ("meal", "mood", "symptom", "note"):
        return "category must be one of: meal, mood, symptom, note", True

    resp = await client.post("/log", {"text": text, "category": category,
                                      "source": "agent"})
    entry = resp.get("entry") or {}
    # Auto-enriched server-side from the freshest device fix + Open-Meteo —
    # surface it so the caller knows the context got captured, not just the
    # raw text.
    context_bits = []
    if entry.get("location_label"):
        context_bits.append(entry["location_label"])
    if entry.get("temperature_c") is not None:
        weather = f", {entry['weather_desc']}" if entry.get("weather_desc") else ""
        context_bits.append(f"{entry['temperature_c']}°C{weather}")
    context = f" [{' · '.join(context_bits)}]" if context_bits else ""
    return f"Logged ({category}): \"{text}\"{context}", False


async def list_health_log(client, args: dict) -> tuple[str, bool]:
    resp = await client.get("/log", {
        "category": (args.get("category") or "").strip(),
        "limit": args.get("limit", 20),
    })
    entries = resp.get("entries") or []
    if not entries:
        return "No health log entries yet.", False
    lines = [f"{len(entries)} most recent health log entr"
             f"{'y' if len(entries) == 1 else 'ies'}:\n"]
    for e in entries:
        context_bits = []
        if e.get("location_label"):
            context_bits.append(e["location_label"])
        if e.get("temperature_c") is not None:
            weather = f", {e['weather_desc']}" if e.get("weather_desc") else ""
            context_bits.append(f"{e['temperature_c']}°C{weather}")
        context = f" [{' · '.join(context_bits)}]" if context_bits else ""
        lines.append(f"- [{_fmt_ts(e['ts'])}] ({e['category']}) {e['text']}{context}")
    return "\n".join(lines), False


async def get_health_samples(client, args: dict) -> tuple[str, bool]:
    metric_type = (args.get("metric_type") or "").strip()
    if not metric_type:
        return ("Please provide 'metric_type' (e.g. 'heart_rate', 'sleep_analysis', "
                "'step_count')."), True
    resp = await client.get("/samples", {
        "metric_type": metric_type,
        "from_ts": args.get("since_ts") or None,
        # The monolith could only ever walk backwards from now. Keeping that
        # shape here — newest first — because it is what "how's my heart rate"
        # means; the window's from/until addressing is a different question and
        # has its own caller.
        "order": "desc",
        "limit": args.get("limit", 100),
    })
    samples = resp.get("samples") or []
    if not samples:
        return (f"No '{metric_type}' samples recorded yet — the companion app may not "
                "sync this metric."), False
    lines = [f"{len(samples)} most recent '{metric_type}' sample(s):\n"]
    for s in samples:
        val = s.get("text_value") or f"{s.get('value')} {s.get('unit') or ''}".strip()
        dev = (s.get("device_uuid") or "?")[:8]
        lines.append(f"- [{_fmt_ts(s['start_ts'])}] {val} ({dev})")
    return "\n".join(lines), False


async def sync_health_now(client, args: dict) -> tuple[str, bool]:
    session_id = (args.get("session_id") or "").strip()
    resp = await client.post("/health/sync-request",
                             {"session_id": session_id} if session_id else {},
                             namespace="mobile")
    if not resp.get("ok"):
        return f"Failed to request a health sync: {resp.get('error') or resp}", True
    if not resp.get("sent"):
        return (f"Couldn't ask for fresh data: {resp.get('reason', 'iPhone not connected')}. "
                "get_health_samples will still return the last synced values."), False
    return ("Asked the iPhone for a fresh HealthKit sync — wait a few seconds, then call "
            "get_health_samples to pick up the new data."), False


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------


async def get_devices(client, args: dict) -> tuple[str, bool]:
    import time as _time

    resp = await client.get("/devices", namespace="mobile")
    devices = resp.get("devices") or []
    if not devices:
        return "No devices registered yet.", False
    lines = [f"{len(devices)} registered device(s):\n"]
    for d in devices:
        age_min = (_time.time() - d["last_seen"]) / 60
        status_word = "online" if d["online"] else f"offline (last seen {age_min:.0f}m ago)"
        name = d.get("name") or d["device_uuid"][:8]
        lines.append(f"- {name} [{d['device_type']}] — {status_word}")
    return "\n".join(lines), False


# ---------------------------------------------------------------------------
# Push/navigate URL builders (pure — no client, ported verbatim)
# ---------------------------------------------------------------------------


def _maps_directions_url(lat, lon, label: str, mode: str) -> str:
    dirflg = {"walking": "w", "transit": "r"}.get(mode, "d")
    params = {"daddr": f"{lat},{lon}", "dirflg": dirflg}
    if label:
        params["q"] = label
    return "https://maps.apple.com/?" + urllib.parse.urlencode(params)


def _maps_pin_url(lat, lon, label: str) -> str:
    params = {"ll": f"{lat},{lon}"}
    if label:
        params["q"] = label
    return "https://maps.apple.com/?" + urllib.parse.urlencode(params)


def _uber_ride_url(lat, lon, label: str) -> str:
    params = {"action": "setPickup", "pickup": "my_location",
              "dropoff[latitude]": lat, "dropoff[longitude]": lon}
    if label:
        params["dropoff[nickname]"] = label
    return "https://m.uber.com/ul/?" + urllib.parse.urlencode(params)


# ---------------------------------------------------------------------------
# Session / device control
# ---------------------------------------------------------------------------


async def switch_session(client, args: dict) -> tuple[str, bool]:
    agent_session_id = (args.get("agent_session_id") or args.get("session") or "").strip()
    if not agent_session_id:
        return ("Please provide 'agent_session_id' — the target agent session id to "
                "switch to, or 'new' for a fresh session."), True
    session_id = (args.get("session_id") or "").strip() or None
    message = args.get("message")

    body: dict = {"agent_session_id": agent_session_id}
    if session_id:
        body["session_id"] = session_id
    if (args.get("cli") or "").strip():
        body["cli"] = args["cli"].strip()
    if (args.get("model") or "").strip():
        body["model"] = args["model"].strip()
    if message is not None:
        body["message"] = message

    resp = await client.post("/switch_session", body, namespace="mobile")
    if not resp.get("ok"):
        return f"Failed to switch session: {resp.get('detail') or resp.get('error') or resp}", True

    name = resp.get("session_name") or resp.get("agent_session_id") or agent_session_id
    note = ("and spoke/showed the switch announcement on the device" if resp.get("announced")
            else "device isn't live right now — it'll see the announcement next time it opens")
    return f"Switched the device to session \"{name}\" ({note}).", False


async def pin_session(client, args: dict) -> tuple[str, bool]:
    session_id = (args.get("session_id") or "").strip() or _SHARED_DEVICE_SESSION
    body = {
        "session_id": session_id,
        "target_id": (args.get("target_id") or "").strip(),
        "target_name": (args.get("target_name") or "").strip(),
        "agent_session_id": (args.get("agent_session_id") or "").strip(),
        "session_name": (args.get("session_name") or "").strip(),
    }
    resp = await client.post("/pinned/add", body, namespace="mobile")
    if not resp.get("ok"):
        return f"Failed to pin the session: {resp.get('error') or resp}", True
    pin = resp.get("pin") or {}
    name = pin.get("session_name") or pin.get("agent_session_id") or "session"
    return f"Pinned \"{name}\" as a new face on device \"{session_id}\" (pin id {pin.get('id')}).", False


async def new_session(client, args: dict) -> tuple[str, bool]:
    """Create a fresh agent session, pin it as a new face, and switch the
    device onto it — one call combining switch_session(agent_session_id="new")
    + pin_session + the device move."""
    session_id = (args.get("session_id") or "").strip() or _SHARED_DEVICE_SESSION
    session_name = (args.get("session_name") or "").strip()
    message = args.get("message")

    switch_body: dict = {"session_id": session_id, "agent_session_id": "new"}
    if message is not None:
        switch_body["message"] = message
    switch_resp = await client.post("/switch_session", switch_body, namespace="mobile")
    if not switch_resp.get("ok"):
        return (f"Failed to create the new session: "
                f"{switch_resp.get('detail') or switch_resp.get('error') or switch_resp}"), True

    new_sid = switch_resp.get("agent_session_id") or ""
    resolved_name = session_name or switch_resp.get("session_name") or "New session"
    target_id = (args.get("target_id") or "").strip() or (switch_resp.get("cli_type") or "").strip()
    target_name = (args.get("target_name") or "").strip() or target_id or "Agent"

    pin_body = {
        "session_id": session_id,
        "target_id": target_id,
        "target_name": target_name,
        "agent_session_id": new_sid,
        "session_name": resolved_name,
    }
    pin_resp = await client.post("/pinned/add", pin_body, namespace="mobile")
    if not pin_resp.get("ok"):
        return (f"Created session \"{resolved_name}\" and switched device \"{session_id}\" "
                f"onto it, but pinning it failed: {pin_resp.get('error') or pin_resp}"), True

    pin = pin_resp.get("pin") or {}
    return (f"Created and pinned a new session \"{resolved_name}\" "
            f"(pin id {pin.get('id')}, agent_session_id {new_sid}) "
            f"and moved device \"{session_id}\" onto it."), False


async def unpin_session(client, args: dict) -> tuple[str, bool]:
    session_id = (args.get("session_id") or "").strip() or _SHARED_DEVICE_SESSION
    pin_id = (args.get("pin_id") or "").strip()
    if not pin_id:
        return "Please provide 'pin_id' — use list_pins to find it.", True
    resp = await client.post("/pinned/remove", {"session_id": session_id, "pin_id": pin_id},
                             namespace="mobile")
    if not resp.get("ok"):
        return f"Failed to unpin: {resp.get('error') or resp}", True
    return f"Unpinned face {pin_id} from device \"{session_id}\".", False


async def list_pins(client, args: dict) -> tuple[str, bool]:
    session_id = (args.get("session_id") or "").strip()
    resp = await client.get("/pinned", {"session_id": session_id or _SHARED_DEVICE_SESSION},
                            namespace="mobile")
    pins = resp.get("pinned") or []
    if not pins:
        return f"No pinned faces on device \"{session_id or _SHARED_DEVICE_SESSION}\".", False
    lines = [f"- {p.get('id')}: {p.get('session_name') or p.get('agent_session_id') or '(unnamed)'} "
             f"(target: {p.get('target_name') or p.get('target_id')})" for p in pins]
    return f"Pinned faces on \"{session_id or _SHARED_DEVICE_SESSION}\":\n" + "\n".join(lines), False


async def list_devices(client, args: dict) -> tuple[str, bool]:
    """Devices that have at least one pinned face — distinct from get_devices
    (registered companion apps) and get_device_status (session presence)."""
    resp = await client.get("/pinned/devices", namespace="mobile")
    devices = resp.get("devices") or []
    if not devices:
        return "No devices have any pinned faces yet.", False
    return "Devices with pinned faces: " + ", ".join(devices), False


async def get_device_status(client, args: dict) -> tuple[str, bool]:
    session_id = (args.get("session_id") or "").strip() or "meta-default"
    resp = await client.get("/presence", {"session_id": session_id}, namespace="mobile")
    return f"Device presence for session {session_id}: {json.dumps(resp)}", False


async def list_ws_connections(client, args: dict) -> tuple[str, bool]:
    session_id = (args.get("session_id") or "").strip()
    resp = await client.get("/ws_connections", {"session_id": session_id} if session_id else {},
                            namespace="mobile")
    conns = resp.get("connections") or []
    if not conns:
        scope = f" for session {session_id}" if session_id else ""
        return f"No active WebSocket connections{scope}.", False
    lines = [
        f"- {c['device']} on session {c['session_id']} — connected {c['connected_seconds']:.0f}s ago"
        for c in conns
    ]
    return f"{len(conns)} active connection(s):\n" + "\n".join(lines), False


# ---------------------------------------------------------------------------
# Push / wake
# ---------------------------------------------------------------------------


async def send_push_notification(client, args: dict) -> tuple[str, bool]:
    body_text = (args.get("body") or "").strip()
    if not body_text:
        return "Please provide 'body' — the notification text.", True
    title = (args.get("title") or "AW").strip()

    payload: dict = {"title": title, "body": body_text}
    lat, lon = args.get("lat"), args.get("lon")
    if lat is not None and lon is not None:
        payload["url"] = _maps_pin_url(lat, lon, (args.get("label") or "").strip())

    resp = await client.post("/push_alert", payload, namespace="mobile")
    if not resp.get("ok"):
        return f"Failed to send push notification: {resp.get('error') or resp}", True
    suffix = " (tap opens the location in Maps)" if "url" in payload else ""
    return f"Push notification sent: \"{title}\" — {body_text}{suffix}", False


async def send_open_url(client, args: dict) -> tuple[str, bool]:
    url = (args.get("url") or "").strip()
    if not url:
        return ("Please provide 'url' — the URL/deep-link to open on tap "
                "(e.g. uber://, whatsapp://, tg://, https://..., maps://...)."), True
    label = (args.get("label") or "").strip()
    if not label:
        return "Please provide 'label' — human-readable text shown in the push notification body.", True

    resp = await client.post("/push_alert", {"title": "AW", "body": label, "url": url},
                             namespace="mobile")
    if not resp.get("ok"):
        return f"Failed to send push notification: {resp.get('error') or resp}", True
    return f"Push sent: \"{label}\" — tapping it opens {url}", False


async def send_navigate_to(client, args: dict) -> tuple[str, bool]:
    lat, lon = args.get("lat"), args.get("lon")
    if lat is None or lon is None:
        return "Please provide 'lat' and 'lon' — the destination coordinates.", True
    address = (args.get("address") or "").strip()
    if not address:
        return "Please provide 'address' — the destination's real address (shown in the push).", True
    alias = (args.get("alias") or "").strip()
    mode = (args.get("mode") or "driving").strip().lower()
    app = (args.get("app") or "maps").strip().lower()
    if app not in ("maps", "uber"):
        return "app must be one of: maps, uber", True

    label = alias or address
    url = _uber_ride_url(lat, lon, label) if app == "uber" else _maps_directions_url(lat, lon, label, mode)
    body_text = f"Navigate to: {alias} - {address}" if alias else f"Navigate to: {address}"

    resp = await client.post("/push_alert", {"title": "AW", "body": body_text, "url": url},
                             namespace="mobile")
    if not resp.get("ok"):
        return f"Failed to send navigation push: {resp.get('error') or resp}", True
    opens_where = "an Uber ride to the destination" if app == "uber" else f"{mode} directions in Maps"
    return f"Push sent: \"{body_text}\" — tapping it opens {opens_where}.", False


async def wake_app(client, args: dict) -> tuple[str, bool]:
    session_id = (args.get("session_id") or "").strip() or None
    resp = await client.post("/wake_app", {"session_id": session_id} if session_id else {},
                             namespace="mobile")
    if not resp.get("ok"):
        return f"Failed to wake the app: {resp.get('error') or resp}", True
    return "App woken silently (no banner, no call).", False


async def start_recording(client, args: dict) -> tuple[str, bool]:
    session_id = (args.get("session_id") or "").strip() or None
    resp = await client.post("/start_recording", {"session_id": session_id} if session_id else {},
                             namespace="mobile")
    if not resp.get("ok"):
        return f"Failed to start recording: {resp.get('error') or resp}", True
    return "Phone waking up and starting to record.", False


# ---------------------------------------------------------------------------
# Watch diagnostics — see this port's report re: gating request_watch_dump /
# reset_watch_db / list_watch_dumps behind explicit confirmation.
# ---------------------------------------------------------------------------


async def request_watch_dump(client, args: dict) -> tuple[str, bool]:
    session_id = (args.get("session_id") or "").strip() or None
    resp = await client.post("/request_dump", {"session_id": session_id} if session_id else {},
                             namespace="mobile")
    if not resp.get("ok"):
        return f"Failed to request a watch dump: {resp.get('error') or resp}", True
    if not resp.get("delivered"):
        return ("No device is currently connected on this session — "
                "nothing will answer. Try again once the Watch/iPhone is online."), False
    return ("Asked the connected device(s) for a client-state dump. "
            "The device answers asynchronously (usually within a few seconds) — call "
            "list_watch_dumps after a moment to retrieve it."), False


async def reset_watch_db(client, args: dict) -> tuple[str, bool]:
    session_id = (args.get("session_id") or "").strip() or None
    resp = await client.post("/request_db_reset", {"session_id": session_id} if session_id else {},
                             namespace="mobile")
    if not resp.get("ok"):
        return f"Failed to request a DB reset: {resp.get('error') or resp}", True
    if not resp.get("delivered"):
        return ("No device is currently connected on this session — "
                "nothing will act on this. Try again once the Watch is online."), False
    return ("Asked the connected device(s) to wipe their local message DB and "
            "refetch history from scratch. No response payload to check here — call "
            "request_watch_dump + list_watch_dumps afterward if you want to confirm the "
            "reset actually happened."), False


async def list_watch_dumps(client, args: dict) -> tuple[str, bool]:
    device_uuid = (args.get("device_uuid") or "").strip()
    limit = int(args.get("limit") or 20)
    resp = await client.get("/dumps", {"device_uuid": device_uuid, "limit": limit}, namespace="mobile")
    dumps = resp.get("dumps", [])
    lines = [f"{resp.get('total', len(dumps))} dump(s) on file"
             + (f" for device {device_uuid}" if device_uuid else "") + ":"]
    if not dumps:
        lines.append("(none yet — call request_watch_dump first, then wait a few seconds)")
    for d in dumps[:10]:
        lines.append(f"- {d['device_uuid']} @ {_fmt_ts(d['ts'])} — {d['path']}")
    last_requested = resp.get("last_requested") or {}
    if last_requested:
        lines.append("Last requested per session: " +
                      ", ".join(f"{sid}={_fmt_ts(ts)}" for sid, ts in last_requested.items()))
    last_received = resp.get("last_received_by_device") or {}
    if last_received:
        lines.append("Last received per device: " +
                      ", ".join(f"{dv}={_fmt_ts(ts)}" for dv, ts in last_received.items()))
    return "\n".join(lines), False


# ---------------------------------------------------------------------------
# Glasses display
# ---------------------------------------------------------------------------


async def open_on_display(client, args: dict) -> tuple[str, bool]:
    kind = (args.get("type") or "").strip().lower()
    target = (args.get("target") or "").strip()
    show_logs = bool(args.get("show_logs"))
    if kind not in ("app", "presentation"):
        return "Please provide 'type' as 'app' or 'presentation'.", True
    if not target:
        target_desc = "a component key" if show_logs else "a URL for 'app', or a presentation id for 'presentation'"
        return f"Please provide 'target' — {target_desc}.", True
    title = (args.get("title") or "").strip()
    session_id = (args.get("session_id") or "").strip() or None

    payload = {"type": kind, "target": target, "title": title, "show_logs": show_logs}
    if session_id:
        payload["session_id"] = session_id
    resp = await client.post("/display/open", payload, namespace="mobile")
    if not resp.get("ok"):
        return f"Failed to open on display: {resp.get('error') or resp}", True
    shown = f"logs for \"{target}\"" if show_logs else f"\"{title or target}\" ({kind})"
    if not resp.get("delivered"):
        return (f"Display state updated (showing {shown}), but no glasses webapp "
                "tab is currently connected to receive it live — it'll show once one connects."), False
    return f"Now showing fullscreen on the glasses display: {shown}.", False


async def whats_on_display(client, args: dict) -> tuple[str, bool]:
    session_id = (args.get("session_id") or "").strip()
    resp = await client.get("/display/state", {"session_id": session_id} if session_id else {},
                            namespace="mobile")
    if not resp.get("active"):
        return "Nothing is currently shown fullscreen on the glasses display.", False
    return (f"Currently showing on the glasses display: \"{resp.get('title') or resp.get('target')}\" "
            f"({resp.get('type')}, target={resp.get('target')})."), False


async def list_display_apps(client, args: dict) -> tuple[str, bool]:
    """Deliberate reduction, not a straight port — see module docstring.
    The monolith resolved this from the legacy deployment's own aw.json
    workspace_apps config, which has no per-workspace equivalent here."""
    return (
        "This workspace has no registry of \"known display apps\" the way the legacy "
        "single-tenant deployment did — pass open_on_display's 'target' directly: a full "
        "URL for type='app', or a presentation id for type='presentation'."
    ), False


DISPATCH = {
    "get_location": get_location,
    "get_location_history": get_location_history,
    "get_location_stops": get_location_stops,
    "save_location_annotation": save_location_annotation,
    "search_location_annotations": search_location_annotations,
    "list_location_annotations": list_location_annotations,
    "update_location_annotation": update_location_annotation,
    "delete_location_annotation": delete_location_annotation,
    "log_health_event": log_health_event,
    "list_health_log": list_health_log,
    "get_health_samples": get_health_samples,
    "sync_health_now": sync_health_now,
    "get_devices": get_devices,
    "switch_session": switch_session,
    "pin_session": pin_session,
    "new_session": new_session,
    "unpin_session": unpin_session,
    "list_pins": list_pins,
    "list_devices": list_devices,
    "get_device_status": get_device_status,
    "list_ws_connections": list_ws_connections,
    "send_push_notification": send_push_notification,
    "send_open_url": send_open_url,
    "send_navigate_to": send_navigate_to,
    "wake_app": wake_app,
    "start_recording": start_recording,
    "request_watch_dump": request_watch_dump,
    "reset_watch_db": reset_watch_db,
    "list_watch_dumps": list_watch_dumps,
    "open_on_display": open_on_display,
    "whats_on_display": whats_on_display,
    "list_display_apps": list_display_apps,
}


# Schemas are verbatim from the monolith (src/mcp/mobile_app.py's
# TOOLS_SCHEMA) — the descriptions are what an agent reads to decide whether a
# tool applies, and they were written against real usage. Rewording them is a
# behaviour change dressed as a tidy-up.
TOOLS_SCHEMA = [
    {
        "name": "get_location",
        "description": (
            "Get the most recent GPS location reported by the user's companion app "
            "(iPhone or Apple Watch), including a reverse-geocoded street address, "
            "city, state, postal code, and country. Also returns when the fix was "
            "taken and when it was last reported to the server, so you can judge "
            "staleness. If any saved location annotation is within ~200m of this "
            "fix (e.g. 'Casa da mãe do Frederico'), it's automatically included in "
            "the response too."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "source": {
                    "type": "string",
                    "description": "Which device to query ('iphone', 'watch'). Omit for the most recently updated device.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_location_history",
        "description": (
            "Get past GPS fixes reported by the companion app, ordered most "
            "recent first — the location HISTORY trail (unlike get_location, "
            "which only returns the current fix). Raw coordinates only, no "
            "reverse-geocoded address. Use for 'where was I earlier', 'show my "
            "movement today', or building a track of past positions."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "source": {
                    "type": "string",
                    "description": "Which device type to query ('iphone', 'watch'). Omit for all devices.",
                },
                "device_uuid": {
                    "type": "string",
                    "description": "Stable per-install device id (from get_devices) to narrow to one physical device, e.g. if there are two iPhones. Omit for all devices of the given source.",
                },
                "since_ts": {
                    "type": "number",
                    "description": "Unix timestamp (seconds) — only return fixes at/after this time. Omit for no lower bound.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max number of fixes to return.",
                    "default": 100,
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_location_stops",
        "description": (
            "Get detected 'stops' from the location history — places the "
            "user stayed for 20+ minutes within ~25m, collapsed from the "
            "raw GPS trail into one entry each: center coordinates, arrival/"
            "departure time, duration, a reverse-geocoded address, and (when "
            "one exists) the matching saved location annotation label. Use "
            "this instead of get_location_history for 'where did I go "
            "today', 'how long was I at X' — it's the movement/stops summary, "
            "not a raw fix-by-fix trail. Fixes that never settle (moving/"
            "transit, or too brief) are dropped."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "source": {
                    "type": "string",
                    "description": "Which device type to query ('iphone', 'watch'). Omit for all devices.",
                },
                "since_ts": {
                    "type": "number",
                    "description": "Unix timestamp (seconds) — only consider fixes at/after this time. Omit for no lower bound.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max raw fixes to consider before clustering (not the number of stops returned).",
                    "default": 500,
                },
            },
            "required": [],
        },
    },
    {
        "name": "save_location_annotation",
        "description": (
            "Save a note about WHERE something is — e.g. user says 'estou na casa da "
            "minha mãe' or 'isto é o Legatal'. This is NOT a general-purpose notes tool "
            "(the user has Notion for that) — only use it to record a place's "
            "identity/location so it can be resolved later, e.g. to order an Uber "
            "there. Later found via search_location_annotations.\n\n"
            "By default this tags the user's CURRENT GPS fix (device must have "
            "reported one recently). To save a place the user is NOT currently at "
            "(e.g. a property in another city they're describing remotely), pass "
            "'latitude'+'longitude' explicitly instead — geocode a free-text address "
            "first with the aw-google-maps 'geocode_address' tool if you only have an "
            "address, then pass its coordinates here along with 'address' "
            "(the formatted address string). Always check the user's current location "
            "(get_location) against the address before assuming they're on-site."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "annotation": {
                    "type": "string",
                    "description": "What this place is, e.g. \"This is my mom's house\" or \"Legatal\".",
                },
                "latitude": {
                    "type": "number",
                    "description": "Explicit latitude to save instead of the current GPS fix (use with 'longitude'). For places the user isn't currently at — e.g. geocoded from an address they described.",
                },
                "longitude": {
                    "type": "number",
                    "description": "Explicit longitude to save instead of the current GPS fix (use with 'latitude').",
                },
                "address": {
                    "type": "string",
                    "description": "Formatted address to store alongside explicit 'latitude'/'longitude'. Ignored if latitude/longitude are omitted (the current fix's reverse-geocoded address is used instead).",
                },
            },
            "required": ["annotation"],
        },
    },
    {
        "name": "search_location_annotations",
        "description": (
            "Find the address/location of a place by semantic meaning over previously "
            "saved location annotations — e.g. 'endereço da casa da minha mãe', 'onde "
            "fica o Legatal', 'pede um Uber pra casa da minha mãe'. Use this whenever "
            "the user refers to a place by name/relationship instead of giving "
            "coordinates or an address directly."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural language description of the place to resolve",
                },
                "n_results": {
                    "type": "integer",
                    "description": "Number of results to return (default: 5)",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "list_location_annotations",
        "description": "List saved location annotations, most recent first (no search — plain browse).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Max number of annotations to return (default: 20)",
                    "default": 20,
                },
            },
            "required": [],
        },
    },
    {
        "name": "update_location_annotation",
        "description": (
            "Fix a previously saved location annotation's text (e.g. it was "
            "mislabeled or is now outdated) — re-embeds the new text so "
            "search_location_annotations keeps working. Coordinates/address "
            "are left untouched. Use list_location_annotations or "
            "search_location_annotations first to find the 'id' to edit."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "annotation_id": {
                    "type": "integer",
                    "description": "The id of the annotation to update (from list_location_annotations/search_location_annotations).",
                },
                "annotation": {
                    "type": "string",
                    "description": "The corrected annotation text.",
                },
            },
            "required": ["annotation_id", "annotation"],
        },
    },
    {
        "name": "delete_location_annotation",
        "description": (
            "Permanently delete a saved location annotation — e.g. it was "
            "saved by mistake or is superseded by a newer, correct one. Use "
            "list_location_annotations or search_location_annotations first "
            "to find the 'id' to delete. This is a hard delete, not reversible."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "annotation_id": {
                    "type": "integer",
                    "description": "The id of the annotation to delete (from list_location_annotations/search_location_annotations).",
                },
            },
            "required": ["annotation_id"],
        },
    },
    {
        "name": "log_health_event",
        "description": (
            "Log a manual free-text health event — e.g. Frederico says 'estou comendo "
            "um X-tudo' or 'dormi mal hoje'. This is the write side of the health data "
            "pipeline (the read side syncs structured HealthKit samples automatically "
            "from the companion app). Use category to classify the entry."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "What to log, in the user's own words.",
                },
                "category": {
                    "type": "string",
                    "enum": ["meal", "mood", "symptom", "note"],
                    "description": "Entry category (default: note).",
                },
            },
            "required": ["text"],
        },
    },
    {
        "name": "list_health_log",
        "description": "List manually logged health events (meals, mood, symptoms, notes), most recent first.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "enum": ["meal", "mood", "symptom", "note"],
                    "description": "Filter to one category (default: all).",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max entries to return (default: 20)",
                    "default": 20,
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_health_samples",
        "description": (
            "Query synced HealthKit samples by metric type — e.g. 'heart_rate', "
            "'sleep_analysis', 'step_count', 'active_energy', 'workout'. Requires the "
            "companion app's HealthKit sync to be set up and have sent data for that "
            "metric already."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "metric_type": {
                    "type": "string",
                    "description": "HealthKit metric identifier, e.g. 'heart_rate', 'sleep_analysis', 'step_count'.",
                },
                "since_ts": {
                    "type": "number",
                    "description": "Optional unix timestamp — only samples starting at or after this.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max samples to return (default: 100)",
                    "default": 100,
                },
            },
            "required": ["metric_type"],
        },
    },
    {
        "name": "sync_health_now",
        "description": (
            "Ask the iPhone for a fresh HealthKit sync right now, bypassing the passive "
            "30-min throttle — use this before get_health_samples when the last known "
            "value (e.g. heart_rate) looks stale and you need a current reading. Only "
            "works if the companion app is currently connected (the app never pushes "
            "unprompted; this just asks sooner than the automatic online-transition "
            "trigger would). Wait a few seconds after calling this before re-querying "
            "get_health_samples."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "Meta Display session id (defaults to the shared session).",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_devices",
        "description": (
            "List all registered companion devices (iPhone/Watch/etc.) with their "
            "online status and last-seen time, keyed by a stable per-install device "
            "ID (not just device type) — distinct from get_device_status, which is "
            "the older Meta Display session-scoped presence check."
        ),
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "switch_session",
        "description": (
            "Switch the active agent session bound to a device (glasses/Watch/iOS AW "
            "companion app) to a different agent conversation — the same thing "
            "Frederico's own agent-picker 'Aplicar' does on-device, but triggerable by "
            "an agent. This is a 'Mobile Session' switch, not a Watch-only one: iPhone "
            "and Watch share the same default device session id, so one call rebinds "
            "and announces the change on BOTH at once. After switching, announces the "
            "change into the newly-active session (spoken + shown) so it's clear on the "
            "device that the session changed, even if the app is asleep right now — in "
            "that case the announcement lands as soon as it reopens instead of live."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent_session_id": {
                    "type": "string",
                    "description": "Target agent session id to bind the device to, or 'new' for a fresh session.",
                },
                "session_id": {
                    "type": "string",
                    "description": "Meta Display device session id to rebind (defaults to the shared session).",
                },
                "cli": {
                    "type": "string",
                    "description": "Optional CLI type to switch to alongside the session. Usually not needed — omit unless changing CLI too.",
                },
                "model": {
                    "type": "string",
                    "description": "Optional model to switch to alongside the session. Usually not needed.",
                },
                "message": {
                    "type": "string",
                    "description": "Announcement text spoken/shown on the device after the switch (default: \"Sessão trocada.\"). Pass an empty string to switch silently.",
                },
            },
            "required": ["agent_session_id"],
        },
    },
    {
        "name": "pin_session",
        "description": (
            "Add a new pinned session 'face' to a Meta Display device (Apple Watch "
            "carousel, iOS side menu). Unlike switch_session (which rebinds what's "
            "currently showing), this ADDS a face without touching the active one. "
            "The pin is stored server-side and broadcast as a change notification; "
            "picking it up live on-device depends on that device's own pinned-faces "
            "sync — a server-added pin may only show up on the next app-side refresh."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "Meta Display device session id to pin onto (defaults to 'aw-meta-shared', the real Watch/iPhone shared device — NOT 'meta-default', which is an unrelated orphan bucket no physical device uses).",
                },
                "target_id": {
                    "type": "string",
                    "description": "agents-platform target/agent slug this face points at.",
                },
                "target_name": {
                    "type": "string",
                    "description": "Friendly agent name to show on the face.",
                },
                "agent_session_id": {
                    "type": "string",
                    "description": "The agent (CLI) session id this face should open — e.g. the caller's own $AW_SESSION_ID to pin 'this conversation'. Leave empty to pin an unresolved 'new session' face.",
                },
                "session_name": {
                    "type": "string",
                    "description": "Display name for the face (e.g. session title/rename).",
                },
            },
            "required": [],
        },
    },
    {
        "name": "new_session",
        "description": (
            "Create a brand-new agent session, pin it as a new face, and switch the "
            "device onto it — one call combining switch_session(agent_session_id='new') "
            "+ pin_session + the device move, instead of chaining three tool calls. "
            "Use this when the ask is 'start a new conversation and put it on my "
            "Watch/phone', not just 'switch to a different existing session' "
            "(switch_session) or 'pin this existing session' (pin_session)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "Meta Display device session id to pin/switch onto (defaults to 'aw-meta-shared', the real Watch/iPhone shared device).",
                },
                "target_id": {
                    "type": "string",
                    "description": "agents-platform target/agent slug this face points at. Defaults to whatever CLI/agent is already configured for the device.",
                },
                "target_name": {
                    "type": "string",
                    "description": "Friendly agent name to show on the face. Defaults to target_id.",
                },
                "session_name": {
                    "type": "string",
                    "description": "Display name for the new session/face (e.g. a topic name). Defaults to the auto-generated session title.",
                },
                "message": {
                    "type": "string",
                    "description": "Announcement text spoken/shown on the device after the switch (default: \"Sessão trocada.\"). Pass an empty string to switch silently.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "unpin_session",
        "description": "Remove one pinned face from a Meta Display device by its pin id (from list_pins).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "Meta Display device session id (defaults to 'aw-meta-shared', the real Watch/iPhone shared device).",
                },
                "pin_id": {
                    "type": "string",
                    "description": "The face's pin id, from list_pins.",
                },
            },
            "required": ["pin_id"],
        },
    },
    {
        "name": "list_pins",
        "description": "List the pinned session faces for a Meta Display device.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "Meta Display device session id to filter by. Omit to use the default shared device ('aw-meta-shared' — the real Watch/iPhone).",
                },
            },
            "required": [],
        },
    },
    {
        "name": "list_devices",
        "description": "List the Meta Display device session ids that currently have at least one pinned face.",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_device_status",
        "description": (
            "Check which of Frederico's companion devices (iPhone / Apple Watch) are "
            "currently online for a Meta Display session — same presence data as the "
            "green/dim online dots in the glasses webapp header."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "Meta Display session id (defaults to \"meta-default\").",
                },
            },
            "required": [],
        },
    },
    {
        "name": "list_ws_connections",
        "description": (
            "List every currently-open /ws/meta WebSocket connection — device tag "
            "(iphone/watch/glasses/unspecified) and how long each has been connected. "
            "Unlike get_device_status (which only reports iPhone/Watch booleans), this "
            "also shows webapp/glasses connections and raw connection age — use it to "
            "check whether the /meta webapp is genuinely open right now, not just "
            "inferred from logs."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "Meta Display session id — omit to list every session's connections.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "send_push_notification",
        "description": (
            "Send a normal, visible push notification (banner + sound) to Frederico's "
            "iPhone via the AW companion app. Use this to proactively reach him outside "
            "any chat — e.g. a long-running task finished, a build failed, something "
            "needs his attention right now. This is a direct alert, not a chat reply — "
            "it shows up even if he's not in any AW conversation. Optionally attach a "
            "location (lat/lon) — tapping the notification then opens that coordinate "
            "in Maps instead of just foregrounding the app."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Notification title (defaults to \"AW\" if omitted).",
                },
                "body": {
                    "type": "string",
                    "description": "Notification body text — keep it short, this is a banner.",
                },
                "lat": {
                    "type": "number",
                    "description": "Optional latitude — tapping the notification opens this in Maps.",
                },
                "lon": {
                    "type": "number",
                    "description": "Optional longitude — required if lat is given.",
                },
                "label": {
                    "type": "string",
                    "description": "Optional place name/address shown as the Maps pin label.",
                },
            },
            "required": ["body"],
        },
    },
    {
        "name": "send_open_url",
        "description": (
            "Send a push notification that, when tapped, opens ANY URL or "
            "deep-link on Frederico's iPhone — not limited to a fixed set of "
            "apps. Give it a raw URL/deep-link string (e.g. an Uber "
            "universal link, 'whatsapp://send?phone=...' or "
            "'https://wa.me/<number>' for a WhatsApp chat, "
            "'tg://resolve?domain=<username>' for Telegram, a plain "
            "'https://...' to open in Safari/Chrome, 'maps://...', or any "
            "other app's URL scheme / universal link) and it pushes through "
            "the same notification mechanism as send_navigate_to and "
            "send_push_notification. Use this for anything send_navigate_to "
            "doesn't already cover (it's a convenience wrapper over this "
            "tool for the 'give me coordinates, build the Maps/Uber URL' "
            "case)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL/deep-link to open on tap.",
                },
                "label": {
                    "type": "string",
                    "description": "Human-readable text shown in the push notification body (e.g. 'Uber to Cristo', 'WhatsApp: Mãe', 'Open google.com').",
                },
            },
            "required": ["url", "label"],
        },
    },
    {
        "name": "send_navigate_to",
        "description": (
            "Send a push notification that, when tapped, opens turn-by-turn "
            "directions in Apple Maps (or, with app='uber', requests an Uber "
            "ride) on Frederico's iPhone FROM his current location TO the "
            "given destination. The push body reads \"Navigate to: "
            "<alias> - <address>\" when an alias is given (e.g. 'Cristo', "
            "'Mãe'), or just \"Navigate to: <address>\" when there's no "
            "alias. Use get_location or search_location_annotations first if "
            "you only have a place name, not coordinates. Convenience "
            "wrapper around send_open_url that builds the right Maps/Uber "
            "URL for you; for any other app/destination, use send_open_url "
            "directly."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "lat": {
                    "type": "number",
                    "description": "Destination latitude.",
                },
                "lon": {
                    "type": "number",
                    "description": "Destination longitude.",
                },
                "address": {
                    "type": "string",
                    "description": "Destination's real address — always shown in the push.",
                },
                "alias": {
                    "type": "string",
                    "description": "Friendly name for the place (e.g. 'Cristo', 'Mãe'), shown before the address when given.",
                },
                "mode": {
                    "type": "string",
                    "enum": ["driving", "walking", "transit"],
                    "description": "Travel mode (default: driving), only used when app='maps'.",
                },
                "app": {
                    "type": "string",
                    "enum": ["maps", "uber"],
                    "description": "Which app the tap opens: 'maps' for turn-by-turn directions (default), or 'uber' to request an Uber ride to the destination instead.",
                },
            },
            "required": ["lat", "lon", "address"],
        },
    },
    {
        "name": "wake_app",
        "description": (
            "Silently wake the AW companion app on Frederico's iPhone via a background "
            "push — no banner, no sound, no call UI. Use this to get the app running "
            "ahead of time (e.g. before something that needs it) without alerting him. "
            "For a wake that also starts recording, use start_recording instead."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "Meta Display session id (defaults to the shared session).",
                },
            },
            "required": [],
        },
    },
    {
        "name": "start_recording",
        "description": (
            "Wake the iPhone and start recording via the same VoIP/CallKit path the "
            "glasses mic button uses — fastest wake, phone auto-answers and starts "
            "listening. No-ops with an explanation if the phone is already connected "
            "or a wake is already in flight."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "Meta Display session id (defaults to the shared session).",
                },
            },
            "required": [],
        },
    },
    {
        "name": "request_watch_dump",
        "description": (
            "Ask every connected companion device (primarily the Apple Watch) to report "
            "its client-side state right now — send queue contents, poll cursor/epoch, "
            "seen-message count, connection-indicator history. Use this to diagnose Watch "
            "sync/delivery issues live instead of guessing from server-side logs alone. "
            "The device answers asynchronously — call list_watch_dumps a few seconds "
            "after calling this to retrieve it."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "Meta Display session id (defaults to the shared session).",
                },
            },
            "required": [],
        },
    },
    {
        "name": "reset_watch_db",
        "description": (
            "Ask every connected companion device (primarily the Apple Watch) to wipe "
            "its local message database and refetch history from scratch. Use this after "
            "changing the on-device DB schema, or to recover a device whose local state "
            "looks corrupted/inconsistent — NOT as a routine operation, it discards "
            "locally-tracked state like which replies were already played."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "Meta Display session id (defaults to the shared session).",
                },
            },
            "required": [],
        },
    },
    {
        "name": "list_watch_dumps",
        "description": (
            "List client-state dumps a companion device has answered (see "
            "request_watch_dump), newest first, with each dump's file path and "
            "timestamp. Also reports when a dump was last REQUESTED per session and "
            "last RECEIVED per device_uuid, so you can tell 'asked but never answered' "
            "from 'answered a while ago'."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "device_uuid": {
                    "type": "string",
                    "description": "Filter to one device's dumps (see get_device_status for known device_uuids). Omit to list across all devices.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max dumps to return, newest first (default 20).",
                },
            },
            "required": [],
        },
    },
    {
        "name": "open_on_display",
        "description": (
            "Push a workspace app, an aw-presentation, or a live log stream onto "
            "the Meta Display glasses webapp, taking over the whole screen (slim "
            "titlebar with the given title + an X to close) — the user just sees "
            "fullscreen content until they close it. Use this to actively show "
            "Frederico something on the glasses (a live dashboard, a presentation "
            "you just built, a component's logs) rather than just linking it in "
            "chat. Check whats_on_display first if you want to avoid clobbering "
            "something already showing."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "enum": ["app", "presentation"],
                    "description": "'app' for a URL to show fullscreen (or, with show_logs, a component key to tail), 'presentation' for an aw-presentation (target is its presentation id). Ignored when show_logs is true.",
                },
                "target": {
                    "type": "string",
                    "description": (
                        "A full URL (type='app'), the presentation id "
                        "(type='presentation'), or — when show_logs is true — the "
                        "component key to tail (e.g. 'awserv', 'docker:aw-custom-<slug>')."
                    ),
                },
                "title": {
                    "type": "string",
                    "description": "Title shown in the fullscreen titlebar.",
                },
                "show_logs": {
                    "type": "boolean",
                    "description": (
                        "If true, switch the glasses webapp into a live log-tail view "
                        "for the component named by 'target' instead of opening it as "
                        "an app."
                    ),
                },
                "session_id": {
                    "type": "string",
                    "description": "Meta Display session id (defaults to the shared session).",
                },
            },
            "required": ["type", "target"],
        },
    },
    {
        "name": "whats_on_display",
        "description": (
            "Check what's currently shown fullscreen on the Meta Display glasses webapp "
            "(if anything) before deciding to push something new with open_on_display."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "Meta Display session id (defaults to the shared session).",
                },
            },
            "required": [],
        },
    },
    {
        "name": "list_display_apps",
        "description": (
            "Explain how to target open_on_display. Unlike the legacy single-tenant "
            "deployment, this workspace has no registry of known display apps to list — "
            "pass a full URL (type='app') or a presentation id (type='presentation') "
            "directly to open_on_display."
        ),
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
]

TOOL_NAMES = [t["name"] for t in TOOLS_SCHEMA]

# A tool declared in the schema with no handler would appear in tools/list and
# fail on call — the exact "tool exists but does nothing" failure this port is
# supposed to avoid. Checked at import so it can never ship.
assert set(TOOL_NAMES) == set(DISPATCH), (
    f"schema/dispatch mismatch: {set(TOOL_NAMES) ^ set(DISPATCH)}"
)
