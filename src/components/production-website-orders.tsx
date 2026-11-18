'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, FileSpreadsheet, Filter, Info, Truck } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import {
  addressLabel, currencyFor, money, orderActions, orderDate, orderFilterKeys, orderNumber, ordersApi,
  type Listing, type Order, type OrderAccess, type OrderFilters, type OrderLocation,
} from '@/lib/website-orders';
import { OrderDateRangeCalendar, type OrderDateRange } from './order-date-range-calendar';
import { normalizeFraudPhone, useCourierFraud } from './production-fraud';
import { OrderDialog, type DialogState, type OrderDialogKind } from './website-orders-dialog';
import { ProductionOrderMenu, useManualOrderStatus } from './production-order-menu';
import { OrderThumbnail } from './website-orders-table';
import styles from './production-website-orders.module.css';

const statusTabs = [
  ['', 'All'], ['PLACED', 'Placed'], ['ACCEPTED', 'Accepted'], ['IN_REVIEW', 'In Review'],
  ['HANDED_OVER_TO_COURIER', 'Handed over to courier'], ['IN_TRANSIT', 'In Transit'], ['DELIVERED', 'Delivered'],
  ['PENDING_RETURN', 'Pending Return'], ['PARTIAL', 'Partial'], ['RETURN_REQUESTED', 'Returned Requested'],
  ['RETURNED', 'Returned'], ['CANCELLED', 'Cancelled'], ['FAILED', 'Failed'], ['INCOMPLETE', 'Incomplete'],
  ['NO_RESPONSE', 'No Response'], ['PRE_ORDER', 'Pre Order'], ['AWAITING_STOCK', 'Awaiting Stock'],
] as const;
const headings = [
  'Actions', 'Order Id', 'Order Date', 'Products', 'Customer Info', 'COD', 'Paid by Courier', 'Total Paid',
  'Order Status', 'Call Info', 'Note', 'Courier Info', 'Created By',
];
const dates = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' });

function query(region: Region, filters: OrderFilters, page?: number, limit = '') {
  const params = new URLSearchParams();
  if (region === 'INTERNATIONAL') params.set('region', region);
  for (const key of orderFilterKeys) {
    const value = filters[key]?.trim();
    if (value) params.set(key, value);
  }
  if (page && page > 1) params.set('page', String(page));
  if (limit && limit !== '20') params.set('limit', limit);
  return params.size ? '?' + params.toString() : '';
}

function day(region: Region) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: region === 'BD' ? 'Asia/Dhaka' : 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function calendarDay(year: number, month: number, date: number) {
  return new Date(Date.UTC(year, month, date)).toISOString().slice(0, 10);
}

function presets(today: string) {
  const [year, month, date] = today.split('-').map(Number);
  const monthIndex = month - 1;
  const since = (days: number) => calendarDay(year, monthIndex, date - days);
  const financialYear = monthIndex >= 3 ? year : year - 1;
  return [
    ['', 'All Time', '', ''],
    ['today', 'Today', today, today],
    ['yesterday', 'Yesterday', since(1), since(1)],
    ['week', 'Last 7 Days', since(6), today],
    ['month', 'Last 30 Days', since(29), today],
    ['this-month', 'This Month', calendarDay(year, monthIndex, 1), calendarDay(year, monthIndex + 1, 0)],
    ['last-month', 'Last Month', calendarDay(year, monthIndex - 1, 1), calendarDay(year, monthIndex, 0)],
    ['month-last-year', 'This month last year', calendarDay(year - 1, monthIndex, 1), calendarDay(year - 1, monthIndex + 1, 0)],
    ['this-year', 'This Year', calendarDay(year, 0, 1), calendarDay(year, 11, 31)],
    ['last-year', 'Last Year', calendarDay(year - 1, 0, 1), calendarDay(year - 1, 11, 31)],
    ['financial-year', 'Current financial year', calendarDay(financialYear, 3, 1), calendarDay(financialYear + 1, 3, 0)],
    ['last-financial-year', 'Last financial year', calendarDay(financialYear - 1, 3, 1), calendarDay(financialYear, 3, 0)],
  ];
}

function dateText(date: string, fallback: string) {
  const value = Date.parse(date);
  return Number.isFinite(value) ? dates.format(value) : fallback;
}

function orderDateParts(value: string | undefined, region: Region) {
  const date = Date.parse(value ?? '');
  if (!Number.isFinite(date)) return { day: '—', time: '' };
  const timeZone = region === 'BD' ? 'Asia/Dhaka' : 'UTC';
  return {
    day: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone }).format(date),
    time: new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone }).format(date),
  };
}

function orderMoney(value: number | undefined, currency: string) {
  return currency === 'BDT' ? 'TK ' + (value?.toLocaleString('en-BD') ?? '') : money(value, currency);
}

function SelectField({ name, value, onChange, children, className }: {
  name: string; value: string; onChange: (value: string) => void; children: ReactNode; className?: string;
}) {
  return <span className={`${styles.select} ${className ?? ''}`}>
    <select aria-label={name} value={value} onChange={event => onChange(event.currentTarget.value)}>{children}</select>
    <ChevronDown aria-hidden="true" size={15}/>
  </span>;
}

type Props = {
  listing?: Listing;
  filters: OrderFilters;
  region: Region;
  locations: OrderLocation[];
  creators: { _id: string; label: string }[];
  access: OrderAccess;
  pageSizes: readonly string[];
  selectedSize?: string;
  issue?: 'dates' | 'too-many';
  assigned?: boolean;
  executive?: boolean;
};

function FraudCell({ phone, open }: { phone: string; open: () => void }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const { result, busy, error } = useCourierFraud(phone, visible);
  useEffect(() => {
    if (!anchor.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    });
    observer.observe(anchor.current);
    return () => observer.disconnect();
  }, []);
  const tone = result ? result.successRate >= 80 ? 'safe' : result.successRate >= 50 ? 'warning' : 'danger' : undefined;
  return <button ref={anchor} type="button" className={styles.fraudLink} data-tone={tone} onClick={open}>
    Fraud Check{busy && <small role="status">Checking…</small>}
    {result && <small>{result.statusTag || 'No status'} · <strong>{result.successRate}% ({result.totalDelivered ?? 0}/{result.totalOrders ?? result.totalParcels ?? 0})</strong></small>}
    {error && <small>Error loading data</small>}
  </button>;
}

export function ProductionWebsiteOrders({ listing, filters, region, locations, creators, access, pageSizes, selectedSize, issue, assigned = false, executive = false }: Props) {
  const router = useRouter();
  const listPath = assigned ? '/dashboard/assigned-orders' : executive ? '/dashboard/sales-executive' : '/dashboard/orders';
  const filterId = useId();
  const [formFilters, setFormFilters] = useState(filters);
  const [expanded, setExpanded] = useState(true);
  const [calendar, setCalendar] = useState(false);
  const [customPreset, setCustomPreset] = useState(false);
  const [range, setRange] = useState<OrderDateRange>({ from: '', to: '' });
  const dateTrigger = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<DialogState>();
  const [notice, setNotice] = useState('');
  const { updateStatus, updating } = useManualOrderStatus(region, setNotice);
  const [deferred, setDeferred] = useState<string[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const today = day(region);
  const fromText = dateText(formFilters.from ?? '', 'Jan 01, 1970');
  const toText = dateText(formFilters.to ?? '', dateText(today, today));
  const dateTextLabel = formFilters.from && (!formFilters.to || formFilters.from === formFilters.to) ? fromText : fromText + ' - ' + toText;
  const rows = listing?.rows ?? [];
  const counts = listing?.counts ?? {};
  const total = listing?.total ?? 0;
  const page = listing?.page ?? 1;
  const size = listing?.size ?? 20;
  const pageSize = selectedSize ?? String(size);
  const status = formFilters.filter ?? '';
  const exportFilters = formFilters.from || formFilters.to ? formFilters : { ...formFilters, from: '1970-01-01', to: today };
  const path = (value: OrderFilters, number?: number, limit = pageSize) => listPath + query(region, value, number, limit);
  const open = (kind: OrderDialogKind, order: Order) => setDialog({ kind, order });
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  useEffect(() => {
    const restore = () => {
      if (!window.location.pathname.endsWith(listPath)) return;
      clearTimeout(searchTimer.current);
      const search = new URLSearchParams(window.location.search);
      setCalendar(false);
      setCustomPreset(false);
      setFormFilters(Object.fromEntries(orderFilterKeys.map(key => [key, search.get(key) ?? (key === 'filter' ? search.get('status') : null) ?? undefined])));
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [listPath]);

  function submit(value: OrderFilters, delay = 0) {
    clearTimeout(searchTimer.current);
    setFormFilters(value);
    if (delay) searchTimer.current = setTimeout(() => router.replace(path(value), { scroll: false }), delay);
    else router.replace(path(value), { scroll: false });
  }

  function openCalendar() {
    setRange({
      from: formFilters.from ?? '1970-01-01',
      to: formFilters.to ?? (formFilters.from ? '' : today),
    });
    setCalendar(true);
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(formFilters);
  }

  const datePresets = presets(today);
  const activePreset = datePresets.find(([, , from, to]) => (formFilters.from ?? '') === from && (formFilters.to ?? '') === to)?.[0] ?? 'custom';
  const visibleStatuses = status && !statusTabs.some(([key]) => key === status)
    ? [...statusTabs, [status, status.replaceAll('_', ' ').toLowerCase()]]
    : statusTabs;


  return <section className={styles.orders} aria-label={assigned ? 'Assigned orders' : 'Website orders'}>
    <h1>{assigned ? 'Assigned Orders' : executive ? 'Sales Executive' : 'All Orders'} ({total.toLocaleString('en')})</h1>
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <button type="button" className={styles.filterToggle} aria-expanded={expanded} aria-controls={filterId}
          onClick={() => setExpanded(value => !value)}><Filter size={20}/> Filter</button>
        {!assigned && <div className={styles.headerActions}>
          {region === 'BD' && access.update && <button type="button" className={styles.outlineAction}
            onClick={() => setDialog({ kind: 'sync' })}>
            <Truck size={16}/> Sync with Courier
          </button>}
          <a className={styles.outlineAction} href={ordersApi('export', region, { ...exportFilters, checkout: '1' })} download>
            <FileSpreadsheet size={16}/> Download Excel
          </a>
        </div>}
      </div>
      {expanded && <form id={filterId} className={styles.filters} action={adminPath(listPath)} onSubmit={onSearch}>
        {region === 'INTERNATIONAL' && <input type="hidden" name="region" value={region}/>}
        {status && <input type="hidden" name="filter" value={status}/>}
        <div className={styles.firstRow}>
          <label className={styles.wideField}>Search
            <input name="q" placeholder="Order id, phone, tracking code" maxLength={100}
              value={formFilters.q ?? ''} onChange={event => submit({ ...formFilters, q: event.currentTarget.value }, 350)}/>
          </label>
          <label className={styles.wideField}>SKU
            <input name="sku" placeholder="521CL-5" maxLength={100}
              value={formFilters.sku ?? ''} onChange={event => submit({ ...formFilters, sku: event.currentTarget.value }, 350)}/>
          </label>
          <div className={styles.dateField}>
            <span>Date Range</span>
            <div className={styles.dateControls}>
              <SelectField name="Date range preset" className={styles.preset} value={customPreset ? 'custom' : activePreset} onChange={value => {
                if (value === 'custom') {
                  setCustomPreset(true);
                  openCalendar();
                  return;
                }
                setCustomPreset(false);
                setCalendar(false);
                const selected = datePresets.find(([key]) => key === value);
                if (selected) submit({ ...formFilters, from: selected[2], to: selected[3] });
              }}>
                {datePresets.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                <option value="custom">Custom Range</option>
              </SelectField>
              <button ref={dateTrigger} type="button" className={styles.dateToggle} aria-expanded={calendar} aria-haspopup="dialog"
                onClick={() => { if (calendar) setCalendar(false); else openCalendar(); }}><CalendarDays size={16}/>{dateTextLabel}</button>
              {calendar && <OrderDateRangeCalendar range={range} today={today} trigger={dateTrigger}
                onChange={selected => { setRange(selected); setCustomPreset(true); submit({ ...formFilters, ...selected }); }}
                close={() => setCalendar(false)}/>}
            </div>
          </div>
        </div>
        <div className={styles.secondRow}>
          <label className={styles.locationField}>Business Location
            <SelectField name="Business Location" value={formFilters.location ?? ''} onChange={location => submit({ ...formFilters, location })}>
              <option value="">All</option>
              {formFilters.location && !locations.some(item => item.value === formFilters.location) &&
                <option value={formFilters.location}>Selected location</option>}
              {locations.map(location => <option key={location.value} value={location.value}>{location.label}</option>)}
            </SelectField>
          </label>
          {!assigned && <label className={styles.narrowField}>Created By
            <SelectField name="Created By" value={formFilters.creator ?? ''} onChange={creator => submit({ ...formFilters, creator })}>
              <option value="">All</option>
              {formFilters.creator && !creators.some(item => item._id === formFilters.creator) &&
                <option value={formFilters.creator}>Selected creator</option>}
              {creators.map(creator => <option key={creator._id} value={creator._id}>{creator.label || 'Staff member'}</option>)}
            </SelectField>
          </label>}
          {!assigned && <label className={styles.narrowField}>Called?
            <SelectField name="Called?" value={formFilters.called ?? ''} onChange={called => submit({ ...formFilters, called })}>
              <option value="">All</option><option value="true">Called (Yes)</option><option value="false">Not Called (No)</option>
            </SelectField>
          </label>}
        </div>
        <button className={styles.primary} type="button" onClick={() => { submit(executive ? { from: today, to: today } : {}); setCalendar(false); setCustomPreset(false); }}>Clear Filter</button>
      </form>}
    </section>
    {issue && <p role="alert" className={styles.notice}>{issue === 'too-many'
      ? 'Narrow the filters to show at most 10,000 orders at once.' : 'Review the date range and try again.'}</p>}
    {listing?.hybridUnavailable && <p role="alert" className={styles.notice}>Checkout orders are temporarily unavailable.</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    <nav className={`${styles.panel} ${styles.statuses}`} aria-label="Filter orders by status">
      {visibleStatuses.map(([key, label]) => <Link key={key} href={path({ ...formFilters, filter: key })}
        aria-current={status === key ? 'page' : undefined} scroll={false}
        onClick={() => { clearTimeout(searchTimer.current); setFormFilters(value => ({ ...value, filter: key })); }}>
        {label} - {(counts[key || 'ALL'] ?? 0).toLocaleString('en')}
      </Link>)}
    </nav>
    <section className={`${styles.panel} ${styles.tablePanel}`} aria-label="Orders table">
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Scroll order columns">
        <table data-populated={rows.length > 0}>
          <thead><tr>{headings.map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
          <tbody>{rows.length ? rows.map(order => {
            const number = orderNumber(order);
            const currency = currencyFor(order.currency, region);
            const listQuery = query(region, formFilters, page, pageSize);
            const source = assigned ? 'assigned' : executive ? 'executive' : undefined;
            const destinationQuery = listQuery + (source ? (listQuery ? '&' : '?') + 'source=' + source : '');
            const href = '/dashboard/order-details/' + order._id + destinationQuery;
            const projected = order.checkoutProjection;
            const actions = orderActions(order, access, region);
            const awaitStock = actions.some(action => action.kind === 'accept-stock');
            const newCall = access.update && !deferred.includes(order._id);
            const date = orderDateParts(order.order_date || order.createdAt, region);
            const address = addressLabel(order.delivery_address);
            return <tr key={order._id}>
              <td><ProductionOrderMenu order={order} href={href} actions={actions}
                editHref={order.managed ? href + (href.includes('?') ? '&' : '?') + 'edit=1'
                  : access.product ? '/dashboard/orders/edit/' + order._id + destinationQuery : undefined}
                updating={updating.get(order._id)} select={kind => {
                  if (kind === 'delivered' || kind === 'pending-return') {
                    void updateStatus(order._id, kind === 'delivered' ? 'DELIVERED' : 'PENDING_RETURN');
                  } else open(kind, order);
                }}/></td>
              <td><Link className={styles.orderNumber} href={href}>{number}</Link>
                {order.order_note && <small>Customer Note: <span className={styles.customerNote}>{order.order_note}</span></small>}</td>
              <td><span className={styles.dateCell}>{date.day}</span>{date.time && <span>{date.time}</span>}</td>
              <td><div className={styles.products}>{order.products.map((line, index) => <div key={index}>
                <OrderThumbnail src={line.image}/><span><strong>{line.sku || line.name || 'Item'}</strong>
                  <small>Order Qty:</small><span className={styles.orderQuantity}>{line.quantity ?? '—'} pair/pcs</span></span>
              </div>)}</div></td>
              <td>{!projected && <button className={styles.customerLink} onClick={() => open('history', order)}>{order.customer_name || 'Customer details'}
                {order.customer_phone ? ' - ' + order.customer_phone : ''}</button>}
                <span>{address || '-'}</span>
                {access.fraud && normalizeFraudPhone(order.customer_phone) && <FraudCell phone={order.customer_phone!} open={() => open('fraud', order)}/>}</td>
              <td className={styles.nowrap}>{orderMoney(order.COD, currency)}</td>
              <td>{order.paid_by_courier == null ? '-' : orderMoney(order.paid_by_courier, currency)}</td>
              <td>{projected ? orderMoney(order.paid_amount, currency) : <>{orderMoney(order.paid_amount, currency)}
                <button className={styles.textLink} onClick={() => open('payment', order)}>Pay Info</button></>}</td>
              <td><span className={styles.orderStatus} data-status={order.status}>{order.status.replaceAll('_', ' ')}</span>
                {awaitStock && <div className={styles.stockActions}>
                  <button type="button" className={styles.primary} onClick={() => open('accept-stock', order)}>Accept</button>
                  <button type="button" className={styles.smallButton} onClick={() => open('decline-stock', order)}>Decline</button>
                </div>}
                {projected ? <Link className={styles.textLink} href={href + '#status-logs'}><Info size={13}/> Status Logs</Link>
                  : <button className={styles.textLink} onClick={() => open('status', order)}><Info size={13}/> Status Logs</button>}</td>
              <td>{projected ? '—' : order.is_called ? <><strong>Called{order.latestCall?.called_by_name ? ' by ' + order.latestCall.called_by_name : ''}</strong>
                <small>{orderDate(order.latestCall?.called_at, region)}</small>
                <button type="button" className={styles.textLink} onClick={() => open('calls', order)}>Call History</button></>
                : newCall ? <><small>Have you called?</small><div className={styles.callActions}>
                  <button className={styles.smallButton} aria-label={'Mark ' + number + ' as called'} onClick={() => open('called', order)}>Yes</button>
                  <button className={styles.smallButton} aria-label={'Skip call record for ' + number}
                    onClick={() => setDeferred(items => [...items, order._id])}>No</button>
                </div></> : access.update ? <button className={styles.textLink} onClick={() => open('called', order)}>Record call</button> : 'Not called'}</td>
              <td><span className={styles.muted}>Last Note:</span>{order.latestNote || 'N/A'}</td>
              <td>{order.assigned_business_location && <small>{order.assigned_business_location.name || order.assigned_business_location.business_location_name}</small>}
                {order.consignment_id ? <span>Parcel Id: {order.consignment_id}</span> : null}
                {order.tracking_code && (projected ? <span>{order.tracking_code}</span>
                  : <button className={styles.textLink} onClick={() => open('track', order)}>Track Order</button>)}
                {!projected && (order.tracking_code || order.transfer_to_courier || order.managed) &&
                  <button className={styles.textLink} onClick={() => open('tracking', order)}>Tracking Logs</button>}</td>
              <td>{order.user?.full_name || (order.order_by === 'GUEST' ? 'Guest customer' : order.order_by === 'USER' ? 'Registered customer' : order.order_by || '—')}
                {order.user?.role && <small className={styles.createdRole}>{order.user.role}</small>}</td>
            </tr>;
          }) : <tr><td colSpan={headings.length} className={styles.empty}>No data found!</td></tr>}</tbody>
        </table>
      </div>
    </section>
    <nav className={`${styles.panel} ${styles.pagination}`} aria-label="Order pages">
      <SelectField className={styles.pageSize} name="Orders per page" value={pageSize} onChange={limit => {
        clearTimeout(searchTimer.current);
        router.replace(path(formFilters, undefined, limit), { scroll: false });
      }}>
        {pageSizes.map(option => <option key={option} value={option}>{option === 'all' ? 'All' : option}</option>)}
      </SelectField>
      <span>{total ? Math.min((page - 1) * size + 1, total) : 0} - {Math.min(page * size, total)} of {total}</span>
      <div className={styles.pageLinks}>
        {pageSize !== 'all' && page > 1 ? <Link className={styles.primary} href={path(formFilters, page - 1)} scroll={false}>{!assigned && <ChevronLeft size={18}/>}<span>Previous</span></Link>
          : <button type="button" className={styles.primary} disabled>{!assigned && <ChevronLeft size={18}/>}<span>Previous</span></button>}
        {pageSize !== 'all' && page * size < total ? <Link className={styles.primary} href={path(formFilters, page + 1)} scroll={false}>{!assigned && <ChevronRight size={18}/>}<span>Next</span></Link>
          : <button type="button" className={styles.primary} disabled>{!assigned && <ChevronRight size={18}/>}<span>Next</span></button>}
      </div>
    </nav>
    {dialog && <OrderDialog key={dialog.kind} state={dialog} region={region} locations={locations} close={() => setDialog(undefined)}
      change={kind => { if ('order' in dialog) open(kind, dialog.order); }}
      saved={message => { setDialog(undefined); setNotice(message); router.refresh(); }}/>}
  </section>;
}
