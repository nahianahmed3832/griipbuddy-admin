import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import './workspace.css';
import './catalog.css';
import './purchases.css';

export const metadata: Metadata = {
  title: { default: 'GriipBuddy Commerce Admin', template: '%s · GriipBuddy Admin' },
  description: 'Private GriipBuddy commerce workspace',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
