"""The 13 ``aw-mobile-app`` tools, ported from the monolith's
``src/mcp/mobile_app.py``.

**Names are identical to the monolith's on purpose.** The gateway prefixes by
server name, so ``get_location`` becomes ``aw__aw_mobile_app__get_location`` —
an agent prompt that already cites one of these needs the prefix added and
nothing else. Renaming here would have meant auditing every prompt for a tool
that silently no longer exists.

The 19 tools NOT ported (push notifications, the glasses display, session
pinning, watch dumps) all drive the device or the meta-display session system
rather than reading its data. They are a separate concern and a separate set of
aw-backend routes.

**What changed in the port, and what did not.** The output text is the same —
these are strings an agent reads aloud or summarises, and drifting them would
change how every answer sounds. What changed is the transport underneath: the
monolith called ``http://127.0.0.1:9123/api/...`` with the single-owner
``x-api-key``, which does not exist here. Everything now goes through
``health_client`` to ``/api/workspaces/{slug}/{health,mobile}/...`` with the
workspace's ``awlk_`` credential. Three consequences worth knowing:

* ``get_location``'s nearby-annotation lookup moved server-side (the route
  returns ``nearby_annotations`` with the fix) — the monolith read pgvector
  directly from the MCP process, which a workspace cannot do.
* ``get_health_samples`` gained a real upper bound underneath, but keeps the
  monolith's ``since_ts``/``limit`` signature so callers are unaffected.
* Every handler is async, because the transport is.
"""

from __future__ import annotations

import datetime as _dt
import logging

from ..health_client import HealthBackendError, NotConfigured

log = logging.getLogger("aw_apps.mobile")


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
]

TOOL_NAMES = [t["name"] for t in TOOLS_SCHEMA]

# A tool declared in the schema with no handler would appear in tools/list and
# fail on call — the exact "tool exists but does nothing" failure this port is
# supposed to avoid. Checked at import so it can never ship.
assert set(TOOL_NAMES) == set(DISPATCH), (
    f"schema/dispatch mismatch: {set(TOOL_NAMES) ^ set(DISPATCH)}"
)
