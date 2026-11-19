"use client";

import type { PublicationState } from "./contracts";
import { runCatalogCommand, TaxonomyFeedback, useConfirmTaxonomyNavigation, useTaxonomyOperation } from "./taxonomy-controls";

const labels = { ACTIVE: "Published", DRAFT: "Draft", ARCHIVED: "Archived" };

export function ConnectedProductPublication({ productId, publication, revision, readiness }: {
  productId: string; publication: PublicationState; revision: number;
  readiness: { ready: boolean; issues: string[] } | null;
}) {
  const operation = useTaxonomyOperation();
  const confirm = useConfirmTaxonomyNavigation();
  async function change(next: PublicationState) {
    if (!confirm() || (next === "ARCHIVED" && !window.confirm("Archive this product? Its variants and purchased order history will be retained."))) return;
    await operation.run(() => runCatalogCommand("product.publish", { productId, revision, publication: next }),
      next === "ACTIVE" ? "Product published." : next === "ARCHIVED" ? "Product archived." : "Product moved to draft.");
  }

  return <section className="taxonomy-card" id="publication" aria-labelledby="publication-heading">
    <div className="taxonomy-card-heading">
      <h2 id="publication-heading">Publication</h2>
      <span className="taxonomy-badge" data-state={publication.toLowerCase()}>{labels[publication]}</span>
    </div>
    {publication === "ARCHIVED" ? <p className="taxonomy-muted">Archived catalog records remain linked to past purchases.</p> : <>
      <p className="taxonomy-muted">Shared publication exposes variants through their approved market offers. A stock count of zero is allowed.</p>
      {readiness?.ready ? <p className="taxonomy-success">Ready to publish.</p> : readiness &&
        <details open={publication === "DRAFT"}>
          <summary>{readiness.issues.length} publication {readiness.issues.length === 1 ? "item needs" : "items need"} review</summary>
          <ul className="product-workspace-checklist">{readiness.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
        </details>}
      <div className="taxonomy-actions">
        {publication === "DRAFT" && <button className="button button--primary" type="button"
          disabled={operation.pending || !readiness?.ready} onClick={() => void change("ACTIVE")}>Publish product</button>}
        {publication === "ACTIVE" && <button className="button button--outline" type="button" disabled={operation.pending}
          onClick={() => void change("DRAFT")}>Move to draft</button>}
        <button className="button button--outline" type="button" disabled={operation.pending}
          onClick={() => void change("ARCHIVED")}>Archive product</button>
      </div>
      <TaxonomyFeedback {...operation} />
    </>}
  </section>;
}
