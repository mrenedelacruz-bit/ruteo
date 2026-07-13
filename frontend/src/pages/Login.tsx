import { useState } from "react";
import { api } from "../api/client";
import type { CurrentUser } from "../api/types";

export function Login({ onLogin }: { onLogin: (user: CurrentUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.login(username, password);
      onLogin(await api.me());
    } catch {
      setError("Usuario o clave incorrectos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel login-panel">
      <h2>Iniciar sesion</h2>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Usuario
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label>
          Clave
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" disabled={loading || !username || !password}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
        {error && <p className="msg-error">{error}</p>}
      </form>
    </div>
  );
}
