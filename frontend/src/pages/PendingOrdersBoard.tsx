import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Order } from "../api/types";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-DO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDate(iso: string): string {
  // evita desfases de zona horaria al parsear un "YYYY-MM-DD" puro
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-DO", { dateStyle: "medium" });
}

function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function PendingOrdersBoard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftDate, setDraftDate] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    api
      .listOrders("pending")
      .then((os) => setOrders(os.sort((a, b) => a.promised_date.localeCompare(b.promised_date))))
      .catch((e) => setError(String(e)));
  }

  useEffect(load, []);

  function startEdit(o: Order) {
    setEditingId(o.id);
    setDraftDate(o.promised_date);
    setError(null);
  }

  async function saveEdit(o: Order) {
    setSaving(true);
    setError(null);
    try {
      await api.updatePromisedDate(o.id, draftDate);
      setEditingId(null);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const today = todayLocalISO();

  return (
    <div className="panel">
      <h2>Pedidos pendientes ({orders.length})</h2>
      {error && <p className="msg-error">{error}</p>}

      {orders.length === 0 ? (
        <p className="muted">No hay pedidos pendientes.</p>
      ) : (
        <table className="pending-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Colocado el</th>
              <th>Fecha de promesa</th>
              <th>Productos</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const overdue = o.promised_date < today;
              return (
                <tr key={o.id} className={overdue ? "overdue-row" : ""}>
                  <td>#{o.id}</td>
                  <td>{formatDateTime(o.created_at)}</td>
                  <td>
                    {editingId === o.id ? (
                      <div className="row">
                        <input
                          type="date"
                          value={draftDate}
                          min={o.created_at.slice(0, 10)}
                          onChange={(e) => setDraftDate(e.target.value)}
                        />
                        <button disabled={saving} onClick={() => saveEdit(o)}>
                          Guardar
                        </button>
                        <button className="secondary" onClick={() => setEditingId(null)}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <span>
                        {formatDate(o.promised_date)}
                        {overdue && <span className="badge-overdue"> atrasado</span>}{" "}
                        <button className="secondary" onClick={() => startEdit(o)}>
                          Cambiar
                        </button>
                      </span>
                    )}
                  </td>
                  <td>{o.lines.map((l) => `${l.quantity} ${l.product.unit} ${l.product.name}`).join(", ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
