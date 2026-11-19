import { MAX_GALLERY_IMAGES, validCatalogImage } from "./media-path";
import { catalogGalleryOrder, type CatalogGalleryImage } from "./product-presentation";

type Asset = { src: string; alt: string };
type VariantGallery = { id: string; images: readonly CatalogGalleryImage[] };
type GalleryInput = Asset & { isPrimary: boolean };

type Entry = {
  id: string;
  status: "saved" | "unchanged" | "failed" | "unconfirmed" | "skipped";
  message: string;
  gallery?: { revision: number; result: CatalogGalleryImage[] };
};

export async function applyVariantPrimaryImage(
  variants: readonly VariantGallery[], image: Asset, baseRevision: number,
  save: (id: string, revision: number, images: GalleryInput[]) => Promise<{ revision: number; result: CatalogGalleryImage[] }>,
) {
  const asset = { src: image.src.trim(), alt: image.alt.trim() };
  if (!validCatalogImage(asset.src) || !asset.alt || asset.alt.length > 180) {
    throw new Error("Use a catalog image path and add alternative text.");
  }

  let revision = baseRevision;
  let stopReason = "";
  const entries: Entry[] = [];
  for (const { id, images } of variants) {
    if (stopReason) {
      entries.push({ id, status: "skipped", message: stopReason });
      continue;
    }
    const ordered = catalogGalleryOrder(images);
    if (ordered[0]?.src === asset.src && ordered[0].alt === asset.alt) {
      entries.push({ id, status: "unchanged", message: "This image is already primary." });
      continue;
    }
    const otherImages = ordered.filter(item => item.src !== asset.src);
    if (otherImages.length >= MAX_GALLERY_IMAGES) {
      entries.push({ id, status: "failed", message: "The gallery is full. Remove an association before adding this image." });
      continue;
    }
    const gallery = [{ ...asset, isPrimary: true },
      ...otherImages.map(({ src, alt }) => ({ src, alt, isPrimary: false }))];
    try {
      const saved = await save(id, revision, gallery);
      revision = saved.revision;
      entries.push({ id, status: "saved", message: "Primary image saved.", gallery: saved });
    } catch (error) {
      const status = error instanceof Error && "status" in error ? error.status : undefined;
      if (typeof status !== "number" || status >= 500 || status < 400) {
        stopReason = "Skipped after an unconfirmed save. Reload before retrying.";
        entries.push({ id, status: "unconfirmed", message: "The response was interrupted. Reload to check whether this image saved." });
        continue;
      }
      const message = error instanceof Error ? error.message : "The image did not save.";
      entries.push({ id, status: "failed", message });
      if (status === 409) stopReason = "Skipped because the product changed. Reload and review the galleries before retrying.";
      if (status === 401 || status === 403 || status === 429) stopReason = "Skipped after access to the save request was limited.";
    }
  }
  return { revision, entries };
}
