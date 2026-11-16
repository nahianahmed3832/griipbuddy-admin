import Link from 'next/link';
import { Search } from 'lucide-react';
import { api, ApiError, arr, canWrite, mongoId, obj, str, url, type RecordData, type Session } from '@/lib/api';
import { dateParam, param, perPage, printable, type Query } from '@/lib/data';
import { expenseId, expenseLabel, expenseStatuses, expenseViews, financePath, ledgerStatuses, paymentMethods,
  type FinanceChoices, type FinanceView } from '@/lib/finance-records';
import { adminPath } from '@/lib/paths';
import { purchasePage } from '@/lib/purchases';
import { has, type Region } from '@/lib/sections';
import { PageHeading } from './dashboard';
import { FinanceRecordActions, FinanceRecordForm } from './finance-record-forms';
import { Badge, Table } from './tables';
import '@/app/purchases.css';

const reference = (value: unknown) => str(obj(value)._id) || str(value);
const name = (value: unknown) => str(obj(value).name) || str(obj(value).title);
const coins = (amount: unknown) => printable(amount, 'money', 'BDT');
const validId = (value: string) => mongoId(value) ? value : undefined;
const flag = (value: string | undefined) => ['true', 'false'].find(option => option === value);
const safeSearch = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lookups = { category: 'expense-categories', subcategory: 'expense-subcategories', sales_channel: 'channels', payment_source: 'sources' } as const;
const choicesEmpty: FinanceChoices = { category: [], subcategory: [], sales_channel: [], payment_source: [] };

async function choicesFor(auth: Session, fields: (keyof FinanceChoices)[]) {
  const sets = await Promise.all(fields.map(async field => {
    const config = expenseViews[lookups[field]];
    const data = obj(await api(config.endpoint + '?limit=250', auth.token));
    return [field, arr(data.data).map(obj).filter(row => mongoId(str(row._id))).map(row => ({
      id: str(row._id), name: str(row[config.name]), parent: reference(row.category), type: str(row.type),
    })).sort((a, b) => a.name.localeCompare(b.name))] as const;
  }));
  return { ...choicesEmpty, ...Object.fromEntries(sets) };
}

const choiceLabels = { category: 'Category', subcategory: 'Subcategory', sales_channel: 'Sales channel', payment_source: 'Payment source' };
function Filters({ view, filters, search, choices }: {
  view: FinanceView; filters: Record<string, string | undefined>; search?: string; choices: FinanceChoices;
}) {
  const report = view === 'expense-report';
  const expenses = view === 'expenses' || report;
  const options = (label: string, field: string, values: string[]) => <label className="filter-label">{label}
    <select name={field} defaultValue={filters[field] || ''}><option value="">All</option>
      {values.map(value => <option value={value} key={value}>{expenseLabel(value)}</option>)}
    </select></label>;
  return <form action={adminPath(financePath(view))} className="panel padded purchase-filter-grid">
    <input type="hidden" name="region" value="BD"/>
    {!report && <label className="filter-label">Search<span className="search-input"><Search size={16} aria-hidden/><input name="q" maxLength={80} defaultValue={search}/></span></label>}
    {options('Status', 'status', expenses ? expenseStatuses : ledgerStatuses)}
    {expenses && <>
      {options('Payment method', 'payment_method', paymentMethods)}
      <label className="filter-label">Approval<select name="is_approved" defaultValue={filters.is_approved || ''}>
        <option value="">All</option><option value="true">Approved</option><option value="false">Unapproved</option>
      </select></label>
    </>}
    {report && <><label className="filter-label">From<input type="date" name="start_date" defaultValue={filters.start_date}/></label>
      <label className="filter-label">To<input type="date" name="end_date" defaultValue={filters.end_date}/></label></>}
    {(Object.keys(choices) as (keyof FinanceChoices)[]).filter(key => choices[key].length).map(key => <label className="filter-label" key={key}>
      {choiceLabels[key]}<select name={key} defaultValue={filters[key] || ''}><option value="">All</option>
        {choices[key].map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select></label>)}
    <div className="page-actions"><button className="button primary">Apply filters</button>
      <Link className="button secondary" href={url(financePath(view), { region: 'BD' })}>Reset</Link></div>
  </form>;
}

function selectedFilters(q: Query, view: FinanceView) {
  const expenses = view === 'expenses' || view === 'expense-report';
  const status = (expenses ? expenseStatuses : ledgerStatuses).find(value => value === param(q, 'status'));
  const category = validId(param(q, 'category') ?? '');
  const related = {
    category, subcategory: validId(param(q, 'subcategory') ?? ''), payment_source: validId(param(q, 'payment_source') ?? ''),
    payment_method: paymentMethods.find(value => value === param(q, 'payment_method')), is_approved: flag(param(q, 'is_approved')),
  };
  if (view === 'expense-report') return { status, ...related, start_date: dateParam(param(q, 'start_date')), end_date: dateParam(param(q, 'end_date')) };
  if (view === 'expenses') return { status, ...related, sales_channel: validId(param(q, 'sales_channel') ?? '') };
  return view === 'expense-subcategories' ? { status, category } : { status };
}

function breakdown(source: unknown) {
  return Object.entries(obj(source)).map(([key, value]) => ({ id: key, values: [expenseLabel(key), String(obj(value).count ?? 0), coins(obj(value).amount)] }));
}

async function ExpenseReport({ auth, q }: { auth: Session; q: Query }) {
  const filters = selectedFilters(q, 'expense-report');
  const [result, choices] = await Promise.all([
    api(url('/expense/report', filters), auth.token), choicesFor(auth, ['category', 'subcategory', 'payment_source']),
  ]);
  const report = obj(result);
  const meta = obj(report.meta);
  const columns = [{ label: 'Group', fields: '' }, { label: 'Transactions', fields: '' }, { label: 'Total (BDT)', fields: '' }];
  const categories = arr(report.data).map(obj).flatMap(category => {
    const label = str(category.title);
    return [{ id: str(category.categoryId), values: [label, String(category.transactionCount ?? 0), coins(category.totalAmount)] },
      ...arr(category.subcategories).map(obj).map((row, index) => ({ id: str(category.categoryId) + '-' + index,
        values: [label + ' / ' + str(row.title), String(row.transactionCount ?? 0), coins(row.totalAmount)] }))];
  });
  return <><PageHeading eyebrow="PAYMENTS" title="Expense report" description="Review spending by category, status, approval and payment source."/>
    <Filters view="expense-report" filters={filters} choices={choices}/>
    <section className="panel padded"><h2>Expense totals</h2><dl className="details-grid">
      <div><dt>Total amount</dt><dd>{coins(meta.grand_total)}</dd></div>
      <div><dt>Transactions</dt><dd>{String(meta.total_transactions ?? 0)}</dd></div>
      <div><dt>Average expense</dt><dd>{coins(meta.average_transaction)}</dd></div>
    </dl></section>
    <Table title="Category and subcategory" columns={columns} rows={categories}/>
    <Table title="Status breakdown" columns={columns} rows={breakdown(meta.status_breakdown)}/>
    <Table title="Approval breakdown" columns={columns} rows={breakdown(meta.approval_breakdown)}/>
    <Table title="Payment method breakdown" columns={columns} rows={breakdown(meta.payment_method_breakdown)}/>
    <Table title="Payment source breakdown" columns={columns} rows={arr(meta.payment_source_breakdown).map(obj).map((row, index) => ({
      id: str(row.paymentSourceId) || String(index), values: [str(row.name), String(row.count ?? 0), coins(row.amount)],
    }))}/>
  </>;
}

function fieldsForRecord(row: RecordData) {
  return {
    ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'number' ? String(value) : str(value)])),
    ...Object.fromEntries(Object.keys(lookups).map(key => [key, reference(row[key])])),
    expense_date: str(row.expense_date).slice(0, 10), attachments: arr(row.attachments).map(str).filter(Boolean).join('\n'),
  };
}

export async function FinanceRecordsPage({ auth, region, q, view, id }: { auth: Session; region: Region; q: Query; view: FinanceView; id?: string }) {
  if (!has(auth.staff, 'expense.view')) throw new ApiError(403);
  if (region !== 'BD') return <PageHeading eyebrow="PAYMENTS" title="Bangladesh expense ledger" description="Switch to Bangladesh to open the expense ledger.">
    <Link className="button secondary" href={url(financePath(view), { region: 'BD' })}>Open Bangladesh ledger</Link>
  </PageHeading>;
  if (view === 'expense-report') {
    if (id) throw new ApiError(404);
    return ExpenseReport({ auth, q });
  }
  const expenses = view === 'expenses';
  const config = expenseViews[view];
  const writable = canWrite(auth.staff);
  const canAdd = writable && has(auth.staff, 'expense.create');
  const canUpdate = writable && has(auth.staff, 'expense.update');
  const choices = (expenses ? Object.keys(lookups) : view === 'expense-subcategories' ? ['category'] : []) as (keyof FinanceChoices)[];
  const route = financePath(view);
  const href = (item?: string, params?: Record<string, string>) => url(route + (item ? '/' + item : ''), { region, ...params });
  const back = <Link className="button secondary" href={href()}>Back to {config.title.toLowerCase()}</Link>;
  if (id === 'new' || (id && param(q, 'edit') === '1')) {
    const create = id === 'new';
    if (create ? !canAdd : !canUpdate) throw new ApiError(403);
    if (!create && !(expenses ? expenseId(id) : mongoId(id))) throw new ApiError(404);
    const [record, lookups] = await Promise.all([create ? {} : api(config.endpoint + '/' + id, auth.token), choicesFor(auth, choices)]);
    return <><PageHeading eyebrow="PAYMENTS" title={(create ? 'Add ' : 'Edit ') + config.label} description="Fill in the details for this record.">{back}</PageHeading>
      <FinanceRecordForm view={view} id={create ? undefined : id} initial={fieldsForRecord(obj(record))} choices={lookups}/></>;
  }
  if (id) {
    if (!(expenses ? expenseId(id) : mongoId(id))) throw new ApiError(404);
    const record = obj(await api(config.endpoint + '/' + id, auth.token));
    if (!record._id) throw new ApiError(404);
    const detail = expenses ? [
      ['Expense ID', str(record.expense_id)], ['Amount', coins(record.amount)], ['Date', printable(record.expense_date, 'date')],
      ['Category', name(record.category)], ['Subcategory', name(record.subcategory)], ['Payment source', name(record.payment_source)],
      ['Payment method', expenseLabel(str(record.payment_method))], ['Sales channel', name(record.sales_channel)],
      ['Voucher number', str(record.voucher_no)], ['Account details', str(record.account_details)], ['Approval', record.is_approved === true ? 'Approved' : 'Unapproved'],
    ] : [['Reference', str(record.sku) || str(record.slug)], ['Type', expenseLabel(str(record.type))], ['Category', name(record.category)]].filter(([, value]) => value);
    const attachments = arr(record.attachments).map(str).filter(value => /^https:\/\/[^\s]+$/i.test(value));
    return <><PageHeading eyebrow="PAYMENTS" title={str(record[config.name])} description={config.title}>
      {back}{canUpdate && <Link className="button primary" href={href(id, { edit: '1' })}>Edit {config.label}</Link>}
    </PageHeading>
      {param(q, 'saved') === '1' && <p className="notice" role="status">Record saved.</p>}
      <section className="panel padded stack-form"><h2>Details</h2>
        <dl className="details-grid"><div><dt>Status</dt><dd><Badge value={str(record.status) || 'unknown'}/></dd></div>
          {detail.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
        {!!str(record.description) && <p>{str(record.description)}</p>}
        {attachments.length > 0 && <ul>{attachments.map((item, index) => <li key={item + index}><a href={item} target="_blank" rel="noreferrer">Open attachment {index + 1}</a></li>)}</ul>}
      </section>
      {expenses && <section className="panel padded stack-form"><h2>Staff notes</h2>
        {arr(record.notes).length ? <ul>{arr(record.notes).map(obj).map((note, index) => <li key={index}>{str(note.note)} <small>{str(note.user)} {printable(note.date, 'date')}</small></li>)}</ul> : <p>No notes recorded.</p>}
      </section>}
      <FinanceRecordActions view={view} id={id} status={str(record.status)} approved={record.is_approved === true} canUpdate={canUpdate}
        canApprove={expenses && writable && has(auth.staff, 'expense.approval')} canRemove={writable && has(auth.staff, 'expense.delete')}/>
    </>;
  }
  const page = purchasePage(q);
  const search = (param(q, 'q') ?? '').trim().slice(0, 80);
  const filters = selectedFilters(q, view);
  const [result, options] = await Promise.all([
    api(url(config.endpoint, { ...filters, searchTerm: safeSearch(search), page: String(page), limit: String(perPage) }), auth.token),
    choicesFor(auth, choices),
  ]);
  const data = obj(result);
  const total = Number(obj(data.meta).total) || 0;
  const columns = (expenses ? ['Title', 'Expense ID', 'Amount', 'Category', 'Payment method', 'Approval', 'Status', 'Date']
    : ['Name', ...(view === 'expense-subcategories' ? ['Parent category'] : []), 'Reference', 'Status']).map(label => ({ label, fields: '', ...(label === 'Status' || label === 'Approval' ? { kind: 'badge' as const } : {}) }));
  const rows = arr(data.data).map(obj).map(row => {
    const id = str(expenses ? row.expense_id : row._id);
    return { id, href: (expenses ? expenseId(id) : mongoId(id)) ? href(id) : undefined,
      values: expenses ? [str(row.title), id, coins(row.amount), name(row.category), expenseLabel(str(row.payment_method)), row.is_approved ? 'Approved' : 'Unapproved',
        str(row.status), printable(row.expense_date, 'date')] : [str(row[config.name]), ...(view === 'expense-subcategories' ? [name(row.category)] : []), str(row.sku) || str(row.slug), str(row.status)] };
  });
  const pageLink = (next: number) => url(route, { ...filters, region, q: search, page: String(next) });
  return <><PageHeading eyebrow="PAYMENTS" title={config.title} description={expenses ? 'Review the Bangladesh expense ledger.' : 'Maintain the records used in the expense ledger.'}>
    {expenses && <Link className="button secondary" href={url(financePath('expense-report'), { region })}>Expense report</Link>}
    {canAdd && <Link className="button primary" href={href('new')}>Add {config.label}</Link>}
  </PageHeading>
    {param(q, 'removed') === '1' && <p className="notice" role="status">Record removed.</p>}
    <Filters view={view} filters={filters} choices={options} search={search}/>
    <Table title={config.title} columns={columns} rows={rows} page={page} total={total}
      previous={page > 1 ? pageLink(page - 1) : undefined} next={page * perPage < total ? pageLink(page + 1) : undefined}/>
  </>;
}
