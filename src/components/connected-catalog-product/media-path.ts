import { adminPath } from "@/lib/paths";
import { catalogAssetPath } from "@/lib/connected-catalog-contract";
import type { Region } from "@/lib/sections";

export const MAX_GALLERY_IMAGES = 96;

export const validCatalogImage = catalogAssetPath;

export function catalogMediaPath(src: string, region: Region) {
  return adminPath(`/api/connected-catalog?${new URLSearchParams({ asset: src, region })}`);
}
