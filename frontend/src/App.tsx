import { useEffect, useState } from "react";
import "./App.css";
import { api, getToken } from "./api/client";
import type { CurrentUser } from "./api/types";
import { OrderForm } from "./pages/OrderForm";
import { DispatchBoard } from "./pages/DispatchBoard";
import { TripsBoard } from "./pages/TripsBoard";
import { UsersAdmin } from "./pages/UsersAdmin";
import { Login } from "./pages/Login";

type Tab = "orders" | "dispatch" | "trips" | "users";

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
            <>
              <button className={tab === "dispatch" ? "active" : ""} onClick={() => setTab("dispatch")}>
                Despacho
              </button>
              <button className={tab === "trips" ? "active" : ""} onClick={() => setTab("trips")}>
                Viajes
              </button>
              <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
                Usuarios
              </button>
            </>
          )}
          <span className="user-badge">
            {user.full_name} ({user.role === "dispatcher" ? "despachador" : "vendedor"})
          </span>
          <button className="secondary" onClick={handleLogout}>
            Salir
          </button>
        </nav>
      </header>
      <main>
        {user.role !== "dispatcher" || tab === "orders" ? (
          <OrderForm />
        ) : tab === "dispatch" ? (
          <DispatchBoard />
        ) : tab === "trips" ? (
          <TripsBoard />
        ) : (
          <UsersAdmin currentUser={user} />
        )}
      </main>
    </div>
  );
}

export default App;
