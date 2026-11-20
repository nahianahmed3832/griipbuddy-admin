'use client';

import Image from 'next/image';
import { useEffect, useId, useState } from 'react';
import { catalogAssetPath } from '@/lib/connected-catalog-contract';
import { catalogRequest } from '@/lib/connected-catalog-client';
import type { HomepageFocalPoint, HomepageImage, HomepageReference, HomepageReferenceKind } from '@/lib/homepage-merchandising';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';

export function HomepageAsset({ image, region, cover, focalPoint }: {
  image: HomepageImage; region: Region; cover?: boolean; focalPoint?: HomepageFocalPoint;
}) {
  const [pathWithoutQuery] = image.src.split('?');
  const src = pathWithoutQuery.replace(/^\/marketplace(?=\/)/, '');
  if (!catalogAssetPath(src)) return null;
  const path = adminPath(`/api/connected-catalog?${new URLSearchParams({ homepageAsset: src, region })}`);
  return <Image unoptimized src={path} alt={image.alt} width={360} height={202}
    className={cover ? 'homepage-asset homepage-asset--cover' : 'homepage-asset'}
    style={focalPoint ? { objectPosition: `${focalPoint.x}% ${focalPoint.y}%` } : undefined} />;
}

export function HomepageReferencePicker({ kind, label, region, scope, value, maximum, selected, disabled, onChange, useHref = false, exclude = [] }: {
  kind: HomepageReferenceKind; label: string; region: Region; scope: string; value: string[]; maximum: number;
  selected: HomepageReference[]; disabled: boolean; useHref?: boolean; exclude?: readonly string[];
  onChange: (ids: string[], picked?: HomepageReference) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HomepageReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const { items } = await catalogRequest<{ items: HomepageReference[] }>({ read: 'homepage-references',
          homepageScope: scope, kind, q: query.trim() }, region, controller.signal);
        if (!controller.signal.aborted) setResults(useHref ? items.flatMap(item => item.href ? [{ ...item, id: item.href }] : []) : items);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Catalog references could not be loaded.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 175);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [kind, query, region, scope, open, retry, useHref]);

  function search(next: string) {
    if (query === next) return;
    setQuery(next);
    setLoading(true);
    setError('');
  }
  return <div className="homepage-reference">
    <span id={`${id}-label`}>{label}</span>
    {!!value.length && <ul aria-labelledby={`${id}-label`} className="homepage-reference-list">{value.map((ref, index) => {
      const name = selected.find(option => option.id === ref)?.label ?? ref;
      return <li key={ref}><span>{name}</span>{!disabled && <div className="taxonomy-actions">
        {maximum > 1 && <>
          <button className="taxonomy-button" type="button" disabled={index === 0} aria-label={`Move ${name} up`} onClick={() => {
            const ids = [...value]; [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; onChange(ids);
          }}>↑</button>
          <button className="taxonomy-button" type="button" disabled={index === value.length - 1} aria-label={`Move ${name} down`} onClick={() => {
            const ids = [...value]; [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]]; onChange(ids);
          }}>↓</button>
        </>}
        <button className="taxonomy-button" type="button" aria-label={`Remove ${name}`} onClick={() => onChange(value.filter(current => current !== ref))}>Remove</button>
      </div>}</li>;
    })}</ul>}
    {!value.length && !disabled && <p className="taxonomy-muted">No selection.</p>}
    {!disabled && (maximum === 1 || value.length < maximum) && <>
      <button className="taxonomy-button" type="button" aria-expanded={open} aria-controls={`${id}-picker`}
        onClick={() => { setOpen(!open); setLoading(!open); setError(''); }}>{open ? 'Close picker' : `Choose ${label.toLowerCase()}`}</button>
      {open && <div id={`${id}-picker`} className="homepage-picker">
        <label>Search {label.toLowerCase()} <input type="search" value={query} maxLength={100} onChange={event => search(event.target.value)} /></label>
        {loading ? <p role="status">Finding catalog references…</p> : error ? <div><p role="alert">{error}</p>
          <button type="button" className="taxonomy-button" onClick={() => { setRetry(retry + 1); setLoading(true); setError(''); }}>Retry search</button>
        </div> : !results.length ? <p role="status">No references found.</p> : <ul className="homepage-reference-list">
          {results.map(option => <li key={option.id}>
            {option.image && kind === 'media' && <HomepageAsset image={option.image} region={region} />}
            <span>{option.label}</span><button type="button" className="taxonomy-button" aria-label={`Select ${option.label}`}
              disabled={value.includes(option.id) || exclude.includes(option.id)} onClick={() => {
                onChange(maximum === 1 ? [option.id] : [...value, option.id], option);
                if (maximum === 1 || value.length + 1 === maximum) setOpen(false);
              }}>{value.includes(option.id) ? 'Selected' : exclude.includes(option.id) ? 'Used by another tile' : 'Select'}</button>
          </li>)}
        </ul>}
      </div>}
    </>}
    {disabled && !value.length && <p className="taxonomy-muted">No selection.</p>}
  </div>;
}
