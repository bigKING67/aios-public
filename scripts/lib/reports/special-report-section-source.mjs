const RENDERED_SECTION_COMPONENTS = [
  'section',
  'DecisionProofSection',
  'DraftBrandPagePlaceholder',
  'TmallAnalysisSection',
];

export function collectRenderedSectionIds(files, sourcePaths) {
  const sectionIds = new Set();
  const componentPattern = RENDERED_SECTION_COMPONENTS.join('|');
  const sectionPattern = new RegExp(
    `<(?:${componentPattern})\\s+[^>]*id="([^"]+)"`,
    'g',
  );

  for (const filePath of sourcePaths) {
    for (const match of files[filePath].matchAll(sectionPattern)) {
      sectionIds.add(match[1]);
    }
  }

  return sectionIds;
}

export function extractSectionSource(source, sectionId) {
  const escapedSectionId = escapeRegex(sectionId);
  const sectionMatch = source.match(
    new RegExp(`<section\\s+id="${escapedSectionId}"[\\s\\S]*?<\\/section>`),
  );
  if (sectionMatch) {
    return sectionMatch[0];
  }

  const idMatch = source.match(new RegExp(`\\bid="${escapedSectionId}"`));
  if (!idMatch || idMatch.index === undefined) {
    return null;
  }

  const invocationStart = source.lastIndexOf('<TmallAnalysisSection', idMatch.index);
  const invocationEnd = source.indexOf('/>', idMatch.index);
  if (invocationStart < 0 || invocationEnd < 0) {
    return null;
  }

  const definitionStart = source.indexOf('function TmallAnalysisSection(');
  const definitionEnd = source.indexOf('export function TmallShelfCommerceSection', definitionStart);
  const sharedDefinition = definitionStart >= 0 && definitionEnd > definitionStart
    ? source.slice(definitionStart, definitionEnd)
    : '';

  return `${source.slice(invocationStart, invocationEnd + 2)}\n${sharedDefinition}`;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
