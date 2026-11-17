import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { publicSandbox } from '@/lib/api';
import { adminPath } from '@/lib/paths';
import { SignInForm } from './sign-in-form';
import './production-fonts.css';
import './sign-in.css';

export const metadata: Metadata = {
  title: { absolute: 'Griipbuddy Admin' },
  description: 'Griipbuddy Admin Control Panel',
};

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (publicSandbox()) redirect('/desk/overview');

  const { error } = await searchParams;
  let message: string | undefined;
  if (error === 'credentials') message = 'Failed to login!';
  if (error === 'unavailable') message = 'Sign-in is temporarily unavailable. Please try again shortly.';

  return (
    <main className="production-sign-in">
      <section className="production-sign-in-card" aria-labelledby="sign-in-heading">
        <SignInForm action={adminPath('/api/session')} error={message} />
      </section>
    </main>
  );
}
