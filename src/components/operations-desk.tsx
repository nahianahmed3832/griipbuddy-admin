import Link from 'next/link';
import { ArrowRight, Boxes, CircleAlert, ClipboardList, Headphones, PackageCheck } from 'lucide-react';
import { api, ApiError, url, type Session } from '@/lib/api';
import { exactMoney, issueLabels, label, opsDate, operationsPath, queuePath, codPath, metricDetails, opsApi,
  type Access, type AssistantKind, type AssistantStatus, type Audit, type CodEntry, type History, type Issue, type Lookup,
  type Order, type Overview, type Policy, type Queue, type Range } from '@/lib/operations-desk';
import type { Region } from '@/lib/sections';
import { adminPath } from '@/lib/paths';
import { AssistantAction, CodForm, IssueActions, ManagedCodCollection, ManualFulfillment, OpsAction, PackActions, SupportForm } from './operations-forms';
import { WorkforceDesk } from './workforce-desk';
import { PurchasingDesk } from './purchasing-desk';
import { workPath } from '@/lib/workforce';
import '@/app/operations.css';

const priority = ['—', 'High', 'Medium', 'Routine'];
const badge = (text: string, tone = '') => <span className={'ops-badge' + (tone ? ' ops-' + tone : '')}>{text}</span>;
const title = (text: string, description: string) => <div className="ops-heading"><h1>{text}</h1><p>{description}</p></div>;
const empty = (text: string) => <p className="ops-empty">{text}</p>;
type Props = { auth: Session; region: Region };

function IssueTable({ queue, region }: { queue: Queue; region: Region }) {
  return <>
    {queue.overflow && <p className="ops-notice">Showing the first 100 issues.</p>}
    {!queue.items.length ? empty('No issues match this view.') : <div className="ops-scroll"><table className="ops-table">
      <thead><tr><th scope="col">Issue</th><th scope="col">Reference</th><th scope="col">Priority</th><th scope="col">Assigned role</th>
        <th scope="col">Status</th><th scope="col">First observed</th><th scope="col"><span className="ops-sr">Open issue</span></th></tr></thead>
      <tbody>{queue.items.map(issue => <tr key={issue._id}>
        <th scope="row">{issueLabels[issue.type] ?? label(issue.type)}{issue.type === 'packing' && issue.evidence?.delayed === true && <small>Past packing threshold</small>}</th>
        <td className="ops-ref">{issue.reference}</td><td>{badge(priority[issue.priority], issue.priority === 1 ? 'critical' : '')}</td>
        <td>{label(issue.role)}{issue.assignee && <small>Assigned</small>}</td><td>{badge(label(issue.status), issue.status === 'resolved' ? 'success' : '')}</td>
        <td>{opsDate(issue.startedAt, region)}</td>
        <td><Link className="ops-open" href={url(queuePath + '/' + issue._id, { region })} aria-label={'Open ' + issueLabels[issue.type] + ' ' + issue.reference}><ArrowRight size={16}/></Link></td>
      </tr>)}</tbody>
    </table></div>}
  </>;
}

function AuditTrail({ rows, region }: { rows: Audit[]; region: Region }) {
  return !rows.length ? empty('No activity recorded.') : <ol className="ops-timeline">
    {[...rows].reverse().map((event, index) => <li key={index}><strong>{label(event.action)}</strong>
      <span>{opsDate(event.at, region)} · {event.actor || 'System'}</span>
      {(event.note || event.reason || event.reference) && <p>{event.note || event.reason || event.reference}</p>}</li>)}
  </ol>;
}

function HistoryList({ rows, region }: { rows: History[]; region: Region }) {
  return !rows.length ? empty('No recorded events.') : <ol className="ops-timeline">
    {rows.map((event, index) => <li key={index}><strong>{label(event.status)}{event.method && ' · ' + event.method}</strong>
      <span>{opsDate(event.at, region)}{event.source && ' · ' + event.source}</span></li>)}
  </ol>;
}

function AssistantPanel({ status, region, kind, issue, range }: {
  status: AssistantStatus; region: Region; kind: AssistantKind; issue?: string; range?: Range;
}) {
  const run = status.success;
  return <section className="ops-panel">
    <div className="ops-panel-head"><div><h2>{kind === 'briefing' ? 'Operations briefing' : kind === 'explanation' ? 'Issue explanation' : 'Response draft'}</h2>
      <p>{status.available ? 'Generated on demand inside the dashboard.' : 'AI generation unavailable. This environment has no approved model provider and request budget.'}</p></div></div>
    {kind === 'briefing' && <p className="ops-muted">Daily schedule disabled · Last success {opsDate(run?.finishedAt, region)} · Last failure {opsDate(status.failure?.finishedAt, region)}</p>}
    {kind !== 'briefing' && status.failure && <p className="ops-notice">Last run failed {opsDate(status.failure.finishedAt, region)}.</p>}
    {run && <div className="ops-result">
      <p className="ops-muted">{run.period.from} to {run.period.to} · Generated {opsDate(run.finishedAt, region)} · Data cutoff {opsDate(run.cutoff, region)}</p>
      <p>{run.output.summary}</p>
      {run.output.draft && <blockquote>{run.output.draft}</blockquote>}
      {run.output.suggested.length > 0 && <><h3>Suggested actions</h3><ul>{run.output.suggested.map(item => <li key={item}>{item}</li>)}</ul></>}
      {run.output.gaps.length > 0 && <><h3>Data gaps</h3><ul>{run.output.gaps.map(item => <li key={item}>{item}</li>)}</ul></>}
      <details><summary>Source references</summary><ul>{run.output.sources.map(item => <li key={item}><code>{item}</code></li>)}</ul></details>
    </div>}
    <AssistantAction status={status} region={region} kind={kind} issue={issue} range={range}/>
  </section>;
}

async function OverviewPage({ auth, region, params }: Props & { params: Record<string, string | undefined> }) {
  const [view, queue, assistant] = await Promise.all([
    opsApi<Overview>(auth, region, 'overview', { from: params.from, to: params.to }),
    opsApi<Queue>(auth, region, 'issues'), opsApi<AssistantStatus>(auth, region, 'assistant', { kind: 'briefing' }),
  ]);
  const { range } = view;
  return <>
    {title('Daily operations', 'Review staff workload, payment evidence and COD settlements.')}
    <div className="ops-stat-strip">
      {[['Packing', 'packing', PackageCheck], ['Support & delivery', 'support', Headphones], ['Owner review', 'owner', CircleAlert]].map(([name, role, Symbol]) => {
        const Icon = Symbol as typeof PackageCheck;
        const count = queue.items.filter(row => row.role === role).length;
        return <Link key={String(role)} href={url(queuePath, { region })} className="ops-stat"><Icon size={21}/><div>
          <span>{String(name)}</span><strong>{queue.overflow ? count + '+' : count}</strong></div><ArrowRight size={15}/></Link>;
      })}
    </div>
    <section className="ops-panel">
      <div className="ops-panel-head"><div><h2>Financial overview</h2><p>Activity by period. Outstanding balances use the current cutoff.</p></div>
        {badge(range.timezone)}</div>
      <form className="ops-filter" action={adminPath(operationsPath)} method="get">
        <input type="hidden" name="region" value={region}/>
        <label>From<input type="date" name="from" defaultValue={range.from} required/></label>
        <label>Through<input type="date" name="to" defaultValue={range.to} required/></label>
        <button className="ops-button">Apply dates</button>
      </form>
      <p className="ops-muted">Data cutoff {opsDate(range.cutoff, region)}. Amounts are separate measures and use their recorded currency.</p>
      {view.gaps.map(gap => <p className="ops-notice" key={gap}>{gap}</p>)}
      {Object.entries(view.coverage).some(([, available]) => !available) && <p className="ops-notice">A source is unavailable or exceeds the scan limit. Affected measures are marked below.</p>}
      {view.currencies.length === 0 && empty('No currencies were found for this period.')}
      {view.currencies.map(({ currency, metrics }) => <div key={currency} className="ops-currency">
        <h3>{currency}</h3>
        <div className="ops-metrics">{Object.entries(view.metrics).map(([key, name]) => {
          const metric = metrics[key];
          return <article key={key} className="ops-metric">
            <h4>{name}</h4>
            <strong>{metric.amount === null ? 'Unavailable' : exactMoney(metric.amount, currency)}</strong>
            <p>{metricDetails[key]}</p>
            {metric.state === 'incomplete' && badge(metric.missing + ' evidence gaps', 'critical')}
            {metric.state === 'no-evidence' && badge('No qualifying evidence')}
            {metric.verified && <p>Verified {exactMoney(metric.verified, currency)} · Unverified {exactMoney(metric.unverified ?? '0', currency)}</p>}
          </article>;
        })}</div>
      </div>)}
      <div className="ops-panel-tail"><Link href={url(codPath, { region })}>{view.totalBatches} COD batches or source rows to review <ArrowRight size={15}/></Link></div>
    </section>
    <AssistantPanel status={assistant} kind="briefing" region={region} range={range}/>
  </>;
}

async function QueuePage({ auth, region, access, state }: Props & { access: Access; state?: string }) {
  const queue = await opsApi<Queue>(auth, region, 'issues', { state });
  return <>
    {title('Exception queue', 'Review evidence, claim work and record decisions.')}
    <section className="ops-panel">
      <div className="ops-panel-head"><div><h2>{state ? label(state) + ' issues' : 'Open and in-progress issues'}</h2>
        <p>Last source check {opsDate(queue.checked?.checkedAt, region)}</p></div>
        {access.owner && <OpsAction region={region} path="refresh" body={{}} message="Source check complete." compact>Refresh sources</OpsAction>}
      </div>
      {queue.checked?.gaps?.length ? <p className="ops-notice">Sources unavailable for {queue.checked.gaps.map(type => issueLabels[type] ?? type).join(', ')}.</p> : null}
      <div className="ops-filters" aria-label="Issue status">
        {[[undefined, 'Active'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed']].map(([value, name]) =>
          <Link key={name} aria-current={value === state ? 'page' : undefined} href={url(queuePath, { region, state: value })}>{name}</Link>)}
      </div>
      <IssueTable queue={queue} region={region}/>
    </section>
  </>;
}

async function IssuePage({ auth, region, access, id }: Props & { access: Access; id: string }) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new ApiError(404);
  const issue = await opsApi<Issue>(auth, region, 'issues/' + id);
  const [explanation, draft, staff] = await Promise.all([
    opsApi<AssistantStatus>(auth, region, 'assistant', { kind: 'explanation', issue: id }),
    issue.type === 'support' ? opsApi<AssistantStatus>(auth, region, 'assistant', { kind: 'draft', issue: id }) : Promise.resolve(undefined),
    access.owner ? api('/staff-access/directory', auth.token).then(value => value as {
      rows: { id: string; name: string; status: string }[];
    }).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),
  ]);
  const canLookup = (access.owner || access.support) && issue.order && issue.type !== 'cod-collection';
  const canQueue = access.workforce && issue.observed && ['open', 'in-progress'].includes(issue.status) &&
    (issue.type === 'support' || access.owner && issue.type === 'stock-low');
  return <>
    <Link className="ops-back" href={url(queuePath, { region })}>← Exception queue</Link>
    {title(issueLabels[issue.type] ?? label(issue.type), issue.reference)}
    <div className="ops-two">
      <section className="ops-panel"><div className="ops-panel-head"><h2>Evidence</h2>{badge(label(issue.status))}</div>
        <dl className="ops-details">
          <dt>Priority</dt><dd>{priority[issue.priority]}</dd><dt>Assigned role</dt><dd>{label(issue.role)}</dd>
          <dt>Assignee</dt><dd>{staff.rows.find(row => row.id === issue.assignee)?.name ??
            (issue.assignee === auth.staff.id ? 'You' : issue.assignee ?? 'Unassigned')}</dd>
          <dt>Observed</dt><dd>{opsDate(issue.observedAt, region)}</dd><dt>Source condition</dt><dd>{issue.observed ? 'Present at last check' : 'Cleared'}</dd>
          {issue.reason && <><dt>Latest reason</dt><dd>{issue.reason}</dd></>}
        </dl>
        {issue.evidence && <dl className="ops-details">{Object.entries(issue.evidence).map(([key, value]) => <div className="ops-fact" key={key}>
          <dt>{label(key.replace(/([A-Z])/g, ' $1'))}</dt><dd>{key === 'at' && typeof value === 'string' ? opsDate(value, region) :
            value === null ? 'Unavailable' : typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>}
        {issue.request && <div className="ops-result"><h3>{label(issue.request.category)} request</h3>
          <p>{badge(label(issue.request.stage))}</p><p className="ops-pre">{issue.request.details}</p>
          {issue.request.completion && <p>Completion evidence {issue.request.completion}</p>}
          {issue.request.draft && <><h3>Saved editable draft</h3><p className="ops-pre">{issue.request.draft}</p></>}
        </div>}
        {canLookup && <Link href={url(operationsPath + '/support', { region, q: issue.reference })}>Open order history</Link>}
        {issue.type.startsWith('cod-') && access.owner && <Link href={url(codPath, { region })}>Open COD reconciliation</Link>}
        {canQueue && <div className="ops-panel-tail"><OpsAction region={region} path="work/queue" body={{ issue: issue._id }}
          message="Work queued. The same source event keeps its existing task.">Queue for review</OpsAction>
          <Link href={url(workPath, { region })}>Open AI work <ArrowRight size={14}/></Link></div>}
      </section>
      <section className="ops-panel"><h2>Update issue</h2><IssueActions key={issue._id} issue={issue} region={region}
        owner={access.owner} actor={auth.staff.id} generatedDraft={draft?.success?.output.draft}
        staff={staff.rows.filter(row => row.status === 'ACTIVE')}/></section>
    </div>
    <section className="ops-panel"><h2>Activity</h2><AuditTrail rows={issue.audit ?? []} region={region}/></section>
    <AssistantPanel status={explanation} region={region} kind="explanation" issue={id}/>
    {draft && <AssistantPanel status={draft} region={region} kind="draft" issue={id}/>}
  </>;
}

async function PackingPage({ auth, region, access }: Props & { access: Access }) {
  const queue = await opsApi<{ rows: Order[]; overflow: boolean }>(auth, region, 'packing');
  return <>
    {title('Packing queue', 'Pick the ordered units and confirm each package.')}
    {!access.owner && !access.warehouseAssigned && <p className="ops-notice">Ask the owner to assign your warehouse.</p>}
    {queue.overflow && <p className="ops-notice">Showing the oldest 100 eligible orders.</p>}
    {!queue.rows.length && <section className="ops-panel">{empty('No orders are waiting for packing in this workspace.')}</section>}
    <div className="ops-pack-grid">{queue.rows.map(order => <article className="ops-panel ops-pack" key={order.shipment ?? order.id}>
      <div className="ops-panel-head"><div><h2>{order.reference}</h2><p>{opsDate(order.since, region)} · {order.payment}</p></div>
        {badge(order.mode === 'packed' ? 'Packed' : label(order.status))}</div>
      {!!order.destination?.country && <p>{[order.destination.city, order.destination.district, order.destination.country].filter(Boolean).join(', ')}</p>}
      <table className="ops-table"><thead><tr><th scope="col">SKU</th><th scope="col">Ordered</th><th scope="col">Picked</th></tr></thead>
        <tbody>{order.lines.map((line, index) => <tr key={index}><th scope="row">{line.sku || 'SKU unavailable'}</th>
          <td>{line.quantity}</td><td>{line.picked}</td></tr>)}</tbody></table>
      <PackActions order={order} region={region}/>
    </article>)}</div>
  </>;
}

async function SupportPage({ auth, region, q }: Props & { q?: string }) {
  const [policies, order, queue] = await Promise.all([
    opsApi<Policy[]>(auth, region, 'policies'), q ? opsApi<Lookup>(auth, region, 'lookup', { q }).catch(error => {
      if (error instanceof ApiError && [400, 404].includes(error.status)) return error.message;
      throw error;
    }) : Promise.resolve(undefined), opsApi<Queue>(auth, region, 'issues', { role: 'support' }),
  ]);
  return <>
    {title('Customer support', 'Look up order history, track requests and prepare replies.')}
    <section className="ops-panel"><h2>Order lookup</h2>
      <form className="ops-filter" action={adminPath(operationsPath + '/support')} method="get">
        <input type="hidden" name="region" value={region}/>
        <label>Invoice or order number<input name="q" defaultValue={q} maxLength={80} required/></label>
        <button className="ops-button">Find order</button>
      </form>
      {typeof order === 'string' && <p className="ops-notice" role="status">{order}</p>}
      {order && typeof order !== 'string' && <div className="ops-result">
        <h3>{order.reference} {badge(label(order.status))}</h3>
        <p>{order.payment} · {order.currency}{order.codStatus && ' · ' + order.codStatus}{order.trackingCode && ' · Tracking ' + order.trackingCode}</p>
        {order.lines.length > 0 && <ul>{order.lines.map((line, index) => <li key={index}>{line.sku} × {line.quantity}</li>)}</ul>}
        <p className="ops-muted">Order ID <code>{order.id}</code></p>
        <div className="ops-history-grid">
          <section><h4>Fulfillment history</h4><HistoryList rows={order.history} region={region}/></section>
          <section><h4>Tracking events</h4><HistoryList rows={order.tracking} region={region}/></section>
          <section><h4>Payment events</h4><HistoryList rows={order.payments} region={region}/></section>
        </div>
        {(order.canPlanShipment || order.manualShipment?.state === 'dispatched') && <ManualFulfillment order={order} region={region}/>}
        <details className="ops-disclosure"><summary>Record a customer request</summary><SupportForm order={order.id} region={region}/></details>
      </div>}
    </section>
    <section className="ops-panel"><h2>Active support work</h2>
      <IssueTable queue={{ ...queue, items: queue.items.filter(row => row.role === 'support') }} region={region}/></section>
    <section className="ops-panel"><h2>Approved policies</h2>
      {!policies.length && empty('No active return policy is available.')}
      {policies.map(policy => <details className="ops-disclosure" key={policy.id}><summary>{policy.title}</summary>
        <p>{policy.description}</p>{policy.conditions?.length > 0 && <ul>{policy.conditions.map((text, index) => <li key={index}>{text}</li>)}</ul>}
        <p className="ops-muted">Policy {policy.id} · Updated {opsDate(policy.updatedAt, region)}</p></details>)}
    </section>
  </>;
}

async function CodPage({ auth, region, id }: Props & { id?: string }) {
  if (id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new ApiError(404);
    const entry = await opsApi<CodEntry>(auth, region, 'cod/' + id);
    return <>
      <Link className="ops-back" href={url(codPath, { region })}>← COD reconciliation</Link>
      {title(entry.reference, [label(entry.kind), entry.courier, exactMoney(String(entry.amount), entry.currency)].join(' · '))}
      <section className="ops-panel"><h2>Correct entry</h2><p>Keep the source row reference and record why the values changed.</p>
        <CodForm entry={entry} region={region}/></section>
      <section className="ops-panel"><h2>Activity</h2><AuditTrail rows={entry.audit ?? []} region={region}/></section>
    </>;
  }
  const [entries, overview] = await Promise.all([
    opsApi<{ items: CodEntry[]; overflow: boolean }>(auth, region, 'cod'), opsApi<Overview>(auth, region, 'overview'),
  ]);
  return <>
    {title('COD reconciliation', 'Record source evidence and review partial, conflicting or unmatched batches.')}
    <div className="ops-two">
      <section className="ops-panel"><h2>Record source entry</h2><p>Use the original courier row or bank receipt reference. Link rows with the same courier and batch reference.</p>
        <ManagedCodCollection region={region}/>
        <CodForm region={region}/></section>
      <section className="ops-panel"><h2>Batches to review</h2><p>{overview.totalBatches} open batches or unmatched source rows</p>
        {!overview.batches.length && empty('No reconciliation discrepancies are recorded.')}
        <div className="ops-stack">{overview.batches.map(batch => <article className="ops-result" key={batch.id}>
          <h3>{batch.id.startsWith('row:') ? batch.sources[0] : batch.id}</h3>
          {batch.amounts.map(row => <div key={row.currency}>
            <p>{badge(label(row.state), row.state === 'conflict' ? 'critical' : '')} {batch.overdue && badge('Overdue', 'critical')}</p>
            <dl className="ops-details"><dt>Collection</dt><dd>{exactMoney(row.collection, row.currency)}</dd>
              <dt>Fees</dt><dd>{exactMoney(row.fee, row.currency)}</dd><dt>Recorded received</dt><dd>{exactMoney(row.settlement, row.currency)}</dd>
              {row.reportedSettlement && row.reportedSettlement !== '0' && <><dt>Reported settlement</dt><dd>{exactMoney(row.reportedSettlement, row.currency)}</dd></>}
              <dt>Unmatched</dt><dd>{exactMoney(row.unmatched, row.currency)}</dd></dl></div>)}
          <p className="ops-muted">Sources {batch.sources.join(', ')}</p>
        </article>)}</div>
      </section>
    </div>
    <section className="ops-panel"><h2>Source entries</h2>
      {entries.overflow && <p className="ops-notice">Showing the most recent 100 entries.</p>}
      {!entries.items.length ? empty('No manual source entries are recorded.') : <div className="ops-scroll"><table className="ops-table">
        <thead><tr><th scope="col">Reference</th><th scope="col">Type</th><th scope="col">Order / batch</th><th scope="col">Amount</th>
          <th scope="col">Status</th><th scope="col">Source date</th></tr></thead>
        <tbody>{entries.items.map(row => <tr key={row._id}><th scope="row"><Link href={url(codPath + '/' + row._id, { region })}>{row.reference}</Link></th>
          <td>{label(row.kind)}</td><td>{row.orderReference || row.batch || 'Unmatched'}</td>
          <td>{exactMoney(String(row.amount), row.currency)}</td><td>{badge(label(row.status), row.status === 'verified' ? 'success' : '')}</td>
          <td>{opsDate(row.occurredAt, region)}</td></tr>)}</tbody></table></div>}
    </section>
  </>;
}

export async function OperationsDesk({ auth, region, view, query }: Props & { view: string[]; query: Record<string, string | undefined> }) {
  const access = await opsApi<Access>(auth, region, 'access');
  const purchasing = access.purchasing;
  const showPurchases = purchasing && (purchasing.buy || purchasing.receive || purchasing.finance);
  const tabs = [
    ...(access.owner ? [['', 'Overview', ClipboardList], ['cod', 'COD reconciliation', Boxes]] as const : []),
    ...(showPurchases ? [['purchases', 'Purchases & receiving', Boxes]] as const : []),
    ...(access.owner || access.pack ? [['packing', 'Packing', PackageCheck]] as const : []),
    ...(access.owner || access.support ? [['support', 'Support', Headphones]] as const : []),
    ...(access.workforce ? [['work', 'AI work', ClipboardList]] as const : []),
    ['queue', 'Exceptions', CircleAlert] as const,
  ];
  const [page = access.owner ? '' : access.pack ? 'packing' : access.support ? 'support' : 'purchases', id] = view;
  if (!tabs.some(([key]) => key === page)) throw new ApiError(403);
  if (id && !['queue', 'cod', 'work', 'purchases'].includes(page)) throw new ApiError(404);
  let content;
  switch (page) {
    case 'purchases': {
      if (!showPurchases) throw new ApiError(403);
      content = await PurchasingDesk({ auth, region, access: purchasing, id, query });
      break;
    }
    case 'queue': content = id ? await IssuePage({ auth, region, access, id }) : await QueuePage({ auth, region, access, state: query.state }); break;
    case 'packing': content = await PackingPage({ auth, region, access }); break;
    case 'support': content = await SupportPage({ auth, region, q: query.q }); break;
    case 'cod': content = await CodPage({ auth, region, id }); break;
    case 'work': content = await WorkforceDesk({ auth, region, access, id, state: query.state }); break;
    default: content = await OverviewPage({ auth, region, params: query }); break;
  }
  return <div className="ops-desk">
    {access.staging && <div className="ops-stage"><span/> Staging · Sample orders and transactions</div>}
    <nav className="ops-tabs" aria-label="Daily operations views">
      {tabs.map(([key, name, Icon]) => <Link key={key} aria-current={page === key ? 'page' : undefined}
        href={url(operationsPath + (key ? '/' + key : ''), { region })}><Icon size={16} aria-hidden="true"/>{name}</Link>)}
    </nav>
    <div className="ops-stack">{content}</div>
  </div>;
}
