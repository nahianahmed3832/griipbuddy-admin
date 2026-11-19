import type { Market, MarketId } from "./markets";

export type PublicationState = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type CatalogImage = { src: string; alt: string };
type GalleryImage = CatalogImage & { position: number; isPrimary?: boolean };

export type ProductCategoryAttribute = {
  id: string; name: string; dataType: "NUMBER" | "BOOLEAN" | "ENUM" | "TEXT";
  scope: "PRODUCT" | "VARIANT"; required: boolean; filterable: boolean;
  sourceDepartmentId: string; sourceName: string; variantOptionKey?: string | null;
  allowedValues: string[];
};
export type ProductCategoryChoice = { id: string; label: string; templates: ProductCategoryAttribute[] };
export type ProductWorkspaceProduct = {
  id: string; slug: string; name: string; brand: string | null; description: string;
  shortDescription: string | null; departmentId: string; revision: number; publication: PublicationState;
  attributeValues: unknown; specifications: unknown; keywords: string[];
  featured: boolean; newArrival: boolean;
  secondaryCategories: { departmentId: string }[];
  translations: { locale: string; name: string; description: string; shortDescription: string | null }[];
  images: GalleryImage[];
  optionDefinitions: { id: string; key: string; label: string; values: { id: string; value: string; label: string }[] }[];
  variants: {
    id: string; sku: string; label: string; active: boolean; archivedAt: string | null; isDefault: boolean;
    attributeValues: unknown; optionSelections: { optionId: string; optionValueId: string }[];
    imageSrc: string | null; imageAlt: string | null; images: GalleryImage[];
    compatibility: { modelId: string }[];
    offers: { marketId: MarketId; amountMinor: number; publication: PublicationState; eligible: boolean }[];
  }[];
};

type Device = { id: string; brand: string; name: string; revision: number; aliases: { label: string }[] };
export type ApprovedDeviceSearch = { matches: Device[]; linked: Device[]; hasMore: boolean };

type Warehouse = {
  id: string; name: string; ownerId: string; ownerName: string; active: boolean; priority: number;
  inScope: boolean; canManage: boolean; servingMarkets: MarketId[];
  route: { active: boolean; priority: number; districts: string[]; methods: string[] } | null;
};
export type ProductWorkspaceCommerceData = {
  productId: string; publication: PublicationState; central: boolean;
  market: Market & { status: "planned" | "staging" | "active" | "paused" };
  sellers: { id: string; name: string }[];
  variants: { id: string; sku: string; label: string; active: boolean; managedInventory: boolean;
    legacyInventory: boolean; canEditOffer: boolean; sellerId: string | null;
    offer: { id: string | null; revision: number; currency: Market["currency"]; amountMinor: number;
      salePriceMinor: number | null; saleStartsAt: string | null; saleEndsAt: string | null;
      publication: PublicationState; eligible: boolean; sellerName: string | null } | null }[];
  warehouses: Warehouse[];
  pools: { id: string; variantId: string; ownerId: string; ownerName: string; warehouse: Warehouse;
    onHand: number; reserved: number; available: number; updatedAt: string; legacyOwnerMismatch: boolean }[];
  hasRestrictedPools: boolean;
  movements: { id: string; poolId: string; kind: string; quantity: number; createdAt: string }[];
  allocations: { id: string; poolId: string; quantity: number; dispatched: number; returned: number;
    marketId: MarketId; state: string; expiresAt: string; createdAt: string; reservationId?: string }[];
};

export type ProductWorkspace = {
  identity: { owner: boolean; product: { id: string; name: string; description: string; slug: string;
    foundation: boolean; publication: PublicationState; department: { name: string } } } | null;
  shared: ProductWorkspaceProduct | null; categories: ProductCategoryChoice[];
  readiness: { ready: boolean; issues: string[] } | null;
  history: { id: string; createdAt: string; label: string; actorName: string; market?: MarketId;
    locale?: string; publication?: string; fields?: string }[];
  commerce: ProductWorkspaceCommerceData | null; uploadEnabled: boolean;
};

export type ProductWorkspaceList = {
  owner: boolean; marketIds: MarketId[]; hasNext: boolean;
  rows: { id: string; name: string; category: string; variants: number; foundation: boolean;
    publication: PublicationState; markets: MarketId[]; incomplete: boolean }[];
};
