/**
 * El trinquete de veredictos, declarado como dato.
 *
 * La tubería de verificación ES un trinquete —cada etapa sólo puede mover el
 * veredicto en un sentido— y está bien pensada:
 *
 *   base establece → NLI sube lo que puede anclar → el motor retracta donde es
 *   fiable (~92 % de precisión en `sin-datos`, floja en el resto) → un curador
 *   retracta a mano.
 *
 * El problema no era el diseño: era que sólo vivía en el orden de ejecución y
 * en las cabeceras de tres ficheros. La política real estaba repartida en una
 * cadena de `if (e.source === …)` dentro de `applyOverlayEntries`, con una rama
 * por fuente y ninguna para `nli` — añadir una pasada y olvidar su rama
 * significaba no tener puerta ninguna, que es exactamente lo que pasó.
 *
 * Declararlo aquí hace tres cosas que un comentario no hace:
 *
 *   1. `Record<OverlaySource, Etapa>` obliga a que una fuente NUEVA declare su
 *      política — TypeScript no compila si falta.
 *   2. Se puede COMPROBAR contra lo que el código impone de verdad, en vez de
 *      quedarse como una tabla escrita a mano que envejece sola (el chiste que
 *      este repositorio ya ha contado dos veces).
 *   3. Se puede PUBLICAR. El contrato de esta casa es enseñar el método, y hoy
 *      un lector no puede ver esta política por ningún lado.
 *
 * Retirar una pasada pasa así de ser un comentario que no lee ningún código a
 * ser un cambio de estado que las guardas notan.
 */
import type { ClaimVerdict } from './claim-verdicts'
import type { OverlaySource } from './verified-merge'

export type Direccion = 'sube' | 'baja'

export interface Etapa {
  /** Cómo se llama en prosa, para publicarlo. */
  nombre: string
  /** Hacia dónde puede mover un veredicto. Ninguna etapa mueve en las dos. */
  direccion: Direccion
  /** Veredictos que esta etapa puede EMITIR. */
  puedeEmitir: readonly ClaimVerdict[]
  /** ¿Tiene que nombrar un corpus para emitir un veredicto fuerte? */
  exigeCorpus: boolean
  /** ¿Exige un motivo escrito de al menos 20 caracteres? */
  exigeRazon: boolean
  /** Ya no forma parte de la tubería, aunque sus veredictos sigan publicados. */
  retirada: boolean
  /** Qué la ejecuta, o `null` si la ejecuta una persona. */
  comando: string | null
  /** Dónde se midió su fiabilidad. Sin esto, «confiamos» es una opinión. */
  medicion: string
}

export const TRINQUETE: Record<OverlaySource, Etapa> = {
  nli: {
    nombre: 'Anclaje NLI',
    direccion: 'sube',
    puedeEmitir: ['verificado', 'parcial', 'sin-datos'],
    // Sube: si va a reforzar una afirmación, que diga contra qué.
    exigeCorpus: true,
    exigeRazon: false,
    retirada: false,
    comando: 'npm run verify:pleno-claims:nli',
    medicion: 'docs/superpowers/specs/2026-06-23-factcheck-rebuild-p2-design.md',
  },
  llm: {
    nombre: 'Segunda pasada LLM (retirada)',
    direccion: 'sube',
    puedeEmitir: ['verificado', 'parcial', 'sin-datos'],
    exigeCorpus: true,
    exigeRazon: false,
    // Su propia cabecera se declara «LEGACY / SUPERSEDED … do not use in the
    // pipeline» desde el corte base/overlay. Sus veredictos sobrevivieron a la
    // migración y sostenían 87 filas fuertes sin un corpus detrás.
    retirada: true,
    comando: null,
    medicion: 'sustituida por el anclaje NLI, que es local y de coste cero',
  },
  'verdict-engine': {
    nombre: 'Re-derivación del motor',
    direccion: 'baja',
    // Sólo retracta, y sólo a sin-datos: en el patrón de 64 filas su precisión
    // en `sin-datos` es ~92 % y la de verificado/parcial es floja, así que se
    // le cree únicamente cuando dice que no hay nada.
    puedeEmitir: ['sin-datos'],
    // El suelo SÍ le aplica —lo comprobó la prueba, que es para lo que está—
    // aunque en la práctica no le muerda nunca: sólo emite `sin-datos`, que no
    // tiene nada que sostener. Si algún día emitiera `parcial`, el suelo lo
    // pararía, y eso es lo correcto: no puede anclar nada.
    exigeCorpus: true,
    exigeRazon: true,
    retirada: false,
    comando: 'npm run verify:pleno-claims:engine',
    medicion: 'docs/superpowers/specs/2026-06-24-factcheck-rebuild-p3-results.md',
  },
  'curator-downgrade': {
    nombre: 'Retractación de curador',
    direccion: 'baja',
    puedeEmitir: ['parcial', 'sin-datos'],
    // Exenta del suelo de evidencia a propósito: ya sólo puede bajar, y bajar
    // nunca refuerza una afirmación. Obligarla a irse hasta `sin-datos` cuando
    // lo que quiere decir es «esto sólo es parcial» le haría retractar de más.
    exigeCorpus: false,
    exigeRazon: true,
    retirada: false,
    comando: 'npm run downgrade-verdict',
    medicion: 'responde una persona con nombre; no se mide, se firma',
  },
}

/** Las etapas que siguen en la tubería. */
export function etapasVivas(): OverlaySource[] {
  return (Object.keys(TRINQUETE) as OverlaySource[]).filter((k) => !TRINQUETE[k].retirada)
}
