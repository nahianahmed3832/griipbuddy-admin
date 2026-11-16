'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import { currencies, productFields, type Choice } from '@/lib/catalog-edit-fields';
import type { CategoryOption } from '@/lib/catalog-list';
import type { Region } from '@/lib/sections';
import { CatalogConfirm, CatalogFields, saveCatalog } from './catalog-edit-form';

const taxonomy = ['category', 'subcategory', 'sub_subcategory', 'third_subcategory'];
const taxonomyLabels = ['Category', 'Subcategory', 'Second subcategory', 'Third subcategory'];
const pricing = [['regular_price', 'Regular'], ['sale_price', 'Sale'], ['buying_price', 'Buying']] as const;
type Prices = Record<string, string>;
export type VariantDraft = {
  key: string; _id?: string; sku: string; attribute_values: Record<string, string>; base: Prices;
  prices: Record<string, Prices>; image: string; images: string; videos: string; color_code: string;
};
function blankVariant(key: string): VariantDraft {
  return { key, sku: '', attribute_values: {}, base: { regular_price: '', sale_price: '0' }, prices: {}, image: '', images: '', videos: '', color_code: '' };
}
function CategorySelects({ tree, selected }: { tree: CategoryOption[]; selected: string[] }) {
  const [path, setPath] = useState(selected);
  const uid = useId();
  let options = tree;
  return taxonomy.map((name, depth) => {
    const level = options;
    const value = path[depth] ?? '';
    options = level.find(item => item.id === value)?.children ?? [];
    return <div className="operation-field" key={name}><label htmlFor={uid + '-' + name}>{taxonomyLabels[depth]}</label>
      <select id={uid + '-' + name} name={name} value={value} required={depth <= 1} disabled={depth > 1 && !level.length && !value}
        onChange={event => setPath(path.slice(0, depth).concat(event.target.value))}>
        <option value="">{depth ? 'None' : 'Choose a category'}</option>
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
  return variants.map(({ _id, sku, attribute_values, image, color_code, base, prices, images, videos }) => ({ _id, sku, attribute_values, image, color_code,
    ...inputPrices(base), prices: Object.fromEntries(Object.entries(prices).map(([currency, price]) => [currency, inputPrices(price)])),
    images: list(images), videos: list(videos),
  }));
}
function VariantMatrix({ attributesText, setAttributes, variants, setVariants, allowCost, canDelete, id }: {
  attributesText: string; setAttributes: (value: string) => void; variants: VariantDraft[]; setVariants: (value: VariantDraft[]) => void;
  allowCost: boolean; canDelete: boolean; id?: string;
}) {
  const attributes = [...new Set(list(attributesText))];
  const [matrix, setMatrix] = useState<Record<string, string>>({});
  const [matrixError, setMatrixError] = useState('');
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const counter = useRef(0);
  const newKey = () => 'new-' + ++counter.current;
  function change(key: string, patch: Partial<VariantDraft>) {
    setVariants(variants.map(row => row.key === key ? { ...row, ...patch } : row));
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

export function ProductEditForm({ id, region, tree, brands, policies, countries, selected, initial, allowCost, canDelete, productListQuery, initialVariants = [], initialAttributes = [], variantOnly = false }: {
  id?: string; region: Region; tree: CategoryOption[]; brands: Choice[]; policies: Choice[]; countries: Choice[];
  selected: string[]; initial: Record<string,string>; allowCost: boolean; canDelete: boolean; initialVariants?: VariantDraft[];
  initialAttributes?: string[]; variantOnly?: boolean; productListQuery: string;
}) {
  const [attributesText, setAttributes] = useState(initialAttributes.join('\n'));
  const [variants, setVariants] = useState(initialVariants);
  useEffect(() => { if (variantOnly) { setAttributes(initialAttributes.join('\n')); setVariants(initialVariants); } }, [initialAttributes, initialVariants, variantOnly]);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true); setError(''); setNotice('');
    const form = new FormData(event.currentTarget);
    const values = { ...Object.fromEntries(form), available_countries: form.getAll('available_countries'), attributes: list(attributesText), variants: variantPayload(variants) };
    const stock = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'stock';
    try {
      const record = await saveCatalog({ kind: 'products', id, region, action: variantOnly ? 'variants' : 'save', values });
      if (stock) router.push('/desk/inventory/stock?region=' + region + '&product=' + encodeURIComponent(record));
      else if (!id) router.push('/desk/catalog/products/' + encodeURIComponent(record) + productListQuery);
      else { setNotice('Saved.'); router.refresh(); }
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'The product could not be saved.'); }
    finally { busy.current = false; setSaving(false); }
  }
  return <>
    <form className="stack-form" onSubmit={submit}>
      {!variantOnly && <>
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
        allowCost={allowCost} canDelete={canDelete} id={id}/>}
      {error && <p className="notice warn" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <div className="page-actions"><button className="button primary" disabled={saving || variantOnly && !variants.length}>
        {saving ? 'Saving…' : variantOnly ? 'Save variants' : id ? 'Save product' : 'Create product'}</button>
        {!variantOnly && <button className="button secondary" value="stock" disabled={saving}>Save &amp; Open Stock</button>}</div>
    </form>
    {variantOnly && canDelete && id && <div className="page-actions">{variants.filter(row => row._id).map(row => <CatalogConfirm key={row.key}
      kind="products" id={id} region={region} action="delete-variant" values={{ variant: row._id }} label={'Delete ' + row.sku}
      description="The inventory service checks stock before removing a saved variant."/>)}</div>}
  </>;
}
