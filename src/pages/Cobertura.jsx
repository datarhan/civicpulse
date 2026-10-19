import { useMemo } from 'react'
import { Card, Pill, SectionHead } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { usePlenoClaimsManifest, CLAIM_TYPE_LABEL } from '../hooks/usePlenoClaims'
import { esMarcaDePasada } from '../scraper/claim-verdicts'
import { MOTIVOS_DE_RETENCION, MOTIVO_DE_RETENCION_ETIQUETA } from '../scraper/claim-public-gate'
import { diaDeLaSede } from '../scraper/queja-router'
import { rotuloDe, useT } from '../i18n'
import { useSolicitudesAcceso } from '../hooks/useSolicitudesAcceso'
import { CLASES_PEDIBLES, CLASE_ETIQUETA } from '../scraper/clase-documental'
// La etiqueta y el tono de cada estado viven con el enum, tipados: aquí eran
// literales, y un estado nuevo sin su fila habría pintado «undefined».
import {
  ESTADO_SOLICITUD_ETIQUETA as ESTADO_ETIQUETA,
  ESTADO_SOLICITUD_TONO as ESTADO_TONO,
  estadoDeSolicitud,
  frasePublica,
  tituloSolicitudes,
} from '../scraper/solicitud-acceso'

/**
 * /laboratorio/cobertura — de lo que se dice en un pleno, ¿contra qué podemos
 * cotejarlo?
 *
 * La página contesta una pregunta sobre NOSOTROS, no sobre nadie: cuántas de
 * las declaraciones publicadas llegaron a cotejarse contra algún corpus y
 * cuántas no tenían ninguno contra el que hacerlo. Ese segundo número no dice
 * que la declaración sea falsa ni que sea cierta: dice que aún no tenemos con
 * qué comprobarla.
 *
 * Y hay un tercero, que no es ninguno de los dos: las declaraciones cuyo
 * veredicto rehízo una pasada posterior —el motor, un curador— dejando su marca
 * en lugar de la lista de lo consultado. La página sacaba «sin corpus» por
 * resta (`total − conCorpus`) y las metía ahí sin que nadie lo afirmara; ahora
 * cada casilla se lee del manifiesto, ninguna por diferencia.
 *
 * Vive en el laboratorio y hereda las tres reglas de la frontera:
 *
 *   1. No nombra a nadie. Ni una persona, ni un grupo, ni una cita literal —
 *      esto son recuentos, y un recuento no necesita a quién.
 *   2. La ausencia se publica como ausencia. Un tipo de declaración sin corpus
 *      sale con su hueco a la vista, no omitido.
 *   3. No genera hallazgos, y no cuenta para la cadencia de verificaciones. Un
 *      hueco no es una verificación, y meterlo en ese reloj para ponerlo verde
 *      sería exactamente el fraude que este repositorio persigue en su propio
 *      código.
 *
 * El universo es lo PUBLICADO. El corpus interno lleva más declaraciones, pero
 * la puerta editorial retiene el verbatim de las acusaciones que no se han
 * podido comprobar y esas no se sirven. Se dice en la página, porque un
 * denominador sin declarar es la mitad de una cifra.
 *
 * Los números salen de la tabla cruzada del manifiesto (~1 KB), no de los
 * trozos: la regla de la casa es preferir un escalar precomputado a enviar el
 * corpus.
 */

/**
 * Barra de proporción. Sin texto dentro — la cifra va al lado, en mono.
 *
 * Aquí `--ok`/`--warn` son RELLENO, que es para lo que sirven. En texto hay que
 * usar `--ok-ink`/`--warn-ink`: los primeros no llegan al contraste AA sobre
 * papel y la pasada de axe lo cazó con 17 nodos.
 */
function Barra({ conCorpus, total }) {
  const pct = total > 0 ? (100 * conCorpus) / total : 0
  return (
    <div
      style={{
        height: 8,
        borderRadius: 'var(--r-pill)',
        background: 'var(--soft)',
        overflow: 'hidden',
        minWidth: 48,
      }}
      role="presentation"
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: pct >= 50 ? 'var(--ok)' : 'var(--warn)',
        }}
      />
    </div>
  )
}

/**
 * Seis columnas en una tarjeta de 333 px, a 375: con la de «No consta» y los
 * 8 px de antes, la tabla por tema pasaba 27 px y la barra salía cortada por el
 * scroll. Con 6 px de relleno y la barra a 48 px, las dos vuelven a caber, como
 * cabían con cinco (medido el 30-09-2026). A 320 ya se desplazaban, y siguen.
 */
const RELLENO = 6

/** Una cifra en el texto corrido, con el separador de miles de la página. */
const fmt = (n) => n.toLocaleString('es-ES')

function TablaCobertura({ titulo, filas, etiqueta, columna }) {
  const orden = useMemo(() => [...filas].sort((a, b) => b[1].total - a[1].total), [filas])
  const th = { padding: `6px ${RELLENO}px`, fontWeight: 500, textAlign: 'right' }
  const td = { padding: `8px ${RELLENO}px`, textAlign: 'right' }
  return (
    <Card style={{ marginTop: 12 }}>
      <h3 style={{ fontSize: 'var(--fs-card)', margin: '0 0 12px' }}>{titulo}</h3>
      <div style={{ overflowX: 'auto' }} className="cp-scroll-x">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-meta)' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--ink70)' }}>
              <th style={{ padding: `6px ${RELLENO}px 6px 0`, fontWeight: 500 }}>{columna}</th>
              <th style={th}>Total</th>
              <th style={th}>Con corpus</th>
              <th style={th}>Sin corpus</th>
              <th style={th}>No consta</th>
              <th style={{ padding: `6px 0 6px ${RELLENO}px`, fontWeight: 500, minWidth: 64 }}>
                Cobertura
              </th>
            </tr>
          </thead>
          <tbody>
            {orden.map(([clave, v]) => (
              <tr key={clave} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: `8px ${RELLENO}px 8px 0` }}>{etiqueta(clave)}</td>
                <td className="mono" style={td}>
                  {v.total}
                </td>
                <td className="mono" style={td}>
                  {v.comprobadoSinHallar}
                </td>
                <td
                  className="mono"
                  style={{ ...td, color: v.sinCorpus > 0 ? 'var(--warn-ink)' : 'var(--ink70)' }}
                >
                  {v.sinCorpus}
                </td>
                <td className="mono" style={td}>
                  {v.noConsta}
                </td>
                <td style={{ padding: `8px 0 8px ${RELLENO}px` }}>
                  <Barra conCorpus={v.comprobadoSinHallar} total={v.total} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export default function Cobertura() {
  const t = useT()
  const manifest = usePlenoClaimsManifest()
  const registro = useSolicitudesAcceso()
  // `null` mientras carga o si no se pudo leer: un registro que no se ha leído
  // no dice «sin pedir», dice que no consta. Un 404 sí es el registro vacío
  // (el hook lo resuelve a `{ items: [] }`), y ahí «sin pedir» es cierto.
  const solicitudesLeidas =
    !registro.loading && !registro.error ? (registro.data?.items ?? []) : null
  // El día de la sede, no el de UTC: entre las 22:00 y las 24:00 de Madrid, el
  // de UTC es ayer, y un plazo vencido ese día se pintaba «en plazo».
  const hoy = diaDeLaSede(new Date().toISOString())
  const totals = manifest.data?.totals
  const cob = totals?.cobertura
  // `null` cuando el manifiesto no trae el cruce: no se ha contado, y un `?? {}`
  // lo pintaba como «0 declaraciones» en cada documento (regla 3: un centinela
  // nunca es un valor). Con el bloque presente, una clase ausente sí es un 0.
  const porClaseDoc = cob?.porClaseDocumental?.porClase ?? null

  // Lo que la puerta editorial retiene, por tipo. Ordenado de más a menos.
  const retenidas = useMemo(
    () => Object.entries(totals?.retenidas ?? {}).sort((a, b) => b[1] - a[1]),
    [totals],
  )

  // Y por qué. El orden es el del enum, que es el de la puerta; un motivo a
  // cero no ocupa línea. `null` si el manifiesto no trae el reparto: entonces
  // se dice que no consta, en vez de recitar unos motivos que no se han contado.
  const porMotivo = useMemo(() => {
    const r = totals?.retenidasPorMotivo
    if (!r) return null
    const filas = MOTIVOS_DE_RETENCION.map((m) => [m, r[m] ?? 0]).filter(([, n]) => n > 0)
    return { filas, total: filas.reduce((a, [, n]) => a + n, 0) }
  }, [totals])

  // Cada casilla, del manifiesto. «Sin corpus» salía por resta y se llevaba
  // las filas de las que no consta qué se consultó.
  const resumen = useMemo(() => {
    if (!cob) return null
    const filas = Object.values(cob.porTipo)
    const suma = (campo) => filas.reduce((a, v) => a + v[campo], 0)
    return {
      total: suma('total'),
      conCorpus: suma('comprobadoSinHallar'),
      sinCorpus: suma('sinCorpus'),
      noConsta: suma('noConsta'),
    }
  }, [cob])

  if (manifest.loading) return <p style={{ color: 'var(--ink70)' }}>{t('common.loading')}</p>
  if (!cob || !resumen) {
    // Honesto: sin tabla no se inventa una cobertura del 100 %.
    return (
      <>
        <SectionHead
          eyebrow="Laboratorio · cobertura de comprobación"
          title="Qué podemos comprobar"
        />
        <Card>
          <p style={{ color: 'var(--ink70)', margin: 0 }}>
            El manifiesto de declaraciones no trae la tabla de cobertura, así que esta página no
            tiene nada que medir. No es que la cobertura sea cero: es que no se ha podido calcular.
          </p>
        </Card>
      </>
    )
  }

  const pct = resumen.total > 0 ? (100 * resumen.conCorpus) / resumen.total : 0
  // Ausente en un manifiesto anterior al 19-10-2026: entonces no consta.
  const pasadas = cob.pasadas ?? null

  return (
    <>
      <SectionHead
        eyebrow="Laboratorio · cobertura de comprobación"
        title="Qué podemos comprobar"
      />

      <p style={{ color: 'var(--ink70)', maxWidth: '72ch', lineHeight: 1.6, marginTop: 0 }}>
        De todo lo que se dice en un pleno, sólo una parte puede cotejarse contra datos abiertos.
        Esta página mide esa parte.{' '}
        <strong style={{ color: 'var(--ink)' }}>No juzga a nadie</strong> — no nombra personas ni
        grupos, y no contiene ninguna cita: son recuentos. Y lo que mide es una limitación nuestra,
        no un reproche a quien habla: que no tengamos con qué comprobar una cifra no la hace ni
        falsa ni cierta.
      </p>

      <DataAsOf
        iso={manifest.data?.generatedAt}
        label="Declaraciones"
        file="pleno-claims/index.json"
      />

      <Card style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)' }}>
              DECLARACIONES PUBLICADAS
            </div>
            <div className="mono" style={{ fontSize: 'var(--fs-head)' }}>
              {resumen.total}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)' }}>
              COTEJADAS CONTRA ALGÚN CORPUS
            </div>
            <div className="mono" style={{ fontSize: 'var(--fs-head)', color: 'var(--ok-ink)' }}>
              {resumen.conCorpus}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)' }}>
              SIN CORPUS QUE CONSULTAR
            </div>
            <div className="mono" style={{ fontSize: 'var(--fs-head)', color: 'var(--warn-ink)' }}>
              {resumen.sinCorpus}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)' }}>
              NO CONSTA QUÉ SE CONSULTÓ
            </div>
            <div className="mono" style={{ fontSize: 'var(--fs-head)' }}>
              {resumen.noConsta}
            </div>
          </div>
          <div style={{ flex: '1 1 160px', minWidth: 120 }}>
            <Barra conCorpus={resumen.conCorpus} total={resumen.total} />
            <div
              className="mono"
              style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)', marginTop: 6 }}
            >
              {pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })} % con corpus
            </div>
          </div>
        </div>
      </Card>

      <TablaCobertura
        titulo="Por tipo de declaración"
        columna="Tipo"
        filas={Object.entries(cob.porTipo)}
        etiqueta={(k) => CLAIM_TYPE_LABEL[k] ?? k}
      />

      <TablaCobertura
        titulo="Por tema"
        columna="Tema"
        filas={Object.entries(cob.porTema)}
        etiqueta={(k) => rotuloDe(t, `declaraciones.tema.${k}`, k)}
      />

      <Card style={{ marginTop: 12 }}>
        <h3 style={{ fontSize: 'var(--fs-card)', margin: '0 0 8px' }}>Contra qué se coteja</h3>
        <p style={{ color: 'var(--ink70)', fontSize: 'var(--fs-meta)', marginTop: 0 }}>
          Corpus que el verificador consultó, y cuántas veces. Una declaración cotejada contra dos
          corpus cuenta en los dos: lo que se mide es con qué se cuenta, no cuántas filas hay. Un
          tipo de declaración que no aparezca respaldado por ninguno de éstos es, hoy, imposible de
          comprobar aquí.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Object.entries(cob.corpus)
            .filter(([nombre]) => !esMarcaDePasada(nombre))
            .sort((a, b) => b[1] - a[1])
            .map(([nombre, n]) => (
              <Pill key={nombre} tone="neutral" size="xs">
                {rotuloDe(t, `ledger.corpus.${nombre}`, nombre)} <span className="mono">{n}</span>
              </Pill>
            ))}
        </div>

        {/*
          Aparte, y dicho: una marca de pasada NO es una fuente. Un veredicto
          revisado por el motor no está respaldado por un dato más, y
          enseñarlas en la misma fila inflaría la base de evidencia aparente.
        */}
        <h4
          style={{
            fontSize: 'var(--fs-meta)',
            color: 'var(--ink70)',
            margin: '16px 0 6px',
            fontWeight: 600,
          }}
        >
          Pasadas de revisión (no son fuentes)
        </h4>
        <p style={{ color: 'var(--ink70)', fontSize: 'var(--fs-meta)', margin: '0 0 8px' }}>
          Dicen cómo se llegó al veredicto, no contra qué se comprobó, y no suman evidencia. Cada
          una cuenta las declaraciones que llevan su marca, esté en la lista de lo consultado o como
          la pasada que dio el veredicto.
        </p>
        {/* Las píldoras leían `cob.corpus`, que sólo mira la lista de lo
            consultado, y «no consta» mira también la pasada que dio el
            veredicto: sumaban 563 al lado de 871 (19-10-2026). Ahora salen de
            `cob.pasadas`, contado con la misma lectura de la fila. */}
        {pasadas ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(pasadas.porMarca)
                .filter(([nombre]) => esMarcaDePasada(nombre))
                .sort((a, b) => b[1].filas - a[1].filas)
                .map(([nombre, p]) => (
                  <Pill key={nombre} tone="ghost" size="xs">
                    {nombre} <span className="mono">{fmt(p.filas)}</span>
                  </Pill>
                ))}
            </div>
            <p style={{ color: 'var(--ink70)', fontSize: 'var(--fs-meta)', margin: '8px 0 0' }}>
              {resumen.noConsta > 0 ? (
                <>
                  De las <span className="mono">{fmt(resumen.noConsta)}</span> declaraciones de «no
                  consta», <span className="mono">{fmt(pasadas.noConsta)}</span> llevan alguna de
                  estas marcas y ningún corpus: una pasada rehízo el veredicto y dejó su marca en
                  lugar de la lista de lo consultado.{' '}
                  {pasadas.noConstaSinMarca > 0 && (
                    <>
                      Las otras <span className="mono">{fmt(pasadas.noConstaSinMarca)}</span> anotan
                      un nombre que no es ni un corpus ni una pasada declarada.{' '}
                    </>
                  )}
                  Que no sepamos qué se miró no quiere decir que no hubiera con qué: por eso cuentan
                  en «no consta» y no en «sin corpus».{' '}
                </>
              ) : (
                <>Ninguna declaración cuenta en «no consta». </>
              )}
              {pasadas.filas - pasadas.noConsta > 0 && (
                <>
                  Hay además <span className="mono">{fmt(pasadas.filas - pasadas.noConsta)}</span>{' '}
                  filas con marca que nombran también algún corpus, y cuentan en «con corpus».
                </>
              )}
            </p>
          </>
        ) : (
          <p style={{ color: 'var(--ink70)', fontSize: 'var(--fs-meta)', margin: 0 }}>
            El manifiesto de declaraciones no trae las pasadas contadas por declaración: no consta
            cuántas llevan cada marca.
          </p>
        )}
      </Card>

      {/*
        Lo que se ha hecho con el hueco. La tarjeta del universo dice que el
        límite no es lo que sabemos leer sino lo que no se publica; aquí se
        cierra el bucle: qué documento hace falta, cuántas declaraciones
        dependen de él, y si lo hemos pedido.
      */}
      <Card style={{ marginTop: 12 }}>
        {/* El título sale de los estados que pinta la tabla: decía «Lo que hemos
            pedido» con el registro vacío y todas las filas «Todavía no lo hemos
            pedido» (revisión lectora, 15-09-2026). */}
        <h3 style={{ fontSize: 'var(--fs-card)', margin: '0 0 8px' }}>
          {solicitudesLeidas
            ? tituloSolicitudes(
                CLASES_PEDIBLES.map((clase) =>
                  estadoDeSolicitud(solicitudesLeidas.find((x) => x.clase === clase) ?? null, hoy),
                ),
              )
            : 'Lo que habría que pedir, y si se ha pedido'}
        </h3>
        {registro.error && (
          <p style={{ color: 'var(--warn-ink)', fontSize: 'var(--fs-meta)', marginTop: 0 }}>
            No se ha podido leer el registro de solicitudes, así que desde aquí no consta si cada
            documento se ha pedido. No es que no se haya pedido: es que no se ha podido leer.
          </p>
        )}
        <p style={{ color: 'var(--ink70)', fontSize: 'var(--fs-meta)', marginTop: 0 }}>
          Cuando una declaración depende de un documento municipal que no se publica, ningún corpus
          podrá comprobarla nunca. Eso no es un límite técnico: es un documento que se puede pedir.
          La Ley 19/2013 da un mes para contestar (art. 20) y, si no contestan, reclamación ante el
          Consell de Transparència de la Comunitat Valenciana (art. 24).
        </p>
        {/* El puente entre esta columna y la cifra de arriba. Desde el
            30-09-2026 cuenta sólo las «sin corpus»: las de «no consta» se
            juzgaron sobre algo, y que dependan del documento no consta. */}
        {porClaseDoc ? (
          <p style={{ color: 'var(--ink70)', fontSize: 'var(--fs-meta)', marginTop: 0 }}>
            Cada cifra cuenta, de las <span className="mono">{resumen.sinCorpus}</span>{' '}
            declaraciones sin corpus que consultar, las que nombran ese documento. Las de «no
            consta» no entran: se juzgaron sobre algo, y que dependan del documento no consta.
          </p>
        ) : (
          <p style={{ color: 'var(--ink70)', fontSize: 'var(--fs-meta)', marginTop: 0 }}>
            El manifiesto de declaraciones no trae cuántas dependen de cada documento. No es que no
            dependa ninguna: es que no se ha podido calcular.
          </p>
        )}
        <div style={{ overflowX: 'auto' }} className="cp-scroll-x">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-meta)' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ink70)' }}>
                <th style={{ padding: '6px 8px 6px 0', fontWeight: 500 }}>Documento</th>
                <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>
                  Declaraciones que dependen
                </th>
                <th style={{ padding: '6px 0 6px 8px', fontWeight: 500 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {CLASES_PEDIBLES.map((clase) => {
                const sol = solicitudesLeidas?.find((x) => x.clase === clase) ?? null
                const estado = solicitudesLeidas ? estadoDeSolicitud(sol, hoy) : null
                return (
                  <tr key={clase} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 8px 8px 0' }}>{CLASE_ETIQUETA[clase]}</td>
                    {porClaseDoc ? (
                      <td className="mono" style={{ padding: '8px', textAlign: 'right' }}>
                        {porClaseDoc[clase] ?? 0}
                      </td>
                    ) : (
                      <td style={{ padding: '8px', textAlign: 'right', color: 'var(--ink70)' }}>
                        no consta
                      </td>
                    )}
                    <td style={{ padding: '8px 0 8px 8px' }}>
                      {estado ? (
                        <>
                          <Pill tone={ESTADO_TONO[estado]} size="xs">
                            {ESTADO_ETIQUETA[estado]}
                          </Pill>
                          <div
                            style={{
                              color: 'var(--ink70)',
                              fontSize: 'var(--fs-micro)',
                              marginTop: 4,
                              maxWidth: '54ch',
                            }}
                          >
                            {frasePublica(sol, hoy)}
                          </div>
                        </>
                      ) : (
                        // Sin registro leído no hay estado: ni «sin pedir» ni
                        // ningún otro. Cargando, o no consta.
                        <span style={{ color: 'var(--ink70)' }}>
                          {registro.loading ? t('common.loading') : 'no consta'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p style={{ color: 'var(--ink70)', fontSize: 'var(--fs-meta)', margin: '12px 0 0' }}>
          <strong style={{ color: 'var(--ink)' }}>
            Pedirlo no lo hace comprobable por sí solo.
          </strong>{' '}
          Que publiquen el documento es condición necesaria y no suficiente: después hay que
          construir con qué leerlo. Por eso la columna dice cuántas declaraciones <em>dependían</em>{' '}
          de él, y no cuántas quedarían desbloqueadas.
        </p>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <h3 style={{ fontSize: 'var(--fs-card)', margin: '0 0 8px' }}>
          De qué universo habla esto
        </h3>
        <ul
          style={{
            color: 'var(--ink70)',
            fontSize: 'var(--fs-meta)',
            lineHeight: 1.6,
            margin: 0,
            paddingLeft: '1.1em',
          }}
        >
          <li>
            Son las declaraciones <strong style={{ color: 'var(--ink)' }}>publicadas</strong>. El
            corpus interno lleva más: la puerta editorial sólo publica una acusación pública si un
            dato la respalda, y no publica nada que no podamos enseñar que se dijo.{' '}
            {/* Decía «retiene por dos motivos distintos» —una acusación cuyo
                veredicto no nombra ningún corpus, y un literal que no consta en
                ninguna transcripción— y no eran los que más pesaban: la mayoría
                eran acusaciones opinativas y acusaciones de hecho que sí nombran
                un corpus sin un dato detrás (19-10-2026). Ahora los motivos y sus
                cifras salen del manifiesto, con la regla de la puerta. */}
            {porMotivo ? (
              porMotivo.total > 0 && (
                <>
                  Ahora mismo retiene <span className="mono">{fmt(porMotivo.total)}</span>:
                  <ul style={{ margin: '4px 0', paddingLeft: '1.1em' }}>
                    {porMotivo.filas.map(([motivo, n]) => (
                      <li key={motivo}>
                        <span className="mono">{fmt(n)}</span>{' '}
                        {MOTIVO_DE_RETENCION_ETIQUETA[motivo]}
                      </li>
                    ))}
                  </ul>
                </>
              )
            ) : (
              <>
                El manifiesto de declaraciones no trae por qué se retiene cada una, así que aquí no
                se dicen los motivos: no se han contado.{' '}
              </>
            )}
            {retenidas.length > 0 && (
              <>
                Por tipo, hay retenidas{' '}
                {retenidas.map(([tipo, n], i) => (
                  <span key={tipo}>
                    {i > 0 ? ' · ' : ''}
                    <span className="mono">{n.toLocaleString('es-ES')}</span> de tipo «
                    {(CLAIM_TYPE_LABEL[tipo] ?? tipo).toLowerCase()}»
                  </span>
                ))}
                .{' '}
              </>
            )}
            Se dice el número porque un tipo retenido entero desaparecería de las tablas de arriba,
            y de una fila que no está nadie deduce que existió: la ausencia se publica, no se omite.
          </li>
          <li>
            Esto <strong style={{ color: 'var(--ink)' }}>no es una verificación</strong> y no entra
            en la cadencia de verificaciones semanales. Un hueco no es un fact-check.
          </li>
          <li>
            Esta página <strong style={{ color: 'var(--ink)' }}>no genera hallazgos</strong>. Una
            ficha firmada congela una medición del panel publicado; una tasa de cobertura no lo es.
          </li>
        </ul>
      </Card>
    </>
  )
}
