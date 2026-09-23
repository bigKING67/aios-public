export function parseGsvSnapshotData(source, sourcePath, findings) {
  try {
    const snapshotData = JSON.parse(source);
    if (!snapshotData || typeof snapshotData !== 'object' || Array.isArray(snapshotData)) {
      findings.push(`${sourcePath} must contain one JSON object.`);
      return null;
    }
    return snapshotData;
  } catch (error) {
    findings.push(`${sourcePath} is invalid JSON (${error.message}).`);
    return null;
  }
}

export function readGsvSnapshotTocItems(snapshotData, sourcePath, findings) {
  if (!Array.isArray(snapshotData?.toc)) {
    findings.push(`Could not parse toc array from ${sourcePath}.`);
    return [];
  }

  return snapshotData.toc.map((item) => ({
    id: typeof item?.id === 'string' ? item.id : null,
    index: typeof item?.index === 'string' ? item.index : null,
    targetId: typeof item?.targetId === 'string' ? item.targetId : null,
    title: typeof item?.title === 'string' ? item.title : null,
    level: typeof item?.level === 'string' ? item.level : 'sub',
    navVisibility: typeof item?.navVisibility === 'string' ? item.navVisibility : null,
    disabled: item?.disabled === true,
  }));
}

export function readGsvSnapshotTmallMonthlyTopProductRows(snapshotData, sourcePath, findings) {
  if (!Array.isArray(snapshotData?.tmallMonthlyTopProducts)) {
    findings.push(`Could not parse tmallMonthlyTopProducts from ${sourcePath}.`);
    return [];
  }

  return snapshotData.tmallMonthlyTopProducts.map((row) => ({
    period: typeof row?.period === 'string' ? row.period : null,
    rank: finiteNumberOrNull(row?.rank),
    payAmount: finiteNumberOrNull(row?.payAmount),
    refundAmount: finiteNumberOrNull(row?.refundAmount),
    netAmount: finiteNumberOrNull(row?.netAmount),
    periodLabel: typeof row?.periodLabel === 'string' ? row.periodLabel : null,
    orderCount: finiteNumberOrNull(row?.orderCount),
    buyerCount: finiteNumberOrNull(row?.buyerCount),
    visitorCount: finiteNumberOrNull(row?.visitorCount),
    cartUserCount: finiteNumberOrNull(row?.cartUserCount),
    monthNetAmount: finiteNumberOrNull(row?.monthNetAmount),
    cartRate: finiteNumberOrNull(row?.cartRate),
    conversionRate: finiteNumberOrNull(row?.conversionRate),
    hasCartRateField: Object.hasOwn(row ?? {}, 'cartRate'),
    hasConversionRateField: Object.hasOwn(row ?? {}, 'conversionRate'),
  }));
}

function finiteNumberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
