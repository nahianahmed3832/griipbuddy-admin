'use client';

import { Camera, ImagePlus, Minus, Package, Plus, ScanBarcode, Search, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { money, orderRequest, ordersPath, type ProductListing, type Variant } from '@/lib/website-orders';
import { OrderThumbnail } from './website-orders-table';

type CartLine = Variant & { quantity: number };
type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type BarcodeDetectorConstructor = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};
const formats = ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf'];

function CameraScan({ onCode, close }: { onCode: (code: string) => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onCode, close });
  const id = useId();
  const [error, setError] = useState('');
  useEffect(() => { callbacks.current = { onCode, close }; }, [onCode, close]);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    let disposed = false;
    let stream: MediaStream | undefined;
    let frame = 0;
    async function start() {
      const detector = (window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
      try {
        if (!detector || !navigator.mediaDevices?.getUserMedia) throw new Error();
        const available = (await detector.getSupportedFormats()).filter(format => formats.includes(format));
        if (!available.length) throw new Error();
        if (disposed) return;
        const scanner = new detector({ formats: available });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (disposed || !video.current) { stream.getTracks().forEach(track => track.stop()); return; }
        const feed = video.current;
        feed.srcObject = stream;
        await feed.play();
        async function scan() {
          if (disposed) return;
          try {
            const results = await scanner.detect(feed);
            if (disposed) return;
            if (results[0]?.rawValue) { callbacks.current.onCode(results[0].rawValue); return; }
          } catch {
            if (disposed) return;
            stream?.getTracks().forEach(track => track.stop());
            setError('Camera scanning stopped. Use a barcode reader or enter the code below.');
            return;
          }
          if (!disposed) frame = window.setTimeout(scan, 180);
        }
        frame = window.setTimeout(scan, 180);
      } catch {
        stream?.getTracks().forEach(track => track.stop());
        if (!disposed) setError('Camera scanning is unavailable. Use a barcode reader or enter the code below.');
      }
    }
    void start();
    return () => { disposed = true; window.clearTimeout(frame); stream?.getTracks().forEach(track => track.stop()); };
  }, []);
  return <dialog ref={dialog} className="form-dialog website-dialog" aria-labelledby={id}
    onCancel={event => { event.preventDefault(); close(); }}>
    <div className="website-dialog-header"><h2 id={id}>Scan Barcode</h2><button className="button secondary" aria-label="Close scanner" onClick={close}><X size={17}/></button></div>
    {error ? <p role="alert" className="notice warn">{error}</p> : <><p>Place the product barcode in front of your camera.</p>
      <video ref={video} muted playsInline className="website-camera" aria-label="Barcode camera preview"/></>}
    <button className="button secondary" onClick={close}>Enter barcode manually</button>
  </dialog>;
}

function proofData(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The payment screenshot could not be read.'));
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] || '');
    reader.readAsDataURL(file);
  });
}

export function WebsiteOrderCreate({ initial }: { initial: ProductListing }) {
  const router = useRouter();
  const barcodeInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const lookingUpBarcode = useRef(false);
  const searchRequest = useRef<AbortController>(null);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [products, setProducts] = useState(initial);
  const [barcode, setBarcode] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [searching, setSearching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [barcodeBusy, setBarcodeBusy] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [delivery, setDelivery] = useState('70');
  const [advance, setAdvance] = useState('');
  const [discount, setDiscount] = useState('');
  const [payment, setPayment] = useState('CASH_ON_DELIVERY');
  const [proof, setProof] = useState<File>();
  const [proofError, setProofError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => () => searchRequest.current?.abort(), []);
  const subtotal = Math.round(cart.reduce((sum, line) => sum + line.price * line.quantity, 0) * 100) / 100;
  const total = Math.round((subtotal + Number(delivery) - Number(discount)) * 100) / 100;
  const balance = Math.round((total - Number(advance)) * 100) / 100;
  const validation = Number(discount) > subtotal ? 'Discount cannot exceed the subtotal.'
    : balance < 0 ? 'Advance payment cannot exceed the order total.'
      : cart.length > 0 && total <= 0 ? 'The order total must be greater than zero.'
        : payment === 'FULL_PAYMENT' && balance !== 0 ? 'Full payment requires the entire order total as the amount paid.' : '';

  async function search(term: string, page = 1) {
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setSearching(true); setCatalogError('');
    try {
      const data = await orderRequest<ProductListing>('products', 'BD', { query: { q: term, page: String(page) }, signal: controller.signal });
      if (!controller.signal.aborted) { setProducts(data); setActiveQuery(term); }
    } catch (error) {
      if (!controller.signal.aborted) setCatalogError(error instanceof Error ? error.message : 'Could not load products.');
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }
  function add(variant: Variant) {
    if (!(variant.price > 0)) return;
    setCart(lines => {
      const existing = lines.find(line => line.id === variant.id);
      if (existing) return lines.map(line => line.id === variant.id ? { ...line, quantity: Math.min(999, line.quantity + 1) } : line);
      return lines.length >= 50 ? lines : [...lines, { ...variant, quantity: 1 }];
    });
  }
  function quantity(id: string, value: number) {
    setCart(lines => lines.map(line => line.id === id ? { ...line, quantity: Math.min(999, Math.max(1, value || 1)) } : line));
  }
  async function scan(value: string) {
    const code = value.trim();
    if (!code || lookingUpBarcode.current) return;
    lookingUpBarcode.current = true;
    setBarcodeBusy(true); setCatalogError('');
    try {
      const data = await orderRequest<ProductListing>('products', 'BD', { query: { barcode: code } });
      if (!data.rows[0]) throw new Error('No Bangladesh product matches this barcode.');
      if (!(data.rows[0].price > 0)) throw new Error('This product does not have a valid sale price.');
      add(data.rows[0]); setBarcode('');
    } catch (error) { setCatalogError(error instanceof Error ? error.message : 'Barcode lookup failed.'); }
    finally { lookingUpBarcode.current = false; setBarcodeBusy(false); barcodeInput.current?.focus(); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !cart.length || validation || proofError) return;
    submitting.current = true; setSaving(true); setError('');
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await orderRequest<{ _id: string; status: string }>('create', 'BD', { values: {
        products: cart.map(line => ({ product: line.product, variant: line.id, total_quantity: line.quantity })),
        customer_name: fields.name, customer_phone: fields.phone,
        delivery_address: { address: fields.address, division: fields.division, district: fields.district, thana: fields.thana },
        order_note: fields.notes, payment_type: payment, delivery_charge: Number(delivery), paid_amount: Number(advance),
        overall_discount_amount: Number(discount), sender: fields.sender, reference: fields.reference,
        proof: proof ? await proofData(proof) : undefined,
      } });
      router.push(ordersPath + '/' + result._id);
      router.refresh();
    } catch (error) {
      submitting.current = false; setSaving(false);
      setError(error instanceof Error && error.message ? error.message : 'Check All Orders before retrying.');
    }
  }
  return <div className="website-create-layout">
    <section className="panel website-create-panel">
      <div className="website-create-head"><h2>Search Product</h2>
        <button type="button" className="button secondary" onClick={() => setScanning(true)}><Camera size={16}/> Scan Barcode</button></div>
      <form className="website-input-row" onSubmit={e => { e.preventDefault(); void search(query.trim()); }}>
        <input aria-label="Search product by name or SKU" placeholder="Search by name or SKU" maxLength={100}
          value={query} onChange={e => setQuery(e.target.value)}/>
        <button className="button secondary" disabled={searching}><Search size={15}/> Search</button>
      </form>
      <form className="website-input-row" onSubmit={e => { e.preventDefault(); void scan(barcode); }}>
        <ScanBarcode size={18} aria-hidden="true"/>
        <input ref={barcodeInput} aria-label="Barcode" value={barcode} onChange={e => setBarcode(e.target.value)} maxLength={64}
          placeholder="Scan or enter a barcode, then press Enter"/>
        <button className="button secondary" disabled={barcodeBusy || !barcode.trim()}>{barcodeBusy ? 'Looking up…' : 'Add'}</button>
      </form>
      {catalogError && <p role="alert" className="notice warn">{catalogError}</p>}
      <div className="website-catalog" aria-busy={searching}>
        {!products.rows.length && <p className="muted">No matching products.</p>}
        {products.rows.map(variant => <div className="website-product-choice" key={variant.id}>
          <OrderThumbnail src={variant.image}/>
          <div><strong>{variant.name}</strong><small>{variant.sku}{variant.attributes && Object.values(variant.attributes).filter(Boolean).length > 0
            ? ' · ' + Object.values(variant.attributes).filter(Boolean).join(' / ') : ''}</small>
            <small>{variant.price > 0 ? money(variant.price, 'BDT') : 'Price unavailable'} · {variant.stock} available</small></div>
          <button className="button secondary" type="button" disabled={!(variant.price > 0) || cart.length >= 50 && !cart.some(line => line.id === variant.id)}
            aria-label={'Add ' + variant.sku} onClick={() => add(variant)}><Plus size={17}/></button>
        </div>)}
      </div>
      {products.total > products.size && <div className="pagination website-catalog-pages"><span>Page {products.page}</span><div>
        <button className="button secondary" disabled={searching || products.page <= 1} onClick={() => search(activeQuery, products.page - 1)}>Previous</button>
        <button className="button secondary" disabled={searching || products.page * products.size >= products.total} onClick={() => search(activeQuery, products.page + 1)}>Next</button>
      </div></div>}
      <section className="website-cart">
        <div className="website-create-head"><h2><Package size={17}/> Ordered Products</h2><span>Subtotal: <strong>{money(subtotal, 'BDT')}</strong></span></div>
        {cart.length === 0 ? <p className="muted">No items in cart.</p> : cart.map(line => <div key={line.id} className="website-cart-item">
          <div><strong>{line.sku}</strong><small>{line.name} · {money(line.price, 'BDT')} each</small>
            {line.stock < line.quantity && <small className="website-danger">May await stock</small>}</div>
          <div className="website-quantity">
            <button type="button" className="button secondary" aria-label={'Decrease ' + line.sku} onClick={() => quantity(line.id, line.quantity - 1)}
              disabled={line.quantity <= 1}><Minus size={14}/></button>
            <input aria-label={'Quantity for ' + line.sku} type="number" min={1} max={999} value={line.quantity}
              onChange={e => quantity(line.id, Math.floor(e.target.valueAsNumber))}/>
            <button type="button" className="button secondary" aria-label={'Increase ' + line.sku} onClick={() => quantity(line.id, line.quantity + 1)}
              disabled={line.quantity >= 999}><Plus size={14}/></button>
            <button type="button" className="button secondary" aria-label={'Remove ' + line.sku}
              onClick={() => setCart(lines => lines.filter(item => item.id !== line.id))}><Trash2 size={14}/></button>
          </div>
        </div>)}
      </section>
    </section>
    <form className="panel website-create-panel stack-form" onSubmit={submit}>
      <h2>Customer and delivery</h2>
      <fieldset disabled={saving} className="website-create-fields">
        <div className="website-form-grid">
          <label>Customer Name *<input name="name" required maxLength={120} autoComplete="off" placeholder="Customer name"/></label>
          <label>Customer Phone *<input name="phone" required type="tel" pattern="01[0-9]{9}" maxLength={11} placeholder="01XXXXXXXXX"/></label>
        </div>
        <label>Delivery Address *<textarea name="address" required maxLength={450} placeholder="House, road and area"/></label>
        <div className="website-form-grid three">
          <label>Division<input name="division" maxLength={80}/></label><label>District<input name="district" maxLength={80}/></label>
          <label>Thana<input name="thana" maxLength={80}/></label>
        </div>
        <label>Delivery Notes<textarea name="notes" maxLength={1000} placeholder="Optional delivery instructions"/></label>
        <section className="website-create-section">
          <h2>Payment</h2>
          <label>Payment Type<select value={payment} onChange={e => setPayment(e.target.value)}>
            <option value="CASH_ON_DELIVERY">Cash on Delivery</option><option value="FULL_PAYMENT">Full Payment (already received)</option>
          </select></label>
          <div className="website-form-grid three">
            {([{ label: 'Delivery Charge', value: delivery, set: setDelivery }, { label: 'Advance Payment', value: advance, set: setAdvance },
              { label: 'Discount', value: discount, set: setDiscount }]).map(field => <label key={field.label}>{field.label}
              <input type="number" step="0.01" min="0" max="10000000" value={field.value} placeholder="0" onChange={e => field.set(e.target.value)}/></label>)}
          </div>
        </section>
        <section className="website-create-section">
          <h2>Advance Payment Proof <small className="muted">(optional)</small></h2>
          <div className="website-form-grid">
            <label>Sender Number<input name="sender" type="tel" pattern="01[0-9]{9}" maxLength={11} placeholder="01XXXXXXXXX"/></label>
            <label>Transaction ID<input name="reference" maxLength={100} placeholder="TrxID"/></label>
          </div>
          <label className="website-file-label"><span><ImagePlus size={16}/> Upload Payment Screenshot</span>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => {
              const file = e.currentTarget.files?.[0];
              setProof(undefined); setProofError('');
              if (!file) return;
              if (file.size > 1_500_000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
                setProofError('Choose a PNG, JPEG or WebP screenshot up to 1.5 MB.'); return;
              }
              setProof(file);
            }}/></label>
          {(proof || proofError) && <button type="button" className="button secondary" onClick={() => {
            setProof(undefined); setProofError(''); if (fileInput.current) fileInput.current.value = '';
          }}>Remove screenshot</button>}
          {proofError && <p role="alert" className="notice warn">{proofError}</p>}
        </section>
        <dl className="website-totals">
          {[
            ['Subtotal', subtotal], ['Delivery Charge', Number(delivery)], ['Discount', -Number(discount)],
            ['Order Total', total], ['Advance Payment', -Number(advance)], ['Balance Due', balance],
          ].map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{money(Number(amount), 'BDT')}</dd></div>)}
        </dl>
      </fieldset>
      {validation && <p className="notice warn">{validation}</p>}
      {error && <p role="alert" className="notice warn">{error}</p>}
      <button type="submit" className="button primary" disabled={!cart.length || saving || !!validation || !!proofError}>
        {saving ? 'Creating order…' : 'Create Order (' + money(Math.max(0, balance), 'BDT') + ')'}</button>
    </form>
    {scanning && <CameraScan close={() => { setScanning(false); barcodeInput.current?.focus(); }}
      onCode={code => { setScanning(false); setBarcode(code); void scan(code); }}/>}
  </div>;
}
