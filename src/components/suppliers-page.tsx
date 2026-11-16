import Link from 'next/link';
import { Search } from 'lucide-react';
import { ApiError, url, type Session } from '@/lib/api';
import { param, perPage, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import { supplierFields, suppliersPath, supplierTypes } from '@/lib/supplier-fields';
import { supplierDirectory, supplierRecord, supplierWrite } from '@/lib/suppliers';
import type { Region } from '@/lib/sections';
import { purchasePage } from '@/lib/purchases';
import { PageHeading } from './dashboard';
import { DeleteSupplier, SupplierEditor } from './supplier-editor';
import { Badge, Table } from './tables';
import '@/app/purchases.css';

export async function SuppliersPage({ auth, region, q, id }: { auth: Session; region: Region; q: Query; id?: string }) {
  const add = supplierWrite(auth.staff, 'create');
  const edit = supplierWrite(auth.staff, 'update');
  const remove = supplierWrite(auth.staff, 'delete');
  const listUrl = url(suppliersPath, { region });
  const back = <Link className="button secondary" href={listUrl}>Back to suppliers</Link>;
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
