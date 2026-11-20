import { notFound, redirect } from 'next/navigation';
import { DeskWorkspace } from '@/components/desk-workspace';
import { param, type Query } from '@/lib/data';
import { url } from '@/lib/api';
import { resolveLegacy } from '@/lib/legacy-destinations';

export const dynamic = 'force-dynamic';

export const metadata = { title: { absolute: 'Griipbuddy Admin' } };

export default async function DashboardRoute({ params, searchParams }: {
  params: Promise<{ route?: string[] }>; searchParams: Promise<Query>;
}) {
  const parts = (await params).route ?? [];
  const destination = resolveLegacy(parts);
  if (!destination) notFound();
  const query = await searchParams;
  if (!parts.length) redirect(url('/dashboard/overview', { region: param(query, 'region') }));

  const workspacePath = parts[0] === 'overview' && param(query, 'view') === 'classic'
    ? '/desk/overview/classic'
    : destination.path;
  const [, section, ...view] = workspacePath.slice(1).split('/');
  const viewQuery: Query = { ...query, ...destination.query };
  if (parts.length === 1 && parts[0] === 'orders' && !param(query, 'filter')) {
    viewQuery.filter = param(query, 'status')?.slice(0, 350);
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach(item => search.append(key, item));
    else if (typeof value === 'string') search.append(key, value);
  }

  return <DeskWorkspace
    params={Promise.resolve({ section, view })}
    searchParams={Promise.resolve(viewQuery)}
    production={{ path: '/dashboard/' + parts.join('/'), query: search.toString() }}
  />;
}
