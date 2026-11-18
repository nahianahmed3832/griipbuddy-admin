'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Pencil, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import type { Region } from '@/lib/sections';
import { saveCatalog } from './catalog-edit-form';
import { ProductDescriptionEditor, ProductEditorSwitch, ProductRichText } from './production-product-editor-fields';
import styles from './production-catalog.module.css';
import design from './production-catalog-details.module.css';
import editor from './production-product-editor.module.css';

export type ReturnPolicy = { id: string; title: string; description: string; days: string; active: boolean; conditions: string[] };
const listPath = '/dashboard/return-policies';
const scope = (path: string, region: Region) => path + (region === 'INTERNATIONAL' ? '?region=INTERNATIONAL' : '');

export function ProductionReturnPolicies({ policies, region, canCreate, canEdit, canDelete }: {
  policies: ReturnPolicy[]; region: Region; canCreate: boolean; canEdit: boolean; canDelete: boolean;
}) {
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  async function change(policy: ReturnPolicy, action: 'delete' | 'status') {
    if (pending.current || (action === 'delete' && !window.confirm('Are you sure you want to delete this return policy?'))) return;
    pending.current = true;
    setBusy(policy.id); setError('');
    try {
      await saveCatalog({ kind: 'policies', id: policy.id, action, region, values: { is_active: !policy.active } });
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save the return policy.'); }
    finally { pending.current = false; setBusy(''); }
  }
  return <section className={styles.page}>
    <header className={styles.header}><h1>All Return Policies</h1>
      {canCreate && <Link href={scope('/dashboard/add-new-return-policy', region)} className={styles.primary}>Add Return Policy</Link>}
    </header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.tableBorder + ' ' + design.scroll}><table className={styles.table + ' ' + design.policyTable}>
      <thead><tr>{['Title', 'Description', 'Return Period', 'Status', 'Actions'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{policies.map(policy => <tr key={policy.id}>
        <td>{policy.title}</td><td><ProductRichText source={policy.description}/></td><td>{policy.days} days</td>
        <td><span className={design.policyStatus}>
          {canEdit && <input className={design.policyToggle} type="checkbox" role="switch" checked={policy.active}
            aria-label={'Active status for ' + policy.title} disabled={Boolean(busy)} onChange={() => void change(policy, 'status')}/>}
          {policy.active ? 'Active' : 'Inactive'}
        </span></td>
        <td><div className={design.tableActions}>
          {canEdit && <Link href={scope('/dashboard/update-return-policy/' + policy.id, region)} className={styles.outline}
            aria-label={'Edit ' + policy.title}><Pencil size={16}/></Link>}
          {canDelete && <button type="button" className={editor.danger} aria-label={'Delete ' + policy.title}
            disabled={Boolean(busy)} onClick={() => void change(policy, 'delete')}><Trash2 size={16}/></button>}
        </div></td>
      </tr>)}{policies.length === 0 && <tr><td colSpan={5} className={styles.empty}>No return policies found!</td></tr>}</tbody>
    </table></div>
  </section>;
}

export function ProductionReturnPolicyEditor({ policy, region }: { policy?: ReturnPolicy; region: Region }) {
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    pending.current = true;
    setBusy(true); setError('');
    try {
      await saveCatalog({ kind: 'policies', id: policy?.id, action: 'save', region, values });
      router.push(scope(listPath, region)); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save the return policy.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className={styles.page + ' ' + editor.editor}>
    <header className={editor.pageHeading}>
      <Link href={scope(listPath, region)} className={editor.back} aria-label="Back to return policies"><ChevronLeft size={16}/></Link>
      <h1>{policy ? 'Update Return Policy' : 'Add New Return Policy'}</h1>
    </header>
    <form className={design.forms + ' ' + design.editorPanel} onSubmit={save}>
      <label className={styles.field}>Title<input name="title" defaultValue={policy?.title} placeholder="Enter return policy title" required maxLength={2000}/></label>
      <ProductDescriptionEditor initial={policy?.description ?? ''} placeholder="Enter description"/>
      <label className={styles.field + ' ' + design.policyDays}>Return Period (Days)<input name="return_period_days" type="number"
        min="0" max="99999999" step="1" placeholder="7" defaultValue={policy?.days ?? '7'} required/></label>
      {policy && <input type="hidden" name="conditions" value={policy.conditions.join('\n')}/>}
      <div className={design.policyConditionsSpace} aria-hidden="true"/>
      <div className={design.policyActive}><ProductEditorSwitch label="Active Status" hint="Enable this return policy for use"
        name="is_active" initial={policy?.active ?? true}/></div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={design.submit}><button className={styles.primary} disabled={busy}>
        {busy ? 'Saving…' : policy ? 'Update Return Policy' : 'Create Return Policy'}
      </button></div>
    </form>
  </section>;
}
