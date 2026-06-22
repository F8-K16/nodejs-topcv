import { prisma } from "./prisma";
import { parseSharedCvIdFromResumeFileUrl } from "./cv-resume-url";

export async function resolveResumePreviewForEmployer(
  fileUrl: string,
  candidateUserId: number,
): Promise<
  | { kind: "upload"; fileUrl: string }
  | {
      kind: "template";
      cv: NonNullable<Awaited<ReturnType<typeof prisma.cv.findFirst>>>;
    }
> {
  const cvId = parseSharedCvIdFromResumeFileUrl(fileUrl);
  if (cvId != null) {
    const cv = await prisma.cv.findFirst({
      where: {
        id: cvId,
        userId: candidateUserId,
        status: "COMPLETED",
      },
      include: { template: true },
    });
    if (cv) {
      return { kind: "template", cv };
    }
  }
  return { kind: "upload", fileUrl };
}
