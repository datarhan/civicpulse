import { Card, SectionHead } from '../Primitives'
import { useT } from '../../i18n'
import { LeyendaEscalones } from './Escalones'
import { calendarioEntrega, ORDEN_URL } from '../../scraper/cesel-entregas'

/**
 * Qué parte de su propio dominio enseña esta página.
 *
 * Mismo principio que `MoneyCoverage`: una cifra agregada sin denominador se
 * lee como completitud. Diez tarjetas bonitas dan a entender que ésos son los
 * servicios del ayuntamiento, cuando son los servicios cuyas dos cifras el
 * ayuntamiento declaró. El resto —la concesión, el cero sin declarar, el coste
 * duplicado— no son huecos de esta página: son hechos sobre la rendición de
 * cuentas municipal, y merecen decirse en voz alta.
 *
 * Los números salen del bloque `universe` del propio snapshot, nunca escritos a
 * mano, para que no puedan alejarse de las tarjetas que tienen al lado. Y los
 * cinco cubos son una PARTICIÓN comprobada por check:indicadores: si no
 * sumaran, la franja mentiría con más aplomo que el silencio.
 */
export function CoberturaEficiencia({
  universe,
  cobertura,
  anioBase,
  indicadores = [],
  conResultados = false,
}) {
  const t = useT()
  // Por qué lo más reciente es de hace dos años. Un lector que entra en 2026 y
  // lee «entrega 2024» deduce, razonablemente, que el sitio está sin
  // actualizar; y esa era la única lectura que la página permitía. El desfase
  // es del dato: un ejercicio se rinde antes del 1 de noviembre del año
  // siguiente y el ministerio publica después.
  //
  // Se DERIVA de `anioBase` y de la fecha de quien lee, no se escribe. Una
  // frase con «2025» y «2026» dentro se queda rancia en cuanto avanza la
  // entrega —o en cuanto pasa el plazo— y ninguna prueba de datos lo vería.
  const calendario = calendarioEntrega(anioBase, new Date())
  // Sin bloque `universe` no se dice nada, antes que insinuar una cobertura que
  // no se puede respaldar.
  if (!universe) return null

  // Cuántos de los cocientes publicados descansan sobre un denominador que el
  // ayuntamiento no vuelve a medir. Va aquí y no repetido en cada tarjeta: cada
  // ficha lleva ya su salvedad concreta, y diez avisos idénticos en fila se
  // leen como decoración. Lo que hace falta arriba es el recuento.
  const conRatio = indicadores.filter((i) => i.valor !== null)
  const congelados = conRatio.filter((i) => i.declaracion?.denominador?.congelada)
  const anios = congelados
    .map((i) => i.declaracion.denominador.desde)
    .filter((a) => Number.isFinite(a))
    .sort((a, b) => a - b)
  // Un solo año cuando coinciden; el rango cuando no. «Desde 2018» con la mitad
  // congelada en 2019 es una fecha más antigua de la que sostiene el dato.
  const desde =
    anios.length === 0
      ? null
      : anios[0] === anios[anios.length - 1]
        ? `${anios[0]}`
        : `${anios[0]}-${anios[anios.length - 1]}`

  // Derivado, no afirmado: si algún día se recompone el panel sin ipc.json, el
  // párrafo que promete euros constantes desaparece solo en vez de quedarse
  // mintiendo. Es el mismo motivo por el que la lista de comparados de
  // PanelMunicipal se calcula en vez de escribirse.
  const deflactadas = conRatio.filter((i) =>
    (i.serie ?? []).some((p) => typeof p.valorReal === 'number'),
  ).length

  // Con banda plausible en algún percentil, la regla de solapamiento se dice
  // UNA vez aquí — repetirla en cada tarjeta sería decoración.
  const conBanda = conRatio.some((i) => Array.isArray(i.pares?.percentilBanda))

  // El adaptador ya distingue «no hemos podido bajar la entrega» de «el
  // ayuntamiento no la presentó» —comprueba que el libro esté y que el
  // municipio no figure en él— y lo publica en `entregasNoPresentadas`. Ese
  // campo no lo leía nadie, así que el hecho estaba en el dato y no en la
  // página, mientras la frase de al lado lo atribuía a un problema de descarga.
  const noPresentadas = cobertura?.entregasNoPresentadas ?? []

  const filas = [
    { n: universe.conRatio, k: 'conRatio' },
    { n: universe.enConcesion, k: 'concesion' },
    { n: universe.sinUnidad, k: 'sinUnidad' },
    { n: universe.sinCoste, k: 'sinCoste' },
    { n: universe.noSePresta, k: 'noSePresta' },
  ].filter((f) => f.n > 0)

  return (
    <Card style={{ marginTop: 18 }}>
      <SectionHead
        as="h3"
        size="head"
        eyebrow="Cobertura"
        title={t('eficiencia.cobertura.titulo')}
      />
      {/* Todo el cuerpo en rejilla, no sólo las notas.
      
          Con la entradilla y la nota del calendario fuera, la mitad derecha de
          la tarjeta quedaba vacía sobre las columnas: la caja ocupaba los 1.160
          px y el texto no. Dentro de la rejilla, cada bloque es independiente y
          se coloca solo; la leyenda de escalones ocupa fila entera porque es una
          fila de pastillas y partirla en dos no significaría nada.
      
          `auto-fit` las apila cuando no caben, sin media query — que en el prop
          `style` no cabe. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
          gap: '4px 28px',
          alignItems: 'start',
          marginTop: 8,
        }}
      >
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink70, var(--ink50))',
          }}
        >
          De los <strong className="mono">{universe.serviciosEnRegistro}</strong> servicios que este
          panel sigue:{' '}
          {filas.map((f, idx) => (
            <span key={f.k}>
              <strong className="mono">{f.n}</strong> {t(`eficiencia.cobertura.${f.k}`)}
              {idx < filas.length - 1 ? ' · ' : '.'}
            </span>
          ))}{' '}
          <span className="mono">{universe.comparables}</span> tienen suficientes municipios
          comparables para situarlos.
        </p>
        {calendario && (
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink70, var(--ink50))',
            }}
          >
            <strong>Por qué la cifra más reciente es de {calendario.ultima}.</strong> Es la última
            que existe: el coste efectivo de un ejercicio se calcula sobre la liquidación de ese
            año, se rinde al ministerio{' '}
            <a href={ORDEN_URL} style={{ color: 'var(--civic)', textDecoration: 'underline' }}>
              antes del 1 de noviembre del año siguiente
            </a>{' '}
            y se publica después, así que el dato llega siempre con más de un año de retraso.{' '}
            {calendario.estado === 'en-plazo' ? (
              <>
                La entrega de <strong className="mono">{calendario.proxima}</strong> no viene con
                retraso: no vence hasta el 1 de noviembre de{' '}
                <strong className="mono">{calendario.venceEn}</strong>.
              </>
            ) : (
              <>
                El plazo para rendir la entrega de{' '}
                <strong className="mono">{calendario.proxima}</strong> terminó el 1 de noviembre de{' '}
                <strong className="mono">{calendario.venceEn}</strong> y el ministerio todavía no la
                ha publicado.
              </>
            )}
          </p>
        )}
        {/* Una columna más, no una fila entera. Ocupaba las tres y dejaba la
            tercera celda de la primera fila vacía; suelta en la rejilla cierra
            esa fila y las cuatro parejas caben en el ancho de una columna. */}
        <LeyendaEscalones indicadores={indicadores} conResultados={conResultados} />
        {congelados.length > 0 && (
          <p
            style={{
              margin: '10px 0 0',
              paddingLeft: 10,
              borderLeft: '3px solid var(--warn)',
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink70, var(--ink50))',
            }}
          >
            {congelados.length === conRatio.length ? (
              <>
                Los <strong className="mono">{conRatio.length}</strong> cocientes de arriba tienen
              </>
            ) : (
              <>
                <strong className="mono">
                  {congelados.length} de {conRatio.length}
                </strong>{' '}
                de estos cocientes tienen
              </>
            )}{' '}
            un denominador que el ayuntamiento no vuelve a medir: declara la misma cantidad
            {desde ? ` desde ${desde}` : ''} entrega tras entrega, mientras actualiza el coste en
            cada una. Un coste unitario así puede subir sin que el servicio haya cambiado, y su
            serie no se puede leer como gestión. Cada tarjeta va marcada con el año desde el que no
            se remide, y lleva dentro cuántos municipios comparables hacen lo mismo.{' '}
            <a
              href="/laboratorio/frontera"
              style={{ color: 'var(--civic)', textDecoration: 'underline' }}
            >
              La medición completa
            </a>
            .
          </p>
        )}
        {deflactadas > 0 && (
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink70, var(--ink50))',
            }}
          >
            Las series van en <strong>euros constantes</strong> de la entrega que titula cada
            tarjeta, deflactadas con el IPC general del INE. En euros corrientes no se pueden leer:
            entre la primera entrega y la última el nivel de precios subió lo suficiente como para
            que un servicio que costara lo mismo en términos reales apareciera subiendo. La
            comparación con otros municipios, en cambio, va sin deflactar y a propósito —es de un
            año contra ese mismo año, así que corregirla movería todas las cifras por igual sin
            cambiar ninguna posición, y dejarían de coincidir con la celda del ministerio que citan.
          </p>
        )}
        {conBanda && (
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink70, var(--ink50))',
            }}
          >
            Cada percentil lleva al lado su <strong>banda plausible</strong>, calculada
            remuestreando la propia muestra de comparables: con treinta o cincuenta municipios, un
            puesto exacto aparenta una precisión que la muestra no tiene. Y la regla no se queda en
            enunciado: si la banda de un servicio cruza la mediana del grupo, el libro{' '}
            <strong>no le da lado</strong> — su punto va hueco, no entra en el recuento de «por
            encima» ni en el de «por debajo», y la fila lo dice. Antes esa advertencia iba en una
            salvedad plegada mientras la cabecera ya había contado ese servicio de un lado.
          </p>
        )}
        {noPresentadas.length > 0 && (
          <p
            style={{
              margin: '10px 0 0',
              paddingLeft: 10,
              borderLeft: '3px solid var(--warn)',
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink70, var(--ink50))',
            }}
          >
            {noPresentadas.length === 1 ? (
              <>
                La entrega de <strong className="mono">{noPresentadas[0]}</strong> no falta por un
                problema de descarga: falta porque el ayuntamiento no la presentó.
              </>
            ) : (
              <>
                Las entregas de <strong className="mono">{noPresentadas.join(', ')}</strong> no
                faltan por un problema de descarga: faltan porque el ayuntamiento no las presentó.
              </>
            )}{' '}
            El libro de la Comunitat Valenciana está descargado y los demás municipios sí figuran en
            él; éste no aparece en ninguna de sus tablas de coste, gestión ni unidades físicas.
            Calcularlo antes del 1 de noviembre y comunicarlo al ministerio es una obligación del
            artículo 116 ter de la Ley de Bases de Régimen Local.
          </p>
        )}
        {cobertura && (
          <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-aux)', color: 'var(--ink50)' }}>
            Entregas publicadas por el ministerio:{' '}
            <span className="mono">{cobertura.entregasPublicadas?.join(', ')}</span>. Obtenidas
            aquí: <span className="mono">{cobertura.entregasObtenidas?.join(', ')}</span>.{' '}
            {cobertura.motivoFaltantes}
          </p>
        )}
      </div>
    </Card>
  )
}
