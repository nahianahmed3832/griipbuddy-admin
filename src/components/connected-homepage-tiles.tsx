'use client';

import { useState } from 'react';
import { homepageTileKinds, homepageTileLayouts, type HomepageEditorData, type HomepageFocalPoint,
  type HomepageImage, type HomepageReference, type HomepageScope, type HomepageSection, type HomepageTile,
  type HomepageTileKind, type HomepageTileLayout } from '@/lib/homepage-merchandising';
import type { Region } from '@/lib/sections';
import { HomepageAsset, HomepageReferencePicker } from './connected-homepage-reference';

const destinations = { CATEGORY: ['categories', 'Category'], COLLECTION: ['collections', 'Collection'],
  PRODUCT: ['products', 'Product'] } as const;
export const homepageMediaTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxTiles = 12;

export type UploadHomepageImage = (file: File, assignImage: (image: HomepageImage) => void) => void;

function TileImage({ device, image, focus, fallbackImage, fallbackFocus, region, scope, references, disabled, onImage, onFocus, onUpload }: {
  device: 'Desktop' | 'Mobile'; image?: HomepageImage; focus?: HomepageFocalPoint;
  fallbackImage?: HomepageImage; fallbackFocus?: HomepageFocalPoint;
  region: Region; scope: HomepageScope; references: HomepageReference[]; disabled: boolean;
  onImage: (image?: HomepageImage) => void; onFocus: (focus?: HomepageFocalPoint) => void; onUpload: UploadHomepageImage;
}) {
  const preview = image ?? fallbackImage;
  return <div className="homepage-tile-image">
    <h4>{device} image and crop</h4>
    {device === 'Mobile' && <p className="taxonomy-muted">Use a second crop of the same subject, or reuse the desktop image.</p>}
    {preview && <div className="homepage-crop"><HomepageAsset image={preview} region={region} focalPoint={focus ?? fallbackFocus} cover /></div>}
    <HomepageReferencePicker kind="media" label={`${device} image`} region={region} scope={scope.key} maximum={1}
      value={image ? [image.src] : []} selected={references} disabled={disabled}
      onChange={([src], ref) => onImage(src ? { src, alt: ref?.image?.alt ?? '' } : undefined)} />
    <label>Upload {device.toLowerCase()} image<input type="file" accept={homepageMediaTypes.join(',')}
      onChange={event => {
        const file = event.target.files?.[0];
        if (file) onUpload(file, onImage);
        event.target.value = '';
      }} /></label>
    {image && <label>{device} image alternative text<input required maxLength={130} value={image.alt}
      onChange={event => onImage({ ...image, alt: event.target.value })} /></label>}
    <div className="taxonomy-fields homepage-focal-fields">
      {(['x', 'y'] as const).map(axis => <label key={axis}>{device} {axis === 'x' ? 'horizontal' : 'vertical'} focus (%)
        <input type="number" min={0} max={100} step="any" placeholder="50" value={focus?.[axis] ?? ''}
          onChange={event => {
            const value = event.target.valueAsNumber;
            if (!Number.isNaN(value)) onFocus({ ...focus ?? { x: 50, y: 50 }, [axis]: value });
          }} />
      </label>)}
    </div>
    {focus && <button type="button" className="taxonomy-button" onClick={() => onFocus(undefined)}>Reset {device.toLowerCase()} crop</button>}
  </div>;
}

export function HomepageTilesEditor({ section, region, scope, refData, disabled, onEdit, onUpload }: {
  section: HomepageSection; region: Region; scope: HomepageScope; refData: HomepageEditorData['references']; disabled: boolean;
  onEdit: (fields: Partial<HomepageSection>) => void; onUpload: UploadHomepageImage;
}) {
  const [selected, setSelected] = useState<Partial<Record<'categories' | 'collections' | 'products', HomepageReference[]>>>({});
  const layout = section.tileLayout ?? 'PORTRAIT';
  const tiles = section.tiles ?? [];
  const kinds = homepageTileKinds[layout];
  function update(key: string, fields: Partial<HomepageTile>) {
    onEdit({ tiles: tiles.map(tile => tile.key === key ? { ...tile, ...fields } : tile) });
  }
  function move(index: number, offset: -1 | 1) {
    const next = [...tiles];
    [next[index + offset], next[index]] = [next[index], next[index + offset]];
    onEdit({ tiles: next });
  }

  return <div className="homepage-fieldset homepage-tile-fields" data-layout={layout}>
    <label>Tile layout<select value={layout} onChange={event => onEdit({ tileLayout: event.target.value as HomepageTileLayout })}>
      {Object.entries(homepageTileLayouts).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    {tiles.map((tile, index) => {
      const [kind, label] = destinations[tile.kind];
      const references = [...(refData?.[kind] ?? []), ...(selected[kind] ?? [])];
      const reference = references.find(ref => ref.id === tile.referenceId);
      const number = index + 1;
      return <fieldset key={tile.key} className="homepage-tile-editor taxonomy-card">
        <legend>{tile.title?.trim() || reference?.label || `Tile ${number}`}</legend>
        <div className="taxonomy-fields">
          <label>Destination type<select value={tile.kind} onChange={event => update(tile.key, {
            kind: event.target.value as HomepageTileKind, referenceId: '',
          })}>
            {!kinds.includes(tile.kind) && <option value={tile.kind} disabled>{label} (choose a new type)</option>}
            {kinds.map(value => <option key={value} value={value}>{destinations[value][1]}</option>)}
          </select></label>
          <label>Tile label<input minLength={2} maxLength={90} value={tile.title ?? ''} placeholder={reference?.label}
            onChange={event => update(tile.key, { title: event.target.value })} /></label>
          {layout !== 'SHORTCUTS' && <label>Action label<input minLength={2} maxLength={40} value={tile.ctaLabel ?? ''}
            onChange={event => update(tile.key, { ctaLabel: event.target.value })} /></label>}
        </div>
        {kinds.includes(tile.kind) && <HomepageReferencePicker key={kind} kind={kind} label={`Tile ${label.toLowerCase()} destination`}
          region={region} scope={scope.key} value={tile.referenceId ? [tile.referenceId] : []} selected={references}
          maximum={1} disabled={disabled} exclude={tiles.filter(other => other.key !== tile.key && other.kind === tile.kind).map(other => other.referenceId)}
          onChange={([referenceId], ref) => {
            if (ref) setSelected(values => ({ ...values, [kind]: [...(values[kind] ?? []).filter(value => value.id !== ref.id), ref] }));
            update(tile.key, { referenceId: referenceId ?? '' });
          }} />}
        {reference?.href && <p className="taxonomy-muted homepage-tile-destination">Destination <code>{reference.href}</code></p>}
        <div className="homepage-tile-images">
          <TileImage device="Desktop" image={tile.image} focus={tile.focalPoint} onImage={image => update(tile.key, { image })}
            onFocus={focalPoint => update(tile.key, { focalPoint })} region={region} scope={scope} disabled={disabled}
            references={refData?.media ?? []} fallbackImage={reference?.image} onUpload={onUpload} />
          <TileImage device="Mobile" image={tile.mobileImage} focus={tile.mobileFocalPoint} onImage={mobileImage => update(tile.key, { mobileImage })}
            onFocus={mobileFocalPoint => update(tile.key, { mobileFocalPoint })} region={region} scope={scope} disabled={disabled}
            references={refData?.media ?? []} fallbackImage={tile.image ?? reference?.image} fallbackFocus={tile.focalPoint} onUpload={onUpload} />
        </div>
        <div className="taxonomy-actions">
          <button type="button" className="taxonomy-button" aria-label={`Move tile ${number} up`} disabled={index === 0}
            onClick={() => move(index, -1)}>Move up</button>
          <button type="button" className="taxonomy-button" aria-label={`Move tile ${number} down`} disabled={number === tiles.length}
            onClick={() => move(index, 1)}>Move down</button>
          <button type="button" className="taxonomy-button" aria-label={`Remove tile ${number}`}
            onClick={() => onEdit({ tiles: tiles.filter(other => other.key !== tile.key) })}>Remove tile</button>
        </div>
      </fieldset>;
    })}
    {tiles.length < maxTiles && <div><button type="button" className="taxonomy-button" onClick={() => onEdit({ tiles: [...tiles,
      { key: `tile-${crypto.randomUUID().slice(0, 12)}`, kind: kinds[0], referenceId: '' }] })}>Add tile</button></div>}
  </div>;
}
