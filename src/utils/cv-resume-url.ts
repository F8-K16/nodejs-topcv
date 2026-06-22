export function parseSharedCvIdFromResumeFileUrl(
  fileUrl: string,
): number | null {
  const m = String(fileUrl).match(/\/resumes\/shared\/(\d+)\b/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}
