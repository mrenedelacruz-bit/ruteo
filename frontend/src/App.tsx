import { useEffect, useState } from "react";
import "./App.css";
import { api, getToken } from "./api/client";
import type { CurrentUser } from "./api/types";
import { OrderForm } from "./pages/OrderForm";
import { DispatchBoard } from "./pages/DispatchBoard";
import { Login } from "./pages/Login";

type Tab = "orders" | "dispatch";

function App() {
  const [tab, setTab] = useState<Tab>("orders");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  function handleLogout() {
    api.logout();
    setUser(null);
    setTab("orders");
  }

  if (checking) return null;

  if (!user) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>Ruteo — Combustible</h1>
        </header>
        <main>
          <Login onLogin={setUser} />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Ruteo — Combustible</h1>
        <nav>
          <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>
            Tomar pedido
          </button>
          {user.role === "dispatcher" && (
            <button className={tab === "dispatch" ? "active" : ""} onClick={() => setTab("dispatch")}>
              Despacho
            </button>
          )}
          <span className="user-badge">
            {user.full_name} ({user.role === "dispatcher" ? "despachador" : "vendedor"})
          </span>
          <button className="secondary" onClick={handleLogout}>
            Salir
          </button>
        </nav>
      </header>
      <main>{tab === "orders" || user.role !== "dispatcher" ? <OrderForm /> : <DispatchBoard />}</main>
    </div>
  );
}

export default App;
