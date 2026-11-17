'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { expenseLabel, expenseStatuses, expenseTypes, expenseViews, financePath, ledgerStatuses, paymentMethods, productionFinancePath,
  type ExpenseView, type FinanceChoice, type FinanceChoices } from '@/lib/finance-records';
import { adminPath } from '@/lib/paths';
import { expenseAttachmentPath } from '@/lib/finance-attachment';
import productionStyles from './production-finance.module.css';

const FinanceDialogClose = createContext<(() => void) | undefined>(undefined);

async function write(view: ExpenseView, id: string | undefined, action: string, payload?: Record<string, unknown>) {
  const query = new URLSearchParams({ view, region: 'BD', action });
  if (id) query.set('id', id);
  const result = await fetch(adminPath('/api/finance-records?' + query), {
    method: 'POST', ...(payload && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  });
  if (!result.ok) throw new Error((await result.text()).slice(0, 350) || 'The change could not be saved.');
  return result.json() as Promise<{ id: string }>;
}

function SelectChoice({ label, name, values, required, initial, onChange }: { label: string; name: string; values: FinanceChoice[];
  required?: boolean; initial?: string; onChange?: (value: string) => void }) {
  return <label className="filter-label">{label}<select name={name} required={required} defaultValue={initial || ''} onChange={event => onChange?.(event.target.value)}>
    <option value="">{required ? 'Select ' + label.toLowerCase() : 'None'}</option>
    {values.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
  </select></label>;
}

function SelectOption({ label, name, values, initial }: { label: string; name: string; values: string[]; initial?: string }) {
  return <label className="filter-label">{label}<select name={name} required defaultValue={initial || ''}>
    <option value="" disabled>Select {label.toLowerCase()}</option>
    {values.map(value => <option key={value} value={value}>{expenseLabel(value)}</option>)}
  </select></label>;
}

export function FinanceRecordForm({ view, id, initial, choices, production = false }: { view: ExpenseView; id?: string; initial: Record<string, string>; choices: FinanceChoices; production?: boolean }) {
  const router = useRouter();
  const closeDialog = useContext(FinanceDialogClose);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState(initial.category || '');
  const [subcategory, setSubcategory] = useState(initial.subcategory || '');
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState(() => (initial.attachments ?? '').split(/\r?\n/).filter(Boolean));
  const ads = choices.category.find(value => value.id === category)?.type === 'ADs' || choices.subcategory.find(value => value.id === subcategory)?.type === 'ADs';
  const config = expenseViews[view];
  const list = financePath(view) + '?region=BD';
  useEffect(() => { setReady(true); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || uploading) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await write(view, id, 'save', Object.fromEntries(new FormData(event.currentTarget)));
      if (!result.id) throw new Error('The finance service did not confirm the record ID.');
      closeDialog?.();
      router.replace(production ? productionFinancePath(view) : financePath(view) + '/' + result.id + '?region=BD&saved=1');
      router.refresh();
    } catch (failure) {
      setError(failure instanceof TypeError ? 'The connection was interrupted. Check the record before retrying.' :
        failure instanceof Error ? failure.message : 'The change could not be saved.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function uploadExpenseImage(file?: File) {
    if (!file || uploading || busy || attachments.length >= 10) return;
    setUploading(true);
    setError('');
    try {
      const response = await fetch(adminPath('/api/finance-records/attachment'), { method: 'POST', body: file });
      if (!response.ok) throw new Error((await response.text()).slice(0, 200));
      const { path } = await response.json();
      if (typeof path !== 'string' || !expenseAttachmentPath(path)) throw new Error('Could not save the attachment.');
      setAttachments(rows => [...rows, path]);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save the attachment.');
    } finally { setUploading(false); }
  }
  if (production && view === 'expenses') {
    return <form className={productionStyles.card + ' ' + productionStyles.editor} onSubmit={submit}>
      <fieldset disabled={busy || !ready}>
        <label>Title<input name="title" required maxLength={140} defaultValue={initial.title} placeholder="e.g. Facebook ad campaign – August"/></label>
        <label>Amount<input name="amount" type="number" required min={0} max={99999999.99} step=".01" defaultValue={initial.amount} placeholder="0.00"/></label>
        <SelectChoice label="Category" name="category" values={choices.category} required initial={category}
          onChange={value => { setCategory(value); setSubcategory(''); }}/>
        <label>Subcategory (optional)<select key={category} name="subcategory" defaultValue={subcategory} disabled={!category}
          onChange={event => setSubcategory(event.target.value)}>
          <option value="">{category ? '— None —' : 'Select a category first'}</option>
          {choices.subcategory.filter(row => row.parent === category).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select></label>
        <label>Payment Method<select name="payment_method" required defaultValue={initial.payment_method?.toLowerCase() || ''}>
          <option value="" disabled>Select payment method</option>
          {paymentMethods.map(value => <option key={value} value={value}>{value === 'mobile_banking' ? 'Mobile Banking' : expenseLabel(value)}</option>)}
        </select></label>
        <label>Expense Date<input name="expense_date" type="date" required defaultValue={initial.expense_date}/></label>
        <label>Voucher No (optional)<input name="voucher_no" defaultValue={initial.voucher_no} maxLength={100} placeholder="e.g. VCH-1023"/></label>
        <label>Account Details (optional)<input name="account_details" maxLength={500} defaultValue={initial.account_details} placeholder="e.g. bKash 017xxxxxxxx"/></label>
        <label>Payment Source (optional)<select name="payment_source" defaultValue={initial.payment_source || ''}>
          <option value="">— None —</option>{choices.payment_source.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select></label>
        {ads && <SelectChoice label="Sales Channel" name="sales_channel" values={choices.sales_channel} required initial={initial.sales_channel}/>}
        <label className={productionStyles.wide}>Description (optional)<textarea name="description" rows={2} maxLength={1000} defaultValue={initial.description} placeholder="Any details about this expense"/></label>
        <div className={productionStyles.wide}>
          <span>Attachments (optional)</span>
          <input type="hidden" name="attachments" value={attachments.join('\n')}/>
          <label className={productionStyles.upload}><Plus size={20}/><span>Click to upload<small>PNG, JPEG or WebP, up to 5 MB</small></span>
            <input type="file" hidden accept="image/png,image/jpeg,image/webp" disabled={uploading || attachments.length >= 10}
              onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void uploadExpenseImage(file); }}/></label>
          {uploading && <p role="status">Uploading…</p>}
          {attachments.map((path, index) => <div className={productionStyles.attachment} key={path + index}>
            {(expenseAttachmentPath(path) || /^https:\/\/[^\s]+$/i.test(path)) && <a rel="noreferrer" target="_blank" href={expenseAttachmentPath(path) ? adminPath(path) : path}>Attachment {index + 1}</a>}
            <button type="button" className="button subtle" onClick={() => setAttachments(rows => rows.filter((_, position) => position !== index))}>Remove</button>
          </div>)}
        </div>
      </fieldset>
      {error && <p className="notice warn" role="alert">{error}</p>}
      <footer><button className="button primary" disabled={busy || uploading || !ready}>{busy ? 'Saving…' : id ? 'Save changes' : 'Create Expense'}</button></footer>
    </form>;
  }
  return <form className="panel padded stack-form" onSubmit={submit}>
    <fieldset className="supplier-fields" disabled={busy || !ready}>
      <label className="filter-label">{config.name === 'title' ? 'Title' : 'Name'}<input name={config.name} required maxLength={140} defaultValue={initial[config.name]}/></label>
      {view === 'expenses' ? <>
        <label className="filter-label">Amount (BDT)<input name="amount" required inputMode="decimal" pattern="[0-9]{1,8}(\.[0-9]{1,2})?" defaultValue={initial.amount}/></label>
        <label className="filter-label">Expense date<input name="expense_date" type="date" required defaultValue={initial.expense_date}/></label>
        <SelectOption label="Payment method" name="payment_method" values={paymentMethods} initial={initial.payment_method}/>
        <SelectChoice label="Category" name="category" values={choices.category} required initial={category} onChange={value => { setCategory(value); setSubcategory(''); }}/>
        <SelectChoice key={category} label="Subcategory" name="subcategory" values={choices.subcategory.filter(value => value.parent === category)} initial={subcategory} onChange={setSubcategory}/>
        {ads && <SelectChoice label="Sales channel" name="sales_channel" values={choices.sales_channel} required initial={initial.sales_channel}/>}
        <SelectChoice label="Payment source" name="payment_source" values={choices.payment_source} initial={initial.payment_source}/>
        <label className="filter-label">Voucher number<input name="voucher_no" maxLength={100} defaultValue={initial.voucher_no}/></label>
        <label className="filter-label">Account details<input name="account_details" maxLength={500} defaultValue={initial.account_details}/></label>
        <label className="filter-label">Description<textarea name="description" rows={3} maxLength={1000} defaultValue={initial.description}/></label>
        <label className="filter-label">Attachment links<textarea name="attachments" rows={3} maxLength={5000} placeholder="One HTTPS link per line" defaultValue={initial.attachments}/></label>
      </> : <>
        <SelectOption label="Status" name="status" values={ledgerStatuses} initial={initial.status || 'active'}/>
        {(view === 'expense-categories' || view === 'expense-subcategories') && <SelectOption label="Expense type" name="type" values={expenseTypes} initial={initial.type || 'GENERAL'}/>}
        {view === 'expense-subcategories' && <SelectChoice label="Category" name="category" values={choices.category} required initial={initial.category}/>}
      </>}
    </fieldset>
    {error && <p className="notice warn" role="alert">{error}</p>}
    <div className="page-actions"><Link className="button secondary" href={list}>Cancel</Link>
      <button className="button primary" disabled={busy || !ready}>{busy ? 'Saving…' : 'Save ' + config.label}</button></div>
  </form>;
}

export function FinanceRecordActions({ view, id, status, approved, canUpdate, canApprove, canRemove, production = false, only }: {
  view: ExpenseView; id: string; status: string; approved: boolean; canUpdate: boolean; canApprove: boolean; canRemove: boolean; production?: boolean;
  only?: 'status' | 'approve' | 'note' | 'delete';
}) {
  const router = useRouter();
  const closeDialog = useContext(FinanceDialogClose);
  const pending = useRef(false);
  const remove = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action: string, payload?: Record<string, unknown>, reset?: HTMLFormElement) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await write(view, id, action, payload);
      reset?.reset();
      closeDialog?.();
      if (action === 'delete') {
        router.replace(production ? productionFinancePath(view) : financePath(view) + '?region=BD&removed=1');
      }
      router.refresh();
    } catch (failure) {
      setError(failure instanceof TypeError ? 'The connection was interrupted. Check the record before retrying.' :
        failure instanceof Error ? failure.message : 'The change could not be saved.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (!(canUpdate || canApprove || canRemove)) return null;
  return <section className="panel padded stack-form" aria-label="Finance actions">
    {!only && <h2>Actions</h2>}
    {canUpdate && (!only || only === 'status') && <form className="page-actions" onSubmit={event => { event.preventDefault(); void run('status', Object.fromEntries(new FormData(event.currentTarget))); }}>
      <SelectOption key={status} label="Status" name="status" values={view === 'expenses' ? expenseStatuses : ledgerStatuses} initial={status}/>
      <button className="button secondary" disabled={busy}>Save status</button>
    </form>}
    {canUpdate && view === 'expenses' && (!only || only === 'note') && <form className="stack-form" onSubmit={event => { event.preventDefault(); void run('note', Object.fromEntries(new FormData(event.currentTarget)), event.currentTarget); }}>
      <label className="filter-label">Staff note<textarea name="note" required rows={2} maxLength={1000}/></label>
      <div className="page-actions"><button className="button secondary" disabled={busy}>Add note</button></div>
    </form>}
    <div className="page-actions">
      {canApprove && (!only || only === 'approve') && <button className="button secondary" disabled={busy} onClick={() => void run('approve', { approved: !approved })}>{approved ? (production ? 'Roll back approval' : 'Withdraw approval') : 'Approve expense'}</button>}
      {canRemove && only === 'delete' && <button className="button primary" disabled={busy} onClick={() => void run('delete')}>Confirm deletion</button>}
      {canRemove && !only && <button className="button secondary" disabled={busy} onClick={() => { setError(''); remove.current?.showModal(); }}>Remove {expenseViews[view].label}</button>}
    </div>
    {error && !remove.current?.open && <p className="notice warn" role="alert">{error}</p>}
    {canRemove && !only && <dialog className="form-dialog" ref={remove} aria-label={'Remove ' + expenseViews[view].label} onCancel={event => { if (busy) event.preventDefault(); }}>
      <div className="stack-form"><h2>Remove {expenseViews[view].label}?</h2>
        {error && <p className="notice warn" role="alert">{error}</p>}
        <div className="page-actions"><button className="button secondary" disabled={busy} onClick={() => { setError(''); remove.current?.close(); }}>Cancel</button>
          <button className="button primary" disabled={busy} onClick={() => void run('delete')}>Confirm removal</button></div>
      </div>
    </dialog>}
  </section>;
}


export function FinanceDialog({ title, label, children }: { title: string; label: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" className="button secondary" onClick={() => dialog.current?.showModal()}>{label}</button>
    <dialog ref={dialog} className="form-dialog" aria-label={title}>
      <div className="stack-form"><h2>{title}</h2><FinanceDialogClose.Provider value={() => dialog.current?.close()}>{children}</FinanceDialogClose.Provider>
        <button type="button" className="button subtle" onClick={() => dialog.current?.close()}>Close</button>
      </div>
    </dialog>
  </>;
}
