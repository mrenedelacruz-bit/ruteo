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

  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    address: "",
    lat: "",
    lng: "",
    phone: "",
  });

  const loadCustomers = () => api.listCustomers().then(setCustomers).catch(() => {});

  useEffect(() => {
    loadCustomers();
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

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    const lat = parseFloat(newCustomer.lat);
    const lng = parseFloat(newCustomer.lng);
    if (!newCustomer.name || !newCustomer.address || Number.isNaN(lat) || Number.isNaN(lng)) {
      setMessage({ kind: "error", text: "Completa nombre, direccion y coordenadas validas del cliente." });
      return;
    }
    try {
      const created = await api.createCustomer({
        name: newCustomer.name,
        address: newCustomer.address,
        lat,
        lng,
        phone: newCustomer.phone || null,
        rnc: null,
        notes: null,
      });
      await loadCustomers();
      setCustomerId(created.id);
      setShowNewCustomer(false);
      setNewCustomer({ name: "", address: "", lat: "", lng: "", phone: "" });
      setMessage({ kind: "ok", text: `Cliente "${created.name}" creado.` });
    } catch (err) {
      setMessage({ kind: "error", text: String(err) });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (customerId === "") {
      setMessage({ kind: "error", text: "Selecciona un cliente." });
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
      setMessage({ kind: "ok", text: `Pedido #${order.id} creado correctamente.` });
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

      <form onSubmit={handleSubmit} className="form">
        <label>
          Cliente
          <div className="row">
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
            <button type="button" className="secondary" onClick={() => setShowNewCustomer((v) => !v)}>
              {showNewCustomer ? "Cancelar" : "+ Nuevo cliente"}
            </button>
          </div>
        </label>

        {showNewCustomer && (
          <div className="subform">
            <input
              placeholder="Nombre del cliente"
              value={newCustomer.name}
              onChange={(e) => setNewCustomer((v) => ({ ...v, name: e.target.value }))}
            />
            <input
              placeholder="Direccion"
              value={newCustomer.address}
              onChange={(e) => setNewCustomer((v) => ({ ...v, address: e.target.value }))}
            />
            <div className="row">
              <input
                placeholder="Latitud"
                value={newCustomer.lat}
                onChange={(e) => setNewCustomer((v) => ({ ...v, lat: e.target.value }))}
              />
              <input
                placeholder="Longitud"
                value={newCustomer.lng}
                onChange={(e) => setNewCustomer((v) => ({ ...v, lng: e.target.value }))}
              />
            </div>
            <input
              placeholder="Telefono (opcional)"
              value={newCustomer.phone}
              onChange={(e) => setNewCustomer((v) => ({ ...v, phone: e.target.value }))}
            />
            <button type="button" onClick={handleCreateCustomer}>
              Guardar cliente
            </button>
          </div>
        )}

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
