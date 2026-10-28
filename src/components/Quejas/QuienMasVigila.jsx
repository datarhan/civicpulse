import { useT } from '../../i18n'
import { useGlosario } from '../../hooks/useGlosario'

/*
 * «Si el Ayuntamiento no responde: quién más vigila» (auditoría de las dos
 * lecturas, 25-10-2026, §18).
 *
 * Los registros del Síndic de Greuges, del Consell de Transparència, del CTBG y
 * de la Sindicatura de Comptes eran cuatro tarjetas sueltas al pie de /quejas,
 * cada una con su sigla y sus números de expediente: lo mejor que la página
 * cuenta a un vecino —a quién más puede acudir, y qué consta ya sobre el
 * Ayuntamiento— se leía como un anexo de especialista. Ahora van bajo un solo
 * título, y cada tarjeta abre con qué es la institución, en una línea.
 *
 * Esa línea es la definición del glosario (`useGlosario`), no una frase de la
 * tarjeta: la misma que da Cmd+K al buscar el nombre, para que las dos no
 * puedan decir cosas distintas.
 */

/** El título del grupo y su entradilla; las tarjetas van dentro. */
export function QuienMasVigila({ children }) {
  const t = useT()
  return (
    <section aria-labelledby="quien-mas-vigila" style={{ marginTop: 32 }}>
      <h2
        id="quien-mas-vigila"
        style={{
          fontSize: 'var(--fs-card)',
          fontWeight: 700,
          letterSpacing: '-.01em',
          lineHeight: 1.25,
          margin: 0,
        }}
      >
        {t('quejas.vigilan.titulo')}
      </h2>
      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink70)',
          lineHeight: 1.55,
          margin: '6px 0 0',
          maxWidth: 620,
        }}
      >
        {t('quejas.vigilan.intro')}
      </p>
      {children}
    </section>
  )
}

/** Qué es la institución: su definición del glosario, en una línea. */
export function QueEsLaInstitucion({ clave }) {
  const entrada = useGlosario().find((g) => g.clave === clave)
  if (!entrada) return null
  return (
    <p
      data-que-es={clave}
      style={{
        fontSize: 'var(--fs-aux)',
        color: 'var(--ink70)',
        lineHeight: 1.55,
        margin: '0 0 8px',
      }}
    >
      {entrada.def}
    </p>
  )
}
