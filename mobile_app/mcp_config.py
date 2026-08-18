"""Builds this app's own root ``mcp.json`` — the file aw-mcp-gateway's app-scan
reads directly.

Copied from ``aw-app-google-maps``'s module of the same name, including the
no-op-on-unchanged behaviour, which is not an optimisation: aw-mcp-gateway
reloads on **mtime**, and each reload briefly drops every tool it proxies —
including those of the session that triggered it. An unconditional rewrite on
every activate is a reload loop.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from .mcp import self_register

SERVER_NAME = self_register.MCP_SERVER_NAME


def build_mcp_servers(port: int | None = None) -> dict:
    return {SERVER_NAME: self_register.build_self_entry(port)}


def write_mcp_json(package_dir: str, port: int | None = None) -> dict:
    """Regenerate ``<package_dir>/mcp.json``, skipping the write when nothing
    changed."""
    doc = {"mcpServers": build_mcp_servers(port or int(os.environ.get("AW_PORT") or 9030))}
    body = json.dumps(doc, indent=2) + "\n"
    path = Path(package_dir) / "mcp.json"
    try:
        if path.read_text(encoding="utf-8") == body:
            return doc
    except FileNotFoundError:
        pass
    path.write_text(body, encoding="utf-8")
    return doc
