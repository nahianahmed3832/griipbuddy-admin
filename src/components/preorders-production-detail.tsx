'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Pencil, Plus } from 'lucide-react';
import { preOrderItems, preOrderMedia, preOrderNumber, preOrderProduct, preOrderRequestUrl, productionPreOrdersPath, type PreOrderRow } from '@/lib/preorders';
import { ProductionPreOrderActionDialog, type ProductionPreOrderAction } from './preorders-production-actions';
import { PreOrderPicture, PreOrderStatus } from './preorders-production-media';
import styles from './preorders.module.css';

const dateTime = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }) : '';

export function ProductionPreOrderDetail({ row, update, mediaOrigin, batches }: { row: PreOrderRow; update: boolean; mediaOrigin: string; batches: string[] }) {
  const [dialog, setDialog] = useState<ProductionPreOrderAction>();
  const [notice, setNotice] = useState('');
  const items = preOrderItems(row);
  const online = row.order_by === 'CUSTOMER';
  const statusHistory = row.status_history ?? [];
  const role = typeof row.created_by?.role === 'string' ? row.created_by.role : row.created_by?.role?.name;
  const creator = online ? 'Online (Customer)' : row.created_by?.full_name
    ? [row.created_by.full_name, role && '(' + role + ')'].filter(Boolean).join(' ') : row.order_by;
  const address = row.delivery_address;
  function action(kind: ProductionPreOrderAction, label: string, disabled = false) {
    return <button type="button" className={styles.control} disabled={disabled} onClick={() => setDialog(kind)}>{label}</button>;
  }
  return <div className={`${styles.production} ${styles.detailPage}`}>
    <header className={styles.splitHeading}>
      <div className={styles.inline}>
        <Link href={productionPreOrdersPath} aria-label="Back to Pre-Orders" className={styles.iconButton}><ArrowLeft size={16}/></Link>
        <h1>{preOrderNumber(row)}</h1>
        <PreOrderStatus status={row.status}/>
        <span className={styles.outlineBadge}>{row.source_type === 'LISTED' ? 'Listed' : 'External'}</span>
        {row.batch && <span className={styles.filledBadge}>{row.batch}</span>}
        <span className={online ? styles.filledBadge : styles.secondaryBadge}>{online ? 'Online' : 'Admin'}</span>
      </div>
      {update && <div className={styles.inline}>
        <Link href={productionPreOrdersPath + '/' + row._id + '/edit'} className={styles.primary}><Pencil size={16}/> Edit</Link>
        {action('quote', 'Quote')}{action('advance', 'Record Advance', !!row.advance_paid)}{action('status', 'Update Status')}
        {action('bulk-batch', 'Assign Batch')}{!!row.customer_phone && action('sms', 'Send SMS')}
      </div>}
    </header>
    {notice && <p className={styles.feedback} role="status">{notice}</p>}
    <section className={`${styles.infoCard} ${styles.productDetails}`}>
      <h2>Products ({items.length})</h2>
      {items.map((item, index) => {
        const listed = item.source_type === 'LISTED';
        const source = preOrderMedia(item.reference?.product_link, '', true);
        const product = typeof item.product === 'object' ? item.product : undefined;
        const pictures = listed ? [product?.thumbnail || item.product_image || item.variant?.image] : item.reference?.images ?? [];
        return <article className={styles.itemDetail} key={index}>
          <PreOrderPicture images={pictures} origin={mediaOrigin} title={preOrderProduct(item)} size={80}/>
          <div>
            <div className={styles.inline}><strong>{preOrderProduct(item)}</strong><span className={styles.outlineBadge}>{listed ? 'Listed' : 'External'}</span>
              {source && <a className={styles.sourceLink} href={source} target="_blank" rel="noreferrer">Source <ExternalLink size={12}/></a>}</div>
            <div className={styles.itemFields}>
              {item.variant?.sku && <span>SKU: {item.variant.sku}</span>}{item.reference?.color && <span>Color: {item.reference.color}</span>}
              {item.reference?.size && <span>Size: {item.reference.size}</span>}<span>Qty: {item.quantity ?? 1}</span>
              {item.quoted_unit_price !== undefined && <span>Unit: {item.quoted_unit_price}</span>}
              {item.quoted_total !== undefined && <span>Total: {item.quoted_total}</span>}
            </div>
            {item.reference?.notes && <p className={styles.muted}>Note: {item.reference.notes}</p>}
          </div>
        </article>;
      })}
    </section>
    <div className={styles.detailsGrid}>
      <Info title="Customer" rows={[
        ['Name', row.customer_name], ['Phone', row.customer_phone], ['Secondary', row.customer_secondary_phone], ['Email', row.customer_email],
        ['Address', [address?.address, address?.thana, address?.district, address?.division].filter(Boolean).join(', ') || undefined],
        ['Note', row.customer_note], ['Created by', creator],
      ]}/>
      <Info title="Quote & Payment" rows={[
        ['Quoted Total', row.quoted_total], ['Delivery Charge', row.delivery_charge], ['Total Amount', row.total_amount], ['Required Advance', row.advance_amount],
        ['Advance Paid', row.advance_paid ? 'Yes' : 'No'], ['Paid Amount', row.paid_amount], ['Due Amount', row.due_amount],
      ]}/>
      <Info title="Courier" rows={[
        ['Tracking Code', row.tracking_code || undefined], ['Consignment ID', row.consignment_id || undefined], ['Transferred', row.transfer_to_courier ? 'Yes' : 'No'],
      ]}/>
      <section className={styles.infoCard}>
        <h2>Status Timeline</h2>
        {statusHistory.map((item, index) => <div className={styles.timelineEntry} key={item._id ?? index}>
          <PreOrderStatus status={item.status}/><span>{dateTime(item.changed_at)}</span>
        </div>)}
        {!statusHistory.length && <p className={styles.muted}>No history</p>}
      </section>
    </div>
    <section className={styles.infoCard}>
      <div className={styles.splitHeading}><h2>Payment Receipts</h2>{update && <button type="button" className={styles.control}
        onClick={() => setDialog('receipt')}><Plus size={16}/> Upload Receipt</button>}</div>
      {(row.payment_receipts ?? []).map((receipt, index) => <article className={styles.itemDetail} key={receipt._id ?? index}>
        <PreOrderPicture images={[receipt.file]} origin={mediaOrigin} title={'Receipt ' + (index + 1)} size={64}
          privateUrl={receipt._id && receipt.file?.startsWith('workspace/') ? preOrderRequestUrl('receipt', { id: row._id, receipt: receipt._id }) : undefined}/>
        <div>{receipt.amount !== undefined && <p><strong>Amount: {receipt.amount}</strong></p>}
          {receipt.method && <p className={styles.muted}>Method: {receipt.method}</p>}{receipt.note && <p className={styles.muted}>{receipt.note}</p>}
          <small className={styles.muted}>Uploaded by <strong>{receipt.uploaded_by?.full_name || receipt.uploaded_by_name || '—'}</strong>
            {receipt.uploaded_at && ' • ' + dateTime(receipt.uploaded_at)}</small></div>
      </article>)}
      {!row.payment_receipts?.length && <p className={styles.muted}>No receipts uploaded yet.</p>}
    </section>
    <section className={styles.infoCard}>
      <h2>Call History {row.is_called && <small className={styles.role}>• Called ✓</small>}</h2>
      {(row.call_logs ?? []).map((call, index) => <div className={styles.infoRow} key={call._id ?? index}>
        <strong>{call.called_by?.full_name || call.called_by_name || '—'}</strong><span className={styles.muted}>{dateTime(call.called_at)}</span>
      </div>)}
      {!row.call_logs?.length && <p className={styles.muted}>Not called yet.</p>}
    </section>
    {!!row.sms_logs?.length && <section className={styles.infoCard}>
      <h2>SMS Logs</h2>{row.sms_logs.map((log, index) => <article className={styles.itemDetail} key={log._id ?? index}>
        <div><div className={styles.inline}><span className={log.status === 'SUCCESS' ? styles.filledBadge : styles.outlineBadge}>{log.status}</span>
          <small className={styles.muted}>{dateTime(log.sent_at)}</small></div><p className={styles.muted}>{log.message}</p></div>
      </article>)}
    </section>}
    {dialog && <ProductionPreOrderActionDialog kind={dialog} row={row} ids={[row._id]} batches={batches}
      close={() => setDialog(undefined)} saved={message => { setDialog(undefined); setNotice(message); }}/>}
  </div>;
}

function Info({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  return <section className={styles.infoCard}><h2>{title}</h2>
    <dl className={styles.infoList}>{rows.map(([label, value]) => <div key={label} className={styles.infoRow}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl>
  </section>;
}
