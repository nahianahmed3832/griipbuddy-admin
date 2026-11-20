'use client';

import { Plus, Search, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import type { StockChangeLocation } from '@/lib/stock-changes';
import styles from './warehouse-inventory.module.css';

type Product = { id: string; name: string; sku?: string };
type Variant = { sku: string; attribute_values: Record<string, string>; regular_price: number; sale_price: number };
type Inventory = { attributes: string[]; variants: Variant[]; revision: string | null };

async function inventoryRequest<T>(query: Record<string, string>, init?: RequestInit): Promise<T> {
  const response = await fetch(adminPath('/api/warehouse-inventory?' + new URLSearchParams(query)), init);
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Could not load or save the warehouse inventory.');
  return result;
}

export function WarehouseInventory({ locations, region }: { locations: StockChangeLocation[]; region: Region }) {
  const [text, setText] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product>();
  const [warehouse, setWarehouse] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (text.trim().length < 2 || busy) return;
    setBusy(true);
    setError('');
    try {
      const results = await inventoryRequest<Product[]>({ q: text.trim(), region });
      setProducts(results);
      if (!results.length) setError('No products match.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not search products.');
    } finally { setBusy(false); }
  }

  return <section className={styles.page}>
    <h1>Warehouse Inventory Update</h1>
    {!selected && <p className={styles.warning}>Please select a Product!</p>}
    <form className={styles.card} onSubmit={search}>
      <label>Search &amp; Select Product
        <span className={styles.search}><input type="search" value={text} minLength={2} maxLength={100}
          placeholder="Search by product name or SKU" onChange={event => { setText(event.target.value); if (selected) setSelected(undefined); }}/>
          <button className="button secondary" aria-label="Search products" disabled={busy || text.trim().length < 2}><Search size={16}/></button></span>
      </label>
      {error && <p role="status">{error}</p>}
      {products.length > 0 && <ul className={styles.results} aria-label="Product results">{products.map(product => <li key={product.id}>
        <button type="button" className="button subtle" onClick={() => { setSelected(product); setText(product.name); setProducts([]); }}>
          {product.name}{product.sku && ' · ' + product.sku}</button></li>)}</ul>}
    </form>
    {!warehouse && <p className={styles.warning}>Please select a Warehouse!</p>}
    <div className={styles.card}>
      <label>Select Warehouse<select aria-label="Select Warehouse" value={warehouse} onChange={event => setWarehouse(event.target.value)}>
        <option value="">Select Warehouse</option>{locations.filter(row => row.type === 'WAREHOUSE').map(row => <option value={row.id} key={row.id}>{row.name}</option>)}
      </select></label>
    </div>
    {selected && warehouse && <WarehouseVariants key={selected.id + warehouse} product={selected} warehouse={warehouse} region={region}/>}
  </section>;
}

function WarehouseVariants({ product, warehouse, region }: { product: Product; warehouse: string; region: Region }) {
  const router = useRouter();
  const [inventory, setInventory] = useState<Inventory>();
  const [newAttribute, setNewAttribute] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let current = true;
    inventoryRequest<Inventory>({ product: product.id, warehouse, region })
      .then(data => { if (current) setInventory(data); })
      .catch(error => { if (current) setError(error.message); });
    return () => { current = false; };
  }, [product.id, region, warehouse]);

  function edit(index: number, values: Partial<Variant>) {
    setInventory(current => current && ({ ...current, variants: current.variants.map((row, position) => position === index ? { ...row, ...values } : row) }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inventory || working) return;
    setError('');
    if (!inventory.attributes.length || !inventory.variants.length) {
      setError('Please provide at least one attribute and variant.');
      return;
    }
    setWorking(true);
    try {
      await inventoryRequest<Inventory>({ product: product.id, warehouse, region }, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inventory) });
      router.push('/dashboard/inventory/view/warehouse?warehouse_id=' + warehouse + (region === 'BD' ? '' : '&region=' + region));
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save the warehouse inventory.'); }
    finally { setWorking(false); }
  }

  return <form className={styles.card} onSubmit={save}>
    <h2>Update Variants for <span>{product.name}</span></h2>
    {error && <p className={styles.warning} role="alert">{error}</p>}
    {!inventory ? !error && <p role="status">Loading inventory…</p> : <fieldset disabled={working}>
      <div className={styles.actions}>
        <label>Attribute<input value={newAttribute} maxLength={80} onChange={event => setNewAttribute(event.target.value)}/></label>
        <button type="button" className="button secondary" disabled={!newAttribute.trim() || inventory.attributes.length >= 8} onClick={() => {
          const name = newAttribute.trim();
          if (inventory.attributes.includes(name)) return;
          setInventory({ ...inventory, attributes: [...inventory.attributes, name] });
          setNewAttribute('');
        }}><Plus size={16}/> Add Attribute</button>
      </div>
      <ul className={styles.attributes}>{inventory.attributes.map(attribute => <li key={attribute}>{attribute}
        <button type="button" className="button subtle" aria-label={'Remove attribute ' + attribute} onClick={() => setInventory({
          ...inventory, attributes: inventory.attributes.filter(value => value !== attribute),
          variants: inventory.variants.map(row => ({ ...row, attribute_values: Object.fromEntries(Object.entries(row.attribute_values).filter(([key]) => key !== attribute)) })),
        })}><Trash2 size={15}/></button></li>)}</ul>
      <div className={styles.table}><table>
        <thead><tr>{inventory.attributes.map(attribute => <th key={attribute}>{attribute}</th>)}<th>SKU</th><th>Regular Price</th><th>Sale Price</th><th>Action</th></tr></thead>
        <tbody>{inventory.variants.map((variant, index) => <tr key={index}>{inventory.attributes.map(attribute => <td key={attribute}>
          <input name={'attribute-' + attribute} aria-label={attribute + ' for variant ' + (index + 1)} required maxLength={80}
            value={variant.attribute_values[attribute] ?? ''} onChange={event => edit(index, { attribute_values: { ...variant.attribute_values, [attribute]: event.target.value } })}/></td>)}
          <td><input aria-label={'SKU for variant ' + (index + 1)} required maxLength={80} value={variant.sku} onChange={event => edit(index, { sku: event.target.value })}/></td>
          <td><input aria-label={'Regular price for variant ' + (index + 1)} type="number" required min="0" max="10000000" step="0.01"
            value={variant.regular_price} onChange={event => edit(index, { regular_price: Number(event.target.value) })}/></td>
          <td><input aria-label={'Sale price for variant ' + (index + 1)} type="number" required min="0" max={variant.regular_price} step="0.01"
            value={variant.sale_price} onChange={event => edit(index, { sale_price: Number(event.target.value) })}/></td>
          <td><button type="button" className="button subtle" aria-label={'Remove variant ' + (index + 1)} onClick={() => setInventory({
            ...inventory, variants: inventory.variants.filter((_, position) => position !== index),
          })}><Trash2 size={15}/></button></td></tr>)}</tbody>
      </table></div>
      <div className={styles.actions}>
        <button type="button" className="button secondary" disabled={!inventory.attributes.length || inventory.variants.length >= 60}
          onClick={() => setInventory({ ...inventory, variants: [...inventory.variants, { sku: '', attribute_values: {}, regular_price: 0, sale_price: 0 }] })}>
          <Plus size={16}/> Add Variant</button>
        <button className="button primary" disabled={working}>{working ? 'Please wait...' : 'Confirm Update'}</button>
      </div>
    </fieldset>}
  </form>;
}
