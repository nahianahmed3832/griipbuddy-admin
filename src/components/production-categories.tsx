'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, CornerDownRight, ImageIcon, Plus, Video } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { categoryKey, categoryName, categorySlug, childrenFor, placements, type CategoryNode } from '@/lib/category-tree';
import { adminPath } from '@/lib/paths';
import { productionCmsPreview } from '@/lib/production-cms-media';
import { ProductionCatalogActions } from './production-catalog-actions';
import styles from './production-catalog.module.css';
import design from './production-catalog-details.module.css';

const rootList = '/dashboard/categories';
const childList = '/dashboard/sub-categories';
const endpoint = '/api/categories';
const placementLabels = ['Square', 'Horizontal', 'Vertical'];

export function ProductionCategories({ nodes, subcategory, canCreate, canEdit, canDelete }: {
  nodes: CategoryNode[]; subcategory: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
}) {
  const router = useRouter();
  const pending = useRef(false);
  const [error, setError] = useState('');
  const branches = childrenFor(nodes);
  const roots = branches.get('') ?? [];
  const names = new Map(nodes.map(row => [row.id, categoryName(row)]));
  const depthRows = (siblings: CategoryNode[], prefix = ''): { row: CategoryNode; index: string }[] =>
    siblings.flatMap((row, slot) => {
      const index = prefix + String(slot + 1);
      return [{ row, index }, ...depthRows(branches.get(categoryKey(row)) ?? [], index + '.')];
    });
  const rows = subcategory ? depthRows(nodes.filter(row => row.depth === 1))
    : roots.map(row => ({ row, index: '' }));
  const visited = new Set(rows.map(({ row }) => row.id));
  if (subcategory) nodes.filter(row => row.depth > 1 && !visited.has(row.id))
    .forEach(row => rows.push({ row, index: String(rows.length + 1) }));
  const createUrl = subcategory ? '/dashboard/add-new-sub-category' : '/dashboard/add-new-category';
  const editUrl = subcategory ? '/dashboard/update-sub-category/' : '/dashboard/update-category/';
  const columns = subcategory ? ['Index','Image','Name (EN)','Name (BN)','Description (EN)','Description (BN)','Category','Actions']
    : ['Position','Image','Name','Slug','Sub Categories','Status','Actions'];

  async function change(row: CategoryNode, action: 'delete' | 'publish') {
    if (pending.current || action === 'delete' && !window.confirm('Delete ' + categoryName(row) + '?')) return;
    pending.current = true;
    setError('');
    try {
      const result = action === 'delete'
        ? await fetch(adminPath(endpoint) + '?' + new URLSearchParams({ id: row.id, depth: String(row.depth) }), { method: 'DELETE' })
        : await saveCategory({ id: row.id, depth: row.depth, revision: row.revision, is_published: !row.is_published }, true);
      if (result instanceof Response && !result.ok) throw new Error((await result.json()).error);
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to update the category.'); }
    finally { pending.current = false; }
  }

  return <section className={styles.page}>
    <header className={styles.header}>
      <h1>{subcategory ? 'All Sub Categories' : 'All Main Categories'}</h1>
      {canCreate && <Link className={styles.primary} href={createUrl}>{subcategory ? 'Add new Sub Category' : 'Add new Category'}</Link>}
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.tableBorder + ' ' + design.scroll}>
      <table className={styles.table}>
        <thead><tr>{columns.map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
        <tbody>{rows.map(({ row, index }) => {
          const picture = row.media.find(item => item.size === 'SQUARE')?.image ?? row.media[0]?.image;
          const parentName = names.get(row.ancestors[row.depth - 1] ?? '');
          return <tr key={categoryKey(row)} className={design.categoryRow} data-depth={row.depth}>
            <td>{subcategory ? index : row.position}</td><td><CategoryImage image={picture}/></td>
            {subcategory ? <><td><div className={design.branchName}>{row.depth > 1 && <CornerDownRight size={16}/>} {row.name_en}</div></td>
              <td lang="bn">{row.name_bn}</td>
              <td className={design.description}>{row.description_en}</td><td className={design.description} lang="bn">{row.description_bn}</td>
              <td><small className={design.root}>{['', 'Root Category', 'Parent Sub', 'Parent Sub-Sub'][row.depth]}</small>
                {parentName && <span className={design.parentBadge}>{parentName}</span>}</td></>
              : <><td>{row.name_en}</td><td>{row.slug}</td><td>{(branches.get(categoryKey(row)) ?? []).length}</td>
                <td><label className={design.liveSwitch}>
                  <input type="checkbox" role="switch" aria-label={'Publish ' + categoryName(row)} checked={row.is_published}
                    disabled={!canEdit} onChange={() => void change(row, 'publish')}/>{row.is_published ? 'ACTIVE' : 'INACTIVE'}
                </label></td></>}
            <td>{(canEdit || canDelete) && <ProductionCatalogActions label={'Actions for ' + categoryName(row)}>
              {close => <>
                {canEdit && <Link onClick={close} href={editUrl + encodeURIComponent(row.id)}>Edit</Link>}
                {canDelete && <button type="button" onClick={() => { close(); void change(row, 'delete'); }}>Delete</button>}
              </>}
            </ProductionCatalogActions>}</td>
          </tr>;
        })}{!rows.length && <tr><td className={styles.empty} colSpan={columns.length}>No categories found.</td></tr>}</tbody>
      </table>
    </div>
  </section>;
}

async function saveCategory(body: object, editing: boolean) {
  const response = await fetch(adminPath(endpoint), {
    method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.node) throw new Error(result.error || 'The category could not be saved.');
  return result.node;
}

function CategoryImage({ image }: { image?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return image ? <img className={design.thumbnail} src={productionCmsPreview(image)} alt=""/> : <span className={design.placeholder}><ImageIcon size={16}/></span>;
}

export function ProductionCategoryEditor({ node, nodes, subcategory, gateway }: {
  node?: CategoryNode; nodes: CategoryNode[]; subcategory: boolean; gateway: boolean;
}) {
  const router = useRouter();
  const branches = childrenFor(nodes);
  const [path, setPath] = useState<string[]>(() => (node?.ancestors ?? []).map(value => value ?? ''));
  const [media, setMedia] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState('');
  const lock = useRef(false);
  const [error, setError] = useState('');
  const editing = Boolean(node);
  const back = subcategory ? childList : rootList;
  const label = subcategory ? (editing ? 'Update Sub Category' : 'Add New Sub Category') : (editing ? 'Update Category' : 'Create Category');
  const names = subcategory ? ['Sub Category Name (En)', 'Sub Category Name (Bn)', 'Sub Category Description (En)', 'Sub Category Description (Bn)']
    : editing ? ['Name (EN)','Name (BN)','Description (EN)','Description (BN)']
      : ['Name (English)','Name (Bangla)','Description (English)','Description (Bangla)'];
  const placeholders = subcategory ? ['Enter sub category name (en)','Enter sub category name (bn)','Enter sub category description (en)','Enter sub category description (bn)']
    : editing ? [] : ['Enter category name in English','বাংলায় ক্যাটাগরির নাম লিখুন','Short description in English','সংক্ষিপ্ত বর্ণনা বাংলায় লিখুন'];

  async function upload(file: File, kind: 'image' | 'video', key: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(key);
    setError('');
    try {
      if (file.size > (kind === 'video' ? 50 : 5) * 1024 * 1024) throw new Error('The file exceeds the upload limit.');
      const data = new FormData();
      data.append('file', file);
      const response = await fetch(adminPath(gateway ? '/api/media/upload?scope=category&kind=' + kind : endpoint + '?upload=1'), {
        method: 'POST', body: gateway ? data : file,
      });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || 'The asset could not be uploaded.');
      setMedia(previous => ({ ...previous, [key]: result.url }));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to upload the asset.'); }
    finally { lock.current = false; setBusy(''); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const name = String(values.name_en ?? '').trim();
    const bangla = String(values.name_bn ?? '').trim();
    const changes = placements.flatMap(([size]) => {
      const image = media[size + '-image'];
      const video = media[size + '-video'];
      return image === undefined && video === undefined ? [] : [{ size, image, video }];
    });
    const position = subcategory ? undefined : Number(values.position);
    const depth = node?.depth ?? (subcategory ? path.filter(Boolean).length : 0);
    const parent = path[depth - 1];
    const rootChanged = node?.depth === 1 && parent && parent !== node.ancestors[0];
    if (!node && (!categorySlug(name) || subcategory && !parent)) {
      setError('Enter the category name and select its parent.');
      return;
    }
    lock.current = true;
    setBusy('save');
    setError('');
    try {
      await saveCategory({
        depth, name_en: name, ...(bangla && { name_bn: bangla }), description_en: String(values.description_en ?? ''),
        description_bn: String(values.description_bn ?? ''), position, media: changes,
        ...(node ? { id: node.id, revision: node.revision, ...(rootChanged && { parent }) } : { slug: categorySlug(name), parent, is_published: true }),
      }, editing);
      router.push(back);
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save the category.'); }
    finally { lock.current = false; setBusy(''); }
  }

  return <section className={styles.page}>
    <header className={design.heading}>
      <Link href={back} className={styles.outline} aria-label="Back"><ChevronLeft size={16}/></Link>
      <h1>{!editing && !subcategory ? 'Add New Category' : label}</h1>
    </header>
    <form className={design.categoryForm} onSubmit={save}>
      <fieldset disabled={Boolean(busy)} className={design.categoryFields}>
        {(['name_en','name_bn','description_en','description_bn'] as const).map((field, index) =>
          <label className={styles.field} key={field}>{names[index]}<input name={field} defaultValue={node?.[field]}
            placeholder={placeholders[index]} required={index === 0 || index === 1 && (!editing || Boolean(node?.name_bn))}
            maxLength={index < 2 ? 160 : 2000} lang={index % 2 ? 'bn' : undefined}/></label>)}
        {!subcategory && <label className={styles.field} style={{ maxWidth: 128 }}>Position
          <input type="number" name="position" min={0} max={100000} defaultValue={node?.position ?? 1} required/></label>}
        {subcategory && ['Category', 'Sub Category (Optional)', 'Sub Sub Category (Optional)'].slice(0, editing ? 1 : 3).map((label, level) => {
          const options = branches.get(level === 0 ? '' : (level - 1) + ':' + path[level - 1]) ?? [];
          return <label className={styles.field} key={label}>{label}<select className={styles.select} value={path[level] ?? ''}
            disabled={Boolean(node && node.depth !== 1) || (level > 0 && !path[level - 1])} required={level === 0} aria-label={label}
            onChange={event => setPath([...path.slice(0, level), event.target.value])}>
            <option value="">{level === 0 ? 'Select a category' : 'None'}</option>
            {options.map(item => <option key={item.id} value={item.id}>{categoryName(item)}</option>)}
          </select></label>;
        })}
      </fieldset>
      <div className={design.placements}>{placements.map(([size, , ratio], index) => {
        const slot = node?.media.find(item => item.size === size);
        const imageKey = size + '-image', videoKey = size + '-video';
        const image = media[imageKey] === undefined ? slot?.image : media[imageKey];
        const video = media[videoKey] === undefined ? slot?.video : media[videoKey];
        return <fieldset key={size} disabled={Boolean(busy)} className={design.placement}>
          <h2><ImageIcon size={16}/>{placementLabels[index]} ({ratio})</h2>
          <label className={styles.field}>{editing ? 'IMAGE ASSET' : 'Image'}
            <span className={design.fileBox}>{image ? <CategoryImage image={image}/> : <Plus size={18}/>}
              <span>{busy === imageKey ? 'Uploading…' : image ? 'Replace image' : 'Click to upload'}
                <small>Supported: .webp (preferred), .png, .jpg, .jpeg, .svg, .ico (max: 5MB)</small></span></span>
            <input className={design.hiddenFile} type="file" accept={gateway ? '.webp,.png,.jpg,.jpeg,.svg,.ico' : '.webp,.png,.jpg,.jpeg'}
              aria-label={placementLabels[index] + ' image'} onChange={event => {
                const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
                if (file) void upload(file, 'image', imageKey);
              }}/></label>
          {image && <button className={styles.outline} type="button" onClick={() => setMedia({ ...media, [imageKey]: null })}>Remove image</button>}
          <label className={styles.field}><span><Video size={13}/> {editing ? 'VIDEO CONTENT' : 'Optional Video'}</span>
            <input type="file" accept="video/mp4,video/quicktime,video/webm" aria-label={placementLabels[index] + ' video'} disabled={!gateway}
              onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void upload(file, 'video', videoKey); }}/></label>
          {video && <div className={design.assetActions}>
            <a className={styles.outline} href={productionCmsPreview(video)} target="_blank" rel="noreferrer">View video</a>
            <button className={styles.outline} type="button" onClick={() => setMedia({ ...media, [videoKey]: null })}>Remove video</button>
          </div>}
        </fieldset>;
      })}</div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={design.submit}>{editing && !subcategory && <Link href={back} className={styles.outline}>Cancel</Link>}
        <button className={styles.primary} disabled={Boolean(busy)}>{busy === 'save' ? 'Saving…' : label}</button></div>
    </form>
  </section>;
}
