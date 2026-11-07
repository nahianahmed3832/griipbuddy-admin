import Link from 'next/link';
import { ArrowDownToLine, ArrowRight, History, RefreshCw } from 'lucide-react';
import { arr, ApiError, canWrite, integratedCheckoutEnabled, mongoId, obj, str, url, type RecordData, type Session } from '@/lib/api';
import { param, type Query } from '@/lib/data';
import { canManageAction, managedSlug, marketCode } from '@/lib/managed';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import { PageHeading } from './dashboard';
import { GalleryUpload, SupplierUpload, type ManagedField } from './managed-form';
import { afterId, col, editor, enabled, Grid, json, number, read, ReportValues, revision, status, text, windowFields, type Context } from './managed-common';
import { ManagedPurchases, ManagedStock } from './managed-inventory';
import { ManagedFulfillment, ManagedPayments, ManagedSourcing } from './managed-operations';

function NextReport({ context, data, record }: { context: Context; data: RecordData; record?: string }) {
  return mongoId(str(data.next)) ? <Link className="button secondary" href={url(context.path, {
    market: context.market, region: context.region, record, report: '1', reportAfter: str(data.next),
  })}>Next report page <ArrowRight size={16}/></Link> : null;
}

async function Campaigns(context: Context) {
  const { path, market, q, region } = context;
  const coupon = param(q,'coupon') === 'true' ? 'true' : param(q,'coupon') === 'false' ? 'false' : undefined;
  const current = afterId(q);
  const base = { market, region, coupon, after: current };
  const id = afterId(q, 'record');
  const data = obj(await read(context, url('/pricing/admin/markets/' + market + '/campaigns', { after: current, coupon })));
  const record = arr(data.items).map(obj).find(row => row._id === id);
  const report = record && param(q,'report') === '1'
    ? obj(await read(context, url('/growth/admin/campaigns/' + id + '/report', { after: afterId(q, 'reportAfter') }))) : undefined;
  return <>
    <div className="page-actions">
      {editor(context,'campaign','New campaign',[
        text('name','Campaign name'), text('code','Coupon code', undefined, true), ...windowFields(),
        json('benefit','Benefit', { kind: 'standard', discount: { type: 'percent', bps: 1000 } }, 'Use standard, flash, quantity or bundle. A 10% discount is 1,000 basis points.'),
        json('scope','Product scope', undefined, 'Optional product, category and variant ID arrays.'),
        json('eligibility','Eligibility', undefined, 'Optional minimum spend, customer type or loyalty tier.'),
        json('limits','Limits and promotional budget', undefined, 'Use orders, units, budgetMinor and perCustomer.'),
        json('allocations','Variant allocations', undefined, 'For flash and group-buy campaigns, use an array of variant IDs and unit limits.'),
        number('priority','Priority',0), { ...enabled(), name: 'exclusive', label: 'Exclusive' },
        { ...enabled(), name: 'allowSale', label: 'Apply to items on sale' }, { ...enabled(), name: 'groupOnly', label: 'Group purchases only' },
        text('stackGroup','Stacking group',undefined,true),
      ],{primary:true})}
      <Link className="button secondary" aria-current={!coupon ? 'true' : undefined} href={url(path,{market,region})}>All campaigns</Link>
      <Link className="button secondary" aria-current={coupon === 'true' ? 'true' : undefined} href={url(path,{market,region,coupon:'true'})}>Coupons</Link>
      <Link className="button secondary" aria-current={coupon === 'false' ? 'true' : undefined} href={url(path,{market,region,coupon:'false'})}>Automatic</Link>
    </div>
    {record && <section className="panel padded managed-record">
      <div><h2>{str(record.name)}</h2><p className="muted">Campaign ID {id} · Revision {revision(record)}</p></div>
      <div className="page-actions">{editor(context,'campaign-update','Edit schedule and status',windowFields(record), { id, revision: revision(record) })}
        <Link className="button secondary" href={url(path,{...base,record:id,report:'1'})}>View performance</Link></div>
    </section>}
    {report && <><ReportValues title="Campaign performance" description={'This report page uses ' + str(report.currency) + ' minor units. Contribution covers paid orders with recorded costs.'} data={report}
      labels={{ claims:'Claims', released:'Released claims', fullyPaid:'Fully paid orders', netPaidMinor:'Net paid', discountsMinor:'Discounts', costed:'Orders with costs', contributionMinor:'Estimated contribution' }}/>
      {mongoId(str(report.next)) && <Link className="button secondary" href={url(path,{...base,record:id,report:'1',reportAfter:str(report.next)})}>Next report page <ArrowRight size={16}/></Link>}</>}
    <Grid title="Campaigns" data={data} columns={[col('Campaign','name'), col('Code','code'), col('Type','benefit.kind|kind'),
      status, col('Budget (minor)','limits.budgetMinor'), col('Used (minor)','spentMinor'), col('Ends','endsAt','date')]}
      select={row => url(path,{...base,record:str(row._id)})} next={data.next ? url(path,{...base,after:str(data.next)}) : undefined}/>
  </>;
}

async function GroupsOrCollections(context: Context, groups: boolean) {
  const { market, path, q, region } = context;
  const cursor = param(q,'after') ?? '';
  const after = (groups ? mongoId(cursor) : managedSlug(cursor)) ? cursor : undefined;
  const base = { market, region, after };
  const endpoint = '/growth/admin/' + (groups ? 'groups/' : 'collections/');
  const data = obj(await read(context, url(endpoint + market, { after })));
  const id = param(q,'record');
  const key = groups ? '_id' : 'slug';
  const selected = arr(data.items).map(obj).find(row => row[key] === id);
  const makeFields = (record: RecordData, create = false): ManagedField[] => groups ? [
    text('product','Product ID',record.product), text('variant','Variant ID',record.variant),
    ...windowFields(record), number('durationMinutes','Time limit in minutes',record.durationMinutes ?? 10),
    { name:'payment', label:'Payment mode', type:'select', choices:['cod','prepaid'], value:str(record.payment) || 'cod' },
    json('tiers','Participant tiers',record.tiers ?? [{ threshold: 2, campaign: '' }],'Each threshold needs a group-only campaign ID for this variant.'),
  ] : [
    ...(create ? [text('slug','Collection slug')] : []), text('name','Collection name',record.name), ...windowFields(record),
    json('products','Ordered product IDs',record.products ?? [],'Add up to 30 products available in this market.'),
  ];
  const label = groups ? 'group offer' : 'collection';
  return <>
    <div className="page-actions">{editor(context,groups ? 'group-new' : 'collection','New ' + label,
      makeFields({}, true),{revision:null,primary:true})}</div>
    {selected && <section className="panel padded managed-record"><div><h2>{groups ? 'Group offer' : str(selected.name)}</h2>
      <p className="muted">{id} · Revision {revision(selected)}</p></div>
      {editor(context,groups ? 'group-update' : 'collection','Edit ' + label,makeFields(selected),{id,revision:revision(selected)})}
    </section>}
    <Grid title={groups ? 'Group offers' : 'Curated collections'} data={data} columns={groups
      ? [col('Variant','variant'), status, col('Tiers','tiers','count'), col('Payment','payment'), col('Ends','endsAt','date')]
      : [col('Collection','name'), col('Slug','slug'), status, col('Products','products','count'), col('Ends','endsAt','date')]}
      select={row => url(path,{...base,record:str(row[key])})} next={data.next ? url(path,{...base,after:str(data.next)}) : undefined}/>
  </>;
}

async function Policies(context: Context, view: string) {
  const { market, q, path, region } = context;
  const rewards = view === 'rewards';
  const coverage = view === 'coverage';
  const endpoint = rewards ? '/growth/admin/rewards/' : coverage ? '/global/admin/markets/' : '/pricing/admin/markets/';
  const [raw, report] = await Promise.all([
    read(context, endpoint + market).catch(error => {
      if (coverage && error instanceof ApiError && error.status === 409) return null;
      throw error;
    }),
    rewards ? read(context, url('/growth/admin/referrals/' + market + '/report', { after: afterId(q, 'reportAfter') })) : null,
  ]);
  const policy = obj(raw);
  const settings = obj(policy.settings);
  const fields = rewards ? [
    enabled(policy.enabled), number('pointsPerMajor','Points per currency unit',policy.pointsPerMajor ?? 1),
    number('referralPoints','Points for a verified referral',policy.referralPoints ?? 0),
    number('pointsPerCreditMinor','Points per credit minor unit',policy.pointsPerCreditMinor ?? 1),
    number('maxCreditMinor','Maximum credit (minor units)',policy.maxCreditMinor ?? 100),
    json('tiers','Loyalty tiers',policy.tiers ?? [{ name:'standard',earned:0 }],'The first tier starts at zero earned points.'),
  ] : coverage ? [
    json('methods','Payment methods',policy.methods ?? { cod: { provider:'cod',enabled:false,mode:'sandbox' } },
      'Use sandbox mode for COD, manual advance, Stripe and PayPal. Credentials are configured on the server.'),
    json('zones','Shipping services',policy.zones ?? [],
      'Include service, provider, origin country, enabled, base and perKg. Use external services for international coverage.'),
  ] : [
    enabled(policy.enabled), { ...enabled(settings.fxFallback), name:'fxFallback',label:'Enable exchange-rate fallback' },
    { ...enabled(settings.requireCosts), name:'requireCosts',label:'Require landed costs' },
    number('minUnitMinor','Minimum unit price (minor units)',settings.minUnitMinor,true),
    number('minUnitMarginBps','Minimum margin (basis points)',settings.minUnitMarginBps,true),
    number('minContributionBps','Minimum contribution (basis points)',settings.minContributionBps,true),
    number('shippingCostMinor','Merchant shipping cost (minor units)',settings.shippingCostMinor,true),
    json('fees','Estimated payment fees',settings.fees,'Optional fixedMinor and bps for each payment method.'),
  ];
  return <>
    {coverage && integratedCheckoutEnabled() && <div className="notice">
      Cart checkout coverage is read-only in this workspace. Use <Link className="table-link" href={url('/desk/markets/checkout',{region})}>Step 9 storefront controls</Link> for Step 9 markets.
    </div>}
    <section className="panel padded managed-record">
      <div><h2>{str(policy.currency) ? market + ' · ' + str(policy.currency) : market}</h2>
        <p className="muted">{raw ? 'Revision ' + revision(policy) + ' · Updated ' + (str(policy.updatedAt).slice(0, 10) || '—')
          : 'No compatible policy is available. Check the country currency and current policy before creating one.'}</p></div>
      {editor(context,rewards ? 'rewards' : coverage ? 'coverage' : 'policy',raw ? 'Edit policy' : 'Configure policy',fields,
        {revision:revision(policy),primary:true})}
    </section>
    {raw !== null && <ReportValues title={rewards ? 'Rewards settings' : coverage ? 'Coverage settings' : 'Pricing guardrails'}
      description="Current configuration from the commerce API" data={rewards ? policy : coverage
        ? { ...policy, methods:Object.keys(obj(policy.methods)).length, zones:arr(policy.zones).length } : { ...policy, ...settings }}
      labels={rewards ? {enabled:'Status', pointsPerMajor:'Points per currency unit', referralPoints:'Referral points', maxCreditMinor:'Maximum credit'}
        : coverage ? { methods:'Configured payment methods', zones:'Shipping services', actor:'Updated by' }
          : { enabled:'Status', fxFallback:'Exchange-rate fallback', requireCosts:'Cost required', minContributionBps:'Contribution floor (bps)' }}/>}
    {rewards && <><ReportValues title="Referral conversions" description="Claims and verified conversions on this report page." data={obj(report)}
      labels={{claims:'Retained claims',groupClaims:'From group invitations',verifiedConversions:'Verified conversions'}}/>
      <NextReport context={{...context,path,region}} data={obj(report)}/></>}
  </>;
}

async function ListsOrHistory(context: Context, history: boolean) {
  const { market, q, path, region } = context;
  const base = { market, region, after: afterId(q) };
  const prefix = '/pricing/admin/markets/' + market;
  const data = obj(await read(context, url(prefix + (history ? '/history' : '/lists'), { after: base.after })));
  const id = afterId(q,'record');
  const record = arr(data.items).map(obj).find(row => row._id === id);
  const edit = (row: RecordData) => [
    text('name','Price list name',row.name), ...windowFields(row,true), number('priority','Priority',row.priority ?? 0),
  ];
  const versions = record && !history ? obj(await read(context, url('/pricing/admin/lists/' + id + '/versions', { after: afterId(q,'versionAfter') }))) : undefined;
  return <>
    {!history && <div className="page-actions">{editor(context,'price-list','New price list',[text('slug','List slug'), ...edit({})],{primary:true})}</div>}
    {record && !history && <section className="panel padded managed-record"><div><h2>{str(record.name)}</h2><p className="muted">{id} · Revision {revision(record)}</p></div>
      <div className="page-actions">{editor(context,'list-update','Edit list',edit(record),{id,revision:revision(record)})}
        {editor(context,'price-versions','Schedule SKU prices',[
          json('entries','Price entries',[{ product:'',variant:'',regularMinor:100,startsAt:'' }],'Use minor units and ISO UTC times. Optional sale windows and landed costs use the pricing contract.'),
        ],{id})}</div></section>}
    {versions && <Grid title="Scheduled prices" data={versions} columns={[col('Variant','variant'),col('Regular (minor)','regularMinor'),
      col('Sale (minor)','saleMinor'),col('Starts','startsAt','date'),col('Ends','endsAt','date')]}
      next={versions.next ? url(path,{...base,record:id,versionAfter:str(versions.next)}) : undefined}/>}
    <Grid title={history ? 'Market change history' : 'Price lists'} data={data} columns={history
      ? [col('Change','kind'),col('Staff ID','actor'),col('Record','subject|values.slug'),col('Revision','values.revision'),col('Date','createdAt','date')]
      : [col('Name','name'),col('Slug','slug'),status,col('Priority','priority'),col('Starts','startsAt','date'),col('Ends','endsAt','date')]}
      select={history ? undefined : row => url(path,{...base,record:str(row._id)})}
      next={data.next ? url(path,{...base,after:str(data.next)}) : undefined}/>
  </>;
}

async function Imports(context: Context) {
  const { market, path, q, region } = context;
  const supplier = afterId(q,'supplier');
  const record = afterId(q,'record');
  const base = { market, region, supplier };
  const supplierPage = afterId(q,'supplierAfter');
  const after = afterId(q);
  const [suppliers, jobs, jobResult] = await Promise.all([
    supplier ? read(context, '/catalog/suppliers/' + supplier) : read(context, url('/catalog/suppliers', { after: supplierPage })),
    supplier ? read(context, url('/catalog/suppliers/' + supplier + '/imports', { after })) : null,
    supplier && record ? read(context, '/catalog/imports/' + record) : null,
  ]);
  const job = obj(jobResult).supplier === supplier && jobResult ? obj(jobResult) : null;
  if (jobResult && !job) throw new ApiError(404);
  const results = job ? obj(await read(context, url('/catalog/imports/' + record + '/rows',{after:afterId(q,'rowAfter')}))) : null;
  return <>
    {supplier && <p className="notice">Supplier · {str(obj(suppliers).name) || supplier}</p>}
    {supplier && canWrite(context.auth.staff) && canManageAction(context.auth, 'import-retry') &&
      <SupplierUpload key={supplier} supplier={supplier} path={url(path, base)}/>}
    {supplier && <div className="page-actions"><Link className="button secondary" href={url(path,base)}><RefreshCw size={15}/> Refresh jobs</Link>
      <Link className="button subtle" href={url(path,{market,region})}>Change supplier</Link></div>}
    {job && <div className="panel padded managed-record"><div><h2>{str(job.filename) || 'Import job'}</h2>
      <p className="muted">{str(job.status)} · {record}</p>{str(job.error) && <p>{str(job.error)}</p>}</div>
      {job.status === 'failed' && editor(context,'import-retry','Retry import',[],{id:record})}</div>}
    {results && <Grid title="Row outcomes" data={results} columns={[col('Row','line|index|rowNumber|row'),
      col('Status','status|outcome','badge'),col('Issue','error|message|reason'),col('Product','product')]}
      next={results.next ? url(path,{...base,after,record,rowAfter:str(results.next)}) : undefined}/>}
    {jobs ? <Grid title="Import jobs" data={jobs} columns={[col('Feed','filename|format'),status,col('Applied','applied'),col('Rejected','rejected'),col('Created','createdAt','date')]}
      select={row => url(path,{...base,after,record:str(row._id)})} next={obj(jobs).next ? url(path,{...base,after:str(obj(jobs).next)}) : undefined}/>
      : <Grid title="Select a supplier" data={suppliers} columns={[col('Supplier','name'),col('Reference','contact_id'),col('Type','type')]}
        select={row => url(path,{market,region,supplier:str(row._id)})}
        next={obj(suppliers).next ? url(path,{market,region,supplierAfter:str(obj(suppliers).next)}) : undefined}/>}
  </>;
}

async function Listings(context: Context) {
  const { q, market, path, region } = context;
  const sku = (param(q,'sku') ?? '').trim().slice(0,100);
  const base = { market, region, after: afterId(q), sku };
  const id = afterId(q,'record');
  const [data, raw] = await Promise.all([
    read(context, url('/catalog/products', { after:base.after, sku })),
    id ? read(context, '/catalog/products/' + id) : null,
  ]);
  const record = obj(raw);
  const fields = (row: RecordData = {}): ManagedField[] => [
    text('name','Product name',row.name), { ...text('description','Description',row.description),type:'multiline' },
    text('approximately_delivery_time','Delivery estimate',row.approximately_delivery_time),
    {...json('images','Gallery asset IDs',obj(row.catalog_content).images,'Ordered array of media IDs from the gallery asset uploader.'),optional:true},
  ];
  const state = str(record.state) || str(record.catalog_state) || (record.is_published ? 'published' : 'draft');
  const steps: Record<string,string[]> = {draft:['submit','archive'],pending_review:['approve','reopen','archive'],
    approved:['publish','reopen','archive'],published:['reopen','archive'],archived:['reopen']};
  const [variants, events] = id ? await Promise.all([
    read(context, url('/catalog/products/' + id + '/variants',{after:afterId(q,'variantAfter')})),
    read(context, url('/catalog/products/' + id + '/events',{after:afterId(q,'eventAfter')})),
  ]) : [];
  return <>
    <div className="page-actions">{editor(context,'listing-new','Create product draft',[
      text('sku','Product SKU'), ...fields(), text('category','Category ID'), text('subcategory','Subcategory ID'),
    ],{primary:true})}</div>
    {id && raw !== null && <section className="panel padded managed-record"><div><h2>{str(record.name)}</h2><p className="muted">{state.replaceAll('_',' ')} · {id}</p></div>
      <div className="page-actions">{state === 'draft' && <>
        {editor(context,'listing-edit','Edit draft',fields(record),{id})}
        {editor(context,'listing-variant','Add variant',[text('sku','Variant SKU'),json('attributes','Variant options',{},'For example, {"Color":"Black"}.')],{id})}
        {editor(context,'listing-coverage','Edit market coverage',[
          {name:'region',label:'Product region',type:'select',choices:['BD','INTERNATIONAL'],value:str(record.region)},
          json('available_countries','Country IDs',arr(record.available_countries)),
          json('sale_channels','Sales channels',record.sale_channels ?? {website:true,pos:false}),
        ],{id})}
      </>}{(steps[state] ?? []).map(step => editor(context,'listing-transition',step.charAt(0).toUpperCase() + step.slice(1),[],{id,step,
        description:step === 'reopen' || step === 'archive' ? 'This takes a published product offline.' : 'The API validates listing readiness before changing state.'}))}</div>
    </section>}
    {state === 'draft' && id && canWrite(context.auth.staff) && canManageAction(context.auth,'listing-edit') && <GalleryUpload/>}
    {state === 'draft' && id && variants && arr(obj(variants).items).length > 0 && <section className="panel padded stack-form">
      <h2>Draft variant pricing</h2>
      <div className="page-actions">{arr(obj(variants).items).map(obj).map(variant =>
        editor(context,'listing-price','Price ' + str(variant.sku),[
          {name:'currency',label:'Currency',type:'select',choices:['BDT','USD','EUR','AUD'],value:'BDT'},
          { ...number('regular_price','Regular price'), type:'decimal' }, { ...number('sale_price','Sale price',0), type:'decimal' },
        ],{id,step:str(variant._id),description:'Enter major currency units. A sale price of zero keeps the regular price.'}))}</div>
    </section>}
    {variants && <Grid title="Variants" data={variants} columns={[col('SKU','sku'),col('Barcode','barcode'),col('BDT regular','regular_price'),col('BDT sale','sale_price')]}
      next={obj(variants).next ? url(path,{...base,record:id,variantAfter:str(obj(variants).next)}) : undefined}/>}
    {events && <Grid title="Listing activity" data={events} columns={[col('New state','to','badge'),col('Previous state','from','badge'),col('Staff ID','actor'),col('Date','createdAt','date')]}
      next={obj(events).next ? url(path,{...base,record:id,eventAfter:str(obj(events).next)}) : undefined}/>}
    <form action={adminPath(path)} className="panel filters">
      <input type="hidden" name="market" value={market}/><input type="hidden" name="region" value={region}/>
      <label className="filter-label">Exact product SKU<input name="sku" maxLength={100} defaultValue={sku}/></label>
      <button className="button secondary">Search listings</button>
    </form>
    <Grid title="Listing records" data={data} columns={[col('Product','name'),col('SKU','sku'),status,col('Market region','region')]}
      select={row => url(path,{...base,record:str(row._id)})} next={obj(data).next ? url(path,{...base,after:str(obj(data).next)}) : undefined}/>
  </>;
}

async function Taxonomy(context: Context) {
  const { q, region, path } = context;
  const parent = afterId(q,'parent');
  const depth = parent && ['1','2','3'].includes(param(q,'depth') ?? '') ? param(q,'depth')! : '0';
  const after = afterId(q);
  const base = {region, depth, parent:depth === '0' ? undefined : parent};
  const rows = obj(await read(context,url('/catalog/categories/' + depth,{after,parent:base.parent})));
  const id = afterId(q,'record');
  const selected = arr(rows.items).map(obj).find(row => row._id === id);
  const fields = (row: RecordData = {}, optional = false): ManagedField[] => [
    text('name_en','English name',row.name_en ?? row.name,optional),text('name_bn','Bangla name',row.name_bn,optional),
    {...text('description_en','English description',row.description_en,optional),type:'multiline'},
    {...text('description_bn','Bangla description',row.description_bn,optional),type:'multiline'},
    number('position','Position',row.position ?? 0),
    {...enabled(row.is_published),name:'is_published',label:'Published'},
  ];
  return <>
    <div className="page-actions">{editor(context,'taxonomy-new','New category',[
      text('slug','Category slug'),...(base.parent ? [text('parent','Direct parent ID',base.parent)] : []),...fields(),
    ],{step:depth,primary:true})}
      {depth !== '0' && <Link className="button secondary" href={url(path,{region})}>Root categories</Link>}
    </div>
    {selected && <section className="panel padded managed-record">
      <div><h2>{str(selected.name_en) || str(selected.name)}</h2><p className="muted">{id}</p></div>
      <div className="page-actions">{editor(context,'taxonomy-edit','Edit category',fields(selected,true),{id,step:depth})}
        {depth !== '3' && <Link className="button secondary" href={url(path,{region,depth:String(Number(depth) + 1),parent:id})}>
          Open child categories <ArrowRight size={15}/></Link>}</div>
    </section>}
    <Grid title={depth === '0' ? 'Root categories' : 'Child categories · level ' + depth}
      data={rows} columns={[col('Category','name_en|name'),col('Bangla name','name_bn'),col('Slug','slug'),col('ID','_id'),col('Position','position'),
        col('Published','is_published','badge')]} select={row => url(path,{...base,after,record:str(row._id)})}
      next={rows.next ? url(path,{...base,after:str(rows.next)}) : undefined}/>
  </>;
}

async function Recommendations(context: Context) {
  const { market, path, region, q } = context;
  const days = ['1','7','14','30'].includes(param(q,'days') ?? '') ? param(q,'days') : '7';
  const [config, raw] = await Promise.all([
    read(context, '/discovery/admin/rules/' + market).then(obj),
    read(context, url('/discovery/admin/analytics/' + market,{days})).then(obj),
  ]);
  const placements = arr(raw.placements).map(obj).map(row => ({
    ...row, _id:row.section,
    ctr:typeof row.clickThrough === 'number' ? new Intl.NumberFormat('en',{style:'percent',maximumFractionDigits:1}).format(row.clickThrough) : null,
    conversionRate:typeof row.conversion === 'number' ? new Intl.NumberFormat('en',{style:'percent',maximumFractionDigits:1}).format(row.conversion) : null,
  }));
  return <>
    <div className="page-actions">{editor(context,'recommendations','Edit recommendation rules',[
      json('sections','Enabled placements',config.sections),json('weights','Ranking weights',config.weights),
      json('excludeProducts','Excluded product IDs',config.excludeProducts),json('excludeCategories','Excluded category IDs',config.excludeCategories),
      json('boost','Product boosts',config.boost,'Use product IDs and a score from 0 to 20. You may restrict a boost to a campaign slug.'),
      number('trendDays','Trend window (days)',config.trendDays),number('minTrendSubjects','Minimum qualifying audience',config.minTrendSubjects),
    ],{revision:revision(config),primary:true})}
      {['1','7','14','30'].map(option => <Link key={option} className="button secondary" href={url(path,{market,region,days:option})}
        aria-current={option === days ? 'true' : undefined}>{option === '1' ? '1 day' : option + ' days'}</Link>)}
    </div>
    <p className="notice">This report uses consented activity and the market’s minimum audience threshold. Attributed paid value is in {str(raw.currency) || 'market currency'} minor units.</p>
    <Grid title="Placement performance" data={{items:placements}} columns={[col('Placement','section'),col('Impressions','impression.events'),
      col('Clicks','click.events'),col('Click-through rate','ctr'),col('Paid conversions','purchase.events'),col('Conversion rate','conversionRate'),
      col('Attributed paid value','purchase.revenueMinor')]}/>
  </>;
}

const screens = {
  campaigns: Campaigns,
  recommendations: Recommendations,
  groups: (context: Context) => GroupsOrCollections(context, true),
  collections: (context: Context) => GroupsOrCollections(context, false),
  rewards: (context: Context) => Policies(context, 'rewards'),
  coverage: (context: Context) => Policies(context, 'coverage'),
  policy: (context: Context) => Policies(context, 'policy'),
  lists: (context: Context) => ListsOrHistory(context, false),
  history: (context: Context) => ListsOrHistory(context, true),
  imports: Imports,
  'listing-studio': Listings,
  taxonomy: Taxonomy,
  'managed-stock': ManagedStock,
  'managed-purchases': ManagedPurchases,
  sourcing: ManagedSourcing,
  'shipment-desk': ManagedFulfillment,
  'payment-desk': ManagedPayments,
} satisfies Record<string, (context: Context) => Promise<React.ReactNode>>;

const descriptions: Record<string,string> = {
  recommendations:'Configure merchandising placement and review consented attribution.',
  campaigns:'Manage promotion schedules, coupon eligibility, allocations and budgets.',
  groups:'Configure group-buy tiers, payment modes and participation windows.',
  rewards:'Manage the market loyalty policy and review verified referral conversions.',
  collections:'Schedule ordered product shelves used by the storefront.',
  policy:'Configure checkout pricing, exchange-rate fallback and margin thresholds.',
  lists:'Manage market price lists and schedule audited SKU prices.',
  history:'Review the staff and revisions behind managed commerce changes.',
  coverage:'Set checkout payment availability and domestic or international shipping zones.',
  imports:'Queue approved supplier feeds and review job and row outcomes.',
  taxonomy:'Create and edit category hierarchies and localized category labels.',
  'listing-studio':'Manage catalog drafts, variants and market publication workflow.',
  'managed-stock':'Inspect physical stock, FIFO lots and bins in the recovered warehouses.',
  'managed-purchases':'Open supplier purchase orders and receive tracked units into existing stock.',
  sourcing:'Map a Chinese supplier variant to a Chinese warehouse for international fulfillment.',
  'shipment-desk':'Manage the checkout order’s warehouse allocations, courier handover and tracking.',
  'payment-desk':'Review payment attempts and evidence on an existing checkout order.',
};

export async function ManagedWorkspace({ auth, q, region, path, view, title }: {
  auth: Session; q: Query; region: Region; path: string; view: string; title: string;
}) {
  const requested = (param(q,'market') ?? 'BD').toUpperCase();
  if (!marketCode(requested)) throw new ApiError(404);
  const context = { market: requested, auth, path, q, region };
  if (!Object.hasOwn(screens, view)) throw new ApiError(404);
  const scoped = ['campaigns','groups','collections','rewards','recommendations','coverage','policy','lists','history'].includes(view);
  const content = await screens[view as keyof typeof screens](context);
  return <>
    <PageHeading eyebrow="MANAGED COMMERCE" title={title} description={descriptions[view]}>
      {view === 'history' && <span className="light-tag"><History size={14}/> Recorded by the API</span>}
      {view === 'imports' && <span className="light-tag"><ArrowDownToLine size={14}/> CSV and XLSX</span>}
    </PageHeading>
    {scoped && <form action={adminPath(path)} className="panel filters managed-market">
      <input type="hidden" name="region" value={region}/>
      <label className="filter-label">Country code<input name="market" aria-label="Country code" pattern="[A-Za-z]{2}" maxLength={2} defaultValue={requested} required/></label>
      <button className="button secondary">Open market</button>
      <p className="muted">Managed pricing, promotions and fulfillment use the selected country.</p>
    </form>}
    {content}
  </>;
}
