const rawImageOrigin = process.env.GRIIP_ADMIN_IMAGE_ORIGIN ?? '';
let imageOrigin = '';
try {
  const parsed = new URL(rawImageOrigin);
  if (parsed.protocol === 'https:' && parsed.origin === rawImageOrigin) imageOrigin = ' ' + parsed.origin;
} catch { /* Use a placeholder image until a media origin is configured. */ }

const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:" + imageOrigin + "; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  devIndicators: false,
  ...(process.env.GRIIP_ADMIN_STANDALONE === '1' && { output: 'standalone' }),
  basePath: ['/admin', '/operations-preview', '/pilot-operations'].includes(process.env.NEXT_PUBLIC_GRIIP_ADMIN_PREFIX) ? process.env.NEXT_PUBLIC_GRIIP_ADMIN_PREFIX : '',
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
        { key: 'Content-Security-Policy', value: csp },
      ],
    }, {
      source: '/desk/orders/:path*',
      headers: [{ key: 'Content-Security-Policy', value: csp.replace(/img-src[^;]+;/, "img-src 'self' data: https:;") }],
    }, ...['/dashboard/orders/:path*', '/dashboard/order-details/:id', '/dashboard/create-order'].map(source => ({
      source,
      headers: [{ key: 'Content-Security-Policy', value: csp.replace(/img-src[^;]+;/, "img-src 'self' data: https:;") }],
    })), {
      source: '/desk/content/:path*',
      headers: [{ key: 'Content-Security-Policy', value: csp.replace(/img-src[^;]+;/, "img-src 'self' data: https:; media-src 'self' https:;") }],
    }];
  },
};
export default config;
