import type { Region } from "@/lib/sections";
import type { MarketId } from "./markets";

export const approvedDevicePath = "/dashboard/catalog-devices";

export function catalogRegion(): Region {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("region") === "INTERNATIONAL"
    ? "INTERNATIONAL" : "BD";
}

export function regionFor(marketId?: MarketId): Region {
  return marketId === "us" ? "INTERNATIONAL" : "BD";
}

export function productPath(id: string, region: Region) {
  return `/dashboard/product-details/${encodeURIComponent(id)}?${new URLSearchParams({ region, catalog: "connected" })}`;
}
