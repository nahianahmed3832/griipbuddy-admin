import Link from 'next/link';
import { Ellipsis, Plus, Search } from 'lucide-react';
import { api, ApiError, arr, canWrite, mongoId, obj, str, url, type RecordData, type Session } from '@/lib/api';
import { dateParam, param, perPage, printable, type Query } from '@/lib/data';
import { expenseId, expenseLabel, expenseStatuses, expenseViews, financePath, ledgerStatuses, paymentMethods, productionFinancePath,
  type FinanceChoices, type FinanceView } from '@/lib/finance-records';
import { adminPath } from '@/lib/paths';
import { expenseAttachmentPath } from '@/lib/finance-attachment';
import { purchasePage } from '@/lib/purchases';
import { has, type Region } from '@/lib/sections';
import { PageHeading } from './dashboard';
import { ExpenseReportCategoryFilters, FinanceDialog, FinanceListFilters, FinanceRecordActions, FinanceRecordForm } from './finance-record-forms';
import { Badge, Table } from './tables';
import '@/app/purchases.css';
import styles from './production-finance.module.css';

const reference = (value: unknown) => str(obj(value)._id) || str(value);
const name = (value: unknown) => str(obj(value).name) || str(obj(value).title);
const actorName = (value: unknown) => name(value) || str(obj(obj(value)._id).full_name);
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

function selectedFilters(q: Query, view: FinanceView): Record<string, string | undefined> {
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

async function ExpenseReport({ auth, q, production }: { auth: Session; q: Query; production?: boolean }) {
  const filters = selectedFilters(q, 'expense-report');
  if (production) {
    filters.status = param(q, 'status') === undefined ? 'paid' : filters.status;
    filters.is_approved = param(q, 'is_approved') === undefined ? 'true' : filters.is_approved;
    if (!filters.category) delete filters.subcategory;
  }
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
  if (production) {
    const currency = new Intl.NumberFormat('en-BD', { maximumFractionDigits: 2 });
    const numeric = (value: unknown) => currency.format(Number(value) || 0);
    const paymentSources = arr(meta.payment_source_breakdown).map(obj);
    const group = (title: string, source: unknown, keys: string[]) => <section className={styles.card}><h2>{title}</h2>
      <dl className={styles.breakdown}>{keys.map(key => {
        const record = obj(obj(source)[key]);
        return <div key={key} style={{ display: 'contents' }}><dt>{({ true: 'Approved', false: 'Unapproved', mobile_banking: 'Mobile Banking' } as Record<string,string>)[key] ?? expenseLabel(key)}</dt>
          <dd>{numeric(record.amount)} ({numeric(record.count)})</dd></div>;
      })}</dl></section>;
    const select = (field: string, all: string, entries: { id: string; name: string }[]) => <label key={field}>
      <select aria-label={all} name={field} defaultValue={filters[field] || ''}>
        <option value="">{all}</option>{entries.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>;
    const labels = (values: string[]) => values.map(id => ({ id, name: id === 'mobile_banking' ? 'Mobile Banking' : expenseLabel(id) }));
    const reportRows = arr(report.data).map(obj).flatMap(row => {
      const title = str(row.title);
      return [{ title, sku: str(row.sku), subcategory: false, id: str(row.categoryId), transactions: row.transactionCount, sum: row.totalAmount },
        ...arr(row.subcategories).map(obj).map((sub, index) => ({ title: str(sub.title), sku: '', subcategory: true,
          id: str(row.categoryId) + '-' + index, transactions: sub.transactionCount, sum: sub.totalAmount }))];
    });
    return <>
      <header className={styles.heading}><h1>Expense Report</h1><p>Spend analytics across categories, statuses and payment methods.</p></header>
      <div className={styles.report}>
        <p className={styles.notice}>Showing paid, approved expenses (what the Overview counts). Change Status or Approval to include pending or rejected ones. Dates are Bangladesh days.</p>
        <FinanceListFilters path={productionFinancePath('expense-report')} preserveEmpty={['status', 'is_approved']}>
          <label>From<input name="start_date" type="date" defaultValue={filters.start_date}/></label>
          <label>To<input name="end_date" type="date" defaultValue={filters.end_date}/></label>
          {select('status', 'All statuses', labels(expenseStatuses))}
          {select('payment_method', 'All methods', labels(paymentMethods))}
          {select('is_approved', 'All approvals', [{ id: 'true', name: 'Approved' }, { id: 'false', name: 'Unapproved' }])}
          <ExpenseReportCategoryFilters key={(filters.category ?? '') + '/' + (filters.subcategory ?? '')}
            category={filters.category ?? ''} subcategory={filters.subcategory ?? ''} choices={choices}/>
          {select('payment_source', 'All sources', choices.payment_source)}
        </FinanceListFilters>
        <div className={styles.summary}>
          {[['Grand Total', meta.grand_total], ['Transactions', meta.total_transactions], ['Avg. Transaction', meta.average_transaction], ['Categories', arr(report.data).length]].map(([label, value]) =>
            <section key={String(label)} className={styles.card}><h2>{String(label)}</h2><p>{numeric(value)}</p></section>)}
        </div>
        <div className={styles.breakdowns}>
          {group('By Status', meta.status_breakdown, ['paid', 'pending', 'rejected'])}
          {group('By Payment Method', meta.payment_method_breakdown, paymentMethods)}
          {group('By Approval', meta.approval_breakdown, ['true', 'false'])}
        </div>
        {paymentSources.length > 0 && <section className={styles.card}><h2>By Payment Source</h2>
          <dl className={styles.paymentSources}>{paymentSources.map(row => <div key={str(row.paymentSourceId) || str(row.name)}>
            <dt>{str(row.name)}</dt><dd>{numeric(row.amount)} <span>({numeric(row.count)})</span></dd>
          </div>)}</dl>
        </section>}
        <section className={styles.card + ' ' + styles.records}>
          <table><thead><tr><th>Category / Subcategory</th><th>Transactions</th><th>Avg</th><th>Total</th></tr></thead>
            <tbody>{reportRows.length ? reportRows.map(row => <tr key={row.id} className={row.subcategory ? undefined : styles.category}>
              <td className={row.subcategory ? styles.subcategory : undefined}>{row.subcategory && '↳ '}{row.title}
                {row.sku && <span className={styles.sku}>{row.sku}</span>}</td><td>{numeric(row.transactions)}</td>
              <td>{numeric(Number(row.sum) / Math.max(Number(row.transactions) || 0, 1))}</td><td>{numeric(row.sum)}</td></tr>)
              : <tr><td className={styles.empty} colSpan={4}>No expenses match these filters.</td></tr>}</tbody>
          </table>
        </section>
      </div>
    </>;
  }
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

const financeTableLabels: Record<Exclude<FinanceView, 'expense-report'>, { title: string; description: string; singular: string; none: string; columns: string[] }> = {
  expenses: { title: 'Expenses', description: '', singular: 'Expense', none: 'No expenses match these filters.',
    columns: ['Expense ID', 'Title', 'Category', 'Amount', 'Payment', 'Status', 'Approval', 'Date', 'Actions'] },
  'expense-categories': { title: 'Expense Categories', description: 'Top-level buckets for organising expenses (e.g. Marketing, Salary, Rent).',
    singular: 'Category', none: 'No categories yet.', columns: ['Title','SKU','Type','Status','Created','Actions'] },
  'expense-subcategories': { title: 'Expense Subcategories', description: 'Finer breakdowns under a parent category (e.g. Facebook Ads under Marketing).',
    singular: 'Subcategory', none: 'No subcategories yet.', columns: ['Title','Parent Category','SKU','Type','Status','Actions'] },
  channels: { title: 'Sales Channels', description: 'Ad platforms that ADs-type expenses are attributed to.',
    singular: 'Channel', none: 'No sales channels yet.', columns: ['Name','Slug','Status','Created','Actions'] },
  sources: { title: 'Payment Sources', description: 'Where expenses are paid from (e.g. BD Office, China, Personal).',
    singular: 'Source', none: 'No payment sources yet.', columns: ['Name','Slug','Status','Created','Actions'] },
};

function ProductionFinanceRecords({ view, records, total, search, filters, options, canAdd, canUpdate, canApprove, canRemove, page, pageLink }: {
  view: Exclude<FinanceView, 'expense-report'>; records: RecordData[]; total: number; search: string; filters: Record<string, string | undefined>;
  options: FinanceChoices; canAdd: boolean; canUpdate: boolean; canApprove: boolean; canRemove: boolean; page: number; pageLink: (page: number) => string;
}) {
  const copy = financeTableLabels[view];
  const expenses = view === 'expenses';
  const searchLabel = expenses ? 'Search by title, ID or voucher' : view === 'expense-categories' || view === 'expense-subcategories'
    ? 'Search by title or SKU' : 'Search by name';
  const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dhaka' }).format(new Date(value)) : '—';
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const filter = (field: string, all: string, rows: { id: string; name: string }[]) => <label key={field}><select name={field} aria-label={all}
    defaultValue={filters[field] || ''}><option value="">{all}</option>{rows.map(row => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label>;
  const label = (items: string[]) => items.map(id => ({ id, name: expenseLabel(id) }));
  return <>
    <header className={styles.heading + ' ' + styles.headerRow}>
      <div><h1>{copy.title}</h1><p>{expenses ? total + ' total' : copy.description}</p></div>
      {canAdd && (expenses ? <Link className="button primary" href={productionFinancePath(view, 'new')}><Plus size={16}/> Add Expense</Link>
        : <FinanceDialog title={'Add ' + copy.singular} label={'Add ' + copy.singular}>
          <FinanceRecordForm view={view} initial={{}} choices={options} production/>
        </FinanceDialog>)}
    </header>
    <div className={styles.report}>
      <FinanceListFilters path={productionFinancePath(view)}>
        <label><input type="search" name="q" defaultValue={search} maxLength={80} placeholder={searchLabel + '...'} aria-label={searchLabel}/></label>
        {expenses && <>
          {filter('status', 'All statuses', label(expenseStatuses))}
          {filter('payment_method', 'All methods', label(paymentMethods))}
          {filter('is_approved', 'All approvals', [{ id: 'true', name: 'Approved' }, { id: 'false', name: 'Unapproved' }])}
        </>}
      </FinanceListFilters>
      <section className={styles.card + ' ' + styles.records}>
        <table><thead><tr>{copy.columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>
          {!records.length && <tr><td className={styles.empty} colSpan={copy.columns.length}>{copy.none}</td></tr>}
          {records.map(row => {
            const id = str(expenses ? row.expense_id : row._id);
            const published = str(row.status) || '—';
            const read = expenseViews[view].name;
            const common = [<td key="name">{str(row[read])}</td>, <td key="slug">{str(row.slug) || '—'}</td>,
              <td key="status"><Badge value={published}/></td>, <td key="created">{date(row.createdAt)}</td>];
            const cells = expenses ? [
              <td key="id"><Link href={canUpdate ? productionFinancePath(view, id) : financePath(view) + '/' + id}>{id}</Link></td>,
              <td key="title">{str(row.title)}</td>, <td key="category">{name(row.category) || '—'}</td>,
              <td key="amount">{number.format(Number(row.amount) || 0)}</td>, <td key="method">{str(row.payment_method) || '—'}</td>,
              <td key="status"><Badge value={published}/></td>, <td key="approval">{row.is_approved === true ? 'Approved' : 'Unapproved'}</td>,
              <td key="date">{date(row.expense_date)}</td>,
            ] : view === 'expense-categories' || view === 'expense-subcategories' ? [
              common[0], ...(view === 'expense-subcategories' ? [<td key="parent">{name(row.category) || '—'}</td>] : []),
              <td key="sku">{str(row.sku) || '—'}</td>, <td key="type">{str(row.type) || '—'}</td>, common[2],
              ...(view === 'expense-categories' ? [common[3]] : []),
            ] : common;
            return <tr key={id}>{cells}<td>
              <details className={styles.actionMenu}><summary aria-label="Open menu"><Ellipsis size={18}/></summary>
                {expenses ? <>
                  <FinanceDialog title={id} label="View details">
                    <p>{str(row.title)}</p>
                    <dl className="details-grid">{[
                      ['Amount', number.format(Number(row.amount) || 0)], ['Status', published],
                      ['Approval', row.is_approved === true ? 'Approved' : 'Unapproved'], ['Date', date(row.expense_date)],
                      ['Category', name(row.category)], ['Subcategory', name(row.subcategory)],
                      ...(row.sales_channel ? [['Sales Channel', name(row.sales_channel)]] : []),
                      ...(row.payment_source ? [['Payment Source', name(row.payment_source)]] : []),
                      ['Payment Method', str(row.payment_method)],
                      ['Voucher No', str(row.voucher_no)], ['Account Details', str(row.account_details)],
                      ['Created By', actorName(row.created_by)], ['Approved By', actorName(row.approved_by)],
                    ].map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value || '—'}</dd></div>)}</dl>
                    {!!str(row.description) && <p>{str(row.description)}</p>}
                    <div className={styles.evidence}>{arr(row.attachments).map(str)
                      .filter(value => expenseAttachmentPath(value) || /^https:\/\/[^\s]+$/i.test(value)).map((item, index) => {
                        const href = expenseAttachmentPath(item) ? adminPath(item) : item;
                        return <a key={item + index} href={href} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={href} loading="lazy" referrerPolicy="no-referrer" alt={'Attachment ' + (index + 1)}/>
                        </a>;
                      })}</div>
                  </FinanceDialog>
                  {canUpdate && <Link className="button subtle" href={productionFinancePath(view, id)}>Edit</Link>}
                  {([
                    [canUpdate, 'Update status', 'status'], [canApprove, row.is_approved === true ? 'Roll back approval' : 'Approve', 'approve'],
                    [canUpdate, 'Notes', 'note'], [canRemove, 'Delete', 'delete'],
                  ] as const).filter(([enabled]) => enabled).map(([, label, only]) => <FinanceDialog key={only} title={label} label={label}>
                    {only === 'note' && arr(row.notes).map(obj).map((note, index) =>
                      <p key={index}>{str(note.note)} <small>{str(note.user)} {date(note.date)}</small></p>)}
                    <FinanceRecordActions view={view} id={id} status={published.toLowerCase()} approved={row.is_approved === true}
                      canUpdate={canUpdate} canApprove={canApprove} canRemove={canRemove} production only={only}/>
                  </FinanceDialog>)}
                </> : canUpdate && <FinanceDialog title={'Edit ' + copy.singular} label="Edit">
                  <FinanceRecordForm view={view} id={id} initial={fieldsForRecord(row)} choices={options} production/>
                </FinanceDialog>}
                {!expenses && canRemove && <FinanceDialog title={'Delete ' + copy.singular} label="Delete">
                  <FinanceRecordActions view={view} id={id} status={published.toLowerCase()} approved={false}
                    canUpdate={false} canApprove={false} canRemove production only="delete"/>
                </FinanceDialog>}
              </details>
            </td></tr>;
          })}
        </tbody></table>
      </section>
      {total > perPage && <div className="page-actions">
        {page > 1 && <Link className="button secondary" href={pageLink(page - 1)}>Previous</Link>}
        {page * perPage < total && <Link className="button secondary" href={pageLink(page + 1)}>Next</Link>}
      </div>}
    </div>
  </>;
}

export async function FinanceRecordsPage({ auth, region, q, view, id, production = false }: { auth: Session; region: Region; q: Query; view: FinanceView; id?: string; production?: boolean }) {
  if (!has(auth.staff, 'expense.view')) throw new ApiError(403);
  if (region !== 'BD') return <PageHeading eyebrow="PAYMENTS" title="Bangladesh expense ledger" description="Switch to Bangladesh to open the expense ledger.">
    <Link className="button secondary" href={url(financePath(view), { region: 'BD' })}>Open Bangladesh ledger</Link>
  </PageHeading>;
  if (view === 'expense-report') {
    if (id) throw new ApiError(404);
    return ExpenseReport({ auth, q, production });
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
  if (id === 'new' || (id && (param(q, 'edit') === '1' || production && expenses))) {
    const create = id === 'new';
    if (create ? !canAdd : !canUpdate) throw new ApiError(403);
    if (!create && !(expenses ? expenseId(id) : mongoId(id))) throw new ApiError(404);
    const [record, lookups] = await Promise.all([create ? {} : api(config.endpoint + '/' + id, auth.token), choicesFor(auth, choices)]);
    if (production && expenses) return <>
      <header className={styles.heading}><h1>{create ? 'Add New Expense' : 'Edit Expense ' + id}</h1>
        <p>{create ? 'Record a business expense. It is created as paid & approved.' : 'Update the details of this expense.'}</p></header>
      <FinanceRecordForm view={view} id={create ? undefined : id} initial={fieldsForRecord(obj(record))} choices={lookups} production/>
    </>;
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
      ['Created by', actorName(record.created_by)], ['Approved by', actorName(record.approved_by)],
    ] : [['Reference', str(record.sku) || str(record.slug)], ['Type', expenseLabel(str(record.type))], ['Category', name(record.category)]].filter(([, value]) => value);
    const attachments = arr(record.attachments).map(str).filter(value => expenseAttachmentPath(value) || /^https:\/\/[^\s]+$/i.test(value));
    return <><PageHeading eyebrow="PAYMENTS" title={str(record[config.name])} description={config.title}>
      {back}{canUpdate && <Link className="button primary" href={href(id, { edit: '1' })}>Edit {config.label}</Link>}
    </PageHeading>
      {param(q, 'saved') === '1' && <p className="notice" role="status">Record saved.</p>}
      <section className="panel padded stack-form"><h2>Details</h2>
        <dl className="details-grid"><div><dt>Status</dt><dd><Badge value={str(record.status) || 'unknown'}/></dd></div>
          {detail.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
        {!!str(record.description) && <p>{str(record.description)}</p>}
        {attachments.length > 0 && <ul>{attachments.map((item, index) => <li key={item + index}><a href={expenseAttachmentPath(item) ? adminPath(item) : item} target="_blank" rel="noreferrer">Open attachment {index + 1}</a></li>)}</ul>}
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
  const pageLink = (next: number) => url(production ? productionFinancePath(view) : route, { ...filters, region, q: search, page: String(next) });
  if (production) return <ProductionFinanceRecords view={view} records={arr(data.data).map(obj)} total={total} search={search} filters={filters}
    options={options} canAdd={canAdd} canUpdate={canUpdate} canApprove={expenses && writable && has(auth.staff, 'expense.approval')}
    canRemove={writable && has(auth.staff, 'expense.delete')} page={page} pageLink={pageLink}/>;
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
