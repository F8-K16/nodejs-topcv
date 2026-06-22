import { env } from "../config/env";
import { getOpenSearchClient, isOpenSearchEnabled } from "../utils/opensearch";
import type { Indices_Create_RequestBody } from "@opensearch-project/opensearch/api/indices/create";

const buildJobsIndexBody = (): Indices_Create_RequestBody => {
  return {
    settings: {
      analysis: {
        filter: {
          vi_edge_ngram: {
            type: "edge_ngram",
            min_gram: 2,
            max_gram: 20,
          },
        },
        analyzer: {
          vi_text: {
            type: "custom",
            tokenizer: "standard",
            filter: ["lowercase", "asciifolding"],
          },
          vi_autocomplete: {
            type: "custom",
            tokenizer: "standard",
            filter: ["lowercase", "asciifolding", "vi_edge_ngram"],
          },
        },
      },
    },
    mappings: {
      properties: {
        id: { type: "long" },

        title: {
          type: "text",
          analyzer: "vi_text",
          fields: {
            ac: {
              type: "text",
              analyzer: "vi_autocomplete",
              search_analyzer: "vi_text",
            },
            keyword: { type: "keyword", ignore_above: 256 },
          },
        },
        description: { type: "text", analyzer: "vi_text" },
        workLocation: {
          type: "text",
          analyzer: "vi_text",
          fields: {
            ac: {
              type: "text",
              analyzer: "vi_autocomplete",
              search_analyzer: "vi_text",
            },
          },
        },
        workMode: { type: "keyword" },

        minSalary: { type: "integer" },
        maxSalary: { type: "integer" },
        jobType: { type: "keyword" },
        experienceLevel: { type: "keyword" },
        moderationStatus: { type: "keyword" },
        deadline: { type: "date" },
        isFeatured: { type: "boolean" },
        createdAt: { type: "date" },
        updatedAt: { type: "date" },
        viewCount: { type: "integer" },

        companyId: { type: "long" },
        companyName: {
          type: "text",
          analyzer: "vi_text",
          fields: {
            ac: {
              type: "text",
              analyzer: "vi_autocomplete",
              search_analyzer: "vi_text",
            },
          },
        },
        companyStatus: { type: "boolean" },
        provinceId: { type: "long" },
        provinceName: { type: "text", analyzer: "vi_text" },
        districtId: { type: "long" },
        districtName: { type: "text", analyzer: "vi_text" },
        categoryId: { type: "long" },
        categoryName: {
          type: "text",
          analyzer: "vi_text",
          fields: {
            ac: {
              type: "text",
              analyzer: "vi_autocomplete",
              search_analyzer: "vi_text",
            },
          },
        },

        skillIds: { type: "long" },
        skillNames: {
          type: "text",
          analyzer: "vi_text",
          fields: {
            ac: {
              type: "text",
              analyzer: "vi_autocomplete",
              search_analyzer: "vi_text",
            },
            keyword: { type: "keyword", ignore_above: 128 },
          },
        },

        suggest: { type: "completion" },
      },
    },
  } as const as unknown as Indices_Create_RequestBody;
};

export const ensureJobsIndex = async () => {
  if (!isOpenSearchEnabled())
    return { ok: false as const, reason: "disabled" as const };
  const client = getOpenSearchClient();
  if (!client) return { ok: false as const, reason: "disabled" as const };

  const index = env.OPENSEARCH_JOBS_INDEX;
  const existsResp = await client.indices.exists({ index });
  const rawExists = existsResp as unknown;
  const isExists =
    rawExists === true ||
    (rawExists as { body?: unknown }).body === true ||
    (rawExists as { statusCode?: number }).statusCode === 200;
  if (isExists) return { ok: true as const, created: false as const };

  await client.indices.create({
    index,
    body: buildJobsIndexBody(),
  });

  return { ok: true as const, created: true as const };
};

export const recreateJobsIndex = async () => {
  if (!isOpenSearchEnabled())
    return { ok: false as const, reason: "disabled" as const };
  const client = getOpenSearchClient();
  if (!client) return { ok: false as const, reason: "disabled" as const };

  const index = env.OPENSEARCH_JOBS_INDEX;
  try {
    await client.indices.delete({ index });
  } catch (err: unknown) {
    const e = err as {
      statusCode?: number;
      meta?: { statusCode?: number; body?: { status?: number } };
    };
    const code = e.statusCode ?? e.meta?.statusCode ?? e.meta?.body?.status;
    if (code !== 404) throw err;
  }

  await client.indices.create({
    index,
    body: buildJobsIndexBody(),
  });

  return { ok: true as const };
};
