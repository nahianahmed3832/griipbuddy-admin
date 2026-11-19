import { catalogLocaleChain } from "./category-locale";
import type { CatalogImage } from "./contracts";

export type CatalogGalleryImage = CatalogImage & { position: number; isPrimary?: boolean };

export function catalogGalleryOrder<T extends CatalogGalleryImage>(images: readonly T[]): T[] {
  return [...images].sort((left, right) =>
    Number(Boolean(right.isPrimary)) - Number(Boolean(left.isPrimary)) || left.position - right.position);
}

export function selectCatalogImage(
  productImages: readonly CatalogGalleryImage[],
  variantImages: readonly CatalogGalleryImage[] = [],
  canUse: (image: CatalogGalleryImage) => boolean = () => true,
): CatalogImage | undefined {
  const image = catalogGalleryOrder(variantImages).find(canUse) ?? catalogGalleryOrder(productImages).find(canUse);
  return image && { src: image.src, alt: image.alt };
}

type ProductContent = { name: string; description: string; shortDescription?: string | null };
type LocalizedProductContent = ProductContent & { locale: string };

export function selectProductContent(base: ProductContent, translations: readonly LocalizedProductContent[], locale: string) {
  const [exact, language] = catalogLocaleChain(locale).map(tag => translations.find(translation => translation.locale === tag));
  return {
    name: exact?.name ?? language?.name ?? base.name,
    description: exact?.description ?? language?.description ?? base.description,
    shortDescription: exact?.shortDescription ?? language?.shortDescription ?? base.shortDescription ?? undefined,
    locale: exact?.locale ?? language?.locale ?? null,
  };
}
