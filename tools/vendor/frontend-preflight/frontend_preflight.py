#!/usr/bin/env python3
"""Frontend workflow preflight validator for Codex global rules (v1.21)."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Iterable


BASELINE_SKILL = "design-taste-frontend"
FRONTEND_SKILL = "frontend-skill"
SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_SPEC_PATH = SCRIPT_DIR / "frontend_preflight_spec.json"


def parse_args(*, tier_choices: tuple[str, ...]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Frontend preflight validator.")
    parser.add_argument(
        "--frontend-tier",
        required=True,
        choices=tier_choices,
        help="Frontend tier: L0/L1-F/L1-V/L2",
    )
    parser.add_argument(
        "--skills",
        default="",
        help="Comma-separated skill chain names.",
    )
    parser.add_argument(
        "--style-authority-path",
        default="",
        help="Absolute path to DESIGN.md authority file.",
    )
    parser.add_argument(
        "--output",
        default="json",
        choices=("json",),
        help="Output format. Only json is supported.",
    )
    return parser.parse_args()


def normalize_chain(skills_raw: str) -> list[str]:
    chain: list[str] = []
    for token in skills_raw.split(","):
        skill = token.strip()
        if not skill:
            continue
        chain.append(skill)
    return chain


def result_payload(
    *,
    ok: bool,
    status: str,
    code: str,
    message: str,
    normalized_chain: list[str],
) -> dict[str, object]:
    return {
        "ok": ok,
        "status": status,
        "code": code,
        "message": message,
        "normalized_chain": normalized_chain,
    }


def print_result(payload: dict[str, object]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")


def style_headings_hit(
    content: str, *, section_heading_patterns: dict[str, re.Pattern[str]]
) -> tuple[bool, list[str]]:
    hits: list[str] = []
    for key, pattern in section_heading_patterns.items():
        if pattern.search(content):
            hits.append(key)
    return len(hits) == len(section_heading_patterns), hits


def is_absolute_path(path: str) -> bool:
    return os.path.isabs(path)


def load_authority_file(path: str) -> str:
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"Authority file not found: {path}")
    if not os.access(path, os.R_OK):
        raise PermissionError(f"Authority file is not readable: {path}")
    return p.read_text(encoding="utf-8", errors="replace")


def validate_authority(
    path: str, *, section_heading_patterns: dict[str, re.Pattern[str]]
) -> tuple[bool, str]:
    if not is_absolute_path(path):
        return False, "style_authority_path must be an absolute path."
    try:
        content = load_authority_file(path)
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)
    ok, hits = style_headings_hit(content, section_heading_patterns=section_heading_patterns)
    if not ok:
        missing = sorted(set(section_heading_patterns.keys()) - set(hits))
        return (
            False,
            "Authority file missing required markdown section headings: "
            f"{', '.join(missing)}",
        )
    return True, "Authority file structure check passed."


def not_falsey_env(name: str) -> bool:
    value = os.getenv(name, "").strip().lower()
    return value not in {"0", "false", "no", "n", "off"}


def env_tier_set(name: str, *, default: set[str]) -> set[str]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return set(default)
    return {token.strip() for token in raw.split(",") if token.strip()}


def count_intersection(values: Iterable[str], allowed: set[str]) -> int:
    return sum(1 for v in values if v in allowed)


def build_heading_patterns(
    section_keywords: dict[str, list[str]],
) -> dict[str, re.Pattern[str]]:
    patterns: dict[str, re.Pattern[str]] = {}
    for section, keywords in section_keywords.items():
        escaped = [re.escape(word) for word in keywords if word]
        if not escaped:
            raise ValueError(f"Section `{section}` has empty keywords.")
        pattern = re.compile(
            rf"^\s{{0,3}}#{{1,6}}\s+.*(?:{'|'.join(escaped)}).*$",
            re.IGNORECASE | re.MULTILINE,
        )
        patterns[section] = pattern
    return patterns


def load_skill_list(data: dict[str, object], key: str, *, required: bool) -> set[str]:
    raw = data.get(key)
    if raw is None and not required:
        return set()
    if not isinstance(raw, list) or (required and not raw):
        raise ValueError(f"Invalid {key} in preflight spec")
    skills = {str(item).strip() for item in raw if str(item).strip()}
    if required and not skills:
        raise ValueError(f"Empty {key} in preflight spec")
    return skills


def load_preflight_spec() -> tuple[
    tuple[str, ...],
    set[str],
    set[str],
    dict[str, re.Pattern[str]],
]:
    spec_path = Path(os.getenv("FRONTEND_PREFLIGHT_SPEC_PATH", str(DEFAULT_SPEC_PATH)))
    data = json.loads(spec_path.read_text(encoding="utf-8"))

    tiers_raw = data.get("tiers")
    if not isinstance(tiers_raw, list) or not tiers_raw:
        raise ValueError(f"Invalid spec tiers in {spec_path}")
    tiers = tuple(str(item).strip() for item in tiers_raw if str(item).strip())
    if not tiers:
        raise ValueError(f"Empty tier list in {spec_path}")

    mutex_skills = load_skill_list(data, "mutex_style_skills", required=True)
    l1f_visual_warning_skills = load_skill_list(
        data,
        "l1f_visual_warning_skills",
        required=False,
    )

    authority_raw = data.get("authority_required_sections")
    if not isinstance(authority_raw, dict) or not authority_raw:
        raise ValueError(f"Invalid authority_required_sections in {spec_path}")
    section_keywords: dict[str, list[str]] = {}
    for section, words in authority_raw.items():
        section_key = str(section).strip()
        if not section_key:
            continue
        if not isinstance(words, list):
            raise ValueError(
                f"authority_required_sections.{section_key} must be a string list in {spec_path}"
            )
        cleaned = [str(word).strip() for word in words if str(word).strip()]
        if not cleaned:
            raise ValueError(
                f"authority_required_sections.{section_key} is empty in {spec_path}"
            )
        section_keywords[section_key] = cleaned
    if not section_keywords:
        raise ValueError(f"No valid authority_required_sections in {spec_path}")

    section_heading_patterns = build_heading_patterns(section_keywords)
    return tiers, mutex_skills, l1f_visual_warning_skills, section_heading_patterns


def main() -> int:
    try:
        (
            tier_choices,
            mutex_style_skills,
            l1f_visual_warning_skills,
            section_heading_patterns,
        ) = load_preflight_spec()
        args = parse_args(tier_choices=tier_choices)
        chain = normalize_chain(args.skills)
        chain_set = set(chain)
        style_skill_count = count_intersection(chain, mutex_style_skills)
        includes_stitch = "stitch-design-taste" in chain_set
        style_authority_path = args.style_authority_path.strip()
        authority_required_by_env = not_falsey_env("FRONTEND_STYLE_AUTHORITY_REQUIRED")
        authority_required_tiers = env_tier_set(
            "FRONTEND_STYLE_AUTHORITY_REQUIRED_TIERS",
            default={"L1-F", "L1-V", "L2"},
        )
        style_authority_mode = os.getenv("FRONTEND_STYLE_AUTHORITY_MODE", "auto").strip().lower()
        requires_authority = includes_stitch or style_authority_mode == "evolve" or (
            authority_required_by_env and args.frontend_tier in authority_required_tiers
        )
        requires_baseline = args.frontend_tier in {"L1-F", "L1-V", "L2"} or includes_stitch

        # Hard fail: mutex style skills
        if style_skill_count > 1:
            payload = result_payload(
                ok=False,
                status="fail",
                code="STYLE_MUTEX_CONFLICT",
                message=(
                    "More than one mutually exclusive style skill is present. "
                    f"Pick exactly one of {'|'.join(sorted(mutex_style_skills))}."
                ),
                normalized_chain=chain,
            )
            print_result(payload)
            return 2

        # Hard fail: L2 must include exactly one style skill.
        if args.frontend_tier == "L2" and style_skill_count != 1:
            payload = result_payload(
                ok=False,
                status="fail",
                code="STYLE_SKILL_REQUIRED",
                message="L2 requires exactly one mutually exclusive style skill.",
                normalized_chain=chain,
            )
            print_result(payload)
            return 2

        # Hard fail: L1+/stitch chain requires baseline design skill.
        if requires_baseline and BASELINE_SKILL not in chain_set:
            payload = result_payload(
                ok=False,
                status="fail",
                code="BASELINE_SKILL_MISSING",
                message=(
                    "L1-F/L1-V/L2 or stitch chain requires baseline skill "
                    "`design-taste-frontend`."
                ),
                normalized_chain=chain,
            )
            print_result(payload)
            return 2

        # Hard fail: L1-V/L2 requires frontend-skill.
        if args.frontend_tier in {"L1-V", "L2"} and FRONTEND_SKILL not in chain_set:
            payload = result_payload(
                ok=False,
                status="fail",
                code="FRONTEND_SKILL_REQUIRED",
                message="L1-V/L2 requires `frontend-skill` in the chain.",
                normalized_chain=chain,
            )
            print_result(payload)
            return 2

        # Hard fail: stitch or env-required routes require style authority.
        # Optional authority paths are still validated so discovered DESIGN.md cannot drift silently.
        if requires_authority or style_authority_path:
            if not style_authority_path:
                payload = result_payload(
                    ok=False,
                    status="fail",
                    code="STYLE_AUTHORITY_MISSING",
                    message=(
                        "This frontend route requires style_authority_path "
                        "(absolute path to DESIGN.md)."
                    ),
                    normalized_chain=chain,
                )
                print_result(payload)
                return 2
            authority_ok, authority_msg = validate_authority(
                style_authority_path,
                section_heading_patterns=section_heading_patterns,
            )
            if not authority_ok:
                payload = result_payload(
                    ok=False,
                    status="fail",
                    code="STYLE_AUTHORITY_MISSING",
                    message=authority_msg,
                    normalized_chain=chain,
                )
                print_result(payload)
                return 2

        # Warn only: L1-F includes visual-heavy skills that usually belong in L1-V/L2.
        visual_warning_hits = sorted(chain_set & l1f_visual_warning_skills)
        if args.frontend_tier == "L1-F" and visual_warning_hits:
            payload = result_payload(
                ok=True,
                status="warn",
                code="L1F_CHAIN_WARNING",
                message=(
                    "Visual-focused skill(s) detected under L1-F "
                    f"({', '.join(visual_warning_hits)}); consider L1-V/L2 for visual-focused work."
                ),
                normalized_chain=chain,
            )
            print_result(payload)
            return 0

        payload = result_payload(
            ok=True,
            status="pass",
            code="OK",
            message="Frontend preflight checks passed.",
            normalized_chain=chain,
        )
        print_result(payload)
        return 0
    except Exception as exc:  # noqa: BLE001
        payload = result_payload(
            ok=False,
            status="fail",
            code="RUNTIME_ERROR",
            message=str(exc),
            normalized_chain=[],
        )
        print_result(payload)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
