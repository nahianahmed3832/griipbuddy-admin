import Link from 'next/link';
import { ArrowDownToLine, ArrowRight } from 'lucide-react';
import { api, ApiError, arr, integratedCheckoutEnabled, obj, str, url } from '@/lib/api';
import { adminPath } from '@/lib/paths';
import { afterId, col, date, editor, Grid, json, number, read, ReportValues, status, text, type Context } from './managed-common';

function OrderSearch({ context, order }: { context: Context; order?: string }) {
  return <form action={adminPath(context.path)} className="panel filters">
    <input type="hidden" name="region" value={context.region}/>
    <label className="filter-label">Order ID<input name="order" pattern="[0-9A-Fa-f]{24}" maxLength={24} defaultValue={order} required/></label>
    <button className="button secondary">Open order</button>
    <Link className="button subtle" href={url('/desk/orders',{region:context.region})}>Find an order <ArrowRight size={15}/></Link>
  </form>;
}

async function orderDeskHandoff(context: Context, order?: string) {
  if (!order || !integratedCheckoutEnabled()) return null;
  const checkout = obj(await api('/commerce/admin/orders/' + order, context.auth.token).catch(error => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }));
  if (!['step9','legacy'].includes(str(checkout.kind))) return null;
  const { region } = context;
  return <div className="notice">
    <Link className="table-link" href={url('/desk/orders/orders/' + order,{region})}>Open order operations</Link>
    {checkout.hasReceipt === true && <Link className="table-link" href={url('/desk/payments/checkout',{region,receipt:order})}>
      Review checkout receipt
    </Link>}
  </div>;
}

export async function ManagedSourcing(context: Context) {
  const { path, region, q } = context;
  const sources = obj(await read(context,url('/global/admin/sources',{after:afterId(q)})));
  return <>
    <div className="page-actions">{editor(context,'source-map','Map dispatch source',[
      text('warehouse','China warehouse ID'),text('supplier','Supplier ID'),text('sourceVariant','Mapped supplier variant ID'),
      number('handlingDays','Supplier handling days',0),
    ],{primary:true,description:'The warehouse, supplier profile and mapped catalog variant are verified by the API.'})}</div>
    <Grid title="China dispatch sources" data={sources} columns={[col('Mapping','_id'),col('Warehouse','warehouse'),col('Supplier','supplier'),
      col('Source variant','sourceVariant'),col('Handling days','handlingDays'),col('Staff ID','actor')]}
      next={sources.next ? url(path,{region,after:str(sources.next)}) : undefined}/>
  </>;
}

export async function ManagedFulfillment(context: Context) {
  const { path, region, q, auth } = context;
  const order = afterId(q,'order');
  const handoff = await orderDeskHandoff(context, order);
  if (handoff) return <><OrderSearch context={context} order={order}/>{handoff}</>;
  const shipmentId = afterId(q,'record');
  const base = { region, order };
  const [data, rawOrder] = order ? await Promise.all([
    read(context,'/global/admin/orders/' + order), api('/order/' + order,auth.token),
  ]) : [];
  const shipments = arr(obj(data).shipments).map(obj);
  const selected = shipments.find(row => row._id === shipmentId);
  const state = str(selected?.state);
  const trackable = ['dispatched','in-transit','customs','out-for-delivery','exception'];
  const outbound = selected?.direction === 'outbound';
  const timeline = selected && shipmentId
    ? obj(await read(context,url('/global/admin/shipments/' + shipmentId + '/tracking',{after:afterId(q,'after')}))) : null;
  return <>
    <OrderSearch context={context} order={order}/>
    {order && rawOrder && <>
      <div className="page-actions">{editor(context,'shipment-new','Plan shipment',[
        text('order','Order ID',order),text('warehouse','Warehouse ID'),text('service','Configured shipping service'),
        json('parcels','Parcels',[{grams:500,length:15,width:10,height:5}],'Use grams and centimeters.'),
        json('lines','Order lines',[{id:'',quantity:1}],'Use order line IDs. China shipments require a source mapping and may use a matching purchase ID.'),
      ],{primary:true})}</div>
      <Grid title="Order lines" data={{items:obj(rawOrder).products}} columns={[col('Line ID','_id'),col('Variant','selected_variant.sku|variant.sku'),
        col('Quantity','total_quantity|quantity')]}/>
      <Grid title="Shipments" data={{items:shipments}} columns={[col('Shipment','_id'),col('Route','origin'),col('Service','service'),status,
        col('Tracking','tracking'),col('Direction','direction')]} select={row => url(path,{...base,record:str(row._id)})}/>
    </>}
    {selected && <section className="panel padded stack-form">
      <h2>Shipment {shipmentId}</h2>
      <p>{str(selected.service)} · {state}</p>
      <div className="page-actions">
        {outbound && state === 'planned' && <>
          {editor(context,'shipment-action','Pick shipment',[json('barcodes','Barcodes',[],'Enter an array of scanned barcode labels. Leave empty for eligible untracked FIFO stock.')],{id:shipmentId,step:'pick'})}
          {editor(context,'shipment-action','Cancel allocation',[],{id:shipmentId,step:'cancel'})}
        </>}
        {outbound && state === 'picked' && editor(context,'shipment-action','Pack shipment',[],{id:shipmentId,step:'pack'})}
        {outbound && state === 'packed' && editor(context,'shipment-action','Dispatch shipment',selected.provider === 'steadfast' ? [] : [
          text('tracking','Tracking reference'),text('carrierId','Carrier ID',undefined,true),text('evidence','Verified handoff reference'),
        ],{id:shipmentId,step:'dispatch'})}
        {str(selected.tracking) && trackable.includes(state) && editor(context,'shipment-action','Record tracking event',[
          text('id','External event ID'),date('at','Observed at',undefined),text('code','Carrier event code'),text('evidence','Verified evidence reference'),
        ],{id:shipmentId,step:'tracking'})}
        {str(selected.tracking) && selected.provider === 'steadfast' && editor(context,'shipment-action','Sync Steadfast tracking',[],{id:shipmentId,step:'sync'})}
        {outbound && ['delivered','exception','returned'].includes(state) && editor(context,'shipment-action','Record return shipment',[
          text('tracking','Reverse tracking reference'),text('evidence','Return evidence reference'),
        ],{id:shipmentId,step:'return'})}
      </div>
    </section>}
    {timeline && <Grid title="Tracking history" data={timeline} columns={[col('Status','status','badge'),col('Carrier event','code'),
      col('Source','source'),col('Observed','at'),col('Staff ID','actor')]}
      next={timeline.next ? url(path,{...base,record:shipmentId,after:str(timeline.next)}) : undefined}/>}
  </>;
}

export async function ManagedPayments(context: Context) {
  const { q, path, region } = context;
  const order = afterId(q,'order');
  const base = { region, order };
  const handoff = await orderDeskHandoff(context, order);
  if (handoff) return <><OrderSearch context={context} order={order}/>{handoff}</>;
  const requested = afterId(q,'record');
  const orderData = order ? obj(await read(context,'/global/admin/orders/' + order)) : null;
  const selected = arr(orderData?.payments).map(obj).find(row => row.id === requested);
  const details = selected ? obj(await read(context,url('/global/admin/payments/' + requested,{after:afterId(q)}))) : null;
  const payment = obj(details?.payment);
  const evidence = obj(details?.evidence);
  const offline = ['cod','manual'].includes(str(payment.provider));
  return <>
    <OrderSearch context={context} order={order}/>
    {orderData && <Grid title="Payment attempts" data={{items:orderData.payments}} columns={[col('Payment','id'),col('Provider','provider'),
      col('Currency','currency'),col('Due (minor)','amount'),col('Captured (minor)','captured'),status]}
      select={row => url(path,{...base,record:str(row.id)})}/>}
    {details && <>
      <ReportValues title="Payment detail" data={{...payment,reference:evidence.reference,method:evidence.method}}
        description="Amounts are in the recorded currency’s minor units."
        labels={{provider:'Provider',status:'Status',currency:'Currency',amount:'Requested',captured:'Captured',
          refunded:'Refunded',reference:'Evidence reference',method:'Evidence method'}}/>
      <div className="page-actions">
        {payment.evidenceSubmitted === true && <a className="button secondary" href={adminPath('/api/managed?receipt=' + requested)}>
          <ArrowDownToLine size={15}/> Download private receipt</a>}
        {offline && payment.status === 'pending' && editor(context,'payment-action','Review payment',[
          {name:'decision',label:'Decision',type:'select',choices:['approve','reject']},text('reason','Review reason'),
          ...(payment.provider === 'manual' ? [text('verifiedReference','Verified receipt reference',undefined,true),
            number('verifiedAmount','Verified receipt amount (minor units)',undefined,true)] : []),
        ],{id:requested,step:'review',description:'Manual approval requires the matching reference and amount from the private receipt.'})}
        {offline && ['authorized','captured'].includes(str(payment.status)) && editor(context,'payment-action','Record delivery collection',[
          text('reference','Verified collection reference'),
        ],{id:requested,step:'collect'})}
        {!offline && editor(context,'payment-action','Reconcile provider',[],{id:requested,step:'reconcile'})}
        {typeof payment.captured === 'number' && payment.captured > Number(payment.refunded ?? 0) &&
          editor(context,'payment-action','Record refund',[
            number('amount','Refund amount (minor units)'),text('reason','Refund reason'),text('reference','Verified offline refund reference',undefined,!offline),
          ],{id:requested,step:'refunds',description:'Confirm the amount and reason. The API records provider confirmation or requires a verified offline reference.'})}
        {!offline && editor(context,'payment-action','Add dispute note',[
          text('reference','Provider reference'),{name:'disposition',label:'Disposition',type:'select',choices:['investigating','responded','resolved']},
          text('note','Staff note'),
        ],{id:requested,step:'disputes/notes'})}
      </div>
      <Grid title="Payment activity" data={{items:details.events}} columns={[col('Event','kind'),col('Staff ID','actor'),
        col('Recorded','createdAt'),col('Decision','details.decision'),col('Reason','details.reason')]}
        next={details.next ? url(path,{...base,record:requested,after:str(details.next)}) : undefined}/>
      <Grid title="Refunds" data={{items:details.refunds}} columns={[col('Refund','id|_id'),col('Amount (minor)','amount'),col('Currency','currency'),col('State','state','badge'),col('Provider reference','providerId'),col('Updated','updatedAt','date'),col('Reason','reason')]}/>
      {!offline && <div className="page-actions">
        {arr(details.refunds).map(obj).filter(row => row.state === 'pending' && str(row.id)).map(row =>
          editor(context, 'refund-reconcile', 'Reconcile refund ' + str(row.id).slice(-8), [
            text('reference', 'Provider refund reference', row.providerId),
          ], { id: requested, step: str(row.id), description: 'Look up this refund with the payment provider and apply its verified outcome.' }))}
      </div>}
    </>}
  </>;
}
