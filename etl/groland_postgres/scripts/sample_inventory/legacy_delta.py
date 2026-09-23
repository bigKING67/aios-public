from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sample_inventory.legacy_model import (
  LegacyImportPlan,
  LegacyInbound,
  LegacyOutbound,
  LegacySample,
  LegacyValidationError,
)


@dataclass(frozen=True)
class LegacySampleBalanceDelta:
  legacy_id: str
  baseline_quantity: int
  inbound_quantity: int
  sampled_outbound_quantity: int
  approved_outbound_quantity: int
  final_quantity: int

  @property
  def net_quantity(self) -> int:
    return self.net_available_quantity

  @property
  def net_on_hand_quantity(self) -> int:
    return self.inbound_quantity - self.sampled_outbound_quantity

  @property
  def net_reserved_quantity(self) -> int:
    return 0

  @property
  def net_available_quantity(self) -> int:
    return self.net_on_hand_quantity


@dataclass(frozen=True)
class LegacyCatchUpPlan:
  baseline: LegacyImportPlan
  final: LegacyImportPlan
  new_inbounds: tuple[LegacyInbound, ...]
  new_outbounds: tuple[LegacyOutbound, ...]
  sample_deltas: tuple[LegacySampleBalanceDelta, ...]

  @property
  def summary(self) -> dict[str, int | str]:
    sampled = tuple(item for item in self.new_outbounds if item.status == "sampled")
    approved = tuple(item for item in self.new_outbounds if item.status == "approved")
    rejected = tuple(item for item in self.new_outbounds if item.status == "rejected")
    return {
      "baselineSourceSha256": self.baseline.source_sha256,
      "sourceSha256": self.final.source_sha256,
      "samples": len(self.final.samples),
      "changedSampleBalances": sum(
        delta.net_on_hand_quantity != 0 or delta.net_reserved_quantity != 0
        for delta in self.sample_deltas
      ),
      "newInboundRecords": len(self.new_inbounds),
      "newInboundUnits": sum(item.quantity for item in self.new_inbounds),
      "newOutboundRequests": len(self.new_outbounds),
      "newSampledOutbounds": len(sampled),
      "newApprovedOutbounds": len(approved),
      "newRejectedOutbounds": len(rejected),
      "newSampledOutboundUnits": sum(item.quantity for item in sampled),
      "newApprovedOutboundUnits": sum(item.quantity for item in approved),
      "netOnHandDelta": sum(delta.net_on_hand_quantity for delta in self.sample_deltas),
      "netReservedDelta": sum(delta.net_reserved_quantity for delta in self.sample_deltas),
      "netAvailableDelta": sum(delta.net_available_quantity for delta in self.sample_deltas),
      "finalOnHand": sum(item.quantity for item in self.final.samples),
      "finalReserved": 0,
      "finalAvailable": sum(item.quantity for item in self.final.samples),
    }


def _sample_metadata(sample: LegacySample) -> tuple[str | None, ...]:
  return (
    sample.code,
    sample.name,
    sample.model,
    sample.category,
    sample.location,
    sample.remark,
  )


def _require_immutable_history(
  *,
  baseline_records: tuple[LegacyInbound, ...] | tuple[LegacyOutbound, ...],
  final_records: tuple[LegacyInbound, ...] | tuple[LegacyOutbound, ...],
  owner: str,
) -> None:
  final_by_id = {item.legacy_id: item for item in final_records}
  if any(item.legacy_id not in final_by_id for item in baseline_records):
    raise LegacyValidationError(f"final snapshot removed a baseline {owner} record")
  if any(final_by_id[item.legacy_id] != item for item in baseline_records):
    raise LegacyValidationError(f"final snapshot changed a baseline {owner} record")


def build_legacy_catch_up_plan(
  baseline: LegacyImportPlan,
  final: LegacyImportPlan,
) -> LegacyCatchUpPlan:
  if baseline.source_sha256 == final.source_sha256:
    raise LegacyValidationError("catch-up input must differ from the baseline snapshot")

  baseline_samples = {item.legacy_id: item for item in baseline.samples}
  final_samples = {item.legacy_id: item for item in final.samples}
  if baseline_samples.keys() != final_samples.keys():
    raise LegacyValidationError("catch-up requires the same sample identity set as the baseline")
  if any(_sample_metadata(sample) != _sample_metadata(final_samples[sample.legacy_id]) for sample in baseline.samples):
    raise LegacyValidationError("catch-up does not permit sample master-data drift")

  _require_immutable_history(
    baseline_records=baseline.inbounds,
    final_records=final.inbounds,
    owner="inbound",
  )
  _require_immutable_history(
    baseline_records=baseline.outbounds,
    final_records=final.outbounds,
    owner="outbound",
  )

  baseline_inbound_ids = {item.legacy_id for item in baseline.inbounds}
  baseline_outbound_ids = {item.legacy_id for item in baseline.outbounds}
  new_inbounds = tuple(item for item in final.inbounds if item.legacy_id not in baseline_inbound_ids)
  new_outbounds = tuple(item for item in final.outbounds if item.legacy_id not in baseline_outbound_ids)

  inbound_units_by_sample: dict[str, int] = {}
  for inbound in new_inbounds:
    inbound_units_by_sample[inbound.sample_legacy_id] = (
      inbound_units_by_sample.get(inbound.sample_legacy_id, 0) + inbound.quantity
    )
  sampled_units_by_sample: dict[str, int] = {}
  approved_units_by_sample: dict[str, int] = {}
  for outbound in new_outbounds:
    if outbound.status == "sampled":
      sampled_units_by_sample[outbound.sample_legacy_id] = (
        sampled_units_by_sample.get(outbound.sample_legacy_id, 0) + outbound.quantity
      )
    elif outbound.status == "approved":
      approved_units_by_sample[outbound.sample_legacy_id] = (
        approved_units_by_sample.get(outbound.sample_legacy_id, 0) + outbound.quantity
      )

  sample_deltas: list[LegacySampleBalanceDelta] = []
  for baseline_sample in baseline.samples:
    inbound_quantity = inbound_units_by_sample.get(baseline_sample.legacy_id, 0)
    sampled_outbound_quantity = sampled_units_by_sample.get(baseline_sample.legacy_id, 0)
    approved_outbound_quantity = approved_units_by_sample.get(baseline_sample.legacy_id, 0)
    final_quantity = final_samples[baseline_sample.legacy_id].quantity
    expected_final_quantity = (
      baseline_sample.quantity
      + inbound_quantity
      - sampled_outbound_quantity
    )
    if final_quantity != expected_final_quantity:
      raise LegacyValidationError("final sample balances do not reconcile with the frozen delta")
    sample_deltas.append(
      LegacySampleBalanceDelta(
        legacy_id=baseline_sample.legacy_id,
        baseline_quantity=baseline_sample.quantity,
        inbound_quantity=inbound_quantity,
        sampled_outbound_quantity=sampled_outbound_quantity,
        approved_outbound_quantity=approved_outbound_quantity,
        final_quantity=final_quantity,
      )
    )

  return LegacyCatchUpPlan(
    baseline=baseline,
    final=final,
    new_inbounds=new_inbounds,
    new_outbounds=new_outbounds,
    sample_deltas=tuple(sample_deltas),
  )


def validate_catch_up_cutover(plan: LegacyCatchUpPlan, cutover_at: datetime) -> None:
  latest_source_time = max(
    (
      *(item.occurred_at for item in plan.new_inbounds),
      *(item.requested_at for item in plan.new_outbounds),
    ),
    default=None,
  )
  if latest_source_time is not None and latest_source_time > cutover_at:
    raise LegacyValidationError("cutover-at precedes a frozen delta record")
