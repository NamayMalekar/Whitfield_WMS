import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authApi } from "../api/endpoints";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem("wms_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [permissions, setPermissions] = useState(() => {
    try {
      const raw = localStorage.getItem("wms_permissions");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("wms_token");
    if (!token) {
      setReady(true);
      return;
    }
    authApi
      .me()
      .then((res) => {
        setUser(res.data);
        localStorage.setItem("wms_user", JSON.stringify(res.data));
        return authApi.myPermissions();
      })
      .then((res) => {
        if (res) {
          setPermissions(res.data);
          localStorage.setItem("wms_permissions", JSON.stringify(res.data));
        }
      })
      .catch(() => {
        localStorage.removeItem("wms_token");
        localStorage.removeItem("wms_user");
        localStorage.removeItem("wms_permissions");
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await authApi.login(username, password);
    const { access_token, user: u, permissions: perms } = res.data;
    localStorage.setItem("wms_token", access_token);
    localStorage.setItem("wms_user", JSON.stringify(u));
    localStorage.setItem("wms_permissions", JSON.stringify(perms));
    setUser(u);
    setPermissions(perms);
    return u;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("wms_token");
    localStorage.removeItem("wms_user");
    localStorage.removeItem("wms_permissions");
    setUser(null);
    setPermissions([]);
    window.location.href = "/login";
  }, []);

  const can = useCallback((perm) => permissions.includes(perm), [permissions]);

  return (
    <AuthContext.Provider value={{ user, permissions, ready, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
