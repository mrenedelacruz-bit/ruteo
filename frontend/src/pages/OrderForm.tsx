import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Customer, Product } from "../api/types";

interface OrderLineDraft {
  product_id: number | "";
  quantity: string;
}

export function OrderForm() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState<number | "">("");
  const [lines, setLines] = useState<OrderLineDraft[]>([{ product_id: "", quantity: "" }]);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .listCustomers()
      .then((cs) => setCustomers(cs.sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {});
    api.listProducts().then(setProducts).catch(() => {});
  }, []);

  function updateLine(index: number, patch: Partial<OrderLineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { product_id: "", quantity: "" }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (customerId === "") {
      setMessage({ kind: "error", text: "Selecciona un cliente (se registran en el modulo Clientes)." });
      return;
    }
    const validLines = lines
      .filter((l) => l.product_id !== "" && l.quantity.trim() !== "")
      .map((l) => ({ product_id: Number(l.product_id), quantity: Number(l.quantity) }));

    if (validLines.length === 0) {
      setMessage({ kind: "error", text: "Agrega al menos un producto con cantidad." });
      return;
    }
    if (validLines.some((l) => l.quantity <= 0)) {
      setMessage({ kind: "error", text: "Las cantidades deben ser mayores que cero." });
      return;
    }

    setSubmitting(true);
    try {
      const order = await api.createOrder({
        customer_id: Number(customerId),
        notes: notes || null,
        lines: validLines,
      });
      setMessage({
        kind: "ok",
        text: `Pedido #${order.id} creado (promesa: ${order.promised_date}). La asignacion a camiones es automatica: si un camion queda completo, el viaje aparece en Viajes.`,
      });
      setLines([{ product_id: "", quantity: "" }]);
      setNotes("");
    } catch (err) {
      setMessage({ kind: "error", text: String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="panel">
      <h2>Nuevo pedido</h2>
      <p className="muted">
        El cliente debe existir en el maestro de <strong>Clientes</strong>; ahi se registran los
        nuevos con su direccion y ubicacion.
      </p>

      <form onSubmit={handleSubmit} className="form">
        <label>
          Cliente
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">-- selecciona un cliente --</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.address}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>Productos</legend>
          {lines.map((line, i) => (
            <div className="row" key={i}>
              <select
                value={line.product_id}
                onChange={(e) => updateLine(i, { product_id: e.target.value ? Number(e.target.value) : "" })}
              >
                <option value="">-- producto --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.unit})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Cantidad"
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: e.target.value })}
              />
              {lines.length > 1 && (
                <button type="button" className="secondary" onClick={() => removeLine(i)}>
                  Quitar
                </button>
              )}
            </div>
          ))}
          <button type="button" className="secondary" onClick={addLine}>
            + Agregar producto
          </button>
        </fieldset>

        <label>
          Notas (opcional)
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>

        <button type="submit" disabled={submitting}>
          {submitting ? "Enviando..." : "Crear pedido"}
        </button>
      </form>

      {message && <p className={message.kind === "ok" ? "msg-ok" : "msg-error"}>{message.text}</p>}
    </div>
  );
}
