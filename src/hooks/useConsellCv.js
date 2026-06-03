// @ts-check
import { useJsonFetch } from './useJsonFetch'

export function useConsellCv() {
  return useJsonFetch('/data/consell-cv.json')
}
