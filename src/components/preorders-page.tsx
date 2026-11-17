import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { api, ApiError, arr, mongoId, obj, str, type Session } from '@/lib/api';
import { param, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import { preOrderAccess } from '@/lib/preorders-server';
import { addressLabel, money, orderDate } from '@/lib/website-orders';
import {
  inboundPreOrderStatuses, outboundPreOrderStatuses, preOrderActionStatus, preOrderApiParams, preOrderFilterKeys, preOrderItems,
  preOrderNumber, preOrderProduct, preOrderQuery, preOrderRequestUrl, preOrderStatuses, preOrdersPath,
  preOrderUrl, productionPreOrderSizes, productionPreOrdersPath, statusText, type PreOrderRow,
} from '@/lib/preorders';
import type { Region } from '@/lib/sections';
import { PageHeading } from './dashboard';
import { Badge } from './tables';
import { PreOrderDetailActions } from './preorders-actions';
import { PreOrderForm } from './preorders-form';
import { PreOrdersTable } from './preorders-table';
import { ProductionPreOrderDetail } from './preorders-production-detail';
import { ProductionPreOrdersIndex } from './preorders-production-index';
import styles from './preorders.module.css';

const root = '/pre-order';
const defaultPageSize = 20;

export async function PreOrdersPage({ auth, q, region, view, productionLayout = false }: {
  auth: Session; q: Query; region: Region; view: string[]; productionLayout?: boolean;
}) {
  const access = preOrderAccess(auth, region);
  const loadMedia = async () => str(obj(await api(root + '/workspace/media-origin', auth.token)).origin);
  const id = view[1];
  if (id === 'create') {
    if (!access.create) throw new ApiError(403);
    if (productionLayout) return <div className={`${styles.production} ${styles.formPage}`}>
      <h1>Create Pre-Order</h1><PreOrderForm allowProducts={access.products} productionLayout mediaOrigin={await loadMedia()}/>
    </div>;
    return <div className={styles.workspace}>
      <PageHeading eyebrow="COMMERCE / PRE-ORDERS" title="Create pre-order" description="Add catalog items or external references, delivery information, and the initial quote." />
      <PreOrderForm allowProducts={access.products} />
    </div>;
  }
  if (id) {
    if (!mongoId(id)) throw new ApiError(404);
    const item = await api(root + '/' + id, auth.token) as PreOrderRow;
    if (param(q, 'edit') === '1') {
      if (!access.update) throw new ApiError(403);
      if (productionLayout) return <div className={`${styles.production} ${styles.formPage}`}>
        <header className={styles.inline}><Link href={productionPreOrdersPath + '/' + id} className={styles.iconButton}
          aria-label="Back to pre-order"><ArrowLeft size={16}/></Link><h1>Edit {preOrderNumber(item)}</h1></header>
        <PreOrderForm row={item} allowProducts={access.products} productionLayout mediaOrigin={await loadMedia()}/>
      </div>;
      return <div className={styles.workspace}>
        <PageHeading eyebrow="COMMERCE / PRE-ORDERS" title={'Edit ' + preOrderNumber(item)} description="Update products, customer, delivery, quote, and batch information." />
        <PreOrderForm row={item} allowProducts={access.products} />
      </div>;
    }
    const mediaOrigin = await loadMedia();
    if (productionLayout) return <ProductionPreOrderDetail row={item} update={access.update} mediaOrigin={mediaOrigin}
      batches={access.update ? arr(await api(root + '/batches', auth.token)).map(str).filter(Boolean) : []}/>;
    return <PreOrderDetail row={item} update={access.update} remove={access.remove} mediaOrigin={mediaOrigin} />;
  }

  const filterInput = Object.fromEntries(preOrderFilterKeys.map(key => [key, param(q, key)]));
  const filters = preOrderQuery({ ...filterInput, q: filterInput.q ?? (productionLayout ? param(q, 'searchQuery') : undefined),
    status: filterInput.status ?? param(q, 'filter') });
  const upstream = preOrderApiParams(filters);
  const page = Math.max(1, Math.min(10000, Number.parseInt(param(q, 'page') ?? '', 10) || 1));
  const pageSize = productionLayout ? productionPreOrderSizes.find(size => String(size) === param(q, 'limit')) ?? defaultPageSize : defaultPageSize;
  const [listing, counts, batchData, creators, mediaOrigin] = await Promise.all([
    api(preOrderUrl(root, { ...upstream, page: String(page), limit: String(pageSize) }), auth.token),
    api(preOrderUrl(root + '/status/count', { batch: filters.batch, startDate: filters.from, endDate: filters.to }), auth.token),
    api(root + '/batches', auth.token),
    productionLayout ? [] : api(root + '/workspace/creators', auth.token),
    productionLayout ? loadMedia() : '',
  ]);
  const rows = arr(obj(listing).data) as PreOrderRow[];
  const total = Number(obj(obj(listing).meta).total) || 0;
  const batches = arr(batchData).map(str).filter(Boolean);
  const count = (status: string) => Number(obj(counts)[status]) || 0;
  if (productionLayout) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
    return <ProductionPreOrdersIndex rows={rows} total={total} filters={filters} counts={Object.fromEntries(['ALL', ...preOrderStatuses].map(status => [status, count(status)]))}
      batches={batches} access={access} page={page} pageSize={pageSize} mediaOrigin={mediaOrigin} today={today}/>;
  }
  const destinations = [
    { title: 'All', status: undefined, count: count('ALL') },
    { title: 'China to Bangladesh', status: inboundPreOrderStatuses.join(','), count: inboundPreOrderStatuses.reduce((n, status) => n + count(status), 0) },
    { title: 'Bangladesh to customer', status: outboundPreOrderStatuses.join(','), count: outboundPreOrderStatuses.reduce((n, status) => n + count(status), 0) },
    { title: 'Cancelled, returned, and on hold', status: preOrderStatuses.slice(10).join(','), count: preOrderStatuses.slice(10).reduce((n, status) => n + count(status), 0) },
  ];
  return <div className={styles.workspace}>
    <PageHeading eyebrow="COMMERCE / PRE-ORDERS" title="Pre-orders" description="Track quotes, advance payments, import batches, and deliveries.">
      {access.create && <Link href={preOrdersPath + '/create'} className="button primary">Create pre-order</Link>}
    </PageHeading>
    <nav className="tabs" aria-label="Pre-order phases">
      {destinations.map(target => <Link key={target.title} href={preOrderUrl(preOrdersPath, { ...filters, status: target.status })}
        aria-current={filters.status === target.status ? 'page' : undefined}>{target.title} ({target.count})</Link>)}
    </nav>
    <form className="panel filters" action={adminPath(preOrdersPath)}>
      <label>Search<input name="q" defaultValue={filters.q} placeholder="Pre-order, customer, tracking, or product" maxLength={100} /></label>
      <label>Pre-order status<select name="status" defaultValue={filters.status ?? ''}>
        <option value="">All statuses</option>
        <option value={preOrderActionStatus}>Action required</option>
        {destinations.slice(1).map(target => <option key={target.title} value={target.status}>{target.title}</option>)}
        {preOrderStatuses.map(status => <option key={status} value={status}>{statusText(status)} ({count(status)})</option>)}
      </select></label>
      <label>Batch<select name="batch" defaultValue={filters.batch ?? ''}>
        <option value="">All batches</option>
        {batches.map(batch => <option key={batch} value={batch}>{batch}</option>)}
      </select></label>
      <label>Product source<select name="source" defaultValue={filters.source ?? ''}>
        <option value="">All sources</option><option value="LISTED">Catalog item</option><option value="EXTERNAL">External reference</option>
      </select></label>
      <label>Created by<select name="creator" defaultValue={filters.creator ?? ''}>
        <option value="">All creators</option>
        {arr(creators).map(obj).map(creator => <option key={str(creator._id)} value={str(creator._id)}>{str(creator.name)}</option>)}
      </select></label>
      <label>Start date<input name="from" type="date" defaultValue={filters.from} /></label>
      <label>End date<input name="to" type="date" defaultValue={filters.to} /></label>
      <label>Order date<select name="sort" defaultValue={filters.sort ?? ''}>
        <option value="">Newest first</option><option value="asc">Oldest first</option>
      </select></label>
      <button className="button primary">Apply filters</button>
      <Link href={preOrdersPath} className="button subtle">Reset</Link>
      <a className="button secondary" href={preOrderRequestUrl('export', filters)}>Download Excel</a>
    </form>
    <PreOrdersTable key={preOrderUrl('', { ...filters, page: String(page) })} rows={rows} total={total} batches={batches} canUpdate={access.update} />
    <div className="pagination"><span>Page {page}</span><div>
      {page > 1 && <Link className="button secondary" href={preOrderUrl(preOrdersPath, { ...filters, page: String(page - 1) })}>Previous</Link>}
      {page * pageSize < total && <Link className="button secondary" href={preOrderUrl(preOrdersPath, { ...filters, page: String(page + 1) })}>Next</Link>}
    </div></div>
  </div>;
}

function safeLink(value?: string) {
  try { const parsed = new URL(value ?? ''); return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : undefined; }
  catch { return undefined; }
}

function mediaLink(value: string | undefined, origin: string, allowExternal = false) {
  if (!value) return undefined;
  const absolute = safeLink(value);
  if (absolute) return allowExternal || origin && new URL(absolute).origin === new URL(origin).origin ? absolute : undefined;
  const path = value.replace(/^\//, '');
  if (!origin || !/^(?:[a-z\d_-]+\/)+[a-z\d_.-]+$/i.test(path) || path.split('/').some(part => part === '.' || part === '..')) return undefined;
  return origin + '/' + path;
}

function PreOrderDetail({ row, update, remove, mediaOrigin }: { row: PreOrderRow; update: boolean; remove: boolean; mediaOrigin: string }) {
  const statusHistory = row.status_history ?? [];
  const advanceFiles = (row.advance_payment_info?.files ?? []).map(file => mediaLink(file, mediaOrigin)).filter((file): file is string => Boolean(file));
  return <div className={styles.workspace}>
    <PageHeading eyebrow="COMMERCE / PRE-ORDERS" title={preOrderNumber(row)} description={orderDate(row.createdAt, 'BD')}>
      <Link href={preOrdersPath} className="button secondary">Back to pre-orders</Link>
      {update && <Link href={preOrdersPath + '/' + row._id + '?edit=1'} className="button primary">Edit pre-order</Link>}
    </PageHeading>
    <div className="overview-grid">
      <section className="panel padded"><h2>Customer and delivery</h2>
        <dl className="details-grid">
          <dt>Name</dt><dd>{row.customer_name || '—'}</dd><dt>Phone</dt><dd>{row.customer_phone || '—'}</dd>
          <dt>Secondary phone</dt><dd>{row.customer_secondary_phone || '—'}</dd><dt>Email</dt><dd>{row.customer_email || '—'}</dd>
          <dt>Delivery address</dt><dd>{addressLabel(row.delivery_address) || '—'}</dd><dt>Customer note</dt><dd>{row.customer_note || '—'}</dd>
          <dt>Created by</dt><dd>{row.created_by?.full_name || row.order_by || '—'}</dd><dt>Batch</dt><dd>{row.batch || '—'}</dd>
          <dt>Status</dt><dd><Badge value={row.status || 'Requested'} /></dd><dt>Tracking code</dt><dd>{row.tracking_code || '—'}</dd>
          <dt>Consignment</dt><dd>{row.consignment_id || '—'}</dd><dt>Courier note</dt><dd>{row.courier_note || '—'}</dd>
          <dt>Estimated delivery</dt><dd>{row.estimated_delivery_time || '—'}</dd>
        </dl>
      </section>
      <section className="panel padded"><h2>Quote and payments</h2>
        <dl className="details-grid">
          <dt>Quoted products</dt><dd>{money(row.quoted_total, 'BDT')}</dd>
          <dt>Delivery charge</dt><dd>{money(row.delivery_charge, 'BDT')}</dd>
          <dt>Order total</dt><dd>{money(row.total_amount, 'BDT')}</dd>
          <dt>Advance required</dt><dd>{money(row.advance_amount, 'BDT')}</dd>
          <dt>Paid</dt><dd>{money(row.paid_amount, 'BDT')}</dd>
          <dt>Due</dt><dd>{money(row.due_amount, 'BDT')}</dd>
          <dt>Advance status</dt><dd>{row.advance_paid ? 'Received' : 'Not received'}</dd>
          {row.advance_payment_info && <>
            <dt>Method</dt><dd>{row.advance_payment_info.method || '—'}</dd>
            <dt>Sender</dt><dd>{row.advance_payment_info.sender_number || '—'}</dd>
            <dt>Transaction ID</dt><dd>{row.advance_payment_info.trxId || '—'}</dd>
            <dt>Received by</dt><dd>{row.advance_payment_info.received_by?.full_name || '—'}</dd>
          </>}
        </dl>
        {!!advanceFiles.length && <ul>{advanceFiles.map((file, index) => <li key={file + index}>
          <a className="table-link" href={file} target="_blank" rel="noreferrer">Advance proof {index + 1}</a>
        </li>)}</ul>}
      </section>
    </div>
    <section className="panel padded stack"><h2>Products</h2>
      {preOrderItems(row).map((item, index) => {
        const link = safeLink(item.reference?.product_link);
        const referenceImages = (item.reference?.images ?? []).map(image => mediaLink(image, mediaOrigin, true)).filter((image): image is string => Boolean(image));
        const productImage = mediaLink(item.variant?.image || item.product_image, mediaOrigin, true);
        return <div key={index} className="panel padded">
          <h3>{preOrderProduct(item)} × {item.quantity ?? 1}</h3>
          <p>{item.source_type === 'LISTED' ? 'Catalog item' : 'External reference'}{item.variant?.sku && ' · ' + item.variant.sku}
            {item.reference?.color && ' · ' + item.reference.color}{item.reference?.size && ' · ' + item.reference.size}</p>
          {!!Object.keys(item.variant?.attribute_values ?? {}).length && <p>{Object.entries(item.variant?.attribute_values ?? {}).map(([key, value]) => key + ': ' + value).join(' · ')}</p>}
          {item.reference?.notes && <p>{item.reference.notes}</p>}
          {item.quoted_unit_price !== undefined && <p>Quoted unit price {money(item.quoted_unit_price, 'BDT')}</p>}
          {link && <p><a className="table-link" href={link} target="_blank" rel="noreferrer">Open product reference</a></p>}
          {productImage && <p><a className="table-link" href={productImage} target="_blank" rel="noreferrer">View product image</a></p>}
          {!!referenceImages.length && <ul>{referenceImages.map((image, index) => <li key={image + index}>
            <a className="table-link" href={image} target="_blank" rel="noreferrer">Reference image {index + 1}</a>
          </li>)}</ul>}
        </div>;
      })}
    </section>
    <section className="panel padded stack"><h2>Payment receipts</h2>
      {row.payment_receipts?.length ? <ul>{row.payment_receipts.map((receipt, index) => {
        const href = receipt.file?.startsWith('workspace/') && receipt._id
          ? preOrderRequestUrl('receipt', { id: row._id, receipt: receipt._id })
          : mediaLink(receipt.file, mediaOrigin);
        return <li key={receipt._id || index}>
          {href ? <a className="table-link" href={href} target="_blank" rel="noreferrer">View receipt {index + 1}</a> : <strong>Receipt {index + 1}</strong>}
          {' · '}{orderDate(receipt.uploaded_at, 'BD')}{receipt.uploaded_by_name && ' · ' + receipt.uploaded_by_name}
          {receipt.amount !== undefined && ' · ' + money(receipt.amount, 'BDT')}{receipt.method && ' · ' + receipt.method}
          {receipt.note && <p>{receipt.note}</p>}
        </li>;
      })}</ul> : <p>No receipts attached.</p>}
    </section>
    {(update || remove) && <PreOrderDetailActions row={row} edit={update} remove={remove} />}
    <div className="overview-grid">
      <section className="panel padded stack"><h2>Staff notes</h2>
        {row.admin_notes?.length ? <ul>{[...row.admin_notes].reverse().map((note, index) =>
          <li key={note._id || index}>{note.note} · {note.added_by?.full_name || 'Staff'} · {orderDate(note.added_at, 'BD')}</li>)}</ul> : <p>No staff notes.</p>}
      </section>
      <section className="panel padded stack"><h2>Status history</h2>
        {statusHistory.length ? <ul>{[...statusHistory].reverse().map((status, index) =>
          <li key={status._id || index}>{statusText(status.status || '')} · {orderDate(status.changed_at, 'BD')}</li>)}</ul> : <p>No status changes recorded.</p>}
      </section>
      <section className="panel padded stack"><h2>Calls and SMS</h2>
        {row.call_logs?.length ? <ul>{[...row.call_logs].reverse().map((call, index) =>
          <li key={call._id || index}>Called by {call.called_by_name || 'staff'} · {orderDate(call.called_at, 'BD')}</li>)}</ul> : <p>No calls recorded.</p>}
        {row.sms_logs?.length ? <ul>{[...row.sms_logs].reverse().map((sms, index) =>
          <li key={sms._id || index}>{statusText(sms.status || '')} · {sms.sent_by_name || 'Staff'} · {orderDate(sms.sent_at, 'BD')}<p>{sms.message}</p></li>)}</ul> : <p>No SMS recorded.</p>}
      </section>
      <section className="panel padded stack"><h2>Activity</h2>
        {row.logs?.length ? <ul>{[...row.logs].reverse().map((log, index) =>
          <li key={log._id || index}>{log.action} · {orderDate(log.time, 'BD')}</li>)}</ul> : <p>No activity recorded.</p>}
      </section>
    </div>
  </div>;
}
