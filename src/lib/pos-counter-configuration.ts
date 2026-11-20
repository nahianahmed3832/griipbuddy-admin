import 'server-only';

import { ApiError, api, workspaceWritesEnabled, type Session } from './api';
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
  return process.env.GRIIP_ADMIN_POS_COUNTER === '1' && process.env.GRIIP_ADMIN_TARGET === 'fixture' &&
    superAdmin(auth.staff) && has(auth.staff, 'pos.view') &&
    (!write || workspaceWritesEnabled() && has(auth.staff, 'pos.update'));
}

export async function counterConfiguration(auth: Session) {
  if (!mayConfigureCounter(auth)) throw new ApiError(403, 'Counter configuration is unavailable.');
  return await api('/pos/counter/configuration', auth.token) as { outlets: CounterOutlet[] };
}
