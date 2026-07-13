import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { CurrentUser, ManagedUser } from "../api/types";

export function UsersAdmin({ currentUser }: { currentUser: CurrentUser }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ username: "", full_name: "", password: "", role: "clerk" });

  function load() {
    api.listUsers().then(setUsers).catch((e) => setError(String(e)));
  }

  useEffect(load, []);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage(ok);
      load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api.createUser(form);
      setForm({ username: "", full_name: "", password: "", role: "clerk" });
    }, "Usuario creado.");
  }

  function resetPassword(u: ManagedUser) {
    const pwd = window.prompt(`Nueva clave para ${u.username} (minimo 8 caracteres):`);
    if (!pwd) return;
    run(() => api.updateUser(u.id, { password: pwd }), `Clave de ${u.username} actualizada.`);
  }

  return (
    <div className="panel">
      <h2>Usuarios</h2>

      <form onSubmit={handleCreate} className="form" style={{ marginBottom: "1.5rem" }}>
        <fieldset>
          <legend>Nuevo usuario</legend>
          <div className="row">
            <input
              placeholder="Usuario"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            />
            <input
              placeholder="Nombre completo"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            />
          </div>
          <div className="row">
            <input
              type="password"
              placeholder="Clave (min. 8)"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="clerk">Vendedor</option>
              <option value="dispatcher">Despachador</option>
            </select>
          </div>
          <button type="submit" disabled={!form.username || !form.full_name || form.password.length < 8}>
            Crear usuario
          </button>
        </fieldset>
      </form>

      {error && <p className="msg-error">{error}</p>}
      {message && <p className="msg-ok">{message}</p>}

      <table className="users-table">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Nombre</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isSelf = u.id === currentUser.id;
            return (
              <tr key={u.id} className={u.is_active ? "" : "inactive-row"}>
                <td>{u.username}</td>
                <td>{u.full_name}</td>
                <td>
                  <select
                    value={u.role}
                    disabled={isSelf}
                    onChange={(e) => run(() => api.updateUser(u.id, { role: e.target.value }), "Rol actualizado.")}
                  >
                    <option value="clerk">Vendedor</option>
                    <option value="dispatcher">Despachador</option>
                  </select>
                </td>
                <td>{u.is_active ? "Activo" : "Inactivo"}</td>
                <td>
                  <div className="row">
                    <button
                      className="secondary"
                      disabled={isSelf}
                      onClick={() =>
                        run(
                          () => api.updateUser(u.id, { is_active: !u.is_active }),
                          u.is_active ? "Usuario desactivado." : "Usuario activado.",
                        )
                      }
                    >
                      {u.is_active ? "Desactivar" : "Activar"}
                    </button>
                    <button className="secondary" onClick={() => resetPassword(u)}>
                      Cambiar clave
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
