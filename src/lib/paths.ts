export const prefix = process.env.NEXT_PUBLIC_GRIIP_ADMIN_PREFIX === '/admin' ? '/admin' : '';
export function adminPath(path: string) { return prefix + path; }
