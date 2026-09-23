import { frontendEnv } from './frontend-env';

const ADMIN_ROLE_CANDIDATES = ['admin', 'super_admin', 'superadmin'];
const DEFAULT_SUPER_ADMIN_IDENTIFIERS: string[] = [];

function normalizeIdentity(value?: string | null): string {
  return (value || '').trim().toLowerCase();
}

function parseIdentityList(rawValue?: string): string[] {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(',')
    .map((item) => normalizeIdentity(item))
    .filter(Boolean);
}

function normalizeRoleName(value?: string | null): string {
  return (value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function resolveConfiguredSuperAdminIdentifierSet(): Set<string> {
  const clientEnvIdentifiers = parseIdentityList(frontendEnv.superAdminAccounts);
  return new Set([
    ...DEFAULT_SUPER_ADMIN_IDENTIFIERS.map((value) => normalizeIdentity(value)),
    ...clientEnvIdentifiers,
  ]);
}

function extractTrustedIdentityCandidates(input: {
  username?: string | null;
  email?: string | null;
}): string[] {
  return [normalizeIdentity(input.username), normalizeIdentity(input.email)].filter(Boolean);
}

export function isSuperAdminAccount(input: {
  username?: string | null;
  email?: string | null;
  fullName?: string | null;
  roles?: string[] | null;
}): boolean {
  const superAdminIdentifiers = resolveConfiguredSuperAdminIdentifierSet();
  const candidates = extractTrustedIdentityCandidates(input);

  return candidates.some((candidate) => superAdminIdentifiers.has(candidate));
}

export function hasAdminRole(roles?: string[] | null): boolean {
  if (!Array.isArray(roles) || roles.length === 0) {
    return false;
  }

  const roleSet = new Set(roles.map((role) => normalizeRoleName(role)).filter(Boolean));
  return ADMIN_ROLE_CANDIDATES.some((role) => roleSet.has(role));
}
