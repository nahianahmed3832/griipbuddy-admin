import type { Region } from './sections';

export const categoryKinds = ['DEPARTMENT', 'CATEGORY', 'SUBCATEGORY'] as const;
export type CategoryKind = typeof categoryKinds[number];
export const parentKind = { DEPARTMENT: null, CATEGORY: 'DEPARTMENT', SUBCATEGORY: 'CATEGORY' } as const;
export const categoryLabel = { DEPARTMENT: 'Department', CATEGORY: 'Category', SUBCATEGORY: 'Subcategory' } as const;
export type Translation = { locale: string; name: string; shortName: string; description: string; slug: string | null };
export type Presentation = { visibleInNavigation: boolean | null; position: number | null; imageSrc: string | null; imageAlt: string | null };
export type CatalogCategory = {
  id: string; slug: string; name: string; shortName: string; description: string;
  parentId: string | null; kind: CategoryKind | null; state: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'; position: number; revision: number;
  imageSrc: string; imageAlt: string; bannerSrc: string | null; bannerAlt: string | null; seoTitle: string | null; seoDescription: string | null;
  translations: Translation[]; marketPresentations: Presentation[]; aliases: { locale: string; slug: string }[];
};
export type Attribute = { id: string; name: string; scope: 'PRODUCT' | 'VARIANT';
  dataType: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'ENUM'; allowedValues: string[]; variantOptionKey: string | null };
export type Template = { required: boolean; filterable: boolean; position: number; inheritable: boolean; excluded: boolean };
export type Attributes = {
  definitions: Attribute[]; local: (Template & { attributeId: string })[];
  effective: (Attribute & Omit<Template, 'excluded'> & { sourceDepartmentId: string })[];
  inheritedSources: { id: string; name: string }[];
};
export type CategoryAssignments = { total: number; page: number; pages: number;
  products: { id: string; name: string; revision: number; placement: 'direct' | 'descendant' | 'outside';
    primaryCategoryId: string; secondaryCategoryIds: string[] }[] };
type MenuTarget = { id: string; label: string; visible: boolean; href: string };
export type MenuPage = 'HOME' | 'SEARCH' | 'SHOP';
export type MenuItem = { label: string | null; visible: boolean } & (
  { type: 'category'; categoryId: string } | { type: 'collection'; collectionId: string } | { type: 'page'; page: MenuPage });
export type MerchandisingHistoryEntry = {
  createdAt: string; actor: string | null; summary: string; revision: number; scope: string;
};
export type Navigation = { marketId: string; marketName: string; key: string; locale: string; previewLocale: string;
  existingKeys: string[]; revision: number | null; inheritsMenu: boolean; items: MenuItem[];
  languages: string[]; categories: MenuTarget[]; collections: MenuTarget[];
  pages: (Omit<MenuTarget, 'id'> & { page: MenuPage })[]; history?: MerchandisingHistoryEntry[] };
export type CollectionKind = 'CURATED' | 'NEW' | 'FEATURED';
type CollectionChoice = { id: string; name: string; selection: CollectionKind; published: boolean };
export type Collections = { marketId: string; marketName: string; eligibleCount: number; collections: CollectionChoice[];
  current: (CollectionChoice & { slug: string; description: string; position: number; revision: number;
    imageSrc: string | null; imageAlt: string | null; hasOverride: boolean;
    products: { id: string; name: string; visibleInMarket: boolean }[]; history?: MerchandisingHistoryEntry[] }) | null };
export type CategoryData = { categories: CatalogCategory[]; owner: boolean; markets: string[]; businessCodes: { namespace: string; value: string }[];
  uploadEnabled?: boolean;
  navigation: Navigation | null; collections: Collections | null; attributes: Attributes | null; assignments: CategoryAssignments | null;
  history?: { id: string; createdAt: string; changes: Record<string, unknown> | null; actor: { name: string } | null }[];
  selectedId?: string | null; impact?: { primary: number; additional: number; descendantProducts: number;
    childCategories: number; activeDirect: number; activeChildren: number; menuLinks: number; canArchive: boolean } | null };
export type CategoryPermission = { create: boolean; update: boolean; archive: boolean; merchandise: boolean };

export function taxonomyHref(region: Region, params: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...(region === 'INTERNATIONAL' ? { region } : {}) })) {
    if (value) query.set(key, value);
  }
  return '/dashboard/categories' + (query.size ? '?' + query.toString() : '');
}
