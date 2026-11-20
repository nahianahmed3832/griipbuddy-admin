import Link from 'next/link';
import { ArrowRight, ClipboardList, PauseCircle, Server, ShieldCheck } from 'lucide-react';
import { ApiError, url, type Session } from '@/lib/api';
import { purchasesPath } from '@/lib/purchasing';
import { label, opsApi, opsDate, queuePath, type Access } from '@/lib/operations-desk';
import { workPath, workReasons, workerLabels, workStatus, type WorkDetail, type WorkOutput, type WorkQueue } from '@/lib/workforce';
import type { Region } from '@/lib/sections';
import { PauseControls, ReplenishmentForm, WorkRefresh, WorkReviewForm } from './workforce-forms';

type Props = { auth: Session; region: Region; access: Access; id?: string; state?: string };
const reason = (code?: string) => code && (workReasons[code] ?? label(code));
const roleName = (role: string) => workerLabels[role] ?? label(role);
const title = (kind: string) => ({
  'reply-draft': 'Support reply draft', 'restock-review': 'Restock review',
  'merchandising-listing': 'Catalog listing proposal', 'merchandising-launch': 'Launch content proposal',
}[kind] ?? 'Work item');
const priority = ['—', 'High', 'Medium', 'Routine'];
const badge = (value: string, tone = '') => <span className={'ops-badge' + (tone ? ' ops-' + tone : '')}>{value}</span>;
const value = (quantity: number | null | undefined) => quantity == null ? 'Unavailable' : String(quantity);

function Output({ output }: { output: WorkOutput }) {
  if (output.type === 'merchandising-listing' || output.type === 'merchandising-launch') {
    return <div className="ops-stack">
      <p>{output.focus?.length ?? 0} fact references selected</p>
      {output.category && <p>Suggested category {output.category}</p>}
      {Boolean(output.collections?.length) && <p>Suggested collections {output.collections?.join(', ')}</p>}
    </div>;
  }
  return <div className="ops-stack">
    {output.type === 'reply-draft' ? <div className="ops-result">
      <h3>Worker draft</h3><blockquote>{output.draft}</blockquote>
      <p className="ops-muted">Order status {label(output.orderStatus ?? 'Unavailable')}{output.trackingStatus && ' · Tracking ' + label(output.trackingStatus)}</p>
    </div> : <div>
      <p>{output.explanation}</p>
      <dl className="ops-work-facts">
        <div><dt>Physical units</dt><dd>{value(output.stock?.onHand)}</dd></div>
        <div><dt>Reserved units</dt><dd>{value(output.stock?.reserved)}</dd></div>
        <div><dt>Unusable units</dt><dd>{value(output.stock?.unavailable)}</dd></div>
        <div><dt>Sellable units</dt><dd>{value(output.stock?.sellable)}</dd></div>
        <div><dt>Low-stock threshold</dt><dd>{value(output.threshold)}</dd></div>
        <div><dt>Verified incoming</dt><dd>{value(output.incoming)}</dd></div>
        <div><dt>Approved target</dt><dd>{value(output.target)}</dd></div>
        <div><dt>Quantity for review</dt><dd>{value(output.recommended)}</dd></div>
      </dl>
      {output.assumptions?.length ? <ul>{output.assumptions.map(item => <li key={item}>{item}</li>)}</ul> : null}
      {output.termsReference && <p className="ops-muted">Supplier terms {output.termsReference} · Planning basis {output.demandReference}</p>}
    </div>}
    {output.gaps.length > 0 && <div className="ops-notice"><h3>Missing information</h3><ul>{output.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul></div>}
    {output.escalation?.length ? <div><h3>Escalation</h3><ul>{output.escalation.map(item => <li key={item}>{item}</li>)}</ul></div> : null}
    {output.next?.length ? <div><h3>Suggested next steps</h3><ul>{output.next.map(step => <li key={step}>{step}</li>)}</ul></div> : null}
  </div>;
}

function Sources({ items }: { items: string[] }) {
  return <details className="ops-disclosure"><summary>Evidence references ({items.length})</summary>
    <ul className="ops-work-sources">{items.map(item => <li key={item}><code>{item}</code></li>)}</ul></details>;
}

async function WorkDetailPage({ auth, region, access, id }: Props & { id: string }) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new ApiError(404);
  const task = await opsApi<WorkDetail>(auth, region, 'work/' + id);
  const current = task.latest?.output;
  const fresh = { current: 'Source facts current', changed: 'Source facts changed', unavailable: 'Source facts unavailable' }[task.freshness];
  const approved = task.reviewState === 'approved';
  const record = task.outcome?.records ?? [];
  const evidenceLabels = { 'supplier-report': 'Manual supplier update on file', 'supplier-document': 'Supplier document reference on file',
    'warehouse-count': 'Authorized warehouse count' } as const;
  const reviewHost = process.env.GRIIP_MERCHANDISING_REVIEW_ORIGIN;
  const catalogLink = task.candidate && reviewHost?.startsWith('https://')
    ? new URL('/staff/catalog/merchandising/' + task.candidate + '?market=' + (task.market ?? 'bd') +
      '&task=' + task._id + '&intent=' + (task.type === 'merchandising-launch' ? 'launch' : 'listing'), reviewHost).href : undefined;
  return <>
    <WorkRefresh active={['queued', 'running'].includes(task.state)}/>
    <Link className="ops-back" href={url(workPath, { region })}>← AI work</Link>
    <div className="ops-heading"><h1>{title(task.type)}</h1><p>{task.reference} · {roleName(task.role)} worker · {task.priorityReason}</p></div>
    <section className="ops-panel ops-work-summary">
      <div className="ops-panel-head"><div><h2>Work status</h2><p>Next responsible role · {task.nextOwner === 'owner' ? 'Owner' : 'Customer support'}</p></div>
        {badge(label(workStatus(task)), approved ? 'success' : task.state === 'blocked' ? 'critical' : '')}</div>
      <dl className="ops-work-facts">
        <div><dt>Worker execution</dt><dd>{label(task.state)}</dd></div>
        <div><dt>Staff review</dt><dd>{task.role === 'merchandising' ? 'Catalog workspace' : task.reviewState === 'none' ? 'Not ready' : label(task.reviewState)}</dd></div>
        <div><dt>Business action</dt><dd>{record.length ? record.every(entry => entry.verifiedSource)
          ? record.some(entry => entry.evidenceType) ? 'Linked to purchase records' : 'Evidence confirmed' : 'Manually reported' : 'No action recorded'}</dd></div>
        <div><dt>{task.role === 'merchandising' ? 'Candidate' : 'Source issue'}</dt><dd>{task.role === 'merchandising' ? task.reference : label(task.origin?.status ?? 'Unavailable')}</dd></div>
      </dl>
      {task.role === 'merchandising' ? catalogLink && <Link href={catalogLink}>Review catalog candidate <ArrowRight size={14}/></Link> :
        <Link href={url(queuePath + '/' + task.issue, { region })}>Open source issue <ArrowRight size={14}/></Link>}
      {task.reason && <p className="ops-notice">{reason(task.reason)}</p>}
      {task.paused && <p className="ops-muted">Execution is paused for this worker.</p>}
    </section>
    <div className="ops-two">
      <section className="ops-panel" aria-label="Current work result">
        <div className="ops-panel-head"><div><h2>{current ? 'Result' : 'Result pending'}</h2>
          <p>Data captured {opsDate(task.dataAt, region)}</p></div>
          {current && badge(task.latest?.method === 'provider' ? 'Model-assisted' : 'Rule-based')}</div>
        {current ? <>
          <p className={task.freshness === 'changed' ? 'ops-notice' : 'ops-muted'}>{fresh}</p>
          <Output output={current}/>
          <Sources items={current.sources}/>
        </> : <p>{task.reason === 'provider-unconfigured' ? task.role === 'merchandising'
          ? 'An approved model connection is required to generate a catalog draft.'
          : 'An approved model connection is required to generate a response draft.' :
          'The result will appear after a successful attempt.'}</p>}
        {task.review?.draft && <div className="ops-result"><h3>{approved ? 'Approved version' : 'Saved edit'}</h3>
          <p className="ops-pre">{task.review.draft}</p></div>}
      </section>
      <section className="ops-panel"><h2>Review and decisions</h2>
        <WorkReviewForm key={task._id} task={task} region={region} actor={auth.staff.id} owner={access.owner}/>
        {task.role === 'inventory' && access.owner && <ReplenishmentForm region={region} task={task._id} initial={task.rule}/>}
        {record.map((entry, index) => <div className="ops-result" key={index}>
          <h3>{label(entry.kind)}</h3><p>{entry.evidenceType ? evidenceLabels[entry.evidenceType] :
            entry.verifiedSource ? 'Evidence confirmed' : 'Manually reported'} · {opsDate(entry.at, region)}</p>
          <p>{entry.verifiedSource ?? entry.reference}</p>
        </div>)}
      </section>
    </div>
    <div className="ops-two">
      <section className="ops-panel"><h2>Attempts</h2>
        {!task.attempts.length && <p className="ops-muted">Waiting for a worker claim.</p>}
        <ol className="ops-timeline">{task.attempts.map(attempt => <li key={attempt._id}>
          <strong>Attempt {attempt.sequence} · {label(attempt.status)}</strong>
          <span>{opsDate(attempt.startedAt, region)} · {attempt.model ?? label(attempt.method)}</span>
          {attempt.error && <p>{reason(attempt.error)}</p>}
          {attempt.providerOutcome && attempt.method === 'provider' && <p className="ops-muted">Provider outcome {label(attempt.providerOutcome)}</p>}
          {attempt.usage && <p className="ops-muted">{attempt.usage.inputTokens} input tokens · {attempt.usage.outputTokens} output tokens</p>}
          {attempt.sourceVersions && <details className="ops-disclosure"><summary>Input versions</summary>
            <pre className="ops-pre">{JSON.stringify(attempt.sourceVersions, null, 2)}</pre></details>}
        </li>)}</ol>
      </section>
      {approved && task.role === 'inventory' && access.purchasing?.buy && Boolean(current?.recommended) && <section className="ops-panel">
        {task.purchase ? <Link className="ops-button" href={url(purchasesPath + '/' + task.purchase._id, { region })}>Open {task.purchase.reference}</Link>
          : <Link className="ops-button" href={url(purchasesPath + '/new', { region, proposal: task._id })}>Start purchase draft from this recommendation</Link>}
      </section>}
      <section className="ops-panel"><h2>Review history</h2>
        {!task.reviewHistory?.length && <p className="ops-muted">Waiting for a staff decision.</p>}
        <ol className="ops-timeline">{[...(task.reviewHistory ?? [])].reverse().map((entry, index) => <li key={index}>
          <strong>{label(entry.state)}</strong><span>{opsDate(entry.at, region)} · {entry.actor}</span>
          {entry.reason && <p>{entry.reason}</p>}
          {(entry.draft || entry.output) && <details className="ops-disclosure"><summary>Reviewed version</summary>
            {entry.draft ? <p className="ops-pre">{entry.draft}</p> : entry.output && <Output output={entry.output}/>}</details>}
        </li>)}</ol>
        <details className="ops-disclosure"><summary>Assignment and activity</summary>
          <ol className="ops-timeline">{[...(task.activity ?? [])].reverse().map((entry, index) => <li key={index}>
            <strong>{label(entry.action)}</strong><span>{opsDate(entry.at, region)}{entry.actor && ' · ' + entry.actor}</span>
            {entry.reason && <p>{reason(entry.reason)}</p>}</li>)}</ol>
        </details>
      </section>
    </div>
  </>;
}

export async function WorkforceDesk({ auth, region, access, id, state }: Props) {
  if (!access.workforce) throw new ApiError(403);
  if (id) return WorkDetailPage({ auth, region, access, id });
  const filters = [
    ['all', 'All work'], ['queued', 'Queued'], ['running', 'Running'], ['awaiting', 'For review'],
    ['blocked', 'Blocked'], ['failed', 'Failed'], ['reviewed', 'Reviewed'],
  ] as const;
  const selected = filters.some(([key]) => key === state) ? state : 'all';
  const review = selected === 'awaiting' ? 'awaiting' : selected === 'reviewed' ? 'reviewed' : undefined;
  const query = selected && !['all', 'awaiting', 'reviewed'].includes(selected) ? { state: selected } : { review };
  const queue = await opsApi<WorkQueue>(auth, region, 'work', query);
  const number = (name: string) => queue.counts.filter(item => name === 'awaiting' ? item._id.review === name :
    name === 'reviewed' ? ['approved', 'rejected'].includes(item._id.review) : item._id.state === name)
    .reduce((count, row) => count + row.count, 0);
  return <>
    <WorkRefresh active={queue.runner.available}/>
    <div className="ops-heading"><h1>AI work</h1><p>Review support, inventory and catalog work.</p></div>
    <div className="ops-stat-strip">{[['Queued', 'queued'], ['For review', 'awaiting'], ['Blocked', 'blocked']].map(([name, filter]) =>
      <Link key={filter} href={url(workPath, { region, state: filter })} className="ops-stat">
        <ClipboardList size={21}/><div><span>{name}</span><strong>{number(filter)}</strong></div><ArrowRight size={15}/></Link>)}</div>
    <section className="ops-panel">
      <div className="ops-panel-head"><div><h2>Work queue</h2><p>{access.owner ? 'Operations manager assigns eligible work to its worker.' : 'Customer-support work for this market.'}</p></div>
        {badge(queue.runner.available ? 'Background runner online' : 'Runner offline', queue.runner.available ? 'success' : 'critical')}</div>
      {!queue.provider.available && <p className="ops-notice">Model generation unavailable. Support drafts are blocked.{queue.merchandising && ' AI catalog drafts are also blocked.'} {access.owner && queue.provider.dependency}</p>}
      <nav className="ops-filters" aria-label="Work status filter">
        {filters.map(([key, name]) => <Link key={key} aria-current={selected === key ? 'page' : undefined}
          href={url(workPath, { region, state: key === 'all' ? undefined : key })}>{name}{key !== 'all' && ' ' + number(key)}</Link>)}
      </nav>
      {!queue.tasks.length ? <p className="ops-empty">No work items in this view.</p> : <div className="ops-scroll ops-work-table"><table className="ops-table">
        <thead><tr><th scope="col">Task</th><th scope="col">Source</th><th scope="col">Priority</th><th scope="col">Worker</th>
          <th scope="col">Status</th><th scope="col">Updated</th><th scope="col"><span className="ops-sr">Open work item</span></th></tr></thead>
        <tbody>{queue.tasks.map(task => <tr key={task._id}>
          <th scope="row">{title(task.type)}{task.reason && <small>{reason(task.reason)}</small>}</th>
          <td>{task.reference}</td><td>{badge(priority[task.priority], task.priority === 1 ? 'critical' : '')}</td>
          <td>{roleName(task.role)}</td><td>{badge(label(workStatus(task)), task.state === 'blocked' ? 'critical' : '')}</td>
          <td>{opsDate(task.updatedAt, region)}</td>
          <td><Link className="ops-open" href={url(workPath + '/' + task._id, { region })}
            aria-label={'Open ' + title(task.type) + ' ' + task.reference}><ArrowRight size={16}/></Link></td>
        </tr>)}</tbody></table></div>}
      {!!queue.tasks.length && <ul className="ops-work-mobile">
        {queue.tasks.map(task => <li key={task._id}>
          <Link href={url(workPath + '/' + task._id, { region })}>
            <span><strong>{title(task.type)}</strong><small>{task.reference}</small></span><ArrowRight size={16}/>
          </Link>
          <p>{badge(label(workStatus(task)), task.state === 'blocked' ? 'critical' : '')} {badge(priority[task.priority])}</p>
          {task.reason && <p className="ops-muted">{reason(task.reason)}</p>}
        </li>)}
      </ul>}
      {queue.overflow && <p className="ops-muted">Showing the first 100 tasks in this view.</p>}
    </section>
    {access.owner && <div className="ops-two">
      <section className="ops-panel"><div className="ops-panel-head"><h2>Execution controls</h2><PauseCircle size={20}/></div>
        <p>Pausing stops new claims. To stop a specific run, cancel it from the task.</p>
        <PauseControls region={region} runner={queue.runner} merchandising={queue.merchandising}/>
      </section>
      <section className="ops-panel"><div className="ops-panel-head"><h2>Runner and usage</h2><Server size={20}/></div>
        <p>Last scan {opsDate(queue.runner.lastHealthy, region)} · Poll interval {queue.runner.pollMs / 1000}s</p>
        {queue.runner.issue && <p className="ops-notice">{label(queue.runner.issue)}</p>}
        {queue.limits && <dl className="ops-details">
          <dt>Concurrent runs</dt><dd>{queue.limits.parallel}</dd><dt>Attempts per revision</dt><dd>{queue.limits.attempts}</dd>
          <dt>Daily support / inventory</dt><dd>{queue.limits.support} / {queue.limits.inventory} attempts</dd>
          {queue.merchandising && <><dt>Daily merchandising</dt><dd>{queue.limits.merchandising} attempts</dd></>}
          <dt>Provider requests (UTC day)</dt><dd>{queue.budget ?? 0} / {queue.limits.dailyRequests}</dd>
          <dt>Time and tool limits</dt><dd>{queue.limits.timeoutMs / 1000}s · {queue.limits.toolCalls} reads</dd>
          <dt>Input and output limits</dt><dd>{queue.limits.inputBytes} bytes in · {queue.limits.outputBytes} bytes out · {queue.limits.outputTokens} model tokens</dd>
          <dt>Cost estimate</dt><dd>Unavailable</dd>
        </dl>}
        {queue.usage?.map(item => <p className="ops-muted" key={item._id}>{roleName(item._id)} · {item.attempts} attempts today
          {item.metered ? ' · ' + item.inputTokens + ' input tokens · ' + item.outputTokens + ' output tokens' : ' · Token usage unavailable'}</p>)}
        <p className="ops-muted"><ShieldCheck size={14} aria-hidden="true"/> Order changes and external actions use the existing staff workflows.</p>
      </section>
    </div>}
  </>;
}
