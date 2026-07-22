export type LaboratoryUseType = 'EXCLUSIVE' | 'SHARED' | 'OPEN';

export type LaboratoryOperationalStatus = 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' | 'MAINTENANCE';

export interface Laboratory {
  id: string;
  name: string;
  description: string;
  capacity: number;
  useType: LaboratoryUseType;
  maxSimultaneousClasses: number;
  calendarEnabled: boolean;
  active: boolean;
  status: LaboratoryOperationalStatus;
  statusMessage?: string;
}
