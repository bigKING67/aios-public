import { frontendEnv } from './frontend-env';

export function resolveApiGatewayPrefix(): string {
  return frontendEnv.apiGatewayPrefix;
}

export function buildApiGatewayPath(path: string): string {
  const prefix = resolveApiGatewayPrefix();
  const normalizedPath = `/${(path || '').trim().replace(/^\/+/, '')}`;
  return `${prefix}${normalizedPath}`;
}
