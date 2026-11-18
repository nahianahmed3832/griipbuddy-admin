'use client';

import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import { productionCmsPreview } from '@/lib/production-cms-media';
import type { ContentProduct } from '@/lib/content-products';
import { ContentProductPicker, ProductReferences } from './content-product-picker';
import styles from './production-content.module.css';

type Row = Record<string, unknown>;
type Category = { id: string; name: string; children: Category[] };
type Field = [name: string, label: string, kind?: 'ids' | 'number' | 'toggle' | 'long' | 'optional'];
type Section = { id: string; label: string; fields: Field[]; max?: number };
const products: Field = ['products_id', 'Product references', 'ids'];
const banner: Field[] = [['banner_url','Image URL'], products];
const sections: Section[] = [
  { id:'banners', label:'Desktop banners', fields:banner, max:20 },
  { id:'mobile_banners', label:'Mobile banners', fields:banner, max:20 },
  { id:'featured_products', label:'Featured products', fields:banner, max:20 },
  { id:'hero_section', label:'Hero media', max:3, fields:[
    ['title','Headline'], ['video_url','Video URL'], ['thumbnail_url','Cover image URL','optional'],
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
  if (!section.max) return [object(value)];
  const rows = Array.isArray(value) ? value.map(object) : [];
  return section.fields.some(([name]) => name === 'position')
    ? rows.sort((left, right) => Number(left.position) - Number(right.position)) : rows;
}

const carousel: Section = { id:'hero_section', label:'Homepage carousel', max:5, fields:[
  ['title','Headline'], ['video_url','Video URL (MP4 or WebM)','optional'], ['thumbnail_url','Photo or video cover URL','optional'],
  ['button.enabled','Show button','toggle'], ['button.text','Button label','optional'], ['button.redirect_route','Button path','optional'],
] };

const copies: Record<string, { title: string; description?: string; add?: string }> = {
  banners: { title: 'Desktop Banners', add: 'Add Banner' },
  mobile_banners: { title: 'Mobile Banners', add: 'Add Banner' },
  featured_products: { title: 'Featured Products', add: 'Add New Featured Product' },
  hero_section: { title: 'Hero Section Management', description: 'Manage hero video sliders (max 3 videos) with titles, buttons, and fallback images.', add: 'Add New Video' },
  'homepage.shop_by_category': { title: 'Shop by Category', description: 'Manage top 3 categories displayed on the homepage', add: 'Add New Category' },
  'homepage.best_selling': { title: 'Best Selling Products', description: 'Manage best selling products displayed on homepage (max 20)', add: 'Add Product' },
  'homepage.new_arrivals': { title: 'New Arrivals', description: 'Manage new arrival groups (e.g., Tech, Bags, Fashion) with products', add: 'Add New Group' },
  'homepage.leather_section': { title: 'Leather Section', description: 'Manage the leather products section displayed on homepage' },
};
const banners = ['banners', 'mobile_banners', 'featured_products'];
const positionLabel = ['hero_section', 'homepage.shop_by_category'];

const defaultProductionRows = ['hero_section', 'homepage.shop_by_category', 'homepage.best_selling'];
const formTips: Record<string, string[]> = {
  hero_section: ['Each video must have a unique position (1-3)', 'Videos are displayed in order: Position 1 → 2 → 3',
    'Fallback image is shown while video loads or on devices that do not support autoplay', 'Button can be enabled/disabled per video independently',
    'Redirect route supports internal paths (/products) and external HTTPS URLs'],
  'homepage.shop_by_category': ['Each category must have a unique position (1-3)', 'Categories are displayed in order: Position 1 → 2 → 3',
    'Custom label overrides the category name on display'],
  'homepage.best_selling': ['Add up to 20 best selling products', 'Products are displayed in the order they are added',
    'Each product can only be added once', 'Use the search box to find products quickly'],
  'homepage.new_arrivals': ['Create groups to organize new arrivals', 'Each group must have a unique slug for URL routing',
    'Add products to groups by searching and selecting', 'Groups are displayed in position order on homepage'],
  'homepage.leather_section': ['Toggle the section on/off to show/hide on homepage', 'Add a banner image for visual appeal (optional)',
    'Button link supports internal paths (/products) and external URLs', 'Position determines order relative to other homepage sections'],
};

function initialContentRows(doc: Row, section: Section, production: boolean) {
  const rows = sectionRows(doc, section);
  return production && !rows.length && defaultProductionRows.includes(section.id) ? [{}] : rows;
}

function productionSection(section: Section): Section {
  if (section.id === 'hero_section') return { ...section, fields: [
    ['position','Position (1-3)','number'], ['title','Title'], ['video_url','Video File','optional'], ['thumbnail_url','Fallback Image (Optional)','optional'],
    ['button.enabled','Show Button','toggle'], ['button.text','Button Text','optional'], ['button.redirect_route','Redirect Route','optional'],
  ] };
  if (section.id === 'homepage.shop_by_category' || section.id === 'homepage.new_arrivals') {
    return { ...section, fields: [...section.fields, ['position',positionLabel.includes(section.id) ? 'Position (1-3)' : 'Position','number']] };
  }
  if (section.id === 'homepage.leather_section') return { ...section, fields: [...section.fields, ['position','Section Position','number']] };
  return section;
}

const videos = 'video/mp4,video/webm,video/ogg,video/quicktime';
const images = 'image/png,image/jpeg,image/webp,image/avif';
const bannerImages = images + ',image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico';

async function uploadFile(file: File, video: boolean, production: boolean) {
  let response;
  if (production) {
    const limit = video ? 50 : 5;
    if (file.size > limit * 1024 * 1024) throw new Error(`The file can be up to ${limit} MB.`);
    const body = new FormData();
    body.set('file', file);
    response = await fetch(adminPath('/api/media/upload?kind=' + (video ? 'video' : 'image')), { method: 'POST', body });
  } else {
    response = await fetch(adminPath('/api/carousel-media'), { method: 'POST', headers: { 'X-Griip-Media-Kind': video ? 'video' : 'photo' }, body: file });
  }
  const result = object(await response.json().catch(() => ({})));
  if (!response.ok || typeof result.url !== 'string') {
    throw new Error(typeof result.error === 'string' ? result.error : 'Upload unavailable. Use a direct media URL.');
  }
  return result.url;
}

function SelectedMedia({ file, video }: { file: File; video: boolean }) {
  const [source, setSource] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <>
    <small>{file.name}</small>
    {source && (video ? <video className="cms-preview" controls preload="metadata" src={source} aria-label={file.name}/>
      // eslint-disable-next-line @next/next/no-img-element
      : <img className="cms-preview" src={source} alt=""/>)}
  </>;
}

function ContentSelect({ label, value, change, options, placeholder }: {
  label: string; value: string; change: (value: string) => void; options: { id: string; name: string }[]; placeholder?: string;
}) {
  return <Select.Root value={value} onValueChange={change}>
    <Select.Trigger className={styles.productTrigger} aria-label={label}><Select.Value placeholder={placeholder}/>
      <Select.Icon><ChevronDown size={16}/></Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Content className={styles.productPopover} position="popper" align="start" sideOffset={4}>
      <Select.Viewport>{options.map(option => <Select.Item key={option.id} value={option.id} className={styles.selectItem}>
        <Select.ItemText>{option.name}</Select.ItemText><Select.ItemIndicator><Check size={14}/></Select.ItemIndicator>
      </Select.Item>)}</Select.Viewport>
    </Select.Content></Select.Portal>
  </Select.Root>;
}

export function ContentEditor({ doc, writable, initialSection, allowProductSearch, allowUploads, categories, carouselEnabled, production = false, productOptions = [] }: { doc: Row; writable: boolean; initialSection?: string; allowProductSearch: boolean; allowUploads: boolean; categories: Category[]; carouselEnabled: boolean; production?: boolean; productOptions?: ContentProduct[] }) {
  const availableSections = production ? sections.map(productionSection)
    : carouselEnabled ? sections.map(item => item.id === carousel.id ? carousel : item) : sections;
  const initial = availableSections.find(item => item.id === initialSection) ?? availableSections[0];
  const [section, setSection] = useState(initial);
  const isCarousel = carouselEnabled && section.id === carousel.id;
  const productionHero = production && section.id === 'hero_section';
  const productionCategories = production && section.id === 'homepage.shop_by_category';
  const copy = production ? copies[section.id] : undefined;
  const positionInput = section.fields.some(([name]) => name === 'position');
  const formId = useId();
  const [rows, setRows] = useState(() => initialContentRows(doc, initial, production));
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
    setRows(initialContentRows(doc, next, production));
    setDirty(false);
    setFeedback('');
  }

  function update(next: Row[]) {
    setRows(next);
    setDirty(true);
  }

  async function upload(index: number, field: string, file?: File) {
    if (!file || busy || uploading || !writable || !allowUploads) return;
    const video = field === 'video_url';
    if (productionHero) {
      if (!(video ? videos : images).split(',').includes(file.type) || file.size > (video ? 50 : 5) * 1024 * 1024) {
        setError(true); setFeedback(video ? 'Choose an MP4, WebM, OGG or QuickTime video up to 50 MB.' : 'Choose a supported image up to 5 MB.');
        return;
      }
      update(rows.map((row, position) => position === index ? { ...row, files: { ...object(row.files), [field]: file } } : row));
      setFeedback('');
      return;
    }
    setUploading(true);
    setFeedback('');
    try {
      const uploaded = await uploadFile(file, video, production);
      update(rows.map((row, position) => position === index ? set(row, field, uploaded) : row));
      setError(false);
      setFeedback('File uploaded. Save changes to publish it.');
    } catch (error) {
      setError(true);
      setFeedback(error instanceof Error ? error.message : 'Upload failed. Try again.');
    } finally { setUploading(false); }
  }

  async function persist(next: Row[]) {
    const positioned = section.id === 'hero_section' || section.id.startsWith('homepage.');
    const records: Row[] = [];
    for (const [index, row] of next.entries()) {
      let result: Row = { ...(section.max && row._id ? { _id: row._id } : {}), ...(positioned ? { position: index + 1 } : {}) };
      for (const [name, , kind] of section.fields) {
        const file = object(row.files)[name];
        const value = file instanceof File
          ? await uploadFile(file, name === 'video_url', production)
          : get(row, name) ?? (name === 'position' ? index + 1 : undefined);
        if (kind === 'optional' && !value) continue;
        const input = kind === 'ids' ? (Array.isArray(value) ? value : String(value ?? '').split(/[\s,]+/).filter(Boolean))
          : kind === 'toggle' ? value === true : kind === 'number' ? Number(value) : String(value ?? '').trim();
        result = set(result, name, input);
      }
      records.push(result);
    }
    const response = await fetch(adminPath('/api/workspace'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'content', values: { section: section.id, id: doc._id ?? null,
        revision: doc.updatedAt ?? null, value: section.max ? records : records[0] } }),
    });
    if (!response.ok) throw new Error((await response.text()).slice(0, 300));
  }

  async function saveRows(next: Row[]) {
    if (submitting.current || uploading || !writable) return;
    if ((isCarousel || productionHero) && next.some(row => !row.video_url && !row.thumbnail_url && !Object.keys(object(row.files)).length)) {
      setError(true);
      setFeedback('Add a photo or a video to every slide.');
      return;
    }
    if (productionCategories && next.some(row => !row.category_id)) {
      setError(true); setFeedback('Select a category for every position.'); return;
    }
    if (productionHero && (new Set(next.map((row, index) => Number(row.position ?? index + 1))).size !== next.length ||
        next.some((row, index) => Number(row.position ?? index + 1) > 3))) {
      setError(true); setFeedback('Each video must have a unique position (1–3).');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setFeedback('');
    try {
      await persist(next);
      setError(false);
      setFeedback('Content saved.');
      setDirty(false);
      router.refresh();
    } catch (error) {
      setError(true);
      setFeedback(error instanceof Error ? error.message : 'The connection was interrupted. Reload before retrying.');
    } finally { submitting.current = false; setBusy(false); }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveRows(rows);
  }

  function remove(index: number) {
    const id = rows[index]._id;
    if (!productionHero || !id) {
      update(rows.filter((_, position) => position !== index));
    } else if (window.confirm(dirty ? 'Delete this video and discard other unsaved changes?' : 'Delete this video?')) {
      void saveRows(sectionRows(doc, section).filter(row => row._id !== id));
    }
  }

  const bannerTabs = production && initialSection === 'banners';
  const sectionTabs = bannerTabs ? availableSections.filter(item => banners.includes(item.id)) : availableSections;
  const actionsInHeader = production && !bannerTabs && Boolean(copy);
  const saveLabel = section.id === 'hero_section' ? 'Save All Changes' : section.id === 'homepage.new_arrivals' ? 'Save All Groups' : 'Save Changes';
  return <section className={production ? styles.page : 'panel padded'}>
    {copy && <header className={styles.heading}><div><h1>{bannerTabs ? 'Banner Update' : copy.title}</h1>{copy.description && <p>{copy.description}</p>}</div>
      {actionsInHeader && <div className="page-actions">
        <button type="button" className="button secondary" disabled={busy || uploading} onClick={() => {
          if (!dirty || window.confirm('Discard unsaved content changes?')) {
            setRows(initialContentRows(doc, section, production)); setDirty(false); setFeedback(''); router.refresh();
          }
        }}>Refresh</button>
        {writable && <button type="submit" className="button primary" form={formId} disabled={!dirty || busy || uploading}>
          {busy ? 'Saving…' : saveLabel}
        </button>}
      </div>}
    </header>}
    {(!initialSection || bannerTabs) && <div className={bannerTabs ? styles.tabs : 'tabs'} aria-label="Content sections">{sectionTabs.map(item =>
      <button className={'button ' + (section.id === item.id ? 'primary' : 'subtle')} key={item.id} type="button"
        aria-pressed={section.id === item.id} disabled={busy || uploading} onClick={() => switchSection(item)}>{bannerTabs && item.id === 'featured_products' ? 'Featured Banners' : production ? copies[item.id]?.title ?? item.label : item.label}</button>)}</div>}
    <form id={formId} className={production ? `${styles.form} stack-form${(productionHero || productionCategories) ? ' ' + styles.heroGrid : ''}` : 'stack-form'} onSubmit={save}>
      {(!copy || bannerTabs || section.id === 'homepage.leather_section') && <h2>{section.id === 'homepage.leather_section' && production ? 'Section Settings' : copy?.title ?? section.label}</h2>}
      {isCarousel && <p>Add up to five slides. {allowUploads && 'Upload a photo (JPG, PNG, WebP or AVIF, up to 6 MB) or video (MP4 or WebM, up to 24 MB), or '}use a direct media URL. A video may have a cover photo.</p>}
      {section.id === 'seo' && <p>Use / for the homepage or a storefront route such as /bd/products. The storefront keeps its canonical URL and indexing policy.</p>}
      {!rows.length && !production && <p>No entries yet.</p>}
      {rows.map((row, index) => <fieldset className="editor-fieldset" key={index} disabled={!writable || busy || uploading}>
        {production ? section.max && <h2>{section.id === 'hero_section' ? 'Video ' : section.id === 'homepage.shop_by_category' ? 'Category '
          : section.id === 'homepage.best_selling' ? '#' : section.id === 'homepage.new_arrivals' ? 'Group ' : 'Banner '}{index + 1}</h2>
          : <legend>{isCarousel ? 'Slide' : 'Entry'} {index + 1}</legend>}
        <div className="editor-grid">{section.fields.map(([name, label, kind]) => {
          const pickedFile = object(row.files)[name];
          const value = get(row, name) ?? (name === 'position' ? index + 1 : undefined);
          const change = (input: unknown) => update(rows.map((item, position) => position === index ? set(item, name, input) : item));
          const text = Array.isArray(value) ? value.join('\n') : String(value ?? '');
          const media = /(?:image|thumbnail|banner|video)_url$/.test(name);
          const isProduct = /^(?:products_id|product_ids|product_id)$/.test(name);
          const preview = production && media ? productionCmsPreview(text) : text;
          let safePreview = preview.startsWith('/') && !preview.startsWith('//') && !/[\\\s]/.test(preview);
          try {
            const source = new URL(preview);
            safePreview ||= source.protocol === 'https:' && !source.username && !source.password;
          } catch { /* Address may still be a local asset. */ }
          if (production && section.id === 'homepage.shop_by_category' && ['subcategory_id','icon_image_url'].includes(name)) return null;
          if (production && section.id === 'hero_section' && ['button.text','button.redirect_route'].includes(name) && get(row, 'button.enabled') !== true) return null;
          if (production && isProduct && allowProductSearch) return <div className="cms-field" key={name}>
            <span>{section.id === 'homepage.best_selling' ? 'Product *' : 'Products'}</span>
            {writable ? <ContentProductPicker production multiple={kind === 'ids'} value={text} update={change} products={productOptions}/> :
              <ProductReferences ids={text.split(/[\s,]+/).filter(Boolean)} products={productOptions}/>}
          </div>;
          const taxonomy = name === 'category_id' ? categories : name === 'subcategory_id'
            ? categories.find(category => category.id === row.category_id)?.children : undefined;
          return <div className="cms-field" key={name}><label>{production && !bannerTabs && name === 'category_id' ? 'Category *'
            : production && section.id === 'homepage.shop_by_category' && name === 'label' ? 'Custom Label (Optional)' : label}
            {production && kind === 'toggle' ? <input type="checkbox" role="switch" checked={value === true} onChange={event => change(event.target.checked)}/>
             : production && positionInput && name === 'position' && positionLabel.includes(section.id) ? <ContentSelect label={label} value={text}
              change={change} options={[1, 2, 3].map(position => ({ id: String(position), name: 'Position ' + position }))}/>
             : productionCategories && name === 'category_id' && categories.length > 0 ? <ContentSelect label="Category" value={text}
              change={id => update(rows.map((item, position) => position === index ? { ...item, category_id: id, subcategory_id: '' } : item))}
              options={text && !categories.some(option => option.id === text) ? [...categories, { id: text, name: 'Saved category reference' }] : categories}
              placeholder="Select category"/>
             : production && media && allowUploads && (section.id === 'hero_section' || section.id === 'homepage.leather_section') ? null
             : taxonomy && taxonomy.length > 0 ? <select value={text} required={kind !== 'optional'}
              onChange={event => name === 'category_id' ? update(rows.map((item, position) => position === index
                ? { ...item, category_id: event.target.value, subcategory_id: '' } : item)) : change(event.target.value)}>
              <option value="">{kind === 'optional' ? 'None' : 'Choose a category'}</option>
              {text && !taxonomy.some(option => option.id === text) && <option value={text}>Saved category reference</option>}
              {taxonomy.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select> : kind === 'toggle' ? <select value={String(value === true)} onChange={event => change(event.target.value === 'true')}>
              <option value="true">Yes</option><option value="false">No</option>
            </select> : kind === 'ids' || kind === 'long' ? <textarea rows={3} value={text} maxLength={kind === 'long' ? 170 : 1500}
              onChange={event => change(event.target.value)} required={kind === 'long'}/>
              : <input value={text} type={kind === 'number' ? 'number' : 'text'} required={kind !== 'optional'}
                min={kind === 'number' ? 1 : undefined} max={kind === 'number' ? (positionLabel.includes(section.id) ? 3 : 100) : undefined}
                placeholder={productionCategories && name === 'label' ? 'Custom label override' : undefined}
                maxLength={isCarousel && name === 'title' ? 120 : production && name === 'label' ? 50 : production && section.id === 'hero_section' && name === 'title' ? 200 : 1000} onChange={event => change(event.target.value)}/>}
          </label>
          {production && (name === 'label' && section.id === 'homepage.shop_by_category' || name === 'title' && section.id === 'hero_section') &&
            <small>{text.length}/{name === 'label' ? 50 : 200} characters</small>}
          {isProduct && writable && allowProductSearch && <ContentProductPicker multiple={kind === 'ids'} value={text} update={change}/>}
          {media && pickedFile instanceof File && <SelectedMedia file={pickedFile} video={name === 'video_url'}/>}
          {media && !(pickedFile instanceof File) && safePreview && (name === 'video_url'
            ? <video className="cms-preview" controls preload="metadata" src={preview} aria-label={label}/>
            // eslint-disable-next-line @next/next/no-img-element
            : <img className="cms-preview" src={preview} alt="" loading="lazy" referrerPolicy="no-referrer"/>)}
          {media && writable && allowUploads && <label className={production ? styles.upload : undefined}>{production ? (name === 'video_url' ? 'Click to upload video' : 'Click to upload') : 'Upload ' + label.toLowerCase()}<input type="file"
            accept={name === 'video_url' ? (productionHero ? videos : 'video/mp4,video/webm')
              : section.id === 'homepage.leather_section' && production ? bannerImages : images}
            onChange={event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              void upload(index, name, file);
            }}/></label>}
          </div>;
        })}</div>
        {section.max && writable && <div className="page-actions">
          {!positionInput && index > 0 && <button className="button subtle" type="button" onClick={() => {
            const next = [...rows];
            [next[index - 1], next[index]] = [next[index], next[index - 1]];
            update(next);
          }}>Move up</button>}
          {!positionInput && index + 1 < rows.length && <button className="button subtle" type="button" onClick={() => {
            const next = [...rows];
            [next[index + 1], next[index]] = [next[index], next[index + 1]];
            update(next);
          }}>Move down</button>}
          <button className="button subtle" type="button" onClick={() => remove(index)}>{productionHero ? 'Delete Video' : isCarousel ? 'Remove slide' : 'Remove entry'}</button>
        </div>}
      </fieldset>)}
      {writable && <div className="page-actions">
        {section.max && <button className="button secondary" type="button" disabled={busy || uploading || rows.length >= section.max}
          onClick={() => update([...rows, {}])}>{copy?.add ?? (isCarousel ? 'Add slide' : 'Add entry')}</button>}
        {dirty && <button className="button subtle" type="button" disabled={busy || uploading} onClick={() => {
          setRows(initialContentRows(doc, section, production));
          setDirty(false);
          setFeedback('');
        }}>Reset form</button>}
        {!actionsInHeader && <button className="button primary" disabled={!dirty || busy || uploading}>{busy ? 'Saving…' : production ? saveLabel : 'Save content'}</button>}
      </div>}
      {uploading && <p role="status">Uploading media…</p>}
      {feedback && <p className={error ? 'notice warn' : 'notice'} role={error ? 'alert' : 'status'}>{feedback}</p>}
    </form>
    {production && section.max && defaultProductionRows.includes(section.id) && rows.length < section.max && <p>{section.max - rows.length} more slot(s) available</p>}
    {production && formTips[section.id] && <aside className={styles.tips}><h2>Tips</h2><ul>{formTips[section.id].map(tip => <li key={tip}>{tip}</li>)}</ul></aside>}
  </section>;
}
