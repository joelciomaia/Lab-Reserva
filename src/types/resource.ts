export type ResourceControlType = 'QUANTITY' | 'INDIVIDUAL';

export interface Resource {
  id: string;
  name: string;
  category: string;
  controlType: ResourceControlType;
  totalQuantity: number;
  availableQuantity: number;
  laboratoryId?: string;
  active: boolean;
  notes?: string;
}

export interface ReservationResource {
  resourceId: string;
  resourceName: string;
  quantity: number;
}
