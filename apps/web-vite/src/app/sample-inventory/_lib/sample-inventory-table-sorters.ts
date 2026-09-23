const SAMPLE_INVENTORY_COLLATOR = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});

export function compareSampleInventoryText(left: unknown, right: unknown): number {
  return SAMPLE_INVENTORY_COLLATOR.compare(String(left ?? ""), String(right ?? ""));
}

export function compareSampleInventoryNumber(left: unknown, right: unknown): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  if (Number.isFinite(leftNumber)) return 1;
  if (Number.isFinite(rightNumber)) return -1;
  return compareSampleInventoryText(left, right);
}

export function compareSampleInventoryTimestamp(left: unknown, right: unknown): number {
  const leftTimestamp = Date.parse(String(left ?? ""));
  const rightTimestamp = Date.parse(String(right ?? ""));
  if (Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp)) return leftTimestamp - rightTimestamp;
  if (Number.isFinite(leftTimestamp)) return 1;
  if (Number.isFinite(rightTimestamp)) return -1;
  return compareSampleInventoryText(left, right);
}
