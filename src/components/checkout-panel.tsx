import { ShieldCheck } from 'lucide-react';
import { checkoutRequest, type CheckoutSnapshot } from '@/lib/checkout';
import { ApiError, type Session } from '@/lib/api';
import { superAdmin } from '@/lib/sections';
import { PageHeading } from './dashboard';
import { CheckoutControls } from './checkout-controls';

export async function CheckoutPanel({ auth, mode }: {auth:Session;mode:'markets'|'payments'}) {
  if (!superAdmin(auth.staff)) throw new ApiError(403);
  let snapshot:CheckoutSnapshot | undefined;
  try {
    const response=await checkoutRequest();
    if (response.ok) snapshot=await response.json() as CheckoutSnapshot;
  } catch { /* Show the disconnected state on the page. */ }
  return <>
    <PageHeading eyebrow={mode === 'markets' ? 'MARKETS / STOREFRONT' : 'PAYMENTS / CHECKOUT'}
      title={mode === 'markets' ? 'Storefront controls' : 'Checkout methods'}
      description={mode === 'markets' ? 'Configure shipping coverage and the international catalog fallback.' : 'Manage available methods by market and review manual payment evidence.'}/>
    <div className="notice"><ShieldCheck size={18}/> Sandbox environment · production activation requires a verified payment and inventory integration.</div>
    {snapshot ? <CheckoutControls data={snapshot} mode={mode}/> : <section className="panel"><div className="panel-header"><div><h2>Checkout sandbox disconnected</h2>
      <p>Connect the isolated checkout service to edit settings or review receipts.</p></div></div></section>}
  </>;
}
