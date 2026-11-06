import { redirect } from 'next/navigation';
import { session } from '@/lib/api';

export default async function Index() {
  redirect(await session() ? '/desk/overview' : '/sign-in');
}
