import Link from "next/link";
import { ApiError, workspaceWritesEnabled, type Session } from "@/lib/api";
import { connectedCatalog, connectedCatalogMarket, mayCreateConnectedWarehouse, mayEditConnectedOffers, mayEditConnectedStock, mayEditConnectedTaxonomy } from "@/lib/connected-catalog";
import { param, type Query } from "@/lib/data";
import { adminPath } from "@/lib/paths";
import { scopedCatalogPilotRequested } from "@/lib/scoped-catalog-pilot";
import { has, superAdmin, type Region } from "@/lib/sections";
import { PageHeading } from "../dashboard";
import { ConnectedProductAuthoring } from "./connected-product-authoring";
import { ConnectedProductLocalization } from "./connected-product-localization";
import { ConnectedProductMedia } from "./connected-product-media";
import { ConnectedProductPublication } from "./connected-product-publication";
import { ConnectedWarehouseSetup, type DispatchWarehouseList } from "./connected-warehouse-setup";
import type { ProductWorkspace, ProductWorkspaceList } from "./contracts";
import { isMarketId, markets } from "./markets";
import { ConnectedInventory, ConnectedOffers } from "./product-commerce-tools";
import { productPath } from "./routes";
import { TaxonomyPendingChanges } from "./taxonomy-controls";
import "./catalog-layout.css";
import "./product-workspace.css";
import "./workspace.css";

const publicationLabels = { DRAFT: "Draft", ACTIVE: "Published", ARCHIVED: "Archived" };
const sharedSections = [["publication", "Publication"], ["general", "General"], ["categories", "Categories and attributes"],
  ["variants", "Options and variants"], ["compatibility", "Compatibility"], ["localization", "Localization"], ["media", "Media"]];
const marketSections = [["markets", "Offers and prices"], ["inventory", "Inventory"]];

type Props = { auth: Session; region: Region; q: Query; id?: string };

async function ProductList({ auth, region, q }: Props) {
  const search = param(q, "q")?.trim().slice(0, 120) || "";
  const page = pageNumber(q);
  const rawState = param(q, "state");
  const state = rawState === "DRAFT" || rawState === "ACTIVE" || rawState === "ARCHIVED" ? rawState : undefined;
  const rawSource = param(q, "source");
  const source = rawSource === "connected" || rawSource === "legacy" ? rawSource : undefined;
  const rawOfferMarket = param(q, "offerMarket");
  const offerMarketId = superAdmin(auth.staff) && isMarketId(rawOfferMarket) ? rawOfferMarket : undefined;
  const data = await connectedCatalog<ProductWorkspaceList>(auth, region, { read: "products", q: search || undefined, page, state, source, offerMarketId });
  const path = "/dashboard/products";
  const listHref = (number: number) => `${path}?${new URLSearchParams({ region, catalog: "connected",
    ...(search && { q: search }), ...(state && { state }), ...(source && { source }),
    ...(offerMarketId && { offerMarket: offerMarketId }),
    ...(number > 1 && { page: String(number) }) })}`;
  return <>
    <PageHeading eyebrow="COMMERCE / CATALOG" title="Products"
      description="Manage shared products, physical variants and the offers available in each selling market." />
    <div className="page-actions">
      {!scopedCatalogPilotRequested() && data.owner && workspaceWritesEnabled() && has(auth.staff, "product.create") &&
        <Link className="button primary" href={`/dashboard/create-product?region=${region}&catalog=connected`}>Create Product</Link>}
    </div>
    <form className="panel filters" action={adminPath(path)}>
      <input type="hidden" name="region" value={region} />
      <input type="hidden" name="catalog" value="connected" />
      <label className="filter-label">Search products or SKU<input name="q" maxLength={120} type="search" defaultValue={search} /></label>
      <label className="filter-label">Status<select name="state" defaultValue={state ?? ""}>
        <option value="">Any status</option>{Object.entries(publicationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="filter-label">Catalog setup<select name="source" defaultValue={source ?? ""}>
        <option value="">All products</option><option value="connected">Connected</option><option value="legacy">Legacy</option>
      </select></label>
      {data.owner && <label className="filter-label">Offer market<select name="offerMarket" defaultValue={offerMarketId ?? ""}>
        <option value="">All accessible markets</option>
        {data.marketIds.map(id => <option key={id} value={id}>{markets[id].name}</option>)}
      </select></label>}
      <button className="button secondary">Search</button>
    </form>
    <div className="panel table-scroll">
      <table aria-label="Products in the shared catalog">
        <thead><tr><th scope="col">Product</th><th scope="col">Primary category</th><th scope="col">Variants</th>
          <th scope="col">Status</th><th scope="col">Published markets</th></tr></thead>
        <tbody>{data.rows.map(row => <tr key={row.id}>
          <th scope="row"><Link className="table-link" href={productPath(row.id, region)}>{row.name}</Link></th>
          <td>{row.category}</td><td>{row.variants}</td><td>{publicationLabels[row.publication]}{row.incomplete && " · Setup incomplete"}</td>
          <td>{row.markets.map(id => markets[id].name).join(", ") || "—"}</td>
        </tr>)}</tbody>
      </table>
      {!data.rows.length && <p className="empty">No products match this search.</p>}
      {(page > 1 || data.hasNext) && <nav className="pagination" aria-label="Product pages">
        <span>Page {page}</span><div>{page > 1 && <Link className="button secondary" href={listHref(page - 1)}>Previous</Link>}
          {data.hasNext && <Link className="button secondary" href={listHref(page + 1)}>Next</Link>}</div>
      </nav>}
    </div>
  </>;
}

function pageNumber(q: Query) {
  const value = param(q, "page");
  return value && /^[1-9]\d{0,2}$/.test(value) ? Math.min(500, Number(value)) : 1;
}

type StockList = { rows: { id: string; productId: string; productName: string; sku: string; variantLabel: string;
  warehouseName: string; ownerName: string; onHand: number; reserved: number; available: number }[]; hasNext: boolean };

export async function ConnectedStockWorkspace({ auth, q, region }: Props) {
  const search = param(q, "q")?.trim().slice(0, 120) || "";
  const page = pageNumber(q);
  const [data, warehouses] = await Promise.all([
    connectedCatalog<StockList>(auth, region, { read: "inventory", q: search || undefined, page }),
    superAdmin(auth.staff) ? connectedCatalog<DispatchWarehouseList>(auth, region, { read: "warehouses" }) : null,
  ]);
  const path = "/dashboard/check-outlet-stocks";
  const listHref = (number: number) => `${path}?${new URLSearchParams({ region, catalog: "connected",
    ...(search && { q: search }), ...(number > 1 && { page: String(number) }) })}`;
  return <>
    <PageHeading eyebrow="COMMERCE / INVENTORY" title="Stock report" description="Each row is one physical SKU, warehouse and stock owner." />
    <div className="page-actions"><Link className="button secondary" href={`${path}?region=${region}&catalog=legacy`}>Legacy stock report</Link></div>
    <form className="panel filters" action={adminPath(path)}>
      <input type="hidden" name="region" value={region} /><input type="hidden" name="catalog" value="connected" />
      <label className="filter-label">Search warehouse stock<input name="q" type="search" maxLength={120} defaultValue={search} /></label>
      <button className="button secondary">Search</button>
    </form>
    <div className="panel table-scroll" role="region" aria-label="Warehouse stock table" tabIndex={0}>
      <table aria-label="Physical warehouse stock"><thead><tr><th scope="col">SKU</th><th scope="col">Warehouse</th>
        <th scope="col">Stock owner</th><th scope="col">On hand</th><th scope="col">Reserved</th><th scope="col">Available</th></tr></thead>
        <tbody>{data.rows.map(row => <tr key={row.id}>
          <th scope="row"><Link className="table-link" href={`${productPath(row.productId, region)}#inventory`}>{row.sku}</Link>
            <div className="muted">{row.productName} · {row.variantLabel}</div></th>
          <td>{row.warehouseName}</td><td>{row.ownerName}</td><td>{row.onHand}</td><td>{row.reserved}</td><td>{row.available}</td>
        </tr>)}</tbody>
      </table>
      {!data.rows.length && <p className="empty">No physical stock pools match this search.</p>}
      {(page > 1 || data.hasNext) && <nav className="pagination" aria-label="Stock pages">
        <span>Page {page}</span><div>{page > 1 && <Link className="button secondary" href={listHref(page - 1)}>Previous</Link>}
          {data.hasNext && <Link className="button secondary" href={listHref(page + 1)}>Next</Link>}</div>
      </nav>}
    </div>
    {warehouses && <ConnectedWarehouseSetup key={region} data={warehouses} marketId={connectedCatalogMarket(auth, region)}
      region={region} canCreate={!scopedCatalogPilotRequested() && mayCreateConnectedWarehouse(auth)} />}
  </>;
}

export async function ConnectedProductWorkspace({ auth, q, region, id }: Props) {
  if (!id) return <ProductList {...{ auth, q, region }} />;
  const pilot = scopedCatalogPilotRequested();
  if (id === "new" && (pilot || !workspaceWritesEnabled() || !has(auth.staff, "product.create"))) throw new ApiError(403);
  const data = await connectedCatalog<ProductWorkspace>(auth, region, { read: "product", id });
  const marketId = data.commerce?.market.id ?? (region === "BD" ? "bd" : "us");
  const list = `/dashboard/products?region=${region}&catalog=connected`;
  if (id === "new") {
    return <TaxonomyPendingChanges><div className="taxonomy-workspace connected-product-workspace">
      <PageHeading eyebrow="COMMERCE / CATALOG" title="Create Product" description="Set up the shared product and its physical variants." />
      <Link className="text-link" href={list}>Back to products</Link>
      <ConnectedProductAuthoring product={null} categories={data.categories} marketId={marketId} />
    </div></TaxonomyPendingChanges>;
  }
  if (!data.identity) throw new ApiError(404);
  const { product, owner } = data.identity;
  const archived = product.publication === "ARCHIVED";
  const shared = data.shared;
  const catalogEdits = !pilot || (region === "BD" && data.pilotEditable === true);
  const canEditShared = catalogEdits && mayEditConnectedTaxonomy(auth);
  const canViewStock = has(auth.staff, "stock.view");
  const sections = [...(shared && !archived && canEditShared ? sharedSections : []),
    ...(data.commerce ? marketSections.filter(([key]) => key !== "inventory" || canViewStock) : []),
    ...(shared ? [["history", "Change history"]] : [])];
  const time = new Intl.DateTimeFormat(markets[marketId].locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  return <TaxonomyPendingChanges><div className="taxonomy-workspace connected-product-workspace">
    <PageHeading eyebrow="COMMERCE / CATALOG" title={product.name} description={`${product.department.name} · ${product.id}`} />
    <Link className="text-link" href={list}>Back to products</Link>
    {pilot && <p className="notice" role="status">Connected editing is limited to the reviewed Bangladesh catalog. Use the existing product list for independent legacy products.</p>}
    {(!owner || !canEditShared) && <p className="notice" role="status">Shared product details are read-only in this workspace. Offers and inventory follow your market grants.</p>}
    {!product.foundation && <p className="notice" role="status">This listing awaits an explicit catalog migration. Its legacy identity and stock are preserved.</p>}
    <div className="product-workspace-layout">
      <nav className="taxonomy-card product-workspace-links" aria-label="Product editor sections">
        <ul>{sections.map(([href, label]) => <li key={href}><a href={`#${href}`}>{label}</a></li>)}</ul>
      </nav>
      <div className="product-workspace-sections">
        {shared && canEditShared && <ConnectedProductPublication productId={shared.id} publication={shared.publication}
          revision={shared.revision} readiness={data.readiness} />}
        {shared && !archived && canEditShared && <>
          <ConnectedProductAuthoring product={shared} categories={data.categories} marketId={marketId} allowNewVariants={!pilot} />
          <ConnectedProductLocalization product={shared} />
          <ConnectedProductMedia product={shared} region={region} uploadEnabled={!pilot && data.uploadEnabled} />
        </>}
        {shared && archived && <section className="taxonomy-card" aria-labelledby="retired-variants">
          <h2 id="retired-variants">Archived variants</h2><ul>{shared.variants.map(row => <li key={row.id}>{row.sku} · {row.label}</li>)}</ul>
        </section>}
        {shared && !archived && !canEditShared && <section className="taxonomy-card"><h2>Shared details</h2>
          <p>{shared.description}</p><p>{publicationLabels[shared.publication]} · {shared.variants.length} variants</p>
        </section>}
        {data.commerce && <>
          <section className="taxonomy-card" id="markets" aria-labelledby="main-admin-offers"><h2 id="main-admin-offers">Offers and prices</h2>
            <p className="taxonomy-muted">{data.commerce.market.name} · {data.commerce.market.currency}</p>
            <ConnectedOffers key={data.commerce.market.id} data={data.commerce} canEdit={catalogEdits && !archived && mayEditConnectedOffers(auth)} />
          </section>
          {canViewStock && <section className="taxonomy-card" id="inventory" aria-labelledby="main-admin-inventory"><h2 id="main-admin-inventory">Inventory</h2>
            <ConnectedInventory key={data.commerce.market.id} data={data.commerce} actorId={auth.staff.id}
              canEdit={catalogEdits && !archived && mayEditConnectedStock(auth)} canConfigureWarehouses={!pilot} />
          </section>}
        </>}
        {shared && <section id="history" className="taxonomy-card" aria-labelledby="product-history">
          <h2 id="product-history">Change history</h2>
          {data.history.length ? <div className="taxonomy-scroll" role="region" aria-label="Product history table" tabIndex={0}><table className="taxonomy-table">
            <thead><tr><th scope="col">When (UTC)</th><th scope="col">Change</th><th scope="col">Actor</th></tr></thead>
            <tbody>{data.history.map(entry => <tr key={entry.id}>
              <td><time dateTime={entry.createdAt}>{time.format(new Date(entry.createdAt))}</time></td>
              <td>{[entry.label, entry.market?.toUpperCase(), entry.warehouse, entry.locale, entry.publication, entry.fields].filter(Boolean).join(" · ")}</td>
              <td>{entry.actorName}</td>
            </tr>)}</tbody>
          </table></div> : <p>No catalog changes recorded.</p>}
        </section>}
      </div>
    </div>
  </div></TaxonomyPendingChanges>;
}
