'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import Image from 'next/image';
import { catalogRequest } from '@/lib/connected-catalog-client';
import { catalogAssetPath, catalogUploadLimit, type CatalogCommand } from '@/lib/connected-catalog-contract';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import { useTaxonomyDirty } from './connected-catalog-product/taxonomy-controls';
import styles from './connected-categories.module.css';
import catalog from './production-catalog.module.css';

export function useTaxonomyCommand(region: Region) {
  const router = useRouter();
  const changed = useTaxonomyDirty();
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string }>();
  async function send(command: CatalogCommand, success = 'Saved.', next?: string) {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setFeedback(undefined);
    try {
      await catalogRequest(command, region);
      changed(false);
      setFeedback({ error: false, text: success });
      if (next) router.push(next);
      router.refresh();
    } catch (error) {
      setFeedback({ error: true, text: error instanceof Error ? error.message : 'The change could not be saved.' });
    } finally { saving.current = false; setPending(false); }
  }
  return { pending, feedback: pending ? { error: false, text: 'Saving changes…' } : feedback, send, changed };
}

export function Feedback({ value }: { value?: { error: boolean; text: string } }) {
  return value ? <p role={value.error ? 'alert' : 'status'} className={value.error ? styles.error : undefined}>{value.text}</p> : null;
}

export function ChoiceCheck({ name, children, defaultChecked = false }: { name: string; children: React.ReactNode; defaultChecked?: boolean }) {
  return <label className={styles.check}><input name={name} type="checkbox" defaultChecked={defaultChecked}/>{children}</label>;
}

export function imageInput(data: FormData, name: string) {
  const src = readField(data, name);
  return src ? { src, alt: readField(data, name + 'Alt') } : null;
}

export function readField(data: FormData, name: string) { return String(data.get(name) ?? '').trim(); }

export function TextInput({ name, label, value, required, max = 120, pattern }: {
  name: string; label: string; value?: string | null; required?: boolean; max?: number; pattern?: string;
}) {
  return <label>{label}<input name={name} defaultValue={value ?? ''} maxLength={max} required={required} pattern={pattern}/></label>;
}

export function ImageFields({ name, title, src, alt, required, region, canUpload, canPreview = true, onUpload }: {
  name: string; title: string; src?: string | null; alt?: string | null; required?: boolean; region: Region;
  canUpload: boolean; canPreview?: boolean; onUpload: () => void;
}) {
  const [path, setPath] = useState(src ?? '');
  const [description, setDescription] = useState(alt ?? '');
  const [working, setWorking] = useState(false);
  const [issue, setIssue] = useState('');
  const pathInput = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    setIssue('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > catalogUploadLimit) {
      setIssue('Choose a JPEG, PNG or WebP image up to 4 MB.');
      return;
    }
    pathInput.current?.setCustomValidity('Wait for the image to finish uploading.');
    setWorking(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result.split(',')[1] ?? '') : reject();
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await catalogRequest<{ src: string }>({ action: 'media.upload', input: { data, contentType: file.type, purpose: 'editorial' } }, region);
      setPath(result.src);
      onUpload();
    } catch (error) { setIssue(error instanceof Error ? error.message : 'The image could not be uploaded.'); }
    finally {
      pathInput.current?.setCustomValidity('');
      setWorking(false);
    }
  }
  return <div className={styles.fields}>
    <label>{title} path<input ref={pathInput} name={name} value={path} onChange={event => setPath(event.target.value)} maxLength={100} required={required}/></label>
    <label>{title} alternative text<input name={name + 'Alt'} value={description} maxLength={180} required={required || Boolean(path)}
      onChange={event => setDescription(event.target.value)}/></label>
    {canPreview && catalogAssetPath(path) && <Image className={styles.image} src={adminPath('/api/connected-catalog?' + new URLSearchParams({ asset: path, region }))}
      alt={description || title + ' preview'} width={76} height={64} unoptimized/>}
    {canUpload && <label>{'Upload ' + title.toLowerCase()}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={working}
      onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }}/></label>}
    {working && <p role="status">Uploading image…</p>}
    {issue && <p role="alert" className={styles.error}>{issue}</p>}
  </div>;
}

export function moveInList<T>(items: T[], index: number, delta: number): T[] {
  const next = [...items];
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
}

export function OrderButtons({ index, length, label, move, disabled = false }: {
  index: number; length: number; label: string; move: (delta: number) => void; disabled?: boolean;
}) {
  return <>
    <button type="button" className={catalog.outline + ' ' + styles.compact} aria-label={'Move ' + label + ' up'} disabled={disabled || index === 0} onClick={() => move(-1)}>Up</button>
    <button type="button" className={catalog.outline + ' ' + styles.compact} aria-label={'Move ' + label + ' down'} disabled={disabled || index >= length - 1} onClick={() => move(1)}>Down</button>
  </>;
}
