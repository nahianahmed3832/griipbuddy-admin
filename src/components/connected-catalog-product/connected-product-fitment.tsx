"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ApprovedDeviceSearch } from "./contracts";
import type { ProductWorkspaceProduct } from "./contracts";
import { catalogRequest } from "@/lib/connected-catalog-client";
import { approvedDevicePath, catalogRegion } from "./routes";
import type { Region } from "@/lib/sections";
import { runCatalogCommand, TaxonomyFeedback, useTaxonomyDirty, useTaxonomyOperation } from "./taxonomy-controls";

type DeviceRow = ApprovedDeviceSearch["matches"][number];

function FitmentEditor({ product, variant, onEdit }: {
  product: ProductWorkspaceProduct;
  variant: ProductWorkspaceProduct["variants"][number];
  onEdit: (changed: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [fetchFor, setFetchFor] = useState({ q: "", count: 0 });
  const [results, setResults] = useState<ApprovedDeviceSearch | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Record<string, DeviceRow>>({});
  const [edit, setEdit] = useState<{ revision: number; ids: string[] } | null>(null);
  const [confirmed, setConfirmed] = useState<{ revision: number; ids: string[] } | null>(null);
  const dirty = useTaxonomyDirty();
  const operation = useTaxonomyOperation();
  const current = confirmed && confirmed.revision > product.revision
    ? confirmed : { revision: product.revision, ids: variant.compatibility.map(row => row.modelId) };
  const selected = edit?.ids ?? current.ids;
  const devices = new Map([...results?.linked ?? [], ...results?.matches ?? [], ...Object.values(picked)].map(row => [row.id, row]));
  const variantId = variant.id;
  const usable = product.publication !== "ARCHIVED";

  useEffect(() => {
    const controller = new AbortController();
    void catalogRequest<ApprovedDeviceSearch>({ read: "devices", id: variantId, q: fetchFor.q }, catalogRegion(), controller.signal).then(result => {
      if (!controller.signal.aborted) {
        setResults(result);
        setLoading(false);
      }
    }).catch(error => {
      if (!controller.signal.aborted) {
        setLoadError(error instanceof Error ? error.message : "Could not search devices.");
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, [fetchFor, variantId]);

  function find(q: string) {
    setLoadError("");
    setLoading(true);
    setFetchFor(previous => ({ q: q.trim(), count: previous.count + 1 }));
  }

  function choose(ids: string[], added?: DeviceRow) {
    const unchanged = current.ids.length === ids.length && current.ids.every(id => ids.includes(id));
    setEdit(unchanged ? null : { revision: edit?.revision ?? current.revision, ids });
    if (added) setPicked(previous => ({ ...previous, [added.id]: added }));
    dirty(!unchanged);
    onEdit(!unchanged);
  }

  return <div className="taxonomy-form">
    <h3>Supported devices</h3>
    {selected.length ? <ul className="taxonomy-choice-list">
      {selected.map(id => {
        const model = devices.get(id);
        return <li className="taxonomy-actions" key={id}>
          <span>{model ? `${model.brand} ${model.name}` : id}</span>
          {usable && <button type="button" className="taxonomy-button" disabled={operation.pending}
            onClick={() => choose(selected.filter(row => row !== id))}>Remove {model?.name ?? id}</button>}
        </li>;
      })}
    </ul> : <p className="taxonomy-muted">This SKU has no approved device links.</p>}
    {usable && <>
      <form className="taxonomy-form commerce-form" onSubmit={event => {
        event.preventDefault();
        find(search);
      }}>
        <label>Search devices<input type="search" maxLength={100} value={search} placeholder="Brand, model or approved alias"
          onChange={event => setSearch(event.target.value)} /></label>
        <div className="taxonomy-actions"><button type="submit" className="taxonomy-button">Find devices</button></div>
      </form>
      {loading && <p role="status">Loading approved devices…</p>}
      {loadError && <div role="alert" className="taxonomy-error">{loadError} <button type="button" className="taxonomy-button"
        onClick={() => find(fetchFor.q)}>Retry</button></div>}
      {!loading && !loadError && (results?.matches.length ? <ul className="taxonomy-choice-list">{results.matches.map(model => <li
        key={model.id} className="taxonomy-actions">
        <span>{model.brand} {model.name}{model.aliases.length > 0 && <small className="taxonomy-muted"> · {model.aliases.map(alias => alias.label).join(", ")}</small>}</span>
        <button type="button" className="taxonomy-button" disabled={selected.includes(model.id) || selected.length >= 100 || operation.pending}
          onClick={() => choose([...selected, model.id], model)}>{selected.includes(model.id) ? "Linked" : `Link ${model.name}`}</button>
      </li>)}</ul> : <p className="taxonomy-muted">{fetchFor.q ? "No approved devices match." : "No approved devices are registered yet."}</p>)}
      {results?.hasMore && <p className="taxonomy-muted">Narrow the search to see devices beyond the first 20 results.</p>}
      <div className="taxonomy-actions">
        <button type="button" className="taxonomy-button taxonomy-button--primary" disabled={!edit || operation.pending}
          onClick={async () => {
            if (!edit) return;
            let nextRevision = edit.revision;
            const success = await operation.run(async () => {
              const saved = await runCatalogCommand<{ revision: number }>("variant.compatibility", {
                productId: product.id, variantId, revision: edit.revision, modelIds: edit.ids,
              });
              nextRevision = saved.revision;
            }, "Compatibility saved.");
            if (success) {
              setConfirmed({ ids: edit.ids, revision: nextRevision });
              setEdit(null);
              dirty(false);
              onEdit(false);
            }
          }}>Save compatibility</button>
      </div>
      <TaxonomyFeedback {...operation} />
    </>}
  </div>;
}

export function ConnectedProductFitment({ product, region }: { product: ProductWorkspaceProduct | null; region: Region }) {
  const [selection, setSelection] = useState("");
  const [dirty, setDirty] = useState(false);
  const variants = product?.variants.filter(row => row.active && !row.archivedAt) ?? [];
  const variant = variants.find(row => row.id === selection) ?? variants[0];
  return <section id="compatibility" className="taxonomy-card">
    <div className="taxonomy-card-heading"><h2>Compatibility</h2>
      <Link className="taxonomy-button" href={`${approvedDevicePath}?region=${region}`}>Manage approved device models</Link>
    </div>
    <p className="taxonomy-muted">Link approved devices a SKU fits. Use physical options for model-specific versions. Several compatibility links can share one SKU and one pool.</p>
    {product && variant ? <>
      <label>Variant for compatibility<select value={variant.id} onChange={event => {
        if (dirty && !window.confirm("Discard unsaved compatibility changes?")) return;
        setDirty(false);
        setSelection(event.target.value);
      }}>{variants.map(row => <option key={row.id} value={row.id}>{row.sku} · {row.label}</option>)}</select></label>
      <FitmentEditor key={variant.id} product={product} variant={variant} onEdit={setDirty} />
    </> : <p className="taxonomy-muted">Save at least one active variant to edit compatibility.</p>}
  </section>;
}
