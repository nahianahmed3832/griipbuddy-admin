'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Folder, FolderTree, ImageIcon, Layers, Plus, Search, X } from 'lucide-react';
import { adminPath } from '@/lib/paths';
import { categoryKey, categoryName, categorySlug, childrenFor, parentKey, placements, visibility, type CategoryNode } from '@/lib/category-tree';

type Editor = { node: CategoryNode } | { parent?: CategoryNode };
const depthLabel = ['Top level','Level 2','Level 3','Level 4'];
const inputKey = (size: string, field: string) => size + '-' + field;

export function CategoryManager({ nodes, initial, canCreate, canEdit }: {
  nodes: CategoryNode[]; initial?: string; canCreate: boolean; canEdit: boolean;
}) {
  const [rows, setRows] = useState(nodes);
  const index = useMemo(() => new Map(rows.map(node => [categoryKey(node),node])), [rows]);
  const branches = useMemo(() => childrenFor(rows), [rows]);
  const [selectedKey, setSelected] = useState(() => {
    const start = nodes.find(node => node.id === initial) ?? childrenFor(nodes).get('')?.[0] ?? nodes[0];
    return start ? categoryKey(start) : '';
  });
  const selected = index.get(selectedKey);
  const [expanded, setExpanded] = useState(() => new Set(selected?.ancestors.map((id, depth) => depth + ':' + id)));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [editor, setEditor] = useState<Editor>();
  const [feedback, setFeedback] = useState('');
  const [moveError, setMoveError] = useState('');
  const [moving, setMoving] = useState(false);
  const detail = useRef<HTMLElement>(null);
  const view = new Map(rows.map(row => [categoryKey(row),visibility(row,index)]));
  const roots = branches.get('') ?? [];
  const issues = rows.filter(row => view.get(categoryKey(row)) === 'Needs review').length;
  const hidden = rows.filter(row => ['Hidden','Hidden by parent'].includes(view.get(categoryKey(row)) ?? '')).length;
  const needle = query.trim().toLocaleLowerCase();
  const filtering = Boolean(needle || filter !== 'all');
  const matches = rows.filter(node => {
    const state = view.get(categoryKey(node));
    return (!needle || [node.name_en,node.name_bn,node.slug].some(text => text?.toLocaleLowerCase().includes(needle)))
      && (filter === 'all' || filter === state || filter === 'Hidden' && state === 'Hidden by parent');
  });
  const show = new Set<string>();
  if (filtering) {
    for (const row of matches) {
      show.add(categoryKey(row));
      for (let cursor = row; branches.get(parentKey(cursor))?.includes(cursor);) {
        const key = parentKey(cursor);
        const parent = index.get(key);
        if (!parent) break;
        show.add(key);
        cursor = parent;
      }
    }
  }

  function select(node: CategoryNode, scroll = false) {
    setSelected(categoryKey(node));
    setMoveError('');
    setExpanded(previous => new Set([...previous, ...node.ancestors.map((id, depth) => depth + ':' + id)]));
    if (scroll && window.matchMedia('(max-width: 770px)').matches) {
      requestAnimationFrame(() => detail.current?.scrollIntoView({ block: 'start' }));
    }
  }

  function save(node: CategoryNode, created: boolean) {
    setRows(previous => created ? [...previous, node] : previous.map(row => categoryKey(row) === categoryKey(node) ? node : row));
    if (created) { setQuery(''); setFilter('all'); }
    select(node);
    setEditor(undefined);
    setFeedback(created ? 'Category created.' : 'Category changes saved.');
  }

  function renderGroup(nodes: CategoryNode[]) {
    const rendered = filtering ? nodes.filter(node => show.has(categoryKey(node))) : nodes;
    return <ul className="category-branch">{rendered.map(node => {
      const key = categoryKey(node);
      const children = branches.get(key) ?? [];
      const open = filtering || expanded.has(key);
      const status = view.get(key) ?? 'Needs review';
      return <li key={key}>
        <div className="category-tree-row" data-current={key === selectedKey}>
          {children.length && !filtering ? <button type="button" className="category-expand" aria-expanded={open}
            aria-label={(open ? 'Collapse ' : 'Expand ') + categoryName(node)} onClick={() => setExpanded(previous => {
              const next = new Set(previous);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            })}>{open ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}</button> : <span className="category-spacer"/>}
          <button type="button" className="category-node" aria-current={key === selectedKey ? 'true' : undefined}
            onClick={() => select(node, true)}>
            <Folder size={16} aria-hidden="true"/><span>{categoryName(node)}{node.name_bn && node.name_bn !== node.name_en &&
              <small lang="bn">{node.name_bn}</small>}</span>
            <span className={'category-dot ' + (status === 'Visible' ? 'is-visible' : status === 'Needs review' ? 'is-issue' : '')}
              title={status}><span className="category-sr">{status}</span></span>
          </button>
        </div>
        {open && children.length > 0 && renderGroup(children)}
      </li>;
    })}</ul>;
  }

  const selectedStatus = selected ? view.get(selectedKey) : undefined;
  const children = branches.get(selectedKey) ?? [];
  const siblings = selected ? branches.get(parentKey(selected)) ?? [] : [];
  const rank = siblings.findIndex(node => categoryKey(node) === selectedKey);

  async function move(direction: 'earlier' | 'later') {
    const neighbor = rank >= 0 ? siblings[rank + (direction === 'earlier' ? -1 : 1)] : undefined;
    if (!selected || !neighbor || moving) return;
    setMoving(true);
    setFeedback('');
    setMoveError('');
    try {
      const response = await fetch(adminPath('/api/categories?reorder=1'), { method:'POST',
        headers:{'content-type':'application/json'}, body:JSON.stringify({
          depth:selected.depth, id:selected.id, revision:selected.revision, neighbor:neighbor.id, direction,
        }),
      });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.nodes)) throw new Error(result.error || 'The category could not be moved.');
      const changed = new Map((result.nodes as CategoryNode[]).map(node => [categoryKey(node),node]));
      setRows(previous => previous.map(node => changed.get(categoryKey(node)) ?? node));
      setFeedback('Category order saved.');
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : 'The category could not be moved.');
    } finally { setMoving(false); }
  }

  return <div className="category-workspace">
    <header className="page-heading">
      <div><span className="eyebrow">CATALOG / ORGANIZATION</span><h1>Categories</h1>
        <p>Manage the hierarchy, labels, and images customers use to browse the store.</p></div>
      {canCreate && <button className="button primary" disabled={moving} onClick={() => setEditor({})}><Plus size={17}/> Add top level category</button>}
    </header>
    <div className="category-summary" aria-label="Catalog category totals">
      <span><FolderTree size={16}/> <strong>{roots.length}</strong> top level</span>
      <span><Layers size={16}/> <strong>{rows.length}</strong> total categories</span>
      <span><span className="category-dot"/> <strong>{hidden}</strong> hidden</span>
      {issues > 0 && <span><span className="category-dot is-issue"/> <strong>{issues}</strong> need review</span>}
      <span className="category-scope">Shared across markets</span>
    </div>
    <p role="status" className={feedback ? 'notice' : 'category-sr'}>{feedback}</p>
    {!canCreate && !canEdit && <p className="notice">This category tree is available to you in read-only mode.</p>}
    <div className="category-layout">
      <section className="panel category-browser" aria-labelledby="category-tree-heading">
        <header><h2 id="category-tree-heading">Category tree</h2><p className="muted">Select a category to see its details.</p></header>
        <div className="category-search">
          <label className="category-search-input"><Search size={16}/><input type="search" value={query}
            onChange={event => setQuery(event.target.value)} placeholder="Search name or slug" aria-label="Search categories"/></label>
          <select value={filter} aria-label="Filter by visibility" onChange={event => setFilter(event.target.value)}>
            <option value="all">All statuses</option><option>Visible</option><option>Hidden</option>
            {issues > 0 && <option>Needs review</option>}
          </select>
        </div>
        <div className="category-tree" aria-label="Category hierarchy">
          {filtering && <p className="category-results muted">{matches.length} {matches.length === 1 ? 'match' : 'matches'}</p>}
          {!matches.length ? <p className="category-empty muted">{rows.length ? 'No categories match. Try another search or status.' : 'No categories yet.'}</p> :
            <>{renderGroup(roots)}{(branches.get('?') ?? []).some(node => !filtering || show.has(categoryKey(node))) &&
              <><h3 className="category-unlinked">Missing or inconsistent parent</h3>{renderGroup(branches.get('?') ?? [])}</>}</>}
        </div>
      </section>
      <section ref={detail} className="panel category-detail" aria-label="Category details">
        {selected ? <>
          <nav className="category-breadcrumb" aria-label="Category path"><ol>
            {selected.ancestors.map((id,depth) => {
              const ancestor = index.get(depth + ':' + id);
              return <li key={depth}>{ancestor ? <button type="button" onClick={() => select(ancestor)}>{categoryName(ancestor)}</button> :
                <span>Missing parent</span>}<ChevronRight aria-hidden="true" size={13}/></li>;
            })}
            <li aria-current="page">{categoryName(selected)}</li>
          </ol></nav>
          <div className="category-detail-top">
            <div><span className="category-level">{depthLabel[selected.depth]}</span>
              <h2>{categoryName(selected)}</h2>
              {selected.name_bn && <p className="muted" lang="bn">{selected.name_bn}</p>}</div>
            <span className={'category-state ' + (selectedStatus === 'Visible' ? 'is-visible' : selectedStatus === 'Needs review' ? 'is-issue' : '')}>
              {selectedStatus}
            </span>
          </div>
          <dl className="category-details-grid">
            <div><dt>Storefront slug</dt><dd>{selected.slug || '—'}</dd></div>
            <div><dt>Sort position</dt><dd>{selected.position}</dd></div>
            <div><dt>Direct children</dt><dd>{children.length}</dd></div>
          </dl>
          {selectedStatus === 'Hidden by parent' && <p className="notice">Make the parent categories visible to show this category in navigation.</p>}
          {selectedStatus === 'Needs review' && <p className="notice warn">The saved category path needs review before this branch can be extended.</p>}
          {(canEdit || canCreate) && <div className="page-actions">
            {canEdit && <button className="button secondary" disabled={moving} onClick={() => setEditor({ node:selected })}>Edit category</button>}
            {canCreate && selected.depth < 3 && selectedStatus !== 'Needs review' &&
              <button className="button secondary" disabled={moving} onClick={() => setEditor({ parent:selected })}><Plus size={16}/> Add child category</button>}
          </div>}
          {canEdit && selectedStatus !== 'Needs review' && siblings.length > 1 && <div className="category-order">
            <span className="muted">Order among siblings</span>
            <button className="button secondary" disabled={moving || rank <= 0} onClick={() => void move('earlier')}><ArrowUp size={15}/> Move earlier</button>
            <button className="button secondary" disabled={moving || rank >= siblings.length - 1} onClick={() => void move('later')}><ArrowDown size={15}/> Move later</button>
          </div>}
          {moveError && <p role="alert" className="notice warn">{moveError}</p>}
          <div className="category-section"><h3>Descriptions</h3>
            <dl className="category-copy">
              <div><dt>English</dt><dd>{selected.description_en || 'No description'}</dd></div>
              <div><dt>Bangla</dt><dd lang="bn">{selected.description_bn || 'No description'}</dd></div>
            </dl>
          </div>
          <div className="category-section"><h3>Storefront media</h3>
            <div className="category-media">{placements.map(([size,label,ratio]) => {
              const slot = selected.media.find(row => row.size === size);
              const image = assetUrl(slot?.image);
              const video = assetUrl(slot?.video);
              return <div key={size}><ImageIcon size={17} aria-hidden="true"/><strong>{label}</strong>
                <small className="muted">{ratio} · {[slot?.image && 'Image',slot?.video && 'Video'].filter(Boolean).join(' + ') || 'None'}</small>
                {(image || video) && <div className="category-asset-links">
                  {image && <a href={image} target="_blank" rel="noreferrer" aria-label={'Open ' + label.toLowerCase() + ' image'}>Open image</a>}
                  {video && <a href={video} target="_blank" rel="noreferrer" aria-label={'Open ' + label.toLowerCase() + ' video'}>Open video</a>}
                </div>}
              </div>;
            })}</div>
          </div>
        </> : <div className="category-empty"><h2>Select a category</h2><p className="muted">Choose a category from the tree to see its details.</p></div>}
      </section>
    </div>
    {editor && <CategoryEditor editor={editor} index={index} close={() => setEditor(undefined)} save={save}/>}
  </div>;
}

function assetUrl(value?: string) {
  try {
    const url = new URL(value ?? '');
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch { /* Older records may contain non-URL media references. */ }
}

function CategoryEditor({ editor, index, close, save }: {
  editor: Editor; index: Map<string, CategoryNode>; close: () => void; save: (node: CategoryNode, created: boolean) => void;
}) {
  const node = 'node' in editor ? editor.node : undefined;
  const parent = 'parent' in editor ? editor.parent : node ? index.get(parentKey(node)) : undefined;
  const depth = node?.depth ?? (parent ? parent.depth + 1 : 0);
  const blocked = depth > 0 && (!parent || visibility(parent,index) !== 'Visible');
  const heading = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(node?.name_en ?? '');
  const [manualSlug, setManualSlug] = useState<string>();
  const [media, setMedia] = useState<Record<string,string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const endpoint = adminPath('/api/categories');

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function upload(file: File, key: string) {
    if (!file || busy) return;
    setError('');
    setBusy(key);
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image up to 8 MB.');
      const response = await fetch(endpoint + '?upload=1', { method:'POST', body:file });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || 'The image could not be uploaded.');
      setMedia(previous => ({ ...previous, [key]:result.url }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The image could not be uploaded.');
    } finally { setBusy(''); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const read = (key: string) => String(form.get(key) ?? '').trim();
    const mediaChanges = placements.flatMap(([size]) => {
      const original = node?.media.find(row => row.size === size);
      const change = { size } as { size: string; image?: string | null; video?: string | null };
      for (const key of ['image','video'] as const) {
        const next = media[inputKey(size,key)];
        if (next !== undefined && next.trim() !== (original?.[key] ?? '')) change[key] = next.trim() || null;
      }
      return 'image' in change || 'video' in change ? [change] : [];
    });
    const body = {
      depth, name_en:read('name_en'), ...(read('name_bn') && { name_bn:read('name_bn') }), description_en:read('description_en'), description_bn:read('description_bn'),
      ...(read('position') && { position:Number(read('position')) }),
      is_published: form.get('visibility') === 'visible',
      ...(node ? { id:node.id, revision:node.revision } : { slug:read('slug'), ...(parent && { parent:parent.id }) }),
      ...(mediaChanges.length && { media:mediaChanges }),
    };
    if (!body.name_en || ((!node || node.name_bn) && !body.name_bn)) {
      setError('Enter the required category names.');
      return;
    }
    setError('');
    setBusy('save');
    try {
      const response = await fetch(endpoint, { method:node ? 'PATCH' : 'POST',
        headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok || !result.node) throw new Error(result.error || 'The category could not be saved.');
      save(result.node, !node);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The category could not be saved.');
    } finally { setBusy(''); }
  }

  return <dialog className="form-dialog category-editor" ref={dialog} aria-labelledby={heading} onCancel={event => {
    event.preventDefault(); if (!busy) close();
  }}>
    <form onSubmit={submit}>
      <header className="category-editor-head">
        <div><h2 id={heading}>{node ? 'Edit category' : parent ? 'Add child category' : 'Add top level category'}</h2>
          <p className="muted">{parent ? 'Under ' + categoryName(parent) : node ? 'Top level category' : 'Create a new branch in the catalog.'}</p></div>
        <button type="button" aria-label="Close editor" className="category-expand" disabled={!!busy} onClick={close}><X size={19}/></button>
      </header>
      <div className="category-editor-body">
        <fieldset disabled={!!busy}>
          <legend>Category details</legend>
          <div className="category-field-grid">
            <label>English name<input name="name_en" value={name} onChange={event => setName(event.target.value)} required maxLength={160} autoFocus/></label>
            <label>Bangla name{node && !node.name_bn && <small>Optional for this existing category</small>}
              <input name="name_bn" lang="bn" defaultValue={node?.name_bn} required={!node || !!node.name_bn} maxLength={160}/></label>
            <label>English description <small>Optional</small><textarea name="description_en" defaultValue={node?.description_en} rows={2} maxLength={2000}/></label>
            <label>Bangla description <small>Optional</small><textarea name="description_bn" lang="bn" defaultValue={node?.description_bn} rows={2} maxLength={2000}/></label>
          </div>
        </fieldset>
        <fieldset disabled={!!busy}>
          <legend>Storefront settings</legend>
          <div className="category-field-grid">
            <label>Storefront slug<input name="slug" value={node?.slug ?? manualSlug ?? categorySlug(name)}
              onChange={event => setManualSlug(event.target.value)} required={!node} readOnly={!!node} maxLength={160}
              pattern={node ? undefined : '[a-z0-9]+(?:-[a-z0-9]+)*'}/>
              <small>{node ? 'Kept stable for existing links.' : 'Lowercase letters, numbers and hyphens.'}</small>
            </label>
            <label>Sort position<input name="position" type="number" min={0} max={100000} step={1} defaultValue={node?.position} required={!!node}
              placeholder="Add to the end"/>
              <small>Lower numbers appear first among siblings.</small>
            </label>
            <label>Navigation visibility<select name="visibility" defaultValue={node?.is_published ? 'visible' : 'hidden'}>
              <option value="hidden">Hidden</option><option value="visible" disabled={!!blocked && !node?.is_published}>Visible</option>
            </select><small>{blocked ? 'The parent path must be visible first.' : 'Hiding a branch removes it from category navigation.'}</small></label>
          </div>
        </fieldset>
        <details className="category-media-editor">
          <summary>Storefront media <span className="muted">Optional</span></summary>
          <div>{placements.map(([size,label,ratio]) => {
            const slot = node?.media.find(row => row.size === size);
            const image = inputKey(size,'image');
            const video = inputKey(size,'video');
            return <fieldset key={size} disabled={!!busy}>
              <legend>{label} · {ratio}</legend>
              <label>Image URL<input type="text" inputMode="url" placeholder="https://…" maxLength={1800}
                value={media[image] ?? slot?.image ?? ''} onChange={event => setMedia({ ...media,[image]:event.target.value })}/></label>
              <label>Upload image<input type="file" accept="image/jpeg,image/png,image/webp"
                onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void upload(file,image); }}/>
                <small>{busy === image ? 'Uploading…' : 'JPEG, PNG or WebP, up to 8 MB.'}</small>
              </label>
              <label>Video URL<input type="text" inputMode="url" placeholder="https://…" maxLength={1800}
                value={media[video] ?? slot?.video ?? ''} onChange={event => setMedia({ ...media,[video]:event.target.value })}/></label>
            </fieldset>;
          })}</div>
        </details>
      </div>
      {error && <p role="alert" className="notice warn category-error">{error}</p>}
      <footer className="category-editor-foot">
        <button type="button" className="button secondary" disabled={!!busy} onClick={close}>Cancel</button>
        <button className="button primary" disabled={!!busy}>{busy === 'save' ? 'Saving…' : node ? 'Save changes' : 'Create category'}</button>
      </footer>
    </form>
  </dialog>;
}
