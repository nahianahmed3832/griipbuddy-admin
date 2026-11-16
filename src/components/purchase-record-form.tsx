'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import type { PurchaseEditLine, PurchaseEditRecord, PurchaseExtra } from '@/lib/purchase-edit';
import type { Region } from '@/lib/sections';

type Choice = { value: string; label: string };
const newLine: PurchaseEditLine = { variant: '', title: '', sku: '', quantity: '1', cost: '', discount: '0', tax: '0' };
const newExpense: PurchaseExtra = { type: '', amount: '', note: '' };
const purchaseFields = [{ key: 'quantity', label: 'Quantity' }, { key: 'cost', label: 'Unit cost' }, { key: 'discount', label: 'Discount' }, { key: 'tax', label: 'Tax' }] as const;

export function PurchaseRecordForm({ record, suppliers, locations, region }: {
  record: PurchaseEditRecord; suppliers: Choice[]; locations: Choice[]; region: Region;
}) {
  const router = useRouter();
  const pending = useRef(false);
  const nextKey = useRef(record.lines.length + record.expenses.length);
  const [lines, setLines] = useState(record.lines.map((line, key) => ({ ...line, key })));
  const [expenses, setExpenses] = useState(record.expenses.map((expense, index) => ({ ...expense, key: record.lines.length + index })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const disabled = busy || !ready;
  const received = record.status === 'received';
  useEffect(() => { setReady(true); }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const query = new URLSearchParams({ id: record.id, region });
    try {
      const response = await fetch(adminPath('/api/purchases/record?' + query), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(form),
          revision: record.revision, lines, expenses, location: received ? record.location : form.get('location'),
          status: received ? record.status : form.get('status') }),
      });
      if (!response.ok) throw new Error((await response.text()).slice(0, 320) || 'The purchase could not be saved.');
      router.replace('/desk/inventory/purchases/' + record.id + '?region=' + region);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof TypeError ? 'The connection was interrupted. Check the purchase before retrying.' :
        failure instanceof Error ? failure.message : 'The purchase could not be saved.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return <form onSubmit={save} className="panel padded stack-form"><fieldset className="supplier-fields" disabled={disabled}>
    <label className="filter-label">Supplier<select name="supplier" required defaultValue={record.supplier}>{suppliers.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
    <label className="filter-label">Business location<select name="location" required defaultValue={record.location} disabled={received}>{locations.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
    <label className="filter-label">Purchase date<input type="date" name="date" required defaultValue={record.date}/></label>
    <label className="filter-label">Status<select name="status" required defaultValue={record.status} disabled={received}>
      {(received ? ['received'] : ['draft', 'ordered', 'cancelled']).map(status => <option value={status} key={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
    </select></label>
    <label className="filter-label">Purchase notes<textarea name="note" maxLength={1000} rows={3} defaultValue={record.note}/></label>
    <label className="filter-label">Attachment links<textarea name="attachments" maxLength={5000} rows={3} defaultValue={record.attachments}/></label>
  </fieldset>
    <section className="purchase-rate-lines" aria-label="Purchase items"><h2>Purchase items</h2>
      {received && <p className="muted">Changing quantities changes recorded stock. Units already reserved or sold cannot be removed.</p>}
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Purchase item table"><table>
        <thead><tr><th scope="col">SKU</th>{purchaseFields.map(field => <th key={field.key} scope="col">{field.label}</th>)}<th scope="col">Remove</th></tr></thead>
        <tbody>{lines.map((line, index) => <tr key={line.key}><td>{line.variant ? <><code>{line.sku}</code><br/><small>{line.title}</small></> :
          <input aria-label={'SKU for item ' + (index + 1)} required maxLength={100} value={line.sku} disabled={disabled}
            onChange={event => setLines(rows => rows.map(row => row.key === line.key ? { ...row, sku: event.target.value } : row))}/>}</td>
          {purchaseFields.map(({ key, label }) => <td key={key}><input aria-label={label + ' for item ' + (index + 1)} required disabled={disabled}
            inputMode={key === 'quantity' ? 'numeric' : 'decimal'} pattern={key === 'quantity' ? '[0-9]{1,6}' : '[0-9]{1,8}(\.[0-9]{1,2})?'} value={line[key]}
            onChange={event => setLines(rows => rows.map(row => row.key === line.key ? { ...row, [key]: event.target.value } : row))}/></td>)}
          <td><button type="button" className="icon-button" disabled={lines.length < 2 || disabled} aria-label={'Remove item ' + (index + 1)}
            onClick={() => setLines(rows => rows.filter(row => row.key !== line.key))}><Trash2 size={16}/></button></td>
        </tr>)}</tbody></table></div>
      <div><button type="button" className="button secondary" disabled={lines.length >= 50 || disabled} onClick={() => {
        const key = nextKey.current++;
        setLines(rows => [...rows, { ...newLine, key }]);
      }}><Plus size={16}/> Add item</button></div>
    </section>
    <section className="stack-form" aria-label="Applied expenses"><h2>Applied expenses</h2>
      {expenses.map((expense, index) => <fieldset className="supplier-fields" disabled={disabled} key={expense.key}>
        <label className="filter-label">Expense {index + 1} type<input maxLength={100} required value={expense.type}
          onChange={event => setExpenses(rows => rows.map(row => row.key === expense.key ? { ...row, type: event.target.value } : row))}/></label>
        <label className="filter-label">Expense {index + 1} amount<input required inputMode="decimal" pattern="[0-9]{1,8}(\.[0-9]{1,2})?" value={expense.amount}
          onChange={event => setExpenses(rows => rows.map(row => row.key === expense.key ? { ...row, amount: event.target.value } : row))}/></label>
        <label className="filter-label">Expense {index + 1} note<input maxLength={500} value={expense.note}
          onChange={event => setExpenses(rows => rows.map(row => row.key === expense.key ? { ...row, note: event.target.value } : row))}/></label>
        <button type="button" className="button secondary" onClick={() => setExpenses(rows => rows.filter(row => row.key !== expense.key))}>Remove expense {index + 1}</button>
      </fieldset>)}
      <div><button type="button" className="button secondary" disabled={expenses.length >= 20 || disabled} onClick={() => {
        const key = nextKey.current++;
        setExpenses(rows => [...rows, { ...newExpense, key }]);
      }}><Plus size={16}/> Add expense</button></div>
    </section>
    {error && <p className="notice warn" role="alert">{error}</p>}
    <div className="page-actions"><button className="button primary" disabled={disabled}>{busy ? 'Saving…' : 'Save purchase'}</button></div>
  </form>;
}
