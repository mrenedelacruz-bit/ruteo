import type {
  Customer,
  DispatchResult,
  Depot,
  GeocodeResult,
  Order,
  Product,
  Truck,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listProducts: () => request<Product[]>("/products"),
  listTrucks: () => request<Truck[]>("/trucks"),
  listCustomers: () => request<Customer[]>("/customers"),
  createCustomer: (payload: Omit<Customer, "id">) =>
    request<Customer>("/customers", { method: "POST", body: JSON.stringify(payload) }),
  listDepots: () => request<Depot[]>("/depots"),
  listOrders: (status?: string) =>
    request<Order[]>(`/orders${status ? `?status=${status}` : ""}`),
  createOrder: (payload: {
    customer_id: number;
    requested_date?: string | null;
    notes?: string | null;
    lines: { product_id: number; quantity: number }[];
  }) => request<Order>("/orders", { method: "POST", body: JSON.stringify(payload) }),
  geocode: (q: string) =>
    request<GeocodeResult[]>(`/geocode?q=${encodeURIComponent(q)}`),
  generateDispatch: (depot_id: number, order_ids?: number[]) =>
    request<DispatchResult>("/dispatch/generate", {
      method: "POST",
      body: JSON.stringify({ depot_id, order_ids: order_ids ?? null }),
    }),
};
