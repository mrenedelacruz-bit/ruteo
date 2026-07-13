import { useEffect, useState } from "react";
import { api } from "../api/client";
import { DispatchMap } from "../components/DispatchMap";
import type { Depot, DispatchResult, Order } from "../api/types";

export function DispatchBoard() {
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [depotId, setDepotId] = useState<number | "">("");
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadPending() {
    api.listOrders("pending").then(setPendingOrders).catch(() => {});
  }

  useEffect(() => {
    loadPending();
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
      loadPending();
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

      <h3>Pedidos pendientes ({pendingOrders.length})</h3>
      <ul className="order-list">
        {pendingOrders.map((o) => (
          <li key={o.id}>
            #{o.id} — {o.lines.map((l) => `${l.quantity} ${l.product.unit} ${l.product.name}`).join(", ")}
          </li>
        ))}
        {pendingOrders.length === 0 && <li className="muted">No hay pedidos pendientes.</li>}
      </ul>

      {error && <p className="msg-error">{error}</p>}

      {result && (
        <>
          {result.shortfalls.length > 0 && (
            <div className="warning">
              <strong>Capacidad insuficiente para:</strong>
              <ul>
                {result.shortfalls.map((s, i) => (
                  <li key={i}>
                    Pedido #{s.order_id}: faltan {s.quantity} {s.product_code}
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
          ))}
        </>
      )}
    </div>
  );
}
