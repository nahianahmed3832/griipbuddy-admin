"use client";

import Image from "next/image";
import { useId, useState } from "react";
import { catalogUploadLimit } from "@/lib/connected-catalog-contract";
import type { Region } from "@/lib/sections";
import { applyVariantPrimaryImage } from "./product-gallery-bulk";
import { catalogGalleryOrder, selectCatalogImage, type CatalogGalleryImage } from "./product-presentation";
import { catalogMediaPath, MAX_GALLERY_IMAGES, validCatalogImage } from "./media-path";
import type { ProductWorkspaceProduct } from "./contracts";
import { runCatalogCommand, TaxonomyFeedback, useTaxonomyDirty, useTaxonomyOperation } from "./taxonomy-controls";

type GallerySave = { revision: number; result: CatalogGalleryImage[] };
type NewImage = { src: string; alt: string };
type DraftImage = NewImage & { key: string };
type GalleryDraft = { revision: number; rows: DraftImage[] };
type BulkDraft = NewImage & { revision: number; ids: string[] };
type BulkResult = Awaited<ReturnType<typeof applyVariantPrimaryImage>>;
type Feedback = { error?: string; message?: string };

const shared = "";
const emptyBulk: Omit<BulkDraft, "revision"> = { src: "", alt: "", ids: [] };

function previewable({ src }: { src: string }) {
  return validCatalogImage(src.trim());
}

function Thumbnail({ image, region, size = 80 }: { image?: NewImage; region: Region; size?: number }) {
  const [failed, setFailed] = useState<string>();
  const src = image?.src.trim();
  if (!src || !previewable({ src })) return null;
  if (failed === src) return <p className="taxonomy-muted">Thumbnail unavailable.</p>;
  return <Image src={catalogMediaPath(src, region)} alt={image?.alt ?? ""} width={size} height={size} unoptimized
    style={{ width: size, maxWidth: "100%", height: size, objectFit: "contain" }} onError={() => setFailed(src)} />;
}

function savedGallery(product: ProductWorkspaceProduct, scope: string) {
  if (scope === shared) return product.images;
  const variant = product.variants.find(row => row.id === scope);
  if (!variant) return [];
  if (variant.images.length) return variant.images;
  return variant.imageSrc && variant.imageAlt
    ? [{ src: variant.imageSrc, alt: variant.imageAlt, position: 0, isPrimary: true }]
    : [];
}

async function uploadAsset(file: File) {
  if (file.size > catalogUploadLimit) throw new Error("Choose an image up to 4 MB.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
  const payload = await runCatalogCommand<{ src: string }>("media.upload", { data, mime: file.type });
  return payload.src;
}

export function ConnectedProductMedia({ product, region, uploadEnabled = false }: { product: ProductWorkspaceProduct; region: Region; uploadEnabled?: boolean }) {
  const [scope, setScope] = useState(shared);
  const [confirmed, setConfirmed] = useState<Record<string, GallerySave>>({});
  const [draft, setDraft] = useState<GalleryDraft | null>(null);
  const [bulk, setBulk] = useState<BulkDraft | null>(null);
  const [results, setResults] = useState<BulkResult>();
  const [upload, setUpload] = useState<{ key: string; pending?: boolean } & Feedback>();
  const markGallery = useTaxonomyDirty();
  const markBulk = useTaxonomyDirty();
  const operation = useTaxonomyOperation();
  const bulkOperation = useTaxonomyOperation();
  const heading = useId();
  const assetsList = useId();

  const variant = product.variants.find(row => row.id === scope);
  const editableVariants = product.variants.filter(row => !row.archivedAt);
  const archived = product.publication === "ARCHIVED";
  const readOnly = archived || Boolean(variant?.archivedAt);
  const revision = Math.max(product.revision, ...Object.values(confirmed).map(row => row.revision));
  const galleryAt = (id: string): readonly CatalogGalleryImage[] => confirmed[id]?.revision > product.revision
    ? confirmed[id].result : savedGallery(product, id);
  const rows = draft?.rows ?? catalogGalleryOrder(galleryAt(scope)).map(({ src, alt }) => ({ key: src, src, alt }));
  const previewRows = rows.map(({ src, alt }, position) => ({ src, alt, position, isPrimary: position === 0 }));
  const scopedPreview = selectCatalogImage(previewRows, [], previewable);
  const preview = scopedPreview ?? (variant ? selectCatalogImage(galleryAt(shared), [], previewable) : undefined);
  const assets = new Map([shared, ...product.variants.map(row => row.id)].flatMap(id => galleryAt(id).map(row => [row.src, row.alt] as const)));
  const selectedBulk = bulk ?? emptyBulk;
  const saving = operation.pending || bulkOperation.pending;

  function edit(nextRows: DraftImage[]) {
    setDraft({ revision: draft?.revision ?? revision, rows: nextRows });
    markGallery(true);
  }

  function discard() {
    setDraft(null);
    setUpload(undefined);
    markGallery(false);
  }

  function switchScope(value: string) {
    if (draft && !window.confirm("Discard unsaved changes to this gallery?")) return;
    discard();
    setScope(value);
  }

  function updateImage(key: string, patch: Partial<NewImage>) {
    edit(rows.map(row => row.key === key ? { ...row, ...patch } : row));
  }

  function reorder(index: number, nextIndex: number) {
    const next = [...rows];
    const [row] = next.splice(index, 1);
    next.splice(nextIndex, 0, row);
    edit(next);
  }

  async function sendUpload(key: string, file?: File) {
    if (!file || !uploadEnabled) return;
    setUpload({ key, pending: true });
    try {
      const src = await uploadAsset(file);
      updateImage(key, { src });
      setUpload({ key, message: "Image stored. Save the gallery to use it." });
    } catch (error) {
      setUpload({ key, error: error instanceof Error ? error.message : "The image did not upload." });
    }
  }

  function saveGallery(id: string, expected: number, images: Array<NewImage & { isPrimary: boolean }>) {
    return runCatalogCommand<GallerySave>("product.gallery", {
      productId: product.id, revision: expected, ...(id !== shared && { variantId: id }), images,
    });
  }

  async function submitGallery() {
    if (!draft || readOnly) return;
    const ok = await operation.run(async () => {
      const saved = await saveGallery(scope, draft.revision, draft.rows.map(({ src, alt }, index) => ({
        src: src.trim(), alt, isPrimary: index === 0,
      })));
      setConfirmed(previous => ({ ...previous, [scope]: saved }));
    }, variant ? "Variant gallery saved." : "Shared gallery saved.");
    if (ok) discard();
  }

  function updateBulk(patch: Partial<Omit<BulkDraft, "revision">>) {
    setBulk({ ...selectedBulk, ...patch, revision: bulk?.revision ?? revision });
    markBulk(true);
  }

  async function submitBulk() {
    if (!bulk || !bulk.ids.length || draft || archived) return;
    const selected = bulk.ids.map(id => ({ id, images: galleryAt(id) }));
    setResults(undefined);
    await bulkOperation.run(async () => {
      const result = await applyVariantPrimaryImage(selected, { src: bulk.src.trim(), alt: bulk.alt }, bulk.revision, saveGallery);
      const committed = result.entries.flatMap(item => item.gallery ? [[item.id, item.gallery] as const] : []);
      setConfirmed(previous => ({ ...previous, ...Object.fromEntries(committed) }));
      setResults(result);
      const unresolved = result.entries.filter(item => item.status !== "saved" && item.status !== "unchanged").map(item => item.id);
      setBulk(unresolved.length ? { ...bulk, revision: result.revision, ids: unresolved } : null);
      markBulk(Boolean(unresolved.length));
    }, "");
  }

  return <section id="media" className="taxonomy-card" aria-labelledby={heading}>
    <h2 id={heading}>Media</h2>
    <div className="taxonomy-form commerce-form">
      <label>Gallery
        <select value={scope} onChange={event => switchScope(event.currentTarget.value)} disabled={saving || upload?.pending}>
          <option value={shared}>Shared product gallery</option>
          {product.variants.map(item => <option key={item.id} value={item.id}>{item.sku} · {item.label}{item.archivedAt ? " · Archived" : ""}</option>)}
        </select>
      </label>
    </div>
    <div className="taxonomy-impact">
      <h3>{variant ? scopedPreview ? "Variant image preview" : "Shared image fallback" : "Shared image preview"}</h3>
      {preview ? <Thumbnail region={region} image={preview} size={144} /> : <p className="taxonomy-muted">No image is available for this preview.</p>}
    </div>
    {!!assets.size && <datalist id={assetsList}>{[...assets].map(([src, alt]) => <option key={src} value={src}>{alt}</option>)}</datalist>}
    {readOnly && <p className="taxonomy-muted">Archived galleries are read-only.</p>}
    {!readOnly && !uploadEnabled && <p className="taxonomy-muted">You can reuse existing assets. New uploads require verified isolated media storage.</p>}
    <form className="taxonomy-form commerce-form" onSubmit={event => { event.preventDefault(); void submitGallery(); }}>
      {rows.map((row, index) => <fieldset className="taxonomy-impact" key={row.key} disabled={readOnly || saving || upload?.pending}>
        <legend>{index === 0 ? "Primary image" : "Image " + (index + 1)}</legend>
        <Thumbnail region={region} image={row} />
        <div className="taxonomy-fields">
          <label>Image path {index + 1}<input value={row.src} required maxLength={100} list={assetsList}
            placeholder="/media/…" onChange={event => updateImage(row.key, { src: event.target.value })} /></label>
          <label>Alternative text {index + 1}<input value={row.alt} required maxLength={180}
            onChange={event => updateImage(row.key, { alt: event.target.value })} /></label>
        </div>
        {!readOnly && <>
          {uploadEnabled && <label>Upload image {index + 1}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            void sendUpload(row.key, file);
          }} /></label>}
          {upload?.key === row.key && <>
            {upload.pending && <p role="status">Uploading image…</p>}
            <TaxonomyFeedback {...upload} />
          </>}
          <div className="taxonomy-actions">
            {index > 0 && <button type="button" className="button button--outline" onClick={() => reorder(index, 0)}>Make primary</button>}
            {index > 1 && <button type="button" className="button button--outline" onClick={() => reorder(index, index - 1)}>Move up</button>}
            {index > 0 && index < rows.length - 1 && <button type="button" className="button button--outline" onClick={() => reorder(index, index + 1)}>Move down</button>}
            <button type="button" className="button button--outline" onClick={() => edit(rows.filter(item => item.key !== row.key))}>Remove association</button>
          </div>
        </>}
      </fieldset>)}
      {!rows.length && <p className="taxonomy-muted">This gallery has no image associations.</p>}
      {!readOnly && <div className="taxonomy-actions">
        <button type="button" className="button button--outline" disabled={saving || upload?.pending || rows.length >= MAX_GALLERY_IMAGES}
          onClick={() => edit([...rows, { key: crypto.randomUUID(), src: "", alt: "" }])}>Add image</button>
        {draft && <button type="button" className="button button--outline" disabled={saving || upload?.pending} onClick={discard}>Discard changes</button>}
        <button className="button button--primary" type="submit" disabled={!draft || saving || upload?.pending}>
          {operation.pending ? "Saving gallery…" : "Save gallery"}
        </button>
      </div>}
      <TaxonomyFeedback {...operation} />
    </form>
    {!archived && editableVariants.length > 1 && <div className="taxonomy-impact">
      <h3>Set primary image for selected variants</h3>
      <p className="taxonomy-muted">Use one existing asset across selected variants. Each gallery keeps its other images. Results are reported per variant.</p>
      <form className="taxonomy-form commerce-form" onSubmit={event => { event.preventDefault(); void submitBulk(); }}>
        <fieldset className="taxonomy-choice-list" disabled={saving || upload?.pending}>
          <legend>Variant galleries</legend>
          {editableVariants.map(item => <label className="taxonomy-check" key={item.id}>
            <input type="checkbox" checked={selectedBulk.ids.includes(item.id)} onChange={event => updateBulk({ ids: event.target.checked
              ? [...selectedBulk.ids, item.id] : selectedBulk.ids.filter(id => id !== item.id) })} />{item.sku} · {item.label}
          </label>)}
        </fieldset>
        <div className="taxonomy-fields">
          <label>Existing asset path<input value={selectedBulk.src} maxLength={100} required list={assetsList} disabled={saving}
            onChange={event => updateBulk({ src: event.target.value })} /></label>
          <label>Asset alternative text<input value={selectedBulk.alt} maxLength={180} required disabled={saving}
            onChange={event => updateBulk({ alt: event.target.value })} /></label>
        </div>
        {draft && <p className="taxonomy-muted">Save or discard the individual gallery to continue.</p>}
        <div className="taxonomy-actions">
          <button type="submit" className="button button--primary" disabled={!selectedBulk.ids.length || Boolean(draft) || saving || upload?.pending}>
            {bulkOperation.pending ? "Saving selected variants…" : "Apply to " + selectedBulk.ids.length + " selected"}
          </button>
          {bulk && <button type="button" className="button button--outline" disabled={saving} onClick={() => { setBulk(null); markBulk(false); }}>Reset bulk selection</button>}
        </div>
        <TaxonomyFeedback {...bulkOperation} />
        {results && <div role="status" className="taxonomy-impact">
          <p>{results.entries.filter(row => row.status === "saved").length} saved · {results.entries.filter(row => row.status === "unchanged").length} unchanged · {results.entries.filter(row => row.status !== "saved" && row.status !== "unchanged").length} to review</p>
          <ul>{results.entries.map(item => <li key={item.id}>{product.variants.find(row => row.id === item.id)?.sku ?? item.id} · {item.message}</li>)}</ul>
        </div>}
      </form>
    </div>}
  </section>;
}
