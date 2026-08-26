import { SectionHead } from '../Primitives'
import { MARGEN_ANCLA } from './anclas'

/**
 * La entrega que falta — once obligatorias, las que se presentaron.
 *
 * El hueco de 2020 estaba en la página, pero repartido: un recuento en la
 * lectura rápida, una nota ámbar en cobertura y una frase al pie de la rejilla
 * del denominador de un servicio. Aquí es una figura, que es lo que un hueco
 * pide: diez barras iguales y una que no está.
 *
 * Nada se escribe a mano. Las once salen de `cobertura.entregasPublicadas` —lo
 * que el ministerio ha publicado— y las ausentes de `entregasNoPresentadas`. Si
 * el ayuntamiento comunica 2020 fuera de plazo, la barra se rellena sola y el
 * titular cambia de número sin que nadie lo toque.
 *
 * Lo que NO se escribe aquí y sí está en el mockup: «503 ayuntamientos
 * valencianos sí rindieron ese año». Es cierto y está publicado —en el
 * reportaje y en la pregunta registrada—, pero no sale de este snapshot: sería
 * una cifra copiada en un componente, sin nadie que la recotege, envejeciendo
 * en silencio. Es la misma trampa que se sacó del docblock de `Eficiencia.jsx`.
 * Se enlaza en vez de repetirse.
 */
export function EntregasBarras({ cobertura, sinAncla = false }) {
  const publicadas = cobertura?.entregasPublicadas ?? []
  const faltan = cobertura?.entregasNoPresentadas ?? []
  if (publicadas.length === 0) return null

  const presentadas = publicadas.length - faltan.length

  // Once rótulos de cuatro cifras no caben en 327px: salían pegados unos a
  // otros formando una sola cadena ilegible. Bajo 720px se rotulan sólo los
  // que sostienen la lectura —el primero, el último y CADA ausencia—, que es
  // exactamente lo que la figura tiene que decir: de este año a este otro,
  // falta éste. La ausencia nunca se queda sin nombre. Medido a 375px con una
  // captura; una prueba de desbordamiento no ve dos rótulos que se tocan.
  const clave = (anio) =>
    anio === publicadas[0] || anio === publicadas[publicadas.length - 1] || faltan.includes(anio)

  return (
    // Una sola tarjeta con el título DENTRO, arriba, igual que su pareja de
    // rejilla. Es lo que hace la maqueta, y sacar el título fuera dejaba el
    // rótulo y el titular flotando sobre la caja en vez de encabezarla.
    <div
      id={sinAncla ? undefined : 'sec-entregas'}
      className="cp-card"
      style={{ scrollMarginTop: MARGEN_ANCLA }}
    >
      <SectionHead
        as="h2"
        size="head"
        eyebrow="La entrega que falta"
        title={`${publicadas.length} entregas obligatorias, ${presentadas} presentadas`}
      />
      <div>
        {/* aria-hidden: la figura repite lo que el titular y el pie ya dicen en
          texto. Anunciar once barras sin nombre sería ruido, no información. */}
        <div
          aria-hidden="true"
          style={{ display: 'flex', gap: 5, marginTop: 16, alignItems: 'flex-end' }}
        >
          {publicadas.map((anio) => {
            const falta = faltan.includes(anio)
            return (
              <div
                key={anio}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: 44,
                    borderRadius: 'var(--r-input)',
                    ...(falta
                      ? { border: '1px dashed var(--warn)', background: 'var(--warn-soft)' }
                      : { background: 'var(--civic)' }),
                  }}
                />
                <div
                  className={`mono cp-entrega-anio${clave(anio) ? ' cp-entrega-anio-clave' : ''}`}
                  style={{ color: falta ? 'var(--warn-ink)' : 'var(--ink50)' }}
                >
                  {anio}
                </div>
              </div>
            )
          })}
        </div>

        <p
          style={{
            margin: '16px 0 0',
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink70)',
            lineHeight: 1.55,
            textWrap: 'pretty',
          }}
        >
          El artículo 116 <em>ter</em> de la Ley de Bases de Régimen Local obliga a calcular el
          coste efectivo antes del 1 de noviembre y comunicarlo al ministerio.{' '}
          {faltan.length === 1
            ? `En el libro de la Comunitat Valenciana de ${faltan[0]} Riba-roja no figura en ninguna tabla, mientras cientos de ayuntamientos valencianos sí rindieron ese año.`
            : `En los libros de ${faltan.join(' y ')} Riba-roja no figura en ninguna tabla.`}{' '}
          Cuántos rindieron, y por qué la pandemia no lo explica, en{' '}
          <a href="/reportajes/coste-efectivo" style={{ color: 'var(--civic)' }}>
            el reportaje
          </a>
          .
        </p>
      </div>
    </div>
  )
}
