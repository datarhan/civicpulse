// @ts-check
import { useMemo } from 'react'
import { useTenders } from '../../../hooks/useTenders'
import { useTenderGeo } from '../../../hooks/useTenderGeo'
import { useT } from '../../../i18n'
import { rellena } from '../../../lib/formatters'
import { contratosDeIncendio } from '../../../lib/incendios'

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })
const ha = (n) => n.toLocaleString('es-ES', { maximumFractionDigits: 0 })

/**
 * Lo que esta capa NO enseña, con las cifras de la propia capa.
 *
 * Tres huecos, y ninguno es un adorno:
 *
 * 1. El ICV avisa de que no cartografía todos los incendios del periodo. Es
 *    su advertencia, viaja en el snapshot y se publica literal.
 *
 * 2. La cartografía se detiene en el último año que trae el servicio. La
 *    frase se DERIVA de `universe.anyoMax`: escribir el año a mano es lo que
 *    ya dejó tres frases mintiendo en este repo cuando el dato se movió.
 *
 * 3. La prevención de incendios que contrata el ayuntamiento no se puede
 *    poner al lado de una cicatriz, porque se contrata «en el municipio» y no
 *    nombra ningún sitio. El resolutor de lugares se niega —con razón— a
 *    situarla, y ese cero es el dato, no un fallo que tapar.
 *
 * Igual que MoneyCoverage: sin bloque `universe` no se dice nada, en vez de
 * insinuar una cobertura que no se puede sostener.
 *
 * Las frases salen del catálogo, cada una entera y con sus huecos: en la portada
 * valenciana se leían en castellano. El aviso del ICV es un dato y no se traduce.
 */
export function IncendiosCobertura({ universe }) {
  const t = useT()
  const { data: tenders } = useTenders()
  const { data: tgeo } = useTenderGeo()
  const contratos = useMemo(
    () => contratosDeIncendio(tenders?.contracts, tgeo?.assignments),
    [tenders, tgeo],
  )

  if (!universe || !universe.dibujados) return null

  const anyoActual = new Date().getFullYear()
  const aniosSinCartografiar = anyoActual - universe.anyoMax

  return (
    <div
      style={{
        marginTop: 6,
        paddingTop: 6,
        borderTop: '1px solid #E6E1D4',
        fontSize: 'var(--fs-micro)',
        color: 'rgba(11,15,25,.62)',
        lineHeight: 1.4,
      }}
    >
      <div style={{ fontFamily: "'DM Mono', monospace", color: 'rgba(11,15,25,.75)' }}>
        {rellena(t('map.incendios.resumen'), {
          n: nf.format(universe.dibujados),
          desde: universe.anyoMin,
          hasta: universe.anyoMax,
          ha: ha(universe.superficieHaTotal),
        })}
      </div>

      {/* La suma es de incendios COMPLETOS. Cada ficha ya lo dice de su
          propia cifra; el titular no lo decía de la suya, y «215 ha» se lee
          como 215 hectáreas ardidas DENTRO del término. Recortar por la
          frontera daría una cifra nuestra con firma de la Generalitat, así que
          lo que se ajusta es la frase, no el número. */}
      <div style={{ marginTop: 3 }}>{t('map.incendios.superficie')}</div>

      <div style={{ marginTop: 3 }}>{universe.aviso}.</div>

      {aniosSinCartografiar === 1 && (
        <div style={{ marginTop: 3 }}>
          {rellena(t('map.incendios.cartografia.meses'), { hasta: universe.anyoMax })}
        </div>
      )}
      {aniosSinCartografiar > 1 && (
        <div style={{ marginTop: 3 }}>
          {rellena(t('map.incendios.cartografia.anios'), {
            hasta: universe.anyoMax,
            n: aniosSinCartografiar,
          })}
        </div>
      )}

      {universe.atribuidosSinPerimetroAqui === 1 && (
        <div style={{ marginTop: 3 }}>
          {rellena(t('map.incendios.fueraDelTermino.uno'), {
            ha: ha(universe.superficieHaSinPerimetroAqui),
          })}
        </div>
      )}
      {universe.atribuidosSinPerimetroAqui > 1 && (
        <div style={{ marginTop: 3 }}>
          {rellena(t('map.incendios.fueraDelTermino.varios'), {
            n: universe.atribuidosSinPerimetroAqui,
            ha: ha(universe.superficieHaSinPerimetroAqui),
          })}
        </div>
      )}

      {contratos.total > 0 && contratos.situados === 0 && (
        <div style={{ marginTop: 3 }}>
          {rellena(t('map.incendios.contratosSinSituar'), { n: contratos.total })}
        </div>
      )}
    </div>
  )
}
