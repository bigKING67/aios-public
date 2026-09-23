import { resolveClientErrorMessage } from '@/lib/client-error';

export function getRoleErrorMessage(error: unknown, fallback: string): string {
  return resolveClientErrorMessage(error, fallback);
}
