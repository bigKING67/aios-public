import { spawnSync } from 'node:child_process';
import process from 'node:process';

const COMMAND_OUTPUT_CACHE = new Map();

export function commandOutput(command, args, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const cacheKey = [
    cwd,
    process.env.PATH ?? '',
    command,
    ...args,
  ].join('\0');
  if (COMMAND_OUTPUT_CACHE.has(cacheKey)) {
    return COMMAND_OUTPUT_CACHE.get(cacheKey);
  }
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    const output = `<error:${result.error.message}>`;
    COMMAND_OUTPUT_CACHE.set(cacheKey, output);
    return output;
  }
  const output = `${result.stdout ?? ''}${result.stderr ? `\n${result.stderr}` : ''}`.trim();
  const version = `status=${result.status ?? 1};${output}`;
  COMMAND_OUTPUT_CACHE.set(cacheKey, version);
  return version;
}

export function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      throw new Error(`unexpected positional argument: ${arg}`);
    }
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${arg} requires a value`);
    }
    options[key] = value;
    index += 1;
  }
  return options;
}
