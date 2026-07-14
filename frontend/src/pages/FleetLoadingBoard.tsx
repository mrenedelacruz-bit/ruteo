import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { TruckLoad } from "../api/types";

export function FleetLoadingBoard() {
  const [trucks, setTrucks] = useState<TruckLoad[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    api
      .loadingStatus()
      .then(setTrucks)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Carga de flota</h2>
        <button className="secondary" onClick={load} disabled={loading}>
          {loading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>
      <p className="muted">
        Estado de cada camion activo con los pedidos pendientes de hoy. Un camion solo sale cuando
        todos sus compartimientos quedan llenos exactamente a su capacidad.
      </p>

      {error && <p className="msg-error">{error}</p>}

      {trucks.map((t) => (
        <div className="trip-card" key={t.truck_code}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h4>
              Camion {t.truck_code} — {t.total_capacity} gal
            </h4>
            <span
              className={`status ${
                t.on_active_trip ? "status-planned" : t.ready_to_dispatch ? "status-completed" : "status-in_progress"
              }`}
            >
              {t.on_active_trip ? "En viaje (ver pestaña Viajes)" : t.ready_to_dispatch ? "Listo para despachar" : "Incompleto"}
            </span>
          </div>
          {t.on_active_trip && (
            <p className="muted">
              Ya tiene un viaje planificado o en curso; sus compartimientos estan comprometidos con
              ese viaje y no participan en la demanda pendiente de hoy.
            </p>
          )}
          <table>
            <thead>
              <tr>
                <th>Compartimiento</th>
                <th>Capacidad</th>
                <th>Producto</th>
                <th>Estado</th>
                <th>Disponible</th>
                <th>Falta</th>
              </tr>
            </thead>
            <tbody>
              {t.compartments.map((c) => (
                <tr key={c.compartment_id}>
                  <td>#{c.position}</td>
                  <td>{c.capacity} gal</td>
                  <td>{c.dedicated_product_code ?? <em>flexible</em>}</td>
                  <td>
                    {c.filled ? (
                      <span className="msg-ok">Lleno ({c.product_code})</span>
                    ) : c.product_code ? (
                      <span>Llenando ({c.product_code})</span>
                    ) : (
                      <span className="muted">Sin demanda</span>
                    )}
                  </td>
                  <td>{c.quantity_available} gal</td>
                  <td>{c.quantity_missing > 0 ? `${c.quantity_missing} gal` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
