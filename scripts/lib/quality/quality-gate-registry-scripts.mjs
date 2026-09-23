import { readFileSync } from 'node:fs';
import path from 'node:path';

export function readPackageJson(repoRoot) {
  const packagePath = path.join(repoRoot, 'package.json');
  return JSON.parse(readFileSync(packagePath, 'utf8'));
}

export function normalizeCommand(command) {
  return String(command ?? '').trim();
}

export function resolvePackageScriptCommand(scriptName, scripts, seen = new Set()) {
  const command = normalizeCommand(scripts?.[scriptName]);
  if (!command || seen.has(scriptName)) {
    return command;
  }

  seen.add(scriptName);
  const npmRunMatch = command.match(/^npm\s+run\s+([A-Za-z0-9:_-]+)$/);
  if (!npmRunMatch) {
    return command;
  }

  const nestedScript = npmRunMatch[1];
  const nestedCommand = normalizeCommand(scripts?.[nestedScript]);
  return nestedCommand ? resolvePackageScriptCommand(nestedScript, scripts, seen) : command;
}

export function resolveBaseGateCommand(baseGate, scripts) {
  return resolvePackageScriptCommand(baseGate.name, scripts) || normalizeCommand(baseGate.command);
}
