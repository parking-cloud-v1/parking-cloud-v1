'use client'

import { useEffect } from 'react'

export default function AutoPrintContract() {
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function run() {
      try {
        if ('fonts' in document) {
          await document.fonts.ready
        }
      } catch {
        // 字型等待失敗時仍可繼續列印。
      }

      if (cancelled) return
      timer = setTimeout(() => {
        if (!cancelled) window.print()
      }, 250)
    }

    void run()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  return null
}
