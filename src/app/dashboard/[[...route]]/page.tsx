import { notFound, redirect } from 'next/navigation';
import { param, type Query } from '@/lib/data';
import { url } from '@/lib/api';
import { resolveLegacy } from '@/lib/legacy-destinations';

const forwarded = ['region', 'period', 'compare', 'from', 'to', 'locations', 'location', 'q', 'sku', 'page',
  'type', 'status', 'order', 'sort', 'show', 'currency', 'min', 'max', 'filter', 'category', 'groupBy'];

export default async function LegacyAdminRoute({ params, searchParams }: {
  params: Promise<{ route?: string[] }>; searchParams: Promise<Query>;
}) {
  const parts = (await params).route ?? [];
  const destination = resolveLegacy(parts);
  if (!destination) notFound();
  const q = await searchParams;
  if (!destination.path) redirect(url('/desk/workflows', { q: parts[0] }));
  const next = Object.fromEntries(forwarded.map(key => [key, param(q,key)?.slice(0,350)]));
  if (parts[0] === 'orders' && parts.length === 1 && next.status && !next.filter) next.filter = next.status;
  const path = parts[0] === 'overview' && param(q,'view') === 'classic' ? '/desk/overview/classic' : destination.path;
  redirect(url(path, { ...next, ...destination.query }));
}
