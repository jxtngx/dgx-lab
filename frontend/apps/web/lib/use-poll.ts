"use client"

import { useEffect, useRef, useState } from "react"
import { api } from "./api"

export function usePoll<T>(path: string | null, intervalMs = 2000) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    if (!path) return

    let prevJson = ""

    async function tick() {
      try {
        const result = await api<T>(path!)
        if (mountedRef.current) {
          const json = JSON.stringify(result)
          if (json !== prevJson) {
            prevJson = json
            setData(result)
          }
          setError(null)
        }
      } catch (e) {
        if (mountedRef.current) setError(e as Error)
      }
    }

    tick()
    const id = setInterval(tick, intervalMs)
    return () => {
      mountedRef.current = false
      clearInterval(id)
    }
  }, [path, intervalMs])

  return { data, error }
}
