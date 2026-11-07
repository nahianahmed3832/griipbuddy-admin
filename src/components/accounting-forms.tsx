'use client';

import { useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { currencyCodes, money, type Account, type Book, type Journal, type Source } from '@/lib/accounting';
import type { Region } from '@/lib/sections';

type Values = Record<string, string | undefined>;
const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

function ActionForm({ endpoint, label, build, destination, children, className = 'stack-form' }: {
  endpoint: string; label: string; build: (values: Values, data: FormData) => object; destination?: (values: Values) => string;
  children: ReactNode; className?: string;
}) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribeHydration, clientReady, serverReady);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const data = new FormData(event.currentTarget);
    const values = Object.fromEntries([...data.entries()].map(([key, value]) => [key, String(value).trim() || undefined]));
    busy.current = true;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/accounting?' + endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(build(values, data)),
      });
      if (!response.ok) throw new Error(await response.text());
      setDone(true);
      if (destination) router.push(destination(values));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Check the journal before retrying.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return <form className={className} method="post" onSubmit={submit}>
    <fieldset className="finance-fields" disabled={!ready || saving || done}>
      {children}
      <button className="button primary" type="submit">{done ? 'Saved' : saving ? 'Saving…' : label}</button>
    </fieldset>
    {message && <p className="notice warn" role="alert">{message}</p>}
    {done && <p role="status" className="muted">Saved to the accounting workspace.</p>}
  </form>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="operation-field">{label}{children}</label>;
}

function BookSelect({ books, value }: { books: Book[]; value?: string }) {
  return <Field label="Legal entity book"><select name="book" required defaultValue={value || ''}>
    <option value="" disabled>Choose an entity</option>
    {books.map(book => <option key={book._id} value={book._id}>{book.name} ({book.country})</option>)}
  </select></Field>;
}

function AccountSelect({ accounts, name, label, value }: { accounts: Account[]; name: string; label: string; value?: string }) {
  return <Field label={label}><select name={name} defaultValue={value || ''} required>
    <option value="" disabled>Choose an account</option>
    {accounts.map(account => <option key={account.code} value={account.code}>{account.code} · {account.name}</option>)}
  </select></Field>;
}

function Market({ region, value }: { region: Region; value?: string }) {
  if (region === 'BD' || value) return <Field label="Market"><input readOnly name="market" value={value ?? 'BD'} /></Field>;
  return <Field label="Operating market (country code)"><input name="market" placeholder="US" minLength={2} maxLength={2}
    pattern="[A-Za-z]{2}" required /></Field>;
}

function FX({ currency }: { currency: string }) {
  return currency !== 'USD' && <div className="editor-grid">
    <Field label={`USD per 1 ${currency}`}><input name="rate" inputMode="decimal" required placeholder="0.0082" maxLength={25} /></Field>
    <Field label="Exchange-rate source for this date"><input name="rateSource" placeholder="Statement or published rate reference" required maxLength={250} /></Field>
  </div>;
}

const templates = {
  income: { label: 'Income received', debit: '1000', credit: '4200' },
  invoice: { label: 'Income earned on account', debit: '1100', credit: '4200' },
  expense: { label: 'Expense paid', debit: '6600', credit: '1000' },
  bill: { label: 'Expense incurred and unpaid', debit: '6600', credit: '2000' },
  collection: { label: 'Collect a receivable', debit: '1000', credit: '1100' },
  payable: { label: 'Pay a bill', debit: '2000', credit: '1000' },
  settlement: { label: 'Transfer payout from clearing', debit: '1000', credit: '1150' },
  inventory: { label: 'Purchase inventory on account', debit: '1200', credit: '2000' },
  prepayment: { label: 'Pay a supplier deposit', debit: '1300', credit: '1000' },
  contribution: { label: 'Owner contribution', debit: '1000', credit: '3000' },
  general: { label: 'General journal', debit: '', credit: '' },
};

export function EntryForm({ books, accounts, region, book, date, destination }: {
  books: Book[]; accounts: Account[]; region: Region; book?: string; date: string; destination?: string;
}) {
  const [template, setTemplate] = useState<keyof typeof templates>('expense');
  const [currency, setCurrency] = useState(region === 'BD' ? 'BDT' : 'USD');
  const [rows, setRows] = useState(2);
  const requestKey = useRef('');
  const templateFields = templates[template];
  const general = template === 'general';
  return <ActionForm endpoint="operation=draft" label="Submit for review"
    destination={destination ? v => destination + '&from=' + encodeURIComponent(v.date ?? '') + '&to=' + encodeURIComponent(v.date ?? '') : undefined} build={(v, data) => {
    requestKey.current ||= crypto.randomUUID();
    const lines = general ? data.getAll('account').map((account, index) => ({
      account, side: data.getAll('side')[index], amount: data.getAll('lineAmount')[index],
    })) : [
      { account: v.debit, side: 'debit', amount: v.amount },
      { account: v.credit, side: 'credit', amount: v.amount },
    ];
    return { key: requestKey.current, book: v.book, region, market: v.market?.toUpperCase(), date: v.date,
      currency, rate: v.rate, rateSource: v.rateSource, memo: v.memo, reference: v.reference, lines };
  }}>
    <div className="editor-grid">
      <BookSelect books={books} value={book} />
      <Market region={region} />
      <Field label="Accounting date"><input name="date" type="date" required defaultValue={date} /></Field>
      <Field label="Entry type"><select value={template} onChange={event => setTemplate(event.target.value as keyof typeof templates)}>
        {Object.entries(templates).map(([id, entry]) => <option value={id} key={id}>{entry.label}</option>)}
      </select></Field>
      <Field label="Transaction currency"><select name="currency" value={currency} onChange={event => setCurrency(event.target.value)}>
        {currencyCodes.map(code => <option key={code}>{code}</option>)}
      </select></Field>
      {!general && <Field label="Amount"><input name="amount" inputMode="decimal" maxLength={25} required /></Field>}
      <Field label="Description"><input name="memo" maxLength={250} required /></Field>
      <Field label="Receipt, invoice or bank reference"><input name="reference" maxLength={250} /></Field>
    </div>
    <FX currency={currency} />
    {general ? <>
      {Array.from({ length: rows }, (_, index) => <div className="editor-grid" key={index}>
        <AccountSelect accounts={accounts} label={`Line ${index + 1} account`} name="account" />
        <Field label={`Line ${index + 1} side`}><select name="side" defaultValue={index === 0 ? 'debit' : 'credit'}>
          <option value="debit">Debit</option><option value="credit">Credit</option>
        </select></Field>
        <Field label={`Line ${index + 1} amount`}><input name="lineAmount" inputMode="decimal" maxLength={25} required /></Field>
      </div>)}
      <div className="page-actions">
        <button type="button" className="button secondary" disabled={rows >= 30} onClick={() => setRows(rows + 1)}>Add line</button>
        <button type="button" className="button secondary" disabled={rows <= 2} onClick={() => setRows(rows - 1)}>Remove last line</button>
      </div>
    </> : <div className="editor-grid" key={template}>
      <AccountSelect accounts={accounts} name="debit" label="Debit account" value={templateFields.debit} />
      <AccountSelect accounts={accounts} name="credit" label="Credit account" value={templateFields.credit} />
    </div>}
  </ActionForm>;
}

export function SourceForm({ source, books, accounts, region, book }: {
  source: Source; books: Book[]; accounts: Account[]; region: Region; book?: string;
}) {
  const expense = source.kind === 'expense';
  const refund = source.kind === 'refund';
  const offset = accounts.filter(account => (refund ? ['1000','1100','1150','2000'] : ['1000','1150','2000','2300']).includes(account.code));
  return <ActionForm endpoint={`operation=source&kind=${source.kind}&id=${source.id}`} label="Create journal draft"
    build={v => ({ ...v, region, market: v.market?.toUpperCase() })}>
    <div className="editor-grid">
      <BookSelect books={books} value={book} />
      <Market region={region} value={source.market} />
      <Field label="Description"><input name="memo" required maxLength={250} defaultValue={source.title} /></Field>
      <Field label="Reference"><input name="reference" required maxLength={250} defaultValue={source.reference} /></Field>
    </div>
    <FX currency={source.currency} />
    <div className="editor-grid">
      {expense && <AccountSelect accounts={accounts.filter(account => ['expense','otherExpense','tax'].includes(account.group) ||
        ['1200','1300','1500'].includes(account.code))} name="account" label="Verified posting account" />}
      {(expense || refund) && <AccountSelect accounts={offset} name="offset" label={refund ? 'Refunded from' : 'Paid from or owed to'} />}
      {refund && <>
        <Field label="Refund excluding refunded sales tax"><input name="refundRevenue" required inputMode="decimal" /></Field>
        <Field label="Verified restocked inventory cost (optional)"><input name="restockedCost" inputMode="decimal" /></Field>
      </>}
      {!expense && !refund && (source.cost == null
        ? <Field label={`Verified inventory cost in ${source.currency}`}><input name="cost" inputMode="decimal" required /></Field>
        : <p>Inventory cost from source records <strong>{money(source.cost, source.currency)}</strong></p>)}
    </div>
  </ActionForm>;
}

export function JournalActions({ journal, date }: { journal: Journal; date: string }) {
  const values = { region: journal.region };
  const review = 'operation=review&id=' + journal._id;
  if (journal.status === 'draft') return <div className="finance-actions">
    <ActionForm endpoint={review} label="Approve and post" build={() => ({ ...values, action: 'post' })}>
      <label><input type="checkbox" required /> I verified the accounts, amounts and source records.</label>
    </ActionForm>
    <details><summary>Reject draft</summary><ActionForm endpoint={review} label="Reject draft"
      build={v => ({ ...values, action: 'reject', reason: v.reason })}>
      <Field label="Rejection reason"><input name="reason" required maxLength={250} /></Field>
    </ActionForm></details>
  </div>;
  if (journal.status !== 'posted' || journal.reversed || journal.reverses) return null;
  return <details className="finance-actions"><summary>Reverse posted journal</summary>
    <ActionForm endpoint={'operation=reverse&id=' + journal._id} label="Post reversal" build={v => ({ ...v, ...values })}>
      <Field label="Reversal date"><input name="date" type="date" min={journal.date} defaultValue={date < journal.date ? journal.date : date} required /></Field>
      <Field label="Reason"><input name="reason" maxLength={250} required /></Field>
    </ActionForm>
  </details>;
}

export function BookForms({ books, date }: { books: Book[]; date: string }) {
  return <div className="overview-grid">
    <section className="panel padded">
      <h2>Open a legal entity book</h2>
      <ActionForm endpoint="operation=book" label="Create book" build={v => ({ ...v, country: v.country?.toUpperCase() })}>
        <div className="editor-grid">
          <Field label="Book code"><input name="id" placeholder="us-hq" pattern="[a-z0-9][a-z0-9\-]{0,39}" maxLength={40} required /></Field>
          <Field label="Legal entity name"><input name="name" maxLength={140} required /></Field>
          <Field label="Registration country code"><input name="country" placeholder="US" pattern="[A-Za-z]{2}" maxLength={2} required /></Field>
          <Field label="First accounting date"><input name="start" type="date" defaultValue={date} required /></Field>
        </div>
      </ActionForm>
    </section>
    {!!books.length && <section className="panel padded">
      <h2>Close an accounting period</h2>
      <p className="muted">Closing blocks postings dated on or before the selected day across this entity’s markets.</p>
      <CloseForm books={books} date={date} />
    </section>}
  </div>;
}

function CloseForm({ books, date }: { books: Book[]; date: string }) {
  const [book, setBook] = useState(books[0]._id);
  return <ActionForm endpoint={`operation=close&id=${book}`} label="Close period" build={v => ({ through: v.through })}>
    <Field label="Book to close"><select value={book} onChange={event => setBook(event.target.value)}>
      {books.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}
    </select></Field>
    <Field label="Close through"><input name="through" type="date" max={date} required /></Field>
    <label><input type="checkbox" required /> I reconciled this period and exported the supporting records.</label>
  </ActionForm>;
}

