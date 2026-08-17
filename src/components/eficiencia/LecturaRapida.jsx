import { Card } from '../Primitives'
import { MARGEN_ANCLA } from '../SubnavSecciones'
import { useT } from '../../i18n'
import { particionPosiciones } from '../../scraper/indicador-areas'

/**
 * La respuesta corta, arriba — sin convertirse en una nota.
 *
 * La página contestaba «¿cuánto cuesta y qué se obtiene?» con trece pantallas y
 * ninguna conclusión: quien entraba por primera vez no sabía si lo que tenía
 * delante iba bien o mal, y la doctrina de esta superficie —componentes sí,
 * suma no— se leía como silencio. Esto es lo máximo que esa doctrina permite
 * decir en cabecera, y todo sale del propio snapshot:
 *
 * - **Recuentos, jamás una media.** «6 por debajo de su mediana · 6 por
 *   encima» es una partición de los percentiles que cada ficha ya publica;
 *   promediarlos sería la nota global por la puerta de atrás
 *   (`ResumenPosiciones` lo dice desde antes que esta cabecera existiera).
 * - **La posición no se colorea.** Un coste unitario alto no es un suspenso
 *   (policía es un PRECIO por efectivo); el acento de aviso se reserva para lo
 *   que sí es un hecho sobre la rendición: denominadores sin remedir y la
 *   entrega sin rendir.
 * - **La limitación viaja con el resumen.** Los servicios sin cociente posible
 *   son una casilla más, no una nota al pie que llega trece pantallas tarde.
 * - **La frase editorial va fechada** y sus números interpolados del snapshot:
 *   si la entrega siguiente mueve la partición, la frase se mueve con ella y
 *   el guardián de prosa caduca vigila el resto.
 */
export function LecturaRapida({ data, firmados = 0 }) {
  const t = useT()
  const indicadores = data?.indicadores ?? []
  if (indicadores.length === 0) return null

  const p = particionPosiciones(indicadores)
  const conRatio = indicadores.filter((i) => i.valor !== null)
  const bloqueados = indicadores.length - conRatio.length
  const congelados = conRatio.filter((i) => i.declaracion?.denominador?.congelada).length
  const medibles = conRatio.filter((i) => i.declaracion?.denominador).length
  const sinRendir = data?.cobertura?.entregasNoPresentadas ?? []
  const entrega = data?.anioBase

  const tiles = [
    {
      href: '#sec-posiciones',
      valor: String(conRatio.length),
      etiqueta: t('eficiencia.lectura.servicios'),
    },
    {
      href: '#sec-servicios',
      valor: `${p.abajo} ↓ · ${p.arriba} ↑`,
      etiqueta: t('eficiencia.lectura.particion'),
    },
    congelados > 0 && {
      href: '#sec-declaracion',
      valor: `${congelados} de ${medibles}`,
      etiqueta: t('eficiencia.lectura.congelados'),
      aviso: true,
    },
    sinRendir.length > 0 && {
      href: '#sec-cobertura',
      valor: sinRendir.join(' · '),
      etiqueta: t('eficiencia.lectura.sinRendir'),
      aviso: true,
    },
    bloqueados > 0 && {
      href: '#sec-bloqueados',
      valor: String(bloqueados),
      etiqueta: t('eficiencia.lectura.bloqueados'),
    },
    firmados > 0 && {
      href: '#hallazgos',
      valor: String(firmados),
      etiqueta:
        firmados === 1 ? t('eficiencia.lectura.hallazgo') : t('eficiencia.lectura.hallazgos'),
    },
  ].filter(Boolean)

  // La frase de posiciones sólo afirma «sin titular único» cuando la partición
  // lo sostiene; si un lado domina, dice cuál. Derivado, no escrito.
  const equilibrado = p.situados > 0 && Math.min(p.abajo, p.arriba) >= Math.ceil(p.situados * 0.25)
  const fraseGrueso =
    p.arriba > p.abajo
      ? 'el grueso queda por encima de la mediana de su banda'
      : 'el grueso queda por debajo de la mediana de su banda'

  return (
    <Card id="sec-lectura" style={{ marginTop: 16, scrollMarginTop: MARGEN_ANCLA }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          textTransform: 'uppercase',
          letterSpacing: '.07em',
          color: 'var(--ink50)',
        }}
      >
        {t('eficiencia.lectura.titulo')} · agosto de 2026
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))',
          gap: 10,
          marginTop: 12,
        }}
      >
        {tiles.map((tile) => (
          <a
            key={tile.href + tile.etiqueta}
            href={tile.href}
            style={{
              display: 'block',
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${tile.aviso ? 'var(--warn)' : 'var(--border)'}`,
              borderRadius: 'var(--r-input)',
              color: 'inherit',
              textDecoration: 'none',
              background: 'var(--bg2, transparent)',
            }}
          >
            <span
              className="mono"
              style={{
                display: 'block',
                fontSize: 'var(--fs-head)',
                fontWeight: 650,
                letterSpacing: '-.01em',
              }}
            >
              {tile.valor}
            </span>
            <span
              style={{
                display: 'block',
                marginTop: 4,
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink50)',
                textTransform: 'uppercase',
                letterSpacing: '.05em',
                lineHeight: 1.35,
              }}
            >
              {tile.etiqueta}
            </span>
          </a>
        ))}
      </div>

      {/* La lectura editorial: números interpolados, marcos condicionados a lo
          que la partición sostiene, y el límite al final — porque «¿va bien o
          mal?» merece una respuesta y la honesta tiene tres partes. */}
      <p
        style={{
          margin: '14px 0 0',
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink70, var(--ink50))',
          maxWidth: '68ch',
          lineHeight: 1.55,
        }}
      >
        {entrega ? `Con la entrega de ${entrega} delante: ` : ''}
        {p.situados > 0 && (
          <>
            {equilibrado
              ? `los costes por unidad no tienen un titular único — de los ${p.situados} servicios con comparación, ${p.abajo} quedan por debajo de la mediana de municipios parecidos y ${p.arriba} por encima — y se leen servicio a servicio, no en bloque. `
              : `de los ${p.situados} servicios con comparación, ${fraseGrueso} (${p.abajo} por debajo, ${p.arriba} por encima). `}
          </>
        )}
        {congelados > 0 && (
          <>
            Lo uniforme no está en los costes sino en la declaración que los sostiene:{' '}
            {congelados === medibles ? `las ${congelados}` : `${congelados} de las ${medibles}`}{' '}
            cantidades entre las que se divide llevan años sin remedirse
            {sinRendir.length > 0
              ? `, y la entrega de ${sinRendir.join(' y ')} sigue sin rendir. `
              : '. '}
          </>
        )}
        Ninguna de estas cifras mide la calidad del servicio: dicen lo que costó cada unidad
        declarada. Qué permite concluir cada una, y qué no,{' '}
        <a href="/metodologia#eficiencia" style={{ color: 'var(--civic)' }}>
          en la metodología
        </a>
        .
      </p>
    </Card>
  )
}
