import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { arr, canWrite, mongoId, obj, str, type RecordData, type Session } from '@/lib/api';
import { numericCells, param, printable, valueAt, type Query } from '@/lib/data';
import { canManageAction, managedRead, type ManagedAction } from '@/lib/managed';
import type { Column, Region } from '@/lib/sections';
import { ManagedForm, type ManagedField } from './managed-form';
import { Table } from './tables';

export type Context = { auth: Session; market: string; path: string; q: Query; region: Region };
export const text = (name: string, label: string, value?: unknown, optional = false): ManagedField =>
  ({ name, label, value: str(value), optional });
export const number = (name: string, label: string, value?: unknown, optional = false): ManagedField =>
  ({ name, label, type: 'number', value: typeof value === 'number' ? value : undefined, optional });
export const json = (name: string, label: string, value?: unknown, hint?: string): ManagedField =>
  ({ name, label, type: 'json', value: value === undefined ? undefined : JSON.stringify(value, null, 2), optional: value === undefined, hint });
export const enabled = (value?: unknown): ManagedField => ({ name: 'enabled', label: 'Enabled', type: 'boolean', value: value === true });
export const date = (name: string, label: string, value: unknown, optional = false): ManagedField =>
  ({ name, label, type: 'datetime', value: str(value), optional });
export const windowFields = (record: RecordData = {}, optionalEnd = false) => [
  enabled(record.enabled), date('startsAt','Starts',record.startsAt), date('endsAt','Ends',record.endsAt, optionalEnd),
];
export const col = (label: string, fields: string, kind?: Column['kind']): Column => ({ label, fields, kind });
export const status = col('Status', 'enabled|status|state|catalog_state', 'badge');
export const revision = (record: RecordData) => typeof record.revision === 'number' ? record.revision : null;

export function editor(context: Context, action: ManagedAction, label: string, fields: ManagedField[], options: {
  id?: string; step?: string; revision?: number | null; primary?: boolean; description?: string;
} = {}) {
  if (!canWrite(context.auth.staff) || !canManageAction(context.auth, action)) return null;
  return <ManagedForm key={action + (options.step ?? '') + (options.revision ?? '')} action={action} label={label}
    market={context.market} fields={fields} {...options}/>;
}

export const afterId = (q: Query, key = 'after') => {
  const value = param(q, key) ?? '';
  return mongoId(value) ? value : undefined;
};
export const read = (context: Context, path: string) => managedRead(path, context.auth);

export function Grid({ title, data, columns, select, next }: {
  title: string; data: unknown; columns: Column[]; select?: (row: RecordData) => string; next?: string;
}) {
  return <>
    <Table title={title} columns={columns} rows={arr(obj(data).items).map(obj).map((row, index) => ({
      id: str(row._id) || str(row.id) || String(index), numeric: numericCells(row, columns), values: columns.map(column => printable(valueAt(row, column.fields), column.kind)),
      href: select?.(row),
    }))}/>
    {next && <div className="page-actions"><Link className="button secondary" href={next}>Next results <ArrowRight size={16}/></Link></div>}
  </>;
}

export function ReportValues({ title, description, data, labels }: {
  title: string; description: string; data: RecordData; labels: Record<string, string>;
}) {
  return <section className="panel"><div className="panel-header"><div><h2>{title}</h2><p>{description}</p></div></div>
    <dl className="details-grid padded">{Object.entries(labels).map(([key, label]) =>
      <div key={key}><dt>{label}</dt><dd>{printable(data[key]) || '—'}</dd></div>)}</dl>
  </section>;
}
