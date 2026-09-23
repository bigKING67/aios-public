export function normalizeChangeStatus(status) {
  return String(status ?? '').trim();
}

function statusPriority(status) {
  const normalized = normalizeChangeStatus(status);
  if (normalized.includes('?') || normalized.includes('A') || normalized.startsWith('R')) {
    return 3;
  }
  if (normalized.includes('D')) {
    return 2;
  }
  if (normalized) {
    return 1;
  }
  return 0;
}

export function parseChangedFileEntry(value) {
  if (value && typeof value === 'object' && typeof value.file === 'string') {
    return {
      file: value.file,
      status: normalizeChangeStatus(value.status),
    };
  }

  const text = String(value ?? '').trim();
  const match = text.match(/^((?:[RC]\d{1,3})|[ MARCDAU?!]{1,2}|\?\?)\s*:\s*(.+)$/);
  if (!match) {
    return {
      file: text,
      status: '',
    };
  }
  return {
    file: match[2].trim(),
    status: normalizeChangeStatus(match[1]),
  };
}

export function parseGitNameStatusLine(line) {
  if (!line) {
    return null;
  }
  const [status, ...fileParts] = line.split('\t');
  const file = fileParts.at(-1);
  if (!status || !file) {
    return null;
  }
  return {
    file,
    status: normalizeChangeStatus(status),
  };
}

export function parseGitStatusLine(line) {
  if (!line || line.length < 4) {
    return null;
  }
  const trimmedStatusMatch = line.match(/^([MADRCU?!])\s+(.+)$/);
  const rawStatus = trimmedStatusMatch ? trimmedStatusMatch[1] : line.slice(0, 2);
  let file = trimmedStatusMatch ? trimmedStatusMatch[2].trim() : line.slice(3).trim();
  if (file.includes(' -> ')) {
    file = file.split(' -> ').at(-1).trim();
  }
  if (file.startsWith('"') && file.endsWith('"')) {
    file = file.slice(1, -1);
  }
  return {
    file,
    status: normalizeChangeStatus(rawStatus),
  };
}

export function dedupeChangedFileEntries(entries) {
  const byFile = new Map();
  for (const entry of entries) {
    if (!entry?.file) {
      continue;
    }
    const previous = byFile.get(entry.file);
    if (!previous || statusPriority(entry.status) > statusPriority(previous.status)) {
      byFile.set(entry.file, {
        file: entry.file,
        status: normalizeChangeStatus(entry.status),
      });
    }
  }
  return [...byFile.values()].sort((left, right) => left.file.localeCompare(right.file));
}

export function changedFilesEnvValue(changedFiles = []) {
  return dedupeChangedFileEntries(changedFiles.map(parseChangedFileEntry))
    .map(({ file, status }) => (status ? `${status}:${file}` : file))
    .join('\n');
}
