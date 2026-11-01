import { useLocale } from '../../i18n'
import { fmtDateLong, rellena } from '../../lib/formatters'
import { fraseDeLaSemana } from '../../scraper/en-breve-cambios'

/*
 * «En una frase», arriba de /cambios (auditoría de las dos lecturas, §2).
 *
 * Lo que hizo el Ayuntamiento, lo que no consta y lo que no se sabe, y después
 * el canal de quejas y la prensa, que no son actos suyos. Las cuentas y la
 * regla de «no consta» / «sin datos desde» son de `fraseDeLaSemana`; aquí sólo
 * se ponen las palabras. Las claves van literales, sin componer, y las que
 * llevan hueco se rellenan donde se nombran (`rellena(t('…'), {…})`), que es lo
 * que mira la guarda del catálogo.
 */

/** Lo que hizo el Ayuntamiento, con su número; cada clave con su `rellena` a la vista. */
function hecho(t, kind, n) {
  switch (kind) {
    case 'pleno':
      return n === 1
        ? t('cambios.frase.hecho.pleno.uno')
        : rellena(t('cambios.frase.hecho.pleno'), { n })
    case 'licitacion':
      return n === 1
        ? t('cambios.frase.hecho.licitacion.uno')
        : rellena(t('cambios.frase.hecho.licitacion'), { n })
    case 'subvencion':
      return n === 1
        ? t('cambios.frase.hecho.subvencion.uno')
        : rellena(t('cambios.frase.hecho.subvencion'), { n })
    case 'participa':
      return n === 1
        ? t('cambios.frase.hecho.participa.uno')
        : rellena(t('cambios.frase.hecho.participa'), { n })
  }
}
const NINGUNO = {
  pleno: 'cambios.frase.ninguno.pleno',
  licitacion: 'cambios.frase.ninguno.licitacion',
  subvencion: 'cambios.frase.ninguno.subvencion',
  participa: 'cambios.frase.ninguno.participa',
}
const FUENTE = {
  pleno: 'cambios.frase.fuente.pleno',
  licitacion: 'cambios.frase.fuente.licitacion',
  subvencion: 'cambios.frase.fuente.subvencion',
  participa: 'cambios.frase.fuente.participa',
  queja: 'cambios.frase.fuente.queja',
  prensa: 'cambios.frase.fuente.prensa',
}

/** «a», «a y b», «a, b y c» en el idioma de la interfaz. */
function enumera(partes, locale) {
  return new Intl.ListFormat(locale === 'ca' ? 'ca' : 'es', {
    style: 'long',
    type: 'conjunction',
  }).format(partes)
}

/** «a», «a ni b», «a, b ni c»: la negación no la da `Intl.ListFormat`. */
function niUnoNiOtro(partes, ni) {
  if (partes.length < 2) return partes.join('')
  return `${partes.slice(0, -1).join(', ')}${ni}${partes[partes.length - 1]}`
}

export function FraseDeLaSemana({ byKind, fuentes, dias, hoy = Date.now() }) {
  const { t, locale } = useLocale()
  const f = fraseDeLaSemana({ byKind, fuentes, dias, hoy })
  const frases = []

  if (f.hechos.length > 0) {
    const lista = f.hechos.map(({ kind, n }) => hecho(t, kind, n))
    frases.push(rellena(t('cambios.frase.hechos'), { dias, lista: enumera(lista, locale) }))
  }
  if (f.noConsta.length > 0) {
    const lista = niUnoNiOtro(
      f.noConsta.map((kind) => t(NINGUNO[kind])),
      t('cambios.frase.ni'),
    )
    frases.push(rellena(t('cambios.frase.noConsta'), { lista, dias }))
  }
  for (const { kind, desde } of f.sinDatos) {
    frases.push(
      desde
        ? rellena(t('cambios.frase.sinDatos'), {
            fuente: t(FUENTE[kind]),
            fecha: fmtDateLong(desde, locale),
          })
        : rellena(t('cambios.frase.sinDatos.nunca'), { fuente: t(FUENTE[kind]) }),
    )
  }
  if (f.quejas != null) {
    frases.push(
      f.quejas === 0
        ? t('cambios.frase.quejas.ninguna')
        : f.quejas === 1
          ? t('cambios.frase.quejas.una')
          : rellena(t('cambios.frase.quejas'), { n: f.quejas }),
    )
  }
  if (f.prensa != null) {
    const { n, municipales } = f.prensa
    let p =
      n === 0
        ? t('cambios.frase.prensa.ninguna')
        : n === 1
          ? t('cambios.frase.prensa.una')
          : rellena(t('cambios.frase.prensa'), { n })
    if (municipales === 1) p += t('cambios.frase.prensa.municipal.una')
    else if (municipales > 1) p += rellena(t('cambios.frase.prensa.municipal'), { n: municipales })
    frases.push(p)
  }

  return (
    <section aria-labelledby="cambios-frase" data-cambios-frase="" style={{ marginBottom: 4 }}>
      <h2
        id="cambios-frase"
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          fontWeight: 700,
          margin: 0,
        }}
      >
        {t('cambios.frase.titulo')}
      </h2>
      <p
        style={{
          fontSize: 'var(--fs-body)',
          lineHeight: 1.6,
          color: 'var(--ink)',
          margin: '6px 0 0',
          maxWidth: '70ch',
        }}
      >
        {frases.join(' ')}
      </p>
    </section>
  )
}
