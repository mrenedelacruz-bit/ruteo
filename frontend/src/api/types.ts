export interface Product {
  id: number;
  code: string;
  name: string;
  unit: string;
}

export interface Compartment {
  id: number;
  truck_id: number;
  position: number;
  capacity: number;
  product_id: number | null;
}

export interface Truck {
  id: number;
  code: string;
  chassis_brand: string;
  chassis_year: number | null;
  tank_brand: string | null;
  tank_year: number | null;
  total_capacity: number;
  capacity_unit: string;
  status: "active" | "maintenance" | "out_of_service";
  notes: string | null;
  compartments: Compartment[];
}

export interface Customer {
  id: number;
  name: string;
  rnc: string | null;
  phone: string | null;
  address: string;
  lat: number;
  lng: number;
  notes: string | null;
}

export interface Depot {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface OrderLine {
  id: number;
  product: Product;
  quantity: number;
}

export type OrderStatus = "pending" | "assigned" | "dispatched" | "delivered" | "cancelled";

export interface Order {
  id: number;
  customer_id: number;
  status: OrderStatus;
  requested_date: string | null;
  created_at: string; // fecha/hora de colocacion; inmutable
  promised_date: string; // fecha objetivo de entrega; editable
  notes: string | null;
  lines: OrderLine[];
}

export interface AllocationOut {
  order_id: number;
  order_line_id: number;
  product_code: string;
  quantity: number;
  compartment_id: number;
  compartment_position: number;
}

export interface StopOut {
  sequence: number;
  order_id: number;
  customer_name: string;
  address: string;
  lat: number;
  lng: number;
  distance_from_prev_km: number;
}

export interface TripOut {
  truck_code: string;
  total_distance_km: number;
  allocations: AllocationOut[];
  stops: StopOut[];
}

export interface ShortfallOut {
  order_id: number;
  order_line_id: number;
  product_code: string;
  quantity: number;
}

export interface DispatchResult {
  trips: TripOut[];
  unassigned_order_ids: number[];
  shortfalls: ShortfallOut[];
}

export interface GeocodeResult {
  display_name: string;
  lat: number;
  lng: number;
}

export interface CurrentUser {
  id: number;
  username: string;
  full_name: string;
  role: "dispatcher" | "clerk";
}

export interface ManagedUser extends CurrentUser {
  is_active: boolean;
}

export type TripStatus = "planned" | "in_progress" | "completed" | "cancelled";

export interface TripStop {
  id: number;
  sequence: number;
  order_id: number;
  customer_name: string;
  address: string;
  distance_from_prev_km: number | null;
  delivered_at: string | null;
}

export interface TripAllocation {
  compartment_position: number;
  product_code: string;
  quantity: number;
  order_id: number;
}

export interface Trip {
  id: number;
  truck_code: string;
  status: TripStatus;
  created_at: string;
  total_distance_km: number | null;
  stops: TripStop[];
  allocations: TripAllocation[];
}

export interface CompartmentLoad {
  compartment_id: number;
  position: number;
  capacity: number;
  dedicated_product_code: string | null; // null = compartimiento flexible
  filled: boolean;
  product_code: string | null; // asignado (filled) o mejor candidato
  quantity_available: number;
  quantity_missing: number;
}

export interface TruckLoad {
  truck_code: string;
  total_capacity: number;
  ready_to_dispatch: boolean;
  compartments: CompartmentLoad[];
}
