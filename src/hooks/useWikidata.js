// @ts-check
import { useJsonFetch } from './useJsonFetch'

export function useWikidata() {
  return useJsonFetch('/data/wikidata.json')
}
