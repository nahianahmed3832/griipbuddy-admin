import Link from 'next/link';
import { workspaceWritesEnabled, url, type Session } from '@/lib/api';
import { connectedCatalog, connectedCatalogMarket } from '@/lib/connected-catalog';
import { sellerHubSections, type SellerHubSection } from '@/lib/connected-catalog-contract';
import { param, type Query } from '@/lib/data';
import { orderIdentifier } from '@/lib/connected-order-contract';
import type { Region } from '@/lib/sections';
import { ConnectedSellerCommandForm } from './connected-seller-command-form';
import styles from './connected-seller-operations.module.css';

type RecordView = {
  id: string; kind: 'NOTICE' | 'REQUEST' | 'CAMPAIGN' | 'CONVERSATION'; title: string; body: string; shopName: string | null;
  scope: 'PLATFORM' | 'SHOP' | 'MARKET'; status: string; reference: string | null;
  posts: { id: string; from: 'STAFF' | 'SELLER'; text: string }[];
};
type HubData = { rows: RecordView[]; detail: RecordView | null; shops: { id: string; name: string }[]; hasNext: boolean };
type VerificationData = {
  form: { version: number; fields: string[] } | null;
  rows: { id: string; version: number; state: string; answers: Record<string, string>; note: string | null; grant: { shop: { name: string } } }[];
  hasNext: boolean;
};
const titles: Record<SellerHubSection, string> = {
  notices: 'Notices', requests: 'Requests', campaigns: 'Campaign invitations', conversations: 'Conversations',
};
const fieldLabels: Record<string, string> = { businessName: 'Business name', website: 'Public website', summary: 'What your business sells' };

function Subtitle({ item, market }: { item: RecordView; market: string }) {
  return <p>{item.shopName ?? (item.scope === 'PLATFORM' ? 'Platform-wide' : market)} · {item.status.toLowerCase()}</p>;
}

export async function ConnectedSellerOperations({ auth, region, query, kind, production }: {
  auth: Session; region: Region; query: Query; kind: 'seller-hub' | 'seller-verification'; production: boolean;
}) {
  const market = connectedCatalogMarket(auth, region) === 'bd' ? 'Bangladesh' : 'United States';
  const rawPage = param(query, 'page') ?? '';
  const page = /^[1-9]\d{0,3}$/.test(rawPage) ? Number(rawPage) : 1;
  const path = production ? '/dashboard/' + kind : '/desk/staff/' + kind;
  const canWrite = workspaceWritesEnabled();
  const heading = kind === 'seller-hub' ? 'Seller Hub' : 'Seller verification';
  if (kind === 'seller-verification') {
    const data = await connectedCatalog<VerificationData>(auth, region, { read: kind, page });
    return <div className={styles.workspace}>
      <header><h1>{heading}</h1><p>{market} · Test review</p></header>
      <section className="panel padded"><h2>Verification form</h2>
        <p>{data.form ? 'Published version ' + data.form.version : 'No verification form is published.'}</p>
        {canWrite && <ConnectedSellerCommandForm region={region} action="verification.form" key={data.form?.version}
          values={{ previousVersion: data.form?.version ?? 0 }} label="Publish test form">
          {Object.entries(fieldLabels).map(([field, label]) => <label key={field}>
            <input type="checkbox" name="fields" value={field} defaultChecked={data.form?.fields.includes(field) ?? field === 'businessName'}/>{label}
          </label>)}
        </ConnectedSellerCommandForm>}
      </section>
      <section className="panel padded"><h2>Business submissions</h2>
        {!data.rows.length && <p>No submissions for this market.</p>}
        <ul className={styles.list}>{data.rows.map(row => <li key={row.id}>
          <strong>{row.grant.shop.name}</strong><p>Form {row.version} · {row.state.toLowerCase()}</p>
          <dl>{Object.entries(row.answers).flatMap(([field, value]) => Object.hasOwn(fieldLabels, field) ?
            [<div key={field}><dt>{fieldLabels[field]}</dt><dd>{value}</dd></div>] : [])}</dl>
          {row.note && <p>{row.note}</p>}
          {canWrite && row.state === 'SUBMITTED' && <ConnectedSellerCommandForm region={region} action="verification.review"
            values={{ id: row.id }} label="Save review">
            <label>Decision<select name="decision"><option value="ACCEPTED">Accept test verification</option><option value="DECLINED">Request revision</option></select></label>
            <label>Message to seller<textarea name="note" maxLength={400} required rows={2}/></label>
          </ConnectedSellerCommandForm>}
        </li>)}</ul>
        <nav className={styles.tabs} aria-label="Verification pages">
          {page > 1 && <Link className="button secondary" href={url(path, { region, page: String(page - 1) })}>Previous page</Link>}
          {data.hasNext && <Link className="button secondary" href={url(path, { region, page: String(page + 1) })}>Next page</Link>}
        </nav>
      </section>
    </div>;
  }

  const section = sellerHubSections.find(item => item === param(query, 'tab')) ?? 'notices';
  const id = param(query, 'id') ?? param(query, 'template') ?? '';
  const q = param(query, 'q')?.trim().slice(0, 80) ?? '';
  const data = await connectedCatalog<HubData>(auth, region, { read: 'seller-hub', section, page, ...(q && { q }),
    ...(orderIdentifier.test(id) && { id }) });
  const selected = param(query, 'id') && data.detail;
  const template = param(query, 'template') && !param(query, 'id') && data.detail?.kind === 'NOTICE' ? data.detail : null;
  const href = (tab: SellerHubSection, extra?: Record<string, string>) => url(path, { region, tab, ...(q && { q }), ...extra });

  return <div className={styles.workspace}>
    <header><h1>{heading}</h1><p>{market}</p></header>
    <nav className={styles.tabs} aria-label="Seller Hub sections">
      {sellerHubSections.map(tab => <Link key={tab} className={'button ' + (tab === section ? 'primary' : 'secondary')}
        aria-current={tab === section ? 'page' : undefined} href={href(tab)}>{titles[tab]}</Link>)}
    </nav>
    {canWrite && section !== 'requests' && <section className="panel padded">
      <h2>{section === 'notices' ? 'Publish notice' : section === 'campaigns' ? 'Invite a seller' : 'Start conversation'}</h2>
      <form method="get" className="filters"><input type="hidden" name="region" value={region}/><input type="hidden" name="tab" value={section}/>
        <label className="filter-label">Find approved sellers<input type="search" name="q" maxLength={80} defaultValue={q}/></label>
        <button className="button secondary">Find sellers</button>
      </form>
      <ConnectedSellerCommandForm key={section + (template?.id ?? '')} region={region}
        action={section === 'notices' ? 'notice.publish' : section === 'campaigns' ? 'campaign.invite' : 'conversation.start'}
        label={section === 'notices' ? 'Publish in Seller Hub' : section === 'campaigns' ? 'Save invitation' : 'Save conversation'}>
        {section === 'notices' && <label>Recipient scope<select name="scope">
          <option value="MARKET">All approved sellers in this market</option><option value="SHOP">One approved seller</option>
          <option value="PLATFORM">All approved markets</option>
        </select></label>}
        <label>Seller organization<select name="shopId" required={section !== 'notices'}>
          <option value="">Choose an approved seller</option>
          {data.shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
        </select></label>
        {section === 'campaigns' && <label>Existing promotion code<input name="reference" required maxLength={60}/></label>}
        <label>Title<input name="title" required maxLength={120} defaultValue={template?.title}/></label>
        <label>{section === 'conversations' ? 'Message' : 'Details'}<textarea name={section === 'conversations' ? 'text' : 'body'}
          rows={4} required maxLength={1800} defaultValue={template?.body}/></label>
      </ConnectedSellerCommandForm>
      <p>Updates are saved in Seller Hub. External message delivery is separate.</p>
    </section>}
    {selected && <section className="panel padded">
      <h2>{selected.title}</h2><Subtitle item={selected} market={market}/>
      {selected.body && <p>{selected.body}</p>}{selected.reference && <p>Campaign {selected.reference}</p>}
      <ol className={styles.list}>{selected.posts.map(post => <li key={post.id}>
        <strong>{post.from === 'STAFF' ? 'Staff' : 'Seller'}</strong>{post.text}
      </li>)}</ol>
      {canWrite && selected.kind === 'CONVERSATION' &&
        <ConnectedSellerCommandForm region={region} action="conversation.reply" values={{ id: selected.id }} label="Save reply">
          <label>Reply<textarea required name="text" rows={3} maxLength={1800}/></label>
        </ConnectedSellerCommandForm>}
      {canWrite && selected.kind === 'REQUEST' && selected.status === 'OPEN' &&
        <ConnectedSellerCommandForm region={region} action="request.review" values={{ id: selected.id }} label="Save decision">
          <label>Decision<select name="decision"><option value="ACCEPTED">Accept for follow-up</option><option value="DECLINED">Decline</option></select></label>
          <label>Decision note<textarea required name="note" rows={3} maxLength={500}/></label>
        </ConnectedSellerCommandForm>}
    </section>}
    {id && param(query, 'id') && !selected && <p role="status">This record is unavailable in the selected market.</p>}
    <section className="panel padded"><h2>{titles[section]}</h2>
      {!data.rows.length && <p>No records for this market.</p>}
      <ul className={styles.list}>{data.rows.map(item => <li key={item.id}>
        <strong><Link href={href(section, { id: item.id })}>{item.title}</Link></strong><Subtitle item={item} market={market}/>
        {canWrite && item.kind === 'NOTICE' && <Link href={href(section, { template: item.id })}>Use as draft</Link>}
      </li>)}</ul>
      <nav aria-label="Seller Hub pages" className={styles.tabs}>
        {page > 1 && <Link className="button secondary" href={href(section, { page: String(page - 1) })}>Previous page</Link>}
        {data.hasNext && <Link className="button secondary" href={href(section, { page: String(page + 1) })}>Next page</Link>}
      </nav>
    </section>
  </div>;
}
