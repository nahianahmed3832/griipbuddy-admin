const rawImageOrigin = process.env.GRIIP_ADMIN_IMAGE_ORIGIN ?? '';
let imageOrigin = '';
try {
  const parsed = new URL(rawImageOrigin);
  if (parsed.protocol === 'https:' && parsed.origin === rawImageOrigin) imageOrigin = ' ' + parsed.origin;
} catch { /* Product thumbnails use a local fallback until a media origin is configured. */ }

/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  devIndicators: false,
  basePath: process.env.NEXT_PUBLIC_GRIIP_ADMIN_PREFIX === '/admin' ? '/admin' : '',
  experimental: { cpus: 2 },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'same-origin' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        { key: 'Cache-Control', value: 'private, no-store' },
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:" + imageOrigin + "; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" },
      ],
    }];
  },
};
export default config;
