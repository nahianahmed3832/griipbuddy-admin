"use client";

import Link from "next/link";
import { catalogRegion, productPath, regionFor } from "./routes";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { MarketId } from "./markets";
import type { ProductCategoryChoice, ProductWorkspaceProduct } from "./contracts";
import { ProductAttributeFields } from "./connected-product-attribute-fields";
import { ConnectedProductFitment } from "./connected-product-fitment";
import { ConnectedProductVariants } from "./connected-product-variants";
import { draftProduct, withAttribute, type ProductDraft } from "./connected-product-draft";
import { runCatalogCommand, TaxonomyFeedback, useTaxonomyDirty, useTaxonomyOperation } from "./taxonomy-controls";

function GeneralFields({ draft, change }: { draft: ProductDraft; change: (next: ProductDraft) => void }) {
  return <section id="general" className="taxonomy-card">
    <h2>General</h2>
    <p className="taxonomy-muted">These details are shared by every market. Add customer-facing translations in the localization panel.</p>
    <div className="taxonomy-fields">
      <label>Product name<input required maxLength={120} minLength={2} value={draft.name}
        onChange={event => change({ ...draft, name: event.target.value })} /></label>
      <label>Brand<input maxLength={70} value={draft.brand}
        onChange={event => change({ ...draft, brand: event.target.value })} /></label>
      <div><label>Product slug<input required readOnly={draft.revision !== null} maxLength={draft.revision === null ? 80 : 120}
        aria-describedby="connected-product-slug-help" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={draft.slug} placeholder="e.g. slim-protective-case"
        onChange={event => change({ ...draft, slug: event.target.value })} /></label>
      <span id="connected-product-slug-help" className="taxonomy-muted">The URL is fixed after the product is created.</span></div>
      {draft.id && <div><strong>Product ID</strong><p className="taxonomy-muted">{draft.id}</p></div>}
    </div>
    <label>Short description<input maxLength={240} value={draft.shortDescription}
      onChange={event => change({ ...draft, shortDescription: event.target.value })} /></label>
    <label>Description<textarea rows={5} maxLength={4000} value={draft.description}
      onChange={event => change({ ...draft, description: event.target.value })} /></label>
    <div className="taxonomy-form">
      <h3>Rule-based collections</h3>
      <label className="taxonomy-check"><input type="checkbox" checked={draft.newArrival}
        onChange={event => change({ ...draft, newArrival: event.target.checked })} />Include in New arrivals collections</label>
      <label className="taxonomy-check"><input type="checkbox" checked={draft.featured}
        onChange={event => change({ ...draft, featured: event.target.checked })} />Include in Featured products collections</label>
      <p className="taxonomy-muted">These product flags are shared across markets. Shoppers see this product only where the collection and offer are published.</p>
    </div>
    <div className="taxonomy-form">
      <h3>Specifications</h3>
      <p className="taxonomy-muted">Use specifications for shared customer-facing details alongside structured attributes.</p>
      {draft.specifications.map(item => {
        const update = (edit: Partial<typeof item>) => change({ ...draft, specifications: draft.specifications.map(row =>
          row.key === item.key ? { ...row, ...edit } : row) });
        return <div className="taxonomy-fields" key={item.key}>
          <label>Specification name<input required maxLength={60} value={item.label} onChange={event => update({ label: event.target.value })} /></label>
          <label>Specification value<input required maxLength={240} value={item.value} onChange={event => update({ value: event.target.value })} /></label>
          <div><button type="button" className="taxonomy-button" onClick={() => change({ ...draft,
            specifications: draft.specifications.filter(row => row.key !== item.key),
          })}>Remove specification</button></div>
        </div>;
      })}
      <div className="taxonomy-actions"><button type="button" className="taxonomy-button" disabled={draft.specifications.length >= 30} onClick={() =>
        change({ ...draft, specifications: [...draft.specifications, { key: crypto.randomUUID(), label: "", value: "" }] })}>Add specification</button></div>
    </div>
  </section>;
}

function CategoryFields({ draft, categories, change, marketId }: { draft: ProductDraft; categories: readonly ProductCategoryChoice[]; marketId?: MarketId; change: (next: ProductDraft) => void }) {
  const [search, setSearch] = useState("");
  const primary = categories.find(row => row.id === draft.primaryCategoryId);
  const missingSecondaries = draft.secondaryCategoryIds.filter(id => !categories.some(row => row.id === id));
  const needle = search.trim().toLowerCase();
  const additional = categories.filter(row => row.id !== draft.primaryCategoryId &&
    (draft.secondaryCategoryIds.includes(row.id) || row.label.toLowerCase().includes(needle)));
  return <section id="categories" className="taxonomy-card">
    <h2>Categories and attributes</h2>
    <p className="taxonomy-muted">The primary category defines which fields apply. Additional categories are extra storefront placements.</p>
    <div className="taxonomy-fields">
      <label>Primary category<select required value={draft.primaryCategoryId} onChange={event => change({ ...draft,
        primaryCategoryId: event.target.value, secondaryCategoryIds: draft.secondaryCategoryIds.filter(id => id !== event.target.value),
      })}>
        <option value="">Choose a primary category</option>
        {!primary && draft.primaryCategoryId && <option value={draft.primaryCategoryId}>{draft.primaryCategoryId} (review placement)</option>}
        {categories.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
      </select></label>
      <div><Link href={`/dashboard/categories?region=${regionFor(marketId)}`} className="text-link">Open category workspace</Link></div>
    </div>
    {!categories.length && <p className="taxonomy-muted">Create a published subcategory in the category workspace to assign this product.</p>}
    <details>
      <summary>Additional categories · {draft.secondaryCategoryIds.length} selected</summary>
      <div className="taxonomy-form">
        <label>Find additional categories<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className="taxonomy-choice-list">
          {[...additional, ...missingSecondaries.map(id => ({ id, label: `${id} (review placement)` }))].map(row => {
            const checked = draft.secondaryCategoryIds.includes(row.id);
            return <label className="taxonomy-check" key={row.id}><input type="checkbox" checked={checked}
              disabled={!checked && draft.secondaryCategoryIds.length >= 50}
              onChange={event => change({ ...draft, secondaryCategoryIds: event.target.checked
                ? [...draft.secondaryCategoryIds, row.id] : draft.secondaryCategoryIds.filter(id => id !== row.id) })} />{row.label}</label>;
          })}
          {!additional.length && !missingSecondaries.length && <p className="taxonomy-muted">No matching additional categories.</p>}
        </div>
      </div>
    </details>
    <h3>Shared attributes</h3>
    {primary || Object.keys(draft.attributeValues).length > 0
      ? <ProductAttributeFields templates={primary?.templates.filter(row => row.scope === "PRODUCT") ?? []}
        value={draft.attributeValues} primaryCategoryId={draft.primaryCategoryId}
        onChange={(id, value) => change({ ...draft, attributeValues: withAttribute(draft.attributeValues, id, value) })} />
      : <p className="taxonomy-muted">Choose the primary category to load its typed attributes and inherited rules.</p>}
  </section>;
}

export function ConnectedProductAuthoring({ product, categories, marketId }: {
  product: ProductWorkspaceProduct | null;
  categories: readonly ProductCategoryChoice[];
  marketId?: MarketId;
}) {
  const serverDraft = useMemo(() => draftProduct(product), [product]);
  const [edit, setEdit] = useState<ProductDraft | null>(null);
  const [confirmed, setConfirmed] = useState<ProductDraft | null>(null);
  const markDirty = useTaxonomyDirty();
  const router = useRouter();
  const operation = useTaxonomyOperation();
  const latest = confirmed && (confirmed.revision ?? -1) > (serverDraft.revision ?? -1) ? confirmed : serverDraft;
  const draft = edit ?? latest;
  const templates = categories.find(row => row.id === draft.primaryCategoryId)?.templates ?? [];
  const archived = draft.publication === "ARCHIVED";

  function change(next: ProductDraft) {
    setEdit(next);
    markDirty(true);
  }

  async function save() {
    const id = draft.id || draft.slug;
    let revision = draft.revision;
    const ok = await operation.run(async () => {
      const result = await runCatalogCommand<{ id: string; revision: number }>("product.save", {
        id, expectedRevision: draft.revision, slug: draft.slug,
        name: draft.name, brand: draft.brand.trim() || null, description: draft.description, shortDescription: draft.shortDescription,
        primaryCategoryId: draft.primaryCategoryId, secondaryCategoryIds: draft.secondaryCategoryIds,
        specifications: draft.specifications.map(({ label, value }) => ({ label, value })),
        featured: draft.featured, newArrival: draft.newArrival,
        publication: draft.publication, attributeValues: draft.attributeValues,
        options: draft.options.map(option => ({
          ...option, values: option.values.map(value => ({ ...value, label: value.label.trim() || value.value })),
        })),
        variants: draft.variants,
        defaultVariantId: draft.defaultVariantId || null,
      });
      revision = result.revision;
    }, draft.revision === null ? "Draft created." : "Product saved.", { refresh: false });
    if (!ok) return;
    const saved: ProductDraft = { ...draft, id, revision, issuedVariantIds: draft.variants.map(row => row.id) };
    setConfirmed(saved);
    setEdit(null);
    markDirty(false);
    if (!product) router.replace(productPath(id, catalogRegion()));
    else router.refresh();
  }

  return <>
    <form className="taxonomy-form commerce-form" onSubmit={event => {
      event.preventDefault();
      void save();
    }}>
      <fieldset disabled={operation.pending || archived} className="taxonomy-form">
        <GeneralFields draft={draft} change={change} />
        <CategoryFields draft={draft} categories={categories} marketId={marketId} change={change} />
        <ConnectedProductVariants draft={draft} product={product} marketId={marketId} change={change}
          templates={templates.filter(row => row.scope === "VARIANT")} />
      </fieldset>
      <div className="taxonomy-card">
        <TaxonomyFeedback {...operation} />
        {archived ? <p className="taxonomy-muted">Archived products remain available for reference.</p>
          : <div className="taxonomy-actions">
            <button type="submit" className="taxonomy-button taxonomy-button--primary" disabled={operation.pending || !edit}>
              {operation.pending ? "Saving…" : draft.revision === null ? "Create draft" : "Save product"}
            </button>
            {edit && <button type="button" className="taxonomy-button" onClick={() => {
              if (!window.confirm("Discard unsaved product changes?")) return;
              setEdit(null);
              markDirty(false);
            }}>Discard changes</button>}
            {edit && <span className="taxonomy-muted">Unsaved product changes</span>}
          </div>}
      </div>
    </form>
    <ConnectedProductFitment product={product} region={regionFor(marketId)} />
  </>;
}
