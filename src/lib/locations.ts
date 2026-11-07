import type { Region } from './sections';

export const locationsPath = '/desk/inventory/warehouses';
export const locationsEndpoint = '/business-location/workspace';
export const locationTypes = { OUTLET: 'Outlet', WAREHOUSE: 'Warehouse' };
export const marketLabel = (region: Region) => region === 'BD' ? 'Bangladesh' : 'International';

export type LocationFields = {
  name: string;
  type: string;
  address: {
    local_address: string;
    division: string;
    district: string;
    thana: string;
    zip_code: string;
  };
  manager_name: string;
  contact_numbers: string[];
};

export type LocationRecord = LocationFields & { id: string; revision: string | null };
