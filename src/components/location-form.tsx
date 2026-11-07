'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { Building2, MapPin, Phone, Plus, Trash2 } from 'lucide-react';
import { locationsPath, locationTypes, marketLabel, type LocationFields, type LocationRecord } from '@/lib/locations';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';

export function LocationForm({ location, region, cancelHref }: {
  location?: LocationRecord; region: Region; cancelHref: string;
}) {
  const router = useRouter();
  const [phones, setPhones] = useState(() => (location?.contact_numbers.length ? location.contact_numbers : [''])
    .map((value, key) => ({ value, key })));
  const nextPhoneKey = useRef(phones.length);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const errorSummary = useRef<HTMLDivElement>(null);
  const type = location?.type || '';
  const address = location?.address;
  const id = location?.id;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim();
    const body: LocationFields & { revision?: string | null } = {
      name: value('name'), type: value('type'),
      address: {
        local_address: value('street'), division: value('division'), district: value('district'),
        thana: value('thana'), zip_code: value('zip'),
      },
      manager_name: value('manager'),
      contact_numbers: phones.map(phone => phone.value.trim()).filter(Boolean),
      ...(location && { revision: location.revision }),
    };
    const query = new URLSearchParams({ region });
    if (id) query.set('id', id);
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await fetch(adminPath('/api/locations?' + query), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!result.ok) throw new Error((await result.text()) || 'The location could not be saved.');
      const saved: { id: string } = await result.json();
      router.replace(locationsPath + '/' + saved.id + '?' + new URLSearchParams({ region, saved: id ? 'updated' : 'created' }));
    } catch (failure) {
      setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message
        : 'The connection was interrupted. Check the directory before trying again.');
      requestAnimationFrame(() => errorSummary.current?.focus());
      submitting.current = false;
      setSaving(false);
    }
  }

  return <form className="panel location-editor" onSubmit={save} aria-busy={saving}>
    <div className="location-editor-context">
      <span className="location-market"><MapPin size={14} aria-hidden="true"/>{marketLabel(region)}</span>
      <span>Fields marked with * are required.</span>
    </div>
    {error && <div className="notice warn location-form-error" tabIndex={-1} ref={errorSummary} role="alert">{error}</div>}
    <fieldset disabled={saving} className="location-editor-fields">
      <section className="location-editor-section" aria-labelledby="location-identity">
        <div className="location-section-heading"><Building2 size={18} aria-hidden="true"/><div>
          <h2 id="location-identity">Location details</h2><p>Use a name your team will recognize on inventory and order screens.</p>
        </div></div>
        <div className="location-fields">
          <label>Location name <span aria-hidden="true">*</span>
            <input name="name" defaultValue={location?.name} maxLength={120} required placeholder="e.g. Dhaka Distribution Centre"/>
          </label>
          <label>Location type <span aria-hidden="true">*</span>
            <select name="type" required defaultValue={type}>
              <option value="" disabled>Select a type</option>
              {type && !Object.hasOwn(locationTypes, type) && <option value={type}>{type}</option>}
              {Object.entries(locationTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
      </section>
      <section className="location-editor-section" aria-labelledby="location-address">
        <div className="location-section-heading"><MapPin size={18} aria-hidden="true"/><div>
          <h2 id="location-address">Address</h2><p>Enter the physical address where your team operates.</p>
        </div></div>
        <div className="location-fields">
          <label className="location-field-wide">Street address <span aria-hidden="true">*</span>
            <textarea name="street" defaultValue={address?.local_address} maxLength={500} required rows={2}
              placeholder="Building, street and unit"/>
          </label>
          <label>{region === 'BD' ? 'Division' : 'State, province or region'}
            <input name="division" defaultValue={address?.division} maxLength={100}/>
          </label>
          <label>{region === 'BD' ? 'District' : 'City or district'}
            <input name="district" defaultValue={address?.district} maxLength={100}/>
          </label>
          <label>{region === 'BD' ? 'Thana or upazila' : 'Local area'}
            <input name="thana" defaultValue={address?.thana} maxLength={100}/>
          </label>
          <label>Postal code<input name="zip" defaultValue={address?.zip_code} maxLength={30}/></label>
        </div>
      </section>
      <section className="location-editor-section" aria-labelledby="location-contacts">
        <div className="location-section-heading"><Phone size={18} aria-hidden="true"/><div>
          <h2 id="location-contacts">Contacts</h2><p>Add the manager and business phone numbers for this site.</p>
        </div></div>
        <div className="location-fields">
          <label className="location-field-wide">Manager name<input name="manager" defaultValue={location?.manager_name} maxLength={120}/></label>
          <div className="location-phone-fields location-field-wide">
            {phones.map(({ key, value }, index) => <div className="location-phone-row" key={key}>
              <label>Phone number {index + 1}<input id={'location-phone-' + key} value={value} type="tel" maxLength={80}
                onChange={event => {
                  const next = event.currentTarget.value;
                  setPhones(rows => rows.map(row => row.key === key ? { key, value: next } : row));
                }}/></label>
              {phones.length > 1 && <button type="button" className="button secondary" aria-label={'Remove phone number ' + (index + 1)}
                onClick={() => setPhones(rows => rows.filter(row => row.key !== key))}><Trash2 size={16} aria-hidden="true"/></button>}
            </div>)}
            {phones.length < 25 && <button type="button" className="button secondary" onClick={() => {
              const key = nextPhoneKey.current++;
              setPhones(rows => [...rows, { key, value: '' }]);
              requestAnimationFrame(() => document.getElementById('location-phone-' + key)?.focus());
            }}><Plus size={15} aria-hidden="true"/> Add phone number</button>}
          </div>
        </div>
      </section>
    </fieldset>
    <div className="location-editor-actions">
      {!saving && <Link className="button secondary" href={cancelHref}>Cancel</Link>}
      <button type="submit" className="button primary" disabled={saving}>
        {saving ? 'Saving…' : id ? 'Save changes' : 'Add location'}
      </button>
    </div>
  </form>;
}
