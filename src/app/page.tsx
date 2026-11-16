import { redirect } from 'next/navigation';
import { operationsEnabled, operationsOnly, publicSandbox, session } from '@/lib/api';
import { hasOperations, superAdmin } from '@/lib/sections';

export default async function Index() {
  const auth = await session();
  if (auth && operationsEnabled() && hasOperations(auth.staff) && (operationsOnly() || !superAdmin(auth.staff))) redirect('/desk/operations');
  redirect(publicSandbox() || auth ? '/desk/overview' : '/sign-in');
}
