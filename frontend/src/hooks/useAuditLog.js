import { useCallback, useEffect, useMemo, useState } from 'react'
import { auditApi } from '../services/api'

/** Filterable, polling view of the audit log. */
export function useAuditLog({ pageSize = 25, pollMs = 20000, initialFilters = {} } = {}) {
  const [filters, setFilters] = useState(initialFilters)
  const [offset, setOffset] = useState(0)
  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const params = useMemo(() => {
    const cleaned = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== '' && value != null),
    )
    return { ...cleaned, limit: pageSize, offset }
  }, [filters, offset, pageSize])

  const load = useCallback(() => {
    setLoading(true)
    return auditApi
      .logs(params)
      .then(({ data }) => {
        setEntries(data.entries)
        setTotal(data.total)
        setError('')
      })
      .catch((err) => setError(err.friendlyMessage || 'Could not load the audit log.'))
      .finally(() => setLoading(false))
  }, [params])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!pollMs) return undefined
    const timer = setInterval(load, pollMs)
    return () => clearInterval(timer)
  }, [load, pollMs])

  const updateFilter = useCallback((key, value) => {
    setOffset(0)
    setFilters((current) => ({ ...current, [key]: value }))
  }, [])

  return {
    entries,
    total,
    loading,
    error,
    filters,
    updateFilter,
    setFilters,
    offset,
    setOffset,
    pageSize,
    refresh: load,
  }
}

export default useAuditLog
