import { useRef } from "react";

export type SampleInventorySubmissionKeyLease = {
  cacheKey: string;
  submissionKey: string;
};

type SubmissionKeyRegistryOptions = {
  maxEntries?: number;
  createKey?: (operation: string) => string;
};

export function createSampleInventorySubmissionKeyRegistry({
  maxEntries = 100,
  createKey = (operation) => `${operation}-${crypto.randomUUID()}`,
}: SubmissionKeyRegistryOptions = {}) {
  const entries = new Map<string, string>();

  const cacheKeyFor = (operation: string, payload: unknown): string => {
    const serialized = JSON.stringify(payload);
    if (!operation || serialized === undefined) {
      throw new Error("Sample inventory submission keys require a named operation and JSON payload");
    }
    return `${operation}:${serialized}`;
  };

  const acquire = (operation: string, payload: unknown): SampleInventorySubmissionKeyLease => {
    const cacheKey = cacheKeyFor(operation, payload);
    const current = entries.get(cacheKey);
    if (current) return { cacheKey, submissionKey: current };

    if (entries.size >= maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest) entries.delete(oldest);
    }
    const submissionKey = createKey(operation);
    entries.set(cacheKey, submissionKey);
    return { cacheKey, submissionKey };
  };

  return {
    acquire,
    release: (cacheKey: string) => entries.delete(cacheKey),
    releaseFor: (operation: string, payload: unknown) => entries.delete(cacheKeyFor(operation, payload)),
    clear: () => entries.clear(),
  };
}

export function useSampleInventorySubmissionKeys() {
  const registryRef = useRef<ReturnType<typeof createSampleInventorySubmissionKeyRegistry> | undefined>(undefined);
  if (!registryRef.current) {
    registryRef.current = createSampleInventorySubmissionKeyRegistry();
  }
  return registryRef.current;
}
