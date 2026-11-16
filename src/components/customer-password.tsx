'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { adminPath } from '@/lib/paths';

export function CustomerPassword({ id, revision, back }: { id: string; revision: string | null; back: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const password = data.get('password');
    if (password !== data.get('confirmation')) return setFeedback('The passwords do not match.');
    const form = event.currentTarget;
    setBusy(true);
    setFeedback('');
    try {
      const response = await fetch(adminPath('/api/customers?action=password&id=' + id), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ password, revision, reason: data.get('reason') }),
      });
      if (!response.ok) return setFeedback(await response.text());
      form.reset();
      router.push(back);
      router.refresh();
    } catch { setFeedback('The service did not confirm the change. Refresh the profile before retrying.'); }
    finally { setBusy(false); }
  }
  return <form className="panel padded stack-form" onSubmit={change}>
    <fieldset className="editor-fieldset" disabled={busy}>
      <legend>Set a new customer password</legend>
      <div className="editor-grid">
        <label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label>
        <label>Confirm password<input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label>
        <label>Reason<textarea name="reason" minLength={8} maxLength={400} rows={3} placeholder="Record why the reset was requested. Leave the password out of this field." required/></label>
      </div>
    </fieldset>
    <div className="page-actions"><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button></div>
    {feedback && <p role="alert" className="notice warn">{feedback}</p>}
  </form>;
}
