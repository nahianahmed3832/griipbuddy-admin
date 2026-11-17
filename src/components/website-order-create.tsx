'use client';

import { Camera, ChevronDown, ImagePlus, Minus, Package, Plus, ScanBarcode, ScanLine, Search, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { money, orderRequest, ordersPath, type ProductListing, type Variant, type WebsiteOrderDraft } from '@/lib/website-orders';
import { OrderThumbnail } from './website-orders-table';
import productionStyles from './production-website-order-editor.module.css';

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

export function WebsiteOrderCreate({ initial, draft, productionLayout = false }: {
  initial: ProductListing; draft?: WebsiteOrderDraft; productionLayout?: boolean;
}) {
  const router = useRouter();
  const barcodeInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const lookingUpBarcode = useRef(false);
  const searchRequest = useRef<AbortController>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [products, setProducts] = useState(initial);
  const [barcode, setBarcode] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [searching, setSearching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMode, setScanMode] = useState(false);
  const [barcodeBusy, setBarcodeBusy] = useState(false);
  const [cart, setCart] = useState<CartLine[]>(draft?.products ?? []);
  const [delivery, setDelivery] = useState(String(draft?.delivery_charge ?? 70));
  const [advance, setAdvance] = useState(draft ? String(draft.paid_amount) : '');
  const [discount, setDiscount] = useState(draft ? String(draft.total_discount) : '');
  const [payment, setPayment] = useState<string>(draft?.payment_type ?? 'CASH_ON_DELIVERY');
  const [proof, setProof] = useState<File>();
  const [proofError, setProofError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const browseAction = draft ? 'draft-products' : 'products';

  useEffect(() => () => {
    clearTimeout(searchTimer.current);
    searchRequest.current?.abort();
  }, []);
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
      const data = await orderRequest<ProductListing>(browseAction, 'BD', { query: { q: term, page: String(page) }, signal: controller.signal });
      if (!controller.signal.aborted) { setProducts(data); setActiveQuery(term); }
    } catch (error) {
      if (!controller.signal.aborted) setCatalogError(error instanceof Error ? error.message : 'Could not load products.');
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }
  function searchWhileTyping(value: string) {
    setQuery(value);
    clearTimeout(searchTimer.current);
    searchRequest.current?.abort();
    searchTimer.current = setTimeout(() => { void search(value.trim()); }, 300);
  }
  function add(variant: Variant) {
    if (!(variant.price > 0)) return;
    setCart(lines => {
      const existing = lines.find(line => line.id === variant.id);
      if (existing) return lines.map(line => line.id === variant.id ? { ...line, quantity: Math.min(999, line.quantity + 1) } : line);
      const snapshot = draft?.products.find(line => line.id === variant.id);
      return lines.length >= 50 ? lines : [...lines, { ...variant, price: snapshot?.price ?? variant.price, quantity: 1 }];
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
      const data = await orderRequest<ProductListing>(browseAction, 'BD', { query: { barcode: code } });
      if (!data.rows[0]) throw new Error('No Bangladesh product matches this barcode.');
      if (!(data.rows[0].price > 0)) throw new Error('This product does not have a valid sale price.');
      add(data.rows[0]); setBarcode('');
    } catch (error) { setCatalogError(error instanceof Error ? error.message : 'Barcode lookup failed.'); }
    finally { lookingUpBarcode.current = false; setBarcodeBusy(false); barcodeInput.current?.focus(); }
  }
  function selectProof(file?: File) {
    setProof(undefined);
    setProofError('');
    if (!file) return;
    if (file.size > 1_500_000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setProofError('Choose a PNG, JPEG or WebP screenshot up to 1.5 MB.');
      return;
    }
    setProof(file);
  }
  function clearProof() {
    setProof(undefined);
    setProofError('');
    if (fileInput.current) fileInput.current.value = '';
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !cart.length || validation || proofError) return;
    submitting.current = true; setSaving(true); setError('');
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await orderRequest<{ _id: string; status: string }>(draft ? 'draft' : 'create', 'BD', {
        query: draft ? { id: draft.id } : undefined, values: {
        revision: draft?.revision,
        products: cart.map(line => ({ product: line.product, variant: line.id, total_quantity: line.quantity })),
        customer_name: fields.name, customer_phone: fields.phone,
        delivery_address: { address: fields.address, division: fields.division ?? '', district: fields.district ?? '', thana: fields.thana ?? '' },
        order_note: fields.notes, payment_type: payment, delivery_charge: Number(delivery), paid_amount: Number(advance),
        overall_discount_amount: Number(discount), sender: fields.sender, reference: fields.reference,
        proof: proof ? await proofData(proof) : undefined,
      } });
      if (productionLayout) router.replace('/dashboard/orders');
      else router.push(ordersPath + '/' + result._id);
      router.refresh();
    } catch (error) {
      submitting.current = false; setSaving(false);
      setError(error instanceof Error && error.message ? error.message : 'Check All Orders before retrying.');
    }
  }
  if (productionLayout) {
    const styles = productionStyles;
    const full = !!draft;
    const totals: [string, number][] = full ? [
      ['Sub Total:', subtotal], ['Delivery Charge:', Number(delivery)], ['Discount:', Number(discount)], ['Advance:', Number(advance)], ['Grand Total:', balance],
    ] : [['Subtotal', subtotal], ['Delivery Charge', Number(delivery)], ['Discounts', Number(discount)],
      ['Advanced', Number(advance)], ['Grand Total', balance]];
    const attributes = (value: Variant['attributes']) => Object.entries(value || {}).map(([key,val]) => key + ': ' + val).join(' • ');
    const productPrice = (variant: Variant) => variant.salePrice ?? variant.regularPrice ?? variant.price;
    const searchLabel = full ? 'Search by sku...' : 'Search by name, sku...';
    const moneyFields = ([
      { label: 'Delivery Charge', value: delivery, set: setDelivery },
      { label: full ? 'Advance Payment' : 'Advances Payment', value: advance, set: setAdvance, readOnly: draft?.paymentLocked },
      { label: 'Discount', value: discount, set: setDiscount },
    ]);
    return <div className={styles.layout} data-edit={full}>
      <section className={styles.panel} aria-label="Product editor">
        <div className={styles.catalogControls}>
          {!full && <div className={styles.searchHeading}><label htmlFor="production-product-search">Search Product</label>
            <button className={scanMode ? styles.primary : styles.outline} type="button" aria-pressed={scanMode}
              onClick={() => { setScanMode(!scanMode); if (!scanMode) barcodeInput.current?.focus(); }}>
              <ScanLine size={16}/> {scanMode ? 'Scanning On' : 'Scan Barcode'}
            </button>
          </div>}
          <input id="production-product-search" aria-label={full ? 'Search by SKU' : 'Search product by name or SKU'}
            placeholder={searchLabel} value={query} maxLength={100} onChange={event => searchWhileTyping(event.target.value)}/>
          {!full && <form className={styles.barcode} onSubmit={event => { event.preventDefault(); void scan(barcode); }}>
            <div><ScanLine size={16} aria-hidden/><input ref={barcodeInput} aria-label="Barcode" value={barcode}
              onChange={event => setBarcode(event.target.value)} maxLength={64} placeholder="Scan or enter a barcode, then Enter"/></div>
            <button className={styles.outline} type="submit" disabled={barcodeBusy || !barcode.trim()}>{barcodeBusy ? 'Looking up…' : 'Add'}</button>
          </form>}
          {scanMode && <p className={styles.scanHint}>Scan mode is on — scan a unit barcode to add its product to the cart.</p>}
          {catalogError && <p className="notice warn" role="alert">{catalogError}</p>}
          <div className={styles.catalog} aria-busy={searching}>
            {!products.rows.length && <p className={styles.empty}>No variants found (try typing)</p>}
            {products.rows.map(variant => <div className={styles.result} key={variant.id}>
              <OrderThumbnail src={variant.image}/>
              <div className={styles.productText}>
                <strong>{variant.name} {full ? '- ' : ''}({variant.sku})</strong>
                {variant.attributes && <small>{attributes(variant.attributes)}</small>}
                <small>{full ? 'Sale Price: ' + productPrice(variant) + ', Regular Price: ' + (variant.regularPrice ?? variant.price)
                  : 'Price: ' + productPrice(variant)}</small>
                {!full && <small>Stock: {variant.stock}</small>}
              </div>
              <button type="button" className={styles.outline} aria-label={'Add ' + variant.sku}
                disabled={!(variant.price > 0) || cart.length >= 50 && !cart.some(line => line.id === variant.id)} onClick={() => add(variant)}>
                <Plus size={16}/>
              </button>
            </div>)}
            {products.total > products.size && <div className={styles.pages}>
              <button type="button" className={styles.outline} disabled={searching || products.page <= 1}
                onClick={() => search(activeQuery, products.page - 1)}>Previous</button>
              <button type="button" className={styles.outline} disabled={searching || products.page * products.size >= products.total}
                onClick={() => search(activeQuery, products.page + 1)}>Next</button>
            </div>}
          </div>
        </div>
        <section className={styles.cart}>
          <header><h2>Ordered Products</h2>{!full && <span>Sub Total: {subtotal}</span>}</header>
          {!cart.length && <p className={styles.empty}>No items in cart</p>}
          {!!cart.length && <div className={styles.cartLines}>{cart.map(line => <article key={line.id}>
            <header><strong>{line.name} - {line.sku}</strong>
              <button className={full ? styles.danger : styles.plain} type="button" aria-label={'Remove ' + line.sku}
                onClick={() => setCart(lines => lines.filter(item => item.id !== line.id))}><X size={16}/></button>
            </header>
            {!!line.attributes && <small>{attributes(line.attributes)}</small>}
            <div className={styles.quantities}>
              <button type="button" className={styles.outline} aria-label={'Decrease ' + line.sku}
                onClick={() => quantity(line.id, line.quantity - 1)} disabled={line.quantity <= 1}><Minus size={16}/></button>
              <output aria-label={'Quantity for ' + line.sku}>{line.quantity}</output>
              <button type="button" className={styles.outline} aria-label={'Increase ' + line.sku}
                onClick={() => quantity(line.id, line.quantity + 1)} disabled={line.quantity >= 999}><Plus size={16}/></button>
              <span>{(line.quantity * line.price).toFixed(2)}</span>
            </div>
          </article>)}</div>}
        </section>
      </section>
      <form className={styles.panel} aria-label={full ? 'Edit order' : 'Create order'} onSubmit={submit}>
        <fieldset className={styles.orderFields} disabled={saving}>
          <div className={styles.two}>
            <label>Customer Name *<input name="name" required maxLength={120} autoComplete="off"
              placeholder={full ? undefined : 'Arif Khan'} defaultValue={draft?.customer_name}/></label>
            <label>Customer Phone *<input name="phone" required type="tel" pattern="01[0-9]{9}" maxLength={11}
              placeholder={full ? undefined : '01XXXXXXXXX'} defaultValue={draft?.customer_phone}/></label>
          </div>
          {full ? <>
            <div className={styles.two}>
              <label>Division *<input name="division" maxLength={80} defaultValue={draft?.delivery_address?.division}/></label>
              <label>District *<input name="district" maxLength={80} defaultValue={draft?.delivery_address?.district}/></label>
              <label>Thana<input name="thana" maxLength={80} defaultValue={draft?.delivery_address?.thana}/></label>
              <label>Local Address *<input name="address" required maxLength={450} defaultValue={draft?.delivery_address?.address}/></label>
            </div>
            <label>Order Note<textarea name="notes" maxLength={1000} defaultValue={draft?.order_note}/></label>
          </> : <>
            <hr/>
            <label>Delivery Address *<textarea name="address" required maxLength={450} placeholder="House 12, Road 5, Dhanmondi"/></label>
            <label>Delivery Notes<textarea name="notes" maxLength={1000} placeholder="Enter Delivery Note (Optional)"/></label>
            <hr/>
          </>}
          <label>Payment Type<span className={styles.select}>
            <select value={payment} disabled={draft?.paymentLocked} onChange={event => setPayment(event.target.value)}>
              <option value="CASH_ON_DELIVERY">Cash on Delivery</option><option value="FULL_PAYMENT">Full Payment</option>
            </select><ChevronDown size={15} aria-hidden/>
          </span></label>
          <div className={full ? styles.single : styles.three}>{moneyFields.map(field => <label key={field.label}>{field.label}
            <input type="number" step="0.01" min="0" max="10000000" value={field.value} placeholder="0" readOnly={field.readOnly}
              onChange={event => field.set(event.target.value)}/>
          </label>)}</div>
          <hr/>
          <section className={styles.proof}>
            <p>Advance Payment Proof <span>(Optional)</span></p>
            <div className={styles.two}>
              <label>Sender Number<input name="sender" type="tel" pattern="01[0-9]{9}" maxLength={11}
                placeholder="01XXXXXXXXX" defaultValue={draft?.sender} readOnly={draft?.paymentLocked}/></label>
              <label>Transaction ID<input name="reference" maxLength={100} placeholder="TrxID" defaultValue={draft?.reference}
                readOnly={draft?.paymentLocked}/></label>
            </div>
            {draft?.proofPresent ? <p className={styles.empty}>Existing payment proof is retained.</p> : <>
              <label className={styles.upload}><ImagePlus size={16}/>Upload Payment Screenshot
                <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => selectProof(event.currentTarget.files?.[0])}/>
              </label>
              {proof && <small>{proof.name}</small>}
            </>}
            {(proof || proofError) && <button type="button" className={styles.outline} onClick={clearProof}>Remove screenshot</button>}
            {proofError && <p role="alert" className="notice warn">{proofError}</p>}
          </section>
          {!full && <hr/>}
          <dl className={styles.totals}>{totals.map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{amount}</dd></div>)}</dl>
        </fieldset>
        {validation && <p className="notice warn">{validation}</p>}
        {error && <p role="alert" className="notice warn">{error}</p>}
        <button type="submit" className={styles.submit} disabled={!cart.length || saving || !!validation || !!proofError}>
          {saving ? full ? 'Saving order…' : 'Creating order…' : full ? 'Save Changes (' + balance + ')' : 'Create Order (৳ ' + balance + ')'}
        </button>
      </form>
    </div>;
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
            {line.stock < line.quantity && <small className="website-danger">{draft ? 'Check availability at save' : 'May await stock'}</small>}</div>
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
          <label>Customer Name *<input name="name" required maxLength={120} autoComplete="off" placeholder="Customer name" defaultValue={draft?.customer_name}/></label>
          <label>Customer Phone *<input name="phone" required type="tel" pattern="01[0-9]{9}" maxLength={11} placeholder="01XXXXXXXXX" defaultValue={draft?.customer_phone}/></label>
        </div>
        <label>Delivery Address *<textarea name="address" required maxLength={450} placeholder="House, road and area" defaultValue={draft?.delivery_address?.address}/></label>
        <div className="website-form-grid three">
          <label>Division<input name="division" maxLength={80} defaultValue={draft?.delivery_address?.division}/></label><label>District<input name="district" maxLength={80} defaultValue={draft?.delivery_address?.district}/></label>
          <label>Thana<input name="thana" maxLength={80} defaultValue={draft?.delivery_address?.thana}/></label>
        </div>
        <label>Delivery Notes<textarea name="notes" maxLength={1000} placeholder="Optional delivery instructions" defaultValue={draft?.order_note}/></label>
        <section className="website-create-section">
          <h2>Payment</h2>
          <label>Payment Type<select aria-label="Payment Type" value={payment} disabled={draft?.paymentLocked} onChange={e => setPayment(e.target.value)}>
            <option value="CASH_ON_DELIVERY">Cash on Delivery</option><option value="FULL_PAYMENT">Full Payment (already received)</option>
          </select></label>
          <div className="website-form-grid three">
            {([{ label: 'Delivery Charge', value: delivery, set: setDelivery }, { label: 'Advance Payment', value: advance, set: setAdvance, readOnly: draft?.paymentLocked },
              { label: 'Discount', value: discount, set: setDiscount }]).map(field => <label key={field.label}>{field.label}
              <input type="number" step="0.01" min="0" max="10000000" value={field.value} placeholder="0" readOnly={field.readOnly} onChange={e => field.set(e.target.value)}/></label>)}
          </div>
        </section>
        <section className="website-create-section">
          <h2>Advance Payment Proof <small className="muted">(optional)</small></h2>
          <div className="website-form-grid">
            <label>Sender Number<input name="sender" type="tel" pattern="01[0-9]{9}" maxLength={11} placeholder="01XXXXXXXXX" defaultValue={draft?.sender} readOnly={draft?.paymentLocked}/></label>
            <label>Transaction ID<input name="reference" maxLength={100} placeholder="TrxID" defaultValue={draft?.reference} readOnly={draft?.paymentLocked}/></label>
          </div>
          {draft?.proofPresent ? <p className="muted">Existing payment proof is retained.</p> : <label className="website-file-label"><span><ImagePlus size={16}/> Upload Payment Screenshot</span>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => selectProof(e.currentTarget.files?.[0])}/></label>}
          {(proof || proofError) && <button type="button" className="button secondary" onClick={clearProof}>Remove screenshot</button>}
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
        {saving ? (draft ? 'Saving order…' : 'Creating order…') : draft ? 'Save order changes' : 'Create Order (' + money(Math.max(0, balance), 'BDT') + ')'}</button>
    </form>
    {scanning && <CameraScan close={() => { setScanning(false); barcodeInput.current?.focus(); }}
      onCode={code => { setScanning(false); setBarcode(code); void scan(code); }}/>}
  </div>;
}
