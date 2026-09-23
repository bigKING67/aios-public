from __future__ import annotations

import hashlib
import json
import stat
import sys
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZIP_DEFLATED, ZipFile

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from sample_inventory.legacy_model import LegacyValidationError  # noqa: E402
from sample_inventory.legacy_xlsx_snapshot import (  # noqa: E402
  WorkbookSpec,
  build_snapshot,
  main,
  parse_workbook,
  write_snapshot_exclusive,
)


M = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
P = "http://schemas.openxmlformats.org/package/2006/relationships"

INVENTORY_SPEC = WorkbookSpec(
  domain="inventory",
  sheet_name="库存",
  dimension="A1:F2",
  headers=("编号", "名称", "规格型号", "库存数量", "存放位置", "备注"),
  data_rows=1,
)
INBOUND_SPEC = WorkbookSpec(
  domain="inbound",
  sheet_name="入库记录",
  dimension="A1:G3",
  headers=("时间", "样品名称", "样品编号", "入库数量", "操作人", "快递单号", "备注"),
  data_rows=2,
)
OUTBOUND_SPEC = WorkbookSpec(
  domain="outbound",
  sheet_name="出库记录",
  dimension="A1:K3",
  headers=("时间", "样品名称", "样品编号", "数量", "申领人", "部门", "用途", "收货人", "收货地址", "快递单号", "状态"),
  data_rows=2,
)


def baseline_payload() -> dict[str, object]:
  return {
    "samples": [{
      "id": 1,
      "code": "S-1",
      "name": "Synthetic sample",
      "model": "M1",
      "quantity": 7,
      "location": "",
      "remark": "",
      "category": "fixture",
    }],
    "inboundLogs": [{
      "sampleId": 1,
      "sampleName": "Synthetic sample",
      "sampleCode": "S-1",
      "qty": 2,
      "operator": "Fixture operator",
      "tracking": "",
      "remark": "",
      "createdAt": "2026-07-20 10:00",
      "id": 2,
    }],
    "outboundRequests": [{
      "sampleId": 1,
      "sampleName": "Synthetic sample",
      "sampleCode": "S-1",
      "qty": 1,
      "applicant": "Fixture applicant",
      "department": "Fixture department",
      "purpose": "Fixture purpose",
      "receiver": "",
      "address": "",
      "tracking": "",
      "status": "sampled",
      "createdAt": "2026-07-20 11:00",
      "id": 3,
    }],
    "nextId": 4,
  }


def write_json(path: Path, payload: dict[str, object]) -> str:
  content = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
  path.write_bytes(content)
  return hashlib.sha256(content).hexdigest()


def column_name(index: int) -> str:
  value = ""
  while index:
    index, remainder = divmod(index - 1, 26)
    value = chr(ord("A") + remainder) + value
  return value


def write_xlsx(
  path: Path,
  spec: WorkbookSpec,
  rows: list[list[object]],
  *,
  formula_cell: str | None = None,
  unsafe_member: bool = False,
) -> str:
  all_rows = [list(spec.headers), *rows]
  shared: list[str] = []
  shared_index: dict[str, int] = {}

  worksheet = ElementTree.Element(f"{{{M}}}worksheet")
  ElementTree.SubElement(worksheet, f"{{{M}}}dimension", {"ref": spec.dimension})
  sheet_data = ElementTree.SubElement(worksheet, f"{{{M}}}sheetData")
  string_modes = ("s", "str", "inlineStr")
  string_cursor = 0
  for row_index, values in enumerate(all_rows, start=1):
    row = ElementTree.SubElement(sheet_data, f"{{{M}}}row", {"r": str(row_index)})
    for column_index, raw_value in enumerate(values, start=1):
      reference = f"{column_name(column_index)}{row_index}"
      if raw_value == "":
        continue
      if isinstance(raw_value, int):
        cell = ElementTree.SubElement(row, f"{{{M}}}c", {"r": reference})
        ElementTree.SubElement(cell, f"{{{M}}}v").text = str(raw_value)
      else:
        mode = "s" if row_index == 1 else string_modes[string_cursor % len(string_modes)]
        string_cursor += 1
        cell = ElementTree.SubElement(row, f"{{{M}}}c", {"r": reference, "t": mode})
        if reference == formula_cell:
          ElementTree.SubElement(cell, f"{{{M}}}f").text = "1+1"
        if mode == "inlineStr":
          inline = ElementTree.SubElement(cell, f"{{{M}}}is")
          ElementTree.SubElement(inline, f"{{{M}}}t").text = str(raw_value)
        elif mode == "s":
          text = str(raw_value)
          if text not in shared_index:
            shared_index[text] = len(shared)
            shared.append(text)
          ElementTree.SubElement(cell, f"{{{M}}}v").text = str(shared_index[text])
        else:
          ElementTree.SubElement(cell, f"{{{M}}}v").text = str(raw_value)

  workbook = ElementTree.Element(f"{{{M}}}workbook")
  sheets = ElementTree.SubElement(workbook, f"{{{M}}}sheets")
  ElementTree.SubElement(sheets, f"{{{M}}}sheet", {
    "name": spec.sheet_name,
    "sheetId": "1",
    f"{{{R}}}id": "rId1",
  })
  relationships = ElementTree.Element(f"{{{P}}}Relationships")
  ElementTree.SubElement(relationships, f"{{{P}}}Relationship", {
    "Id": "rId1",
    "Type": f"{R}/worksheet",
    "Target": "worksheets/sheet1.xml",
  })
  shared_root = ElementTree.Element(f"{{{M}}}sst", {
    "count": str(len(shared)),
    "uniqueCount": str(len(shared)),
  })
  for value in shared:
    item = ElementTree.SubElement(shared_root, f"{{{M}}}si")
    ElementTree.SubElement(item, f"{{{M}}}t").text = value

  with ZipFile(path, "w", ZIP_DEFLATED) as archive:
    archive.writestr("xl/workbook.xml", ElementTree.tostring(workbook, encoding="utf-8"))
    archive.writestr(
      "xl/_rels/workbook.xml.rels",
      ElementTree.tostring(relationships, encoding="utf-8"),
    )
    archive.writestr(
      "xl/worksheets/sheet1.xml",
      ElementTree.tostring(worksheet, encoding="utf-8"),
    )
    archive.writestr(
      "xl/sharedStrings.xml",
      ElementTree.tostring(shared_root, encoding="utf-8"),
    )
    if unsafe_member:
      archive.writestr("../outside.xml", b"fixture")
  return hashlib.sha256(path.read_bytes()).hexdigest()


def source_files(tmp_path: Path) -> dict[str, object]:
  tmp_path.mkdir(parents=True, exist_ok=True)
  baseline = tmp_path / "baseline.json"
  inventory = tmp_path / "inventory.xlsx"
  inbound = tmp_path / "inbound.xlsx"
  outbound = tmp_path / "outbound.xlsx"
  baseline_sha = write_json(baseline, baseline_payload())
  inventory_sha = write_xlsx(
    inventory,
    INVENTORY_SPEC,
    [["S-1", "Synthetic sample", "M1", 14, "", ""]],
  )
  inbound_sha = write_xlsx(
    inbound,
    INBOUND_SPEC,
    [
      ["2026-07-20 10:00", "Synthetic sample", "S-1", 2, "Fixture operator", "", ""],
      ["2026-07-27 09:00", "Synthetic sample", "S-1", 9, "Fixture operator", "", ""],
    ],
  )
  outbound_sha = write_xlsx(
    outbound,
    OUTBOUND_SPEC,
    [
      ["2026-07-20 11:00", "Synthetic sample", "S-1", 1, "Fixture applicant", "Fixture department", "Fixture purpose", "", "", "", "🧪 已取样"],
      ["2026-07-27 10:00", "Synthetic sample", "S-1", 2, "Fixture applicant", "Fixture department", "Fixture purpose", "", "", "", "🧪 已取样"],
    ],
  )
  return {
    "baseline_path": baseline,
    "baseline_sha256": baseline_sha,
    "inventory_path": inventory,
    "inventory_sha256": inventory_sha,
    "inventory_spec": INVENTORY_SPEC,
    "inbound_path": inbound,
    "inbound_sha256": inbound_sha,
    "inbound_spec": INBOUND_SPEC,
    "outbound_path": outbound,
    "outbound_sha256": outbound_sha,
    "outbound_spec": OUTBOUND_SPEC,
  }


def test_build_snapshot_preserves_baseline_ids_and_reconciles_delta(tmp_path: Path) -> None:
  sources = source_files(tmp_path)
  result = build_snapshot(**sources)

  assert result.summary == {
    "samples": 1,
    "inbounds": 2,
    "outbounds": 2,
    "sampled": 2,
    "rejected": 0,
    "onHand": 14,
    "newInbounds": 1,
    "newOutbounds": 1,
  }
  assert result.payload["samples"][0]["id"] == 1  # type: ignore[index]
  assert result.payload["samples"][0]["category"] == "fixture"  # type: ignore[index]
  assert result.payload["inboundLogs"][0]["id"] == 2  # type: ignore[index]
  assert result.payload["outboundRequests"][0]["id"] == 3  # type: ignore[index]
  assert result.payload["inboundLogs"][1]["id"] == (  # type: ignore[index]
    f"xlsx:inbound:{sources['inbound_sha256']}:row:3"
  )
  assert result.payload["outboundRequests"][1]["id"] == (  # type: ignore[index]
    f"xlsx:outbound:{sources['outbound_sha256']}:row:3"
  )


def test_workbook_parser_rejects_hash_formula_and_unsafe_zip_member(tmp_path: Path) -> None:
  path = tmp_path / "inventory.xlsx"
  sha256 = write_xlsx(
    path,
    INVENTORY_SPEC,
    [["S-1", "Synthetic sample", "M1", 7, "", ""]],
  )
  with pytest.raises(LegacyValidationError, match="SHA-256"):
    parse_workbook(path, "0" * 64, INVENTORY_SPEC)

  formula_path = tmp_path / "formula.xlsx"
  formula_sha = write_xlsx(
    formula_path,
    INVENTORY_SPEC,
    [["S-1", "Synthetic sample", "M1", 7, "", ""]],
    formula_cell="A2",
  )
  with pytest.raises(LegacyValidationError, match="formula"):
    parse_workbook(formula_path, formula_sha, INVENTORY_SPEC)

  unsafe_path = tmp_path / "unsafe.xlsx"
  unsafe_sha = write_xlsx(
    unsafe_path,
    INVENTORY_SPEC,
    [["S-1", "Synthetic sample", "M1", 7, "", ""]],
    unsafe_member=True,
  )
  with pytest.raises(LegacyValidationError, match="unsafe ZIP member"):
    parse_workbook(unsafe_path, unsafe_sha, INVENTORY_SPEC)


def test_build_snapshot_rejects_master_data_status_history_and_balance_drift(tmp_path: Path) -> None:
  sources = source_files(tmp_path)
  drifted_inventory = tmp_path / "drifted-inventory.xlsx"
  sources["inventory_path"] = drifted_inventory
  sources["inventory_sha256"] = write_xlsx(
    drifted_inventory,
    INVENTORY_SPEC,
    [["S-1", "Changed sample", "M1", 14, "", ""]],
  )
  with pytest.raises(LegacyValidationError, match="master-data drift"):
    build_snapshot(**sources)

  sources = source_files(tmp_path / "status")
  outbound = sources["outbound_path"]
  sources["outbound_sha256"] = write_xlsx(
    outbound,
    OUTBOUND_SPEC,
    [
      ["2026-07-20 11:00", "Synthetic sample", "S-1", 1, "Fixture applicant", "Fixture department", "Fixture purpose", "", "", "", "🧪 已取样"],
      ["2026-07-27 10:00", "Synthetic sample", "S-1", 2, "Fixture applicant", "Fixture department", "Fixture purpose", "", "", "", "pending"],
    ],
  )
  with pytest.raises(LegacyValidationError, match="unsupported status"):
    build_snapshot(**sources)

  sources = source_files(tmp_path / "history")
  inbound = sources["inbound_path"]
  sources["inbound_sha256"] = write_xlsx(
    inbound,
    INBOUND_SPEC,
    [
      ["2026-07-27 08:00", "Synthetic sample", "S-1", 2, "Fixture operator", "", ""],
      ["2026-07-27 09:00", "Synthetic sample", "S-1", 9, "Fixture operator", "", ""],
    ],
  )
  with pytest.raises(LegacyValidationError, match="baseline business row"):
    build_snapshot(**sources)

  sources = source_files(tmp_path / "balance")
  inventory = sources["inventory_path"]
  sources["inventory_sha256"] = write_xlsx(
    inventory,
    INVENTORY_SPEC,
    [["S-1", "Synthetic sample", "M1", 15, "", ""]],
  )
  with pytest.raises(LegacyValidationError, match="balance does not reconcile"):
    build_snapshot(**sources)


def test_exclusive_output_is_external_private_and_never_overwrites(tmp_path: Path) -> None:
  repo_root = tmp_path / "repo"
  repo_root.mkdir()
  external = tmp_path / "external"
  external.mkdir()
  output = external / "snapshot.json"
  artifact = write_snapshot_exclusive(output, {"fixture": True}, repo_root)
  assert artifact["sha256"] == hashlib.sha256(output.read_bytes()).hexdigest()
  assert stat.S_IMODE(output.stat().st_mode) == 0o600
  with pytest.raises(FileExistsError):
    write_snapshot_exclusive(output, {"fixture": False}, repo_root)
  with pytest.raises(LegacyValidationError, match="outside the Git worktree"):
    write_snapshot_exclusive(repo_root / "snapshot.json", {"fixture": True}, repo_root)
  with pytest.raises(LegacyValidationError, match="absolute"):
    write_snapshot_exclusive(Path("relative.json"), {"fixture": True}, repo_root)


def test_cli_requires_explicit_pii_confirmation_before_reading_inputs(capsys: pytest.CaptureFixture[str]) -> None:
  result = main([
    "--baseline-input", "/does/not/exist.json",
    "--inbound-input", "/does/not/exist-inbound.xlsx",
    "--inventory-input", "/does/not/exist-inventory.xlsx",
    "--outbound-input", "/does/not/exist-outbound.xlsx",
    "--output", "/tmp/does-not-exist.json",
  ])
  captured = capsys.readouterr()
  assert result == 2
  assert "confirm-pii-output" in captured.err
  assert captured.out == ""
