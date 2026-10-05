/**
 * El trinquete de veredictos, declarado como dato.
 *
 * La tubería de verificación ES un trinquete —cada etapa sólo puede mover el
 * veredicto en un sentido— y está bien pensada:
 *
 *   base establece → NLI propone subir lo que puede anclar, y lo sube sólo una
 *   persona → el motor retracta, y sólo a `sin-datos`, que no afirma nada → la
 *   retractación de curador baja con la firma de quien la usa → y una persona,
 *   con su nombre, sube lo que el registro que ella cita sostiene (desde el
 *   04-10-2026, la subida firmada: src/scraper/subida-firmada.ts).
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
  /**
   * Veredictos que esta etapa puede EMITIR. Si `exigeFirma`, los emite como
   * propuesta para la cola humana; si no, el overlay no le acepta otros.
   */
  puedeEmitir: readonly ClaimVerdict[]
  /** ¿Tiene que nombrar un corpus para emitir un veredicto fuerte? */
  exigeCorpus: boolean
  /** ¿Exige un motivo escrito de al menos 20 caracteres? */
  exigeRazon: boolean
  /**
   * ¿Lo que emite espera la firma de una persona antes de publicarse?
   *
   * Lo automático sólo baja (docs/DATA_INTEGRITY.md, regla 4), así que toda
   * etapa viva que sube lo lleva. Cómo llega esa firma lo dice
   * `firmaEnLaEntrada`.
   */
  exigeFirma: boolean
  /**
   * ¿La firma viaja en la propia entrada?
   *
   * Hasta el 04-10-2026 sólo una etapa exigía firma, el anclaje NLI, y
   * `exigeFirma` decía también que no escribía en el overlay. Con dos etapas
   * que suben se separan:
   *
   *   · `false` — la etapa sólo PROPONE: deja sugerencias con
   *     `requiresHumanApproval: true` en una cola que no se publica, y el overlay
   *     la rechaza con firma y sin ella. Su resumen y su evidencia son de la
   *     máquina, y firmarlos tal cual sería publicar lo que nadie escribió.
   *   · `true` — la etapa ES la de la persona: el overlay la acepta sólo si su
   *     `editor` nombra a una persona (`rechazoDeFirma`), y la rechaza sin ella.
   *
   * Sólo tiene sentido con `exigeFirma`.
   */
  firmaEnLaEntrada: boolean
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
    // Lo que puede PROPONER. Su `sin-datos` es «no vi respaldo» y deja la fila
    // como estaba: no se escribe en ningún sitio.
    puedeEmitir: ['verificado', 'parcial'],
    // Sube: si va a reforzar una afirmación, que diga contra qué.
    exigeCorpus: true,
    exigeRazon: false,
    // Sube, y una subida automática no se publica: lo que el modelo ve
    // respaldado espera en la cola a que una persona lo firme. Decisión del
    // 29-09-2026, cuando el runner dejó de pisar `checkedAgainst` y la pasada
    // habría podido subir veredictos sin nadie delante por primera vez.
    exigeFirma: true,
    // Sólo propone: lo que ve respaldado no se firma tal cual. Quien esté de
    // acuerdo con una propuesta la sube por la subida firmada, con el registro
    // que elija y un resumen que escriba ella.
    firmaEnLaEntrada: false,
    retirada: false,
    comando: 'npm run verify:pleno-claims:nli',
    // Decía el diseño P2 (2026-06-23-factcheck-rebuild-p2-design.md), cuyo único
    // dato sobre esta etapa es un rendimiento —«0 NLI upgrades over 3,251»— y
    // además nulo: lo dio un guion cuyo `lookup` no le entregaba ninguna
    // puntuación al verificador (325a1c62 → #206). La fiabilidad del verificador
    // se midió en la evaluación de la fase 1, que lo llama con su propio
    // puntuador; el rendimiento del guion sobre los `sin-datos` está sin medir.
    // 30-09-2026.
    medicion: 'docs/superpowers/specs/2026-06-23-factcheck-rebuild-phase1-results.md',
  },
  llm: {
    // Sin «(retirada)» en el nombre: el estado lo dice la columna de al lado, y
    // decirlo dos veces en la misma fila es ruido.
    nombre: 'Segunda pasada LLM',
    direccion: 'sube',
    puedeEmitir: ['verificado', 'parcial', 'sin-datos'],
    exigeCorpus: true,
    exigeRazon: false,
    // Publicaba sin nadie delante, que es lo que hoy prohíbe la regla 4. Está
    // retirada, y una etapa retirada no escribe entradas nuevas.
    exigeFirma: false,
    firmaEnLaEntrada: false,
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
    // Sólo retracta, y sólo a sin-datos: un `sin-datos` no afirma nada, así que
    // retractar a él sólo puede quitar. Decía «en el patrón de 64 filas su
    // precisión en `sin-datos` es ~92 %»: ese patrón es
    // tests/fixtures/verifier-gold.json, lo etiquetó un modelo (ai-opus-4.8) y
    // a 04-10-2026 no consta revisión humana; el ~92 % —36 de 39— es
    // coincidencia con esas etiquetas, medida con gpt-5.4-mini en junio de
    // 2026; la pasada de agosto se configuró con Claude Code, la contestó en
    // parte gpt-4o-mini (457 retractaciones, medido el 05-10-2026) y no se midió
    // ninguno de los dos. La regla
    // se tomó a la vista de esa cifra y hoy no depende de ella. `medicion`
    // apunta al informe que la midió, con su nota del 04-10-2026.
    puedeEmitir: ['sin-datos'],
    // El suelo SÍ le aplica —lo comprobó la prueba, que es para lo que está—
    // aunque en la práctica no le muerda nunca: sólo emite `sin-datos`, que no
    // tiene nada que sostener. Un `parcial` suyo no lo para el suelo —con los
    // corpus de su evidencia llegaría—: lo para `puedeEmitir`, que el overlay
    // aplica. Hasta el 29-09-2026 lo paraba el suelo de rebote, porque el
    // runner pisaba `checkedAgainst` con su marca.
    exigeCorpus: true,
    exigeRazon: true,
    // Retracta: tier A de `decideAutomation`, corre sin nadie delante.
    exigeFirma: false,
    firmaEnLaEntrada: false,
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
    // No espera la firma de nadie: la vía lleva la de quien la usa, con su
    // motivo. Decía «Es la firma: una persona con nombre y su motivo», y no
    // siempre lo es: la han usado también una revisión con un modelo
    // (`ai-gold-review`, 24-06-2026) y sesiones de Claude, y 47 de sus 69
    // bajadas no las firma una persona (30-09-2026). Bajar es el nivel A de
    // `decideAutomation` —no hace falta una persona delante—, y por eso pudo
    // usarla una revisión automática; quién decidió cada bajada viaja en
    // `downgradedBy` y lo dice la tarjeta.
    exigeFirma: false,
    firmaEnLaEntrada: false,
    retirada: false,
    comando: 'npm run downgrade-verdict',
    medicion:
      'no se mide: sólo baja; la firma de cada bajada dice quién la decidió —una persona, una revisión automática o no consta— y la tarjeta lo publica',
  },
  'curator-upgrade': {
    nombre: 'Subida firmada',
    direccion: 'sube',
    // La escala de siempre leída al revés: sube a lo que, al volver, sería una
    // bajada (`isDowngrade(nuevo, desde)`). Nunca `contradicho`: un desmentido
    // que firma una persona va en un hallazgo, con sus referencias.
    puedeEmitir: ['verificado', 'parcial'],
    // Refuerza una afirmación: nombra el corpus de los registros que cita.
    exigeCorpus: true,
    // El motivo es el resumen que la tarjeta imprime bajo la cita, y lo
    // escribe la persona desde el registro.
    exigeRazon: true,
    // La única escritura del overlay que sube un veredicto, y por eso la de
    // una persona con su nombre: ni la cuenta de rol, ni un modelo, ni el
    // hueco de una orden sin rellenar. Decisión del operador, 04-10-2026.
    exigeFirma: true,
    firmaEnLaEntrada: true,
    retirada: false,
    // La ejecuta una persona; no la llama ningún runner, cron ni nocturna.
    comando: 'npm run subir-veredicto',
    medicion:
      'no se mide: la decide una persona con su nombre, que cita el registro que la sostiene y escribe el resumen; la tarjeta publica quién la firmó',
  },
}

/** Las etapas que siguen en la tubería. */
export function etapasVivas(): OverlaySource[] {
  return (Object.keys(TRINQUETE) as OverlaySource[]).filter((k) => !TRINQUETE[k].retirada)
}
