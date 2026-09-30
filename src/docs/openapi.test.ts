import { describe, expect, it } from "vitest";
import { collectApiRoutes } from "./openapi";

describe("openapi route catalog", () => {
  it("documents the public and authenticated surface", () => {
    const routes = collectApiRoutes();
    const keys = new Set(routes.map((route) => `${route.method} ${route.path}`));
    expect(routes.length).toBeGreaterThanOrEqual(90);
    expect(keys.has("get /api/metadata")).toBe(true);
    expect(keys.has("get /api/jobs")).toBe(true);
    expect(keys.has("get /api/companies")).toBe(true);
    expect(keys.has("post /api/auth/login")).toBe(true);
    expect(keys.has("post /api/ai/cv/suggest")).toBe(true);
    expect(keys.has("get /api/insights/salary")).toBe(true);
    expect(keys.has("get /api/blog-posts")).toBe(true);
    expect(keys.has("post /api/contact")).toBe(true);
    expect(keys.has("post /api/users/applications/bulk-withdraw")).toBe(true);
    expect(keys.has("post /api/auth/2fa/verify")).toBe(true);
  });
});
