import Link from 'next/link';
import { CircleAlert, Download } from 'lucide-react';
import { api, ApiError, url, type Session } from '@/lib/api';
import { param, type Query } from '@/lib/data';
import { has, superAdmin, type Region } from '@/lib/sections';
import {
  financePath, financeHQ, financeRead, financeWrite, money, sourceNames, statementLines,
  type FinanceReport, type Journal, type Settings, type Source, type SourceKind,
} from '@/lib/accounting';
import { BookForms, EntryForm, JournalActions, SourceForm } from './accounting-forms';
import { PageHeading } from './dashboard';
import '@/app/accounting.css';

const views = { report: 'Profit & loss', entry: 'Record income or expense', sources: 'Review source records',
  journal: 'Journal', books: 'Books & close' };

type Filters = { region: Region | 'ALL'; from: string; to: string; book?: string; market?: string };

function dateParam(q: Query, key: string) {
  const date = param(q, key);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1900-01-01' || date > '2199-12-31') return undefined;
  const parsed = new Date(date);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date ? date : undefined;
}

function ReportFilters({ filters, settings, view, region, hq, type, status }: {
  filters: Filters; settings: Settings; view: string; region: Region; hq: boolean; type: SourceKind; status?: string;
}) {
  return <form className="panel filters" action={financePath}>
    <input type="hidden" name="view" value={view} />
    <input type="hidden" name="region" value={region} />
    {view !== 'sources' && hq && <label className="filter-label">Reporting scope
      <select name="scope" defaultValue={filters.region === 'ALL' ? 'hq' : 'region'}>
        <option value="region">{region === 'BD' ? 'Bangladesh' : 'International'}</option>
        <option value="hq">HQ · all regions</option>
      </select>
    </label>}
    <label className="filter-label">From<input name="from" type="date" defaultValue={filters.from} required /></label>
    <label className="filter-label">Through<input name="to" type="date" defaultValue={filters.to} required /></label>
    {view !== 'sources' && <>
      <label className="filter-label">Legal entity
        <select name="book" defaultValue={filters.book ?? ''}><option value="">All books</option>
          {settings.books.map(book => <option key={book._id} value={book._id}>{book.name}</option>)}
        </select>
      </label>
      {(region === 'INTERNATIONAL' || filters.region === 'ALL') && <label className="filter-label">Market code
        <input name="market" defaultValue={filters.market} placeholder="All markets" maxLength={2} pattern="[A-Za-z]{2}" />
      </label>}
    </>}
    {view === 'sources' && <label className="filter-label">Source
      <select name="type" defaultValue={type}>
        {Object.entries(sourceNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>}
    {view === 'journal' && <label className="filter-label">Posting status
      <select name="status" defaultValue={status || ''}><option value="">All statuses</option>
        <option value="draft">Pending review</option><option value="posted">Posted</option><option value="rejected">Rejected</option>
      </select>
    </label>}
    <button className="button secondary" type="submit">Apply filters</button>
  </form>;
}

function FinanceReportView({ report, filters, settings }: { report: FinanceReport; filters: Filters; settings: Settings }) {
  const book = settings.books.find(item => item._id === filters.book);
  return <>
    <div className="notice"><CircleAlert size={16}/>
      Accrual management books for {book?.name ?? 'all selected entities before intercompany eliminations'}.
      The statement includes posted journals only. Reconcile opening balances, source coverage, settlements and adjustments before filing.
    </div>
    {book && <p className="muted">{book.country} entity · Books start {book.start} · {book.closedThrough ? 'Closed through ' + book.closedThrough : 'Open periods'}</p>}
    <div className="metric-grid">
      {([
        ['revenue', 'Net revenue'], ['grossProfit', 'Gross profit'], ['expense', 'Operating expenses'], ['netIncome', 'Net profit / loss'],
      ] as const).map(([key, label]) => <article className="panel metric" key={key}>
        <span className="metric-top">{label}</span><strong>{money(report[key])}</strong><small>USD reporting currency</small>
      </article>)}
    </div>
    <div className="page-actions">
      <Link className="button secondary" href={url('/api/accounting', { ...filters, type: 'report' })} download><Download size={15}/> Download working papers</Link>
      <Link className="button secondary" href={url('/api/accounting', { ...filters, type: 'journal' })} download><Download size={15}/> Download posted journals</Link>
      <span className="muted">{report.counts.posted ?? 0} posted · {report.counts.draft ?? 0} pending review · {report.counts.rejected ?? 0} rejected</span>
    </div>
    <div className="overview-grid">
      <section className="panel data-panel">
        <header className="panel-header"><h2>Income statement</h2></header>
        <div className="table-scroll"><table>
          <thead><tr><th scope="col">Line</th><th scope="col">USD</th>{report.native.filter(item => item.currency !== 'USD' || report.native.length > 1)
            .map(item => <th scope="col" key={item.currency}>{item.currency} activity</th>)}</tr></thead>
          <tbody>{statementLines.map(([key, label]) => <tr key={key}><th scope="row">{label}</th><td>{money(report[key])}</td>
            {report.native.filter(item => item.currency !== 'USD' || report.native.length > 1)
              .map(item => <td key={item.currency}>{money(item[key], item.currency)}</td>)}</tr>)}</tbody>
        </table></div>
      </section>
      <section className="panel data-panel">
        <header className="panel-header"><div><h2>Balance sheet</h2><p>As of {filters.to}</p></div></header>
        <div className="table-scroll"><table>
          <thead><tr><th scope="col">Line</th><th scope="col">USD</th></tr></thead>
          <tbody>{([
            ['assets','Assets'], ['liabilities','Liabilities'], ['equity','Contributed and opening equity'],
            ['retainedEarnings','Accumulated earnings'], ['totalEquity','Total equity'],
          ] as const).map(([key, label]) => <tr key={key}><th scope="row">{label}</th><td>{money(report.balanceSheet[key])}</td></tr>)}
          <tr><th scope="row">Liabilities and equity</th><td>{money(report.balanceSheet.liabilities + report.balanceSheet.totalEquity)}</td></tr></tbody>
        </table></div>
      </section>
    </div>
    <section className="panel data-panel">
      <header className="panel-header"><h2>Results by entity and market</h2></header>
      {report.dimensions.length ? <div className="table-scroll"><table>
        <thead><tr>{['Legal entity', 'Business region', 'Market', 'Revenue', 'Gross profit', 'Expenses', 'Net profit / loss']
          .map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{report.dimensions.map(item => <tr key={[item.book,item.region,item.market].join('/')}>
          <th scope="row">{settings.books.find(book => book._id === item.book)?.name ?? item.book}</th><td>{item.region}</td><td>{item.market}</td>
          {[item.revenue,item.grossProfit,item.expense,item.netIncome].map((value, index) => <td key={index}>{money(value)}</td>)}
        </tr>)}</tbody>
      </table></div> : <p className="padded muted">No posted journals in this scope.</p>}
    </section>
    <section className="panel data-panel">
      <header className="panel-header"><div><h2>Trial balance</h2><p>Period activity and balances through {filters.to}. Positive balances are debits.</p></div></header>
      <div className="table-scroll"><table>
        <thead><tr>{['Account', 'Debit activity', 'Credit activity', 'Closing balance']
          .map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{report.trialBalance.map(row => <tr key={row.code}><th scope="row">{row.code} · {row.name}</th>
          <td>{money(row.debit)}</td><td>{money(row.credit)}</td><td>{money(row.balance)}</td></tr>)}</tbody>
      </table></div>
    </section>
  </>;
}

function SourceQueue({ rows, settings, region, book, canCreate }: {
  rows: Source[]; settings: Settings; region: Region; book?: string; canCreate: boolean;
}) {
  return <section className="panel">
    <header className="panel-header"><div><h2>Source records</h2><p>Review the dates, amounts and accounts before creating a draft.</p></div></header>
    {rows.map(row => <details className="finance-record" key={row.id}><summary>
      <strong>{row.reference || row.title}</strong> <span>{row.date}</span>
      <span>{row.amount != null && row.currency ? money(row.amount, row.currency) : 'Amount requires review'}</span>
      <span className={`badge ${row.changed || row.issue ? 'amber' : 'purple'}`}>
        {row.changed ? 'Source changed' : row.status ?? (row.issue ? 'Review required' : 'Unposted')}
      </span>
    </summary>
      <p>{row.title}{row.category && ' · ' + row.category}{row.method && ' · ' + row.method.replaceAll('_', ' ')}</p>
      {row.issue && <p className="notice warn">{row.issue}</p>}
      {row.changed && <p className="notice warn">Compare this source with the journal. Posted amounts stay fixed until a reviewer records an adjustment.</p>}
      {(row.kind === 'order' || row.kind === 'pos') && <p className="muted">
        Sale posts to receivables. Record payments, clearing transfers and fees from the settlement records.
        {row.tax != null && row.currency ? ' Sales tax ' + money(row.tax, row.currency) + '.' : ''}
        {row.shipping != null && row.currency ? ' Shipping income ' + money(row.shipping, row.currency) + '.' : ''}
      </p>}
      {!row.issue && (!row.status || row.status === 'rejected') && canCreate && !!settings.books.length &&
        <SourceForm source={row} books={settings.books} accounts={settings.accounts} region={region} book={book} />}
    </details>)}
    {!rows.length && <p className="padded muted">No source records on this page for the selected dates and region.</p>}
  </section>;
}

function JournalList({ rows, settings, canReview, date }: {
  rows: Journal[]; settings: Settings; canReview: boolean; date: string;
}) {
  const accounts = new Map(settings.accounts.map(account => [account.code, account.name]));
  return <section className="panel">
    <header className="panel-header"><div><h2>Accounting journals</h2><p>Expand an entry to inspect both sides and its exchange-rate evidence.</p></div></header>
    {rows.map(row => <details className="finance-record" key={row._id}>
      <summary><strong>{row.memo}</strong> <span>{row.date} · {row.market}</span>
        <span className={`badge ${row.status === 'posted' ? 'green' : row.status === 'draft' ? 'amber' : 'red'}`}>
          {row.reversed ? 'Posted · reversed' : row.status}</span></summary>
      <p className="muted">{settings.books.find(book => book._id === row.book)?.name ?? row.book} · Journal {row._id}
        {row.reference && ' · ' + row.reference}</p>
      {row.source && <p className="muted">{sourceNames[row.source.kind]} · {row.source.id}</p>}
      {row.reverses && <p className="muted">Reverses journal {row.reverses}</p>}
      {row.rateSource && <p className="muted">USD {row.rate} per {row.currency} · {row.rateSource}</p>}
      {row.rejection && <p className="notice warn">{row.rejection}</p>}
      <div className="table-scroll"><table>
        <thead><tr><th scope="col">Account</th><th scope="col">Debit ({row.currency})</th><th scope="col">Credit ({row.currency})</th>
          {row.currency !== 'USD' && <><th scope="col">USD debit</th><th scope="col">USD credit</th></>}</tr></thead>
        <tbody>{row.lines.map((line, index) => <tr key={index}>
          <th scope="row">{line.account} · {accounts.get(line.account)}</th>
          <td>{money(line.debit, row.currency)}</td><td>{money(line.credit, row.currency)}</td>
          {row.currency !== 'USD' && <><td>{money(line.usdDebit)}</td><td>{money(line.usdCredit)}</td></>}
        </tr>)}</tbody>
      </table></div>
      {canReview && <JournalActions journal={row} date={date} />}
    </details>)}
    {!rows.length && <p className="padded muted">No journals match these filters.</p>}
  </section>;
}

export async function AccountingPage({ auth, q, region }: { auth: Session; q: Query; region: Region }) {
  const staff = auth.staff;
  if (!has(staff, 'expense.view')) throw new ApiError(403);
  const read = financeRead(staff);
  const write = financeWrite();
  const create = write && has(staff, 'expense.create');
  const review = write && read && has(staff, 'expense.approval');
  const hq = financeHQ(staff);
  const setup = review && superAdmin(staff);
  const visible = Object.entries(views).filter(([key]) => key === 'entry' ? create : key === 'books' ? setup : read);
  const view = param(q, 'view') || visible[0]?.[0];
  if (!view || !visible.some(([key]) => key === view)) throw new ApiError(403);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: region === 'BD' ? 'Asia/Dhaka' : 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const settings = await api('/accounting/settings', auth.token) as Settings;
  const book = settings.books.find(item => item._id === param(q, 'book'))?._id;
  const from = dateParam(q, 'from') ?? date.slice(0, 7) + '-01';
  const to = dateParam(q, 'to') ?? date;
  const reportingRegion = view !== 'sources' && param(q, 'scope') === 'hq' ? 'ALL' : region;
  if (reportingRegion === 'ALL' && !hq) throw new ApiError(403);
  const marketCode = param(q, 'market')?.toUpperCase();
  const market = view !== 'sources' && marketCode && /^[A-Z]{2}$/.test(marketCode) &&
    (reportingRegion === 'ALL' || (region === 'BD') === (marketCode === 'BD')) ? marketCode : undefined;
  const filters = { from, to, book, market, region: reportingRegion } satisfies Filters;
  const links = { region, from, to, book, market, scope: reportingRegion === 'ALL' ? 'hq' : undefined };
  const rawType = param(q, 'type');
  const type: SourceKind = rawType && Object.hasOwn(sourceNames, rawType) ? rawType as SourceKind : region === 'BD' ? 'expense' : 'order';
  const rawStatus = param(q, 'status');
  const status = rawStatus && /^(draft|posted|rejected)$/.test(rawStatus) ? rawStatus : undefined;
  const needsRange = ['report','sources','journal'].includes(view);
  let content;
  if (needsRange && from > to) content = <p className="notice warn">Choose an end date on or after the start date.</p>;
  else if (view === 'report') {
    const report = await api(url('/accounting/report', filters), auth.token) as FinanceReport;
    content = <FinanceReportView report={report} filters={filters} settings={settings} />;
  } else if (view === 'journal') {
    const cursor = param(q, 'cursor');
    const data = await api(url('/accounting/journals', { ...filters, status,
      cursor: cursor && /^\d{4}-\d{2}-\d{2}:[a-f0-9]{24}$/.test(cursor) ? cursor : undefined }), auth.token) as { rows: Journal[]; next?: string };
    content = <><JournalList rows={data.rows} settings={settings} canReview={review} date={date} />
      <div className="page-actions">
        {cursor && <Link className="button secondary" href={url(financePath, { ...links, view, status })}>First page</Link>}
        {data.next && <Link className="button secondary" href={url(financePath, { ...links, view, status, cursor: data.next })}>Next journals</Link>}
      </div></>;
  } else if (view === 'sources') {
    const offset = Math.min(100000, Math.max(0, Number.parseInt(param(q, 'offset') ?? '', 10) || 0));
    const data = await api(url('/accounting/sources', { from, to, region, type, offset: String(offset) }), auth.token) as { rows: Source[]; next?: number };
    content = <>
      <div className="notice"><CircleAlert size={16}/> Source review covers dated records from the selected workflow.
        Reconcile older sales without delivery dates, modified returns, purchases and provider statements separately.</div>
      <SourceQueue rows={data.rows} settings={settings} region={region} book={book} canCreate={create} />
      <div className="page-actions">
        {offset > 0 && <Link className="button secondary" href={url(financePath, { region, from, to, view, type, offset: String(offset - 20) })}>Previous records</Link>}
        {data.next != null && <Link className="button secondary" href={url(financePath, { region, from, to, view, type, offset: String(data.next) })}>Next records</Link>}
      </div>
    </>;
  } else if (view === 'entry') {
    content = settings.books.length ? <section className="panel padded">
      <h2>New journal draft</h2><p className="muted">Choose the entity that owns the transaction and the market where it occurred. Keep a reference to the supporting document.</p>
      <EntryForm books={settings.books} accounts={settings.accounts.filter(account => account.code !== '7900')}
        region={region} book={book} date={date} destination={read ? url(financePath, { region, view: 'journal' }) : undefined} />
    </section> : <p className="notice">An HQ administrator must open the entity book before staff can submit entries.</p>;
  } else content = <BookForms books={settings.books} date={date} />;

  return <>
    <PageHeading eyebrow="FINANCE" title="Accounting" description="Record regional activity, review journals and prepare financial statements." />
    <nav className="tabs" aria-label="Accounting views">{visible.map(([key, label]) => <Link key={key}
      aria-current={view === key ? 'page' : undefined}
      href={url(financePath, { ...links, scope: ['report','journal'].includes(key) ? links.scope : undefined, view: key })}>{label}</Link>)}</nav>
    {needsRange && <ReportFilters filters={filters} view={view} settings={settings} region={region} hq={hq} type={type} status={status} />}
    {content}
  </>;
}
