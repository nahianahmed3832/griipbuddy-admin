export const homepageAdminPath = '/dashboard/homepage';
export const homepageDeskPath = '/desk/content/homepage';

export const legacyHomepageViews = ['shop-by-category', 'best-selling', 'new-arrivals', 'leather-section'] as const;
export const legacyHomepageSections = new Set(['homepage.shop_by_category', 'homepage.best_selling',
  'homepage.new_arrivals', 'homepage.leather_section']);

export const homepageSectionLabels = {
  DEPARTMENTS: 'Shop by category', CURATED: 'Featured product selection', COLLECTIONS: 'Featured collections',
  CATEGORY_SPOTLIGHT: 'Category spotlight', NEW: 'New arrivals', DEALS: 'Genuine offers or budget picks',
  BANNER: 'Banner', COLLECTION: 'Collection products', BESTSELLERS: 'Market bestsellers', TRENDING: 'Market trending',
  RECENTLY_VIEWED: 'Recently viewed', RELATED: 'Similar products', FEATURED: 'Catalog featured products',
};

export type HomepageSectionType = keyof typeof homepageSectionLabels;
export type HomepageImage = { src: string; alt: string };
export type HomepageSection = {
  key: string; type: HomepageSectionType; title: string; description?: string; position: number; enabled?: boolean;
  productIds?: string[]; categoryIds?: string[]; categoryId?: string; collectionIds?: string[]; collection?: string;
  fallbackIds?: string[]; limit?: number; startsLocal?: string; endsLocal?: string; bannerImage?: HomepageImage;
  budget?: { currency: string; amountMinor: number }; link?: { label: string; href: string };
};

export type HomepageDraft = { sections: HomepageSection[]; hiddenSections: string[] };
export type HomepageReferenceKind = 'categories' | 'collections' | 'products' | 'media';
export type HomepageReference = { id: string; label: string; image?: HomepageImage; href?: string };
export type HomepageMarket = { marketId: string; label: string; locales: string[]; defaultLocale: string; timeZone: string; currency: string };
export type HomepageScope = { key: string; label: string; previews: HomepageMarket[] };
export type HomepageHistoryEntry = { id: string; publishedAt: string; restoredFrom?: string | null; actorName?: string | null };
export type HomepageEditorData = { revision: number; draft: HomepageDraft; hasDraft: boolean; publishedId: string | null;
  history: HomepageHistoryEntry[]; inheritedSections?: { key: string; title: string; type: HomepageSectionType; position: number; section: HomepageSection }[];
  references?: Partial<Record<HomepageReferenceKind, HomepageReference[]>> };

type PreviewEntry = { id: string; name: string; image?: HomepageImage | null };
export type HomepagePreviewData = {
  marketId: string; locale: string; currency: string; homepageConfig: string; sections: {
    id: string; type: HomepageSectionType; title: string; description?: string | null; position: number; enabled?: boolean;
    image?: HomepageImage | null; destination?: { label?: string; href: string } | string | null;
    startsLocal?: string | null; endsLocal?: string | null; categories?: PreviewEntry[]; collections?: PreviewEntry[];
    products?: (PreviewEntry & { amountMinor: number; regularMinor: number; promotionEndsAt: string | null })[];
  }[];
};
