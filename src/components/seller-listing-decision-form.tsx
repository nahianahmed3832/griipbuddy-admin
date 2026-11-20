'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { catalogRequest } from '@/lib/connected-catalog-client';
import type { Region } from '@/lib/sections';
import styles from './seller-listing-review.module.css';

export function SellerListingDecisionForm({ region, productId, revision, approved }: { region: Region; productId: string; revision: number; approved: boolean }) {
  const router = useRouter();
  const submitting = useRef(false);
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const feedback = String(new FormData(event.currentTarget).get('feedback') ?? '').trim();
    submitting.current = true;
    setError('');
    setPending(true);
    try {
      await catalogRequest({ action: 'seller-listing.review', input: { productId, revision, decision: approved ? 'publish' : decision, ...(feedback && { feedback }) } }, region);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Review could not be saved. Try again.');
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return <form onSubmit={submit} className={styles.decision} aria-label="Record listing decision">
    <fieldset disabled={pending} data-approved={approved}>
      {approved ? <p className="muted">This revision is approved. Publishing makes it visible in the selected market.</p> : <>
      <label>Decision<select value={decision} onChange={event => setDecision(event.target.value === 'reject' ? 'reject' : 'approve')}>
        <option value="approve">Approve revision</option><option value="reject">Return for changes</option>
      </select></label>
      <label>Feedback to seller<textarea name="feedback" maxLength={500} rows={2} required={decision === 'reject'}/></label>
      </>}
      <button type="submit" className="button primary">{pending ? 'Saving…' : approved ? 'Publish listing' : 'Record decision'}</button>
    </fieldset>
    {error && <p role="alert" className="notice warn">{error}</p>}
  </form>;
}
