import { api, ApiError, arr, canWrite, mongoId, obj, str, type Session } from '@/lib/api';
import { has, type Region } from '@/lib/sections';
import { HeaderMessages } from './production-header-messages';

export async function ProductionHeaderPage({ auth, region }: { auth: Session; region: Region }) {
  if (region !== 'BD' || !has(auth.staff, 'cms.view')) throw new ApiError(403);
  const data = await api('/cms/admin/top-bar-messages', auth.token);
  const rows = arr(data).map(obj).map(row => ({
    id: str(row._id), message: str(row.message), enabled: row.enabled === true, position: Number(row.position) || 0,
  })).filter(row => mongoId(row.id)).sort((a, b) => a.position - b.position);
  const writable = canWrite(auth.staff);
  return <HeaderMessages messages={rows} create={writable && has(auth.staff, 'cms.create')}
    edit={writable && has(auth.staff, 'cms.update')} remove={writable && has(auth.staff, 'cms.delete')}/>;
}
