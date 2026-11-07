import { redirect } from 'next/navigation';
import { publicSandbox, session } from '@/lib/api';

export default async function Index() {
  if (publicSandbox()) redirect('/admin/desk/overview');
  redirect(await session() ? '/desk/overview' : '/sign-in');
}
