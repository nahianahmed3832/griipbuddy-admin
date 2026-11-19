"use client";

import Link from "next/link";
import { regionFor } from "./routes";
import { useRef, useState, type ReactNode } from "react";
import { formatMoney, markets } from "./markets";
import type { ProductWorkspaceCommerceData } from "./contracts";
import { runCatalogCommand, TaxonomyFeedback, TaxonomyForm, useConfirmTaxonomyNavigation, useTaxonomyOperation } from "./taxonomy-controls";
import "./product-workspace-commerce.css";

type Data = ProductWorkspaceCommerceData;
type Variant = Data["variants"][number];
type Pool = Data["pools"][number];
type Warehouse = Data["warehouses"][number];

const command = runCatalogCommand;

const formValue = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const formatTime = (value: string) => `${value.slice(0, 16).replace("T", " ")} UTC`;
const listKeys = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean);
const statusName = { DRAFT: "Draft", ACTIVE: "Published", ARCHIVED: "Archived" };
const pageSize = 10;

function minorAmount(value: string, digits: number, currency: string) {
  const [whole, fraction = "", ...remaining] = value.split(".");
  const maxMinor = 2_147_483_647;
  if (!/^\d{1,10}$/.test(whole) || !/^\d*$/.test(fraction) || remaining.length || fraction.length > digits ||
    (value.includes(".") && !fraction.length)) {
    throw new Error(`Enter a ${currency} amount with up to ${digits} decimal places.`);
  }
  const amount = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0"));
  if (amount < 1 || amount > maxMinor) throw new Error(`Enter a positive ${currency} amount within the supported price range.`);
  return amount;
}

function utcDate(value: string, original?: string | null) {
  if (!value) return null;
  return original && value === original.slice(0, 19) ? original : new Date(`${value}Z`).toISOString();
}

function CommercialTable({ headings, children, name }: { headings: string[]; children: ReactNode; name: string }) {
  return <div className="connected-commercial-table">
    <table aria-label={name}>
      <thead><tr>{headings.map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>;
}

function PageButtons({ page, count, setPage }: { page: number; count: number; setPage: (page: number) => void }) {
  return count > 1 && <div className="taxonomy-actions">
    <button type="button" className="button button--outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous page</button>
    <span className="commerce-muted">Page {page} of {count}</span>
    <button type="button" className="button button--outline" disabled={page === count} onClick={() => setPage(page + 1)}>Next page</button>
  </div>;
}

function OfferForm({ variant, data, onSaved }: { variant: Variant; data: Data; onSaved: () => void }) {
  const operation = useTaxonomyOperation();
  const { market, sellers } = data;
  const [offer] = useState(variant.offer);
  const [publication, setPublication] = useState(offer?.publication ?? "DRAFT");
  const [sellerId] = useState(variant.sellerId ?? "");
  const currentSeller = sellerId && !sellers.some(seller => seller.id === sellerId) ?
    [{ id: sellerId, name: offer?.sellerName ?? "Assigned seller" }] : [];
  const amount = (minor: number | null | undefined) => minor == null ? "" : (minor / 10 ** market.minorDigits).toFixed(market.minorDigits);

  return <TaxonomyForm className="commerce-panel" aria-label={`Offer for ${variant.sku}`} onSubmit={async event => {
    const form = new FormData(event.currentTarget);
    const saved = await operation.run(() => command("offer.configure", {
      variantId: variant.id, marketId: market.id, sellerId: data.central ? formValue(form, "seller") : sellerId,
      expectedRevision: offer?.revision ?? null, currency: market.currency,
      amountMinor: minorAmount(formValue(form, "amount"), market.minorDigits, market.currency),
      salePriceMinor: formValue(form, "sale") ? minorAmount(formValue(form, "sale"), market.minorDigits, market.currency) : null,
      saleStartsAt: utcDate(formValue(form, "saleStartsAt"), offer?.saleStartsAt),
      saleEndsAt: utcDate(formValue(form, "saleEndsAt"), offer?.saleEndsAt),
      publication, eligible: publication === "ACTIVE" && form.get("eligible") === "on",
    }), "");
    if (saved) onSaved();
    return saved;
  }}>
    <h3>{variant.sku} · {market.name}</h3>
    <div className="commerce-fields">
      {data.central ? <label>Offer seller<select name="seller" defaultValue={sellerId} required>
        <option value="">Choose a seller</option>
        {[...currentSeller, ...sellers].map(seller => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
      </select></label> : <p>Seller <strong>{offer?.sellerName ?? sellers.find(seller => seller.id === sellerId)?.name ?? "Assigned seller"}</strong></p>}
      <label>Offer status<select name="publication" value={publication}
        onChange={event => setPublication(event.currentTarget.value as typeof publication)}>
        <option value="DRAFT">Draft</option><option value="ACTIVE" disabled={!variant.active}>Published</option>
        {offer && <option value="ARCHIVED">Archived</option>}
      </select></label>
      <label>Regular price ({market.currency})<input name="amount" inputMode="decimal" defaultValue={amount(offer?.amountMinor)} required /></label>
      <label>Sale price ({market.currency})<input name="sale" inputMode="decimal" defaultValue={amount(offer?.salePriceMinor)} /></label>
      <label>Sale starts (UTC)<input name="saleStartsAt" type="datetime-local" step="1" defaultValue={offer?.saleStartsAt?.slice(0, 19)} /></label>
      <label>Sale ends (UTC)<input name="saleEndsAt" type="datetime-local" step="1" defaultValue={offer?.saleEndsAt?.slice(0, 19)} /></label>
    </div>
    <label className="commerce-option"><input name="eligible" type="checkbox" disabled={publication !== "ACTIVE"}
      defaultChecked={offer?.eligible} /> Enable purchase in {market.name}</label>
    <p className="commerce-muted">Purchase requires an approved seller and a warehouse route. An offer can be published for browsing or have zero available units.</p>
    <div className="taxonomy-actions"><button type="submit" className="button button--primary" disabled={operation.pending}>
      {operation.pending ? "Saving…" : "Save offer"}
    </button></div>
    <TaxonomyFeedback {...operation} />
  </TaxonomyForm>;
}

type BulkMode = "pause" | "browse" | "sell" | "archive";
const bulkIntention = {
  pause: "Save as draft", browse: "Publish for browsing", sell: "Publish and enable purchase", archive: "Archive offer",
} as const;

export function ConnectedOffers({ data, canEdit }: { data: Data; canEdit: boolean }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string>();
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [mode, setMode] = useState<BulkMode>("browse");
  const [report, setReport] = useState<{ sku: string; error?: string }[]>([]);
  const [notice, setNotice] = useState("");
  const operation = useTaxonomyOperation();
  const confirmChanges = useConfirmTaxonomyNavigation();
  const { market, variants } = data;
  const term = query.trim().toLowerCase();
  const filtered = variants.filter(variant => `${variant.sku} ${variant.label}`.toLowerCase().includes(term));
  const count = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, count);
  const rows = filtered.slice((current - 1) * pageSize, current * pageSize);
  const variant = variants.find(row => row.id === editing);
  const selected = canEdit ? variants.filter(row => checked.has(row.id) && row.canEditOffer && row.offer?.id) : [];
  const selectedSellers = [...new Set(selected.map(row => row.offer?.sellerName ||
    data.sellers.find(seller => seller.id === row.sellerId)?.name || "Assigned seller"))];

  async function bulk() {
    if (!selected.length) return;
    setNotice("");
    setReport([]);
    await operation.run(async () => {
      const results: { sku: string; error?: string }[] = [];
      for (const row of selected) {
        const offer = row.offer!;
        try {
          await command("offer.configure", { variantId: row.id, marketId: market.id, sellerId: row.sellerId,
            expectedRevision: offer.revision, currency: offer.currency, amountMinor: offer.amountMinor,
            salePriceMinor: offer.salePriceMinor, saleStartsAt: offer.saleStartsAt, saleEndsAt: offer.saleEndsAt,
            publication: mode === "pause" ? "DRAFT" : mode === "archive" ? "ARCHIVED" : "ACTIVE", eligible: mode === "sell",
          });
          results.push({ sku: row.sku });
        } catch (error) {
          results.push({ sku: row.sku, error: error instanceof Error ? error.message : "The offer could not be saved." });
        }
      }
      setReport(results);
      setChecked(new Set(selected.filter((_, index) => results[index].error).map(row => row.id)));
    }, "");
  }

  return <div className="connected-commercial">
    <p>{market.name} · {market.currency}{market.status === "paused" && " · Checkout paused"}</p>
    {data.publication !== "ACTIVE" && <p className="commerce-muted">Publish the shared product when its content and selling setup are ready.</p>}
    <label className="connected-commercial-search">Search offer variants<input type="search" value={query} maxLength={80}
      onChange={event => { setQuery(event.currentTarget.value); setPage(1); }} /></label>
    {!canEdit && <p className="commerce-muted">Offers are read-only for this account or archived product.</p>}
    {rows.length ? <CommercialTable name={`${market.name} offers`}
      headings={[...(canEdit ? ["Select"] : []), "Variant", "Seller", "Local price", "Status", ...(canEdit ? ["Action"] : [])]}>
      {rows.map(row => <tr key={row.id}>
        {canEdit && <td><input type="checkbox" aria-label={`Select ${row.sku} offer`} checked={checked.has(row.id)}
          disabled={operation.pending || !row.canEditOffer || !row.offer?.id} onChange={event => {
            const next = new Set(checked);
            if (event.currentTarget.checked) next.add(row.id); else next.delete(row.id);
            setChecked(next);
          }} /></td>}
        <th scope="row">{row.sku}<small>{row.label}</small></th>
        <td>{row.offer?.sellerName ?? data.sellers.find(seller => seller.id === row.sellerId)?.name ?? "—"}</td>
        <td>{row.offer ? formatMoney(row.offer.amountMinor, market) : "—"}
          {row.offer?.salePriceMinor != null && <small>Sale {formatMoney(row.offer.salePriceMinor, market)}</small>}</td>
        <td>{row.offer ? statusName[row.offer.publication] : row.sellerId ? "No offer" : "Outside seller scope"}
          {row.offer && <small>{!row.offer.id ? "Reconcile legacy offer" : row.offer.eligible ? "Purchase enabled" : "Purchase disabled"}</small>}</td>
        {canEdit && <td>{row.canEditOffer && <button type="button" className="button button--outline" disabled={operation.pending}
          aria-label={`${row.offer ? "Edit" : "Add"} offer for ${row.sku}`}
          onClick={() => { if (editing !== row.id && !confirmChanges()) return; setNotice(""); setEditing(row.id); }}>
          {row.offer ? "Edit offer" : "Add offer"}</button>}</td>}
      </tr>)}
    </CommercialTable> : <p>No variants match this search. Save a physical variant to prepare an offer.</p>}
    <PageButtons page={current} count={count} setPage={setPage} />
    {canEdit && variant?.canEditOffer && <OfferForm key={variant.id} variant={variant} data={data}
      onSaved={() => { setNotice(`Offer saved for ${variant.sku} in ${market.name}.`); setEditing(undefined); }} />}
    <TaxonomyFeedback message={notice} />
    {selected.length > 0 && <div className="commerce-panel commerce-form">
      <h3>Update selected offers</h3>
      <p>{selected.length} selected in {market.name} · {selectedSellers.join(", ")}</p>
      <p className="commerce-muted">{selected.map(row => row.sku).join(", ")}</p>
      <label>Bulk offer change<select value={mode} onChange={event => setMode(event.currentTarget.value as BulkMode)} disabled={operation.pending}>
        {Object.entries(bulkIntention).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <div className="taxonomy-actions"><button type="button" className="button button--primary" disabled={operation.pending}
        onClick={() => void bulk()}>{operation.pending ? "Saving selected offers…" : "Apply to selected offers"}</button></div>
      <p className="commerce-muted">Each offer is checked at its current revision. Successful rows save independently.</p>
    </div>}
    {report.length > 0 && <div className="commerce-panel" aria-live="polite">
      <strong>{report.filter(item => !item.error).length} of {report.length} offers saved</strong>
      <ul className="staff-history">{report.map(item => <li key={item.sku}><strong>{item.sku}</strong><span>{item.error ?? "Saved"}</span></li>)}</ul>
    </div>}
    <TaxonomyFeedback {...operation} />
  </div>;
}

const stockScope = (data: Data) => ({ productId: data.productId, marketId: data.market.id });

function useStockKey(actorId: string) {
  const pending = useRef<{ storageKey: string; value: string }>(null);
  return {
    async key(payload: object) {
      // A shared pool's movement is the same action after a refresh or market switch.
      const fields = Object.entries(payload).filter(([field]) =>
        field !== "marketId" && field !== "expectedUpdatedAt" && field !== "expectedDestinationUpdatedAt");
      const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(fields)));
      const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      const storageKey = `griip-stock-pending:${actorId}:${fingerprint}`;
      let value = pending.current?.storageKey === storageKey ? pending.current.value : null;
      try { value ??= window.sessionStorage.getItem(storageKey); } catch { /* Storage can be unavailable in this tab. */ }
      value ??= window.crypto.randomUUID();
      pending.current = { storageKey, value };
      try { window.sessionStorage.setItem(storageKey, value); } catch { /* Retry in memory if the tab cannot persist it. */ }
      return value;
    },
    clear() {
      if (pending.current) {
        try { window.sessionStorage.removeItem(pending.current.storageKey); } catch { /* The operation already succeeded. */ }
      }
      pending.current = null;
    },
  };
}

function OpenPoolForm({ data }: { data: Data }) {
  const operation = useTaxonomyOperation();
  const variants = data.variants.filter(variant => variant.active && !variant.legacyInventory);
  const [selected, setSelected] = useState("");
  const locations = data.warehouses.filter(warehouse => warehouse.inScope &&
    !data.pools.some(pool => pool.variantId === selected && pool.warehouse.id === warehouse.id && pool.ownerId === warehouse.ownerId));
  return <TaxonomyForm className="commerce-panel" aria-label="Open inventory pool" onSubmit={async event => {
    const form = new FormData(event.currentTarget);
    return operation.run(() => command("inventory.initialize", {
      ...stockScope(data), variantId: selected, locationId: formValue(form, "warehouse"),
    }), "Opened a warehouse pool with zero units. Record a receipt to add stock.");
  }}>
    <h3>Open an inventory pool</h3>
    <p className="commerce-muted">Choose a physical variant and warehouse. An existing pool is shared across all its configured markets.</p>
    <div className="commerce-fields">
      <label>Stock variant<select value={selected} onChange={event => setSelected(event.currentTarget.value)} required>
        <option value="">Choose a variant</option>
        {variants.map(variant => <option key={variant.id} value={variant.id}>{variant.sku} · {variant.label}</option>)}
      </select></label>
      <label>Stock warehouse<select key={selected} name="warehouse" defaultValue="" required disabled={!selected || !locations.length}>
        <option value="">Choose a warehouse</option>
        {locations.map(location => <option key={location.id} value={location.id}>{location.name} · {location.ownerName}</option>)}
      </select></label>
    </div>
    {selected && !locations.length && <p>Every warehouse in this market already has a pool for this variant, or needs a service route.</p>}
    <div className="taxonomy-actions"><button type="submit" className="button button--primary"
      disabled={operation.pending || !selected || !locations.length}>{operation.pending ? "Opening…" : "Open stock pool"}</button></div>
    <TaxonomyFeedback {...operation} />
  </TaxonomyForm>;
}

function WarehouseForm({ data, warehouse }: { data: Data; warehouse: Warehouse }) {
  const operation = useTaxonomyOperation();
  const [expected, setExpected] = useState(warehouse.route);
  return <TaxonomyForm onSubmit={event => {
    const form = new FormData(event.currentTarget);
    return operation.run(async () => {
      const { active, priority, districts, methods } = await command<NonNullable<Warehouse["route"]>>("inventory.route", {
        ...stockScope(data), locationId: warehouse.id, expected,
        active: form.get("route") === "on", priority: Number(formValue(form, "priority")),
        districts: listKeys(formValue(form, "districts")), methods: listKeys(formValue(form, "methods")),
      });
      setExpected({ active, priority, districts, methods });
    }, `Warehouse service saved for ${data.market.name}.`);
  }}>
    <label className="commerce-option"><input type="checkbox" name="route" defaultChecked={warehouse.route?.active ?? false} />
      Serve {data.market.name}</label>
    <div className="commerce-fields">
      <label>Dispatch priority<input name="priority" type="number" min="0" max="1000" required
        defaultValue={warehouse.route?.priority ?? warehouse.priority} /></label>
      <label>District keys<input name="districts" maxLength={4200} defaultValue={warehouse.route?.districts.join(", ")} /></label>
      <label>Delivery method keys<input name="methods" maxLength={1200} defaultValue={warehouse.route?.methods.join(", ")} /></label>
    </div>
    <p className="commerce-muted">Separate keys with commas. Blank lists use the market’s delivery configuration.</p>
    <div className="taxonomy-actions"><button type="submit" className="button button--primary" disabled={operation.pending}>
      {operation.pending ? "Saving…" : "Save warehouse service"}
    </button></div>
    <TaxonomyFeedback {...operation} />
  </TaxonomyForm>;
}

function WarehouseServices({ data }: { data: Data }) {
  const [selected, setSelected] = useState("");
  const warehouse = data.warehouses.find(row => row.id === selected);
  return <details className="commerce-panel connected-commercial">
    <summary>Warehouse service for {data.market.name}</summary>
    <p className="commerce-muted">Route an existing warehouse to this market. Routing reuses its inventory pools.</p>
    <div className="commerce-form"><label>Service warehouse<select value={selected} onChange={event => setSelected(event.currentTarget.value)}>
      <option value="">Choose a warehouse</option>
      {data.warehouses.map(row => <option key={row.id} value={row.id}>{row.name} · {row.ownerName}</option>)}
    </select></label></div>
    {warehouse && <WarehouseForm key={warehouse.id} data={data} warehouse={warehouse} />}
  </details>;
}

function MovementForm({ data, actorId, pool, onSaved }: { data: Data; actorId: string; pool: Pool; onSaved: (message: string) => void }) {
  const operation = useTaxonomyOperation();
  const stockKey = useStockKey(actorId);
  const [kind, setKind] = useState("RECEIPT");
  const [expectedUpdatedAt] = useState(pool.updatedAt);
  return <TaxonomyForm className="commerce-panel" aria-label="Stock movement" onSubmit={async event => {
    const form = new FormData(event.currentTarget);
    const payload = { ...stockScope(data), poolId: pool.id, kind, quantity: Number(formValue(form, "quantity")),
      expectedUpdatedAt, reason: formValue(form, "reason"), reference: formValue(form, "reference") };
    const saved = await operation.run(async () => command("inventory.movement", {
      ...payload, idempotencyKey: await stockKey.key(payload),
    }), "");
    if (saved) { stockKey.clear(); onSaved("Stock movement recorded."); }
    return saved;
  }}>
    <h3>Record a stock movement</h3>
    <p>{pool.warehouse.name} · {pool.ownerName} · {pool.available} available</p>
    <div className="commerce-fields">
      <label>Movement type<select value={kind} onChange={event => setKind(event.currentTarget.value)}>
        <option value="RECEIPT">Receipt</option><option value="ADJUSTMENT">Adjustment</option>
      </select></label>
      <label>Stock units<input name="quantity" type="number" step="1" min={kind === "RECEIPT" ? 1 : -pool.available} max="1000000" required /></label>
      <label>Movement reason<input name="reason" maxLength={240} required /></label>
      <label>Movement reference<input name="reference" maxLength={160} required /></label>
    </div>
    <div className="taxonomy-actions"><button type="submit" className="button button--primary" disabled={operation.pending}>
      {operation.pending ? "Recording…" : "Record movement"}
    </button></div>
    <TaxonomyFeedback {...operation} />
  </TaxonomyForm>;
}

function TransferForm({ data, actorId, pool, destinations, onSaved }: { data: Data; actorId: string; pool: Pool; destinations: Pool[]; onSaved: () => void }) {
  const operation = useTaxonomyOperation();
  const stockKey = useStockKey(actorId);
  const [expectedUpdatedAt] = useState(pool.updatedAt);
  const [destinationVersions] = useState(() => new Map(destinations.map(row => [row.id, row.updatedAt])));
  return <TaxonomyForm className="commerce-panel" aria-label="Stock transfer" onSubmit={async event => {
    const form = new FormData(event.currentTarget);
    const to = destinations.find(item => item.id === formValue(form, "destination"));
    const saved = await operation.run(async () => {
      const expectedDestinationUpdatedAt = to && destinationVersions.get(to.id);
      if (!to || !expectedDestinationUpdatedAt) throw new Error("Choose a destination warehouse from the original pool list or reload.");
      const payload = { ...stockScope(data), fromPoolId: pool.id, toPoolId: to.id,
        quantity: Number(formValue(form, "quantity")), expectedUpdatedAt, expectedDestinationUpdatedAt,
        reason: formValue(form, "reason"), reference: formValue(form, "reference") };
      return command("inventory.transfer", { ...payload, idempotencyKey: await stockKey.key(payload) });
    }, "");
    if (saved) { stockKey.clear(); onSaved(); }
    return saved;
  }}>
    <h3>Transfer available units</h3>
    <p>From {pool.warehouse.name} · {pool.ownerName} · {pool.available} available</p>
    <div className="commerce-fields">
      <label>Destination warehouse<select name="destination" defaultValue="" required>
        <option value="">Choose a warehouse</option>
        {destinations.map(item => <option key={item.id} value={item.id}>{item.warehouse.name}</option>)}
      </select></label>
      <label>Transfer units<input name="quantity" type="number" min="1" max={pool.available} step="1" required /></label>
      <label>Transfer reason<input name="reason" maxLength={240} required /></label>
      <label>Transfer reference<input name="reference" maxLength={160} required /></label>
    </div>
    <div className="taxonomy-actions"><button type="submit" className="button button--primary" disabled={operation.pending}>
      {operation.pending ? "Transferring…" : "Transfer stock"}
    </button></div>
    <TaxonomyFeedback {...operation} />
  </TaxonomyForm>;
}

function InventoryHistory({ data, skus }: { data: Data; skus: Map<string, Variant> }) {
  const pools = new Map(data.pools.map(pool => [pool.id, pool]));
  const location = (id: string) => {
    const pool = pools.get(id);
    return pool ? `${skus.get(pool.variantId)?.sku ?? "Variant"} · ${pool.warehouse.name}` : "Warehouse pool";
  };
  return <details className="commerce-panel connected-commercial">
    <summary>Recent stock movements and allocations</summary>
    <h3>Stock movements</h3>
    {data.movements.length ? <CommercialTable name="Recent stock movements" headings={["Warehouse pool", "Movement", "Units", "Recorded"]}>
      {data.movements.map(movement => <tr key={movement.id}><th scope="row">{location(movement.poolId)}</th>
        <td>{movement.kind.replaceAll("_", " ").toLowerCase()}</td><td>{movement.quantity > 0 ? "+" : ""}{movement.quantity}</td>
        <td>{formatTime(movement.createdAt)}</td></tr>)}
    </CommercialTable> : <p>No stock movements in the current scope.</p>}
    <h3>Allocations</h3>
    {data.allocations.length ? <CommercialTable name="Recent stock allocations"
      headings={["Warehouse pool", "Reservation", "Market", "State", "Units", "Dispatched", "Returned", "Hold expires"]}>
      {data.allocations.map(item => <tr key={item.id}><th scope="row">{location(item.poolId)}</th>
        <td>{item.reservationId ?? "—"}</td><td>{markets[item.marketId].name}</td><td>{item.state.replaceAll("_", " ").toLowerCase()}</td><td>{item.quantity}</td>
        <td>{item.dispatched}</td><td>{item.returned}</td><td>{item.state === "HELD" ? formatTime(item.expiresAt) : "—"}</td></tr>)}
    </CommercialTable> : <p>No allocations in the current scope.</p>}
  </details>;
}

export function ConnectedInventory({ data, actorId, canEdit }: { data: Data; actorId: string; canEdit: boolean }) {
  const [selected, setSelected] = useState<{ id: string; action: "movement" | "transfer" }>();
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const confirmChanges = useConfirmTaxonomyNavigation();
  const current = selected && data.pools.find(pool => pool.id === selected.id);
  const skus = new Map(data.variants.map(variant => [variant.id, variant]));
  const term = query.trim().toLowerCase();
  const matching = data.pools.filter(pool => `${skus.get(pool.variantId)?.sku} ${pool.warehouse.name} ${pool.ownerName}`.toLowerCase().includes(term));
  const count = Math.max(1, Math.ceil(matching.length / pageSize));
  const currentPage = Math.min(page, count);
  const rows = matching.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const destinations = (pool: Pool) => data.pools.filter(item => item.id !== pool.id && item.variantId === pool.variantId &&
    item.ownerId === pool.ownerId && item.warehouse.active && !item.legacyOwnerMismatch);

  return <div className="connected-commercial">
    <p>{data.market.name} · physical units by variant, stock owner and warehouse</p>
    <p className="commerce-muted">Each pool is listed once. Available units reflect on-hand stock less reservations.</p>
    {!canEdit && <p className="commerce-muted">Stock balances and movement history are read-only for this account or archived product.</p>}
    {data.hasRestrictedPools && <p>Some shared pools require commercial access in every market served.</p>}
    {data.variants.some(variant => variant.legacyInventory) && <p>
      Reconcile legacy stock and offers before opening connected pools for those variants.
      {data.central && <> <Link href={`/dashboard/check-outlet-stocks?region=${regionFor(data.market.id)}&catalog=connected`} className="text-link">Open the stock workspace</Link></>}
    </p>}
    {data.pools.length > 0 && <label className="connected-commercial-search">Search stock pools
      <input type="search" value={query} onChange={event => { setQuery(event.currentTarget.value); setPage(1); }} maxLength={80} />
    </label>}
    {rows.length ? <CommercialTable name="Physical stock pools"
      headings={["Variant", "Warehouse", "Stock owner", "Serves", "On hand", "Reserved", "Available", ...(canEdit ? ["Action"] : [])]}>
      {rows.map(pool => <tr key={pool.id}><th scope="row">{skus.get(pool.variantId)?.sku ?? "Variant"}</th>
        <td>{pool.warehouse.name}{!pool.warehouse.active && <small>Inactive</small>}</td><td>{pool.ownerName}</td>
        <td>{pool.warehouse.servingMarkets.map(id => markets[id].name).join(", ") || "Service pending"}</td>
        <td>{pool.onHand}</td><td>{pool.reserved}</td><td>{pool.available}</td>
        {canEdit && <td><div className="taxonomy-actions">
          <button className="button button--outline" type="button" disabled={pool.legacyOwnerMismatch}
            onClick={() => {
              if ((selected?.id !== pool.id || selected.action !== "movement") && !confirmChanges()) return;
              setNotice(""); setSelected({ id: pool.id, action: "movement" });
            }}>Record stock</button>
          <button className="button button--outline" type="button" disabled={pool.legacyOwnerMismatch || !pool.available || !destinations(pool).length}
            onClick={() => {
              if ((selected?.id !== pool.id || selected.action !== "transfer") && !confirmChanges()) return;
              setNotice(""); setSelected({ id: pool.id, action: "transfer" });
            }}>Transfer</button>
        </div></td>}
      </tr>)}
    </CommercialTable> : <p>{data.pools.length ? "No stock pools match this search." : "No physical stock pools in this market."}</p>}
    <PageButtons page={currentPage} count={count} setPage={setPage} />
    <TaxonomyFeedback message={notice} />
    {canEdit && current && (selected?.action === "movement"
      ? <MovementForm key={current.id} data={data} actorId={actorId} pool={current} onSaved={message => { setNotice(message); setSelected(undefined); }} />
      : <TransferForm key={current.id} data={data} actorId={actorId} pool={current} destinations={destinations(current)}
        onSaved={() => { setNotice("Stock transfer recorded."); setSelected(undefined); }} />)}
    {canEdit && (data.warehouses.length ? <>
      <OpenPoolForm data={data} />
      <WarehouseServices data={data} />
    </> : <p>No warehouses are available to manage for this market.
      {data.central && <> <Link href={`/dashboard/check-outlet-stocks?region=${regionFor(data.market.id)}&catalog=connected`} className="text-link">Open the stock workspace</Link></>}
    </p>)}
    <InventoryHistory data={data} skus={skus} />
  </div>;
}
