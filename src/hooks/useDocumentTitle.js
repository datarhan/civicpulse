import { useEffect } from 'react'

const DEFAULT_TITLE = 'CivicPulse · Riba-roja de Túria'

export function useDocumentTitle(title) {
  useEffect(() => {
    const prev = document.title
    document.title = title ? `${title} · CivicPulse` : DEFAULT_TITLE
    return () => {
      document.title = prev
    }
  }, [title])
}
