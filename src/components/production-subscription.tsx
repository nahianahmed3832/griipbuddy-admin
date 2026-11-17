import { Clock } from 'lucide-react';
import styles from './production-subscription.module.css';

export function ProductionSubscription({ name }: { name: string }) {
  return <div className={styles.wrapper}>
    <div className={styles.card}>
      <span className={styles.icon}><Clock aria-hidden="true"/></span>
      <div className={styles.title} data-slot="card-title">{name} Feature Coming Soon!</div>
      <p>We&apos;ll inform you when this feature becomes available to use.</p>
    </div>
  </div>;
}
