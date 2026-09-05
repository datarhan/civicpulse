/**
 * Señalamientos de lectura que una persona ya miró y descartó.
 *
 * Sin esto, un falso positivo es eterno. El barrido vuelve a leer la página,
 * vuelve a señalar lo mismo, `check:surfaces` sigue rojo y el digest lo repite
 * cada dos días — hasta que se aprende a ignorarlo, que es exactamente lo que
 * CLAUDE.md dice de un control equivocado cuatro veces de cuarenta y ocho:
 * «una que todo el mundo se salta».
 *
 * Pasó el primer día: «805 contratos» en /datos y «805 contratos indexados» en
 * /nosotros son ciertas —805 es el número de filas del snapshot y las dos
 * páginas hablan de lo que este proyecto ha ingerido, no de lo que el
 * ayuntamiento adjudicó— y el modelo las señala igualmente, porque la distinción
 * con los 699 adjudicados es genuinamente sutil.
 *
 * ── Por qué se ancla en la CITA y no en la ruta ─────────────────────────────
 *
 * Descartar «/datos» entero silenciaría también el defecto que aparezca mañana
 * en esa página. Un descarte vale para UNA frase concreta: si la página cambia
 * y el modelo señala otra cosa, o la misma frase con otras cifras, el descarte
 * no aplica y el aviso vuelve. Silenciar es la operación más peligrosa que
 * ofrece esta herramienta, y por eso es la más estrecha.
 *
 * Módulo puro: recibe el registro ya leído.
 */
import type { ReaderFinding } from './reader-review'

export interface Descarte {
  route: string
  /** La cita EXACTA que se descarta, tal y como la emitió la revisión. */
  quote: string
  /** Por qué no es un defecto. Obligatorio: un descarte sin motivo es un mute. */
  reason: string
  /** Quién lo decidió. Una persona, siempre. */
  editor: string
  at: string
}

export interface RegistroDescartes {
  version: number
  items: Descarte[]
}

/** Espacios y mayúsculas no cuentan; el resto sí. */
const normaliza = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * Solape mínimo para que un descarte valga. Por debajo de esto, una cita corta
 * podría caer dentro de una larga por casualidad y silenciar otra cosa.
 */
export const SOLAPE_MINIMO = 25

/**
 * ¿Está este señalamiento descartado para esta ruta?
 *
 * Comparación por cita normalizada. No hay coincidencia parcial a propósito:
 * un descarte que valiera «por parecido» acabaría tapando una frase que nadie
 * revisó.
 */
export function estaDescartado(
  route: string,
  finding: Pick<ReaderFinding, 'quote'>,
  registro: RegistroDescartes | null,
): boolean {
  if (!registro?.items?.length) return false
  const q = normaliza(finding.quote ?? '')
  if (!q) return false
  return registro.items.some((d) => {
    if (d.route !== route) return false
    const dq = normaliza(d.quote)
    if (dq === q) return true
    // Contención, no igualdad exacta.
    //
    // Medido: se descartó «Contratos públicos 805 contratos Fuente: Gobierto ·
    // PLACSP» y el barrido siguiente citó «Contratos públicos 805 contratos» —
    // el mismo defecto, un trozo más corto— y el descarte no aplicó. Un
    // silenciador que sólo funciona si el modelo recorta igual dos veces no
    // silencia nada, y la alarma vuelve a ser permanente.
    //
    // El suelo de SOLAPE_MINIMO evita lo contrario: que un fragmento corto caiga
    // dentro de una cita larga por casualidad y tape algo que nadie revisó.
    const corta = q.length <= dq.length ? q : dq
    const larga = q.length <= dq.length ? dq : q
    return corta.length >= SOLAPE_MINIMO && larga.includes(corta)
  })
}

/** Los que siguen en pie tras aplicar el registro. */
export function sinDescartar(
  route: string,
  findings: ReaderFinding[],
  registro: RegistroDescartes | null,
): ReaderFinding[] {
  return findings.filter((f) => !estaDescartado(route, f, registro))
}

/**
 * Descartes que ya no corresponden a ningún señalamiento vivo.
 *
 * Un registro sólo crece si nadie lo mira. Cuando la página cambia y la frase
 * descartada desaparece, el descarte sobra — y peor: sigue armado, listo para
 * silenciar esa frase si vuelve por otro motivo. `check:surfaces` los nombra
 * para que se puedan quitar.
 */
export function descartesHuerfanos(
  registro: RegistroDescartes | null,
  vivosPorRuta: Map<string, ReaderFinding[]>,
): Descarte[] {
  if (!registro?.items?.length) return []
  return registro.items.filter((d) => {
    const vivos = vivosPorRuta.get(d.route) ?? []
    return !vivos.some((f) => normaliza(f.quote ?? '') === normaliza(d.quote))
  })
}

/** Un registro sin motivo o sin editor no es un registro, es un silenciador. */
export function validarDescartes(raw: unknown): RegistroDescartes {
  const r = raw as RegistroDescartes
  if (!r || typeof r !== 'object' || !Array.isArray(r.items)) {
    throw new Error('registro de descartes: falta `items`')
  }
  for (const d of r.items) {
    for (const campo of ['route', 'quote', 'reason', 'editor', 'at'] as const) {
      if (typeof d?.[campo] !== 'string' || !d[campo].trim()) {
        throw new Error(`registro de descartes: entrada sin \`${campo}\``)
      }
    }
    if (d.reason.trim().length < 20) {
      throw new Error(`registro de descartes: motivo demasiado corto en ${d.route}`)
    }
  }
  return r
}

/**
 * Descartes que NO PUEDEN casar con nada, porque su cita no llega al suelo.
 *
 * `estaDescartado` exige `corta.length >= SOLAPE_MINIMO` para que un fragmento
 * corto no tape por casualidad un señalamiento que nadie revisó. La consecuencia,
 * que no estaba dicha en ninguna parte: un descarte con una cita más corta que
 * eso no silencia nada — y tampoco avisa de que no silencia. Queda en el fichero
 * con su motivo y su firma, pareciendo trabajo hecho.
 *
 * Medido el 5-09-2026 al auditar el registro: CUATRO, dos de ellos anteriores a
 * esa sesión. Se anotaron creyendo cerrar un señalamiento que siguió vivo.
 *
 * No se convierte en error de validación a propósito: reventar la lectura del
 * registro dejaría `check:surfaces` y `review:surfaces` sin poder arrancar por
 * un descarte viejo mal escrito, que es peor que el defecto. Se informa, que es
 * lo único que hacía falta para que se vea.
 */
export function descartesInertes(registro: RegistroDescartes | null): Descarte[] {
  return (registro?.items ?? []).filter((d) => normaliza(d.quote).length < SOLAPE_MINIMO)
}
