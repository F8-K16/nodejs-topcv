export type CategoryLite = {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
};

export type CategoryTreeNode = CategoryLite & { children: CategoryTreeNode[] };

export function buildCategoryMaps(categories: CategoryLite[]): {
  parentById: Map<number, number | null>;
  childrenByParentId: Map<number | null, number[]>;
} {
  const parentById = new Map<number, number | null>();
  const childrenByParentId = new Map<number | null, number[]>();
  for (const c of categories) {
    parentById.set(c.id, c.parentId ?? null);
    const key = c.parentId ?? null;
    const arr = childrenByParentId.get(key) ?? [];
    arr.push(c.id);
    childrenByParentId.set(key, arr);
  }
  return { parentById, childrenByParentId };
}

export function getAncestorIds(
  parentById: Map<number, number | null>,
  id: number,
): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  let cur: number | null = id;
  while (cur != null) {
    if (seen.has(cur)) break;
    seen.add(cur);
    out.push(cur);
    cur = parentById.get(cur) ?? null;
  }
  return out;
}

export function getDescendantIds(
  childrenByParentId: Map<number | null, number[]>,
  id: number,
): number[] {
  const out: number[] = [];
  const stack: number[] = [id];
  const seen = new Set<number>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    const children = childrenByParentId.get(cur) ?? [];
    for (const child of children) stack.push(child);
  }
  return out;
}

export function isLeafCategory(
  childrenByParentId: Map<number | null, number[]>,
  id: number,
): boolean {
  const children = childrenByParentId.get(id) ?? [];
  return children.length === 0;
}

export function buildCategoryTree(categories: CategoryLite[]): CategoryTreeNode[] {
  const byId = new Map<number, CategoryTreeNode>();
  for (const c of categories) {
    byId.set(c.id, { ...c, parentId: c.parentId ?? null, children: [] });
  }
  const roots: CategoryTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId == null) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(node.parentId);
    if (!parent) {
      roots.push({ ...node, parentId: null });
      continue;
    }
    parent.children.push(node);
  }
  return roots;
}
