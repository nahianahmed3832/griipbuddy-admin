import Form from 'next/form';
import Link from 'next/link';
import { getRegion, url, type Session } from '@/lib/api';
import { connectedCatalog, connectedMarketplaceConfigured, mayManageConnectedMarketplace, mayReadConnectedMarketplace,
  mayUseConnectedMarketplaceOrders } from '@/lib/connected-catalog';
import { marketplaceWorkspacePath, sellerSearchLimit, type MarketplaceCheckoutPolicy, type MarketplaceSeller,
  type MarketplaceWorkspaceData } from '@/lib/connected-marketplace-contract';
import { marketplaceOrdersPath } from '@/lib/connected-order-contract';
import { param, type Query } from '@/lib/data';
import type { Region } from '@/lib/sections';
import { PageHeading } from './dashboard';
import { CheckoutPolicyActions, DeliveryZoneAction, SellerActions } from './marketplace-workspace-actions';
import styles from './marketplace-workspace.module.css';

export function marketplaceWorkspaceAvailable(auth: Session) {
  return connectedMarketplaceConfigured() && mayReadConnectedMarketplace(auth);
}

const currencyAmount = (market: MarketplaceWorkspaceData['market'], amount: number) => new Intl.NumberFormat(market.locale, {
  style: 'currency', currency: market.currency,
}).format(amount / 100);

const grantLabels = { PENDING: 'Pending', APPROVED: 'Approved', DENIED: 'Denied' };
const grantTones = { PENDING: 'amber', APPROVED: 'green', DENIED: 'red' };
const listingLabels = { DRAFT: 'Draft', ACTIVE: 'Active', ARCHIVED: 'Archived' };
const marketStatuses = { planned: 'Planned', staging: 'Staging', active: 'Active', paused: 'Paused' };
const paymentLabels = { COD: 'Cash on delivery', PAYPAL: 'PayPal', SSLCOMMERZ: 'SSLCOMMERZ' };

function StateBadge({ children, tone = 'purple' }: { children: string; tone?: string }) {
  return <span className={`badge ${tone}`}><span/>{children}</span>;
}

function MarketSettings({ data, region, canManage }: { data: MarketplaceWorkspaceData; region: Region; canManage: boolean }) {
  const { market, checkout, canConfigureCheckout } = data;
  return <div className={styles.overview}>
    <section className="panel" aria-labelledby="market-configuration">
      <div className="panel-header"><h2 id="market-configuration">Market configuration</h2>
        <StateBadge tone={market.status === 'active' ? 'green' : 'purple'}>{marketStatuses[market.status]}</StateBadge>
      </div>
      <dl className={styles.facts}>
        <div><dt>Currency</dt><dd>{market.currency}</dd></div>
        <div><dt>Locale</dt><dd>{market.locale}</dd></div>
        <div><dt>Time zone</dt><dd>{market.timeZone}</dd></div>
        <div><dt>Checkout</dt><dd>{market.checkoutAuthority === 'native' ? 'Marketplace' : 'Legacy handoff'}</dd></div>
        <div><dt>Delivery coverage</dt><dd>{market.deliveryCoverage === 'checkout-policy' ? 'Market delivery options' : 'Provider service'}</dd></div>
        <div><dt>Release order intake</dt><dd>{market.orderIntake ? 'Open' : 'Closed'}</dd></div>
      </dl>
      <div className={styles.paymentMethods}>
        <h3>Payment configuration</h3>
        {market.payments.length ? <ul>{market.payments.map(({ method, enabled }) => <li key={method}>
          <span>{paymentLabels[method]}</span>
          <StateBadge tone={enabled ? 'green' : 'purple'}>{enabled ? 'Enabled' : 'Disabled'}</StateBadge>
        </li>)}</ul> : <p className="muted">No payment methods are configured for this market.</p>}
      </div>
    </section>
    <section className="panel" aria-labelledby="market-checkout-policy">
      <div className="panel-header"><h2 id="market-checkout-policy">Checkout policy</h2>
        {canConfigureCheckout && checkout && <StateBadge tone={checkout.enabled ? 'green' : 'amber'}>
          {checkout.enabled ? 'Enabled' : 'Paused'}
        </StateBadge>}
      </div>
      {canConfigureCheckout && (checkout ? <CheckoutDetails checkout={checkout}/> : <p className="padded muted">
        No checkout policy exists for {market.name}.
      </p>)}
      {!canConfigureCheckout && <p className="padded muted">{market.checkoutAuthority === 'legacy-handoff'
        ? 'Checkout rules are managed by the legacy checkout.' : 'Checkout and delivery use this market’s provider configuration.'}</p>}
      {canManage && canConfigureCheckout && <CheckoutPolicyActions region={region} market={market.name} policy={checkout}
        orderIntake={market.orderIntake}/>}
    </section>
  </div>;
}

function CheckoutDetails({ checkout }: { checkout: MarketplaceCheckoutPolicy }) {
  return <dl className={styles.facts}>
    <div><dt>Cash on delivery</dt><dd>{checkout.codEnabled ? 'Allowed' : 'Disabled'}</dd></div>
    <div><dt>Merchandise tax rate</dt><dd>{checkout.taxBasisPoints === null ? 'Unconfigured' : `${checkout.taxBasisPoints / 100}%`}</dd></div>
    <div><dt>Tax label</dt><dd>{checkout.taxLabel || 'Unconfigured'}</dd></div>
  </dl>;
}

function SellerRow({ seller, market, region, canManage }: {
  seller: MarketplaceSeller; market: string; region: Region; canManage: boolean;
}) {
  return <tr>
    <td className="primary-cell">{seller.name}<div className="muted">{seller.slug}</div>
      {canManage && <details className={styles.manage}>
        <summary>Manage seller<span className={styles.visuallyHidden}> {seller.name}</span></summary>
        <SellerActions seller={seller} market={market} region={region}/>
      </details>}
    </td>
    <td><StateBadge tone={seller.grantStatus ? grantTones[seller.grantStatus] : 'purple'}>
      {seller.grantStatus ? grantLabels[seller.grantStatus] : 'No request'}
    </StateBadge></td>
    <td><StateBadge tone={seller.published ? 'green' : 'purple'}>{seller.published ? 'Published' : 'Unpublished'}</StateBadge></td>
    <td>{seller.listings.length ? <details className={styles.manage}>
      <summary>View listings<span className={styles.visuallyHidden}> for {seller.name}</span></summary>
      <ul className={styles.listings}>{seller.listings.map(listing => <li key={listing.id}>
        <span>{listing.name}</span> <StateBadge>{listingLabels[listing.publication]}</StateBadge>
      </li>)}</ul>
    </details> : <span className="muted">No listings</span>}</td>
  </tr>;
}

function SellerDirectory({ data, region, search, canManage }: {
  data: MarketplaceWorkspaceData; region: Region; search: string; canManage: boolean;
}) {
  const { market, sellers, page, pageCount, total, thirdPartyEnabled } = data;
  const pages = (next: number) => url(marketplaceWorkspacePath, { region, q: search, page: String(next) });
  return <section className="panel" aria-labelledby="market-sellers">
    <div className="panel-header"><div>
      <h2 id="market-sellers">Seller directory</h2>
      <p>Shop publication applies globally. Seller approvals and listings are scoped to {market.name}.</p>
    </div><span className="light-tag">{total} {total === 1 ? 'seller' : 'sellers'}</span></div>
    {!thirdPartyEnabled && <div className={styles.directoryNotice}>
      <p className="notice">Third-party seller management is paused for this release.</p>
    </div>}
    <Form action={marketplaceWorkspacePath} className="filters" scroll={false}>
      <input type="hidden" name="region" value={region}/>
      <label className="filter-label">Search sellers<input name="q" type="search" maxLength={sellerSearchLimit} defaultValue={search}
        placeholder="Shop name or slug"/></label>
      <button className="button primary" type="submit">Search</button>
      {search && <Link className="button secondary" href={url(marketplaceWorkspacePath, { region })}>Clear search</Link>}
    </Form>
    {sellers.length ? <div className="table-scroll"><table aria-label={`${market.name} sellers`}>
      <thead><tr><th scope="col">Shop</th><th scope="col">{market.name} approval</th><th scope="col">Global publication</th>
        <th scope="col">Recent market listings</th></tr></thead>
      <tbody>{sellers.map(seller => <SellerRow key={seller.id} seller={seller} market={market.name} region={region}
        canManage={canManage && thirdPartyEnabled}/>)}</tbody>
    </table></div> : <div className="empty"><p>
      {search ? 'No sellers match this search.' : `No sellers appear in the ${market.name} directory.`}
    </p></div>}
    {(pageCount > 1 || page > 1) && <nav className="pagination" aria-label="Seller pages">
      <span>Page {page}{pageCount >= page ? ` of ${pageCount}` : ''}</span>
      <div>
        {page > 1 && <Link className="button secondary" href={pages(page - 1)}>Previous</Link>}
        {page < pageCount && <Link className="button secondary" href={pages(page + 1)}>Next</Link>}
      </div>
    </nav>}
  </section>;
}

function DeliveryOptions({ data, region, canManage }: { data: MarketplaceWorkspaceData; region: Region; canManage: boolean }) {
  const { market, checkout, canConfigureCheckout } = data;
  const options = checkout?.deliveryZones ?? [];
  return <section className="panel" aria-labelledby="market-delivery-options">
    <div className="panel-header"><h2 id="market-delivery-options">Delivery options</h2></div>
    {!canConfigureCheckout && <p className="padded muted">{market.checkoutAuthority === 'legacy-handoff'
      ? 'Delivery coverage and rates are set by the legacy checkout.' : 'Delivery coverage and rates are set by the checkout provider.'}</p>}
    {canConfigureCheckout && <>
      {canManage && <div className={styles.configActions}><details className={styles.manage}>
        <summary>Add delivery option</summary>
        <DeliveryZoneAction region={region} currency={market.currency}/>
      </details></div>}
      {options.length ? <div className="table-scroll"><table aria-label={`${market.name} delivery options`}>
        <thead><tr><th scope="col">District</th><th scope="col">Option</th><th scope="col">Charge</th><th scope="col">Cash on delivery</th>
          <th scope="col">Status</th></tr></thead>
        <tbody>{options.map(zone => <tr key={`${zone.district}:${zone.method}`}>
          <td className="primary-cell">{zone.districtLabel}</td>
          <td>{zone.label}<div className="muted">{zone.method}</div>
            {canManage && <details className={styles.manage}>
              <summary>Edit<span className={styles.visuallyHidden}> {zone.districtLabel} {zone.label}</span></summary>
              <DeliveryZoneAction region={region} currency={market.currency} zone={zone}/>
            </details>}
          </td>
          <td>{zone.chargeMinor === null ? 'Unconfigured' : currencyAmount(market, zone.chargeMinor)}</td>
          <td>{zone.codEligible ? 'Eligible' : 'Ineligible'}</td>
          <td><StateBadge tone={zone.enabled ? 'green' : 'purple'}>{zone.enabled ? 'Enabled' : 'Disabled'}</StateBadge></td>
        </tr>)}</tbody>
      </table></div> : <div className="empty"><p>No delivery options have been configured for {market.name}.</p></div>}
    </>}
  </section>;
}

export async function MarketplaceWorkspace({ auth, region: selectedRegion, q }: { auth: Session; region: Region; q: Query }) {
  const region = getRegion(param(q, 'region') ?? selectedRegion, auth.staff);
  const search = (param(q, 'q') ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, sellerSearchLimit);
  const selected = param(q, 'page');
  const page = selected && /^[1-9]\d{0,4}$/.test(selected) ? Math.min(Number(selected), 10_000) : 1;
  const data = await connectedCatalog<MarketplaceWorkspaceData>(auth, region, {
    read: 'marketplace-workspace', page, ...(search && { q: search }),
  });
  const canManage = mayManageConnectedMarketplace(auth);
  return <div className={styles.workspace} key={region}>
    <PageHeading eyebrow="MARKETPLACE OPERATIONS" title={data.market.name}
      description="Manage sellers, checkout policy and delivery in the selected market.">
      {mayUseConnectedMarketplaceOrders(auth) && <Link className="button secondary"
        href={url(marketplaceOrdersPath, { region })}>Marketplace orders</Link>}
    </PageHeading>
    <MarketSettings data={data} region={region} canManage={canManage}/>
    <SellerDirectory data={data} region={region} search={search} canManage={canManage}/>
    <DeliveryOptions data={data} region={region} canManage={canManage}/>
  </div>;
}
