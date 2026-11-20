import Link from 'next/link';
import { arr, obj, str, url } from '@/lib/api';
import { afterId, col, date, editor, Grid, json, read, ReportValues, status, text, type Context } from './managed-common';

export async function ManagedStock(context: Context) {
  const { market, region, q, path } = context;
  const warehouse = afterId(q,'warehouse');
  const stock = afterId(q,'stock');
  const lot = afterId(q,'lot');
  const base = { market, region, warehouse, stock };
  const after = afterId(q);
  const [warehouses, bins, stocks, lots] = await Promise.all([
    warehouse ? null : read(context,url('/inventory/warehouses',{after})),
    warehouse ? read(context,url('/inventory/warehouses/' + warehouse + '/bins',{after:afterId(q,'binsAfter')})) : null,
    warehouse ? read(context,url('/inventory/stock',{warehouse,after})) : null,
    stock ? read(context,url('/inventory/stock/' + stock + '/lots',{after:afterId(q,'lotsAfter')})) : null,
  ]);
  const selectedLot = arr(obj(lots).items).map(obj).find(row => row._id === lot);
  const units = selectedLot ? await read(context,url('/inventory/lots/' + lot + '/units',{after:afterId(q,'unitsAfter')})) : null;
  return <>
    <div className="page-actions">
      {editor(context,'warehouse-new','Add warehouse',[text('name','Warehouse name'),text('slug','Warehouse slug'),text('country_code','Country code'),
        text('address','Street address')],{primary:true})}
      {warehouse && <Link className="button subtle" href={url(path,{market,region})}>Change warehouse</Link>}
      {warehouse && editor(context,'bin-new','Add storage bin',[text('code','Bin code'),text('name','Bin name')],{id:warehouse})}
      {selectedLot && editor(context,'lot-bin','Change lot bin',[text('bin','Bin ID',selectedLot.bin,true),
        text('reason','Placement reason')],{id:lot,description:'Leave the bin empty to remove the existing assignment.'})}
    </div>
    {warehouses && <Grid title="Warehouses and outlets" data={warehouses} columns={[col('Location','name|business_location_name'),col('ID','_id'),
      col('Country','country_code'),col('Region','region'),col('Type','type')]} select={row => url(path,{market,region,warehouse:str(row._id)})}
      next={obj(warehouses).next ? url(path,{market,region,after:str(obj(warehouses).next)}) : undefined}/>}
    {stocks && <Grid title="Warehouse stock" data={stocks} columns={[col('Variant','variant'),col('Product','product'),col('On hand','available_quantity'),
      col('Reserved','qty_reserved'),col('Received','total_received')]} select={row => url(path,{...base,after,stock:str(row._id)})}
      next={obj(stocks).next ? url(path,{market,region,warehouse,after:str(obj(stocks).next)}) : undefined}/>}
    {lots && <Grid title="FIFO lots" data={lots} columns={[col('Lot','lot_number'),col('Available','qty_available'),col('Received','received_at','date'),
      col('Expires','expiry_date','date'),col('Bin','bin'),status]} select={row => url(path,{...base,after,lotsAfter:afterId(q,'lotsAfter'),lot:str(row._id)})}
      next={obj(lots).next ? url(path,{...base,after,lotsAfter:str(obj(lots).next)}) : undefined}/>}
    {units && <Grid title="Tracked units in lot" data={units} columns={[col('Barcode','barcode'),col('SKU','sku'),status]}
      next={obj(units).next ? url(path,{...base,after,lotsAfter:afterId(q,'lotsAfter'),lot,unitsAfter:str(obj(units).next)}) : undefined}/>}
    {bins && <Grid title="Storage bins" data={bins} columns={[col('Bin','code'),col('Name','name'),col('ID','_id')]}
      next={obj(bins).next ? url(path,{...base,after,binsAfter:str(obj(bins).next)}) : undefined}/>}
  </>;
}

export async function ManagedPurchases(context: Context) {
  const { market, region, q, path } = context;
  const id = afterId(q,'record');
  const base = { market, region, after:afterId(q) };
  const [purchases, raw, receipts] = await Promise.all([
    read(context,url('/inventory/purchases',{after:base.after})),
    id ? read(context,'/inventory/purchases/' + id) : null,
    id ? read(context,url('/inventory/purchases/' + id + '/receipts',{after:afterId(q,'receiptsAfter')})) : null,
  ]);
  const purchase = obj(raw);
  const open = purchase.status === 'ordered' && purchase.inventory_ordered === true;
  return <>
    <div className="page-actions">{editor(context,'purchase-new','New purchase order',[
      text('warehouse','Warehouse ID'),text('supplier','Supplier ID'),date('expectedAt','Expected arrival',undefined,true),
      json('items','Purchase lines',[{sourceVariant:'',quantity:1,unitCost:0}],'Use mapped supplier variant IDs and BDT unit cost.'),
    ],{primary:true})}</div>
    {raw !== null && <>
      <ReportValues title="Purchase summary" data={purchase} description={id ?? ''} labels={{status:'Status',purchase_serial_id:'Reference',supplier:'Supplier ID',business_location:'Warehouse ID'}}/>
      {open && <div className="page-actions">
        {editor(context,'purchase-receive','Receive tracked units',[
          json('lines','Receipt lines',[{item:'',barcodes:['']}],'Use purchase line IDs and unused barcodes. Optional fields are bin and expiryDate.'),
        ],{id,primary:true})}
        {editor(context,'purchase-cancel','Cancel open quantities',[text('reason','Cancellation reason')],{id})}
      </div>}
      <Grid title="Purchase lines" data={{items:purchase.items}} columns={[col('Line ID','_id'),col('Variant','variant'),
        col('Ordered','qty|ordered_qty'),col('Received','qty_received'),col('Incoming','incoming')]}/>
    </>}
    {receipts && <Grid title="Receipts" data={receipts} columns={[col('Receipt','_id'),col('Lines','lines','count'),col('Staff ID','actor'),
      col('Received','createdAt','date')]} next={obj(receipts).next ? url(path,{...base,record:id,receiptsAfter:str(obj(receipts).next)}) : undefined}/>}
    <Grid title="Purchase orders" data={purchases} columns={[col('Purchase','purchase_serial_id|purchase_id|_id'),col('Supplier','supplier'),
      col('Warehouse','business_location'),status,col('Created','createdAt','date')]} select={row => url(path,{...base,record:str(row._id)})}
      next={obj(purchases).next ? url(path,{...base,after:str(obj(purchases).next)}) : undefined}/>
  </>;
}
