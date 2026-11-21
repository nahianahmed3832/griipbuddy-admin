'use client';

import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
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

function MediaPicker({ label, addresses, kind, multiple, onAdd, onRemove, onMove, onPrimary, disabled, busy }: {
  label: string; addresses: string[]; kind: 'image' | 'video'; multiple?: boolean;
  onAdd: (files: File[]) => void; onRemove: (address: string) => void; disabled: boolean; busy: boolean;
  onMove?: (index: number, offset: number) => void; onPrimary?: (address: string) => void;
}) {
  const video = kind === 'video';
  return <div className={styles.mediaPicker} data-video={video}>
    {label && <p>{label}</p>}
    {addresses.length > 0 && <div className={styles.mediaGrid}>{addresses.map((address, index) => <div className={styles.mediaTile} key={address}>
      {video ? <video src={productionCmsPreview(address)} controls preload="metadata"/> :
        // eslint-disable-next-line @next/next/no-img-element
        <img src={productionCmsPreview(address)} alt={label + ' preview'} referrerPolicy="no-referrer"/>}
      {onMove && <div className={styles.mediaTileActions}>
        <button type="button" disabled={disabled || index === 0} onClick={() => onMove(index, -1)}
          aria-label={'Move gallery image ' + (index + 1) + ' earlier'}>Earlier</button>
        <button type="button" disabled={disabled || index === addresses.length - 1} onClick={() => onMove(index, 1)}
          aria-label={'Move gallery image ' + (index + 1) + ' later'}>Later</button>
        {onPrimary && <button type="button" disabled={disabled} onClick={() => onPrimary(address)}
          aria-label={'Make gallery image ' + (index + 1) + ' the thumbnail'}>Thumbnail</button>}
      </div>}
      <button type="button" aria-label={'Remove ' + (label || 'video') + (addresses.length > 1 ? ' ' + (index + 1) : '')} disabled={disabled} onClick={() => onRemove(address)}>
        <Trash2 size={15} aria-hidden="true"/>
      </button>
    </div>)}</div>}
    <label className={video ? styles.videoUpload : styles.imageUpload}>
      <span className={styles.uploadIcon}>{video ? <Sparkles size={20}/> : <Plus size={20}/>}</span>
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

export function ProductionProductImages({ initial, gallery, uploading, setUploading, onSliderImages }: {
  initial: string; gallery: string; uploading: boolean; setUploading: (value: boolean) => void; onSliderImages?: (items: string[]) => void;
}) {
  const [thumbnail, setThumbnail] = useState(initial);
  const [images, setImages] = useState(lines(gallery));
  useEffect(() => { onSliderImages?.(images); }, [images, onSliderImages]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  function move(index: number, offset: number) {
    setImages(current => {
      const ordered = [...current];
      const [address] = ordered.splice(index, 1);
      ordered.splice(index + offset, 0, address);
      return ordered;
    });
  }
  function useAsThumbnail(address: string) {
    setThumbnail(address);
    setImages(current => [...new Set([thumbnail, ...current].filter(image => image && image !== address))]);
  }
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
        onRemove={address => setImages(current => current.filter(value => value !== address))}
        onMove={move} onPrimary={useAsThumbnail} disabled={uploading} busy={busy === 'Slider Images'}/>
    </div>
    <input type="hidden" name="thumbnail" value={thumbnail}/>
    <input type="hidden" name="slider_images" value={images.join('\n')}/>
    {error && <p role="alert" className="notice warn">{error}</p>}
  </>;
}

type Clip = { url: string; size?: number; ratio?: string; duration?: number; format?: string; title?: string; thumbnail?: string };

function getVideoInfo(file: File): Promise<Pick<Clip, 'ratio' | 'duration'>> {
  return new Promise(resolve => {
    const source = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata'; video.muted = true;
    const finish = (info: Pick<Clip, 'ratio' | 'duration'>) => {
      clearTimeout(timer);
      video.onloadedmetadata = video.onerror = null;
      video.removeAttribute('src'); URL.revokeObjectURL(source);
      resolve(info);
    };
    const timer = window.setTimeout(() => finish({}), 4000);
    video.onloadedmetadata = () => {
      const { videoWidth, videoHeight, duration } = video;
      const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
      const divisor = gcd(videoWidth, videoHeight);
      finish({
        ...(divisor > 0 && { ratio: videoWidth / divisor + ':' + videoHeight / divisor }),
        ...(Number.isFinite(duration) && { duration: Math.round(duration) }),
      });
    };
    video.onerror = () => finish({});
    video.src = source;
  });
}

export function ProductionProductVideos({ initial, uploading, setUploading }: {
  initial: string; uploading: boolean; setUploading: (value: boolean) => void;
}) {
  const [videos, setVideos] = useState<Clip[]>(() => {
    try { return (JSON.parse(initial) as Clip[]).filter(video => typeof video.url === 'string' && video.url); }
    catch { return []; }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function add(files: File[]) {
    if (uploading) return;
    setBusy(true); setError(''); setUploading(true);
    try {
      for (const file of files) {
        if (!videoFiles.split(',').includes(file.type)) throw new Error('Choose an MP4, WebM, Ogg or MOV video.');
        if (file.size > 500 * 1024 * 1024) throw new Error('Videos must be 500 MB or smaller.');
        const metric = getVideoInfo(file);
        const [url, info] = await Promise.all([uploadProductMedia(file, 'video'), metric]);
        const format = file.type === 'video/quicktime' ? 'mov' : file.type.split('/')[1];
        setVideos(current => current.some(video => video.url === url) ? current : [...current, { url, format, size: file.size, title: '', ...info }]);
      }
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not upload the video.'); }
    finally { setBusy(false); setUploading(false); }
  }
  return <>
    <div className={styles.clipUploader}>
      <MediaPicker label="" kind="video" addresses={[]} multiple onAdd={files => void add(files)} onRemove={() => {}}
        disabled={uploading} busy={busy}/>
      {videos.length > 0 && <div className={styles.clipGrid}>{videos.map(video => <div className={styles.clip} key={video.url}>
        <div>
          <video src={productionCmsPreview(video.url)} muted playsInline preload="metadata"/>
          <button className={styles.iconButton} type="button" aria-label="Remove short video" disabled={uploading} onClick={() =>
            setVideos(current => current.filter(item => item.url !== video.url))}><Trash2 size={14} aria-hidden="true"/></button>
          <small>{[video.ratio, typeof video.size === 'number' ? (video.size / 1024 / 1024).toFixed(1) + 'MB' : ''].filter(Boolean).join(' · ')}</small>
        </div>
        <input placeholder="Caption (optional)" aria-label="Caption (optional)" maxLength={200} value={video.title ?? ''} onChange={event =>
          setVideos(current => current.map(item => item.url === video.url ? { ...item, title: event.target.value } : item))}/>
      </div>)}</div>}
    </div>
    <input type="hidden" name="short_videos" value={videos.map(video => video.url).join('\n')}/>
    <input type="hidden" name="short_video_details" value={JSON.stringify(videos)}/>
    {error && <p role="alert" className="notice warn">{error}</p>}
  </>;
}
