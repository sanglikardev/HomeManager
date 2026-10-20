import type { UpkeepCategory } from '../types';

export interface UpkeepTemplate {
  name: string;
  category: UpkeepCategory;
  kind: 'recurring' | 'renewal';
  intervalDays?: number;
  remindDays: number;
  detailFields?: string[]; // suggested details to fill in
  common?: boolean; // pre-ticked
}

export const UPKEEP_TEMPLATES: UpkeepTemplate[] = [
  // Home
  { name: 'Bedsheets wash', category: 'home', kind: 'recurring', intervalDays: 7, remindDays: 1, common: true },
  { name: 'Towels wash', category: 'home', kind: 'recurring', intervalDays: 7, remindDays: 1 },
  { name: 'Curtains wash', category: 'home', kind: 'recurring', intervalDays: 90, remindDays: 7, common: true },
  { name: 'Water purifier filter', category: 'home', kind: 'recurring', intervalDays: 180, remindDays: 14, detailFields: ['Brand / model', 'Service number'], common: true },
  { name: 'AC filter cleaning', category: 'home', kind: 'recurring', intervalDays: 30, remindDays: 3, common: true },
  { name: 'AC servicing', category: 'home', kind: 'recurring', intervalDays: 180, remindDays: 14, detailFields: ['Service number'] },
  { name: 'Kitchen chimney filter', category: 'home', kind: 'recurring', intervalDays: 60, remindDays: 7 },
  { name: 'Fridge deep clean', category: 'home', kind: 'recurring', intervalDays: 30, remindDays: 3 },
  { name: 'Mattress flip', category: 'home', kind: 'recurring', intervalDays: 90, remindDays: 7 },
  { name: 'Pest control', category: 'home', kind: 'recurring', intervalDays: 90, remindDays: 7, detailFields: ['Provider', 'Phone'] },
  { name: 'Water tank cleaning', category: 'home', kind: 'recurring', intervalDays: 180, remindDays: 14 },
  { name: 'Gas cylinder booking', category: 'home', kind: 'recurring', intervalDays: 45, remindDays: 5, detailFields: ['Consumer number', 'Distributor'] },
  // Vehicles
  { name: 'Car service', category: 'vehicle', kind: 'recurring', intervalDays: 180, remindDays: 14, detailFields: ['Vehicle number', 'Service centre'], common: true },
  { name: 'Bike service', category: 'vehicle', kind: 'recurring', intervalDays: 120, remindDays: 10, detailFields: ['Vehicle number', 'Service centre'], common: true },
  { name: 'Car PUC', category: 'vehicle', kind: 'renewal', remindDays: 10, detailFields: ['Vehicle number'] },
  { name: 'Bike PUC', category: 'vehicle', kind: 'renewal', remindDays: 10, detailFields: ['Vehicle number'] },
  { name: 'Car tyre rotation', category: 'vehicle', kind: 'recurring', intervalDays: 180, remindDays: 14 },
  // Insurance
  { name: 'Car insurance', category: 'insurance', kind: 'renewal', remindDays: 30, detailFields: ['Insurer', 'Policy number', 'Premium'], common: true },
  { name: 'Bike insurance', category: 'insurance', kind: 'renewal', remindDays: 30, detailFields: ['Insurer', 'Policy number', 'Premium'], common: true },
  { name: 'Health insurance', category: 'insurance', kind: 'renewal', remindDays: 30, detailFields: ['Insurer', 'Policy number', 'Premium', 'Members covered'], common: true },
  { name: 'Home insurance', category: 'insurance', kind: 'renewal', remindDays: 30, detailFields: ['Insurer', 'Policy number'] },
  { name: 'Life insurance premium', category: 'insurance', kind: 'renewal', remindDays: 30, detailFields: ['Insurer', 'Policy number', 'Premium'] },
  // Health
  { name: 'Dental check-up', category: 'health', kind: 'recurring', intervalDays: 180, remindDays: 14 },
  { name: 'Annual health check-up', category: 'health', kind: 'recurring', intervalDays: 365, remindDays: 30 },
  { name: 'Medicine cabinet expiry check', category: 'health', kind: 'recurring', intervalDays: 90, remindDays: 7 },
];
