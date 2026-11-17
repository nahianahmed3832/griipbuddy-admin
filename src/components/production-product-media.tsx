'use client';

import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { adminPath } from '@/lib/paths';
import { productionCmsPreview } from '@/lib/production-cms-media';
import styles from './production-product-editor.module.css';

export async function uploadProductMedia(file: File, kind: 'image' | 'video') {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(adminPath((kind === 'video' ? '/api/media/video/upload' : '/api/media/upload') + '?scope=product&kind=' + kind), { method: 'POST', body: form });
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.url !== 'string') throw new Error(result?.error || 'Could not upload the file.');
  return result.url as string;
}

const imageFiles = 'image/webp,image/png,image/jpeg,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico';
const videoFiles = 'video/mp4,video/webm,video/ogg,video/quicktime';
const lines = (value: string) => value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

function MediaPicker({ label, addresses, kind, multiple, onAdd, onRemove, disabled, busy }: {
  label: string; addresses: string[]; kind: 'image' | 'video'; multiple?: boolean;
  onAdd: (files: File[]) => void; onRemove: (address: string) => void; disabled: boolean; busy: boolean;
}) {
  const video = kind === 'video';
  return <div className={styles.mediaPicker}>
    {label && <p>{label}</p>}
    {addresses.length > 0 && <div className={styles.mediaGrid}>{addresses.map(address => <div className={styles.mediaTile} key={address}>
      {video ? <video src={productionCmsPreview(address)} controls preload="metadata"/> :
        // eslint-disable-next-line @next/next/no-img-element
        <img src={productionCmsPreview(address)} alt={label + ' preview'} referrerPolicy="no-referrer"/>}
      <button type="button" aria-label={'Remove ' + (label || 'video')} disabled={disabled} onClick={() => onRemove(address)}>
        <Trash2 size={15} aria-hidden="true"/>
      </button>
    </div>)}</div>}
    <label className={video ? styles.videoUpload : styles.imageUpload}>
      <span className={styles.uploadIcon}>{video ? <Upload size={20}/> : <ImagePlus size={20}/>}</span>
      <span><strong>{busy ? 'Uploading…' : video ? 'Click to upload short videos (Story / Reels)' : 'Click to upload'}</strong>
        <small>{video ? 'Portrait 9:16 recommended • .mp4, .webm, .ogg, .mov (max 500MB each)'
          : 'Supported: .webp (preferred), .png, .jpg, .jpeg, .svg, .ico (max: 5MB)'}</small>
      </span>
      <input className={styles.hiddenFile} type="file" accept={video ? videoFiles : imageFiles} multiple={multiple} disabled={disabled}
        aria-label={video ? 'Upload short videos' : 'Upload ' + label.toLowerCase()} onChange={event => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (files.length) onAdd(files);
        }}/>
    </label>
  </div>;
}

export function ProductionProductImages({ initial, gallery, uploading, setUploading }: {
  initial: string; gallery: string; uploading: boolean; setUploading: (value: boolean) => void;
}) {
  const [thumbnail, setThumbnail] = useState(initial);
  const [images, setImages] = useState(lines(gallery));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  async function add(files: File[], target: 'Thumbnail' | 'Slider Images') {
    if (uploading) return;
    setBusy(target); setError(''); setUploading(true);
    try {
      for (const file of files) {
        if (file.size > 5 * 1024 * 1024) throw new Error('Images must be 5 MB or smaller.');
        const address = await uploadProductMedia(file, 'image');
        if (target === 'Thumbnail') setThumbnail(address);
        else setImages(current => [...new Set([...current, address])]);
      }
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not upload the image.'); }
    finally { setBusy(''); setUploading(false); }
  }
  return <>
    <div className={styles.imageFields}>
      <MediaPicker label="Thumbnail" addresses={thumbnail ? [thumbnail] : []} kind="image" onAdd={files => void add(files, 'Thumbnail')}
        onRemove={() => setThumbnail('')} disabled={uploading} busy={busy === 'Thumbnail'}/>
      <MediaPicker label="Slider Images" addresses={images} kind="image" multiple onAdd={files => void add(files, 'Slider Images')}
        onRemove={address => setImages(current => current.filter(value => value !== address))} disabled={uploading} busy={busy === 'Slider Images'}/>
    </div>
    <input type="hidden" name="thumbnail" value={thumbnail}/>
    <input type="hidden" name="slider_images" value={images.join('\n')}/>
    {error && <p role="alert" className="notice warn">{error}</p>}
  </>;
}

export function ProductionProductVideos({ initial, uploading, setUploading }: {
  initial: string; uploading: boolean; setUploading: (value: boolean) => void;
}) {
  const [videos, setVideos] = useState(lines(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function add(files: File[]) {
    if (uploading) return;
    setBusy(true); setError(''); setUploading(true);
    try {
      for (const file of files) {
        if (file.size > 500 * 1024 * 1024) throw new Error('Videos must be 500 MB or smaller.');
        const address = await uploadProductMedia(file, 'video');
        setVideos(current => [...new Set([...current, address])]);
      }
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not upload the video.'); }
    finally { setBusy(false); setUploading(false); }
  }
  return <>
    <MediaPicker label="" kind="video" addresses={videos} multiple onAdd={files => void add(files)}
      onRemove={address => setVideos(current => current.filter(value => value !== address))} disabled={uploading} busy={busy}/>
    <input type="hidden" name="short_videos" value={videos.join('\n')}/>
    {error && <p role="alert" className="notice warn">{error}</p>}
  </>;
}
