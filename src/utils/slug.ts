export function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
  return slug || "cong-ty";
}

export function uniqueSlug(baseName: string, used: Set<string>) {
  const base = slugify(baseName);
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    const suffix = `-${n}`;
    candidate = `${base.slice(0, 180 - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}
