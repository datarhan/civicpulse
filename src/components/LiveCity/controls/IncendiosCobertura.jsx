// @ts-check
import { useMemo } from 'react'
import { useTenders } from '../../../hooks/useTenders'
import { useTenderGeo } from '../../../hooks/useTenderGeo'
import { contratosDeIncendio } from '../../../lib/incendios'

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })

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
 */
export function IncendiosCobertura({ universe }) {
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
        {nf.format(universe.dibujados)} incendios · {universe.anyoMin}–{universe.anyoMax} ·{' '}
        {universe.superficieHaTotal.toLocaleString('es-ES', { maximumFractionDigits: 0 })} ha
      </div>

      {/* La suma es de incendios COMPLETOS. Cada ficha ya lo dice de su
          propia cifra; el titular no lo decía de la suya, y «215 ha» se lee
          como 215 hectáreas ardidas DENTRO del término. Recortar por la
          frontera daría una cifra nuestra con firma de la Generalitat, así que
          lo que se ajusta es la frase, no el número. */}
      <div style={{ marginTop: 3 }}>
        La superficie es la de cada incendio completo, no sólo la parte que ardió dentro del
        término.
      </div>

      <div style={{ marginTop: 3 }}>{universe.aviso}.</div>

      {aniosSinCartografiar > 0 && (
        <div style={{ marginTop: 3 }}>
          La cartografía del ICV llega a {universe.anyoMax}: de los últimos{' '}
          {aniosSinCartografiar === 1 ? 'meses' : `${aniosSinCartografiar} años`} no hay perímetros
          dibujados, ni constancia aquí de si hubo incendios.
        </div>
      )}

      {universe.atribuidosSinPerimetroAqui > 0 && (
        <div style={{ marginTop: 3 }}>
          {universe.atribuidosSinPerimetroAqui === 1
            ? 'Otro incendio '
            : `Otros ${universe.atribuidosSinPerimetroAqui} incendios `}
          (
          {universe.superficieHaSinPerimetroAqui.toLocaleString('es-ES', {
            maximumFractionDigits: 0,
          })}{' '}
          ha) {universe.atribuidosSinPerimetroAqui === 1 ? 'consta' : 'constan'} a nombre de
          Riba-roja pero la Generalitat{' '}
          {universe.atribuidosSinPerimetroAqui === 1 ? 'lo dibuja' : 'los dibuja'} fuera del
          término, así que no se {universe.atribuidosSinPerimetroAqui === 1 ? 'pinta' : 'pintan'}.
        </div>
      )}

      {contratos.total > 0 && contratos.situados === 0 && (
        <div style={{ marginTop: 3 }}>
          El ayuntamiento tiene {contratos.total} contratos que hablan de incendios y ninguno se
          puede situar en el mapa: la prevención se contrata para todo el municipio y no nombra
          ningún paraje.
        </div>
      )}
    </div>
  )
}
