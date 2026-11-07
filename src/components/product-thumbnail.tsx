import { Package } from 'lucide-react';

export function ProductThumbnail({ source }: { source: unknown }) {
  const configured = process.env.GRIIP_ADMIN_IMAGE_ORIGIN;
  if (configured && typeof source === 'string') {
    try {
      const image = new URL(source);
      if (image.protocol === 'https:' && image.origin === configured && !image.username && !image.password) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img className="overview-thumbnail" src={image.href} width={32} height={32} alt="" loading="lazy" referrerPolicy="no-referrer"/>;
      }
    } catch { /* Old records can contain incomplete asset URLs. */ }
  }
  return <span className="overview-thumbnail overview-placeholder" aria-hidden="true"><Package size={15}/></span>;
}
