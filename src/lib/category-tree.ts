export const placements = [
  ['SQUARE', 'Category thumbnail', '1:1'],
  ['HORIZONTAL', 'Wide banner', '16:9'],
  ['VERTICAL', 'Portrait banner', '9:16'],
] as const;
export type Placement = typeof placements[number][0];
export type CategoryMedia = { size: Placement; image?: string; video?: string };
export type CategoryNode = {
  id: string; depth: number; ancestors: (string | null)[]; slug: string; position: number;
  name_en?: string; name_bn?: string; description_en?: string; description_bn?: string;
  is_published: boolean; revision: string | null; media: CategoryMedia[];
};

export const categoryName = (node: CategoryNode) => node.name_en || node.name_bn || node.slug || 'Unnamed category';
export const categorySlug = (name: string) => name.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,160).replace(/-$/,'');

export function categoryKey(node: Pick<CategoryNode, 'id' | 'depth'>) {
  return node.depth + ':' + node.id;
}

export function parentKey(node: CategoryNode) {
  return node.depth === 0 ? '' : (node.depth - 1) + ':' + node.ancestors[node.depth - 1];
}

export function childrenFor(nodes: CategoryNode[]) {
  const index = new Map(nodes.map(node => [categoryKey(node), node]));
  const branches = new Map<string, CategoryNode[]>();
  for (const node of nodes) {
    const parent = index.get(parentKey(node));
    const key = !node.depth ? '' : parent &&
      parent.ancestors.every((id, depth) => id === node.ancestors[depth]) ? parentKey(node) : '?';
    const group = branches.get(key) ?? [];
    group.push(node);
    branches.set(key, group);
  }
  for (const group of branches.values()) group.sort((a,b) => a.position - b.position || a.id.localeCompare(b.id));
  return branches;
}

export function visibility(node: CategoryNode, index: Map<string, CategoryNode>) {
  if (node.ancestors.some((id, depth) => {
    const ancestor = index.get(depth + ':' + id);
    return !ancestor || ancestor.ancestors.some((parent, level) => parent !== node.ancestors[level]);
  })) return 'Needs review';
  if (!node.is_published) return 'Hidden';
  return node.ancestors.every((id, depth) => index.get(depth + ':' + id)?.is_published) ? 'Visible' : 'Hidden by parent';
}
