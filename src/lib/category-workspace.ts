import 'server-only';
import { api, ApiError, arr, canWrite, mongoId, obj, str, type Session } from './api';
import { has } from './sections';
import { type CategoryNode, type CategoryMedia } from './category-tree';

export function canChangeCategories(auth: Session, permission: 'product.create' | 'product.update') {
  return canWrite(auth.staff) && has(auth.staff, 'product.view') && has(auth.staff, permission);
}

export async function loadCategories(auth: Session): Promise<{ nodes: CategoryNode[]; managed: boolean }> {
  if (!has(auth.staff, 'product.view')) throw new ApiError(403);
  try {
    const rows = await api('/catalog/category-tree', auth.token);
    if (!Array.isArray(rows)) throw new ApiError(502);
    return { nodes: rows as CategoryNode[], managed: true };
  } catch (error) {
    if (!(error instanceof ApiError) || ![403,404].includes(error.status)) throw error;
  }
  const raw = obj(await api('/category', auth.token));
  const roots = arr(raw.data);
  const nodes: CategoryNode[] = [];
  function visit(value: unknown, ancestors: string[]) {
    const row = obj(value);
    const id = str(row._id);
    if (!mongoId(id)) return;
    const depth = ancestors.length;
    nodes.push({ id, depth, ancestors, revision: null, slug: str(row.slug),
      name_en: str(row.name_en) || str(row.name), name_bn: str(row.name_bn), description_en: str(row.description_en),
      description_bn: str(row.description_bn), is_published: row.is_published === true,
      position: typeof row.position === 'number' ? row.position : 0, media: arr(row.media) as CategoryMedia[] });
    if (depth < 3) arr(row[['subcategories','sub_subcategories','third_subcategories'][depth]])
      .forEach(child => visit(child, [...ancestors,id]));
  }
  roots.forEach(root => visit(root, []));
  return { nodes, managed: false };
}
