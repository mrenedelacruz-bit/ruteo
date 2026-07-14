import { useEffect, useState } from "react";
import "./App.css";
import { api, getToken } from "./api/client";
import type { CurrentUser } from "./api/types";
import { OrderForm } from "./pages/OrderForm";
import { PendingOrdersBoard } from "./pages/PendingOrdersBoard";
import { DispatchBoard } from "./pages/DispatchBoard";
import { TripsBoard } from "./pages/TripsBoard";
import { FleetLoadingBoard } from "./pages/FleetLoadingBoard";
import { UsersAdmin } from "./pages/UsersAdmin";
import { Login } from "./pages/Login";

type Tab = "orders" | "pending" | "dispatch" | "trips" | "loading" | "users";

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

  const isDispatcher = user.role === "dispatcher";

  function renderTab(currentUser: CurrentUser) {
    switch (tab) {
      case "pending":
        return <PendingOrdersBoard />;
      case "dispatch":
        return isDispatcher ? <DispatchBoard /> : <OrderForm />;
      case "trips":
        return isDispatcher ? <TripsBoard /> : <OrderForm />;
      case "loading":
        return isDispatcher ? <FleetLoadingBoard /> : <OrderForm />;
      case "users":
        return isDispatcher ? <UsersAdmin currentUser={currentUser} /> : <OrderForm />;
      default:
        return <OrderForm />;
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Ruteo — Combustible</h1>
        <nav>
          <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>
            Tomar pedido
          </button>
          <button className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")}>
            Pedidos pendientes
          </button>
          {isDispatcher && (
            <>
              <button className={tab === "dispatch" ? "active" : ""} onClick={() => setTab("dispatch")}>
                Despacho
              </button>
              <button className={tab === "trips" ? "active" : ""} onClick={() => setTab("trips")}>
                Viajes
              </button>
              <button className={tab === "loading" ? "active" : ""} onClick={() => setTab("loading")}>
                Carga de flota
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
      <main>{renderTab(user)}</main>
    </div>
  );
}

export default App;
