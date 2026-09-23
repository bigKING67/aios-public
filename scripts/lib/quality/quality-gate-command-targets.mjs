export function commandTargetFiles(command) {
  const text = String(command ?? '');
  const files = [];
  for (const match of text.matchAll(/(?:node|bash|sh)\s+((?:\.\/)?scripts\/[A-Za-z0-9._/-]+\.(?:mjs|js|sh))/g)) {
    files.push(match[1].replace(/^\.\//, ''));
  }
  return files;
}

export function pairedBehaviorTargetFiles(targetFiles) {
  return targetFiles.flatMap((file) => {
    const productionFile = file.replace(/\.behavior\.mjs$/, '.mjs');
    return productionFile === file ? [] : [productionFile];
  });
}
