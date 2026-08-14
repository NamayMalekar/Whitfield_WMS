import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { inventoryApi } from '../services/api'
import { useAuth } from './AuthContext'

const WarehouseContext = createContext(null)
const ACTIVE_KEY = 'whitfield.warehouse'

export function WarehouseProvider({ children }) {
  const { user } = useAuth()
  const [warehouses, setWarehouses] = useState([])
  const [active, setActiveState] = useState(localStorage.getItem(ACTIVE_KEY) || '')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    inventoryApi
      .warehouses()
      .then(({ data }) => {
        setWarehouses(data)
        setActiveState((current) => {
          if (current && data.some((w) => w.code === current)) return current
          const home = data.find((w) => w.id === user.warehouse_id)
          const fallback = home?.code || data[0]?.code || ''
          if (fallback) localStorage.setItem(ACTIVE_KEY, fallback)
          return fallback
        })
      })
      .catch(() => setWarehouses([]))
      .finally(() => setLoading(false))
  }, [user])

  const setActive = useCallback((code) => {
    localStorage.setItem(ACTIVE_KEY, code)
    setActiveState(code)
  }, [])

  const value = useMemo(
    () => ({
      warehouses,
      active,
      setActive,
      loading,
      activeWarehouse: warehouses.find((w) => w.code === active) || null,
    }),
    [warehouses, active, setActive, loading],
  )

  return <WarehouseContext.Provider value={value}>{children}</WarehouseContext.Provider>
}

export function useWarehouse() {
  const context = useContext(WarehouseContext)
  if (!context) throw new Error('useWarehouse must be used inside WarehouseProvider')
  return context
}
