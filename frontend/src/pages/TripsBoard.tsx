import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Trip, TripStatus } from "../api/types";

const STATUS_LABEL: Record<TripStatus, string> = {
  planned: "Planificado",
  in_progress: "En ruta",
  completed: "Completado",
  cancelled: "Cancelado",
};

export function TripsBoard() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [filter, setFilter] = useState<TripStatus | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load(f: TripStatus | "" = filter) {
    api
      .listTrips(f || undefined)
      .then(setTrips)
      .catch((e) => setError(String(e)));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function act(fn: () => Promise<Trip>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Viajes</h2>

      <div className="row" style={{ maxWidth: 320 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value as TripStatus | "")}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="msg-error">{error}</p>}
      {trips.length === 0 && <p className="muted">No hay viajes.</p>}

      {trips.map((trip) => (
        <div className="trip-card" key={trip.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h4>
              Viaje #{trip.id} — Camion {trip.truck_code}
              {trip.total_distance_km != null && <> — {trip.total_distance_km.toFixed(1)} km</>}
            </h4>
            <span className={`status status-${trip.status}`}>{STATUS_LABEL[trip.status]}</span>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th>Direccion</th>
                <th>Entrega</th>
              </tr>
            </thead>
            <tbody>
              {trip.stops.map((s) => (
                <tr key={s.id}>
                  <td>{s.sequence}</td>
                  <td>{s.customer_name}</td>
                  <td>{s.address}</td>
                  <td>
                    {s.delivered_at ? (
                      <span className="msg-ok">Entregado</span>
                    ) : trip.status === "in_progress" ? (
                      <button disabled={busy} onClick={() => act(() => api.deliverStop(trip.id, s.id))}>
                        Marcar entregado
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="row" style={{ marginTop: "0.75rem", maxWidth: 400 }}>
            {trip.status === "planned" && (
              <button disabled={busy} onClick={() => act(() => api.startTrip(trip.id))}>
                Iniciar viaje
              </button>
            )}
            {(trip.status === "planned" || trip.status === "in_progress") && (
              <button className="secondary" disabled={busy} onClick={() => act(() => api.cancelTrip(trip.id))}>
                Cancelar viaje
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
