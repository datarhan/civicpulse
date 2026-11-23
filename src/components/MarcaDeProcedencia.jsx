/**
 * <MarcaDeProcedencia> — dónde consta el literal de una declaración servida.
 *
 * /hallazgos marca desde agosto de 2026 la cita cuyas palabras sólo constan en
 * la transcripción que se sustituyó; /declaraciones y el registro de
 * /plenos/:id imprimían 995 declaraciones en esa misma condición entre comillas
 * y sin marca (medido el 23-11-2026). El estado lo estampa la puerta en cada
 * item al trocear (`procedencia`, src/scraper/claim-public-gate.ts), con el
 * vocabulario de las citas de los hallazgos, y aquí sólo se pinta: el chip es
 * el mismo para que la misma marca se lea igual en las dos páginas.
 *
 * La nota es propia, no la de /hallazgos: aquella habla de una ficha que una
 * persona puede reanclar, y una declaración no tiene esa vía. Y dice lo que la
 * marca NO afirma: que el grupo no lo dijera.
 *
 * Va debajo del literal y en las dos lecturas: califica las comillas, y las
 * comillas se ven en las dos.
 */
import { Pill } from './Primitives'
import { useT } from '../i18n'

/** Exportado para que la prueba recorra el vocabulario entero. */
export const MARCA_DE_PROCEDENCIA = {
  'en-vigente': null,
  'solo-en-sustituida': {
    tono: 'warn',
    chip: 'findings.citas.procedencia.sustituida.chip',
    title: 'findings.citas.procedencia.sustituida.title',
    nota: 'declaraciones.procedencia.sustituida.nota',
  },
  'sin-determinar': {
    tono: 'ghost',
    chip: 'findings.citas.procedencia.sinDeterminar.chip',
    title: 'findings.citas.procedencia.sinDeterminar.title',
    nota: 'declaraciones.procedencia.sinDeterminar.nota',
  },
}

export function MarcaDeProcedencia({ procedencia, style = {} }) {
  const t = useT()
  // Ausente: un trozo anterior a la marca. No se pinta nada, que es lo que
  // ese trozo decía; no se inventa un «en la vigente».
  if (procedencia == null) return null
  const marca = MARCA_DE_PROCEDENCIA[procedencia]
  if (marca === null) return null
  // Un estado que este mapa no conoce sale crudo y a la vista, nunca callado.
  if (marca === undefined) {
    return (
      <div data-procedencia={procedencia} style={{ margin: '4px 0 6px', ...style }}>
        <Pill tone="ghost" size="xs">
          {procedencia}
        </Pill>
      </div>
    )
  }
  return (
    <div
      data-procedencia={procedencia}
      style={{
        margin: '4px 0 6px',
        fontSize: 'var(--fs-micro)',
        color: 'var(--ink70)',
        lineHeight: 1.5,
        ...style,
      }}
    >
      {/* El chip en su línea: a 375 px su texto parte en dos, y una píldora de
          dos líneas con el radio de una se leía como un error de maquetación. */}
      <div style={{ marginBottom: 3 }}>
        <Pill
          tone={marca.tono}
          size="xs"
          title={t(marca.title)}
          style={{ lineHeight: 1.25, borderRadius: 6 }}
        >
          {t(marca.chip)}
        </Pill>
      </div>
      {t(marca.nota)}{' '}
      <a href="/metodologia#citas-transcripcion" style={{ color: 'var(--civic)' }}>
        {t('findings.citas.procedencia.enlace')}
      </a>
    </div>
  )
}
