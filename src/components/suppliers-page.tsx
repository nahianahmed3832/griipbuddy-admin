import Link from 'next/link';
import { ChevronLeft, Plus, Search } from 'lucide-react';
import { ApiError, url, type Session } from '@/lib/api';
import { param, perPage, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import { supplierFields, suppliersPath, supplierTypes } from '@/lib/supplier-fields';
import { supplierDirectory, supplierRecord, supplierWrite } from '@/lib/suppliers';
import type { Region } from '@/lib/sections';
import { purchasePage } from '@/lib/purchases';
import { PageHeading } from './dashboard';
import { DeleteSupplier, ProductionSupplierActions, SupplierEditor } from './supplier-editor';
import { RegistryPageSize } from './production-registry-size';
import { Badge, Table } from './tables';
import '@/app/purchases.css';
import styles from './production-catalog.module.css';
import design from './production-catalog-details.module.css';

export async function SuppliersPage({ auth, region, q, id, production = false }: { auth: Session; region: Region; q: Query; id?: string; production?: boolean }) {
  const add = supplierWrite(auth.staff, 'create');
  const edit = supplierWrite(auth.staff, 'update');
  const remove = supplierWrite(auth.staff, 'delete');
  const listUrl = url(param(q, 'from') === 'directory' ? '/dashboard/suppliers/all' : suppliersPath, { region });
  const back = <Link className="button secondary" href={listUrl}>Back to suppliers</Link>;
  const livePath = '/dashboard/suppliers/all';
  const liveList = url(livePath, { region });
  if (production && id) {
    if (id === 'new' ? !add : !edit) throw new ApiError(403);
    const selected = id === 'new' ? undefined : await supplierRecord(auth, id);
    return <section className={styles.page}>
      <header className={design.heading}><Link href={liveList} className={styles.outline} aria-label="Back"><ChevronLeft size={16}/></Link>
        <h1>{selected ? 'Update supplier' : 'Create supplier'}</h1></header>
      <SupplierEditor selected={selected} region={region} production inline/>
    </section>;
  }
  if (id === 'new') {
    if (!add) throw new ApiError(403);
    return <><PageHeading eyebrow="INVENTORY" title="Add supplier" description="Create a supplier record for purchases and receiving.">{back}</PageHeading>
      <SupplierEditor region={region} inline/>
    </>;
  }
  if (id) {
    const supplier = await supplierRecord(auth, id);
    return <><PageHeading eyebrow="INVENTORY / SUPPLIERS" title={supplier.name} description="Supplier details and payment terms.">
      {back}{edit && <SupplierEditor key={JSON.stringify(supplier)} selected={supplier} region={region}/>}
      {remove && <DeleteSupplier id={supplier.id} name={supplier.name} region={region}/>}
    </PageHeading><section className="panel padded"><dl className="details-grid">
      <div><dt>Supplier type</dt><dd><Badge value={supplier.type || 'Business'}/></dd></div>
      {supplierFields.filter(field => field.name !== 'name').map(field => <div key={field.name}><dt>{field.label}</dt><dd>{supplier[field.name] || '—'}</dd></div>)}
    </dl></section></>;
  }
  const search = (param(q, 'q') ?? '').trim().slice(0, 80);
  const term = search.toLowerCase();
  const type = supplierTypes.find(option => option === param(q, 'type'));
  const page = purchasePage(q);
  const suppliers = (await supplierDirectory(auth)).filter(row => (!type || row.type === type) && (!term ||
    [row.name, row.contact_id, row.email, row.phone].some(field => field.toLowerCase().includes(term))));
  if (production) {
    const sizes = ['20','40','60','80','100','all'];
    const requested = param(q, 'limit') ?? '20';
    const size = sizes.includes(requested) ? requested : '20';
    const limit = size === 'all' ? suppliers.length : Number(size);
    const currentPage = size === 'all' ? 1 : Math.min(page, Math.max(1, Math.ceil(suppliers.length / limit)));
    const start = (currentPage - 1) * limit;
    const current = suppliers.slice(start, start + limit);
    const headings = ['Sl No.', 'Name', 'Type', 'Email', 'Phone', 'Address', 'Actions'];
    const link = (page: number) => url(livePath, { region, q: search, type, page: String(page), limit: size });
    return <section className={styles.page}>
      <header className={styles.header}><h1>Suppliers ({suppliers.length})</h1>
        {add && <Link className={styles.primary} href={url('/dashboard/suppliers/create', { region })}><Plus size={16}/> Add supplier</Link>}
      </header>
      <form action={adminPath(livePath)} className="panel padded supplier-list-filters">
        <input type="hidden" name="region" value={region}/>
        <input type="hidden" name="limit" value={size}/>
        <label className="filter-label">Search suppliers<input name="q" maxLength={80} placeholder="Name, email, phone or reference" defaultValue={search}/></label>
        <label className="filter-label">Supplier type<select name="type" defaultValue={type || ''}><option value="">All types</option>
          {supplierTypes.map(value => <option value={value} key={value}>{value[0] + value.slice(1).toLowerCase()}</option>)}
        </select></label>
        <div className="page-actions"><button className="button primary">Apply filters</button><Link className="button secondary" href={liveList}>Reset</Link></div>
      </form>
      <div className={styles.tableBorder + ' ' + design.scroll} role="region" tabIndex={0} aria-label="Supplier directory"><table className={styles.table}>
        <thead><tr>{headings.map(heading => <th scope="col" key={heading}>{heading}</th>)}</tr></thead>
        <tbody>{current.map((row, index) => <tr key={row.id}>
          <td>{start + index + 1}</td><td><Link href={url(suppliersPath + '/' + row.id, { region, from: 'directory' })}>{row.name}</Link></td>
          <td>{row.type}</td><td>{row.email || 'N/A'}</td>
          <td>{row.phone || 'N/A'}</td><td>{row.address || 'N/A'}</td>
          <td>{(edit || remove) && <ProductionSupplierActions id={row.id} name={row.name} region={region}
            href={url('/dashboard/update-supplier/' + row.id, { region })} canEdit={edit} canDelete={remove}/>}</td>
        </tr>)}{!current.length && <tr><td colSpan={headings.length} className={styles.empty}>No suppliers found.</td></tr>}</tbody>
      </table></div>
      <nav className={design.pages} aria-label="Supplier pages">
        <RegistryPageSize current={size} choices={sizes} path={livePath} params={{ region, q: search, type }}/>
        <span>{current.length ? start + 1 : 0} - {start + current.length} of {suppliers.length}</span>
        {currentPage > 1 ? <Link className={styles.outline} href={link(currentPage - 1)}>Previous</Link> : <button className={styles.outline} disabled>Previous</button>}
        {start + limit < suppliers.length ? <Link className={styles.outline} href={link(currentPage + 1)}>Next</Link> : <button className={styles.outline} disabled>Next</button>}
      </nav>
    </section>;
  }
  const pageLink = (next: number) => url(suppliersPath, { region, q: search, type, page: next > 1 ? String(next) : undefined });
  const columns = ['Supplier', 'Type', 'Contact reference', 'Phone', 'Payment terms'].map(label => ({ label, fields: '' }));
  return <><PageHeading eyebrow="INVENTORY" title="Suppliers" description="Find suppliers and maintain their contact and payment details.">
    {add && <SupplierEditor region={region}/>}
  </PageHeading>
    {param(q, 'deleted') === '1' && <p className="notice" role="status">Supplier removed.</p>}
    <form action={adminPath(suppliersPath)} className="panel filters">
      <input type="hidden" name="region" value={region}/>
      <label className="search-input"><Search size={17} aria-hidden/><input aria-label="Search suppliers" name="q" maxLength={80} placeholder="Name, email, phone or reference" defaultValue={search}/></label>
      <label className="filter-label">Supplier type<select name="type" defaultValue={type || ''}><option value="">All types</option>
        {supplierTypes.map(value => <option value={value} key={value}>{value[0] + value.slice(1).toLowerCase()}</option>)}
      </select></label><button className="button primary">Apply filters</button><Link className="button secondary" href={listUrl}>Reset</Link>
    </form>
    <Table title="Suppliers" columns={columns} exportable={false} total={suppliers.length} page={page}
      rows={suppliers.slice((page - 1) * perPage, page * perPage).map(row => ({ id: row.id, href: url(suppliersPath + '/' + row.id, { region }),
        values: [row.name, row.type, row.contact_id, row.phone, row.default_payment_terms] }))}
      previous={page > 1 ? pageLink(page - 1) : undefined} next={page * perPage < suppliers.length ? pageLink(page + 1) : undefined}/>
  </>;
}
