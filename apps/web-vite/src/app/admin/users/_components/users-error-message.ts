import { resolveClientErrorMessage } from '@/lib/client-error';

export function getUserErrorMessage(error: unknown, fallback: string): string {
  return resolveClientErrorMessage(error, fallback);
}
