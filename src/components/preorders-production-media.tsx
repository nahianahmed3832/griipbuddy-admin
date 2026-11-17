'use client';

import Image from 'next/image';
import { useId, useRef } from 'react';
import { X } from 'lucide-react';
import { preOrderMedia, statusText } from '@/lib/preorders';
import styles from './preorders.module.css';

export function PreOrderStatus({ status }: { status?: string }) {
  return <span className={styles.statusBadge} data-status={status}>{status ? statusText(status) : '—'}</span>;
}

export function PreOrderPicture({ images, origin, title, size, single = false, label, privateUrl }: {
  images: (string | undefined)[]; origin: string; title: string; size: number; single?: boolean; label?: string; privateUrl?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const sources = privateUrl ? [privateUrl] : images.map(image => preOrderMedia(image, origin)).filter((image): image is string => Boolean(image));
  if (!sources.length) return label ? null : <span className={styles.thumbnail} aria-hidden="true" style={{ width: size, height: size }}/>;
  return <>
    {label ? <button type="button" className={styles.control} onClick={() => dialog.current?.showModal()}>{label}</button>
      : <div className={`${styles.inline} ${styles.pictureRow}`}>
        {(single ? sources.slice(0, 1) : sources).map((source, index) => <button type="button" className={styles.pictureButton}
          aria-label={'View ' + title + (sources.length > 1 ? ' image ' + (index + 1) : '')} onClick={() => dialog.current?.showModal()} key={source + index}>
          <Image src={source} alt={title} width={size} height={size} unoptimized className={styles.thumbnail}/>
        </button>)}
      </div>}
    <dialog ref={dialog} className={`${styles.dialog} ${styles.gallery}`} aria-labelledby={titleId}>
      <div className={styles.splitHeading}><h2 id={titleId}>{title}</h2>
        <button type="button" className={styles.iconButton} aria-label="Close image gallery" onClick={() => dialog.current?.close()}><X size={16}/></button></div>
      <div className={styles.galleryImages}>{sources.map((source, index) => <a href={source} target="_blank" rel="noreferrer" key={source + index}>
        <Image src={source} alt={title + (sources.length > 1 ? ' ' + (index + 1) : '')} width={480} height={480} unoptimized/>
      </a>)}</div>
    </dialog>
  </>;
}
