#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import posixpath
import re
import stat
import sys
from collections import Counter, defaultdict, deque
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Iterable
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile, ZipInfo

SCRIPT_ROOT = Path(__file__).resolve().parents[1]
if str(SCRIPT_ROOT) not in sys.path:
  sys.path.insert(0, str(SCRIPT_ROOT))

from sample_inventory.legacy_model import (  # noqa: E402
  LegacyImportPlan,
  LegacyValidationError,
  load_legacy_import_plan,
  sha256_file,
)


AUDITED_BASELINE_SHA256 = "d92d1b8f6a55464b932ebbdbf9357845948f46ec274d50b74d84cab6ddf9b860"
AUDITED_OUTBOUND_SHA256 = "e265e9d74d79daa7bd03a6d75127c40e93f7f64b994b4fb7b3111f73a9c8f46d"
AUDITED_INBOUND_SHA256 = "4c3ab8832c2d31149af995dbad905c3fe477fc1de6cfb495fc4197425b474f13"
AUDITED_INVENTORY_SHA256 = "e0d899aea0f080442250d8215ea0013b950ede31815a57698ddb5b9afeb3b580"

MAX_BASELINE_BYTES = 5 * 1024 * 1024
MAX_XLSX_BYTES = 10 * 1024 * 1024
MAX_ZIP_MEMBERS = 256
MAX_ZIP_MEMBER_BYTES = 20 * 1024 * 1024
MAX_ZIP_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
MAX_OUTPUT_BYTES = 20 * 1024 * 1024

SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"m": SHEET_NS, "r": OFFICE_REL_NS, "p": PACKAGE_REL_NS}
CELL_REFERENCE_PATTERN = re.compile(r"^([A-Z]+)([1-9][0-9]*)$")
INTEGER_PATTERN = re.compile(r"^-?[0-9]+$")
LEGACY_MINUTE_PATTERN = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}$")


@dataclass(frozen=True)
class WorkbookSpec:
  domain: str
  sheet_name: str
  dimension: str
  headers: tuple[str, ...]
  data_rows: int


OUTBOUND_SPEC = WorkbookSpec(
  domain="outbound",
  sheet_name="出库记录",
  dimension="A1:K244",
  headers=("时间", "样品名称", "样品编号", "数量", "申领人", "部门", "用途", "收货人", "收货地址", "快递单号", "状态"),
  data_rows=243,
)
INBOUND_SPEC = WorkbookSpec(
  domain="inbound",
  sheet_name="入库记录",
  dimension="A1:G21",
  headers=("时间", "样品名称", "样品编号", "入库数量", "操作人", "快递单号", "备注"),
  data_rows=20,
)
INVENTORY_SPEC = WorkbookSpec(
  domain="inventory",
  sheet_name="库存",
  dimension="A1:F23",
  headers=("编号", "名称", "规格型号", "库存数量", "存放位置", "备注"),
  data_rows=22,
)

STATUS_MAP = {
  "🧪 已取样": "sampled",
  "❌ 已驳回": "rejected",
}


@dataclass(frozen=True)
class ParsedWorkbook:
  path: Path
  sha256: str
  rows: tuple[tuple[str, ...], ...]


@dataclass(frozen=True)
class SnapshotResult:
  payload: dict[str, object]
  summary: dict[str, int | str]
  source_sha256: dict[str, str]


def _xml_root(payload: bytes, owner: str) -> ElementTree.Element:
  if b"<!DOCTYPE" in payload.upper() or b"<!ENTITY" in payload.upper():
    raise LegacyValidationError(f"{owner} contains a forbidden XML declaration")
  try:
    return ElementTree.fromstring(payload)
  except ElementTree.ParseError as error:
    raise LegacyValidationError(f"{owner} is not valid XML") from error


def _validate_zip_member(info: ZipInfo) -> None:
  member = PurePosixPath(info.filename)
  if member.is_absolute() or ".." in member.parts or "\\" in info.filename:
    raise LegacyValidationError("XLSX contains an unsafe ZIP member path")
  if info.flag_bits & 0x1:
    raise LegacyValidationError("encrypted XLSX members are not supported")
  if info.file_size > MAX_ZIP_MEMBER_BYTES:
    raise LegacyValidationError("XLSX member exceeds the uncompressed size limit")


def _read_member(archive: ZipFile, member: str, *, required: bool = True) -> bytes | None:
  try:
    info = archive.getinfo(member)
  except KeyError:
    if required:
      raise LegacyValidationError(f"XLSX is missing required member {member}") from None
    return None
  _validate_zip_member(info)
  payload = archive.read(info)
  if len(payload) != info.file_size:
    raise LegacyValidationError(f"XLSX member size changed while reading {member}")
  return payload


def _column_number(reference: str) -> tuple[int, int]:
  matched = CELL_REFERENCE_PATTERN.fullmatch(reference)
  if matched is None:
    raise LegacyValidationError(f"invalid XLSX cell reference {reference}")
  column = 0
  for character in matched.group(1):
    column = column * 26 + ord(character) - ord("A") + 1
  return column, int(matched.group(2))


def _shared_strings(archive: ZipFile) -> tuple[str, ...]:
  payload = _read_member(archive, "xl/sharedStrings.xml", required=False)
  if payload is None:
    return ()
  root = _xml_root(payload, "shared strings")
  return tuple(
    "".join(node.text or "" for node in item.findall(".//m:t", NS))
    for item in root.findall("m:si", NS)
  )


def _cell_text(cell: ElementTree.Element, shared: tuple[str, ...], owner: str) -> str:
  cell_type = cell.attrib.get("t", "n")
  if cell.find("m:f", NS) is not None:
    raise LegacyValidationError(f"{owner} contains a formula cell")
  if cell_type == "inlineStr":
    return "".join(node.text or "" for node in cell.findall(".//m:t", NS))
  value = cell.findtext("m:v", default="", namespaces=NS)
  if cell_type == "s":
    if not INTEGER_PATTERN.fullmatch(value):
      raise LegacyValidationError(f"{owner} has an invalid shared-string index")
    index = int(value)
    if index < 0 or index >= len(shared):
      raise LegacyValidationError(f"{owner} shared-string index is outside the table")
    return shared[index]
  if cell_type in {"str", "n"}:
    return value
  raise LegacyValidationError(f"{owner} uses unsupported XLSX cell type {cell_type}")


def _worksheet_member(archive: ZipFile, spec: WorkbookSpec) -> str:
  workbook = _xml_root(_read_member(archive, "xl/workbook.xml"), "workbook")
  sheets = workbook.findall("m:sheets/m:sheet", NS)
  if len(sheets) != 1 or sheets[0].attrib.get("name") != spec.sheet_name:
    raise LegacyValidationError(f"{spec.domain} workbook must contain only sheet {spec.sheet_name}")
  relationship_id = sheets[0].attrib.get(f"{{{OFFICE_REL_NS}}}id")
  relationships = _xml_root(
    _read_member(archive, "xl/_rels/workbook.xml.rels"),
    "workbook relationships",
  )
  targets = {
    relation.attrib.get("Id"): relation.attrib.get("Target")
    for relation in relationships.findall("p:Relationship", NS)
  }
  target = targets.get(relationship_id)
  if not target:
    raise LegacyValidationError(f"{spec.domain} worksheet relationship is missing")
  normalized = posixpath.normpath(posixpath.join("xl", target.lstrip("/")))
  if target.startswith("xl/"):
    normalized = posixpath.normpath(target)
  if not normalized.startswith("xl/worksheets/") or ".." in PurePosixPath(normalized).parts:
    raise LegacyValidationError(f"{spec.domain} worksheet relationship target is unsafe")
  return normalized


def parse_workbook(path: Path, expected_sha256: str, spec: WorkbookSpec) -> ParsedWorkbook:
  if not path.is_file():
    raise LegacyValidationError(f"{spec.domain} workbook does not exist")
  if path.stat().st_size > MAX_XLSX_BYTES:
    raise LegacyValidationError(f"{spec.domain} workbook exceeds the file size limit")
  actual_sha256 = sha256_file(path)
  if actual_sha256 != expected_sha256:
    raise LegacyValidationError(f"{spec.domain} workbook SHA-256 differs from the explicit pin")
  try:
    with ZipFile(path) as archive:
      members = archive.infolist()
      if len(members) > MAX_ZIP_MEMBERS:
        raise LegacyValidationError(f"{spec.domain} workbook has too many ZIP members")
      for info in members:
        _validate_zip_member(info)
      if sum(info.file_size for info in members) > MAX_ZIP_UNCOMPRESSED_BYTES:
        raise LegacyValidationError(f"{spec.domain} workbook exceeds the total uncompressed size limit")
      shared = _shared_strings(archive)
      worksheet_member = _worksheet_member(archive, spec)
      worksheet = _xml_root(_read_member(archive, worksheet_member), f"{spec.domain} worksheet")
  except (BadZipFile, OSError) as error:
    raise LegacyValidationError(f"{spec.domain} workbook is not a readable XLSX archive") from error

  dimension = worksheet.find("m:dimension", NS)
  if dimension is None or dimension.attrib.get("ref") != spec.dimension:
    raise LegacyValidationError(f"{spec.domain} workbook range differs from {spec.dimension}")
  expected_row_count = spec.data_rows + 1
  width = len(spec.headers)
  parsed_rows: dict[int, list[str]] = {}
  for row in worksheet.findall("m:sheetData/m:row", NS):
    row_number_text = row.attrib.get("r", "")
    if not row_number_text.isdigit():
      raise LegacyValidationError(f"{spec.domain} workbook contains an invalid row number")
    row_number = int(row_number_text)
    if row_number < 1 or row_number > expected_row_count or row_number in parsed_rows:
      raise LegacyValidationError(f"{spec.domain} workbook contains a duplicate or out-of-range row")
    values = [""] * width
    seen_columns: set[int] = set()
    for cell in row.findall("m:c", NS):
      reference = cell.attrib.get("r", "")
      column, reference_row = _column_number(reference)
      if reference_row != row_number or column < 1 or column > width or column in seen_columns:
        raise LegacyValidationError(f"{spec.domain} workbook contains an invalid cell layout")
      seen_columns.add(column)
      values[column - 1] = _cell_text(cell, shared, f"{spec.domain}!{reference}")
    parsed_rows[row_number] = values
  if set(parsed_rows) != set(range(1, expected_row_count + 1)):
    raise LegacyValidationError(f"{spec.domain} workbook row set differs from the pinned range")
  if tuple(value.strip() for value in parsed_rows[1]) != spec.headers:
    raise LegacyValidationError(f"{spec.domain} workbook headers differ from the pinned contract")
  rows = tuple(tuple(value.strip() for value in parsed_rows[index]) for index in range(2, expected_row_count + 1))
  return ParsedWorkbook(path=path.resolve(), sha256=actual_sha256, rows=rows)


def _required_text(value: str, owner: str) -> str:
  normalized = value.strip()
  if not normalized:
    raise LegacyValidationError(f"{owner} must not be blank")
  return normalized


def _nullable_text(value: object) -> str:
  return "" if value is None else str(value).strip()


def _positive_int(value: str, owner: str) -> int:
  if not INTEGER_PATTERN.fullmatch(value):
    raise LegacyValidationError(f"{owner} must be an integer")
  parsed = int(value)
  if parsed <= 0:
    raise LegacyValidationError(f"{owner} must be positive")
  return parsed


def _nonnegative_int(value: str, owner: str) -> int:
  if not INTEGER_PATTERN.fullmatch(value):
    raise LegacyValidationError(f"{owner} must be an integer")
  parsed = int(value)
  if parsed < 0:
    raise LegacyValidationError(f"{owner} must not be negative")
  return parsed


def _legacy_minute(value: str, owner: str) -> str:
  normalized = _required_text(value, owner)
  if not LEGACY_MINUTE_PATTERN.fullmatch(normalized):
    raise LegacyValidationError(f"{owner} must use YYYY-MM-DD HH:MM")
  return normalized


def _baseline_payload(path: Path, expected_sha256: str) -> tuple[dict[str, Any], LegacyImportPlan]:
  if not path.is_file() or path.stat().st_size > MAX_BASELINE_BYTES:
    raise LegacyValidationError("baseline JSON is missing or exceeds the size limit")
  plan = load_legacy_import_plan(path, expected_sha256)
  try:
    payload = json.loads(path.read_text(encoding="utf-8"))
  except (OSError, UnicodeError, json.JSONDecodeError) as error:
    raise LegacyValidationError("baseline JSON cannot be read") from error
  if set(payload) != {"samples", "inboundLogs", "outboundRequests", "nextId"}:
    raise LegacyValidationError("baseline JSON root fields differ from the legacy contract")
  if isinstance(payload["nextId"], bool) or not isinstance(payload["nextId"], int) or payload["nextId"] <= 0:
    raise LegacyValidationError("baseline nextId must be a positive integer")
  return payload, plan


def _sample_index(payload: dict[str, Any], plan: LegacyImportPlan) -> dict[str, tuple[dict[str, Any], Any]]:
  rows = payload["samples"]
  if len(rows) != len(plan.samples):
    raise LegacyValidationError("baseline sample payload differs from the validated plan")
  by_id = {str(row["id"]): row for row in rows}
  return {sample.code: (by_id[sample.legacy_id], sample) for sample in plan.samples}


def _inbound_key(row: dict[str, Any]) -> tuple[object, ...]:
  return (
    str(row["createdAt"]).strip(),
    str(row["sampleName"]).strip(),
    str(row["sampleCode"]).strip(),
    int(row["qty"]),
    _nullable_text(row.get("operator")),
    _nullable_text(row.get("tracking")),
    _nullable_text(row.get("remark")),
  )


def _outbound_key(row: dict[str, Any]) -> tuple[object, ...]:
  return (
    str(row["createdAt"]).strip(),
    str(row["sampleName"]).strip(),
    str(row["sampleCode"]).strip(),
    int(row["qty"]),
    str(row["applicant"]).strip(),
    str(row["department"]).strip(),
    str(row["purpose"]).strip(),
    _nullable_text(row.get("receiver")),
    _nullable_text(row.get("address")),
    _nullable_text(row.get("tracking")),
    str(row["status"]).strip(),
  )


def _row_multimap(rows: Iterable[dict[str, Any]], key_owner: Any) -> dict[tuple[object, ...], deque[dict[str, Any]]]:
  grouped: dict[tuple[object, ...], list[dict[str, Any]]] = defaultdict(list)
  for row in rows:
    grouped[key_owner(row)].append(row)
  return {
    key: deque(sorted(values, key=lambda value: str(value["id"])))
    for key, values in grouped.items()
  }


def _deterministic_id(domain: str, source_sha256: str, excel_row: int) -> str:
  return f"xlsx:{domain}:{source_sha256}:row:{excel_row}"


def _require_all_baseline_rows(matched: Counter[tuple[object, ...]], baseline: Counter[tuple[object, ...]], owner: str) -> None:
  if matched != baseline:
    raise LegacyValidationError(f"{owner} workbook changed or removed a baseline business row")


def build_snapshot(
  *,
  baseline_path: Path,
  baseline_sha256: str,
  inbound_path: Path,
  inbound_sha256: str,
  inbound_spec: WorkbookSpec,
  inventory_path: Path,
  inventory_sha256: str,
  inventory_spec: WorkbookSpec,
  outbound_path: Path,
  outbound_sha256: str,
  outbound_spec: WorkbookSpec,
) -> SnapshotResult:
  baseline_payload, baseline_plan = _baseline_payload(baseline_path, baseline_sha256)
  inbound_workbook = parse_workbook(inbound_path, inbound_sha256, inbound_spec)
  inventory_workbook = parse_workbook(inventory_path, inventory_sha256, inventory_spec)
  outbound_workbook = parse_workbook(outbound_path, outbound_sha256, outbound_spec)
  samples_by_code = _sample_index(baseline_payload, baseline_plan)

  final_samples: list[dict[str, Any]] = []
  seen_sample_codes: set[str] = set()
  for row_number, row in enumerate(inventory_workbook.rows, start=2):
    code, name, model, quantity, location, remark = row
    code = _required_text(code, f"inventory row {row_number} sample code")
    if code in seen_sample_codes:
      raise LegacyValidationError("inventory workbook contains a duplicate sample code")
    seen_sample_codes.add(code)
    baseline_entry = samples_by_code.get(code)
    if baseline_entry is None:
      raise LegacyValidationError("inventory workbook references an unknown sample code")
    baseline_row, baseline_sample = baseline_entry
    metadata = (
      _required_text(name, f"inventory row {row_number} sample name"),
      _nullable_text(model) or None,
      _nullable_text(location) or None,
      _nullable_text(remark) or None,
    )
    if metadata != (
      baseline_sample.name,
      baseline_sample.model,
      baseline_sample.location,
      baseline_sample.remark,
    ):
      raise LegacyValidationError("inventory workbook contains sample master-data drift")
    final_row = dict(baseline_row)
    final_row["quantity"] = _nonnegative_int(quantity, f"inventory row {row_number} quantity")
    final_samples.append(final_row)
  if seen_sample_codes != set(samples_by_code):
    raise LegacyValidationError("inventory workbook sample code set differs from the baseline")

  baseline_inbound_rows = list(baseline_payload["inboundLogs"])
  inbound_matches = _row_multimap(baseline_inbound_rows, _inbound_key)
  baseline_inbound_keys = Counter(_inbound_key(row) for row in baseline_inbound_rows)
  matched_inbound_keys: Counter[tuple[object, ...]] = Counter()
  final_inbounds: list[dict[str, Any]] = []
  for row_number, row in enumerate(inbound_workbook.rows, start=2):
    created_at, sample_name, sample_code, quantity, operator, tracking, remark = row
    sample_code = _required_text(sample_code, f"inbound row {row_number} sample code")
    sample_entry = samples_by_code.get(sample_code)
    if sample_entry is None:
      raise LegacyValidationError("inbound workbook references an unknown sample code")
    baseline_sample_row, baseline_sample = sample_entry
    normalized = {
      "sampleId": baseline_sample_row["id"],
      "sampleName": _required_text(sample_name, f"inbound row {row_number} sample name"),
      "sampleCode": sample_code,
      "qty": _positive_int(quantity, f"inbound row {row_number} quantity"),
      "operator": _nullable_text(operator),
      "tracking": _nullable_text(tracking),
      "remark": _nullable_text(remark),
      "createdAt": _legacy_minute(created_at, f"inbound row {row_number} time"),
    }
    if normalized["sampleName"] != baseline_sample.name:
      raise LegacyValidationError("inbound workbook sample name does not match its code")
    key = _inbound_key(normalized)
    if inbound_matches.get(key):
      final_inbounds.append(dict(inbound_matches[key].popleft()))
      matched_inbound_keys[key] += 1
    else:
      final_inbounds.append({
        **normalized,
        "id": _deterministic_id("inbound", inbound_workbook.sha256, row_number),
      })
  _require_all_baseline_rows(matched_inbound_keys, baseline_inbound_keys, "inbound")

  baseline_outbound_rows = list(baseline_payload["outboundRequests"])
  outbound_matches = _row_multimap(baseline_outbound_rows, _outbound_key)
  baseline_outbound_keys = Counter(_outbound_key(row) for row in baseline_outbound_rows)
  matched_outbound_keys: Counter[tuple[object, ...]] = Counter()
  final_outbounds: list[dict[str, Any]] = []
  for row_number, row in enumerate(outbound_workbook.rows, start=2):
    (
      created_at,
      sample_name,
      sample_code,
      quantity,
      applicant,
      department,
      purpose,
      receiver,
      address,
      tracking,
      source_status,
    ) = row
    sample_code = _required_text(sample_code, f"outbound row {row_number} sample code")
    sample_entry = samples_by_code.get(sample_code)
    if sample_entry is None:
      raise LegacyValidationError("outbound workbook references an unknown sample code")
    baseline_sample_row, baseline_sample = sample_entry
    status_value = STATUS_MAP.get(source_status)
    if status_value is None:
      raise LegacyValidationError("outbound workbook contains an unsupported status")
    normalized = {
      "sampleId": baseline_sample_row["id"],
      "sampleName": _required_text(sample_name, f"outbound row {row_number} sample name"),
      "sampleCode": sample_code,
      "qty": _positive_int(quantity, f"outbound row {row_number} quantity"),
      "applicant": _required_text(applicant, f"outbound row {row_number} applicant"),
      "department": _required_text(department, f"outbound row {row_number} department"),
      "purpose": _required_text(purpose, f"outbound row {row_number} purpose"),
      "receiver": _nullable_text(receiver),
      "address": _nullable_text(address),
      "tracking": _nullable_text(tracking),
      "status": status_value,
      "createdAt": _legacy_minute(created_at, f"outbound row {row_number} time"),
    }
    if normalized["sampleName"] != baseline_sample.name:
      raise LegacyValidationError("outbound workbook sample name does not match its code")
    key = _outbound_key(normalized)
    if outbound_matches.get(key):
      final_outbounds.append(dict(outbound_matches[key].popleft()))
      matched_outbound_keys[key] += 1
    else:
      final_outbounds.append({
        **normalized,
        "id": _deterministic_id("outbound", outbound_workbook.sha256, row_number),
      })
  _require_all_baseline_rows(matched_outbound_keys, baseline_outbound_keys, "outbound")

  sample_id_to_code = {str(row["id"]): str(row["code"]) for row in final_samples}
  baseline_quantities = {sample.legacy_id: sample.quantity for sample in baseline_plan.samples}
  inbound_delta: Counter[str] = Counter()
  outbound_delta: Counter[str] = Counter()
  baseline_inbound_ids = {str(row["id"]) for row in baseline_inbound_rows}
  baseline_outbound_ids = {str(row["id"]) for row in baseline_outbound_rows}
  for row in final_inbounds:
    if str(row["id"]) not in baseline_inbound_ids:
      inbound_delta[str(row["sampleId"])] += int(row["qty"])
  for row in final_outbounds:
    if str(row["id"]) not in baseline_outbound_ids and row["status"] == "sampled":
      outbound_delta[str(row["sampleId"])] += int(row["qty"])
  final_quantity_by_id = {str(row["id"]): int(row["quantity"]) for row in final_samples}
  for sample_id, sample_code in sample_id_to_code.items():
    expected = baseline_quantities[sample_id] + inbound_delta[sample_id] - outbound_delta[sample_id]
    if final_quantity_by_id[sample_id] != expected:
      raise LegacyValidationError(f"sample balance does not reconcile for code {sample_code}")

  payload: dict[str, object] = {
    "samples": final_samples,
    "inboundLogs": final_inbounds,
    "outboundRequests": final_outbounds,
    "nextId": baseline_payload["nextId"],
  }
  sampled = sum(row["status"] == "sampled" for row in final_outbounds)
  rejected = sum(row["status"] == "rejected" for row in final_outbounds)
  summary: dict[str, int | str] = {
    "samples": len(final_samples),
    "inbounds": len(final_inbounds),
    "outbounds": len(final_outbounds),
    "sampled": sampled,
    "rejected": rejected,
    "onHand": sum(int(row["quantity"]) for row in final_samples),
    "newInbounds": len(final_inbounds) - len(baseline_inbound_rows),
    "newOutbounds": len(final_outbounds) - len(baseline_outbound_rows),
  }
  return SnapshotResult(
    payload=payload,
    summary=summary,
    source_sha256={
      "baseline": baseline_sha256,
      "inbound": inbound_workbook.sha256,
      "inventory": inventory_workbook.sha256,
      "outbound": outbound_workbook.sha256,
    },
  )


def resolve_external_output(output_path: Path, repo_root: Path) -> Path:
  if not output_path.is_absolute():
    raise LegacyValidationError("output path must be absolute")
  resolved_repo = repo_root.resolve()
  resolved_parent = output_path.parent.resolve(strict=True)
  if not resolved_parent.is_dir():
    raise LegacyValidationError("output parent must be a directory")
  resolved = resolved_parent / output_path.name
  if resolved == resolved_repo or resolved_repo in resolved.parents:
    raise LegacyValidationError("PII output must stay outside the Git worktree")
  if output_path.name in {"", ".", ".."}:
    raise LegacyValidationError("output file name is invalid")
  return resolved


def write_snapshot_exclusive(output_path: Path, payload: dict[str, object], repo_root: Path) -> dict[str, int | str]:
  resolved = resolve_external_output(output_path, repo_root)
  content = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
  if len(content) > MAX_OUTPUT_BYTES:
    raise LegacyValidationError("snapshot output exceeds the size limit")
  flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
  if hasattr(os, "O_NOFOLLOW"):
    flags |= os.O_NOFOLLOW
  descriptor: int | None = None
  created = False
  try:
    descriptor = os.open(resolved, flags, 0o600)
    created = True
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, "wb", closefd=True) as target:
      descriptor = None
      target.write(content)
      target.flush()
      os.fsync(target.fileno())
    mode = stat.S_IMODE(resolved.stat().st_mode)
    if mode != 0o600:
      raise LegacyValidationError("snapshot output mode is not 0600")
  except Exception:
    if descriptor is not None:
      os.close(descriptor)
    if created:
      resolved.unlink(missing_ok=True)
    raise
  return {
    "bytes": len(content),
    "sha256": hashlib.sha256(content).hexdigest(),
  }


def build_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(
    description="Convert the checksum-pinned 2026-07-27 sample XLSX exports into one canonical legacy snapshot."
  )
  parser.add_argument("--baseline-input", type=Path, required=True)
  parser.add_argument("--inbound-input", type=Path, required=True)
  parser.add_argument("--inventory-input", type=Path, required=True)
  parser.add_argument("--outbound-input", type=Path, required=True)
  parser.add_argument("--output", type=Path, required=True)
  parser.add_argument("--confirm-pii-output", action="store_true")
  return parser


def main(argv: list[str] | None = None) -> int:
  args = build_parser().parse_args(argv)
  repo_root = Path(__file__).resolve().parents[4]
  try:
    if not args.confirm_pii_output:
      raise LegacyValidationError("conversion requires --confirm-pii-output")
    result = build_snapshot(
      baseline_path=args.baseline_input,
      baseline_sha256=AUDITED_BASELINE_SHA256,
      inbound_path=args.inbound_input,
      inbound_sha256=AUDITED_INBOUND_SHA256,
      inbound_spec=INBOUND_SPEC,
      inventory_path=args.inventory_input,
      inventory_sha256=AUDITED_INVENTORY_SHA256,
      inventory_spec=INVENTORY_SPEC,
      outbound_path=args.outbound_input,
      outbound_sha256=AUDITED_OUTBOUND_SHA256,
      outbound_spec=OUTBOUND_SPEC,
    )
    expected_summary = {
      "samples": 22,
      "inbounds": 20,
      "outbounds": 243,
      "sampled": 239,
      "rejected": 4,
      "onHand": 2203,
      "newInbounds": 15,
      "newOutbounds": 104,
    }
    if result.summary != expected_summary:
      raise LegacyValidationError("converted snapshot counts differ from the audited 2026-07-27 contract")
    artifact = write_snapshot_exclusive(args.output, result.payload, repo_root)
    print(json.dumps({
      "mode": "legacy-xlsx-snapshot",
      "sourceSha256": result.source_sha256,
      "outputSha256": artifact["sha256"],
      "outputBytes": artifact["bytes"],
      **result.summary,
    }, sort_keys=True))
    return 0
  except (LegacyValidationError, OSError) as error:
    print(f"sample inventory XLSX conversion rejected: {error}", file=sys.stderr)
    return 2


if __name__ == "__main__":
  raise SystemExit(main())
