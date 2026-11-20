import type { Metadata } from 'next';
import { AcceptStaffSetup } from '@/components/staff-forms';
import '@/app/staff-access.css';

export const metadata: Metadata = { title: 'Set up staff access', referrer: 'no-referrer', robots: { index: false, follow: false } };

export default function StaffSetupPage() {
  return <main className="staff-setup">
    <section className="panel">
      <header className="staff-block"><p className="eyebrow">GRIIPBUDDY ADMIN</p><h1>Set up your staff account</h1>
        <p>Choose a password to activate your GriipBuddy staff account.</p></header>
      <AcceptStaffSetup/>
    </section>
  </main>;
}
