const protectedDevAdminOrigins = new Set([
  'https://devadmin.griipbuddy.com',
  'https://admindev.griipbuddy.com',
  'https://classicdev.griipbuddy.com',
]);

export function isProtectedDevAdminOrigin(origin = process.env.GRIIP_ADMIN_PUBLIC_ORIGIN ?? '') {
  return protectedDevAdminOrigins.has(origin);
}
