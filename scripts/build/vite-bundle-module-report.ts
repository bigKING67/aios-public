import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

interface BundleModuleRecord {
  chunk: string;
  id: string;
  renderedBytes: number;
}

export function createBundleModuleReportPlugin(outputPath: string | undefined): Plugin | null {
  const resolvedOutputPath = outputPath?.trim();
  if (!resolvedOutputPath) {
    return null;
  }

  return {
    name: 'aios-bundle-module-report',
    generateBundle(_options, bundle) {
      const modules: BundleModuleRecord[] = [];
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') {
          continue;
        }
        for (const [id, details] of Object.entries(output.modules)) {
          modules.push({
            chunk: output.fileName,
            id,
            renderedBytes: details.renderedLength,
          });
        }
      }

      const report = {
        generatedAt: new Date().toISOString(),
        modules: modules.sort((left, right) => right.renderedBytes - left.renderedBytes),
      };
      const absoluteOutputPath = path.resolve(resolvedOutputPath);
      writeFileSync(absoluteOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      this.info(`wrote bundle module report to ${absoluteOutputPath}`);
    },
  };
}
