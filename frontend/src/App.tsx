import { useState } from "react";
import "./App.css";
import { OrderForm } from "./pages/OrderForm";
import { DispatchBoard } from "./pages/DispatchBoard";

type Tab = "orders" | "dispatch";

function App() {
  const [tab, setTab] = useState<Tab>("orders");

  return (
    <div className="app">
      <header className="app-header">
        <h1>Ruteo — Combustible</h1>
        <nav>
          <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>
            Tomar pedido
          </button>
          <button className={tab === "dispatch" ? "active" : ""} onClick={() => setTab("dispatch")}>
            Despacho
          </button>
        </nav>
      </header>
      <main>{tab === "orders" ? <OrderForm /> : <DispatchBoard />}</main>
    </div>
  );
}

export default App;
