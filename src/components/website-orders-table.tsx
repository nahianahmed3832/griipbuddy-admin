'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Download, MoreHorizontal, Package, Truck } from 'lucide-react';
import { useRef, useState } from 'react';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import { addressLabel, canSync, courierStatuses, currencyFor, money, openStatuses, orderDate, orderNumber, ordersPath,
  pendingStatuses, statuses, statusLabel, type Listing, type Order, type OrderFilters } from '@/lib/website-orders';
import { Badge, Empty } from './tables';
import { OrderDialog, type DialogState, type OrderDialogKind } from './website-orders-dialog';

type Choice = { value: string; label: string };
function localDate(region: Region, ago: number) {
  const now = new Date(Date.now() - ago * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit',
    timeZone: region === 'BD' ? 'Asia/Dhaka' : 'UTC' }).format(now);
}
export function OrderFiltersForm({ filters, region, locations, creators }: {
  filters: OrderFilters; region: Region; locations: Choice[]; creators: { _id: string; label: string }[];
}) {
  const from = useRef<HTMLInputElement>(null);
  const to = useRef<HTMLInputElement>(null);
  const [preset, setPreset] = useState(filters.from || filters.to ? 'custom' : '');
  return <form className="website-filters-form" action={adminPath(ordersPath)}>
    <input type="hidden" name="region" value={region}/>
    <label>Search<input name="q" defaultValue={filters.q} maxLength={100} placeholder="Order ID, phone, tracking code"/></label>
    <label>SKU<input name="sku" defaultValue={filters.sku} maxLength={100} placeholder="Product SKU"/></label>
    <fieldset className="website-dates"><legend>Date Range</legend>
      <select aria-label="Date range preset" value={preset} onChange={e => {
        const value = e.currentTarget.value;
        setPreset(value);
        if (value === 'custom' || !from.current || !to.current) return;
        from.current.value = value ? localDate(region, Number(value)) : '';
        to.current.value = value ? localDate(region, 0) : '';
      }}>
        <option value="">All time</option><option value="0">Today</option><option value="6">Last 7 days</option>
        <option value="29">Last 30 days</option><option value="custom">Custom</option>
      </select>
      <input ref={from} type="date" name="from" aria-label="From date" defaultValue={filters.from} onChange={() => setPreset('custom')}/>
      <input ref={to} type="date" name="to" aria-label="To date" defaultValue={filters.to} onChange={() => setPreset('custom')}/>
    </fieldset>
    <label>Business Location<select name="location" defaultValue={filters.location ?? ''}>
      <option value="">All locations</option>
      {filters.location && !locations.some(location => location.value === filters.location) && <option value={filters.location}>Selected location</option>}
      {locations.map(location => <option key={location.value} value={location.value}>{location.label}</option>)}
    </select></label>
    <label>Created By<select name="creator" defaultValue={filters.creator ?? ''}>
      <option value="">Anyone</option><option value="USER">Registered customer</option><option value="GUEST">Guest customer</option>
      {filters.creator && !['USER', 'GUEST'].includes(filters.creator) && !creators.some(c => c._id === filters.creator) &&
        <option value={filters.creator}>Selected staff member</option>}
      {creators.map(creator => <option key={creator._id} value={creator._id}>{creator.label || 'Staff member'}</option>)}
    </select></label>
    <label>Called?<select name="called" defaultValue={filters.called ?? ''}>
      <option value="">All orders</option><option value="true">Called</option><option value="false">Not called</option>
    </select></label>
    <label>Order status<select name="filter" defaultValue={filters.filter ?? ''}>
      <option value="">All statuses</option>{statuses.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}
    </select></label>
    <div className="page-actions"><button className="button primary">Apply filters</button>
      <Link className="button secondary" href={region === 'BD' ? ordersPath : ordersPath + '?region=INTERNATIONAL'}>Clear Filter</Link></div>
  </form>;
}

export function OrderThumbnail({ src }: { src?: string }) {
  const [failed, setFailed] = useState('');
  let href = '';
  if (src) {
    try {
      const parsed = new URL(src);
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) href = parsed.href;
    } catch { /* Older orders may have no usable image URL. */ }
  }
  return <span className="website-order-thumb">{href && href !== failed
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={href} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(href)}/>
    : <Package size={18} aria-hidden="true"/>}</span>;
}

export function WebsiteOrdersTable({ listing, filters, region, canUpdate, canFraud, canReturn }: {
  listing: Listing; filters: OrderFilters; region: Region; canUpdate: boolean; canFraud: boolean; canReturn: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>();
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [deferredCalls, setDeferredCalls] = useState<string[]>([]);
  const { rows, page, size, counts } = listing;
  const chosen = rows.filter(row => selected.includes(row._id));
  const all = rows.length > 0 && chosen.length === rows.length;
  const syncIds = rows.filter(canSync).map(row => row._id);
  const href = (changes: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ region, ...filters, ...changes })) if (value) params.set(key, value);
    return ordersPath + '?' + params;
  };
  function downloadSelected() {
    const cell = (value: unknown) => {
      const s = String(value ?? '');
      return '"' + (/^[\s\u200B\uFEFF]*[=+@-]|^[\r\n\t]/.test(s) ? "'" : '') + s.replaceAll('"', '""') + '"';
    };
    const lines = [['Order', 'Status', 'Customer', 'Phone', 'Tracking code'],
      ...chosen.map(row => [orderNumber(row), row.status, row.customer_name, row.customer_phone, row.tracking_code])];
    const file = URL.createObjectURL(new Blob(['\uFEFF' + lines.map(line => line.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = file; link.download = 'orders-selected.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(file), 1000);
  }
  const open = (kind: OrderDialogKind, order: Order) => setDialog({ kind, order });
  const bd = region === 'BD';
  const displayStatuses = statuses.filter(status => !['UNKNOWN', 'FULL_RETURNED'].includes(status) || counts[status] || status === filters.filter);
  return <>
    <nav className="panel website-statuses" aria-label="Filter orders by status">
      {['', ...displayStatuses].map(status => <Link key={status} href={href({ filter: status, page: '' })}
        aria-current={(filters.filter ?? '') === status ? 'page' : undefined}>
        {status ? statusLabel(status) : 'All'} <span>{(counts[status || 'ALL'] || 0).toLocaleString('en')}</span>
      </Link>)}
    </nav>
    <section className="panel data-panel website-orders-panel" aria-label="Website orders">
      <div className="panel-header">
        <div><h2>Website orders</h2><p>{listing.total.toLocaleString('en')} matching orders · {bd ? 'Bangladesh time' : 'UTC'}</p></div>
        <div className="page-actions">
          {!!chosen.length && <button className="button secondary" onClick={downloadSelected}><Download size={16}/> Export selected</button>}
          {bd && canUpdate && <button className="button secondary" title="Refresh eligible orders on this page"
            disabled={!syncIds.length} onClick={() => setDialog({ kind: 'sync', ids: syncIds })}><Truck size={16}/> Sync with Courier</button>}
        </div>
      </div>
      {notice && <p role="status" className="notice website-result">{notice}</p>}
      {rows.length ? <div className="table-scroll website-orders-scroll" tabIndex={0} role="region" aria-label="Orders table">
        <table><thead><tr>
          <th scope="col"><input type="checkbox" aria-label="Select all visible records" checked={all} onChange={() => setSelected(all ? [] : rows.map(row => row._id))}/></th>
          {['Actions', 'Order ID', 'Order Date', 'Products', 'Customer Info', 'COD', 'Paid by Courier', 'Total Paid',
            'Order Status', 'Call Info', 'Note', 'Courier Info', 'Created By'].map(label => <th key={label} scope="col">{label}</th>)}
        </tr></thead><tbody>{rows.map(row => {
          const number = orderNumber(row);
          const currency = currencyFor(row.currency, region);
          const orderHref = ordersPath + '/' + row._id + '?region=' + region;
          const editable = canUpdate && bd && !row.managed && !row.transfer_to_courier && openStatuses.includes(row.status);
          const shipped = canUpdate && bd && !row.managed && row.transfer_to_courier && courierStatuses.includes(row.status);
          const actions: [OrderDialogKind, string][] = [];
          if (editable) {
            actions.push(['edit', 'Edit Order']);
            if (row.status !== 'AWAITING_STOCK') actions.push(['update-status', 'Update Status']);
          }
          if (canUpdate) actions.push(['note', 'Update Note']);
          if (canUpdate && bd && row.customer_phone) actions.push(['sms', 'Send SMS']);
          if (shipped) actions.push(['delivered', 'Mark as Delivered']);
          if (canReturn && bd && !row.managed && ['DELIVERED', 'PENDING_RETURN', 'HANDED_OVER_TO_COURIER', 'IN_TRANSIT', 'PARTIAL'].includes(row.status))
            actions.push(['return', 'Return Order']);
          if (canUpdate && bd && !row.managed && pendingStatuses.includes(row.status)) actions.push(['pending-return', 'Mark as Pending Return']);
          if (editable) actions.push(['cancel', 'Cancel Order']);
          return <tr key={row._id}>
            <td><input type="checkbox" aria-label={'Select ' + number} checked={selected.includes(row._id)}
              onChange={() => setSelected(ids => ids.includes(row._id) ? ids.filter(id => id !== row._id) : [...ids, row._id])}/></td>
            <td><button className="button secondary website-more" aria-label={'Actions for ' + number} aria-haspopup="dialog"
              onClick={() => setDialog({ kind: 'actions', order: row, href: orderHref, actions })}><MoreHorizontal size={17}/></button></td>
            <td><Link className="table-link" href={orderHref}>{number}</Link>
              {row.order_note && <small className="website-order-note"><strong>Customer note</strong>{row.order_note}</small>}</td>
            <td>{orderDate(row.order_date || row.createdAt, region)}</td>
            <td><div className="website-order-products">{row.products.map((line, i) => <div key={i}>
              <OrderThumbnail src={line.image}/><span><strong>{line.sku || line.name || 'Item'}</strong>
                {line.sku && line.name && line.name !== line.sku && <small>{line.name}</small>}
                <small>Qty: {line.quantity ?? '—'}</small></span>
            </div>)}</div></td>
            <td><button className="website-link website-customer" onClick={() => open('history', row)}>{row.customer_name || 'Customer details'}</button>
              {row.customer_phone && <span className="website-cell-line">{row.customer_phone}</span>}
              <small className="website-cell-line muted">{addressLabel(row.delivery_address)}</small>
              {canFraud && row.customer_phone && <button className="website-link website-cell-line" onClick={() => open('fraud', row)}>Fraud Check</button>}</td>
            <td>{money(row.COD, currency)}</td><td>{money(row.paid_by_courier, currency)}</td>
            <td>{money(row.paid_amount, currency)}<button className="website-link website-cell-line" onClick={() => open('payment', row)}>Pay Info</button></td>
            <td><Badge value={row.status || 'Unknown'}/>
              {row.assigned_business_location && <small className="website-cell-line">Assigned to: {row.assigned_business_location.name || row.assigned_business_location.business_location_name}</small>}
              <button className="website-link website-cell-line" onClick={() => open('status', row)}>Status Logs</button></td>
            <td>{row.is_called ? <><strong>Called{row.latestCall?.called_by_name ? ' by ' + row.latestCall.called_by_name : ''}</strong>
                <small className="website-cell-line muted">{orderDate(row.latestCall?.called_at, region)}</small></>
              : canUpdate && deferredCalls.includes(row._id) ? <>Not called
                <button className="website-link website-cell-line" onClick={() => open('called', row)}>Record call</button></>
              : canUpdate ? <><small>Have you called?</small><div className="website-call-buttons">
                <button className="button primary" aria-label={'Mark ' + number + ' as called'} onClick={() => open('called', row)}>Yes</button>
                <button className="button secondary" aria-label={'Skip call record for ' + number}
                  onClick={() => setDeferredCalls(ids => [...ids, row._id])}>No</button></div></> : 'Not called'}</td>
            <td className="website-note-cell">{row.latestNote || <span className="muted">No note</span>}</td>
            <td>{row.consignment_id ? <span>Parcel ID: {row.consignment_id}</span> : <span className="muted">No parcel ID</span>}
              {row.tracking_code && <button className="website-link website-cell-line" onClick={() => open('track', row)}>Track Order</button>}
              {(row.tracking_code || row.transfer_to_courier || row.managed) && <button className="website-link website-cell-line" onClick={() => open('tracking', row)}>Tracking Logs</button>}</td>
            <td>{row.user?.full_name || (row.order_by === 'GUEST' ? 'Guest customer' : row.order_by === 'USER' ? 'Registered customer' : row.order_by || '—')}
              {row.user?.role && <small className="website-cell-line muted">{statusLabel(row.user.role)}</small>}</td>
          </tr>;
        })}</tbody></table>
      </div> : <Empty title="No orders match" detail="Try clearing a filter or selecting another status."/>}
      <div className="pagination"><span>Page {page} of {Math.max(1, Math.ceil(listing.total / size))}</span><div>
        {page > 1 && <Link className="button secondary" href={href({ page: String(page - 1) })}><ArrowLeft size={15}/> Previous</Link>}
        {page * size < listing.total && <Link className="button secondary" href={href({ page: String(page + 1) })}>Next <ArrowRight size={15}/></Link>}
      </div></div>
    </section>
    {dialog && <OrderDialog key={dialog.kind} state={dialog} region={region} close={() => setDialog(undefined)}
      change={kind => { if ('order' in dialog) open(kind, dialog.order); }}
      saved={message => { setDialog(undefined); setNotice(message); router.refresh(); }}/>}
  </>;
}
