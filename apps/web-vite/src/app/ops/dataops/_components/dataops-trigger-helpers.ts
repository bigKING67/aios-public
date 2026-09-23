import type { DataOpsRuntimePipeline } from '@/types/dataops';
import {
  DATAOPS_TRIGGER_PARAMETER_SPECS,
  type DataOpsTriggerParameterSpec,
} from '@/config/dataops-trigger-params';

export function getDefaultTriggerParameters(
  specs: DataOpsTriggerParameterSpec[]
): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {};

  for (const spec of specs) {
    if (spec.defaultValue !== undefined) {
      values[spec.key] = spec.defaultValue;
    }
  }

  return values;
}

export function getTriggerParameterSpecs(pipelineId: string): DataOpsTriggerParameterSpec[] {
  return DATAOPS_TRIGGER_PARAMETER_SPECS[pipelineId] || [];
}

export function resolveCommonBatchTriggerSpecs(
  pipelines: DataOpsRuntimePipeline[]
): DataOpsTriggerParameterSpec[] {
  if (!pipelines.length) {
    return [];
  }

  const firstPipelineSpecs = getTriggerParameterSpecs(pipelines[0].id);
  const restPipelines = pipelines.slice(1);

  return firstPipelineSpecs
    .map((baseSpec) => {
      const matchedSpecs: DataOpsTriggerParameterSpec[] = [baseSpec];

      for (const pipeline of restPipelines) {
        const matched = getTriggerParameterSpecs(pipeline.id).find(
          (item) => item.key === baseSpec.key && item.type === baseSpec.type
        );

        if (!matched) {
          return null;
        }

        matchedSpecs.push(matched);
      }

      const normalized: DataOpsTriggerParameterSpec = {
        ...baseSpec,
        required: matchedSpecs.some((item) => Boolean(item.required)),
      };

      if (baseSpec.type === 'number') {
        const minCandidates = matchedSpecs
          .map((item) => item.min)
          .filter((value): value is number => typeof value === 'number');
        const maxCandidates = matchedSpecs
          .map((item) => item.max)
          .filter((value): value is number => typeof value === 'number');

        const mergedMin = minCandidates.length ? Math.max(...minCandidates) : undefined;
        const mergedMax = maxCandidates.length ? Math.min(...maxCandidates) : undefined;
        if (
          mergedMin !== undefined &&
          mergedMax !== undefined &&
          mergedMin > mergedMax
        ) {
          return null;
        }

        normalized.min = mergedMin;
        normalized.max = mergedMax;
        normalized.integer = matchedSpecs.some((item) => item.integer !== false);

        if (typeof normalized.defaultValue === 'number') {
          const defaultNumber = normalized.defaultValue;
          if (normalized.min !== undefined && defaultNumber < normalized.min) {
            delete normalized.defaultValue;
          }
          if (normalized.max !== undefined && defaultNumber > normalized.max) {
            delete normalized.defaultValue;
          }
          if (
            normalized.integer !== false &&
            !Number.isInteger(defaultNumber)
          ) {
            delete normalized.defaultValue;
          }
        }
      }

      return normalized;
    })
    .filter((item): item is DataOpsTriggerParameterSpec => Boolean(item));
}

function parseBooleanValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  return null;
}

function parseNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

export function clampIntegerValue(
  value: unknown,
  fallback: number,
  options: { min: number; max: number }
): number {
  const parsed = parseNumberValue(value);
  if (parsed === null) {
    return fallback;
  }

  const normalized = Math.trunc(parsed);
  if (!Number.isFinite(normalized)) {
    return fallback;
  }

  return Math.min(Math.max(normalized, options.min), options.max);
}

export function buildTriggerParametersPayload(
  specs: DataOpsTriggerParameterSpec[],
  values: Record<string, unknown>
): Record<string, string | number | boolean> {
  if (!specs.length) {
    return {};
  }

  const payload: Record<string, string | number | boolean> = {};
  for (const spec of specs) {
    const rawValue = values[spec.key];
    const isEmptyString = typeof rawValue === 'string' && rawValue.trim() === '';
    if (rawValue === undefined || rawValue === null || isEmptyString) {
      continue;
    }

    if (spec.type === 'boolean') {
      const parsed = parseBooleanValue(rawValue);
      if (parsed !== null) {
        payload[spec.key] = parsed;
      }
      continue;
    }

    if (spec.type === 'number') {
      const parsed = parseNumberValue(rawValue);
      if (parsed !== null) {
        payload[spec.key] = spec.integer === false ? parsed : Math.trunc(parsed);
      }
      continue;
    }

    const normalized = String(rawValue).trim();
    if (!normalized) {
      continue;
    }
    payload[spec.key] = normalized;
  }

  return payload;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildLinuxRunCommand(pipeline: DataOpsRuntimePipeline): string {
  return `uv run prefect deployment run "${pipeline.flowName}/${pipeline.deploymentName}"`;
}

export function buildLinuxDeployCommand(pipeline: DataOpsRuntimePipeline): string {
  return (
    pipeline.linuxDeployCommand ||
    `bash ${pipeline.linuxDeployScript || 'etl/groland_postgres/scripts/deploy_xxx.sh'}`
  );
}

export function buildLinuxRunCommandWithParams(
  pipeline: DataOpsRuntimePipeline,
  specs: DataOpsTriggerParameterSpec[],
  values: Record<string, unknown>
): string {
  if (!specs.length) {
    return buildLinuxRunCommand(pipeline);
  }

  const paramArgs: string[] = [];
  for (const spec of specs) {
    const rawValue = values[spec.key];
    const isEmptyString = typeof rawValue === 'string' && rawValue.trim() === '';
    if (rawValue === undefined || rawValue === null || isEmptyString) {
      continue;
    }

    if (spec.type === 'boolean') {
      const parsed = parseBooleanValue(rawValue);
      if (parsed !== null) {
        paramArgs.push(`--param ${spec.key}=${parsed ? 'true' : 'false'}`);
      }
      continue;
    }

    if (spec.type === 'number') {
      const parsed = parseNumberValue(rawValue);
      if (parsed !== null) {
        const normalized = spec.integer === false ? parsed : Math.trunc(parsed);
        paramArgs.push(`--param ${spec.key}=${normalized}`);
      }
      continue;
    }

    const normalized = String(rawValue).trim();
    if (!normalized) {
      continue;
    }
    paramArgs.push(`--param ${spec.key}=${shellQuote(normalized)}`);
  }

  if (!paramArgs.length) {
    return buildLinuxRunCommand(pipeline);
  }

  return `${buildLinuxRunCommand(pipeline)} ${paramArgs.join(' ')}`;
}

export interface DataOpsLinuxCommandPreview {
  deployCommand: string;
  runCommand: string;
  runWithParamsCommand: string;
}

export function buildLinuxCommandPreview(
  pipeline: DataOpsRuntimePipeline,
  specs: DataOpsTriggerParameterSpec[],
  values: Record<string, unknown>
): DataOpsLinuxCommandPreview {
  return {
    deployCommand: buildLinuxDeployCommand(pipeline),
    runCommand: buildLinuxRunCommand(pipeline),
    runWithParamsCommand: buildLinuxRunCommandWithParams(pipeline, specs, values),
  };
}
