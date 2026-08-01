import { useEffect, useState } from "react";
import { api } from "../api/client";
import { DispatchMap } from "../components/DispatchMap";
import type { Depot, DispatchResult } from "../api/types";

export function DispatchBoard() {
  const [depots, setDepots] = useState<Depot[]>([]);
  const [depotId, setDepotId] = useState<number | "">("");
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listDepots().then((ds) => {
      setDepots(ds);
      if (ds.length > 0) setDepotId(ds[0].id);
    });
  }, []);

  async function handleGenerate() {
    if (depotId === "") return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.generateDispatch(Number(depotId));
      setResult(res);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const depot = depots.find((d) => d.id === depotId) ?? null;

  return (
    <div className="panel">
      <h2>Panel de despacho</h2>
      <p className="muted">
        Genera un despacho con los camiones que ya esten completos a capacidad. Revisa "Pedidos
        pendientes" y "Carga de flota" para ver que falta antes de generar.
      </p>

      <div className="row">
        <select value={depotId} onChange={(e) => setDepotId(e.target.value ? Number(e.target.value) : "")}>
          {depots.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button onClick={handleGenerate} disabled={loading || depotId === ""}>
          {loading ? "Generando..." : "Generar despacho"}
        </button>
      </div>

      {error && <p className="msg-error">{error}</p>}

      {result && (
        <>
          {result.unassigned_order_ids.length > 0 && (
            <p className="muted">
              Pedidos aun pendientes (ningun camion se completo con ellos todavia): #
              {result.unassigned_order_ids.join(", #")}
            </p>
          )}

          {result.shortfalls.length > 0 && (
            <div className="warning">
              <strong>Ningun camion activo puede transportar esto (no es falta de volumen, hace falta ajustar la flota):</strong>
              <ul>
                {result.shortfalls.map((s, i) => (
                  <li key={i}>
                    Pedido #{s.order_id}: {s.quantity} {s.product_code}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {depot && result.trips.length > 0 && <DispatchMap depot={depot} trips={result.trips} />}

          <h3>Viajes generados ({result.trips.length})</h3>
          {result.trips.map((trip) => (
            <div className="trip-card" key={trip.truck_code}>
              <h4>
                Camion {trip.truck_code} — {trip.total_distance_km.toFixed(1)} km
              </h4>
              <ol>
                {trip.stops.map((s) => (
                  <li key={s.order_id}>
                    {s.customer_name} ({s.address}) — {s.distance_from_prev_km.toFixed(1)} km desde parada anterior
                  </li>
                ))}
              </ol>
              <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th>Compartimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {trip.allocations.map((a, i) => (
                    <tr key={i}>
                      <td>#{a.order_id}</td>
                      <td>{a.product_code}</td>
                      <td>{a.quantity}</td>
                      <td>#{a.compartment_position}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
