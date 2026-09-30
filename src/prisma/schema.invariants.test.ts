import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const modelsDir = path.resolve(__dirname, "models");

function readModel(name: string) {
  return fs.readFileSync(path.join(modelsDir, name), "utf8");
}

describe("prisma schema invariants", () => {
  it("keeps composite primary keys on join tables", () => {
    expect(readModel("save_job.prisma")).toContain("@@id([candidateId, jobId])");
    expect(readModel("company_follow.prisma")).toContain(
      "@@id([candidateId, companyId])",
    );
    expect(readModel("candidate_recommendation.prisma")).toContain(
      "@@id([candidateId, skillId])",
    );
    expect(readModel("candidate_recommendation.prisma")).toContain(
      "@@id([candidateId, categoryId])",
    );
    expect(readModel("skill.prisma")).toContain("@@id([jobId, skillId])");
    expect(readModel("company_category.prisma")).toContain(
      "@@id([companyId, parentCategoryId])",
    );
  });

  it("keeps cascade and set-null delete behavior", () => {
    expect(readModel("save_job.prisma")).toContain("onDelete: Cascade");
    expect(readModel("company_follow.prisma")).toContain("onDelete: Cascade");
    expect(readModel("skill.prisma")).toContain("onDelete: Cascade");
    expect(readModel("job.prisma")).toContain("onDelete: SetNull");
    expect(readModel("application.prisma")).toContain("onDelete: SetNull");
    expect(readModel("notification.prisma")).toContain("onDelete: Cascade");
  });

  it("stores admin TOTP fields on users", () => {
    const user = readModel("user.prisma");
    expect(user).toContain("totpSecret");
    expect(user).toContain("totpEnabled");
  });
});
