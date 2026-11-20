'use client';

import { UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import styles from './production-customers.module.css';

export function ProductionCreateCustomer({ region, allowPhoto }: { region: Region; allowPhoto: boolean }) {
  const router = useRouter();
  const back = '/dashboard/customers?region=' + region;
  const [photo, setPhoto] = useState<File>();
  const [preview, setPreview] = useState('');
  const [uploadedPhoto, setUploadedPhoto] = useState<{ file: File; url: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!photo) return;
    const link = URL.createObjectURL(photo);
    setPreview(link);
    return () => URL.revokeObjectURL(link);
  }, [photo]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    try {
      if (photo && uploadedPhoto?.file === photo) values.profile_url = uploadedPhoto.url;
      else if (photo) {
        const body = new FormData();
        body.set('file', photo);
        const response = await fetch(adminPath('/api/media/upload?scope=customer&kind=image'), { method: 'POST', body });
        const result = await response.json();
        if (!response.ok || typeof result.url !== 'string') throw new Error(result.error || 'Could not upload the photo.');
        values.profile_url = result.url;
        setUploadedPhoto({ file: photo, url: result.url });
      }
      const response = await fetch(adminPath('/api/customers'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
      });
      if (!response.ok) throw new Error((await response.text()).slice(0, 300));
      router.push(back);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create the customer.');
      setBusy(false);
    }
  }

  return <form className={styles.form + ' stack-form'} onSubmit={save}>
    <h1>Create Customer</h1>
    {allowPhoto && <div className={styles.preview}>
      {photo && preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Selected customer photo"/>
      ) : <UserRound size={42} aria-hidden="true"/>}
      <label>Upload Photo<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" disabled={busy}
        onChange={event => {
          const file = event.target.files?.[0];
          if (file && (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(file.type))) {
            setError('Choose a JPEG, PNG, WebP, GIF or AVIF photo up to 5 MB.');
            event.target.value = '';
            setPhoto(undefined);
            return;
          }
          setPhoto(file);
          setError('');
        }}/></label>
    </div>}
    <fieldset className="editor-fieldset" disabled={busy}><div className="editor-grid">
      <label>Full Name<input name="full_name" autoComplete="name" required maxLength={120}/></label>
      <label>Phone Number<input name="phone_number" type="tel" autoComplete="tel" maxLength={32} required/></label>
      <label>Email (Optional)<input name="email" type="email" autoComplete="email" maxLength={254}/></label>
      <label>Password<input name="password" type="password" autoComplete="new-password" minLength={6} maxLength={128} required/></label>
      <label>User Role<select name="role"><option value="USER">User</option></select></label>
      <label>Gender<select name="gender"><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label>
      <label>Status<select name="status"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="BANNED">Banned</option></select></label>
    </div></fieldset>
    {error && <p className="notice warn" role="alert">{error}</p>}
    <div className="page-actions">
      <Link className="button secondary" href={back}>Cancel</Link>
      <button type="submit" className="button primary" disabled={busy}>{busy ? 'Creating…' : 'Create Customer'}</button>
    </div>
  </form>;
}
