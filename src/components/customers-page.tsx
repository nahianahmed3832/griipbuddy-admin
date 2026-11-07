import Link from 'next/link';
import { ArrowLeft, ArrowRight, BadgeCheck, Download, MessageSquare, Search, ShieldCheck, ShoppingBag, UserRoundPlus, UsersRound } from 'lucide-react';
import { api, ApiError, canWrite, mongoId, url, type Session } from '@/lib/api';
import { customerDate, customerFilters, customerStatus, customerStatuses, customerTypes, customersPath,
  type Customer, type CustomerActivity, type CustomerOrder } from '@/lib/customers';
import { param, printable, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import { has, type Region } from '@/lib/sections';
import { PageHeading } from './dashboard';
import { Badge, Empty } from './tables';
import { CustomerActions, CustomerCreateForm, CustomerNote } from './customer-forms';

const apiRoot = '/customer-workspace';
const number = (n: number) => n.toLocaleString('en');
const accountType = (type?: string) => customerTypes.find(([key]) => key === type)?.[1] || type || 'Unknown';
const filters = (q: Query) => Object.fromEntries(customerFilters.map(key => [key, param(q, key)?.trim().slice(0, 100)]));
type Page = { total: number; page: number; size: number };
type Listing = Page & { rows: Customer[]; summary: { all: number; active: number; inactive: number; unverified: number } };
type Profile = Page & { customer: Customer; activity: CustomerActivity[] };
type Orders = Page & { orders: CustomerOrder[]; delivered: number; cancelled: number; lastOrder?: string; spending?: { _id: string; net: number; count: number }[] | null };

export function canCreateCustomer(auth: Session) {
  return canWrite(auth.staff) && ['user.view', 'user.create'].every(key => has(auth.staff, key));
}

function Avatar({ name }: { name?: string }) {
  const initials = name?.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]?.toLocaleUpperCase()).join('');
  return <span className="crm-avatar" aria-hidden="true">{initials || '–'}</span>;
}

function Tags({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null;
  return <ul className="crm-tags" aria-label="Customer tags">{tags.map(tag => <li key={tag}>{tag}</li>)}</ul>;
}

function Pager({ listing, href, label }: { listing: Page; href: (page: number) => string; label: string }) {
  const { page, size, total } = listing;
  const first = (page - 1) * size + 1;
  const last = Math.min(page * size, total);
  return total > 0 && <nav className="pagination crm-pagination" aria-label={label}>
    <span>{number(first)}–{number(last)} of {number(total)}</span>
    <div>{page > 1 && <Link className="button secondary" href={href(page - 1)}><ArrowLeft size={14}/> Previous</Link>}
      {last < total && <Link className="button secondary" href={href(page + 1)}>Next <ArrowRight size={14}/></Link>}</div>
  </nav>;
}

export async function CustomersPage({ auth, q, region }: { auth: Session; q: Query; region: Region }) {
  if (!has(auth.staff, 'user.view')) throw new ApiError(403);
  const filter = filters(q);
  const list = await api(url(apiRoot, { ...filter, region, page: param(q, 'page') }), auth.token) as Listing;
  const { summary } = list;
  const directory = { ...filter, region };
  const canViewOrders = has(auth.staff, 'order.view');
  const metricCards = [
    { label: 'Total accounts', value: summary.all, subtitle: 'Customer directory', Icon: UsersRound, tone: 'purple', filter: {} },
    { label: 'Active', value: summary.active, subtitle: 'Active account status', Icon: BadgeCheck, tone: 'green', filter: { status: 'ACTIVE' } },
    { label: 'Deactivated', value: summary.inactive, subtitle: 'Inactive account status', Icon: ShieldCheck, tone: 'blue', filter: { status: 'INACTIVE' } },
    { label: 'Unverified phones', value: summary.unverified, subtitle: 'Phone verification pending', Icon: MessageSquare, tone: 'amber', filter: { verification: 'unverified' } },
  ];
  return <>
    <PageHeading eyebrow="COMMERCE / CUSTOMER MANAGEMENT" title="Customers"
      description="Find customer accounts, review order history and keep track of support conversations.">
      {has(auth.staff, 'manage-permissions') && <a className="button secondary" href={adminPath(url('/api/customers', filter))} download>
        <Download size={15}/> Export Excel</a>}
      {canCreateCustomer(auth) && <Link className="button primary" href={url('/desk/customers/create', { region })}>
        <UserRoundPlus size={16}/> Create customer</Link>}
    </PageHeading>
    <div className="metric-grid crm-metrics" aria-label="Directory totals">
      {metricCards.map(({ label, value, subtitle, Icon, tone, filter: shortcut }) =>
        <Link className="panel metric crm-metric" key={label} href={url(customersPath, { region, ...shortcut })}>
          <span className="metric-top"><span className={'tile-icon ' + tone}><Icon size={18}/></span>{label}</span>
          <strong>{number(value)}</strong><small>{subtitle}</small>
        </Link>)}
    </div>
    <section className="panel crm-directory">
      <div className="panel-header"><div><h2>All customers</h2>
        <p>{number(list.total)} matching {list.total === 1 ? 'account' : 'accounts'} · Shared across markets</p></div></div>
      <form action={adminPath(customersPath)} className="crm-filters" key={JSON.stringify(directory)}>
        <input type="hidden" name="region" value={region}/>
        <label className="filter-label crm-search">Search
          <span className="search-input"><Search size={16}/><input name="q" type="search" maxLength={100} defaultValue={filter.q}
            placeholder="Name, phone, email or tag"/></span>
        </label>
        <label className="filter-label">Status<select name="status" defaultValue={filter.status || ''}><option value="">Any status</option>
          {customerStatuses.map(status => <option key={status} value={status}>{customerStatus(status).toLowerCase().replace(/^./, letter => letter.toUpperCase())}</option>)}
        </select></label>
        <label className="filter-label">Account type<select name="type" defaultValue={filter.type || ''}><option value="">Any type</option>
          {customerTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="filter-label">Phone verification<select name="verification" defaultValue={filter.verification || ''}>
          <option value="">Any verification</option><option value="verified">Verified</option><option value="unverified">Unverified</option>
        </select></label>
        <label className="filter-label">Sort<select name="sort" defaultValue={filter.sort || ''}>
          <option value="">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option>
        </select></label>
        <div className="crm-filter-actions"><button className="button primary">Apply filters</button>
          {Object.values(filter).some(Boolean) && <Link className="button subtle" href={url(customersPath, { region })}>Clear</Link>}</div>
      </form>
      {list.rows.length > 0 ? <div className="table-scroll"><table aria-label="Customer accounts" className="crm-table">
        <thead><tr><th scope="col">Customer</th><th scope="col">Account status</th><th scope="col">Account type</th>
          <th scope="col">Phone verification</th>
          {canViewOrders && <th scope="col">{region === 'BD' ? 'BD orders' : 'Intl. orders'}</th>}
          <th scope="col">Joined</th><th scope="col"><span className="crm-sr-only">Profile</span></th></tr></thead>
        <tbody>{list.rows.map(customer => {
          const profile = url(customersPath + '/' + customer._id, { ...directory, page: list.page > 1 ? String(list.page) : undefined });
          return <tr key={customer._id}>
            <td><div className="crm-identity"><Avatar name={customer.full_name}/><div>
              <Link className="table-link" href={profile}>{customer.full_name || 'Unnamed customer'}</Link>
              <small>{customer.phone_number || customer.email || 'No contact details'}</small><Tags tags={customer.workspace_tags}/>
            </div></div></td>
            <td><Badge value={customerStatus(customer.status)}/></td><td>{accountType(customer.userType)}</td>
            <td>{customer.is_verified_number ? <span className="crm-verified"><BadgeCheck size={15}/> Verified</span> : <span className="muted">Unverified</span>}</td>
            {canViewOrders && <td>{typeof customer.orderCount === 'number' ? number(customer.orderCount) : '—'}</td>}
            <td>{customerDate(customer.createdAt)}</td>
            <td><Link className="icon-button" href={profile} aria-label={'Open profile for ' + (customer.full_name || 'customer')}><ArrowRight size={16}/></Link></td>
          </tr>;
        })}</tbody>
      </table></div> : <Empty title="No customers match these filters" detail="Change the search or clear the filters to see the full directory."/>}
      <Pager listing={list} label="Customer pages" href={page => url(customersPath, { ...directory, page: String(page) })}/>
    </section>
  </>;
}

const activityLabels = { created: 'Customer created', edited: 'Profile updated', note: 'Staff note', status: 'Account status changed' };

export async function CustomerProfilePage({ auth, id, q, region }: { auth: Session; id: string; q: Query; region: Region }) {
  if (!has(auth.staff, 'user.view')) throw new ApiError(403);
  if (!mongoId(id)) throw new ApiError(404);
  const canEdit = canWrite(auth.staff) && has(auth.staff, 'user.update');
  const canViewOrders = has(auth.staff, 'order.view');
  const base = apiRoot + '/' + id;
  const [profile, orders] = await Promise.all([
    api(url(base, { page: param(q, 'activityPage') }), auth.token) as Promise<Profile>,
    canViewOrders ? (api(url(base + '/orders', { region, page: param(q, 'orderPage') }), auth.token) as Promise<Orders>).catch(() => null) : null,
  ]);
  const { customer } = profile;
  const market = region === 'INTERNATIONAL' ? 'International' : 'Bangladesh';
  const directory = { ...filters(q), region, page: param(q, 'page') };
  const path = customersPath + '/' + id;
  const profilePage = (pages: { orderPage?: string; activityPage?: string }) =>
    url(path, { ...directory, orderPage: param(q, 'orderPage'), activityPage: param(q, 'activityPage'), ...pages });
  return <>
    <div><Link className="button subtle crm-back" href={url(customersPath, directory)}><ArrowLeft size={15}/> Customer directory</Link></div>
    <PageHeading eyebrow="COMMERCE / CUSTOMER PROFILE" title={customer.full_name || 'Customer profile'}
      description="Contact details, linked website orders and internal activity.">
      {canEdit && <CustomerActions customer={customer}/>}
    </PageHeading>
    <div className="crm-profile-layout">
      <section className="panel crm-contact">
        <div className="panel-header"><Avatar name={customer.full_name}/><div><h2>Account details</h2><p>{accountType(customer.userType)} account</p></div></div>
        <dl className="crm-contact-list padded">
          <div><dt>Account status</dt><dd><Badge value={customerStatus(customer.status)}/></dd></div>
          <div><dt>Phone</dt><dd>{customer.phone_number || '—'} <small className="muted">{customer.is_verified_number ? 'Verified' : 'Unverified'}</small></dd></div>
          <div><dt>Email</dt><dd>{customer.email || '—'}</dd></div>
          <div><dt>Joined</dt><dd>{customerDate(customer.createdAt)}</dd></div>
          <div><dt>Customer ID</dt><dd className="crm-id">{customer._id}</dd></div>
          <div><dt>Tags</dt><dd>{customer.workspace_tags?.length ? <Tags tags={customer.workspace_tags}/> : '—'}</dd></div>
        </dl>
      </section>
      <div className="crm-profile-main">
        {canViewOrders && <section className="panel" id="customer-orders">
          <div className="panel-header"><div><h2>Website order history</h2><p>{market} · Orders linked to this account</p></div>
            <span className="tile-icon purple"><ShoppingBag size={17}/></span></div>
          {orders ? <>
            <dl className="crm-order-metrics">
              <div><dt>Orders</dt><dd>{number(orders.total)}</dd></div><div><dt>Delivered</dt><dd>{number(orders.delivered)}</dd></div>
              <div><dt>Cancelled</dt><dd>{number(orders.cancelled)}</dd></div><div><dt>Last order</dt><dd>{customerDate(orders.lastOrder)}</dd></div>
            </dl>
            {orders.spending !== undefined && <div className="crm-spending">
              <strong>Recorded customer spending</strong>
              <p className="muted">Posted payments less posted refunds on linked website orders.</p>
              {orders.spending === null ? <p>Payment records are temporarily unavailable.</p> : orders.spending.length ? <dl>{orders.spending.map(item => <div key={item._id}>
                <dt>{item._id}</dt><dd>{printable(item.net, 'money', item._id)}</dd>
              </div>)}</dl> : <p>No posted payments or refunds in this region.</p>}
            </div>}
            {orders.orders.length > 0 ? <div className="table-scroll"><table aria-label="Linked website orders">
              <thead><tr><th scope="col">Order</th><th scope="col">Placed</th><th scope="col">Status</th><th scope="col">Order total</th></tr></thead>
              <tbody>{orders.orders.map(order => <tr key={order._id}>
                <td><Link className="table-link" href={url('/desk/orders/orders/' + order._id, { region })}>
                  {order.order_serial_id ? '#' + order.order_serial_id : order.invoice_number || 'Open order'}</Link></td>
                <td>{customerDate(order.order_date || order.createdAt)}</td><td><Badge value={order.status || 'Unknown'}/></td>
                <td>{printable(order.total_amount, 'money', order.currency || (region === 'BD' ? 'BDT' : 'USD')) || '—'}</td>
              </tr>)}</tbody>
            </table></div> : <Empty title="No linked website orders" detail="Orders linked to this account in the selected market will appear here."/>}
            <Pager listing={orders} label="Order pages" href={page => profilePage({ orderPage: String(page) }) + '#customer-orders'}/>
          </> : <p className="padded muted">Order history is temporarily unavailable.</p>}
        </section>}
        <section className="panel" id="customer-activity">
          <div className="panel-header"><div><h2>Staff activity</h2><p>Internal notes and account changes · Dhaka time</p></div>
            <span className="tile-icon green"><MessageSquare size={17}/></span></div>
          {canEdit && <CustomerNote id={id} activityPath={profilePage({ activityPage: undefined }) + '#customer-activity'} page={profile.page}/>}
          {profile.activity.length > 0 ? <ol className="crm-timeline">{profile.activity.map(event =>
            <li key={event._id}><span className="crm-timeline-dot" aria-hidden="true"/><div>
              <div className="crm-event"><strong>{activityLabels[event.kind]}</strong><time dateTime={event.createdAt}>{customerDate(event.createdAt, true)}</time></div>
              <p>{event.detail}</p><small className="muted">{event.actorName || 'Staff member'}</small>
            </div></li>)}</ol> : <p className="padded muted">No staff activity recorded yet.</p>}
          <Pager listing={profile} label="Activity pages" href={page => profilePage({ activityPage: String(page) }) + '#customer-activity'}/>
        </section>
      </div>
    </div>
  </>;
}

export function CustomerCreatePage({ auth, region }: { auth: Session; region: Region }) {
  if (!canCreateCustomer(auth)) throw new ApiError(403);
  return <>
    <div><Link className="button subtle crm-back" href={url(customersPath, { region })}><ArrowLeft size={15}/> Customer directory</Link></div>
    <PageHeading eyebrow="COMMERCE / CUSTOMER MANAGEMENT" title="Create customer"
      description="Add a customer record using a Bangladesh mobile number."/>
    <CustomerCreateForm region={region}/>
  </>;
}
