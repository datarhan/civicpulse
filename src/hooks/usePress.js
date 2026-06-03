// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Re-exported from the shared formatters module so existing call sites
// (`import { timeAgo } from '../hooks/usePress'`) keep working.
export { timeAgo } from '../lib/formatters'

export function usePress() {
  return useJsonFetch('/data/press.json')
}
