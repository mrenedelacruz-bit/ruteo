import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Customer, GeocodeResult } from "../api/types";

interface CustomerDraft {
  name: string;
  address: string;
  lat: string;
  lng: string;
  phone: string;
  rnc: string;
  notes: string;
}

const EMPTY: CustomerDraft = { name: "", address: "", lat: "", lng: "", phone: "", rnc: "", notes: "" };

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [draft, setDraft] = useState<CustomerDraft>(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [geoResults, setGeoResults] = useState<GeocodeResult[]>([]);
  const [geoSearching, setGeoSearching] = useState(false);

  function load() {
    api
      .listCustomers()
      .then((cs) => setCustomers(cs.sort((a, b) => a.name.localeCompare(b.name))))
      .catch((e) => setMessage({ kind: "error", text: String(e) }));
  }

  useEffect(load, []);

  function startCreate() {
    setEditingId(null);
    setDraft(EMPTY);
    setGeoResults([]);
    setShowForm(true);
    setMessage(null);
  }

  function startEdit(c: Customer) {
    setEditingId(c.id);
    setDraft({
      name: c.name,
      address: c.address,
      lat: String(c.lat),
      lng: String(c.lng),
      phone: c.phone ?? "",
      rnc: c.rnc ?? "",
      notes: c.notes ?? "",
    });
    setGeoResults([]);
    setShowForm(true);
    setMessage(null);
  }

  async function handleGeocodeSearch() {
    if (draft.address.trim().length < 3) {
      setMessage({ kind: "error", text: "Escribe la direccion antes de buscar." });
      return;
    }
    setGeoSearching(true);
    setGeoResults([]);
    try {
      const results = await api.geocode(draft.address);
      if (results.length === 0) {
        setMessage({ kind: "error", text: "Sin coincidencias; puedes ingresar lat/lng manualmente." });
      }
      setGeoResults(results);
    } catch {
      setMessage({ kind: "error", text: "Servicio de busqueda no disponible; ingresa lat/lng manualmente." });
    } finally {
      setGeoSearching(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const lat = parseFloat(draft.lat);
    const lng = parseFloat(draft.lng);
    if (!draft.name || !draft.address || Number.isNaN(lat) || Number.isNaN(lng)) {
      setMessage({ kind: "error", text: "Completa nombre, direccion y coordenadas validas." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        name: draft.name,
        address: draft.address,
        lat,
        lng,
        phone: draft.phone || null,
        rnc: draft.rnc || null,
        notes: draft.notes || null,
      };
      if (editingId === null) {
        await api.createCustomer(payload);
        setMessage({ kind: "ok", text: "Cliente creado." });
      } else {
        await api.updateCustomer(editingId, payload);
        setMessage({ kind: "ok", text: "Cliente actualizado." });
      }
      setShowForm(false);
      setDraft(EMPTY);
      load();
    } catch (err) {
      setMessage({ kind: "error", text: String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Clientes ({customers.length})</h2>
        <button onClick={startCreate}>+ Nuevo cliente</button>
      </div>

      {message && <p className={message.kind === "ok" ? "msg-ok" : "msg-error"}>{message.text}</p>}

      {showForm && (
        <form onSubmit={handleSave} className="form subform" style={{ marginBottom: "1.25rem" }}>
          <strong>{editingId === null ? "Nuevo cliente" : `Editar cliente #${editingId}`}</strong>
          <input
            placeholder="Nombre / razon social"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
          <div className="row">
            <input
              placeholder="Direccion"
              value={draft.address}
              onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
            />
            <button type="button" className="secondary" onClick={handleGeocodeSearch} disabled={geoSearching}>
              {geoSearching ? "Buscando..." : "Buscar en mapa"}
            </button>
          </div>
          {geoResults.length > 0 && (
            <ul className="geo-results">
              {geoResults.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setDraft((d) => ({ ...d, lat: String(r.lat), lng: String(r.lng) }));
                      setGeoResults([]);
                    }}
                  >
                    {r.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="row">
            <input
              placeholder="Latitud"
              value={draft.lat}
              onChange={(e) => setDraft((d) => ({ ...d, lat: e.target.value }))}
            />
            <input
              placeholder="Longitud"
              value={draft.lng}
              onChange={(e) => setDraft((d) => ({ ...d, lng: e.target.value }))}
            />
          </div>
          <div className="row">
            <input
              placeholder="Telefono (opcional)"
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            />
            <input
              placeholder="RNC (opcional)"
              value={draft.rnc}
              onChange={(e) => setDraft((d) => ({ ...d, rnc: e.target.value }))}
            />
          </div>
          <input
            placeholder="Notas (opcional)"
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          />
          <div className="row">
            <button type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button type="button" className="secondary" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Direccion</th>
              <th>Telefono</th>
              <th>RNC</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.address}</td>
                <td>{c.phone ?? "—"}</td>
                <td>{c.rnc ?? "—"}</td>
                <td>
                  <button className="secondary" onClick={() => startEdit(c)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No hay clientes registrados todavia.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
