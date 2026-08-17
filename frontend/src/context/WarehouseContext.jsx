import { createContext, useContext, useEffect, useState } from "react";
import { inventoryApi } from "../api/endpoints";

const WarehouseContext = createContext(null);

export function WarehouseProvider({ children }) {
  const [warehouses, setWarehouses] = useState([]);
  const [active, setActive] = useState(() => localStorage.getItem("wms_active_wh") || "all");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    inventoryApi
      .warehouses()
      .then((res) => setWarehouses(res.data))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  function setAndPersist(code) {
    setActive(code);
    localStorage.setItem("wms_active_wh", code);
  }

  return (
    <WarehouseContext.Provider value={{ warehouses, active, setActive: setAndPersist, loaded }}>
      {children}
    </WarehouseContext.Provider>
  );
}

export function useWarehouse() {
  const ctx = useContext(WarehouseContext);
  if (!ctx) throw new Error("useWarehouse must be used within WarehouseProvider");
  return ctx;
}
