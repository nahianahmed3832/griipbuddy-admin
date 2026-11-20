"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { formatMoney, markets, type MarketId } from "./markets";
import { catalogMediaPath, validCatalogImage } from "./media-path";
import { regionFor } from "./routes";
import { maxProductOptions, variantOptionSignature } from "./option-signature";
import type { ProductCategoryAttribute, ProductWorkspaceProduct } from "./contracts";
import {
  maxDraftVariants, normalizeVariantDraft, proposalCombinations, variantTuple, withAttribute,
  type DraftOption, type DraftVariant, type ProductDraft,
} from "./connected-product-draft";
import { ProductAttributeFields } from "./connected-product-attribute-fields";
import { useTaxonomyDirty } from "./taxonomy-controls";

const button = "taxonomy-button";
const pageSize = 8;
const optionId = () => `option-${crypto.randomUUID()}`;
const valueId = () => `value-${crypto.randomUUID()}`;

function newVariant(sku: string, selections: Record<string, string>): DraftVariant {
  return { id: `v-${crypto.randomUUID()}`, sku, selections, active: true, attributeValues: {} };
}

function reorder<T>(values: T[], index: number, nextIndex: number): T[] {
  const next = [...values];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

function OptionEditor({ draft, product, templates, change }: {
  draft: ProductDraft;
  product: ProductWorkspaceProduct | null;
  templates: ProductCategoryAttribute[];
  change: (options: DraftOption[]) => void;
}) {
  const lockedDimensions = draft.variants.length > 0;
  const referenced = (value: string) => draft.variants.some(row => Object.values(row.selections).includes(value));
  const replace = (option: DraftOption) => change(draft.options.map(current => current.id === option.id ? option : current));
  return <div className="taxonomy-form">
    <div>
      <h3>Option dimensions</h3>
      <p className="taxonomy-muted">Use options such as Model, Design, Colour and Size for physical differences. Issued dimensions, combinations and SKUs stay stable.</p>
    </div>
    {draft.options.map((option, index) => {
      const saved = product?.optionDefinitions.find(row => row.id === option.id);
      const definition = templates.find(row => row.variantOptionKey === option.key && row.dataType === "ENUM");
      const label = option.label || `Option ${index + 1}`;
      return <fieldset className="taxonomy-card" key={option.id}>
        <legend>{label}</legend>
        <div className="taxonomy-fields">
          <label>Option label<input value={option.label} maxLength={80} onChange={event => replace({ ...option, label: event.target.value })} /></label>
          <label>Option key<input value={option.key} maxLength={40} readOnly={Boolean(saved)}
            placeholder="e.g. Model" onChange={event => replace({ ...option, key: event.target.value })} /></label>
        </div>
        {option.values.map((value, valueIndex) => {
          const fixed = Boolean(saved?.values.some(row => row.id === value.id));
          const edit = (fields: Partial<Pick<typeof value, "value" | "label">>) => replace({
            ...option, values: option.values.map(item => item.id === value.id ? { ...item, ...fields } : item),
          });
          return <div key={value.id} className="taxonomy-form">
            <div className="taxonomy-fields">
              <label>Canonical value{definition ? <select value={value.value} disabled={fixed}
                onChange={event => edit({ value: event.target.value, label: value.label || event.target.value })}>
                <option value="">Choose a value</option>
                {definition.allowedValues.map(item => <option key={item}>{item}</option>)}
              </select> : <input value={value.value} maxLength={70} readOnly={fixed}
                onChange={event => edit({ value: event.target.value })} />}</label>
              <label>Value label<input value={value.label} maxLength={70} placeholder={value.value}
                onChange={event => edit({ label: event.target.value })} /></label>
            </div>
            <div className="taxonomy-actions">
              <button type="button" className={button} disabled={valueIndex === 0}
                onClick={() => replace({ ...option, values: reorder(option.values, valueIndex, valueIndex - 1) })}>Move value up</button>
              <button type="button" className={button} disabled={valueIndex === option.values.length - 1}
                onClick={() => replace({ ...option, values: reorder(option.values, valueIndex, valueIndex + 1) })}>Move value down</button>
              <button type="button" className={button} disabled={referenced(value.id)}
                onClick={() => replace({ ...option, values: option.values.filter(row => row.id !== value.id) })}>Remove value</button>
            </div>
          </div>;
        })}
        <div className="taxonomy-actions">
          <button type="button" className={button} disabled={option.values.length >= 60}
            onClick={() => replace({ ...option, values: [...option.values, { id: valueId(), value: "", label: "" }] })}>Add option value</button>
          <button type="button" className={button} disabled={index === 0}
            onClick={() => change(reorder(draft.options, index, index - 1))}>Move option up</button>
          <button type="button" className={button} disabled={index === draft.options.length - 1}
            onClick={() => change(reorder(draft.options, index, index + 1))}>Move option down</button>
          <button type="button" className={button} disabled={lockedDimensions}
            onClick={() => change(draft.options.filter(row => row.id !== option.id))}>Remove option</button>
        </div>
      </fieldset>;
    })}
    <div className="taxonomy-actions">
      <button type="button" className={button} disabled={lockedDimensions || draft.options.length >= maxProductOptions}
        onClick={() => change([...draft.options, { id: optionId(), key: "", label: "", values: [{ id: valueId(), value: "", label: "" }] }])}>Add option</button>
      {lockedDimensions && <span className="taxonomy-muted">Adding values to existing dimensions keeps issued combinations intact.</span>}
    </div>
  </div>;
}

type SelectionDraft = { selected: boolean; sku: string };
const foldedSku = (sku: string) => sku.trim().toUpperCase();

function CombinationEditor({ draft, append }: { draft: ProductDraft; append: (rows: DraftVariant[]) => void }) {
  const [show, setShow] = useState(false);
  const [choices, setChoices] = useState<Record<string, SelectionDraft>>({});
  const [manual, setManual] = useState<Record<string, string>>({});
  const [sku, setSku] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const markDirty = useTaxonomyDirty();
  const hasProposal = Boolean(sku.trim() || Object.values(choices).some(row => row.selected || row.sku.trim()));
  useEffect(() => markDirty(hasProposal), [hasProposal, markDirty]);
  const axesReady = draft.options.every(option => option.key.trim() && option.label.trim() && option.values.length &&
    option.values.every(value => value.value.trim()));
  const preview = show && axesReady ? proposalCombinations(draft.options, draft.variants) : [];
  const room = maxDraftVariants - draft.variants.length;

  function add(proposals: { sku: string; selections: Record<string, string> }[]) {
    setMessage("");
    setError("");
    const used = new Set(draft.variants.map(row => foldedSku(row.sku)));
    const combinations = new Set(draft.variants.map(row => variantOptionSignature(row.selections)));
    const errors: string[] = [];
    for (const item of proposals) {
      const tuple = variantTuple(draft.options, item.selections);
      const value = foldedSku(item.sku);
      const signature = variantOptionSignature(item.selections);
      if (!/^[A-Z0-9][A-Z0-9._ &+\-]{0,59}$/.test(value)) errors.push(`${tuple} needs a valid SKU.`);
      else if (used.has(value)) errors.push(`${tuple} repeats SKU ${value}.`);
      else if (combinations.has(signature)) errors.push(`${tuple} already exists.`);
      used.add(value);
      combinations.add(signature);
    }
    if (!proposals.length) errors.push("Select at least one combination.");
    if (proposals.length > room) errors.push(`This product has room for ${room} more variants.`);
    if (errors.length) {
      setError(errors.join(" "));
      return false;
    }
    append(proposals.map(item => newVariant(foldedSku(item.sku), item.selections)));
    setMessage(`${proposals.length} ${proposals.length === 1 ? "variant staged" : "variants staged"}. Save the product to apply the changes.`);
    return true;
  }

  if (!room || !draft.options.length && draft.variants.length) return null;
  return <div className="taxonomy-card">
    <h3>{draft.options.length ? "Add physical variants" : "Add the default variant"}</h3>
    {!axesReady && <p className="taxonomy-muted">Enter each option key, label and canonical value before proposing combinations.</p>}
    {draft.options.length > 0 && <div className="taxonomy-actions">
      <button type="button" className={button} disabled={!axesReady} aria-expanded={show}
        onClick={() => { setShow(!show); setError(""); setMessage(""); }}>{show ? "Close combination preview" : "Preview combinations"}</button>
      <span className="taxonomy-muted">Only selected combinations become variant rows.</span>
    </div>}
    {show && preview === null && <p className="taxonomy-muted">The options produce more than 100 possible combinations. Add physical variants one at a time.</p>}
    {show && axesReady && preview && !preview.length && <p className="taxonomy-muted">Every configured combination already has a variant.</p>}
    {show && preview && preview.length > 0 && <div className="taxonomy-form">
      {preview.map(selection => {
        const signature = variantOptionSignature(selection);
        const tuple = variantTuple(draft.options, selection);
        const entry = choices[signature] ?? { selected: false, sku: "" };
        return <div className="taxonomy-fields" key={signature}>
          <label className="taxonomy-check"><input type="checkbox" checked={entry.selected} aria-label={`Include ${tuple}`}
            onChange={event => setChoices(previous => ({ ...previous, [signature]: { ...entry, selected: event.target.checked } }))} />{tuple}</label>
          <label>SKU for {tuple}<input disabled={!entry.selected} value={entry.sku} maxLength={60}
            onChange={event => setChoices(previous => ({ ...previous, [signature]: { ...entry, sku: event.target.value } }))} /></label>
        </div>;
      })}
      <div className="taxonomy-actions"><button type="button" className={button} onClick={() => {
        const requested = preview.flatMap(selections => {
          const row = choices[variantOptionSignature(selections)];
          return row?.selected ? [{ selections, sku: row.sku }] : [];
        });
        if (add(requested)) setChoices({});
      }}>Add selected combinations</button></div>
    </div>}
    <div className="taxonomy-form">
      {draft.options.length > 0 && <h4>One combination</h4>}
      <div className="taxonomy-fields">
        {draft.options.map(option => <label key={option.id}>{option.label || option.key || "Option"}
          <select value={manual[option.id] ?? ""} onChange={event => setManual({ ...manual, [option.id]: event.target.value })}>
            <option value="">Choose a value</option>
            {option.values.filter(row => row.value.trim()).map(row => <option key={row.id} value={row.id}>{row.label || row.value}</option>)}
          </select>
        </label>)}
        <label>Variant SKU<input value={sku} maxLength={60} onChange={event => setSku(event.target.value)} /></label>
      </div>
      <div className="taxonomy-actions"><button type="button" className={button}
        disabled={!axesReady || !draft.options.every(option => option.values.some(value => value.id === manual[option.id]))}
        onClick={() => {
          if (add([{ sku, selections: Object.fromEntries(draft.options.map(option => [option.id, manual[option.id]])) }])) setSku("");
        }}>{draft.options.length ? "Add variant" : "Add default variant"}</button></div>
    </div>
    {error && <p className="taxonomy-error" role="alert">{error}</p>}
    {message && <p className="taxonomy-success" role="status">{message}</p>}
  </div>;
}

function thumbnail(images: readonly { src: string; alt: string; isPrimary?: boolean }[] | undefined) {
  return images?.find(row => row.isPrimary) ?? images?.[0];
}

export function ConnectedProductVariants({ draft, product, marketId, templates, change, allowNewVariants }: {
  draft: ProductDraft;
  product: ProductWorkspaceProduct | null;
  marketId?: MarketId;
  templates: ProductCategoryAttribute[];
  change: (next: ProductDraft) => void;
  allowNewVariants: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [checked, setChecked] = useState<string[]>([]);
  const [bulk, setBulk] = useState<{ staged: string[]; failures: string[] } | null>(null);
  const [selectedAttributeVariant, setSelectedAttributeVariant] = useState("");
  const needle = query.trim().toLowerCase();
  const filtered = draft.variants.filter(row => (!needle || `${row.sku} ${row.id} ${variantTuple(draft.options, row.selections)}`.toLowerCase().includes(needle))
    && (status === "all" || row.active === (status === "active")));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectable = draft.variants.filter(row => checked.includes(row.id));
  const issued = new Set(draft.issuedVariantIds);
  const activeForAttributes = draft.variants.filter(row => row.active &&
    (templates.length > 0 || Object.keys(row.attributeValues).length > 0));
  const attributeRow = activeForAttributes.find(row => row.id === selectedAttributeVariant) ?? activeForAttributes[0];

  function updateRows(variants: DraftVariant[]) {
    change(normalizeVariantDraft(draft, variants));
  }

  function stageArchive() {
    const staged = selectable.filter(row => row.active && issued.has(row.id));
    const failures = selectable.filter(row => !row.active || !issued.has(row.id)).map(row =>
      `${row.sku}: ${row.active ? "remove the unsaved row instead" : "already staged or archived"}`);
    if (draft.publication === "ACTIVE" && staged.length === draft.variants.filter(row => row.active).length) {
      setBulk({ staged: [], failures: [...failures, ...staged.map(row => `${row.sku}: a published product needs at least one active variant`)] });
      return;
    }
    const ids = new Set(staged.map(row => row.id));
    if (ids.size) updateRows(draft.variants.map(row => ids.has(row.id) ? { ...row, active: false } : row));
    setBulk({ staged: staged.map(row => row.sku), failures });
    setChecked([]);
  }

  return <section id="variants" className="taxonomy-card">
    <h2>Options and variants</h2>
    <OptionEditor draft={draft} product={product} templates={templates} change={options => change({ ...draft, options })} />
    {allowNewVariants && <CombinationEditor key={JSON.stringify(draft.options.map(option => [option.id, option.values.map(value => value.id)]))}
      draft={draft} append={rows => updateRows([...draft.variants, ...rows])} />}
    <h3>Variant rows</h3>
    <p className="taxonomy-muted">{draft.variants.filter(row => row.active).length} active · {draft.variants.length} total · Up to {maxDraftVariants} variants</p>
    <div className="taxonomy-fields">
      <label>Find variants<input type="search" value={query} placeholder="SKU, ID or option" onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
      <label>Variant status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
        <option value="all">All statuses</option><option value="active">Active</option><option value="archived">Archived or staged</option>
      </select></label>
    </div>
    {draft.variants.length > 0 && <label>Default variant
      <select value={draft.defaultVariantId} onChange={event => change({ ...draft, defaultVariantId: event.target.value })}>
        <option value="">Choose an active variant</option>
        {draft.variants.filter(row => row.active).map(row =>
          <option key={row.id} value={row.id}>{variantTuple(draft.options, row.selections)} · {row.sku}</option>)}
      </select>
    </label>}
    {visible.length ? <>
      <div className="taxonomy-actions">
        <button type="button" className={button} onClick={() => setChecked(previous => [...new Set([...previous, ...visible.map(row => row.id)])])}>Select this page</button>
        <button type="button" className={button} disabled={!checked.length} onClick={() => setChecked([])}>Clear selection</button>
        <button type="button" className={button} disabled={!selectable.length} onClick={stageArchive}>Stage archive for selected</button>
        <span className="taxonomy-muted" role="status">{selectable.length} selected. Product save applies staged changes together.</span>
      </div>
      {bulk && <div className="taxonomy-impact" role="status">
        {bulk.staged.length > 0 && <p>Staged for archive · {bulk.staged.join(", ")}</p>}
        {!!bulk.failures.length && <ul>{bulk.failures.map(detail => <li key={detail}>{detail}</li>)}</ul>}
      </div>}
      <div className="taxonomy-scroll"><table className="taxonomy-table">
        <thead><tr><th scope="col">Select</th><th scope="col">Variant</th><th scope="col">SKU</th>
          <th scope="col">Image</th><th scope="col">Status</th><th scope="col">{marketId ? `${markets[marketId].name} offer` : "Market offer"}</th><th scope="col">Action</th></tr></thead>
        <tbody>{visible.map(row => {
          const stored = product?.variants.find(current => current.id === row.id);
          const offer = stored?.offers.find(current => current.marketId === marketId);
          const ownImage = thumbnail(stored?.images) ?? (stored?.imageSrc && stored.imageAlt ? { src: stored.imageSrc, alt: stored.imageAlt } : null);
          const image = ownImage ?? thumbnail(product?.images);
          const tuple = variantTuple(draft.options, row.selections);
          const label = !row.active ? stored?.archivedAt ? "Archived" : stored?.active === false ? "Inactive" : "Archive staged"
            : issued.has(row.id) ? "Active" : "New";
          return <tr key={row.id}>
            <td><input type="checkbox" aria-label={`Select variant ${row.sku}`} checked={checked.includes(row.id)} onChange={event =>
              setChecked(event.target.checked ? [...checked, row.id] : checked.filter(id => id !== row.id))} /></td>
            <th scope="row">{tuple}<div className="taxonomy-muted">{row.id}{row.id === draft.defaultVariantId ? " · Default" : ""}</div></th>
            <td>{issued.has(row.id) ? row.sku : <input aria-label={`Edit SKU for ${tuple}`} value={row.sku} maxLength={60}
              onChange={event => updateRows(draft.variants.map(item => item.id === row.id ? { ...item, sku: event.target.value } : item))} />}</td>
            <td>{image && validCatalogImage(image.src) ? <Image width={46} height={46} alt={image.alt} src={catalogMediaPath(image.src, regionFor(marketId))} unoptimized
              style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 6 }} /> : <span className="taxonomy-muted">None</span>}
            {image && !ownImage && <span className="taxonomy-muted">Shared</span>}</td>
            <td><span className="taxonomy-badge">{label}</span></td>
            <td>{offer && marketId ? <>{formatMoney(offer.amountMinor, markets[marketId])}<div className="taxonomy-muted">
              {offer.publication === "ACTIVE" ? draft.publication !== "ACTIVE" ? "Active offer · product unpublished"
                : offer.eligible ? "Published" : "Browse only" : offer.publication === "ARCHIVED" ? "Archived" : "Draft"}
            </div></> : <span className="taxonomy-muted">{marketId ? "No offer" : "Select a market"}</span>}</td>
            <td>{!issued.has(row.id) ? <button type="button" className={button} onClick={() => updateRows(draft.variants.filter(item => item.id !== row.id))}>Remove draft</button>
              : !row.active && stored?.active && <button type="button" className={button}
                onClick={() => updateRows(draft.variants.map(item => item.id === row.id ? { ...item, active: true } : item))}>Undo staged archive</button>}</td>
          </tr>;
        })}</tbody>
      </table></div>
      <div className="taxonomy-actions">
        <button type="button" className={button} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous variants</button>
        <span className="taxonomy-muted">Page {currentPage} of {pageCount} · {filtered.length} results</span>
        <button type="button" className={button} disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next variants</button>
      </div>
    </> : <p className="taxonomy-muted">{draft.variants.length ? "No variants match this search." : "Add the physical variants you sell to start editing this table."}</p>}
    {attributeRow && <div className="taxonomy-card">
      <h3>Variant attributes</h3>
      <label>Variant for attributes<select value={attributeRow.id} onChange={event => setSelectedAttributeVariant(event.target.value)}>
        {activeForAttributes.map(row => <option key={row.id} value={row.id}>{row.sku} · {variantTuple(draft.options, row.selections)}</option>)}
      </select></label>
      <ProductAttributeFields templates={templates} value={attributeRow.attributeValues} primaryCategoryId={draft.primaryCategoryId}
        optionValues={Object.fromEntries(draft.options.flatMap(option => {
          const selected = option.values.find(value => value.id === attributeRow.selections[option.id]);
          return selected ? [[option.key, selected.value]] : [];
        }))}
        onChange={(id, value) => updateRows(draft.variants.map(row => row.id === attributeRow.id
          ? { ...row, attributeValues: withAttribute(row.attributeValues, id, value) } : row))} />
    </div>}
  </section>;
}
