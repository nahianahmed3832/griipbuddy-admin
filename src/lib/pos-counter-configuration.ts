import 'server-only';

import { ApiError, managedCounterConfigured, workspaceWritesEnabled, type Session } from './api';
import { forwardCounter } from './counter-pos';
import { has, superAdmin } from './sections';

export type CounterOutlet = {
  location: string;
  market: 'BD' | 'US';
  currency: 'BDT' | 'USD';
  outletName: string;
  revision: number;
  enabled: boolean;
  businessName: string;
  registerLabel: string | null;
  shiftRequired: boolean;
};

export function mayConfigureCounter(auth: Session, write = false) {
  const fixture = process.env.GRIIP_ADMIN_POS_COUNTER === '1' && process.env.GRIIP_ADMIN_TARGET === 'fixture' &&
    (!write || workspaceWritesEnabled());
  return (fixture || managedCounterConfigured()) && !auth.staff.passwordRotationRequired &&
    superAdmin(auth.staff) && has(auth.staff, 'pos.view') && (!write || has(auth.staff, 'pos.update'));
}

export async function counterConfiguration(auth: Session) {
  if (!mayConfigureCounter(auth)) throw new ApiError(403, 'Counter configuration is unavailable.');
  return await forwardCounter(auth, '/configuration') as { outlets: CounterOutlet[] };
}
