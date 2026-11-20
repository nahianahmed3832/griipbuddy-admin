export const marketplaceWorkspacePath = '/desk/markets/marketplace';
export const sellerSearchLimit = 100;

export const connectedMarketplaceActions = [
  'marketplace.seller.publish', 'marketplace.seller.grant', 'marketplace.policy.save',
  'marketplace.policy.pause', 'marketplace.delivery.save',
] as const satisfies readonly MarketplaceWorkspaceCommand['action'][];

export type SellerGrantStatus = 'PENDING' | 'APPROVED' | 'DENIED';
export type MarketplaceSeller = {
  id: string;
  name: string;
  slug: string;
  published: boolean;
  grantStatus: SellerGrantStatus | null;
  listings: { id: string; name: string; publication: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' }[];
};

type CheckoutPolicyInput = {
  revision: number | null;
  enabled: boolean;
  codEnabled: boolean;
  taxBasisPoints: number | null;
  taxLabel: string;
};

type DeliveryInput = {
  revision: number | null;
  district: string;
  districtLabel: string;
  method: string;
  label: string;
  guidance: string;
  chargeMinor: number | null;
  enabled: boolean;
  codEligible: boolean;
};

export type MarketplaceDeliveryZone = Omit<DeliveryInput, 'revision' | 'guidance'> & {
  revision: number;
  guidance: string | null;
};

export type MarketplaceCheckoutPolicy = Omit<CheckoutPolicyInput, 'revision' | 'taxLabel'> & {
  revision: number;
  taxLabel: string | null;
  deliveryZones: MarketplaceDeliveryZone[];
};

export type MarketplaceWorkspaceData = {
  market: {
    id: 'bd' | 'us';
    name: string;
    currency: 'BDT' | 'USD';
    status: 'planned' | 'staging' | 'active' | 'paused';
    locale: string;
    timeZone: string;
    checkoutAuthority: 'native' | 'legacy-handoff';
    payments: { method: 'COD' | 'PAYPAL' | 'SSLCOMMERZ'; enabled: boolean }[];
    deliveryCoverage: 'checkout-policy' | 'provider-service';
    orderIntake: boolean;
  };
  thirdPartyEnabled: boolean;
  canConfigureCheckout: boolean;
  sellers: MarketplaceSeller[];
  page: number;
  pageCount: number;
  total: number;
  checkout: MarketplaceCheckoutPolicy | null;
};

export type MarketplaceWorkspaceCommand =
  | { action: 'marketplace.seller.publish'; input: { sellerId: string; published: boolean } }
  | { action: 'marketplace.seller.grant'; input: { sellerId: string; status: Exclude<SellerGrantStatus, 'PENDING'> } }
  | { action: 'marketplace.policy.save'; input: CheckoutPolicyInput }
  | { action: 'marketplace.policy.pause'; input: Record<string, never> }
  | { action: 'marketplace.delivery.save'; input: DeliveryInput };
