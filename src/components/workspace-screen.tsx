import type { ReactNode } from 'react';
import styles from './workspace-screen.module.css';

export function WorkspaceHeading({ title, detail, children }: { title: ReactNode; detail?: ReactNode; children?: ReactNode }) {
  return <header className={styles.heading}>
    <div><h1>{title}</h1>{detail && <div className={styles.detail}>{detail}</div>}</div>
    {children && <div className={styles.actions}>{children}</div>}
  </header>;
}

export function WorkspaceEmpty({ title, detail }: { title: string; detail?: string }) {
  return <div className={styles.empty}><strong>{title}</strong>{detail && <p>{detail}</p>}</div>;
}

export function WorkspaceStatus({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'active' | 'success' | 'warning' | 'danger' }) {
  return <span className={styles.status} data-tone={tone}>{children}</span>;
}
