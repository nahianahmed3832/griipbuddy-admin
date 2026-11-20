'use client';

import { Eye, EyeOff, Pencil, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import styles from './production-header.module.css';

type Draft = { message: string; enabled: boolean };
type Message = Draft & { id: string; position: number };
type Action = 'create' | 'edit' | 'delete' | 'toggle';
const empty: Draft = { message: '', enabled: true };

export function HeaderMessages({ messages, create, edit, remove }: {
  messages: Message[]; create: boolean; edit: boolean; remove: boolean;
}) {
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState<Message>();
  const [busy, setBusy] = useState(false);
  const [refreshing, refresh] = useTransition();
  const [notice, setNotice] = useState<{ message: string; error: boolean }>();
  const router = useRouter();
  const locked = busy || refreshing;

  async function submit(action: Action, id?: string, values?: Draft) {
    if (locked) return false;
    setBusy(true);
    setNotice(undefined);
    try {
      const response = await fetch(adminPath('/api/production-header'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id, ...values }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Could not save the message.');
      if (data?.message) setNotice({ message: data.message, error: false });
      refresh(() => router.refresh());
      return true;
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : 'Could not save the message.', error: true });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (draft.message.trim() && await submit('create', undefined, draft)) setDraft(empty);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (editing?.message.trim() && await submit('edit', editing.id, editing)) setEditing(undefined);
  }

  return <section className={styles.page}>
    <header className={styles.heading}>
      <div><h1>Header Management</h1><p>Manage top bar announcement messages that appear on the frontend.</p></div>
      <button className={styles.neutral} type="button" disabled={locked} onClick={() => refresh(() => router.refresh())}><RefreshCcw size={16}/>Refresh</button>
    </header>
    {notice && <p role={notice.error ? 'alert' : 'status'} className={notice.error ? styles.error : styles.notice}>{notice.message}</p>}
    <div className={styles.grid}>
      <article className={styles.card}>
        <h2>Add New Message</h2><p>Create a new announcement for the top bar</p>
        <form className={styles.form} onSubmit={add}>
          <label>Message Text<input value={draft.message} disabled={!create || locked} maxLength={200}
            placeholder="Enter announcement text" onChange={event => setDraft({ ...draft, message: event.target.value })}/></label>
          <small>{draft.message.length}/200 characters</small>
          <div className={styles.switchRow}><span>Show on website</span><Toggle label="Show on website" checked={draft.enabled} disabled={!create || locked}
            onChange={() => setDraft({ ...draft, enabled: !draft.enabled })}/></div>
          <button type="submit" className={styles.primary} disabled={!create || locked || !draft.message.trim()}>Add Message</button>
        </form>
      </article>
      <article className={styles.card}>
        <h2>All Messages ({messages.length})</h2><p>Messages are displayed in order on the frontend</p>
        {!messages.length && <p className={styles.empty}>No messages found. Add your first announcement!</p>}
        <div className={styles.messageList}>{messages.map((message, index) => <div className={styles.message} key={message.id}>
          {message.id === editing?.id ? <form className={styles.edit} onSubmit={save}>
            <input aria-label="Edit message text" maxLength={200} value={editing.message} disabled={locked}
              onChange={event => setEditing({ ...editing, message: event.target.value })}/>
            <Toggle label="Show on website" checked={editing.enabled} disabled={locked} onChange={() => setEditing({ ...editing, enabled: !editing.enabled })}/>
            <button className={styles.primary} disabled={locked || !editing.message.trim()}>Save</button>
            <button className={styles.neutral} type="button" onClick={() => setEditing(undefined)} disabled={locked}>Cancel</button>
          </form> : <>
            <span className={styles.position}>{index + 1}</span>
            <div className={styles.messageBody}><strong>{message.message}</strong><small>{message.enabled ? 'Enabled' : 'Disabled'}</small></div>
            <button className={styles.icon} type="button" title={message.enabled ? 'Disable' : 'Enable'}
              aria-label={(message.enabled ? 'Disable ' : 'Enable ') + message.message} disabled={!edit || locked}
              onClick={() => void submit('toggle', message.id)}>{message.enabled ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
            <button className={styles.icon} type="button" title="Edit" aria-label="Edit" disabled={!edit || locked} onClick={() => setEditing(message)}><Pencil size={16}/></button>
            <button className={`${styles.icon} ${styles.error}`} type="button" title="Delete" aria-label="Delete" disabled={!remove || locked}
              onClick={() => void submit('delete', message.id)}><Trash2 size={16}/></button>
          </>}
        </div>)}</div>
      </article>
    </div>
    <aside className={styles.tips}><span><Plus size={16}/></span><div><strong>Tips</strong><ul>
      <li>Messages are automatically ordered by position</li><li>Only enabled messages are shown on the frontend</li>
      <li>Messages are displayed as a rotating slideshow</li><li>Maximum message length is 200 characters</li>
      <li>You can toggle messages on/off without deleting them</li>
    </ul></div></aside>
  </section>;
}

function Toggle({ checked, disabled, label, onChange }: { checked: boolean; disabled: boolean; label: string; onChange: () => void }) {
  return <button className={styles.switch} type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}/>;
}
