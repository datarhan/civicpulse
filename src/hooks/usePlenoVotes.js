// @ts-check
import { useJsonFetch } from './useJsonFetch'
import { CATALOGUE } from '../i18n'

/**
 * El rótulo castellano de cada desenlace, leído del catálogo (`pleno.desenlace.<valor>`). /plenos/:id
 * lo pinta en el idioma de la interfaz con `rotuloDe`; las páginas que aún no están
 * traducidas siguen leyendo esta tabla y escriben lo mismo que escribían.
 */
export const OUTCOME_LABEL = {
  aprobado: CATALOGUE.es['pleno.desenlace.aprobado'],
  rechazado: CATALOGUE.es['pleno.desenlace.rechazado'],
  retirado: CATALOGUE.es['pleno.desenlace.retirado'],
  aplazado: CATALOGUE.es['pleno.desenlace.aplazado'],
}

export const OUTCOME_TONE = {
  aprobado: 'ok',
  rechazado: 'crit',
  retirado: 'neutral',
  aplazado: 'warn',
}

/**
 * El rótulo castellano de cada sentido del voto, leído del catálogo (`pleno.sentido.<valor>`). /plenos/:id
 * lo pinta en el idioma de la interfaz con `rotuloDe`; las páginas que aún no están
 * traducidas siguen leyendo esta tabla y escriben lo mismo que escribían.
 */
export const DIRECTION_LABEL = {
  a_favor: CATALOGUE.es['pleno.sentido.a_favor'],
  en_contra: CATALOGUE.es['pleno.sentido.en_contra'],
  abstencion: CATALOGUE.es['pleno.sentido.abstencion'],
  ausente: CATALOGUE.es['pleno.sentido.ausente'],
}

export const DIRECTION_TONE = {
  a_favor: 'ok',
  en_contra: 'crit',
  abstencion: 'warn',
  ausente: 'neutral',
}

export function usePlenoVotes() {
  return useJsonFetch('/data/pleno-votes.json')
}

/** Count how many votes each bloc has cast *a favor* / *en contra* / *abstención*
 *  across a filtered set of records. Used by /plenos to show party alignment.
 *
 *  Tuples with `bloc: null` — the source records the vote but names no group —
 *  are skipped rather than bucketed: an object key coerces null to the string
 *  "null", which would render as a party called «null», and a per-bloc
 *  alignment table has nothing to say about a group it cannot name. */
export function tallyByBloc(items) {
  const tally = {}
  for (const rec of items || []) {
    for (const v of rec.votes || []) {
      if (!v.bloc) continue
      const row = (tally[v.bloc] ||= {
        a_favor: 0,
        en_contra: 0,
        abstencion: 0,
        ausente: 0,
        total: 0,
      })
      row[v.direction] = (row[v.direction] || 0) + 1
      row.total += 1
    }
  }
  return tally
}
