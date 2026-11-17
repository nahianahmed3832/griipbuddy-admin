'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { adminPath } from '@/lib/paths';
import { currencies, productFields, type Choice } from '@/lib/catalog-edit-fields';
import type { CategoryOption } from '@/lib/catalog-list';
import type { Region } from '@/lib/sections';
import { CatalogConfirm, CatalogFields, saveCatalog } from './catalog-edit-form';
import { ProductDescriptionEditor, ProductEditorPanel, ProductEditorSwitch, ProductSpecsEditor } from './production-product-editor-fields';
import productionStyles from './production-product-editor.module.css';

const taxonomy = ['category', 'subcategory', 'sub_subcategory', 'third_subcategory'];
const taxonomyLabels = ['Category', 'Subcategory', 'Second subcategory', 'Third subcategory'];
const productionTaxonomy = ['Category', 'Sub Category', 'Sub Sub Category (optional)', 'Third Sub Category (optional)'];
const productionTaxonomyPlaceholders = ['Select a category', 'Select a sub category', 'Select a sub-sub category', 'Select a third-sub category'];
const pricing = [['regular_price', 'Regular'], ['sale_price', 'Sale'], ['buying_price', 'Buying']] as const;
type Prices = Record<string, string>;
export type VariantDraft = {
  key: string; _id?: string; sku: string; attribute_values: Record<string, string>; base: Prices;
  prices: Record<string, Prices>; image: string; images: string; videos: string; color_code: string;
  color_image?: string; image_based_on?: string;
};
function blankVariant(key: string): VariantDraft {
  return { key, sku: '', attribute_values: {}, base: { regular_price: '', sale_price: '0' }, prices: {}, image: '', images: '', videos: '', color_code: '' };
}
function CategorySelects({ tree, selected, production }: { tree: CategoryOption[]; selected: string[]; production?: boolean }) {
  const [path, setPath] = useState(selected);
  const uid = useId();
  let options = tree;
  return taxonomy.map((name, depth) => {
    const level = options;
    const value = path[depth] ?? '';
    options = level.find(item => item.id === value)?.children ?? [];
    return <div className={production ? productionStyles.field : 'operation-field'} key={name}><label htmlFor={uid + '-' + name}>{(production ? productionTaxonomy : taxonomyLabels)[depth]}</label>
      <select id={uid + '-' + name} name={name} value={value} required={depth <= 1} disabled={depth > 1 && !level.length && !value}
        onChange={event => setPath(path.slice(0, depth).concat(event.target.value))}>
        <option value="">{production ? productionTaxonomyPlaceholders[depth] : depth ? 'None' : 'Choose a category'}</option>
        {!!value && !level.some(o => o.id === value) && <option value={value}>Current selection</option>}
        {level.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select></div>;
  });
}
function SelectRef({ values, current, name, label }: { values: Choice[]; current?: string; name: string; label: string }) {
  return <label className="operation-field">{label}<select name={name} defaultValue={current ?? ''}>
    <option value="">None</option>
    {current && !values.some(choice => choice.value === current) && <option value={current}>Current selection</option>}
    {values.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
  </select></label>;
}
function uploadImage(file: File) {
  return fetch(adminPath('/api/catalog-edit?upload=1'), { method: 'POST', headers: { 'Content-Type': file.type }, body: file })
    .then(async response => {
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.url !== 'string') throw new Error(result?.error || 'Could not upload the image.');
      return result.url as string;
    });
}
function ImageUpload({ initial, gallery }: { initial: string; gallery: string }) {
  const [thumbnail, setThumbnail] = useState(initial);
  const [images, setImages] = useState(gallery);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  async function add(file: File | undefined, target: 'thumbnail' | 'gallery') {
    if (!file || busy) return;
    setBusy(target); setError('');
    try {
      const address = await uploadImage(file);
      if (target === 'thumbnail') setThumbnail(address);
      else setImages(previous => previous ? previous.trimEnd() + '\n' + address : address);
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Could not upload the image.'); }
    finally { setBusy(''); }
  }
  return <fieldset className="catalog-editor-group"><legend>Product images</legend>
    <label className="operation-field">Thumbnail URL<input name="thumbnail" type="url" value={thumbnail} onChange={event => setThumbnail(event.target.value)}/></label>
    <label className="operation-field">Upload thumbnail<input aria-label="Upload thumbnail" type="file" accept="image/jpeg,image/png,image/webp" disabled={!!busy} onChange={event => void add(event.target.files?.[0], 'thumbnail')}/></label>
    <label className="operation-field">Gallery image URLs<textarea name="slider_images" rows={3} value={images} onChange={event => setImages(event.target.value)}/></label>
    <label className="operation-field">Upload gallery image<input aria-label="Upload gallery image" type="file" accept="image/jpeg,image/png,image/webp" disabled={!!busy} onChange={event => void add(event.target.files?.[0], 'gallery')}/></label>
    {error && <p role="alert" className="notice warn">{error}</p>}{busy && <p role="status">Uploading image…</p>}
  </fieldset>;
}
function list(value: string) { return value.split(/[\r\n]+/).map(value => value.trim()).filter(Boolean); }
function inputPrices(values: Prices) { return Object.fromEntries(Object.entries(values).filter(([,value]) => value !== '').map(([field, value]) => [field, Number(value)])); }
function variantPayload(variants: VariantDraft[]) {
  return variants.map(({ _id, sku, attribute_values, image, color_code, color_image, image_based_on, base, prices, images, videos }) => ({
    _id, sku, attribute_values, image, color_code, color_image, image_based_on,
    ...inputPrices(base), prices: Object.fromEntries(Object.entries(prices).map(([currency, price]) => [currency, inputPrices(price)])),
    images: list(images), videos: list(videos),
  }));
}
function VariantMatrix({ attributesText, setAttributes, variants, setVariants, allowCost, canDelete, id, production, uploading, setUploading, sliderImages }: {
  attributesText: string; setAttributes: (value: string) => void; variants: VariantDraft[]; setVariants: Dispatch<SetStateAction<VariantDraft[]>>;
  allowCost: boolean; canDelete: boolean; id?: string; production: boolean; uploading: boolean; setUploading: (value: boolean) => void;
  sliderImages: string[];
}) {
  const attributes = [...new Set(list(attributesText))];
  const [matrix, setMatrix] = useState<Record<string, string>>({});
  const [matrixError, setMatrixError] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [imageAttribute, setImageAttribute] = useState<string>();
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const counter = useRef(0);
  const newKey = () => 'new-' + ++counter.current;
  const savedImageAttribute = imageAttribute ?? variants.find(row => row.image_based_on)?.image_based_on;
  const imageSource = attributes.find(attribute => attribute === savedImageAttribute) ?? '';
  const imageValues = imageSource ? [...new Set(variants.map(row => row.attribute_values[imageSource]?.trim()).filter(Boolean))] : [];
  function updateGroupImages(attribute: string, value: string, update: (images: string[]) => string[]) {
    setVariants(current => current.map(row => row.attribute_values[attribute]?.trim() === value
      ? { ...row, images: update(list(row.images)).join('\n'), image_based_on: attribute } : row));
  }
  async function uploadGroupImage(file: File, attribute: string, value: string) {
    setMediaError('');
    if (file.size > 3 * 1024 * 1024) {
      setMediaError('Image size must be less than 3 MB.');
      return;
    }
    setUploading(true);
    try {
      const address = await uploadImage(file);
      updateGroupImages(attribute, value, images => [...new Set([...images, address])]);
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : 'Could not upload the image.');
    } finally {
      setUploading(false);
    }
  }
  function change(key: string, patch: Partial<VariantDraft>) {
    setVariants(current => current.map(row => row.key === key ? { ...row, ...patch } : row));
  }
  function showKeys(keys: string[]) { setOpened(current => new Set([...current, ...keys])); }
  function generate() {
    let combinations: Record<string,string>[] = [{}];
    for (const name of attributes) {
      const choices = [...new Set((matrix[name] ?? '').split(',').map(item => item.trim()).filter(Boolean))];
      if (!choices.length) { setMatrixError('Enter at least one choice for every attribute.'); return; }
      if (choices.length * combinations.length > 120) { setMatrixError('The matrix can contain at most 120 variants.'); return; }
      combinations = combinations.flatMap(row => choices.map(choice => ({ ...row, [name]: choice })));
    }
    const additional = combinations.filter(row => !variants.some(variant => attributes.every(name => variant.attribute_values[name] === row[name])))
      .map(attribute_values => ({ ...blankVariant(newKey()), attribute_values }));
    if (variants.length + additional.length > 120) { setMatrixError('The matrix can contain at most 120 variants.'); return; }
    setMatrixError(''); setVariants([...variants, ...additional]); showKeys(additional.slice(0, 1).map(row => row.key));
  }
  const priceInput = (label: string, value: string, update: (value: string) => void, required = false) =>
    <label className="operation-field" key={label}>{label}<input type="number" min="0" step=".01" value={value} onChange={event => update(event.target.value)} required={required}/></label>;
  return <fieldset className="catalog-editor-group"><legend>Variant matrix</legend>
    <label className="operation-field">Attributes<textarea value={attributesText} rows={2} placeholder="One attribute per line, such as Color" onChange={event => setAttributes(event.target.value)}/></label>
    {!!attributes.length && <details><summary>Generate combinations</summary><div className="catalog-editor-grid">
      {attributes.map(name => <label className="operation-field" key={name}>{name} choices<input value={matrix[name] ?? ''} placeholder="Separate choices with commas"
        onChange={event => setMatrix({ ...matrix, [name]: event.target.value })}/></label>)}
      {matrixError && <p role="alert">{matrixError}</p>}
      <div className="page-actions"><button className="button secondary" type="button" onClick={generate}>Generate variants</button></div>
    </div></details>}
    <div className="page-actions"><button className="button secondary" type="button" disabled={!attributes.length || variants.length >= 120}
      onClick={() => { const row = blankVariant(newKey()); setVariants([...variants, row]); showKeys([row.key]); }}>Add variant</button></div>
    {production && !!attributes.length && <fieldset className="catalog-editor-group" disabled={uploading}>
      <legend>Variant images</legend>
      <label className="operation-field">Assign images by attribute<select value={imageSource} onChange={event => {
        const attribute = event.target.value;
        setImageAttribute(attribute);
        setVariants(current => current.map(row => ({ ...row, image_based_on: attribute })));
      }}><option value="">Select an attribute</option>
        {attributes.map(name => <option key={name}>{name}</option>)}
      </select></label>
      {imageValues.map(value => {
        const images = [...new Set(variants.filter(row => row.attribute_values[imageSource]?.trim() === value).flatMap(row => list(row.images)))];
        return <fieldset key={value} className="catalog-editor-group">
          <legend>{value}</legend>
          {!!sliderImages.length && <div>
            <h3>Select from Slider Images ({sliderImages.length})</h3>
            {sliderImages.map((image, index) => <button type="button" className="button secondary" key={image}
              aria-pressed={images.includes(image)} onClick={() => updateGroupImages(imageSource, value, current => images.includes(image)
                ? current.filter(url => url !== image) : [...new Set([...current, image])])}>Slider image {index + 1}</button>)}
          </div>}
          <label className="operation-field">Upload New Image<input type="file" accept="image/jpeg,image/png,image/webp"
            aria-label={'Upload New Image for ' + value} onChange={event => {
              const file = event.currentTarget.files?.[0];
              if (file) void uploadGroupImage(file, imageSource, value);
              event.currentTarget.value = '';
            }}/></label>
          {!!images.length && <ul aria-label={'Images for ' + value}>{images.map((image, index) => <li key={image}>
            Image {index + 1} <button type="button" className="button secondary"
              onClick={() => updateGroupImages(imageSource, value, current => current.filter(url => url !== image))}>Remove image {index + 1}</button>
          </li>)}</ul>}
        </fieldset>;
      })}
      {mediaError && <p role="alert">{mediaError}</p>}
      {uploading && <p role="status">Uploading image…</p>}
    </fieldset>}
    {variants.map((row, index) => <details className="catalog-variant" key={row.key} open={opened.has(row.key)} onToggle={event => {
      const open = event.currentTarget.open;
      setOpened(current => { if (current.has(row.key) === open) return current;
        const next = new Set(current); if (open) next.add(row.key); else next.delete(row.key); return next; });
    }}><summary>{row.sku || 'New variant ' + (index + 1)}</summary>
      <div className="catalog-editor-grid">
        <label className="operation-field">Variant SKU<input required value={row.sku} onChange={event => change(row.key, { sku: event.target.value })}/></label>
        {attributes.map(name => <label key={name} className="operation-field">{name}<input required value={row.attribute_values[name] ?? ''}
          onChange={event => change(row.key, { attribute_values: { ...row.attribute_values, [name]: event.target.value } })}/></label>)}
        {pricing.filter(([key]) => key !== 'buying_price' || allowCost).map(([key, label]) => priceInput('Base ' + label.toLowerCase() + ' price', row.base[key] ?? '',
          value => change(row.key, { base: { ...row.base, [key]: value } }), key !== 'buying_price'))}
        <label className="operation-field">Image URL<input type="url" value={row.image} onChange={event => change(row.key, { image: event.target.value })}/></label>
        <label className="operation-field">Color code<input value={row.color_code} onChange={event => change(row.key, { color_code: event.target.value })}/></label>
        <label className="operation-field">Gallery image URLs<textarea value={row.images} placeholder="One URL per line" onChange={event => change(row.key, { images: event.target.value })}/></label>
        <label className="operation-field">Video URLs<textarea value={row.videos} placeholder="One URL per line" onChange={event => change(row.key, { videos: event.target.value })}/></label>
        <details className="catalog-editor-wide"><summary>Currency prices</summary><div className="catalog-editor-grid">
          {currencies.flatMap(currency => pricing.filter(([key]) => key !== 'buying_price' || allowCost).map(([key, label]) =>
            priceInput(currency + ' ' + label.toLowerCase() + ' price', row.prices[currency]?.[key] ?? '', value => change(row.key, {
              prices: { ...row.prices, [currency]: { ...row.prices[currency], [key]: value } },
            }))))}
        </div></details>
        {!row._id && <div><button className="button secondary" type="button" onClick={() => setVariants(variants.filter(variant => variant.key !== row.key))}>Remove unsaved variant</button></div>}
      </div>
    </details>)}
    {canDelete && id && variants.some(row => row._id) && <p className="muted">Use the variant list below to delete a saved SKU after reviewing its stock.</p>}
  </fieldset>;
}

export function ProductEditForm({ id, region, tree, brands, policies, countries, selected, initial, allowCost, canDelete, productListQuery, initialVariants = [], initialAttributes = [], variantOnly = false, production = false, changeRegion = false }: {
  id?: string; region: Region; tree: CategoryOption[]; brands: Choice[]; policies: Choice[]; countries: Choice[];
  selected: string[]; initial: Record<string,string>; allowCost: boolean; canDelete: boolean; initialVariants?: VariantDraft[];
  initialAttributes?: string[]; variantOnly?: boolean; productListQuery: string; production?: boolean; changeRegion?: boolean;
}) {
  const [attributesText, setAttributes] = useState(initialAttributes.join('\n'));
  const [editorRegion, setEditorRegion] = useState(region);
  const [formRevision, setFormRevision] = useState(0);
  const [variants, setVariants] = useState(initialVariants);
  useEffect(() => { if (variantOnly) { setAttributes(initialAttributes.join('\n')); setVariants(initialVariants); } }, [initialAttributes, initialVariants, variantOnly]);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || uploading) return;
    busy.current = true;
    setSaving(true); setError(''); setNotice('');
    const form = new FormData(event.currentTarget);
    const values = { ...Object.fromEntries(form), available_countries: form.getAll('available_countries'), attributes: list(attributesText), variants: variantPayload(variants) };
    if (production && !variantOnly) {
      for (const name of ['offer_tags', 'search_tags'] as const) {
        const value = form.get(name);
        if (typeof value === 'string') Object.assign(values, { [name]: value.split(',').join('\n') });
      }
    }
    const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
    const target = production ? editorRegion : region;
    try {
      const record = await saveCatalog({ kind: 'products', id, region: target, action: variantOnly ? 'variants' : 'save', values });
      if (intent === 'stock') router.push((production ? '/dashboard/check-outlet-stocks' : '/desk/inventory/stock') + '?region=' + target + '&product=' + encodeURIComponent(record));
      else if (production && intent === 'new') {
        setFormRevision(current => current + 1);
        setAttributes('');
        setVariants([]);
        setNotice('Product created successfully.');
        router.refresh();
      } else if (production && !variantOnly) {
        const list = new URLSearchParams(productListQuery);
        list.set('region', target);
        router.push('/dashboard/products?' + list);
        router.refresh();
      } else if (!id) router.push('/desk/catalog/products/' + encodeURIComponent(record) + productListQuery);
      else { setNotice('Saved.'); router.refresh(); }
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'The product could not be saved.'); }
    finally { busy.current = false; setSaving(false); }
  }
  const initialValue = (name: string) => initial[name] || productFields.find(field => field.name === name)?.defaultValue || '';
  return <>
    <form className={production ? productionStyles.form : 'stack-form'} onSubmit={submit} key={formRevision}>
      {production && !variantOnly && <>
        <ProductEditorPanel>
          <label className={productionStyles.field}>Product Name
            <input name="name" defaultValue={initial.name} required placeholder="Enter product name"/>
          </label>
          <label className={productionStyles.field}>Region
            <select value={editorRegion} disabled={Boolean(id) || !changeRegion} onChange={event => setEditorRegion(event.target.value as Region)}>
              <option value="BD">🇧🇩 Bangladesh (BD)</option><option value="INTERNATIONAL">🌍 International</option>
            </select>
          </label>
          <ProductDescriptionEditor initial={initial.description ?? ''}/>
          <ProductSpecsEditor initial={initial.dynamic_specs ?? '[]'}/>
        </ProductEditorPanel>
        <ProductEditorPanel title="General Setup">
          <div className={productionStyles.fields}>
            <CategorySelects tree={tree} selected={selected} production/>
            <SelectRef name="brand" current={initial.brand} label="Brand (optional)" values={brands}/>
            <label className={productionStyles.field}>Available Countries (optional)
              <select name="available_countries" multiple disabled={editorRegion !== 'INTERNATIONAL'}
                defaultValue={list(initial.available_countries ?? '')} size={Math.min(4, Math.max(2, countries.length))}>
                {countries.map(country => <option key={country.value} value={country.value}>{country.label}</option>)}
              </select>
              <small>Leave empty for domestic (BDT) only. Set per-currency prices on each variant using the Global Prices column below.</small>
            </label>
            <label className={productionStyles.field}>Offer Tags
              <input name="offer_tags" defaultValue={initial.offer_tags?.replaceAll('\n', ', ')} placeholder="Select offer tags"/>
            </label>
            <label className={productionStyles.field}>Search Tags
              <input name="search_tags" defaultValue={initial.search_tags?.replaceAll('\n', ', ')} placeholder="Enter your search tags"/>
            </label>
            <label className={productionStyles.field}>Minimum Order Qty
              <input name="min_order_qty" type="number" min="1" defaultValue={initialValue('min_order_qty')}/>
            </label>
            <label className={productionStyles.field}>Max Order Qty
              <input name="max_order_qty" type="number" min="1" defaultValue={initialValue('max_order_qty')}/>
            </label>
            <ProductEditorSwitch label="Is Free Delivery?" hint="Wanna offer free delivery?" name="is_free_delivery" initial={initial.is_free_delivery === 'true'}/>
            <label className={productionStyles.field}>Delivery Time
              <input name="approximately_delivery_time" required defaultValue={initial.approximately_delivery_time || (id ? '' : '3-5 days')} placeholder="3-5 days"/>
            </label>
          </div>
        </ProductEditorPanel>
        <ProductEditorPanel title="Sale Channels"><div className={productionStyles.fields}>
          <ProductEditorSwitch label="POS" hint="Is available on POS?" name="pos" initial={initial.pos === 'true'}/>
          <ProductEditorSwitch label="Website" hint="Is available on website?" name="website" initial={initialValue('website') === 'true'}/>
        </div></ProductEditorPanel>
        <ProductEditorPanel title="Warranty &amp; Return Policy (Optional)"><div className={productionStyles.fields}>
          <label className={productionStyles.field}>Warranty<input name="warranty" defaultValue={initial.warranty} placeholder="Enter warranty details"/></label>
          <SelectRef name="return_policy" label="Return Policy" current={initial.return_policy} values={policies}/>
        </div></ProductEditorPanel>
        <ProductEditorPanel title="Thumbnail &amp; Slider Images">
          <ImageUpload initial={initial.thumbnail ?? ''} gallery={initial.slider_images ?? ''}/>
          <label className={productionStyles.field}>Short Videos (Story / Reels) (Optional)
            <textarea name="short_videos" defaultValue={initial.short_videos} rows={3} placeholder="One video URL per line"/>
          </label>
        </ProductEditorPanel>
        {['facebook','instagram','youtube','tiktok','is_published','shipping_cost','shipping_cost_per_unit','coin_per_order']
          .map(name => <input key={name} type="hidden" name={name} value={initialValue(name) || (name === 'is_published' ? 'false' : '')}/>)}
        <ProductEditorPanel title={id ? 'Root Level SKU' : 'Add Product Attribute & Variant'}>
          <label className={productionStyles.field}>Root Level SKU
            <input name="sku" required readOnly={Boolean(id)} defaultValue={initial.sku} placeholder="Enter root level SKU"/>
          </label>
        </ProductEditorPanel>
      </>}
      {!production && !variantOnly && <>
        <fieldset className="catalog-editor-group"><legend>Product listing</legend><div className="catalog-editor-grid">
          <CatalogFields fields={productFields.filter(field => !['thumbnail','slider_images'].includes(field.name))} initial={initial}/>
        </div></fieldset>
        <ImageUpload initial={initial.thumbnail ?? ''} gallery={initial.slider_images ?? ''}/>
        <fieldset className="catalog-editor-group"><legend>Categories and coverage</legend><div className="catalog-editor-grid">
          <CategorySelects tree={tree} selected={selected}/>
          <SelectRef name="brand" current={initial.brand} label="Brand" values={brands}/>
          <SelectRef name="return_policy" current={initial.return_policy} label="Return policy" values={policies}/>
          {region === 'INTERNATIONAL' && <label className="operation-field catalog-editor-wide">Available countries<select name="available_countries" multiple
            defaultValue={list(initial.available_countries ?? '')} size={Math.min(8, Math.max(3, countries.length))}>
            {countries.map(country => <option key={country.value} value={country.value}>{country.label}</option>)}
          </select></label>}
        </div></fieldset>
      </>}
      {(variantOnly || !id) && <VariantMatrix attributesText={attributesText} setAttributes={setAttributes} variants={variants} setVariants={setVariants}
        allowCost={allowCost} canDelete={canDelete} id={id} production={production} uploading={uploading} setUploading={setUploading}
        sliderImages={[...new Set(list(initial.slider_images ?? ''))]}/>}
      {error && <p className="notice warn" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {production ? <div className={productionStyles.saveActions}>
        {!id && !variantOnly && <><button className={productionStyles.secondary} type="submit" value="stock" disabled={saving || uploading}>Save &amp; Open Stock</button>
          <button className={productionStyles.secondary} type="submit" value="new" disabled={saving || uploading}>Save &amp; Add Another</button></>}
        <button className={productionStyles.primary} type="submit" disabled={saving || uploading || variantOnly && !variants.length}>
          {saving ? 'Processing...' : variantOnly ? 'Update Variants' : id ? 'Update Product' : 'Save'}
        </button>
      </div> : <div className="page-actions"><button className="button primary" disabled={saving || variantOnly && !variants.length}>
        {saving ? 'Saving…' : variantOnly ? 'Save variants' : id ? 'Save product' : 'Create product'}</button>
        {!variantOnly && <button className="button secondary" value="stock" disabled={saving}>Save &amp; Open Stock</button>}</div>}
    </form>
    {variantOnly && canDelete && id && <div className="page-actions">{variants.filter(row => row._id).map(row => <CatalogConfirm key={row.key}
      kind="products" id={id} region={region} action="delete-variant" values={{ variant: row._id }} label={'Delete ' + row.sku}
      description="The inventory service checks stock before removing a saved variant."/>)}</div>}
  </>;
}
