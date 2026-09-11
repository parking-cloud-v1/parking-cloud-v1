'use client'

import { useCallback, useEffect, useState } from 'react'

type DriveOAuthState = {
  loading: boolean
  configured: boolean
  connected: boolean
  error: string
}

export function useGoogleDriveOAuth(enabled = true) {
  const [state, setState] = useState<DriveOAuthState>({
    loading: enabled,
    configured: false,
    connected: false,
    error: '',
  })

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState({
        loading: false,
        configured: false,
        connected: false,
        error: '',
      })
      return
    }

    setState((current) => ({ ...current, loading: true, error: '' }))

    try {
      const response = await fetch('/api/google-drive/oauth/status', {
        cache: 'no-store',
      })
      const json = await response.json()
      if (!response.ok) {
        throw new Error(json?.error || 'Google Drive 狀態讀取失敗')
      }

      setState({
        loading: false,
        configured: Boolean(json?.configured),
        connected: Boolean(json?.connected),
        error: '',
      })
    } catch (error: any) {
      setState({
        loading: false,
        configured: false,
        connected: false,
        error: error?.message || 'Google Drive 狀態讀取失敗',
      })
    }
  }, [enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  function connect() {
    if (typeof window === 'undefined') return
    const returnTo = `${window.location.pathname}${window.location.search}`
    window.location.href = `/api/google-drive/oauth/connect?returnTo=${encodeURIComponent(
      returnTo
    )}`
  }

  async function disconnect() {
    try {
      const response = await fetch('/api/google-drive/oauth/disconnect', {
        method: 'POST',
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(json?.error || '解除 Google Drive 連結失敗')
      }
      await refresh()
    } catch (error: any) {
      setState((current) => ({
        ...current,
        error: error?.message || '解除 Google Drive 連結失敗',
      }))
    }
  }

  return {
    ...state,
    refresh,
    connect,
    disconnect,
  }
}
