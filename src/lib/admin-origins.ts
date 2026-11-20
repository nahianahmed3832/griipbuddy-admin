export const legacyEditableAdminOrigin = 'https://devadmin.griipbuddy.com';
export const editableAdminOrigin = 'https://admindev.griipbuddy.com';
export const editableAdminOrigins = [legacyEditableAdminOrigin, editableAdminOrigin] as const;

export function isEditableAdminOrigin(origin?: string) {
  return editableAdminOrigins.some(allowed => origin === allowed);
}
