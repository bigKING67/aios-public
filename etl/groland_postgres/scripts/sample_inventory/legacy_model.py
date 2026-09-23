from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")
SUPPORTED_OUTBOUND_STATUSES = frozenset({"sampled", "rejected"})
SUPPORTED_CATCH_UP_OUTBOUND_STATUSES = frozenset({*SUPPORTED_OUTBOUND_STATUSES, "approved"})


class LegacyValidationError(ValueError):
  """Raised when the legacy snapshot cannot be imported safely."""


@dataclass(frozen=True)
class LegacySample:
  legacy_id: str
  code: str
  name: str
  model: str | None
  category: str | None
  location: str | None
  remark: str | None
  quantity: int


@dataclass(frozen=True)
class LegacyInbound:
  legacy_id: str
  sample_legacy_id: str
  sample_code: str
  quantity: int
  tracking_number: str | None
  remark: str | None
  operator_name: str | None
  occurred_at: datetime


@dataclass(frozen=True)
class LegacyOutbound:
  legacy_id: str
  sample_legacy_id: str
  sample_code: str
  quantity: int
  applicant: str
  department: str
  purpose: str
  receiver: str | None
  shipping_address: str | None
  tracking_number: str | None
  status: str
  requested_at: datetime


@dataclass(frozen=True)
class LegacyImportPlan:
  source_path: Path
  source_sha256: str
  samples: tuple[LegacySample, ...]
  inbounds: tuple[LegacyInbound, ...]
  outbounds: tuple[LegacyOutbound, ...]

  @property
  def summary(self) -> dict[str, int | str]:
    sampled = sum(item.status == "sampled" for item in self.outbounds)
    rejected = sum(item.status == "rejected" for item in self.outbounds)
    return {
      "sourceSha256": self.source_sha256,
      "samples": len(self.samples),
      "inbounds": len(self.inbounds),
      "outbounds": len(self.outbounds),
      "sampled": sampled,
      "rejected": rejected,
      "available": sum(item.quantity for item in self.samples),
      "reserved": 0,
      "onHand": sum(item.quantity for item in self.samples),
      "orphans": 0,
    }


def sha256_file(path: Path) -> str:
  digest = hashlib.sha256()
  with path.open("rb") as source:
    for chunk in iter(lambda: source.read(1024 * 1024), b""):
      digest.update(chunk)
  return digest.hexdigest()


def _required_text(record: dict[str, Any], field: str, owner: str) -> str:
  value = record.get(field)
  if value is None:
    raise LegacyValidationError(f"{owner}.{field} is required")
  normalized = str(value).strip()
  if not normalized:
    raise LegacyValidationError(f"{owner}.{field} must not be blank")
  return normalized


def _nullable_text(record: dict[str, Any], field: str) -> str | None:
  value = record.get(field)
  if value is None:
    return None
  normalized = str(value).strip()
  return normalized or None


def _positive_int(record: dict[str, Any], field: str, owner: str) -> int:
  value = record.get(field)
  if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
    raise LegacyValidationError(f"{owner}.{field} must be a positive integer")
  return value


def _nonnegative_int(record: dict[str, Any], field: str, owner: str) -> int:
  value = record.get(field)
  if isinstance(value, bool) or not isinstance(value, int) or value < 0:
    raise LegacyValidationError(f"{owner}.{field} must be a non-negative integer")
  return value


def _legacy_minute(value: str, owner: str) -> datetime:
  try:
    parsed = datetime.strptime(value, "%Y-%m-%d %H:%M")
  except ValueError as error:
    raise LegacyValidationError(
      f"{owner}.createdAt must use YYYY-MM-DD HH:MM"
    ) from error
  return parsed.replace(tzinfo=SHANGHAI_TZ)


def _require_list(payload: dict[str, Any], field: str) -> list[dict[str, Any]]:
  value = payload.get(field)
  if not isinstance(value, list):
    raise LegacyValidationError(f"root.{field} must be an array")
  if not all(isinstance(item, dict) for item in value):
    raise LegacyValidationError(f"root.{field} must contain objects")
  return value


def _ensure_unique(values: list[str], owner: str) -> None:
  if len(values) != len(set(values)):
    raise LegacyValidationError(f"duplicate {owner}")


def load_legacy_import_plan(
  path: Path,
  expected_sha256: str,
  *,
  supported_outbound_statuses: frozenset[str] = SUPPORTED_OUTBOUND_STATUSES,
) -> LegacyImportPlan:
  if not path.is_file():
    raise LegacyValidationError(f"input file does not exist: {path}")

  actual_sha256 = sha256_file(path)
  normalized_expected = expected_sha256.strip().lower()
  if actual_sha256 != normalized_expected:
    raise LegacyValidationError(
      f"source SHA-256 mismatch: expected {normalized_expected}, got {actual_sha256}"
    )

  try:
    payload = json.loads(path.read_text(encoding="utf-8"))
  except (OSError, UnicodeError, json.JSONDecodeError) as error:
    raise LegacyValidationError("input must be valid UTF-8 JSON") from error
  if not isinstance(payload, dict):
    raise LegacyValidationError("root must be an object")

  sample_rows = _require_list(payload, "samples")
  inbound_rows = _require_list(payload, "inboundLogs")
  outbound_rows = _require_list(payload, "outboundRequests")

  samples: list[LegacySample] = []
  for index, row in enumerate(sample_rows):
    owner = f"samples[{index}]"
    samples.append(
      LegacySample(
        legacy_id=_required_text(row, "id", owner),
        code=_required_text(row, "code", owner),
        name=_required_text(row, "name", owner),
        model=_nullable_text(row, "model"),
        category=_nullable_text(row, "category"),
        location=_nullable_text(row, "location"),
        remark=_nullable_text(row, "remark"),
        quantity=_nonnegative_int(row, "quantity", owner),
      )
    )

  _ensure_unique([item.legacy_id for item in samples], "sample id")
  _ensure_unique([item.code for item in samples], "sample code")
  samples_by_id = {item.legacy_id: item for item in samples}

  inbounds: list[LegacyInbound] = []
  for index, row in enumerate(inbound_rows):
    owner = f"inboundLogs[{index}]"
    sample_legacy_id = _required_text(row, "sampleId", owner)
    sample = samples_by_id.get(sample_legacy_id)
    if sample is None:
      raise LegacyValidationError(f"{owner}.sampleId references an unknown sample")
    sample_code = _required_text(row, "sampleCode", owner)
    if sample_code != sample.code:
      raise LegacyValidationError(f"{owner}.sampleCode does not match sampleId")
    inbounds.append(
      LegacyInbound(
        legacy_id=_required_text(row, "id", owner),
        sample_legacy_id=sample_legacy_id,
        sample_code=sample_code,
        quantity=_positive_int(row, "qty", owner),
        tracking_number=_nullable_text(row, "tracking"),
        remark=_nullable_text(row, "remark"),
        operator_name=_nullable_text(row, "operator"),
        occurred_at=_legacy_minute(_required_text(row, "createdAt", owner), owner),
      )
    )
  _ensure_unique([item.legacy_id for item in inbounds], "inbound id")

  outbounds: list[LegacyOutbound] = []
  for index, row in enumerate(outbound_rows):
    owner = f"outboundRequests[{index}]"
    sample_legacy_id = _required_text(row, "sampleId", owner)
    sample = samples_by_id.get(sample_legacy_id)
    if sample is None:
      raise LegacyValidationError(f"{owner}.sampleId references an unknown sample")
    sample_code = _required_text(row, "sampleCode", owner)
    if sample_code != sample.code:
      raise LegacyValidationError(f"{owner}.sampleCode does not match sampleId")
    status = _required_text(row, "status", owner).lower()
    if status not in supported_outbound_statuses:
      raise LegacyValidationError(f"{owner}.status is unsupported: {status}")
    outbounds.append(
      LegacyOutbound(
        legacy_id=_required_text(row, "id", owner),
        sample_legacy_id=sample_legacy_id,
        sample_code=sample_code,
        quantity=_positive_int(row, "qty", owner),
        applicant=_required_text(row, "applicant", owner),
        department=_required_text(row, "department", owner),
        purpose=_required_text(row, "purpose", owner),
        receiver=_nullable_text(row, "receiver"),
        shipping_address=_nullable_text(row, "address"),
        tracking_number=_nullable_text(row, "tracking"),
        status=status,
        requested_at=_legacy_minute(_required_text(row, "createdAt", owner), owner),
      )
    )
  _ensure_unique([item.legacy_id for item in outbounds], "outbound id")

  return LegacyImportPlan(
    source_path=path.resolve(),
    source_sha256=actual_sha256,
    samples=tuple(samples),
    inbounds=tuple(inbounds),
    outbounds=tuple(outbounds),
  )
