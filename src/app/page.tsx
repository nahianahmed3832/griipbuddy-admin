import { redirect } from 'next/navigation';
import { operationsEnabled, operationsOnly, publicSandbox, session } from '@/lib/api';
import { hasOperations, superAdmin } from '@/lib/sections';
import SignIn from './sign-in/page';

export const metadata = { title: { absolute: 'Griipbuddy Admin' } };

export default async function Index({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const auth = await session();
  if (auth && operationsEnabled() && hasOperations(auth.staff) && (operationsOnly() || !superAdmin(auth.staff))) redirect('/desk/operations');
  if (publicSandbox() || auth) redirect('/dashboard/overview');
  return <SignIn searchParams={searchParams}/>;
}
