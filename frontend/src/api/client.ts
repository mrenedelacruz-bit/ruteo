import type {
  CurrentUser,
  Customer,
  DispatchResult,
  Depot,
  GeocodeResult,
  ManagedUser,
  Order,
  Product,
  Trip,
  Truck,
  TruckLoad,
} from "./types";

// "" = mismo origen (backend sirviendo el frontend compilado, p.ej. en
// produccion). En desarrollo local con `npm run dev`, .env.local define
// VITE_API_URL apuntando al backend en otro puerto.
const BASE_URL = import.meta.env.VITE_API_URL ?? "";
const TOKEN_KEY = "ruteo_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token === null) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

export class UnauthorizedError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  });
  if (res.status === 401) {
    setToken(null);
    throw new UnauthorizedError("sesion expirada");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: async (username: string, password: string) => {
    const res = await request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setToken(res.access_token);
    return res;
  },
  me: () => request<CurrentUser>("/auth/me"),
  logout: () => setToken(null),
  listProducts: () => request<Product[]>("/products"),
  listTrucks: () => request<Truck[]>("/trucks"),
  listCustomers: () => request<Customer[]>("/customers"),
  createCustomer: (payload: Omit<Customer, "id">) =>
    request<Customer>("/customers", { method: "POST", body: JSON.stringify(payload) }),
  updateCustomer: (id: number, payload: Partial<Omit<Customer, "id">>) =>
    request<Customer>(`/customers/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
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
  loadingStatus: () => request<TruckLoad[]>("/dispatch/loading-status"),
  updatePromisedDate: (orderId: number, promised_date: string) =>
    request<Order>(`/orders/${orderId}/promised-date`, {
      method: "PATCH",
      body: JSON.stringify({ promised_date }),
    }),
  listTrips: (status?: string) =>
    request<Trip[]>(`/trips${status ? `?status=${status}` : ""}`),
  startTrip: (id: number) => request<Trip>(`/trips/${id}/start`, { method: "POST" }),
  cancelTrip: (id: number) => request<Trip>(`/trips/${id}/cancel`, { method: "POST" }),
  deliverStop: (tripId: number, stopId: number) =>
    request<Trip>(`/trips/${tripId}/stops/${stopId}/deliver`, { method: "POST" }),
  listUsers: () => request<ManagedUser[]>("/users"),
  createUser: (payload: { username: string; full_name: string; password: string; role: string }) =>
    request<ManagedUser>("/users", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (
    id: number,
    payload: Partial<{ full_name: string; role: string; is_active: boolean; password: string }>,
  ) => request<ManagedUser>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
};
