import { describe, expect, it } from "vitest";

import { createSampleInventorySubmissionKeyRegistry } from "./use-sample-inventory-submission-keys";

describe("sample inventory submission key registry", () => {
  it("retains an exact request key through failures and releases it after success", () => {
    let sequence = 0;
    const registry = createSampleInventorySubmissionKeyRegistry({
      createKey: (operation) => `${operation}-${++sequence}`,
    });

    const first = registry.acquire("sample-update", { id: 7, version: 2 });
    const retry = registry.acquire("sample-update", { id: 7, version: 2 });
    expect(retry).toEqual(first);

    registry.release(first.cacheKey);
    expect(registry.acquire("sample-update", { id: 7, version: 2 }).submissionKey).toBe("sample-update-2");
  });

  it("isolates operations and bounds abandoned failed requests", () => {
    let sequence = 0;
    const registry = createSampleInventorySubmissionKeyRegistry({
      maxEntries: 2,
      createKey: (operation) => `${operation}-${++sequence}`,
    });

    const oldest = registry.acquire("sample-create", { code: "A" });
    expect(registry.acquire("sample-update", { code: "A" }).submissionKey).toBe("sample-update-2");
    expect(registry.acquire("sample-create", { code: "B" }).submissionKey).toBe("sample-create-3");
    expect(registry.acquire("sample-create", { code: "A" }).submissionKey).not.toBe(oldest.submissionKey);
  });
});
