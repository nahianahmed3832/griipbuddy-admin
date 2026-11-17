import { Clock } from 'lucide-react';
import styles from './production-subscription.module.css';

export function ProductionSubscription({ name }: { name: string }) {
  return <div className={styles.wrapper}>
    <section className={styles.card} aria-labelledby="subscription-notice">
      <span className={styles.icon}><Clock aria-hidden="true"/></span>
      <h1 id="subscription-notice">{name} Feature Coming Soon!</h1>
      <p>We&apos;ll inform you when this feature becomes available to use.</p>
    </section>
  </div>;
}
