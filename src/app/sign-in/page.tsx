import type { Metadata } from 'next';
import Image from 'next/image';
import { Package, ShieldCheck, ShoppingBag, Warehouse } from 'lucide-react';
import icon from '@/app/icon.png';
import { redirect } from 'next/navigation';
import { hosted, publicSandbox } from '@/lib/api';
import { adminPath } from '@/lib/paths';
import { SignInForm } from './sign-in-form';
import './sign-in.css';

export const metadata: Metadata = { title: 'Staff sign in' };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (publicSandbox()) redirect('/desk/overview');
  const { error } = await searchParams;
  const message = error === 'unavailable'
    ? 'Sign-in is temporarily unavailable. Please try again shortly.'
    : error === 'credentials' ? 'Check your staff email or phone number and password, then try again.' : undefined;

  return (
    <main className="sign-in-layout">
      <div className="sign-in-brand-panel">
        <header className="sign-in-brand">
          <Image src={icon} width={40} height={40} alt="" unoptimized />
          <span>GriipBuddy <small>Commerce Admin</small></span>
        </header>
        <div className="sign-in-intro">
          <p className="sign-in-eyebrow">Staff workspace</p>
          <p className="sign-in-display">Store operations, in one place.</p>
          <ul className="sign-in-areas">
            <li><ShoppingBag aria-hidden="true" /> Orders and fulfilment</li>
            <li><Package aria-hidden="true" /> Products and pricing</li>
            <li><Warehouse aria-hidden="true" /> Inventory and warehouses</li>
          </ul>
        </div>
        {hosted() && <div className="sign-in-environment">Development environment</div>}
      </div>
      <section className="sign-in-main" aria-labelledby="sign-in-heading">
        <div className="sign-in-card">
          <div className="sign-in-heading">
            <h1 id="sign-in-heading">Admin sign in</h1>
            <p>Use your GriipBuddy staff credentials to continue.</p>
          </div>
          <SignInForm action={adminPath('/api/session')} error={message} />
          <p className="sign-in-access"><ShieldCheck size={17} aria-hidden="true" /> For authorized staff only</p>
        </div>
      </section>
    </main>
  );
}
