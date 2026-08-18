"""The manifest IS this app.

There is no route, no window and no CLI here — everything the app delivers is
a declaration in ``aw-app.json`` that some other component seeds. So the only
thing worth testing is that those declarations are well-formed and internally
consistent, which is exactly what breaks silently otherwise: Agents Platform
stores ``model_slug`` / ``agent_config_slug`` / ``skill_slugs`` as plain
strings, so an agent pointing at something that does not exist is created
happily and only fails when someone dictates into their watch.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

APP_DIR = Path(__file__).resolve().parents[1]
MANIFEST = APP_DIR / "aw-app.json"

#: Model slugs that exist in Agents Platform as `provider: runner` rows — the
#: ones a workspace runner can actually execute. Verified live against
#: /api/models on 2026-08-16.
KNOWN_RUNNER_MODELS = {
    "claude-runner-sonnet",
    "claude-runner-opus",
    "claude-runner-fable",
    "claude-runner-haiku",
    "claude-runner-readonly",
    "codex-runner-gpt-5",
}

#: Config bundle the Watch agents run under. Owned by the platform, NOT
#: declared here — its mcp_config carries a live gateway bearer token and this
#: repo is public. Pinned so the dependency is at least written down.
EXPECTED_AGENT_CONFIG = "agent-config-aw-full"


@pytest.fixture(scope="module")
def manifest() -> dict:
    return json.loads(MANIFEST.read_text())


@pytest.fixture(scope="module")
def agents(manifest) -> list[dict]:
    return manifest["contributes"]["agents"]["agents"]


def test_manifest_is_valid_json_with_the_expected_identity(manifest):
    assert manifest["id"] == "mobile"
    assert manifest["manifest_version"] == 1


def test_declares_the_capability_its_contribution_needs(manifest):
    # Core rejects contributes.agents without this — a missing capability
    # fails the install rather than silently dropping the contribution.
    assert "agents:contribute" in manifest["permissions"]


def test_ships_the_three_variants(agents):
    assert {a["slug"] for a in agents} == {
        "watch-sonnet", "watch-opus", "watch-fable"
    }


def test_every_agent_names_a_real_runner_model(agents):
    for a in agents:
        assert a["model_slug"] in KNOWN_RUNNER_MODELS, (
            f"{a['slug']} points at model {a['model_slug']!r}, which is not a "
            "runner model — the platform will create the agent anyway and the "
            "failure only surfaces at dispatch"
        )


def test_the_three_variants_use_three_different_models(agents):
    models = [a["model_slug"] for a in agents]
    assert len(set(models)) == len(models), (
        "shipping three agents on the same model gives the user a choice that "
        "isn't one"
    )


def test_every_agent_uses_the_platform_owned_config_bundle(agents):
    for a in agents:
        assert a["agent_config_slug"] == EXPECTED_AGENT_CONFIG


def _declared_config(manifest):
    for c in manifest["contributes"]["agents"].get("agent_configs", []):
        if c["slug"] == EXPECTED_AGENT_CONFIG:
            return c
    raise AssertionError(f"{EXPECTED_AGENT_CONFIG} is not declared by this app")


def test_the_config_bundle_is_declared_by_reference(manifest):
    """It must be declared — an undeclared config is a row nobody owns, and
    that is how this one ended up pointing at `127.0.0.1:9200` (the agent's
    own container, not the gateway) with a rotated token, giving every agent
    under it zero MCP tools.

    Declaring it is also what makes the repair automatic: the provisioner
    re-asserts credentials on every activation, but only for by-reference
    entries.
    """
    cfg = _declared_config(manifest)
    assert cfg["mcp_servers"] == ["aw-gateway"]


def test_the_config_bundle_carries_no_credential(manifest):
    """The original guard, kept and sharpened. This repo is public: the point
    was never 'do not declare it', it was 'do not commit the token'. The
    by-reference form satisfies both — the provisioner resolves URL and token
    from the workspace's own .mcp.json at activation.
    """
    cfg = _declared_config(manifest)
    assert "mcp_config" not in cfg, "a literal mcp_config would inline the bearer token"
    assert "headers" not in cfg
    # Prose is exempt: this config's own description explains why the token is
    # NOT here, and a blunt substring scan would flag the explanation itself.
    # What must stay clean is everything that becomes configuration.
    payload = {k: v for k, v in cfg.items() if k not in ("description", "name")}
    blob = json.dumps(payload).lower()
    for leak in ("authorization", "bearer", "token", "9200", "127.0.0.1"):
        assert leak not in blob, f"{leak!r} must not appear in a public manifest"


def test_every_agent_carries_the_watch_skill(agents, manifest):
    contributed = {s["id"] for s in manifest["contributes"]["skills"]}
    for a in agents:
        assert a["skill_slugs"] == ["aw-agent-watch"]
        for slug in a["skill_slugs"]:
            assert slug in contributed, (
                f"{a['slug']} loads skill {slug!r}, which this app does not "
                "ship — load_skill would find nothing and the agent runs with "
                "no channel contract at all"
            )


def test_declared_skill_files_exist(manifest):
    for skill in manifest["contributes"]["skills"]:
        assert (APP_DIR / skill["path"]).is_file(), skill["path"]


def test_declared_prompt_files_exist(agents):
    for a in agents:
        assert (APP_DIR / a["system_prompt_file"]).is_file(), a["system_prompt_file"]


def test_prompt_repeats_the_no_markdown_rule_as_a_safety_net(agents):
    """The skill is the source of truth, but core only injects it when the
    skills tree is actually mounted — which has silently failed before
    (load_skill saw zero skills for weeks). The prompt has to carry the one
    rule whose absence makes every reply wrong."""
    for a in agents:
        prompt = (APP_DIR / a["system_prompt_file"]).read_text()
        assert "markdown" in prompt.lower()


def test_skill_frontmatter_has_name_and_description(manifest):
    for skill in manifest["contributes"]["skills"]:
        text = (APP_DIR / skill["path"]).read_text()
        assert text.startswith("---\n")
        frontmatter = text.split("---", 2)[1]
        assert "name:" in frontmatter
        assert "description:" in frontmatter


def test_no_bearer_token_anywhere_in_the_manifest():
    """This repo is public. The gateway token that lives in the platform's
    agent-config is exactly the kind of value that gets pasted in 'just to
    make it work'."""
    raw = MANIFEST.read_text()
    assert "Bearer " not in raw
    assert "Authorization" not in raw


def test_depends_on_the_provider_without_requiring_it(manifest):
    dep = next(d for d in manifest["dependencies"]["apps"]
               if d["id"] == "agents-platform-runners")
    assert dep["required"] is False, (
        "a required dep makes this app un-installable when the provider's "
        "manifest fails validation; declarations are held and replayed"
    )
