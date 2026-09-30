import { describe, expect, it } from "vitest";
import { PUBLIC_CATALOG_RATE_LIMIT } from "./rateLimit.middleware";

describe("public catalog rate limit", () => {
  it("caps anonymous list traffic inside a one-minute window", () => {
    expect(PUBLIC_CATALOG_RATE_LIMIT.windowMs).toBe(60_000);
    expect(PUBLIC_CATALOG_RATE_LIMIT.limit).toBeLessThanOrEqual(120);
    expect(PUBLIC_CATALOG_RATE_LIMIT.limit).toBeGreaterThanOrEqual(30);
  });
});
