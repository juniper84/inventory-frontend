import { apiFetch } from '@/lib/api';

export type Unit = {
  id: string;
  code: string;
  label: string;
  unitType: 'COUNT' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'OTHER';
  businessId?: string | null;
};

export const UNIT_TYPES: Array<Unit['unitType']> = [
  'COUNT',
  'WEIGHT',
  'VOLUME',
  'LENGTH',
  'OTHER',
];

export function buildUnitLabel(unit: Unit) {
  return `${unit.label} (${unit.code})`;
}

export async function loadUnits(token: string) {
  return apiFetch<Unit[]>('/units', { token });
}
