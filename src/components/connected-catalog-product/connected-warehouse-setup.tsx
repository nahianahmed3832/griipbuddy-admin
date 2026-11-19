"use client";

import { useRef } from "react";
import { catalogRequest } from "@/lib/connected-catalog-client";
import type { Region } from "@/lib/sections";
import { markets, type MarketId } from "./markets";
import { TaxonomyFeedback, TaxonomyForm, TaxonomyPendingChanges, useTaxonomyOperation } from "./taxonomy-controls";

export type DispatchWarehouseList = {
  locations: { id: string; name: string; active: boolean; marketId: MarketId; priority: number; shop: { name: string } | null }[];
  sellers: { id: string; name: string }[];
};

export function ConnectedWarehouseSetup({ data, marketId, region, canCreate }: {
  data: DispatchWarehouseList; marketId: MarketId; region: Region; canCreate: boolean;
}) {
  const operation = useTaxonomyOperation();
  const pendingId = useRef<string | null>(null);
  return <TaxonomyPendingChanges><section className="taxonomy-workspace taxonomy-card" aria-labelledby="dispatch-warehouses">
    <h2 id="dispatch-warehouses">Dispatch warehouses</h2>
    <p>{markets[marketId].name}</p>
    {data.locations.length ? <div className="table-scroll"><table aria-label="Dispatch warehouses in this market">
      <thead><tr><th scope="col">Warehouse</th><th scope="col">Owner</th><th scope="col">Home market</th>
        <th scope="col">Priority</th><th scope="col">Status</th></tr></thead>
      <tbody>{data.locations.map(location => <tr key={location.id}>
        <th scope="row">{location.name}</th><td>{location.shop?.name ?? "GriipBuddy"}</td>
        <td>{markets[location.marketId].name}</td><td>{location.priority}</td><td>{location.active ? "Active" : "Inactive"}</td>
      </tr>)}</tbody>
    </table></div> : <p>No dispatch warehouses serve this market.</p>}
    {canCreate && <details>
      <summary>Add a dispatch warehouse</summary>
      <TaxonomyForm className="taxonomy-form" aria-label="Create dispatch warehouse" onSubmit={async event => {
        const form = event.currentTarget;
        const values = new FormData(form);
        const id = pendingId.current ?? crypto.randomUUID();
        pendingId.current = id;
        const saved = await operation.run(() => catalogRequest({ action: "inventory.warehouse.create", input: {
          id, marketId, name: values.get("name"), shopId: values.get("shopId") || null,
          priority: Number(values.get("priority")),
        } }, region), "Dispatch warehouse created.");
        if (saved) { pendingId.current = null; form.reset(); }
        return saved;
      }}>
        <p className="taxonomy-muted">Stock starts at zero. Open a pool for a SKU from its product’s Inventory panel.</p>
        <div className="taxonomy-fields">
          <label>Warehouse name<input name="name" required minLength={3} maxLength={80} /></label>
          <label>Stock owner<select name="shopId"><option value="">GriipBuddy</option>
            {data.sellers.map(seller => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
          </select></label>
          <label>Dispatch priority<input name="priority" type="number" defaultValue={100} min={0} max={1000} required /></label>
        </div>
        <button className="button primary" disabled={operation.pending}>
          {operation.pending ? "Creating…" : "Create warehouse"}
        </button>
        <TaxonomyFeedback {...operation} />
      </TaxonomyForm>
    </details>}
  </section></TaxonomyPendingChanges>;
}
