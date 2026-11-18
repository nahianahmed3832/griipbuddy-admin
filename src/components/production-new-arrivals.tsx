'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import { contentProductImage, type ContentProduct } from '@/lib/content-products';
import { ContentProductPicker } from './content-product-picker';
import styles from './production-content.module.css';

type Group = { _id?: string; name: string; slug: string; icon?: string; description?: string; product_ids: string[]; position: number };
type Document = { _id?: string; updatedAt?: string; homepage?: { new_arrivals?: Group[] } };
const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function ProductionNewArrivals({ doc, products, writable, allowProducts }: {
  doc: Document; products: ContentProduct[]; writable: boolean; allowProducts: boolean;
}) {
  const router = useRouter();
  const groupDialog = useRef<HTMLDialogElement>(null);
  const removeDialog = useRef<HTMLDialogElement>(null);
  const rows = [...(doc.homepage?.new_arrivals ?? [])].sort((a, b) => a.position - b.position);
  const [draft, setDraft] = useState<Group>();
  const [removing, setRemoving] = useState<Group>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function edit(group?: Group) {
    setError('');
    setDraft(group ?? { name: '', slug: '', product_ids: [], position: Math.max(0, ...rows.map(row => row.position)) + 1 });
    groupDialog.current?.showModal();
  }

  async function save(value: Group[], dialog: HTMLDialogElement | null, message: string) {
    if (pending || !writable) return;
    setPending(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(adminPath('/api/workspace'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'content', values: { section: 'homepage.new_arrivals',
          id: doc._id ?? null, revision: doc.updatedAt ?? null, value } }),
      });
      if (!response.ok) throw new Error((await response.text()).slice(0, 300));
      dialog?.close();
      setSuccess(message);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save the group.');
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.product_ids.length) { setError('Select at least one product.'); return; }
    const { icon, description, ...group } = draft;
    const value = { ...group, ...(icon?.trim() && { icon: icon.trim() }), ...(description?.trim() && { description: description.trim() }) };
    const next = draft._id ? rows.map(row => row._id === draft._id ? value : row) : [...rows, value];
    void save(next, groupDialog.current, draft._id ? 'Group updated.' : 'Group added.');
  }

  return <section className={styles.page}>
    <header className={styles.heading}><div><h1>New Arrivals</h1><p>Manage new arrival groups (e.g., Tech, Bags, Fashion) with products</p></div>
      <button type="button" className="button secondary" disabled={pending} onClick={() => router.refresh()}>Refresh</button>
    </header>
    <div className={styles.bannerRows}>
      {rows.map(group => <article className={styles.bannerCard} key={group._id || group.slug}>
        <div className={styles.heading}><div><h2>{group.icon && <span aria-hidden="true">{group.icon} </span>}{group.name}</h2>
          <p>{group.slug} · Position {group.position}</p></div>
          {writable && <div className="page-actions">
            <button type="button" className="icon-button" disabled={pending} aria-label={'Edit ' + group.name} onClick={() => edit(group)}><Pencil size={16}/></button>
            <button type="button" className="icon-button" disabled={pending} aria-label={'Delete ' + group.name}
              onClick={() => { setError(''); setRemoving(group); removeDialog.current?.showModal(); }}><Trash2 size={16}/></button>
          </div>}
        </div>
        {group.description && <p>{group.description}</p>}
        <strong>Products ({group.product_ids.length})</strong>
        {allowProducts && <div className={styles.groupPreview}>
          {group.product_ids.slice(0, 3).map(id => {
            const product = products.find(product => product.id === id.toLowerCase());
            const image = contentProductImage(product?.image);
            return image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={id} src={image} width={48} height={48} title={product?.name} alt={product?.name || ''} referrerPolicy="no-referrer"/>
            ) : <span key={id} title={product?.name || 'Product unavailable'}>{product?.name?.slice(0, 2) || '—'}</span>;
          })}
          {group.product_ids.length > 3 && <span>+{group.product_ids.length - 3}</span>}
        </div>}
      </article>)}
      {writable && rows.length < 20 && <button type="button" className={styles.addGroup} disabled={pending} onClick={() => edit()}>
        <Plus size={22}/><strong>Add New Group</strong><span>Create a new product group (e.g., Tech, Bags, Fashion)</span>
      </button>}
    </div>
    {success && <p className="notice" role="status">{success}</p>}
    <aside className={styles.tips}><h2>Tips</h2><ul>
      <li>Create groups to organize new arrivals</li><li>Each group must have a unique slug for URL routing</li>
      <li>Add products to groups by searching and selecting</li><li>Groups are displayed in position order on homepage</li>
    </ul></aside>
    <dialog ref={groupDialog} className={styles.dialog} aria-labelledby="arrival-dialog-title"
      onCancel={event => { if (pending) event.preventDefault(); }}>
      {draft && <form className="stack-form" onSubmit={submit}>
        <h2 id="arrival-dialog-title">{draft._id ? 'Edit Group' : 'Add New Group'}</h2>
        <p>Configure your new arrival group with name, slug, and products</p>
        <fieldset className={styles.dialogFields} disabled={pending}>
          <label>Group Name *<input value={draft.name} required maxLength={50} placeholder="e.g., Tech"
            onChange={event => { const name = event.target.value; setDraft({ ...draft, name, slug: draft._id ? draft.slug : slugify(name) }); }}/></label>
          <label>Slug *<input value={draft.slug} required maxLength={50} pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            onChange={event => setDraft({ ...draft, slug: event.target.value })}/></label>
          <label>Icon<input value={draft.icon ?? ''} maxLength={10} onChange={event => setDraft({ ...draft, icon: event.target.value })}/></label>
          <label>Description<textarea value={draft.description ?? ''} maxLength={200} rows={2}
            onChange={event => setDraft({ ...draft, description: event.target.value })}/></label>
          <label>Position<input type="number" required value={draft.position || ''} min={1} max={100}
            onChange={event => setDraft({ ...draft, position: Number(event.target.value) })}/></label>
          <div><strong>Products *</strong>
            {allowProducts && <ContentProductPicker multiple production value={draft.product_ids.join(', ')} products={products}
              update={value => setDraft({ ...draft, product_ids: value.split(/[\s,]+/).filter(Boolean) })}/>}
          </div>
        </fieldset>
        {error && <p className="notice warn" role="alert">{error}</p>}
        <div className="page-actions">
          <button type="button" className="button secondary" disabled={pending} onClick={() => groupDialog.current?.close()}>Cancel</button>
          <button className="button primary" disabled={pending}>{pending ? 'Saving…' : draft._id ? 'Update Group' : 'Add Group'}</button>
        </div>
      </form>}
    </dialog>
    <dialog ref={removeDialog} className={styles.dialog} aria-labelledby="remove-arrival-title"
      onCancel={event => { if (pending) event.preventDefault(); }}>
      <h2 id="remove-arrival-title">Delete Group</h2>
      <p>Delete {removing?.name}?</p>
      {error && <p className="notice warn" role="alert">{error}</p>}
      <div className="page-actions">
        <button type="button" className="button secondary" disabled={pending} onClick={() => removeDialog.current?.close()}>Cancel</button>
        <button type="button" className="button primary" disabled={pending || !removing}
          onClick={() => void save(rows.filter(group => group.slug !== removing?.slug), removeDialog.current, 'Group deleted.')}>Delete Group</button>
      </div>
    </dialog>
  </section>;
}
