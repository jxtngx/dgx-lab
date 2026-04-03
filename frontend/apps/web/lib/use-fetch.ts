"use client"

import { useEffect, useState, useCallback } from "react"
import { api } from "./api"

export function useFetch<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    if (!path) return
    setLoading(true)
    try {
      const result = await api<T>(path)
      setData(result)
      setError(null)
    } catch (e) {
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}
