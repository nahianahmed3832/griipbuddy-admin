import Link from 'next/link';
import { ArrowDownToLine, ArrowRight } from 'lucide-react';
import { api, ApiError, arr, integratedCheckoutEnabled, obj, str, url } from '@/lib/api';
import { adminPath } from '@/lib/paths';
import { managedMarketScope, managedRead, marketCode } from '@/lib/managed';
import { param } from '@/lib/data';
import { afterId, col, date, editor, Grid, json, number, read, ReportValues, status, text, type Context } from './managed-common';

function OrderSearch({ context, order }: { context: Context; order?: string }) {
  return <form action={adminPath(context.path)} className="panel filters">
    <input type="hidden" name="region" value={context.region}/>
    <label className="filter-label">Order ID<input name="order" pattern="[0-9A-Fa-f]{24}" maxLength={24} defaultValue={order} required/></label>
    <button className="button secondary">Open order</button>
    <Link className="button subtle" href={url('/desk/orders',{region:context.region})}>Find an order <ArrowRight size={15}/></Link>
  </form>;
}

function orderEditorContext(context: Context, data: unknown): Context {
  const market = str(obj(data).market);
  return marketCode(market) ? { ...context, market } : context;
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

const shipmentStates = [
  ['planned', 'Ready to pick'], ['picked', 'Ready to pack'], ['packed', 'Ready for handoff'], ['booking', 'Booking needs review'],
  ['processing', 'Processing'], ['dispatched', 'Dispatched'], ['in-transit', 'In transit'], ['customs', 'Customs'], ['out-for-delivery', 'Out for delivery'],
  ['exception', 'Delivery exception'], ['delivered', 'Delivered'], ['returned', 'Returned'], ['cancelled', 'Cancelled'],
] as const;

async function ShipmentQueue(context: Context) {
  const { auth, market, path, q, region } = context;
  const state = shipmentStates.find(([key]) => key === param(q, 'state'))?.[0];
  const requested = param(q, 'direction');
  const direction = requested === 'outbound' || requested === 'return' ? requested : undefined;
  const before = afterId(q, 'before');
  const wrongRegion = region === 'BD' ? market !== 'BD' : market === 'BD';
  const filters = { market, region, state, direction };
  const payload = wrongRegion ? null : obj(await managedRead(url('/global/admin/shipments', { state, direction, before }), auth,
    await managedMarketScope(market, auth)));
  return <>
    <form action={adminPath(path)} className="panel filters" aria-label="Filter shipment queue">
      <input type="hidden" name="region" value={region}/>
      <label className="filter-label">Country code<input name="market" pattern="[A-Za-z]{2}" maxLength={2}
        defaultValue={wrongRegion ? '' : market} required/></label>
      <label className="filter-label">Shipment state<select name="state" defaultValue={state ?? ''}>
        <option value="">All states</option>{shipmentStates.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className="filter-label">Direction<select name="direction" defaultValue={direction ?? ''}>
        <option value="">Both directions</option><option value="outbound">Outbound</option><option value="return">Return</option>
      </select></label>
      <button className="button secondary">Apply filters</button>
    </form>
    {payload ? <Grid title="Shipment queue" data={payload} columns={[col('Order','order'),col('Shipment','_id'),col('Service','service'),
      col('Direction','direction'),status,col('Tracking','tracking'),col('Updated','updatedAt','date')]}
      select={row => url(path,{ ...filters,before,order:str(row.order),record:str(row._id) })}
      next={payload.next ? url(path,{...filters,before:str(payload.next)}) : undefined}/>
      : <p className="notice">Choose a country code in this operating region to view its shipments.</p>}
  </>;
}

export async function ManagedFulfillment(context: Context) {
  const { path, region, q, auth } = context;
  const order = afterId(q,'order');
  const handoff = await orderDeskHandoff(context, order);
  if (handoff) return <><OrderSearch context={context} order={order}/>{handoff}</>;
  const shipmentId = afterId(q,'record');
  const filters = { region, market: param(q, 'market'), state: param(q, 'state'), direction: param(q, 'direction'), before: afterId(q, 'before') };
  const base = { ...filters, order };
  if (!order) return <><OrderSearch context={context}/>{await ShipmentQueue(context)}</>;
  const [data, rawOrder] = order ? await Promise.all([
    managedRead('/global/admin/orders/' + order, auth, param(q, 'market') ? await managedMarketScope(context.market, auth) : undefined),
    api(url('/order/' + order, { region }),auth.token),
  ]) : [];
  const shipments = arr(obj(data).shipments).map(obj);
  const editorContext = orderEditorContext(context, data);
  if ((editorContext.market === 'BD') !== (region === 'BD')) throw new ApiError(404);
  const parcelScope = await managedMarketScope(editorContext.market, auth);
  const selected = shipments.find(row => row._id === shipmentId);
  if (shipmentId && !selected) throw new ApiError(404);
  const ordered = arr(obj(rawOrder).products).map(obj);
  const activeOutbound = shipments.filter(parcel => parcel.direction === 'outbound' && parcel.state !== 'cancelled');
  const orderLines = ordered.map(line => {
    const quantity = Number(line.total_quantity ?? line.quantity) || 0;
    const allocated = activeOutbound.flatMap(parcel => arr(parcel.lines).map(obj))
      .filter(allocated => str(allocated.id) === str(line._id))
      .reduce((sum, allocation) => sum + (Number(allocation.quantity) || 0), 0);
    return { ...line, ordered: quantity, allocated, remaining: Math.max(0, quantity - allocated) };
  });
  const state = str(selected?.state);
  const trackable = ['processing','dispatched','in-transit','customs','out-for-delivery','exception'];
  const outbound = selected?.direction === 'outbound';
  const timeline = selected && shipmentId
    ? obj(await managedRead(url('/global/admin/shipments/' + shipmentId + '/tracking',{after:afterId(q,'after')}),auth,parcelScope)) : null;
  return <>
    <OrderSearch context={context} order={order}/>
    <div className="page-actions"><Link className="button secondary" href={url(path, filters)}>Back to shipment queue</Link></div>
    {order && rawOrder && <>
      <div className="page-actions">{editor(editorContext,'shipment-new','Plan shipment',[
        text('order','Order ID',order),text('warehouse','Warehouse ID'),text('service','Configured shipping service'),
        json('parcels','Parcels',[{grams:500,length:15,width:10,height:5}],'Use grams and centimeters.'),
        json('lines','Order lines',[{id:'',quantity:1}],'Use order line IDs. China shipments require a source mapping and may use a matching purchase ID.'),
      ],{primary:true})}</div>
      <Grid title="Order line allocation" data={{items:orderLines}} columns={[col('Line ID','_id'),col('Variant','selected_variant.sku|variant.sku'),
        col('Ordered','ordered'),col('Allocated','allocated'),col('Remaining','remaining')]}/>
      <Grid title="Shipments" data={{items:shipments}} columns={[col('Shipment','_id'),col('Route','origin'),col('Service','service'),status,
        col('Tracking','tracking'),col('Direction','direction')]} select={row => url(path,{...base,record:str(row._id)})}/>
    </>}
    {selected && <section className="panel padded stack-form">
      <h2>Shipment {shipmentId}</h2>
      <dl className="details-grid">
        <div><dt>Shipment state</dt><dd>{state}</dd></div>
        <div><dt>Fulfillment site</dt><dd>{[selected.warehouse, selected.origin].map(str).filter(Boolean).join(' · ')}</dd></div>
        <div><dt>Service</dt><dd>{[selected.service, selected.provider].map(str).filter(Boolean).join(' · ')}</dd></div>
        <div><dt>Tracking number</dt><dd>{str(selected.tracking) || 'Unrecorded'}</dd></div>
      </dl>
      <div className="page-actions">
        {outbound && state === 'planned' && <>
          {editor(editorContext,'shipment-action','Pick shipment',[json('barcodes','Barcodes',[],'Enter an array of scanned barcode labels. Leave empty for eligible untracked FIFO stock.')],{id:shipmentId,step:'pick'})}
          {editor(editorContext,'shipment-action','Cancel allocation',[],{id:shipmentId,step:'cancel'})}
        </>}
        {outbound && state === 'picked' && editor(editorContext,'shipment-action','Pack shipment',[],{id:shipmentId,step:'pack'})}
        {outbound && state === 'packed' && editor(editorContext,'shipment-action','Record carrier handoff',[
          text('tracking','Tracking reference'),text('carrierId','Carrier ID',undefined,true),text('evidence','Verified handoff reference'),
        ],{id:shipmentId,step:'dispatch'})}
        {str(selected.tracking) && trackable.includes(state) && editor(editorContext,'shipment-action','Record tracking event',[
          text('id','External event ID'),date('at','Observed at',undefined),text('code','Carrier event code'),text('evidence','Verified evidence reference'),
        ],{id:shipmentId,step:'tracking'})}
        {str(selected.tracking) && selected.provider === 'steadfast' && editor(editorContext,'shipment-action','Sync Steadfast tracking',[],{id:shipmentId,step:'sync'})}
        {outbound && ['delivered','exception','returned'].includes(state) && editor(editorContext,'shipment-action','Record return shipment',[
          text('tracking','Reverse tracking reference'),text('evidence','Return evidence reference'),
          json('lines','Selected return lines',undefined,'Provide line IDs and quantities for a partial return. Leave blank to review all remaining units.'),
        ],{id:shipmentId,step:'return'})}
        {!outbound && !selected.receivedAt && str(selected.tracking) && editor(editorContext,'shipment-action','Inspect received return',[
          text('evidence','Receipt evidence reference'),text('lotEvidence','Reviewed historical lot evidence',undefined,true),
          json('lines','Inspected lines',arr(selected.lines).map(obj).map(row => ({ id:row.id,sellable:0,damaged:0,
            sellableBarcodes:[],damagedBarcodes:[] })), 'Count sellable and damaged units. Include the original labels for tracked units and exact lot breakdown if requested.'),
        ],{id:shipmentId,step:'receive'})}
        {!outbound && selected.receivedAt != null && <Link className="button secondary"
          href={url('/desk/payments/payment-desk',{region,market:editorContext.market,order})}>Review payment and refund</Link>}
      </div>
    </section>}
    {selected && <Grid title="Allocated shipment lines" data={{items:selected.lines}} columns={[
      col('Order line','id'),col('Variant','sku'),col('Units','quantity')]}/>}
    {selected && arr(selected.parcels).length > 0 && <Grid title="Parcel dimensions"
      data={{items:arr(selected.parcels).map((parcel, index) => ({ ...obj(parcel), package: index + 1 }))}}
      columns={[col('Package','package'),col('Grams','grams'),col('Length (cm)','length'),col('Width (cm)','width'),col('Height (cm)','height')]}/>}
    {selected?.receivedAt != null && <Grid title="Inspection result" data={{items:selected.receiptLines}} columns={[
      col('Order line','id'),col('Sellable units','sellable'),col('Damaged units','damaged')]}/>}
    {timeline && <Grid title="Tracking history" data={{ ...timeline, items:arr(timeline.items).map(obj).map(row =>
      ({ ...row, result:row.applied === false ? 'Audit only' : 'Applied' })) }} columns={[col('Status','status','badge'),col('Carrier event','code'),
      col('Source','source'),col('Observed','at'),col('Result','result'),col('Staff ID','actor')]}
      next={timeline.next ? url(path,{...base,record:shipmentId,after:str(timeline.next)}) : undefined}/>}
  </>;
}

export async function ManagedPayments(context: Context) {
  const { q, path, region } = context;
  const order = afterId(q,'order');
  const base = { region, order, market: param(q, 'market') };
  const handoff = await orderDeskHandoff(context, order);
  if (handoff) return <><OrderSearch context={context} order={order}/>{handoff}</>;
  const requested = afterId(q,'record');
  const orderData = order ? obj(await read(context,'/global/admin/orders/' + order)) : null;
  const editorContext = orderEditorContext(context, orderData);
  const selected = arr(orderData?.payments).map(obj).find(row => row.id === requested);
  const details = selected ? obj(await read(context,url('/global/admin/payments/' + requested,{after:afterId(q)}))) : null;
  const payment = obj(details?.payment);
  const evidence = obj(details?.evidence);
  const offline = ['cod','manual'].includes(str(payment.provider));
  const inspectedReturns = arr(orderData?.shipments).map(obj).filter(row => row.direction === 'return' && row.receivedAt && arr(row.receiptLines).length);
  const refundable = Number(obj(details?.refund).amount) || 0;
  const recordedRefunds = arr(details?.refunds).map(obj);
  const activeRefunds = recordedRefunds.filter(row => row.state === 'pending' || row.state === 'refunded');
  const refundBalance = obj(details?.refundBalance);
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
      {Number(refundBalance.held) > 0 && <p className="notice" role="status">
        {String(refundBalance.held)} {str(payment.currency)} minor units held for pending refunds.
      </p>}
      <div className="page-actions">
        {payment.evidenceSubmitted === true && <a className="button secondary" href={adminPath(url('/api/managed', { receipt: requested, market: editorContext.market }))}>
          <ArrowDownToLine size={15}/> Download private receipt</a>}
        {offline && payment.status === 'pending' && editor(editorContext,'payment-action','Review payment',[
          {name:'decision',label:'Decision',type:'select',choices:['approve','reject']},text('reason','Review reason'),
          ...(payment.provider === 'manual' ? [text('verifiedReference','Verified receipt reference',undefined,true),
            number('verifiedAmount','Verified receipt amount (minor units)',undefined,true)] : []),
        ],{id:requested,step:'review',description:'Manual approval requires the matching reference and amount from the private receipt.'})}
        {offline && Boolean(details.collection) && editor(editorContext,'payment-action','Record delivery collection',[
          text('reference','Verified collection reference'),
        ],{id:requested,step:'collect'})}
        {!offline && editor(editorContext,'payment-action','Reconcile provider',[],{id:requested,step:'reconcile'})}
        {refundable > 0 && !activeRefunds.some(row => row.returnShipment) &&
          editor(editorContext,'payment-action','Record refund',[
            number('amount','Refund amount (minor units)'),text('reason','Refund reason'),text('reference','Verified offline refund reference',undefined,!offline),
          ],{id:requested,step:'refunds',retryOrder:order,description:'Confirm the amount and reason. The API records provider confirmation or requires a verified offline reference.'})}
        {refundable > 0 && !activeRefunds.some(row => !row.returnShipment) && inspectedReturns.map(receipt => <div key={str(receipt._id)}>
          {editor(editorContext,'payment-action','Refund inspected return ' + str(receipt._id).slice(-8),[
            text('returnShipment','Inspected return reference',receipt._id),text('reason','Refund reason'),
            json('lines','Selected returned lines',arr(receipt.receiptLines).map(obj).map(row => ({ id:row.id,quantity:(Number(row.sellable) || 0) + (Number(row.damaged) || 0) })),
              'Enter the exact order line IDs and eligible quantities. Remove any line that does not qualify.'),
            ...(offline ? [text('reference','Verified offline refund reference')] : []),
          ],{id:requested,step:'refunds',retryOrder:order,description:'The API calculates the returned merchandise share from the original price and discount snapshot.'})}
        </div>)}
        {!offline && editor(editorContext,'payment-action','Add dispute note',[
          text('reference','Provider reference'),{name:'disposition',label:'Disposition',type:'select',choices:['investigating','responded','resolved']},
          text('note','Staff note'),
        ],{id:requested,step:'disputes/notes'})}
      </div>
      <Grid title="Payment activity" data={{items:details.events}} columns={[col('Event','kind'),col('Staff ID','actor'),
        col('Recorded','createdAt'),col('Decision','details.decision'),col('Reason','details.reason')]}
        next={details.next ? url(path,{...base,record:requested,after:str(details.next)}) : undefined}/>
      <Grid title="Refunds" data={{items:details.refunds}} columns={[col('Refund','id|_id'),col('Amount (minor)','amount'),col('Currency','currency'),col('State','state','badge'),col('Inspected return','returnShipment'),col('Refund reference','providerId|reference'),col('Reconciliation','reconciliation'),col('Updated','updatedAt','date'),col('Reason','reason')]}/>
      <div className="page-actions">
        {recordedRefunds.filter(row => row.state === 'pending' && str(row.id)).map(row =>
          editor(editorContext, 'refund-reconcile', 'Resume refund ' + str(row.id).slice(-8), [
            ...(!offline ? [text('reference', 'Provider refund reference', row.providerId, true)] : []),
          ], { id: requested, step: str(row.id), description: 'Resume this saved refund. Its amount and original payment stay in place.' }))}
      </div>
    </>}
  </>;
}
