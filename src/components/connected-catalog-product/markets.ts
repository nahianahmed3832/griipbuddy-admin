export const markets = {
  bd: { id: "bd", countryCode: "BD", name: "Bangladesh", currency: "BDT", currencyName: "Bangladeshi Taka", locale: "en-BD", minorDigits: 2, wholePrices: true, pathPrefix: "/bd" },
  us: { id: "us", countryCode: "US", name: "United States", currency: "USD", currencyName: "US Dollar", locale: "en-US", minorDigits: 2, wholePrices: false, pathPrefix: "" },
} as const;

export type MarketId = keyof typeof markets;
export type Market = Omit<(typeof markets)[MarketId], "locale"> & { locale: string };
export type Currency = Market["currency"];

export const marketList: readonly Market[] = Object.values(markets);
export const marketIds = Object.keys(markets) as MarketId[];
export const defaultMarketId: MarketId = "bd";
export const marketCookie = "griipbuddy-market";
export const languageCookie = "griipbuddy-language";

export function isMarketId(value: unknown): value is MarketId {
  return typeof value === "string" && Object.hasOwn(markets, value);
}

export function getMarket(value: unknown): Market {
  return markets[isMarketId(value) ? value : defaultMarketId];
}

export function formatMoney(amountMinor: number, market: Market): string {
  const minimumFractionDigits = market.wholePrices && amountMinor % 10 ** market.minorDigits === 0 ? 0 : market.minorDigits;
  return new Intl.NumberFormat(market.locale, {
    style: "currency",
    currency: market.currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits,
    maximumFractionDigits: market.minorDigits,
  }).format(amountMinor / 10 ** market.minorDigits);
}
