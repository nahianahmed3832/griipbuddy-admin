'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';

type SizeGuide = {
  note: string;
  columns: string[];
  rows: { size: string; fit: string; cm: number[] }[];
  models: { image: string; size: string; height: number }[];
  instructions: string;
};

export type StorefrontSettings = { family: string; label: string; addons: string[]; guide: SizeGuide | null };

function lines(value: string) {
  return value.split('\n').map(line => line.trim()).filter(Boolean);
}

async function save(kind: string, id: string, values: unknown) {
  const response = await fetch(adminPath('/api/storefront'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, id, values }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'Could not save changes.');
}

export function StorefrontEditor({ id, settings }: { id: string; settings: StorefrontSettings }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const { guide } = settings;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const text = (name: string) => String(fields.get(name) ?? '').trim();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const columns = text('columns').split('|').map(column => column.trim()).filter(Boolean);
      const rows = lines(text('sizes')).map(line => {
        const [size, fit, ...measurements] = line.split('|').map(part => part.trim());
        if (!size || fit === undefined || measurements.length !== columns.length ||
          measurements.some(value => !value || !Number.isFinite(Number(value)) || Number(value) <= 0)) {
          throw new Error('Enter a size, a fit and one positive measurement for every column on each line.');
        }
        return { size, fit, cm: measurements.map(Number) };
      });
      const models = lines(text('models')).map(line => {
        const [size, height, image, ...extra] = line.split('|').map(part => part.trim());
        if (!size || !height || !image || extra.length || !Number.isFinite(Number(height))) {
          throw new Error('Enter a size, height in centimeters and image URL on each model line.');
        }
        return { size, height: Number(height), image };
      });
      const note = text('note');
      const instructions = text('instructions');
      await save('product', id, {
        family: text('family'), label: text('label'), addons: lines(text('addons')),
        guide: columns.length || rows.length || models.length || note || instructions
          ? { columns, rows, models, note, instructions } : null,
      });
      setSaved(true);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not save changes.');
    } finally { setBusy(false); }
  }

  return <section className="panel padded">
    <details>
      <summary><strong>Storefront merchandising</strong></summary>
      <form className="stack-form" onSubmit={submit}>
        <h3>Model or style family</h3>
        <p>Save the same family key on each product you want shoppers to switch between. Each product keeps its own variants and stock.</p>
        <label>Family key<input name="family" defaultValue={settings.family} maxLength={60} pattern="[a-zA-Z0-9-]*" placeholder="stack-signature" /></label>
        <label>Model or style label<input name="label" defaultValue={settings.label} maxLength={60} placeholder="iPhone 16 Pro" /></label>
        <label>Accessory product slugs<textarea name="addons" rows={3} maxLength={1450} defaultValue={settings.addons.join('\n')} placeholder="One product slug per line, up to eight" /></label>
        <h3>Clothing size guide</h3>
        <p>Enter measurements in centimeters. Leave the guide fields empty to hide the guide.</p>
        <label>Measurement names, separated by |<input name="columns" maxLength={500} defaultValue={guide?.columns.join(' | ')} placeholder="Width | Length | Sleeve" /></label>
        <label>Size | Fit | Measurements<textarea name="sizes" rows={4} maxLength={5500} placeholder={'S | Standard | 52 | 66 | 56\nM | Standard | 54 | 68 | 57'}
          defaultValue={guide?.rows.map(row => [row.size, row.fit, ...row.cm].join(' | ')).join('\n')} /></label>
        <label>Fit note<textarea name="note" rows={2} maxLength={800} defaultValue={guide?.note} /></label>
        <label>Model size | Height in cm | Image URL<textarea name="models" rows={3} maxLength={5000} defaultValue={guide?.models.map(model => [model.size, model.height, model.image].join(' | ')).join('\n')}
          placeholder="S | 168 | https://your-catalog-cdn.example/model.jpg" /></label>
        <label>How to measure<textarea name="instructions" rows={3} maxLength={1800} defaultValue={guide?.instructions} /></label>
        {error && <p className="notice warn" role="alert">{error}</p>}
        {saved && <p role="status">Storefront settings saved.</p>}
        <button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save storefront settings'}</button>
      </form>
    </details>
  </section>;
}

export function ReviewModeration({ id, title, content, status, media }: {
  id: string; title: string; content: string; status: string; media: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  return <section className="panel padded">
    <form className="stack-form" onSubmit={async event => {
      event.preventDefault();
      const choice = String(new FormData(event.currentTarget).get('status'));
      setBusy(true);
      setError('');
      setSaved('');
      try {
        await save('review', id, { status: choice });
        setSaved('Review status saved.');
        router.refresh();
      } catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not save review.'); }
      finally { setBusy(false); }
    }}>
      <h2>{title || 'Review'}</h2>
      <p>{content}</p>
      {media.length > 0 && <div className="review-moderation-media">
        {media.map((type, index) => {
          const src = adminPath('/api/storefront?id=' + id + '&index=' + index);
          return type === 'video/mp4' ? <video key={src} src={src} controls preload="metadata" />
            // eslint-disable-next-line @next/next/no-img-element
            : <img key={src} src={src} alt={'Review photo ' + (index + 1)} />;
        })}
      </div>}
      <label>Publication status<select name="status" defaultValue={status}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
      {error && <p role="alert" className="notice warn">{error}</p>}
      {saved && <p role="status">{saved}</p>}
      <button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save review status'}</button>
    </form>
  </section>;
}
