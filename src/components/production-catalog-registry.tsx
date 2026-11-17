'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronLeft, Eye, ImageIcon, Save, Star, ThumbsUp, UserRound, X } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import { productionCmsPreview } from '@/lib/production-cms-media';
import type { Region } from '@/lib/sections';
import { saveCatalog } from './catalog-edit-form';
import { ProductionCatalogActions } from './production-catalog-actions';
import styles from './production-catalog.module.css';
import design from './production-catalog-details.module.css';

export type RegistryKind = 'brands' | 'faqs' | 'reviews';
export type RegistryProduct = { name: string; slug: string; sku: string; image: string };
export type RegistryRow = { id: string; name: string; tags: string[]; product: RegistryProduct; status: string;
  question: string; answer: string; creator: string; created: string; updated: string; rating: number; title: string; content: string;
  media: { url: string; type: string }[]; attachments: string[]; upvotes: number; downvotes: number; reply: string; };
const routes = {
  brands: { title: 'All Brands', list: '/dashboard/all-brands', create: '/dashboard/create-brand', detail: '/dashboard/update-brand/' },
  faqs: { title: 'Product FAQS', list: '/dashboard/product-faqs', create: '/dashboard/product-faqs/add-new-faq', detail: '/dashboard/product-faqs/' },
  reviews: { title: 'Product Reviews', list: '/dashboard/product-reviews', create: '', detail: '/dashboard/product-reviews/' },
};
const columns = {
  brands: ['Name','Tags','Status','Actions'],
  faqs: ['Sl No:','Image','Name','Question','Status','Created By','Create Date','Last Updated','Actions'],
  reviews: ['Sl No:','Image','Name','Rating','Title','Content','Status','Create Date','Actions'],
};
const statuses = { brands: ['active','inactive'], faqs: ['active','inactive','pending'], reviews: ['pending','approved','rejected'] };
const labels: Record<string,string> = { active: 'Active', approved: 'Approved', inactive: 'Inactive', pending: 'Pending', rejected: 'Rejected' };
const date = (value: string, full = false) => value && !Number.isNaN(Date.parse(value))
  ? new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dhaka', ...(full
    ? { dateStyle: 'short', timeStyle: 'medium' } as const : { dateStyle: 'medium' } as const) }).format(new Date(value)) : '—';
const scope = (path: string, region: Region) => path + (region === 'INTERNATIONAL' ? '?region=INTERNATIONAL' : '');
const imageUrl = (value: string) => {
  const src = productionCmsPreview(value);
  return src.startsWith('/') && !src.startsWith('//') || /^https:\/\//i.test(src) ? src : '';
};

function ProductImage({ source }: { source: string }) {
  const src = imageUrl(source);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className={design.thumbnail} src={src} alt=""/> : <span className={design.placeholder}><ImageIcon size={16}/></span>;
}

export function ProductionRegistryList({ rows, kind, region, page, hasNext, total, search, filter, product, rating, canCreate, canEdit, canDelete }: {
  rows: RegistryRow[]; kind: RegistryKind; region: Region; page: number; hasNext: boolean; total?: number; search?: string; filter?: string;
  product?: string; rating?: string; canCreate: boolean; canEdit: boolean; canDelete: boolean;
}) {
  const router = useRouter();
  const route = routes[kind];
  const pending = useRef(false);
  const [issue, setIssue] = useState('');
  async function change(row: RegistryRow, action: 'delete' | 'status', status?: string) {
    if (pending.current || action === 'delete' && !window.confirm('Delete this ' + (kind === 'faqs' ? 'FAQ' : kind.slice(0,-1)) + '?')) return;
    pending.current = true;
    setIssue('');
    try {
      await saveCatalog({ kind, action, id: row.id, region,
        values: { status } });
      router.refresh();
    } catch (failure) { setIssue(failure instanceof Error ? failure.message : 'Could not save the change.'); }
    finally { pending.current = false; }
  }
  const href = (number: number) => {
    const qs = new URLSearchParams();
    Object.entries({ region: region === 'INTERNATIONAL' ? region : '', q: search, filter, product, rating, page: number > 1 ? String(number) : '' })
      .forEach(([key, value]) => { if (value) qs.set(key, value); });
    return route.list + (qs.size ? '?' + qs.toString() : '');
  };
  return <section className={styles.page}>
    <header className={styles.header}>
      <h1>{route.title}</h1>
      {canCreate && route.create && <Link className={styles.primary} href={scope(route.create, region)}>
        {kind === 'faqs' ? 'Add new Faq' : 'Add new Brand'}
      </Link>}
    </header>
    {issue && <p className={styles.error} role="alert">{issue}</p>}
    <div className={styles.tableBorder + ' ' + design.scroll}>
      <table className={styles.table}>
        <thead><tr>{columns[kind].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => {
          const detail = scope(route.detail + row.id, region);
          return <tr key={row.id}>
            {kind === 'brands' ? <><td>{row.name}</td><td><div className={design.tags}>{row.tags.map(tag => <span key={tag}>{tag}</span>)}</div></td></>
              : <>
                <td>{(page - 1) * 20 + index + 1}</td><td><ProductImage source={row.product.image}/></td>
                <td><p>{row.product.name}</p><small className={design.muted}>{kind === 'faqs' && 'Slug: '}{row.product.slug}</small></td>
                {kind === 'faqs' ? <td className={design.description}>{row.question}</td>
                  : <><td>{row.rating}</td><td>{row.title}</td><td className={design.description}>{row.content}</td></>}
              </>}
            <td><span className={styles.activeBadge} data-active={row.status === 'active' || row.status === 'approved'}>{labels[row.status] || row.status}</span></td>
            {kind === 'faqs' && <td>{row.creator || 'Anonymous'}</td>}
            {kind !== 'brands' && <td>{date(row.created)}</td>}
            {kind === 'faqs' && <td>{date(row.updated)}</td>}
            <td><div className={design.tableActions}>
              {kind !== 'brands' && <Link href={detail} className={styles.outline} aria-label={'View ' + (row.title || row.question)}><Eye size={16}/></Link>}
              {(canEdit || canDelete) && <ProductionCatalogActions label="Open menu" title="Actions">
                {close => <>
                  {kind === 'brands' && canEdit && <Link href={detail} onClick={close}>Edit</Link>}
                  {canEdit && kind !== 'brands' && statuses[kind].filter(status => status !== row.status).map(status =>
                    <button key={status} type="button" onClick={() => { close(); void change(row, 'status', status); }}>{labels[status]}</button>)}
                  {canDelete && <button type="button" onClick={() => { close(); void change(row, 'delete'); }}>Delete</button>}
                </>}
              </ProductionCatalogActions>}
            </div></td>
          </tr>;
        })}{!rows.length && <tr><td colSpan={columns[kind].length} className={styles.empty}>No records found.</td></tr>}</tbody>
      </table>
    </div>
    {(kind !== 'brands' || page > 1 || hasNext) && <nav className={design.pages} aria-label="Pages">
      <span>20</span><span>{rows.length ? (page - 1) * 20 + 1 : 0} - {(page - 1) * 20 + rows.length} of {total ?? (page - 1) * 20 + rows.length}</span>
      {page > 1 ? <Link className={styles.outline} href={href(page - 1)}>Previous</Link> : <button className={styles.outline} disabled>Previous</button>}
      {hasNext ? <Link className={styles.outline} href={href(page + 1)}>Next</Link> : <button className={styles.outline} disabled>Next</button>}
    </nav>}
  </section>;
}

export function ProductionBrandEditor({ brand, region }: { brand?: RegistryRow; region: Region }) {
  const router = useRouter();
  const [tags, setTags] = useState(brand?.tags ?? []);
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
    setBusy(true); setError('');
    try {
      await saveCatalog({ kind: 'brands', id: brand?.id, region, action: 'save', values: { name, tags: tags.join('\n') } });
      router.push(scope(routes.brands.list, region)); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save the brand.'); }
    finally { setBusy(false); }
  }
  return <section className={styles.page}>
    <h1>{brand ? 'Update Brand' : 'Create New Brand'}</h1>
    <form className={design.forms + ' ' + design.editorPanel} onSubmit={save}>
      <label className={styles.field}>Brand Name<input name="name" defaultValue={brand?.name} placeholder="Enter brand name" required maxLength={2000}/></label>
      <label className={styles.field}>Tags (for searching)<input value={tag} placeholder="Enter tags (press Enter to add)" onChange={event => setTag(event.target.value)}
        maxLength={2000} onKeyDown={event => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const next = tag.trim();
          if (next && tags.length < 60) setTags([...new Set([...tags,next])]);
          setTag('');
        }}/></label>
      {tags.length > 0 && <div className={design.tags}>{tags.map(value => <span key={value}>{value}
        <button type="button" aria-label={'Remove ' + value} onClick={() => setTags(tags.filter(item => item !== value))}><X size={13}/></button>
      </span>)}</div>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={design.submit}><button className={styles.primary} disabled={busy}>{busy ? 'Saving…' : brand ? 'Update Brand' : 'Create Brand'}</button></div>
    </form>
  </section>;
}

export function ProductionFaqEditor({ region, chosenProduct }: {
  region: Region; chosenProduct?: { id: string; product: RegistryProduct };
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(chosenProduct);
  const [show, setShow] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<{ id:string; product: RegistryProduct }[]>([]);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lookup = useRef<AbortController | null>(null);
  async function search(term: string) {
    setQuery(term);
    lookup.current?.abort();
    if (!term.trim()) { setMatches([]); setLoading(false); return; }
    const controller = new AbortController();
    lookup.current = controller;
    setLoading(true);
    try {
      const response = await fetch(adminPath('/api/catalog-faq-products?' + new URLSearchParams({ region, q: term })), { signal: controller.signal });
      if (!response.ok) throw new Error('Product search could not be loaded.');
      const data = await response.json();
      if (!controller.signal.aborted) setMatches(data);
    } catch (failure) { if (!controller.signal.aborted) { setMatches([]); setError(failure instanceof Error ? failure.message : 'Product search failed.'); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!selected) { setError('Select a product.'); return; }
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError('');
    try {
      await saveCatalog({ kind: 'faqs', region, action: 'save', values: { ...values, product: selected.id } });
      router.push(scope(routes.faqs.list, region)); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save the FAQ.'); }
    finally { setBusy(false); }
  }
  return <section className={styles.page + ' ' + design.faqCreate}>
    <form onSubmit={save} className={design.forms}>
      <header className={styles.header}><div className={design.heading}>
        <Link href={scope(routes.faqs.list, region)} className={styles.outline} aria-label="Back"><ChevronLeft size={16}/></Link>
        <h1>Add New Faq</h1></div>
        <button className={styles.primary} disabled={busy}><Save size={16}/>{busy ? 'Saving…' : 'Save FAQ'}</button>
      </header>
      <div className={design.readColumns}>
        <section className={design.editorPanel}>
          <h2>FAQ Details</h2><p className={design.muted}>Enter the question and answer details</p>
          <label className={styles.field}>Question *<input name="question" maxLength={500} required value={question}
            placeholder="e.g., What is the warranty period?" onChange={event => setQuestion(event.target.value)}/>
            <small className={design.muted}>{question.length}/500 characters</small></label>
          <label className={styles.field}>Answer *<textarea name="answer" maxLength={2000} required value={answer}
            placeholder="Provide a detailed answer to the question" onChange={event => setAnswer(event.target.value)}/>
            <small className={design.muted}>{answer.length}/2000 characters</small></label>
          <label className={styles.field}>Status *<select className={styles.select} name="status" aria-label="Status" defaultValue="active">
            {statuses.faqs.map(status => <option key={status} value={status}>{labels[status]}</option>)}
          </select><small className={design.muted}>Control visibility of the FAQ on the product page</small></label>
        </section>
        <section className={design.editorPanel}>
          <h2>Product</h2><p className={design.muted}>Select the product this FAQ belongs to</p>
          <button className={styles.outline} type="button" aria-expanded={show} onClick={() => setShow(!show)}>Select a product</button>
          {show && <div className={design.picker}>
            <input type="search" aria-label="Search products" placeholder="Search by name or SKU" maxLength={80} value={query} autoFocus
              onChange={event => { setError(''); void search(event.target.value); }}/>
            {loading ? <p role="status">Searching…</p> : matches.map(match => <button type="button" key={match.id} onClick={() => {
              setSelected(match); setShow(false); setMatches([]); setQuery('');
            }}>{match.product.name} {match.product.sku}</button>)}
            {!loading && query && !matches.length && <p>No matching products.</p>}
          </div>}
          {selected ? <div className={design.selected}><ProductImage source={selected.product.image}/><p>{selected.product.name}</p></div>
            : <div className={design.noProduct}><ImageIcon size={40}/><p>No product selected</p><small>Search and select a product above</small></div>}
        </section>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </form>
  </section>;
}

function ReplyForm({ row, kind, region }: { row: RegistryRow; kind: 'faqs' | 'reviews'; region: Region }) {
  const router = useRouter();
  const [reply, setReply] = useState(kind === 'reviews' ? row.reply : row.answer);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setNote('');
    try {
      await saveCatalog({ kind, region, id: row.id, action: 'reply', values: { content: reply } });
      if (kind === 'faqs') router.push(scope(routes.faqs.list, region));
      else setNote('Reply saved.');
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save the reply.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className={design.forms}>
    <label className={styles.field}>{kind === 'faqs' ? 'Your Answer:' : 'SUBMIT A REPLY'}
      <textarea value={reply} onChange={event => setReply(event.target.value)}
        disabled={busy} maxLength={2000} required placeholder={kind === 'faqs' ? 'Write your answer…' : 'Write your professional response…'}/>
    </label>
    {error && <p className={styles.error} role="alert">{error}</p>}{note && <p role="status">{note}</p>}
    <div className={design.submit}>
      {kind === 'reviews' && <button className={styles.outline} type="button" onClick={() => { setReply(row.reply); setNote(''); setError(''); }}>Cancel</button>}
      <button className={styles.primary} disabled={busy || !reply.trim()}>{busy ? 'Saving…' : kind === 'faqs' ? 'Submit Reply' : 'Post Reply'}</button>
    </div>
  </form>;
}

export function ProductionRegistryDetail({ row, kind, region, canEdit, showAttachments }: {
  row: RegistryRow; kind: 'faqs' | 'reviews'; region: Region; canEdit: boolean; showAttachments: boolean;
}) {
  const review = kind === 'reviews';
  const product = row.product;
  const info = review
    ? [['Customer', row.creator || 'Anonymous User', UserRound],
      ['Helpful vote', 'Upvote: ' + row.upvotes + ', DownVote: ' + row.downvotes, ThumbsUp],
      ['Reviewed On', date(row.created, true), CalendarDays]] as const
    : [['Product:', product.name, null], ['SKU:', product.sku, null], ['Slug:', product.slug, null]] as const;
  return <section className={styles.page + ' ' + (review ? design.review : '')}>
    <header className={design.heading}><Link href={scope(routes[kind].list, region)} className={styles.outline}>
      <ChevronLeft size={16}/>{review ? 'Back to Review' : 'Back to Faq'}</Link></header>
    <div className={styles.header}><h1>{review ? 'REVIEW DETAILS' : 'FAQ Details'}</h1>
      {review && <span className={styles.activeBadge} data-active="true">{row.status.toUpperCase()}</span>}</div>
    <div className={design.twoPart}>
      <div className={design.forms}>
        <section className={design.plainPanel}>
          {review ? <>
            <div className={design.stars} aria-label={row.rating + ' out of 5 stars'}>{[1,2,3,4,5].map(number =>
              <Star key={number} size={20} data-filled={number <= row.rating}/>)}</div>
            <h2 className={design.reviewTitle}>{row.title}</h2><p className={design.reviewContent}>{row.content}</p>
            {row.media.map((asset, index) => {
              const src = imageUrl(asset.url);
              return src ? <a key={src + index} href={src} target="_blank" rel="noreferrer">{asset.type || 'Media'} {index + 1}</a> : null;
            })}
            {showAttachments && row.attachments.map((type, index) => {
              const src = adminPath('/api/storefront?' + new URLSearchParams({ id: row.id, index: String(index) }));
              // eslint-disable-next-line @next/next/no-img-element
              return type === 'video/mp4' ? <video key={src} src={src} controls preload="metadata"/> : <img key={src} src={src} alt={'Review attachment ' + (index + 1)}/>;
            })}
            {row.reply && <aside className={design.previousReply}><strong>Previous Reply</strong><p>{row.reply}</p></aside>}
          </> : <p><strong>Question:</strong> {row.question}</p>}
          {!review && canEdit && <ReplyForm row={row} kind={kind} region={region}/>}
          {!review && !canEdit && row.answer && <p>{row.answer}</p>}
        </section>
        {review && canEdit && <ReplyForm row={row} kind={kind} region={region}/>}
      </div>
      <aside className={design.plainPanel}>
        {review && <h2>Product Details</h2>}
        {product.name && review && <p>{product.name}</p>}
        <dl className={design.recordData}>{info.map(([label, value, Icon]) => <div key={label}>
          <dt>{Icon && <Icon size={16}/>} {label}</dt><dd>{value || '—'}</dd></div>)}</dl>
      </aside>
    </div>
  </section>;
}
