'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';

type Row = Record<string, unknown>;
type Field = [name: string, label: string, kind?: 'ids' | 'number' | 'toggle' | 'long' | 'optional'];
type Section = { id: string; label: string; fields: Field[]; max?: number };
const products: Field = ['products_id', 'Product references', 'ids'];
const banner: Field[] = [['banner_url','Image URL'], products];
const sections: Section[] = [
  { id:'banners', label:'Desktop banners', fields:banner, max:20 },
  { id:'mobile_banners', label:'Mobile banners', fields:banner, max:20 },
  { id:'featured_products', label:'Featured products', fields:banner, max:20 },
  { id:'hero_section', label:'Homepage carousel', max:5, fields:[
    ['title','Headline'], ['video_url','Video URL (MP4 or WebM)','optional'], ['thumbnail_url','Photo or video cover URL','optional'],
    ['button.enabled','Show button','toggle'], ['button.text','Button label','optional'], ['button.redirect_route','Button path','optional'],
  ] },
  { id:'homepage.shop_by_category', label:'Shop by category', max:3, fields:[
    ['category_id','Category reference'], ['subcategory_id','Subcategory reference','optional'],
    ['icon_image_url','Icon URL','optional'], ['label','Display label','optional'],
  ] },
  { id:'homepage.best_selling', label:'Best sellers', max:20, fields:[['product_id','Product reference']] },
  { id:'homepage.new_arrivals', label:'New arrivals', max:20, fields:[
    ['name','Collection name'], ['slug','Slug'], ['icon','Icon','optional'], ['description','Description','optional'],
    ['product_ids','Product references','ids'],
  ] },
  { id:'homepage.leather_section', label:'Leather feature', fields:[
    ['enabled','Enabled','toggle'], ['title','Title'], ['subtitle','Subtitle','optional'], ['button_text','Button label'],
    ['button_link','Button path'], ['banner_image_url','Image URL','optional'], ['product_ids','Product references','ids'],
  ] },
  { id:'seo', label:'Search and social metadata', max:50, fields:[
    ['path','Page path'], ['title','Search title'], ['description','Search description','long'], ['image','Social image URL','optional'],
  ] },
];
const object = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const get = (value: unknown, path: string) => path.split('.').reduce<unknown>((current,key) => object(current)[key], value);
function set(row: Row, path: string, value: unknown) {
  const [root, child] = path.split('.');
  return { ...row, [root]: child ? { ...object(row[root]), [child]: value } : value };
}
function sectionRows(doc: Row, section: Section): Row[] {
  const value = get(doc, section.id);
  return section.max ? (Array.isArray(value) ? value.map(object) : []) : [object(value)];
}

export function ContentEditor({ doc, writable }: { doc: Row; writable: boolean }) {
  const [section, setSection] = useState(sections[0]);
  const [rows, setRows] = useState(() => sectionRows(doc, sections[0]));
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const submitting = useRef(false);
  const router = useRouter();

  function switchSection(next: Section) {
    if (dirty && !window.confirm('Discard unsaved content changes?')) return;
    setSection(next);
    setRows(sectionRows(doc, next));
    setDirty(false);
    setFeedback('');
  }

  function update(next: Row[]) {
    setRows(next);
    setDirty(true);
  }

  async function upload(index: number, field: string, file?: File) {
    if (!file || busy || uploading || !writable) return;
    setUploading(true);
    setFeedback('');
    try {
      const response = await fetch(adminPath('/api/carousel-media'), {
        method: 'POST', headers: { 'X-Griip-Media-Kind': field === 'video_url' ? 'video' : 'photo' }, body: file,
      });
      const result = object(await response.json().catch(() => ({})));
      if (!response.ok || typeof result.url !== 'string') {
        throw new Error(typeof result.error === 'string' ? result.error : 'Upload unavailable. Use a direct media URL.');
      }
      update(rows.map((row, position) => position === index ? set(row, field, result.url) : row));
      setError(false);
      setFeedback('File uploaded. Save content to publish the slide.');
    } catch (error) {
      setError(true);
      setFeedback(error instanceof Error ? error.message : 'Upload failed. Try again.');
    } finally { setUploading(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || uploading || !writable) return;
    if (section.id === 'hero_section' && rows.some(row =>
      !String(row.video_url ?? '').trim() && !String(row.thumbnail_url ?? '').trim())) {
      setError(true);
      setFeedback('Add a photo or a video to every slide.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setFeedback('');
    try {
      const positioned = section.id === 'hero_section' || section.id.startsWith('homepage.');
      const records = rows.map((row, index) => {
        let result: Row = { ...(section.max && row._id ? { _id: row._id } : {}), ...(positioned ? { position: index + 1 } : {}) };
        for (const [name,,kind] of section.fields) {
          const value = get(row, name);
          if (kind === 'optional' && !String(value ?? '').trim()) continue;
          const input = kind === 'ids' ? (Array.isArray(value) ? value : String(value ?? '').split(/[\s,]+/).filter(Boolean))
            : kind === 'toggle' ? value === true : kind === 'number' ? Number(value) : String(value ?? '').trim();
          result = set(result, name, input);
        }
        return result;
      });
      const response = await fetch(adminPath('/api/workspace'), {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ action:'content', values:{ section:section.id, id:doc._id ?? null,
          revision:doc.updatedAt ?? null, value:section.max ? records : records[0] } }),
      });
      if (!response.ok) { setError(true); setFeedback((await response.text()).slice(0, 300)); return; }
      setError(false);
      setFeedback('Content saved.');
      setDirty(false);
      router.refresh();
    } catch { setError(true); setFeedback('The connection was interrupted. Reload before retrying.'); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <section className="panel padded">
    <div className="tabs" aria-label="Content sections">{sections.map(item =>
      <button className={'button ' + (section.id === item.id ? 'primary' : 'subtle')} key={item.id} type="button"
        aria-pressed={section.id === item.id} disabled={busy || uploading} onClick={() => switchSection(item)}>{item.label}</button>)}</div>
    <form className="stack-form" onSubmit={save}>
      <h2>{section.label}</h2>
      {section.id === 'hero_section' && <p>
        Add up to five slides. Upload a photo (JPG, PNG, WebP or AVIF, up to 6 MB) or video (MP4 or WebM, up to 24 MB),
        or paste a direct media URL. A video may have a cover photo. Videos play muted and loop while visible.
      </p>}
      {section.id === 'seo' && <p>Use / for the homepage or a storefront route such as /bd/products. The storefront keeps its canonical URL and indexing policy.</p>}
      {!rows.length && <p>No entries yet.</p>}
      {rows.map((row, index) => <fieldset className="editor-fieldset" key={index} disabled={!writable || busy || uploading}>
        <legend>{section.id === 'hero_section' ? 'Slide' : 'Entry'} {index + 1}</legend>
        <div className="editor-grid">{section.fields.map(([name, label, kind]) => {
          const value = get(row, name);
          const change = (input: unknown) => update(rows.map((item, position) => position === index ? set(item, name, input) : item));
          const text = Array.isArray(value) ? value.join('\n') : String(value ?? '');
          const media = section.id === 'hero_section' && (name === 'video_url' || name === 'thumbnail_url');
          return <div className="editor-field" key={name}><label>{label}
            {kind === 'toggle' ? <select value={String(value === true)} onChange={event => change(event.target.value === 'true')}>
              <option value="true">Yes</option><option value="false">No</option>
            </select> : kind === 'ids' || kind === 'long' ? <textarea rows={3} value={text} maxLength={kind === 'long' ? 170 : 1500}
              onChange={event => change(event.target.value)} required={kind === 'long'}/>
              : <input value={text} type={kind === 'number' ? 'number' : 'text'} required={kind !== 'optional'}
                maxLength={section.id === 'hero_section' && name === 'title' ? 120 : 1000} onChange={event => change(event.target.value)}/>}
          </label>
          {media && writable && <label className="carousel-upload">
            {name === 'video_url' ? 'Upload video' : 'Upload photo'}
            <input type="file" accept={name === 'video_url' ? '.mp4,.webm' : '.jpg,.jpeg,.png,.webp,.avif'}
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                void upload(index, name, file);
              }} />
          </label>}
          </div>;
        })}</div>
        {section.max && writable && <div className="page-actions">
          {index > 0 && <button className="button subtle" type="button" onClick={() => {
            const next = [...rows];
            [next[index - 1], next[index]] = [next[index], next[index - 1]];
            update(next);
          }}>Move up</button>}
          <button className="button subtle" type="button" onClick={() => update(rows.filter((_, position) => position !== index))}>{section.id === 'hero_section' ? 'Remove slide' : 'Remove entry'}</button>
        </div>}
      </fieldset>)}
      {writable && <div className="page-actions">
        {section.max && <button className="button secondary" type="button" disabled={busy || uploading || rows.length >= section.max}
          onClick={() => update([...rows, {}])}>{section.id === 'hero_section' ? 'Add slide' : 'Add entry'}</button>}
        <button className="button primary" disabled={!dirty || busy || uploading}>{busy ? 'Saving…' : 'Save content'}</button>
      </div>}
      {uploading && <p role="status">Uploading media…</p>}
      {feedback && <p className={error ? 'notice warn' : 'notice'} role={error ? 'alert' : 'status'}>{feedback}</p>}
    </form>
  </section>;
}
