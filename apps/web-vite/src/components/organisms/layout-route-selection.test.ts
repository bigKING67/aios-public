import { describe, expect, it } from "vitest";

import { ROUTE_PATHS } from "@/lib/route-policy-registry";
import { isEdgeToEdgeContentRoutePath } from "./layout-route-selection";

describe("layout route selection", () => {
  it("lets the sample inventory workspace own its content spacing", () => {
    expect(isEdgeToEdgeContentRoutePath(ROUTE_PATHS.sampleInventory)).toBe(true);
    expect(isEdgeToEdgeContentRoutePath(`${ROUTE_PATHS.sampleInventory}/history`)).toBe(true);
  });

  it("keeps ordinary dashboard routes inside the default content frame", () => {
    expect(isEdgeToEdgeContentRoutePath(ROUTE_PATHS.dashboard)).toBe(false);
  });
});
