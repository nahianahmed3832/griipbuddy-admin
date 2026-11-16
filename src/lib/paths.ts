const configured = process.env.NEXT_PUBLIC_GRIIP_ADMIN_PREFIX;
export const prefix = configured === '/admin' || configured === '/operations-preview' || configured === '/pilot-operations' ? configured : '';
export function adminPath(path: string) { return prefix + path; }
