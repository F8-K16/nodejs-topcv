export type PublicFeatures = {
  ai: boolean;
  opensearch: boolean;
};

export function resolvePublicFeatures(input: {
  aiEnabled: boolean;
  geminiApiKey: string;
  opensearchEnabled: boolean;
  opensearchNode: string;
}): PublicFeatures {
  return {
    ai: input.aiEnabled && input.geminiApiKey.trim().length > 0,
    opensearch:
      input.opensearchEnabled && input.opensearchNode.trim().length > 0,
  };
}
