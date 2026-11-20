'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { catalogRequest } from '@/lib/connected-catalog-client';
import type { MarketplaceCheckoutPolicy, MarketplaceDeliveryZone, MarketplaceSeller,
  MarketplaceWorkspaceCommand } from '@/lib/connected-marketplace-contract';
import type { Region } from '@/lib/sections';
import styles from './marketplace-workspace.module.css';

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

function MarketplaceAction({ region, label, formName = label, build, success, children }: {
  region: Region;
  label: string;
  formName?: string;
  build: (fields: FormData) => MarketplaceWorkspaceCommand;
  success: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean }>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running.current) return;
    running.current = true;
    setPending(true);
    setFeedback(undefined);
    try {
      const form = event.currentTarget;
      await catalogRequest(build(new FormData(form)), region);
      const confirmation = form.elements.namedItem('confirmed');
      if (confirmation instanceof HTMLInputElement) confirmation.checked = false;
      setFeedback({ message: success });
      router.refresh();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'The marketplace change could not be saved.', error: true });
    } finally {
      setPending(false);
      running.current = false;
    }
  }

  return <form className={styles.action} aria-label={formName} method="post" onSubmit={submit}>
    <fieldset disabled={!ready || pending}>
      {children}
      <button type="submit" className="button primary">{pending ? 'Saving…' : label}</button>
    </fieldset>
    {feedback && <p className={feedback.error ? 'notice warn' : 'notice'} role={feedback.error ? 'alert' : 'status'}>
      {feedback.message}
    </p>}
  </form>;
}

function Confirmation({ children }: { children: string }) {
  return <label className={styles.check}><input type="checkbox" name="confirmed" required/>{children}</label>;
}

export function SellerActions({ region, market, seller }: {
  region: Region;
  market: string;
  seller: Pick<MarketplaceSeller, 'id' | 'published' | 'grantStatus'>;
}) {
  const { id: sellerId, published, grantStatus } = seller;
  const grant = grantStatus === 'APPROVED' ? 'DENIED' : 'APPROVED';
  return <div className={styles.sellerActions}>
    {grantStatus && <div className={styles.sellerAction}>
      <MarketplaceAction region={region} label={grant === 'APPROVED' ? `Approve in ${market}` : `Revoke access in ${market}`}
        success={`Seller access updated for ${market}.`}
        build={() => ({ action: 'marketplace.seller.grant', input: { sellerId, status: grant } })}>
        <Confirmation>{`Confirm this seller’s access change for ${market}.`}</Confirmation>
      </MarketplaceAction>
      {grantStatus === 'PENDING' && <MarketplaceAction region={region} label={`Deny in ${market}`}
        success={`Seller request denied for ${market}.`}
        build={() => ({ action: 'marketplace.seller.grant', input: { sellerId, status: 'DENIED' } })}>
        <Confirmation>{`Confirm denial of this seller’s request for ${market}.`}</Confirmation>
      </MarketplaceAction>}
    </div>}
    <div className={styles.sellerAction}>
      <MarketplaceAction region={region} label={published ? 'Unpublish shop globally' : 'Publish shop globally'}
        success={published ? 'Shop unpublished in all markets.' : 'Shop publication enabled globally.'}
        build={() => ({ action: 'marketplace.seller.publish', input: { sellerId, published: !published } })}>
        <Confirmation>{`Confirm ${published ? 'unpublishing' : 'publishing'} this shop across all markets.`}</Confirmation>
      </MarketplaceAction>
    </div>
  </div>;
}

function fieldText(fields: FormData, name: string) {
  const value = fields.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function minorUnits(fields: FormData, name: string, label: string, max: number) {
  const value = fieldText(fields, name);
  if (!value) return null;
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) throw new Error(`Enter ${label} with up to two decimal places.`);
  const [whole, fraction = ''] = value.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (amount > max) throw new Error(`Enter ${label} of ${max / 100} or less.`);
  return amount;
}

export function CheckoutPolicyActions({ region, market, policy, orderIntake }: {
  region: Region;
  market: string;
  policy: MarketplaceCheckoutPolicy | null;
  orderIntake: boolean;
}) {
  return <div className={styles.configActions}>
    <details className={styles.manage}>
      <summary>{policy ? 'Edit checkout policy' : 'Create checkout policy'}</summary>
      <MarketplaceAction key={policy?.revision ?? 'new'} region={region} label="Save checkout policy" success="Checkout policy saved."
        build={fields => ({ action: 'marketplace.policy.save', input: {
          revision: policy?.revision ?? null,
          enabled: fields.has('enabled'),
          codEnabled: fields.has('codEnabled'),
          taxBasisPoints: minorUnits(fields, 'tax', 'a tax rate', 10_000),
          taxLabel: fieldText(fields, 'taxLabel'),
        } })}>
        <div className={styles.fields}>
          <label>Merchandise tax rate (%)<input name="tax" type="number" min="0" max="100" step="0.01"
            defaultValue={policy?.taxBasisPoints == null ? '' : policy.taxBasisPoints / 100}/></label>
          <label>Tax label<input name="taxLabel" defaultValue={policy?.taxLabel ?? ''} maxLength={80}/></label>
        </div>
        <label className={styles.check}><input type="checkbox" name="codEnabled" defaultChecked={policy?.codEnabled}/>
          Allow cash on delivery</label>
        <label className={styles.check}><input type="checkbox" name="enabled" defaultChecked={policy?.enabled}
          disabled={!orderIntake && !policy?.enabled}/>Enable checkout for {market}</label>
        {!orderIntake && <p className="muted">Order intake is closed for this release.</p>}
      </MarketplaceAction>
    </details>
    {policy?.enabled && <details className={styles.manage}>
      <summary>Pause new orders</summary>
      <MarketplaceAction region={region} label={`Pause new orders in ${market}`} success="New orders paused."
        build={() => ({ action: 'marketplace.policy.pause', input: {} })}>
        <Confirmation>{`Confirm pausing new orders in ${market}.`}</Confirmation>
      </MarketplaceAction>
    </details>}
  </div>;
}

export function DeliveryZoneAction({ region, currency, zone }: {
  region: Region;
  currency: string;
  zone?: MarketplaceDeliveryZone;
}) {
  return <MarketplaceAction key={zone?.revision ?? 'new'} region={region} label="Save delivery option" success="Delivery option saved."
    formName={zone ? `Edit ${zone.districtLabel} ${zone.label}` : 'New delivery option'}
    build={fields => ({ action: 'marketplace.delivery.save', input: {
      revision: zone?.revision ?? null,
      district: zone?.district ?? fieldText(fields, 'district'),
      districtLabel: fieldText(fields, 'districtLabel'),
      method: zone?.method ?? fieldText(fields, 'method'),
      label: fieldText(fields, 'label'),
      guidance: fieldText(fields, 'guidance'),
      chargeMinor: minorUnits(fields, 'charge', 'a delivery charge', 10_000_000),
      enabled: fields.has('enabled'),
      codEligible: fields.has('codEligible'),
    } })}>
    <div className={styles.fields}>
      {!zone && <>
        <label>District code<input name="district" placeholder="dhaka" pattern="[a-z][a-z\-]{1,39}" maxLength={40} required/></label>
        <label>Method code<input name="method" placeholder="standard" pattern="[a-z][a-z0-9\-]{1,39}" maxLength={40} required/></label>
      </>}
      <label>District name<input name="districtLabel" defaultValue={zone?.districtLabel} minLength={2} maxLength={80} required/></label>
      <label>Option name<input name="label" defaultValue={zone?.label} minLength={2} maxLength={100} required/></label>
      <label>Charge ({currency})<input name="charge" type="number" min="0" max="100000" step="0.01"
        defaultValue={zone?.chargeMinor == null ? '' : zone.chargeMinor / 100}/></label>
    </div>
    <label>Customer delivery guidance<textarea name="guidance" defaultValue={zone?.guidance ?? ''} maxLength={500} rows={2}/></label>
    <label className={styles.check}><input type="checkbox" name="enabled" defaultChecked={zone?.enabled}/>Enable this delivery option</label>
    <label className={styles.check}><input type="checkbox" name="codEligible" defaultChecked={zone?.codEligible}/>Allow cash on delivery</label>
  </MarketplaceAction>;
}
