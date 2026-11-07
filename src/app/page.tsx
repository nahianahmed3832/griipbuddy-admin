import { redirect } from 'next/navigation';
import { publicSandbox, session } from '@/lib/api';

export default async function Index() {
  redirect(publicSandbox() || await session() ? '/desk/overview' : '/sign-in');
}
