export function usesPurpleAdminLayout() {
  return process.env.GRIIP_ADMIN_LAYOUT === 'purple';
}

export function adminOverviewPath() {
  return usesPurpleAdminLayout() ? '/desk/overview' : '/dashboard/overview';
}
