import { Card, Pill } from '../Primitives'

const pct = (v) => `${(v * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`
const num = (v, d = 3) =>
  v === null || v === undefined
    ? '—'
    : v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })

const MOTIVOS = {
  'sin-filas': 'no aparecen en la entrega',
  'no-se-presta': 'declaran que no prestan el servicio',
  'modo-no-directa': 'lo prestan por concesión u otro modo',
  'coste-no-declarado': 'no declaran el coste',
  'unidad-no-declarada': 'no declaran la unidad física',
}

/**
 * Una especificación: qué cesta, a quién se pudo comparar, y qué salió.
 *
 * El orden es deliberado y va al revés de lo que apetece: primero la cobertura
 * —cuántos ayuntamientos se quedaron fuera y por qué—, después la puntuación.
 * Una puntuación en cabecera con la cobertura en letra pequeña debajo invita a
 * leer «0,53» como un hecho sobre el municipio en vez de como una distancia a
 * una frontera dibujada con veinticuatro observaciones.
 *
 * La distribución va sin nombres. Ver el comentario largo de
 * `src/scraper/dea-especificacion.ts`: aquí la cifra es el veredicto de un
 * modelo nuestro, no una división de dos números del ministerio.
 */
export function EspecificacionCard({ e, principal }) {
  const cob = e.cobertura
  const fuera = Object.entries(cob.excluidas ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])

  return (
    <Card style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h3
          style={{
            fontSize: 'var(--fs-head)',
            fontWeight: 650,
            margin: 0,
            letterSpacing: '-.01em',
          }}
        >
          {e.titulo}
        </h3>
        {principal && <Pill tone="civic">lectura principal</Pill>}
        <Pill tone={e.estado === 'publicada' ? 'ok' : 'neutral'}>
          {e.estado === 'publicada' ? 'con puntuación' : 'sin puntuación'}
        </Pill>
      </div>

      <p
        style={{
          margin: '6px 0 10px',
          color: 'var(--ink50)',
          fontSize: 'var(--fs-aux)',
          maxWidth: '66ch',
        }}
      >
        {e.porQue}
      </p>

      {/* Cobertura primero: la puntuación no significa nada sin ella. */}
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          textTransform: 'uppercase',
          letterSpacing: '.07em',
          color: 'var(--ink50)',
        }}
      >
        Comparables
      </div>
      <p
        style={{
          margin: '2px 0 0',
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink70)',
          maxWidth: '66ch',
        }}
      >
        <span className="mono" style={{ fontSize: 'var(--fs-head)', fontWeight: 650 }}>
          {cob.incluidas}
        </span>{' '}
        de {cob.banda} municipios de la banda. Se caen{' '}
        {fuera.map(([m, n], i) => (
          <span key={m}>
            {i > 0 && (i === fuera.length - 1 ? ' y ' : ', ')}
            <span className="mono">{n}</span> que {MOTIVOS[m] ?? m}
          </span>
        ))}
        .
      </p>
      <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-aux)', color: 'var(--ink50)' }}>
        Regla de grados de libertad: {e.gradosLibertad.n} unidades para {e.gradosLibertad.salidas}{' '}
        salidas, hacen falta {e.gradosLibertad.minimo}.{' '}
        {e.gradosLibertad.cumple ? 'Se cumple.' : 'No se cumple.'}
      </p>

      {e.estado !== 'publicada' && (
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink70)',
            padding: '8px 10px',
            borderLeft: '3px solid var(--border2)',
            maxWidth: '66ch',
          }}
        >
          {e.motivoEstado}
        </p>
      )}

      {e.propia && (
        <>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 14 }}>
            <Cifra
              rotulo="Distancia a la frontera"
              valor={num(e.propia.theta)}
              nota={`corregida por sesgo: ${num(e.propia.thetaCorregido)}`}
            />
            <Cifra
              rotulo={`Intervalo al ${pct(1 - e.propia.ic.alfa)}`}
              valor={
                e.propia.intervaloAcotaPorAbajo
                  ? `${num(e.propia.ic.inferior, 2)} – ${num(e.propia.ic.superior, 2)}`
                  : `sin cota – ${num(e.propia.ic.superior, 2)}`
              }
              nota={
                e.propia.intervaloAcotaPorAbajo
                  ? `${e.bootstrap.replicas.toLocaleString('es-ES')} réplicas`
                  : 'el extremo inferior se sale de la escala: esta cesta no acota nada por abajo'
              }
            />
            <Cifra
              rotulo="Por debajo de ella"
              valor={`${Math.round(e.propia.percentil)} %`}
              nota={`${e.distribucion.eficientes} de ${e.distribucion.n} sin nadie por delante`}
            />
          </div>

          <p
            style={{
              margin: '12px 0 0',
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink50)',
              maxWidth: '66ch',
            }}
          >
            {e.propia.theta >= 0.999 ? (
              <>
                Ninguna combinación de los municipios observados habría producido lo mismo con
                menos. Eso no es «ser eficiente»: es no haber sido superado dentro de una muestra de{' '}
                {e.distribucion.n}.
              </>
            ) : (
              <>
                Existe una combinación de {e.propia.referencias} municipios observados que declaró
                producir al menos lo mismo con el {pct(e.propia.theta)} de ese gasto. La corrección
                por sesgo lo baja al {pct(e.propia.thetaCorregido)}, porque una frontera estimada
                con {e.distribucion.n} unidades cae siempre por dentro de la verdadera.
              </>
            )}{' '}
            {e.distribucion.autorreferentes > 0 && (
              <>
                De las {e.distribucion.eficientes} unidades sin nadie por delante,{' '}
                {e.distribucion.autorreferentes} lo son sin que ninguna otra se apoye en ellas:
                están en la frontera por ser raras, no por ser buenas.
              </>
            )}
          </p>

          <Histograma d={e.distribucion} propia={e.propia.theta} />
        </>
      )}
    </Card>
  )
}

function Cifra({ rotulo, valor, nota }) {
  return (
    <div style={{ minWidth: 150 }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          textTransform: 'uppercase',
          letterSpacing: '.07em',
          color: 'var(--ink50)',
        }}
      >
        {rotulo}
      </div>
      <div
        className="mono"
        style={{ fontSize: 'var(--fs-card)', fontWeight: 650, letterSpacing: '-.02em' }}
      >
        {valor}
      </div>
      <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', maxWidth: '30ch' }}>
        {nota}
      </div>
    </div>
  )
}

/**
 * La distribución, en décimas y sin nombres.
 *
 * Las barras llevan su recuento como texto: una altura no la lee un lector de
 * pantalla, y la pasada axe estricta tampoco daría por buena una cifra
 * codificada sólo por geometría.
 */
function Histograma({ d, propia }) {
  const max = Math.max(...d.histograma.map((h) => h.n), 1)
  const tramoPropio = Math.min(9, Math.floor(propia * 10))
  return (
    <div style={{ marginTop: 14 }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          textTransform: 'uppercase',
          letterSpacing: '.07em',
          color: 'var(--ink50)',
        }}
      >
        Distribución de las {d.n} unidades comparables
      </div>
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 64, marginTop: 8 }}>
        {d.histograma.map((h, i) => (
          <div key={h.desde} style={{ flex: 1, textAlign: 'center' }}>
            <div className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
              {h.n || ''}
            </div>
            <div
              style={{
                height: `${(h.n / max) * 40}px`,
                minHeight: h.n ? 2 : 0,
                background: i === tramoPropio ? 'var(--civic)' : 'var(--border2)',
                borderRadius: 'var(--r-input)',
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
        {d.histograma.map((h, i) => (
          <div
            key={h.desde}
            className="mono"
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 'var(--fs-micro)',
              color: i === tramoPropio ? 'var(--civic)' : 'var(--ink50)',
            }}
          >
            {h.hasta.toFixed(1).replace('.', ',')}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', margin: '8px 0 0' }}>
        Riba-roja cae en el tramo marcado. No se publica qué municipio es cada barra: la puntuación
        sale de un modelo de este sitio, no de una cifra del ministerio, y nombrarlos sería firmar
        una afirmación sobre ellos sin darles derecho de réplica. Mediana{' '}
        <span className="mono">{num(d.mediana, 2)}</span>, cuartiles{' '}
        <span className="mono">{num(d.p25, 2)}</span> y{' '}
        <span className="mono">{num(d.p75, 2)}</span>.
      </p>
    </div>
  )
}
