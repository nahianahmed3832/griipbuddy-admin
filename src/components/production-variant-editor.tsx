'use client';

import { AlertTriangle, Globe, GripVertical, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { productionCmsPreview } from '@/lib/production-cms-media';
import type { Region } from '@/lib/sections';
import { saveCatalog } from './catalog-edit-form';
import type { VariantDraft } from './product-edit-form';
import { ProductEditorSwitch } from './production-product-editor-fields';
import { uploadProductMedia } from './production-product-media';
import styles from './production-product-editor.module.css';

type Attribute = { key: number; name: string; values: string[] };
type VariantEditor = {
  initialAttributes: string[];
  initialVariants: VariantDraft[];
  variants: VariantDraft[];
  setVariants: Dispatch<SetStateAction<VariantDraft[]>>;
  setAttributes: (value: string) => void;
  rootSku: string;
  setRootSku?: (sku: string) => void;
  sliderImages: string[];
  uploading: boolean;
  setUploading: (value: boolean) => void;
  heading: boolean;
};

const lines = (value: string) => value.split(/\r?\n/).map(row => row.trim()).filter(Boolean);
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
const formatAmount = (amount: string) => Number(amount || 0).toLocaleString('en-US');
const priceFields = [['regular_price', 'Regular price'], ['sale_price', 'Sale price'], ['buying_price', 'Buying price']] as const;

function initialAttributeValues(names: string[], rows: VariantDraft[]) {
  return names.map((name, key) => ({ key, name, values: unique(rows.map(row => row.attribute_values[name])) }));
}

function variationSku(root: string, combination: Record<string, string>, creation = false) {
  const attrs = Object.keys(combination);
  if (creation) return [root, ...attrs.sort().map(attr => combination[attr])]
    .map(part => part.trim().replace(/\s+/g, '').toUpperCase()).filter(Boolean).join('-');
  const first = attrs.find(attr => /size/i.test(attr)) ?? attrs[0];
  return [root, ...(first ? [combination[first], ...attrs.filter(attr => attr !== first).sort().map(attr => combination[attr])] : [])]
    .map(part => part.trim().replace(/\s+/g, '').toUpperCase()).filter(Boolean).join('-');
}

function makeVariants(attrs: Attribute[], existing: VariantDraft[], defaults: VariantDraft['base'], rootSku: string) {
  const active = attrs.filter(attr => attr.name.trim() && attr.values.some(value => value.trim()));
  let combinations: Record<string, string>[] = active.length ? [{}] : [];
  for (const { name, values } of active) {
    const choices = unique(values.map(value => value.trim()));
    if (choices.length * combinations.length > 120) return undefined;
    combinations = combinations.flatMap(row => choices.map(value => ({ ...row, [name.trim()]: value })));
  }
  const names = active.map(attr => attr.name.trim());
  return combinations.map(attribute_values => {
    const previous = existing.find(variant => names.every(name => variant.attribute_values[name] === attribute_values[name]));
    return previous ? { ...previous, attribute_values } : {
      key: 'new-' + JSON.stringify(attribute_values), sku: rootSku ? variationSku(rootSku, attribute_values) : '', attribute_values,
      base: { ...defaults }, prices: {}, image: '', images: '', videos: '', color_code: '',
    };
  });
}

function VariantImages({ value, images, sliderImages, uploading, setUploading, onChange, matrixRow }: {
  value: string; images: string[]; sliderImages: string[]; uploading: boolean; setUploading: (busy: boolean) => void;
  onChange: (updater: (current: string[]) => string[]) => void; matrixRow?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  async function upload(file?: File) {
    if (!file || uploading) return;
    if (file.size > 3 * 1024 * 1024) { setError('Image size must be less than 3 MB.'); return; }
    setError(''); setUploading(true);
    try {
      const address = await uploadProductMedia(file, 'image');
      onChange(current => unique([...current, address]));
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Could not upload the image.'); }
    finally { setUploading(false); }
  }
  return <>
    <button type="button" className={matrixRow ? styles.rowGallery : styles.iconButton} aria-label={'Images for ' + value} onClick={() => dialog.current?.showModal()}>
      {matrixRow && images.length > 0
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={productionCmsPreview(images[0])} alt="" referrerPolicy="no-referrer"/>
        : <ImagePlus size={16} aria-hidden="true"/>}{images.length > 0 && <span>{images.length}</span>}
    </button>
    <dialog className={styles.editorDialog} ref={dialog} aria-label={'Images for ' + value}>
      <div className={styles.dialogHeading}><h3>Images for {value}</h3>
        <button className={styles.iconButton} type="button" aria-label="Close images" onClick={() => dialog.current?.close()}><X size={16}/></button>
      </div>
      {sliderImages.length > 0 && <div>
        <p>Select from Slider Images ({sliderImages.length})</p>
        <div className={styles.mediaGrid}>{sliderImages.map((address, index) => <button type="button" className={styles.mediaTile} key={address}
          aria-pressed={images.includes(address)} aria-label={'Slider image ' + (index + 1)} onClick={() => onChange(current =>
            current.includes(address) ? current.filter(image => image !== address) : unique([...current, address]))}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={productionCmsPreview(address)} alt="" referrerPolicy="no-referrer"/>
        </button>)}</div>
      </div>}
      <label className={styles.imageUpload}>Upload New Image
        <input className={styles.hiddenFile} type="file" accept="image/jpeg,image/png,image/webp" aria-label={'Upload New Image for ' + value}
          disabled={uploading} onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            void upload(file);
          }}/>
      </label>
      {images.length > 0 && <ul className={styles.optionImages} aria-label={'Images for ' + value}>{images.map((address, index) =>
        <li className={styles.mediaTile} key={address}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={productionCmsPreview(address)} alt={'Image ' + (index + 1)} referrerPolicy="no-referrer"/>
          <button type="button" aria-label={'Remove image ' + (index + 1)} onClick={() => onChange(current => current.filter(image => image !== address))}><Trash2 size={15}/></button>
        </li>)}</ul>}
      {error && <p className="notice warn" role="alert">{error}</p>}
    </dialog>
  </>;
}

function VariantImagePreview({ row }: { row: VariantDraft }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const images = lines(row.images);
  return <>
    <button className={styles.rowGallery} type="button" aria-label={'Preview images for ' + row.sku} onClick={() => dialog.current?.showModal()}>
      {images.length > 0 ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={productionCmsPreview(images[0])} alt="" referrerPolicy="no-referrer"/><span>{images.length}</span>
      </> : <ImagePlus size={16} aria-hidden="true"/>}
    </button>
    <dialog className={styles.editorDialog} ref={dialog} aria-label={'Variant images for ' + row.sku}>
      <div className={styles.dialogHeading}><h3>Variant Images</h3>
        <button className={styles.iconButton} type="button" aria-label="Close variant images" onClick={() => dialog.current?.close()}><X size={16}/></button>
      </div>
      {images.length ? <div className={styles.mediaGrid}>{images.map((address, index) => <div className={styles.mediaTile} key={address}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={productionCmsPreview(address)} alt={'Selected ' + (index + 1)} referrerPolicy="no-referrer"/>
      </div>)}</div> : <p>No images selected</p>}
    </dialog>
  </>;
}

const alternateCurrencies = [
  ['USD', '$', 'US Dollar'], ['EUR', '€', 'Euro'], ['AUD', 'A$', 'Australian Dollar'],
] as const;

function VariantPrices({ row, onChange }: {
  row: VariantDraft; onChange: (prices: VariantDraft['prices']) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const count = alternateCurrencies.filter(([currency]) => ['regular_price', 'sale_price'].some(name => (row.prices[currency]?.[name] ?? '') !== '')).length;
  return <>
    <button className={styles.globalPriceButton + ' ' + styles.secondary} type="button" aria-label={'Global Prices for ' + row.sku}
      onClick={() => dialog.current?.showModal()}><Globe size={14} aria-hidden="true"/><span data-set={count > 0}>{count ? count + ' set' : 'Add'}</span></button>
    <dialog className={styles.editorDialog + ' ' + styles.globalPriceDialog} ref={dialog} aria-label={'Global Prices for ' + row.sku}>
      <div className={styles.dialogHeading}><h3>International Prices</h3>
        <button className={styles.iconButton} type="button" aria-label="Close global prices" onClick={() => dialog.current?.close()}><X size={16}/></button>
      </div>
      <p>BDT is the default &amp; fallback. Set prices for other currencies below — leave a currency blank to fall back to the BDT price.</p>
      <div className={styles.currencyCard} data-currency="BDT">
        <p><strong>BDT</strong> <small>৳ Bangladeshi Taka · default / fallback</small></p>
        <div className={styles.currencyPrices}><span>Regular: ৳{row.base.regular_price || '—'}</span><span>Sale: ৳{row.base.sale_price || '—'}</span></div>
      </div>
      {alternateCurrencies.map(([currency, symbol, description]) => <div className={styles.currencyCard} data-currency={currency} key={currency}>
        <p><strong>{currency}</strong> <small>{symbol} {description}</small></p>
        <div className={styles.currencyPrices}>{priceFields.slice(0, 2).map(([name, label]) => <label className={styles.field} key={name}>
          {name === 'regular_price' ? 'Regular' : 'Sale'} Price ({symbol})<input aria-label={currency + ' ' + label} type="number" min="0" step=".01"
            placeholder="—" value={row.prices[currency]?.[name] ?? ''}
            onChange={event => onChange({ ...row.prices, [currency]: { ...row.prices[currency], [name]: event.target.value } })}/>
        </label>)}</div>
      </div>)}
      <div className={styles.saveActions}><button type="button" className={styles.primary} onClick={() => dialog.current?.close()}>Done</button></div>
    </dialog>
  </>;
}

export function ProductionVariantEditor({ initialAttributes, initialVariants, variants, setVariants, setAttributes, rootSku, setRootSku, sliderImages, uploading, setUploading, heading }: VariantEditor) {
  const creating = Boolean(setRootSku);
  const [attrs, setAttrs] = useState(() => initialAttributeValues(initialAttributes, initialVariants));
  const serial = useRef(initialAttributes.length);
  const [defaultRegular, setDefaultRegular] = useState(initialVariants[0]?.base.regular_price ?? (creating ? '0' : ''));
  const [defaultSale, setDefaultSale] = useState(initialVariants[0]?.base.sale_price ?? '0');
  const [imageBy, setImageBy] = useState(initialVariants.find(row => row.image_based_on)?.image_based_on ?? '');
  const [error, setError] = useState('');
  const dragged = useRef<{ attribute: number; value: number }>(null);
  const draggedRow = useRef<string>(null);

  useEffect(() => {
    setAttrs(initialAttributeValues(initialAttributes, initialVariants));
    serial.current = initialAttributes.length;
    setImageBy(initialVariants.find(row => row.image_based_on)?.image_based_on ?? '');
  }, [initialAttributes, initialVariants]);

  function changeAttributes(next: Attribute[], remap = (rows: VariantDraft[]) => rows) {
    const names = next.filter(attr => attr.values.some(value => value.trim())).map(attr => attr.name.trim()).filter(Boolean);
    if (new Set(names).size !== names.length) return setError('Attribute names must be unique.');
    const rows = makeVariants(next, remap(variants), { regular_price: defaultRegular, sale_price: defaultSale }, creating ? '' : rootSku);
    if (!rows) return setError('The matrix can contain at most 120 variants.');
    setError('');
    setAttrs(next);
    setAttributes(names.join('\n'));
    setVariants(rows.map(row => ({ ...row, image_based_on: names.includes(imageBy) ? imageBy : '' })));
  }
  function change(key: string, patch: Partial<VariantDraft>) {
    setVariants(previous => previous.map(row => row.key === key ? { ...row, ...patch } : row));
  }
  function changeAttributeName(index: number, name: string) {
    const old = attrs[index].name.trim();
    const target = name.trim();
    changeAttributes(attrs.map((attr, i) => i === index ? { ...attr, name } : attr), rows => rows.map(row => ({
      ...row, attribute_values: Object.fromEntries(Object.entries(row.attribute_values).map(([key, value]) => [key === old ? target : key, value])),
    })));
    if (imageBy === old) {
      setImageBy(target);
      setVariants(rows => rows.map(row => ({ ...row, image_based_on: target })));
    }
  }
  function changeValues(index: number, values: string[], before?: string, after?: string) {
    const name = attrs[index].name.trim();
    changeAttributes(attrs.map((attr, i) => i === index ? { ...attr, values } : attr), rows => before && after ? rows.map(row =>
      row.attribute_values[name] === before.trim() ? { ...row, attribute_values: { ...row.attribute_values, [name]: after.trim() } } : row) : rows);
  }
  function imagesFor(name: string, value: string, update: (images: string[]) => string[]) {
    setVariants(rows => rows.map(row => {
      if (row.attribute_values[name] !== value) return row;
      const images = update(lines(row.images));
      return { ...row, images: images.join('\n'), image: images[0] ?? '', image_based_on: name };
    }));
  }
  return <section className={styles.variantEditor} data-create={creating}>
    <div className={styles.variantHeading}>
      {heading && <h2>{creating ? 'Add' : 'Update'} Product Attribute &amp; Variant</h2>}
      <button type="button" className={styles.secondary} disabled={attrs.length >= (creating ? 2 : 3) || uploading} onClick={() => {
        const key = serial.current++;
        changeAttributes([...attrs, { key, name: '', values: creating ? [''] : [] }]);
      }}><Plus size={16} aria-hidden="true"/> Add Attribute</button>
    </div>
    <div className={styles.attributes}>{attrs.map((attr, index) => {
      const name = attr.name.trim();
      return <div className={styles.attribute} key={attr.key}>
        <div className={styles.attributeName}>
          <label className={styles.field}>Attribute Name<input placeholder="e.g. Color" value={attr.name}
            onChange={event => changeAttributeName(index, event.target.value)}/></label>
          <button className={styles.danger} type="button" aria-label={'Remove attribute ' + name} onClick={() => {
            changeAttributes(attrs.filter((_, i) => i !== index));
            if (imageBy === name) setImageBy('');
          }}><Trash2 size={16}/></button>
        </div>
        {name && <ProductEditorSwitch key={name + ':' + imageBy} label={'Show Image by ' + name} hint="" name="" initial={imageBy === name}
          onChange={checked => {
            const next = checked ? name : '';
            setImageBy(next);
            setVariants(rows => rows.map(row => ({ ...row, image_based_on: next })));
          }}/>}
        <div className={styles.attributeValues}>
          <p>Values</p>
          <div>{attr.values.map((value, valueIndex) => {
            const group = variants.filter(row => row.attribute_values[name] === value.trim());
            const images = unique(group.flatMap(row => lines(row.images)));
            return <div className={styles.attributeValue} key={valueIndex} draggable onDragStart={() => { dragged.current = { attribute: index, value: valueIndex }; }}
              onDragOver={event => event.preventDefault()} onDrop={event => {
                event.preventDefault();
                const from = dragged.current;
                if (!from || from.attribute !== index || from.value === valueIndex) return;
                const values = [...attr.values];
                const [moved] = values.splice(from.value, 1);
                values.splice(valueIndex, 0, moved);
                changeValues(index, values);
              }}>
              {!creating && <GripVertical size={15} aria-hidden="true"/>}
              <input aria-label={name + ' value ' + (valueIndex + 1)} placeholder="e.g. Red" value={value} onChange={event =>
                changeValues(index, attr.values.map((entry, i) => i === valueIndex ? event.target.value : entry), value, event.target.value)}/>
              {name === imageBy && value.trim() && <>
                <VariantImages value={value.trim()} images={images} sliderImages={sliderImages} uploading={uploading} setUploading={setUploading}
                  onChange={update => imagesFor(name, value.trim(), update)}/>
                <input className={styles.valueColor} aria-label={'Color Code for ' + value} placeholder="#000000" value={group.find(row => row.color_code)?.color_code ?? ''}
                  onChange={event => setVariants(rows => rows.map(row => row.attribute_values[name] === value.trim() ? { ...row, color_code: event.target.value } : row))}/>
              </>}
              <button type="button" className={styles.iconButton} aria-label={'Remove ' + (value || 'value')} onClick={() => changeValues(index, attr.values.filter((_, i) => i !== valueIndex))}><X size={15}/></button>
            </div>;
          })}
          <button type="button" className={styles.secondary} onClick={() => changeValues(index, [...attr.values, ''])}><Plus size={15}/> Add</button></div>
        </div>
      </div>;
    })}</div>
    {error && <p className="notice warn" role="alert">{error}</p>}
    {(variants.length > 0 || creating) && <div className={styles.matrix}>
      <h2>Variant Matrix</h2>
      <div className={styles.matrixDefaults}>
        <label className={styles.field}>Default Regular Price (BDT)<input type="number" min="0" step=".01" placeholder="Enter default regular price" value={defaultRegular} onChange={event => setDefaultRegular(event.target.value)}/></label>
        <label className={styles.field}>Default Sale Price (BDT)<input type="number" min="0" step=".01" placeholder="Enter default sale price" value={defaultSale} onChange={event => setDefaultSale(event.target.value)}/></label>
        <label className={styles.field}>Root Level SKU<input value={rootSku} name={creating ? 'sku' : undefined} required={creating} disabled={!creating}
          onChange={event => setRootSku?.(event.target.value.toUpperCase())} placeholder="Enter root level SKU"
          title={creating ? undefined : 'Root level SKU cannot be edited.'}/></label>
        <button className={styles.primary} type="button" onClick={() => setVariants(rows => rows.map(row => ({
          ...row, sku: !row.sku || row.sku === rootSku ? variationSku(rootSku, row.attribute_values, creating) : row.sku,
          base: { ...row.base, regular_price: defaultRegular, sale_price: defaultSale },
        })))}>{creating ? 'Apply Defaults to All' : 'Apply to All'}</button>
      </div>
      <div className={styles.tableScroll}><table className={styles.matrixTable}>
        <thead><tr>{!creating && <th>Serial</th>}{['Attribute Variation', 'Regular Price', 'Sale Price', 'SKU', 'Color Code', 'Images', 'Global Prices'].map(label => <th key={label}>{label}</th>)}{!creating && <th>Status</th>}</tr></thead>
        <tbody>{variants.map((row, index) => <tr key={row.key} draggable className={styles.variantRow} onDragStart={() => { draggedRow.current = row.key; }}
          onDragEnd={() => { draggedRow.current = null; }} onDragOver={event => event.preventDefault()} onDrop={event => {
            event.preventDefault();
            const key = draggedRow.current;
            if (!key || key === row.key) return;
            setVariants(previous => {
              const reordered = [...previous];
              const from = reordered.findIndex(item => item.key === key);
              const to = reordered.findIndex(item => item.key === row.key);
              if (from < 0 || to < 0) return previous;
              const [moved] = reordered.splice(from, 1);
              reordered.splice(to, 0, moved);
              return reordered;
            });
          }}>
          {!creating && <td><span className={styles.variantSerial}><GripVertical size={16} aria-hidden="true"/>{index + 1}</span></td>}
          <td>{Object.values(row.attribute_values).join(' - ')}</td>
          {priceFields.slice(0, 2).map(([name, label]) => <td key={name}><input type="number" required min="0" step=".01" aria-label={label + ' for variant ' + (index + 1)}
            value={row.base[name] ?? ''} onChange={event => change(row.key, { base: { ...row.base, [name]: event.target.value } })}/></td>)}
          <td><input required aria-label={'SKU for variant ' + (index + 1)} value={row.sku} onChange={event => change(row.key, { sku: creating ? event.target.value.toUpperCase() : event.target.value })}/></td>
          <td><span className={styles.colorCode}>{row.color_code && <span style={{ backgroundColor: row.color_code }} aria-hidden="true"/>}{row.color_code || '-'}</span></td>
          <td>{creating ? <VariantImages value={'variant ' + (index + 1)} images={lines(row.images)} sliderImages={sliderImages} uploading={uploading}
            setUploading={setUploading} matrixRow onChange={update => setVariants(rows => rows.map(current => {
              if (current.key !== row.key) return current;
              const images = update(lines(current.images));
              return { ...current, images: images.join('\n'), image: images[0] ?? '' };
            }))}/> : <VariantImagePreview row={row}/>}</td>
          <td><VariantPrices row={row} onChange={prices => change(row.key, { prices })}/></td>
          {!creating && <td><span className={styles.variantStatus} data-existing={Boolean(row._id)}>{row._id ? 'EXISTING' : 'NEW'}</span></td>}
        </tr>)}</tbody>
      </table></div>
    </div>}
  </section>;
}

export function ProductionVariantRemoval({ id, region, variants }: { id: string; region: Region; variants: VariantDraft[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  async function remove() {
    if (!target.length || busy) return;
    setBusy(true); setError('');
    try {
      await saveCatalog({ kind: 'products', id, region, action: 'delete-variant', values: { variants: target } });
      setSelected([]); setTarget([]); dialog.current?.close(); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not delete variants.'); }
    finally { setBusy(false); }
  }
  function confirm(ids: string[]) { setTarget(ids); setError(''); dialog.current?.showModal(); }
  const ids = variants.flatMap(row => row._id ? [row._id] : []);
  return <section className={styles.dangerZone}>
    <div className={styles.dangerHeading}><AlertTriangle size={20} aria-hidden="true"/><div>
      <h3>Danger Zone — Delete Variants</h3>
      <p>Product: {id}. Deleting variants can affect orders, inventory and reporting. Prefer soft delete if you have order references.</p>
    </div></div>
    <div className={styles.saveActions}><button className={styles.danger} type="button" disabled={!selected.length}
      onClick={() => confirm(selected)}><Trash2 size={16} aria-hidden="true"/> Delete Selected ({selected.length})</button></div>
    <div className={styles.tableScroll}><table className={styles.matrixTable}>
      <thead><tr><th><label><input type="checkbox" checked={ids.length > 0 && selected.length === ids.length}
        onChange={event => setSelected(event.target.checked ? ids : [])}/> All</label></th><th>Variant</th><th>Prices</th><th>SKU</th><th>Action</th></tr></thead>
      <tbody>{variants.map(row => row._id && <tr key={row._id}>
        <td><input aria-label={'Select ' + row.sku} type="checkbox" checked={selected.includes(row._id)}
          onChange={event => setSelected(current => event.target.checked ? [...current, row._id!] : current.filter(id => id !== row._id))}/></td>
        <td>{Object.values(row.attribute_values).join(' / ')}<small>ID: {row._id}</small>{row.barcode && <small>Barcode: {row.barcode}</small>}</td>
        <td>Regular: {formatAmount(row.base.regular_price)}<br/>Sale: {formatAmount(row.base.sale_price)}</td><td>{row.sku}</td>
        <td><button type="button" className={styles.danger} aria-label={'Delete ' + row.sku} onClick={() => confirm([row._id!])}><Trash2 size={16} aria-hidden="true"/> Delete</button></td>
      </tr>)}</tbody>
    {!ids.length && <tbody><tr><td colSpan={5} className={styles.emptyVariants}>No variants found.</td></tr></tbody>}
    </table></div>
    <dialog className={styles.editorDialog} ref={dialog} aria-label="Delete variants">
      <div className={styles.dialogHeading}><h3>Delete {target.length} {target.length === 1 ? 'variant' : 'variants'}?</h3></div>
      <p>The inventory service checks stock before removing a saved variant.</p>
      {error && <p className="notice warn" role="alert">{error}</p>}
      <div className={styles.saveActions}>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button>
        <button type="button" className={styles.danger} disabled={busy} onClick={() => void remove()}>{busy ? 'Deleting…' : 'Delete'}</button>
      </div>
    </dialog>
  </section>;
}
