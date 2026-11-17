'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, EllipsisVertical, ExternalLink, FileSpreadsheet, Filter, History, X } from 'lucide-react';
import {
  inboundPreOrderStatuses, outboundPreOrderStatuses, preOrderItems, preOrderMedia, preOrderNumber, preOrderProduct,
  preOrderRequest, preOrderRequestUrl, preOrderStatuses, preOrderUrl, productionPreOrderSizes, productionPreOrdersPath, statusText,
  type PreOrderFilters, type PreOrderRow,
} from '@/lib/preorders';
import { OrderDateRangeCalendar } from './order-date-range-calendar';
import { ProductionPreOrderActionDialog, type ProductionPreOrderAction } from './preorders-production-actions';
import { PreOrderPicture, PreOrderStatus } from './preorders-production-media';
import styles from './preorders.module.css';

type Props = {
  rows: PreOrderRow[]; total: number; batches: string[]; filters: PreOrderFilters; page: number; pageSize: number;
  counts: Record<string, number>; access: { create: boolean; update: boolean; remove: boolean }; mediaOrigin: string; today: string;
};
const callDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' });
const orderDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dhaka', month: 'numeric', day: 'numeric', year: 'numeric' });
const stamp = (value?: string, dateOnly = false) => value && Number.isFinite(Date.parse(value))
  ? (dateOnly ? orderDay : callDate).format(new Date(value)) : '—';
const rangeDate = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: '2-digit' });
const displayDate = (value: string) => Number.isFinite(Date.parse(value)) ? rangeDate.format(new Date(value + 'T00:00:00Z')) : '—';
const groups = [['China → Bangladesh', inboundPreOrderStatuses], ['Bangladesh → Customer', outboundPreOrderStatuses], ['Other', preOrderStatuses.slice(10)]] as const;
const columns = ['Actions', 'Pre-Order Id', 'Date', 'Product / Reference', 'Customer Info', 'Qty', 'Batch', 'Quote / Advance / Paid', 'Status', 'Courier Info', 'Call Info', 'Created By'];

type Dialog = { kind: ProductionPreOrderAction; row?: PreOrderRow; ids?: string[] };

export function ProductionPreOrdersIndex({ rows, total, batches, filters, page, pageSize, counts, access, mediaOrigin, today }: Props) {
  const router = useRouter();
  const [local, setLocal] = useState(filters);
  const [calendar, setCalendar] = useState(false);
  const [preset, setPreset] = useState(filters.from || filters.to ? 'custom' : 'all');
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<Dialog>();
  const [message, setMessage] = useState('');
  const [calling, setCalling] = useState('');
  const dateTrigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const selectAll = useRef<HTMLInputElement>(null);
  const selectedVisible = selected.filter(id => rows.some(row => row._id === id));
  const some = selectedVisible.length > 0 && selectedVisible.length < rows.length;
  const all = rows.length > 0 && selectedVisible.length === rows.length;
  const range = { from: local.from ?? '', to: local.to ?? '' };
  const maxPage = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = some; }, [some]);
  function navigate(values: PreOrderFilters, newPage = 1, size = pageSize, delay = 0) {
    clearTimeout(timer.current);
    setLocal(values);
    setSelected([]);
    const { q, ...rest } = values;
    const destination = preOrderUrl(productionPreOrdersPath, { ...rest, searchQuery: q, page: newPage > 1 ? String(newPage) : undefined,
      limit: size === 20 ? undefined : String(size) });
    const go = () => router.replace(destination, { scroll: false });
    if (delay) timer.current = setTimeout(go, delay);
    else go();
  }
  function datePreset(value: string) {
    setPreset(value);
    if (value === 'custom') { setCalendar(true); return; }
    setCalendar(false);
    const from = new Date(today + 'T00:00:00Z');
    if (value === 'yesterday') from.setUTCDate(from.getUTCDate() - 1);
    if (value === 'last7') from.setUTCDate(from.getUTCDate() - 6);
    if (value === 'last30') from.setUTCDate(from.getUTCDate() - 29);
    if (value === 'month') from.setUTCDate(1);
    const key = from.toISOString().slice(0, 10);
    navigate({ ...local, from: value === 'all' ? undefined : key,
      to: value === 'all' ? undefined : value === 'yesterday' ? key : today });
  }
  async function markCalled(row: PreOrderRow) {
    if (calling) return;
    setCalling(row._id);
    setMessage('');
    try {
      await preOrderRequest('called', { id: row._id }, {});
      setMessage('Marked as called');
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Failed to mark as called'); }
    finally { setCalling(''); }
  }
  const changeStatus = (status?: string) => navigate({ ...local, status });
  return <section className={styles.production}>
    <header className={styles.splitHeading}><h1>All Pre-Orders ({total})</h1>
      {access.create && <Link href={productionPreOrdersPath + '/create'} className={styles.primary}>Create Pre-Order</Link>}
    </header>
    <section className={`${styles.surface} ${styles.filters}`} aria-label="Filter">
      <div className={styles.splitHeading}><h2><Filter size={20}/> Filter</h2>
        <a className={`${styles.control} ${styles.excel}`} href={preOrderRequestUrl('export', filters)}><FileSpreadsheet size={16}/> Download Excel</a></div>
      <form className={styles.filterFields} onSubmit={event => { event.preventDefault(); navigate(local); }}>
        <label>Search<input className={styles.searchField} type="search" placeholder="PO id, phone, name, product" value={local.q ?? ''} maxLength={100}
          onChange={event => navigate({ ...local, q: event.target.value }, 1, pageSize, 400)}/></label>
        <div className={styles.filterDate}><span>Date Range</span><div className={styles.inline}>
          <select aria-label="Date range preset" value={preset} onChange={event => datePreset(event.target.value)}>
            {Object.entries({ all: 'All Time', today: 'Today', yesterday: 'Yesterday', last7: 'Last 7 Days', last30: 'Last 30 Days', month: 'This Month', custom: 'Custom Range' }).map(([value, label]) =>
              <option value={value} key={value}>{label}</option>)}
          </select>
          <button ref={dateTrigger} type="button" className={styles.control} aria-label="Select date range" aria-expanded={calendar} aria-haspopup="dialog"
            onClick={() => setCalendar(open => !open)}><CalendarDays size={16}/>{displayDate(range.from || '1970-01-01')} - {displayDate(range.to || range.from || today)}</button>
          {calendar && <OrderDateRangeCalendar today={today} range={range} trigger={dateTrigger} close={() => setCalendar(false)} onChange={value => {
            setPreset('custom'); navigate({ ...local, ...value });
          }}/>}
        </div></div>
        <label>Batch<select className={styles.batchField} value={local.batch ?? ''} onChange={event => navigate({ ...local, batch: event.target.value })}>
          <option value="">All</option>{batches.map(batch => <option key={batch}>{batch}</option>)}
        </select></label>
        <label>Source<select className={styles.sourceField} value={local.source ?? ''} onChange={event => navigate({ ...local, source: event.target.value })}>
          <option value="">All</option><option value="LISTED">Listed</option><option value="EXTERNAL">External</option>
        </select></label>
      </form>
      <button type="button" className={styles.primary} onClick={() => { setPreset('all'); setCalendar(false); navigate({}); }}>Clear Filter</button>
    </section>
    <nav className={`${styles.surface} ${styles.statusFilters}`} aria-label="Pre-order statuses">
      <button type="button" className={styles.statusFilter} aria-pressed={!local.status} onClick={() => changeStatus()}>All - {counts.ALL ?? 0}</button>
      {groups.map(([title, statuses]) => <div key={title}><p>{title}</p><div className={styles.inline}>
        {statuses.map(status => <button key={status} type="button" className={styles.statusFilter} aria-pressed={local.status === status}
          onClick={() => changeStatus(status)}>{statusText(status)} - {counts[status] ?? 0}</button>)}
      </div></div>)}
    </nav>
    {!!selectedVisible.length && access.update && <div className={styles.bulkActions}>
      <strong>{selectedVisible.length} selected</strong>
      {[['bulk-batch', 'Assign Batch'], ['bulk-status', 'Update Status'], ['bulk-dispatch', 'Send to Courier']].map(([kind, label]) =>
        <button type="button" className={styles.control} key={kind} onClick={() => setDialog({ kind: kind as ProductionPreOrderAction, ids: selectedVisible })}>{label}</button>)}
      <button type="button" className={`${styles.control} ${styles.clearSelected}`} onClick={() => setSelected([])}><X size={16}/> Clear</button>
    </div>}
    {message && <p role="status" className={styles.feedback}>{message}</p>}
    <section className={`${styles.surface} ${styles.tablePanel}`} aria-label="Pre-orders">
      <div className={styles.tableScroll} role="region" tabIndex={0} aria-label="Pre-order table">
        <table className={styles.productionTable}>
          <thead><tr>
            {access.update && <th scope="col"><input type="checkbox" ref={selectAll} checked={all} aria-label="Select all" disabled={!rows.length}
              onChange={() => setSelected(all ? [] : rows.map(row => row._id))}/></th>}
            {columns.map(column => <th scope="col" key={column}>{column}</th>)}
          </tr></thead>
          <tbody>{rows.map(row => {
            const items = preOrderItems(row);
            const first = items[0];
            const isListed = first.source_type === 'LISTED';
            const product = typeof first.product === 'object' ? first.product : undefined;
            const source = preOrderMedia(first.reference?.product_link, '', true);
            const pictures = isListed ? [product?.thumbnail || first.product_image || first.variant?.image] : first.reference?.images ?? [];
            const call = row.call_logs?.at(-1);
            const role = typeof row.created_by?.role === 'string' ? row.created_by.role : row.created_by?.role?.name;
            const tracked = row.tracking_code;
            return <tr key={row._id}>
              {access.update && <td><input type="checkbox" checked={selected.includes(row._id)} aria-label={'Select ' + preOrderNumber(row)}
                onChange={() => setSelected(current => current.includes(row._id) ? current.filter(id => id !== row._id) : [...current, row._id])}/></td>}
              <td><RowMenu row={row} access={access} show={setDialog}/></td>
              <td className={styles.nowrap}><strong>{preOrderNumber(row)}</strong> <span className={styles.outlineBadge}>{isListed ? 'Listed' : 'External'}</span></td>
              <td className={styles.nowrap}>{stamp(row.createdAt, true)}</td>
              <td><div className={styles.productCell}><PreOrderPicture images={pictures} origin={mediaOrigin} title={preOrderProduct(first)} size={40} single/>
                <div><strong>{preOrderProduct(first)}</strong>{items.length > 1 && <small> +{items.length - 1} more</small>}
                  {isListed && first.variant?.sku && <small>SKU: {first.variant.sku}</small>}
                  {source && <a href={source} target="_blank" rel="noreferrer">Source <ExternalLink size={12}/></a>}</div></div></td>
              <td><div className={styles.customerCell}><strong>{row.customer_name}</strong><p>{row.customer_phone}</p>
                <small>{[row.delivery_address?.address, row.delivery_address?.thana, row.delivery_address?.district].filter(Boolean).join(', ')}</small>
                {row.customer_note && <small className={styles.customerNote} title={row.customer_note}>Note: {row.customer_note}</small>}</div></td>
              <td className={styles.center}>{row.quantity ?? items.reduce((sum, item) => sum + (item.quantity ?? 1), 0)}</td>
              <td>{row.batch ? <span className={styles.outlineBadge}>{row.batch}</span> : '—'}</td>
              <td className={styles.nowrap}><p>Quote: {row.quoted_total ?? '—'}</p><small>Adv: {row.advance_amount ?? 0} • Paid: {row.paid_amount ?? 0}</small>
                {row.due_amount !== undefined && <small className={styles.due}>Due: {row.due_amount}</small>}
                {!!row.advance_payment_info?.files?.length && <PreOrderPicture images={row.advance_payment_info.files} origin={mediaOrigin} title="advance proof" label="Proof" size={40}/>}</td>
              <td><PreOrderStatus status={row.status}/></td>
              <td className={styles.nowrap}>{tracked ? <a href={'https://steadfast.com.bd/t/' + encodeURIComponent(tracked)} target="_blank" rel="noreferrer">{tracked}</a> : <small>Not sent</small>}
                {!!row.consignment_id && <small>CID: {row.consignment_id}</small>}</td>
              <td><div className={styles.callInfo}>{row.is_called ? <>
                <strong>Already called by {call?.called_by?.full_name || call?.called_by_name || 'N/A'}</strong>
                {call?.called_at && <small>{stamp(call.called_at)}</small>}
                {(row.call_logs?.length ?? 0) > 1 && <button type="button" className={styles.textButton} onClick={() => setDialog({ kind: 'history', row })}><History size={14}/> Call History</button>}
              </> : access.update ? <><small>Have you called?</small><div className={styles.inline}>
                <button type="button" className={styles.yes} disabled={!!calling} onClick={() => void markCalled(row)}>{calling === row._id ? '…' : 'Yes'}</button>
                <button type="button" className={styles.no} aria-label="Leave call unrecorded" disabled={!!calling} onClick={() => setMessage('')}>No</button>
              </div></> : <small>Not called</small>}</div></td>
              <td>{row.created_by?.full_name || row.customer_name || '—'}<small className={styles.role}>{role || (row.order_by === 'CUSTOMER' ? 'Online' : '—')}</small></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {!rows.length && <p className={styles.noResults}>No pre-orders found!</p>}
    </section>
    <div className={`${styles.surface} ${styles.pagination}`}>
      <select aria-label="Items per page" value={pageSize} onChange={event => navigate(local, 1, Number(event.target.value))}>
        {productionPreOrderSizes.map(size => <option key={size}>{size}</option>)}
      </select>
      <span>{total ? Math.min((page - 1) * pageSize + 1, total) : 0} - {Math.min(page * pageSize, total)} of {total}</span>
      <div className={styles.inline}><button type="button" className={styles.primary} disabled={page <= 1} onClick={() => navigate(local, page - 1)}>Previous</button>
        <button type="button" className={styles.primary} disabled={page >= maxPage} onClick={() => navigate(local, page + 1)}>Next</button></div>
    </div>
    {dialog && <ProductionPreOrderActionDialog {...dialog} batches={batches} close={() => setDialog(undefined)} saved={text => {
      setDialog(undefined); setSelected([]); setMessage(text);
    }}/>}
  </section>;
}

function RowMenu({ row, access, show }: { row: PreOrderRow; access: Props['access']; show: (value: Dialog) => void }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const [where, setWhere] = useState({ left: 0, top: 0 });
  function choose(kind: ProductionPreOrderAction) {
    if (menu.current) menu.current.open = false;
    show({ kind, row, ...(kind === 'bulk-batch' && { ids: [row._id] }) });
  }
  return <details ref={menu} className={styles.rowMenu} onToggle={event => {
    if (!event.currentTarget.open) return;
    const rect = summary.current?.getBoundingClientRect();
    if (rect) setWhere({ left: Math.min(rect.left, window.innerWidth - 175), top: rect.bottom + 4 });
  }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}>
    <summary ref={summary} className={styles.iconButton} aria-label={'Actions for ' + preOrderNumber(row)}><EllipsisVertical size={16}/></summary>
    <div className={styles.rowMenuBody} style={where}>
      <Link href={productionPreOrdersPath + '/' + row._id}>View Details</Link>
      {access.update && <>
        <Link href={productionPreOrdersPath + '/' + row._id + '/edit'}>Edit</Link><hr/>
        <button type="button" onClick={() => choose('quote')}>Quote</button>
        {!row.advance_paid && <button type="button" onClick={() => choose('advance')}>Record Advance</button>}
        <button type="button" onClick={() => choose('status')}>Update Status</button>
        <button type="button" onClick={() => choose('bulk-batch')}>Assign Batch</button>
        {!row.transfer_to_courier && !row.consignment_id && <button type="button" onClick={() => choose('dispatch')}>Send to Courier</button>}
        {!!row.customer_phone && <button type="button" onClick={() => choose('sms')}>Send SMS</button>}
      </>}
      {access.remove && <><hr/><button type="button" className={styles.deleteText} onClick={() => choose('remove')}>Delete</button></>}
    </div>
  </details>;
}
