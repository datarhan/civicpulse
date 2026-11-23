// @ts-check
import { useJsonFetch } from './useJsonFetch'

export function useParticipa() {
  return useJsonFetch('/data/participa.json')
}

export const KIND_ICON = {
  activity: '🧑‍🤝‍🧑',
  survey: '📋',
  other: '📢',
}
