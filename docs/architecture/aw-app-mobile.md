---
repo: architecture
path: docs/architecture/aw-app-mobile.md
source: generated
edited: false
checksum: sha256:5eef1adce1b76ccd01ed1435bf6238901435506ee15b73905c129c15dd548188
---
# AW Mobile

- **repo**: aw-app-mobile
- **layer**: app
- **technologies**: python
- **health** (derived): planned

The workspace half of aw-mobile — the AW iPhone app, the Apple Watch app and the Meta glasses webapp. Installing it into a workspace creates the agents those clients talk to (Sonnet / Opus / Fable) in that tenant's Agents Platform, plus the aw-agent-watch skill that tells them how to answer on a 40mm screen or through text-to-speech. Nothing else in this workspace knows that a reply read aloud must carry no markdown; this app is where that contract lives.

## Connections
- `other` → **aw-app-agents-platform-runners** — Provides the contributes

## MCP tools
_none exposed_

## Requirements
_none documented_
