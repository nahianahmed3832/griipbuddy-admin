import Image from 'next/image';
import { ApiError, type Session, url, workspaceWritesEnabled } from '@/lib/api';
import { connectedCatalog, connectedCatalogMarket, mayReviewSellerListings } from '@/lib/connected-catalog';
import { catalogAssetPath } from '@/lib/connected-catalog-contract';
import { param, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import { superAdmin, type Region } from '@/lib/sections';
import { formatMoney, markets } from './connected-catalog-product/markets';
import { SellerListingDecisionForm } from './seller-listing-decision-form';
import { WorkspaceEmpty, WorkspaceHeading, WorkspaceStatus } from './workspace-screen';
import styles from './seller-listing-review.module.css';

type ReviewRow = {
  productId: string;
  revision: number;
  state: string;
  shopName: string;
  feedback: string | null;
  draft: { name: string; description: string; departmentId: string; image?: { src: string; alt: string } | null;
    variants: { sku: string; label: string; options: Record<string, string>; amountMinor: number | null; retired?: boolean }[] };
};

const labels: Record<string, string> = { SUBMITTED: 'Awaiting review', IN_REVIEW: 'Awaiting review',
  APPROVED: 'Approved · awaiting publication', PUBLISHED: 'Published', REJECTED: 'Changes requested', WITHDRAWN: 'Withdrawn' };

export async function SellerListingReviewWorkspace({ auth, region, q, production }: {
  auth: Session; region: Region; q: Query; production: boolean;
}) {
  if (!mayReviewSellerListings(auth)) throw new ApiError(403, 'Seller listing review access is unavailable.');
  const search = param(q, 'q')?.trim().slice(0, 120);
  const market = markets[connectedCatalogMarket(auth, region)];
  const rows = await connectedCatalog<ReviewRow[]>(auth, region, { read: 'seller-listing-reviews', q: search });
  const path = production ? '/dashboard/seller-listing-reviews' : '/desk/catalog/seller-listing-reviews';
  return <div className={styles.workspace}>
    <WorkspaceHeading title="Seller listing review" detail={`${market.name} · ${market.currency}`} />
    <section className="panel" aria-label="Review filters">
      <form action={adminPath(path)} className="filters">
        <input type="hidden" name="region" value={region}/>
        <label className="filter-label">Search listings<input type="search" name="q" defaultValue={search} maxLength={120} placeholder="Product or shop name"/></label>
        <button type="submit" className="button secondary">Search</button>
        {search && <a className="button secondary" href={adminPath(url(path, { region }))}>Clear</a>}
      </form>
    </section>
    {rows.length ? rows.map(row => {
      const awaiting = row.state === 'SUBMITTED' || row.state === 'IN_REVIEW';
      const approved = row.state === 'APPROVED';
      return <article className={`panel ${styles.card}`} key={row.productId}>
        <header className={styles.title}>
          <div><h2>{row.draft.name}</h2><p className="muted">{row.shopName} · Revision {row.revision}</p></div>
          <WorkspaceStatus tone={awaiting ? 'warning' : approved ? 'success' : row.state === 'REJECTED' ? 'danger' : 'neutral'}>
            {labels[row.state] ?? row.state}
          </WorkspaceStatus>
        </header>
        {row.draft.image && superAdmin(auth.staff) && catalogAssetPath(row.draft.image.src) && <Image
          className={styles.photo} width={192} height={144} unoptimized alt={row.draft.image.alt}
          src={adminPath(url('/api/connected-catalog', { asset: row.draft.image.src, region }))}/>}
        {row.draft.description && <p className={styles.description}>{row.draft.description}</p>}
        <dl className={styles.facts}>
          <div><dt>Category ID</dt><dd>{row.draft.departmentId}</dd></div>
          <div><dt>Image description</dt><dd>{row.draft.image?.alt || 'No image supplied'}</dd></div>
        </dl>
        <div className={`table-scroll ${styles.variants}`} tabIndex={0} role="region" aria-label={`Variants for ${row.draft.name}`}>
          <table><thead><tr><th scope="col">SKU</th><th scope="col">Options</th><th scope="col">{market.currency} price</th></tr></thead><tbody>
            {row.draft.variants.map(variant => <tr key={variant.sku}>
              <th scope="row">{variant.sku}</th><td>{Object.entries(variant.options).map(([name, value]) => `${name} ${value}`).join(' · ') || variant.label}</td>
              <td>{variant.retired ? 'Retiring' : variant.amountMinor === null ? 'Price missing' : formatMoney(variant.amountMinor, market)}</td>
            </tr>)}
          </tbody></table>
        </div>
        {row.feedback && <p className="notice">Seller feedback · {row.feedback}</p>}
        {(awaiting || approved) && workspaceWritesEnabled() && <SellerListingDecisionForm key={row.revision} region={region}
          productId={row.productId} revision={row.revision} approved={approved}/>}
      </article>;
    }) : <WorkspaceEmpty title="No listings in this review queue" detail={search ? 'Try a different name or search.' : 'Submitted listings for the active market appear here.'}/>}
  </div>;
}
