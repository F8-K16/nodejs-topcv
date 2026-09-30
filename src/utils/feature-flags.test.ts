import { describe, expect, it } from "vitest";
import { resolvePublicFeatures } from "./feature-flags";

describe("resolvePublicFeatures", () => {
  it("keeps AI and OpenSearch off unless both the flag and config are present", () => {
    expect(
      resolvePublicFeatures({
        aiEnabled: false,
        geminiApiKey: "key",
        opensearchEnabled: false,
        opensearchNode: "http://localhost:9200",
      }),
    ).toEqual({ ai: false, opensearch: false });

    expect(
      resolvePublicFeatures({
        aiEnabled: true,
        geminiApiKey: "   ",
        opensearchEnabled: true,
        opensearchNode: "",
      }),
    ).toEqual({ ai: false, opensearch: false });
  });

  it("turns features on only when they can actually serve requests", () => {
    expect(
      resolvePublicFeatures({
        aiEnabled: true,
        geminiApiKey: "gemini-key",
        opensearchEnabled: true,
        opensearchNode: "http://localhost:9200",
      }),
    ).toEqual({ ai: true, opensearch: true });
  });
});
