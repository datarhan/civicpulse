import { Card } from '../components/Primitives'
import { CoberturaEficiencia } from '../components/eficiencia/CoberturaEficiencia'
import { LecturaRapida } from '../components/eficiencia/LecturaRapida'
import { ResumenPosiciones } from '../components/eficiencia/ResumenPosiciones'
import { MultiplesSeries } from '../components/eficiencia/MultiplesSeries'
import { ServicioCard } from '../components/eficiencia/ServicioCard'
import { ComoSeLee } from '../components/eficiencia/ComoSeLee'
import { PanelMunicipal } from '../components/eficiencia/PanelMunicipal'
import { HallazgosEficiencia } from '../components/eficiencia/HallazgosEficiencia'
import { Supramunicipal } from '../components/eficiencia/Supramunicipal'
import { AusenciasResultados } from '../components/eficiencia/Resultado'
import { SubnavSecciones, MARGEN_ANCLA } from '../components/SubnavSecciones'
import { PreguntasRegistradas } from '../components/eficiencia/PreguntasRegistradas'
import { agruparPorArea, fraseParticion } from '../scraper/indicador-areas'
import { useIndicadores } from '../hooks/useIndicadores'
import { useEficienciaFindings } from '../hooks/useEficienciaFindings'
import { useEficienciaPreguntas } from '../hooks/useEficienciaPreguntas'
import { useCompetencias, indexarCompetencias, useNombresVisibles } from '../hooks/useCompetencias'
import { useT } from '../i18n'

/**
 * /eficiencia — cuánto costó cada servicio y qué se obtuvo a cambio.
 *
 * Sigue sin haber nota global, media de percentiles ni ranking. El precedente
 * es `encaje declarado`: publica los componentes, niégate a la suma — un 0-100
 * en cabecera convertiría la ponderación en la noticia. Lo que la cabecera
 * añade desde agosto de 2026 son RECUENTOS de lo que las fichas ya publican y
 * una lectura editorial fechada; dónde está el límite de eso, en el docblock
 * de `LecturaRapida.jsx`.
 *
 * Las fichas van agrupadas por área funcional de la propia clasificación por
 * programas (`AREAS`, declarada servicio a servicio en el registro) — nunca
 * por concejalías: un coste unitario a un clic de un concejal con nombre es un
 * salto que la fuente no da. La franja y la rejilla de mini-series quedan
 * GLOBALES: posición y década se leen mejor con los trece juntos, y el spec de
 * la franja cuenta sus anclas `#s-*` exactas.
 *
 * Espacios de anclas: `#s-<id>` fichas · `#g-<area>` grupos · `#sec-*`
 * secciones (cabecera y submenú) · `#hallazgos` la sección firmada.
 *
 * Las tarjetas bloqueadas —y las casillas a cero— son parte del contenido, no
 * un residuo: que el ayuntamiento declare un gasto real de transporte urbano
 * con la casilla de viajeros a cero dice algo sobre su rendición de cuentas, y
 * esconderlo dejaría la página más completa y menos cierta.
 *
 * Sin cifra aquí a propósito. Este docblock decía «485.975,77 €», que es la
 * entrega de 2021: para cuando alguien lo leyó, la última era la de 2024 con
 * 736.952,43 €. Un número copiado en un comentario no tiene quien lo recotege
 * —`check:eficiencia-findings` vigila las fichas firmadas, no la prosa del
 * código— así que envejece en silencio y engaña al siguiente que lo lea. La
 * cifra vive en la tarjeta, que la saca del snapshot.
 */
export default function Eficiencia() {
  const t = useT()
  const { loading, error, data } = useIndicadores()
  const { data: hallazgos } = useEficienciaFindings()
  const { data: preguntas } = useEficienciaPreguntas()
  const { data: competencias } = useCompetencias()
  // Durante la ventana LOREG la capa de nombres desaparece entera; el Map vacío
  // hace que cada tarjeta pinte sin ella, sin ninguna rama extra en el render.
  const nombresOn = useNombresVisibles()
  const porClave = nombresOn ? indexarCompetencias(competencias) : new Map()
  const indicadores = data?.indicadores ?? []
  const municipalesDeAqui = (data?.municipales ?? []).filter((m) => m.panel === 'coste-efectivo')
  const idsDeAqui = [...indicadores.map((i) => i.id), ...municipalesDeAqui.map((m) => m.id)]
  const firmados = (hallazgos?.items ?? []).filter((f) => idsDeAqui.includes(f.indicadorId)).length

  const grupos = agruparPorArea(indicadores)
  const bloqueados = indicadores.filter((i) => i.valor === null)

  const formateaCon = (unidad) => (v) => {
    const dec = v >= 1000 ? 0 : v >= 10 ? 2 : 2
    return `${v.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })} ${unidad.replace(/^€\//, '€/')}`
  }

  const seccion = { scrollMarginTop: MARGEN_ANCLA }

  // Los ítems del submenú son las secciones que de verdad existen en este
  // render: una entrada a una sección vacía es un enlace que no hace nada.
  const secciones = [
    { id: 'sec-lectura', label: t('eficiencia.subnav.lectura') },
    { id: 'sec-cobertura', label: t('eficiencia.subnav.cobertura') },
    { id: 'sec-posiciones', label: t('eficiencia.subnav.posiciones') },
    { id: 'sec-servicios', label: t('eficiencia.subnav.servicios') },
    ...(municipalesDeAqui.length > 0
      ? [{ id: 'sec-declaracion', label: t('eficiencia.subnav.declaracion') }]
      : []),
    ...(bloqueados.length > 0
      ? [{ id: 'sec-bloqueados', label: t('eficiencia.subnav.bloqueados') }]
      : []),
    ...(firmados > 0 ? [{ id: 'hallazgos', label: t('eficiencia.subnav.hallazgos') }] : []),
    ...((preguntas?.panels?.['coste-efectivo']?.bloques?.length ?? 0) > 0
      ? [{ id: 'sec-preguntas', label: t('eficiencia.subnav.preguntas') }]
      : []),
  ]

  return (
    <div className="cp-page" style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        {t('eficiencia.eyebrow')}
      </div>
      <h1
        style={{
          fontSize: 'var(--fs-page)',
          fontWeight: 700,
          letterSpacing: '-.015em',
          marginTop: 2,
        }}
      >
        {t('eficiencia.title')}
      </h1>
      <p style={{ color: 'var(--ink50)', maxWidth: '64ch' }}>{t('eficiencia.intro')}</p>

      {/* Trece pantallas necesitan navegación propia: barra pegajosa bajo la
          topbar, con scroll-spy. useHashScroll la mide para los aterrizajes
          por hash, y MARGEN_ANCLA es su contrapartida en cada ancla. */}
      {indicadores.length > 0 && (
        <SubnavSecciones items={secciones} ariaLabel={t('eficiencia.subnav.aria')} />
      )}

      {loading && <p style={{ color: 'var(--ink50)' }}>Cargando…</p>}
      {error && <p style={{ color: 'var(--ink50)' }}>No se pudo cargar el panel.</p>}
      {!loading && !error && indicadores.length === 0 && (
        <Card style={{ marginTop: 16 }}>
          <p style={{ margin: 0, color: 'var(--ink50)' }}>{t('eficiencia.empty')}</p>
        </Card>
      )}

      {/* La respuesta corta primero — recuentos y una lectura fechada, nunca
          una nota. El índice de hallazgos firmados que antes iba aquí como
          párrafo ahora es una casilla más de la cabecera, con el mismo
          contrato: dice cuántos hay y dónde, sin adelantar lo que concluyen. */}
      <LecturaRapida data={data} firmados={firmados} />

      {indicadores.length > 0 && (
        <section id="sec-cobertura" style={seccion}>
          <CoberturaEficiencia
            universe={data?.universe}
            cobertura={data?.cobertura}
            anioBase={data?.anioBase}
            indicadores={indicadores}
            conResultados={(data?.resultados?.items ?? []).length > 0}
          />
        </section>
      )}

      {/* Posición hoy y década, contiguas y GLOBALES: el punto y la mini-serie
          contestan preguntas distintas, y trocearlas por áreas rompería la
          única vista donde los trece servicios se comparan de un vistazo. */}
      <section id="sec-posiciones" style={seccion}>
        <ResumenPosiciones indicadores={indicadores} />
        <MultiplesSeries indicadores={indicadores} formateaCon={formateaCon} />
      </section>

      {/* Las fichas, por área funcional del propio retorno: bloques que se
          pueden leer enteros («¿cómo va el medio urbano?») sin recorrer trece
          tarjetas en orden de gasto. El área la declara cada servicio en el
          registro; la mini-frase de cada bloque es un recuento derivado. */}
      <section id="sec-servicios" style={seccion}>
        {/* La regla antes que los ejemplos. Es de la CLASE de divisor, no del
            servicio, así que se dice tres veces aquí en lugar de trece abajo —
            y quien entra por una sola ficha ya no deduce de ella una regla que
            sólo valía para su escalón. */}
        <ComoSeLee indicadores={indicadores} />

        {grupos.map((g) => (
          <div key={g.area} style={{ marginTop: 26 }}>
            <h2
              id={`g-${g.area}`}
              style={{
                fontSize: 'var(--fs-body)',
                fontWeight: 650,
                margin: 0,
                letterSpacing: '-.01em',
                scrollMarginTop: MARGEN_ANCLA,
              }}
            >
              {g.etiqueta}
            </h2>
            {fraseParticion(g.particion) && (
              <p style={{ margin: '3px 0 0', fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
                {fraseParticion(g.particion)}.
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
              {g.indicadores.map((i) => (
                <ServicioCard
                  key={i.id}
                  indicador={i}
                  formatea={formateaCon(i.unidad)}
                  resultado={(data?.resultados?.items ?? []).find(
                    (r) => r.servicioRelacionado === i.id,
                  )}
                  competencia={porClave.get(i.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Sólo lo que sale del MISMO cuaderno que las tarjetas de arriba: el
          recuento de denominadores mide las declaraciones del coste efectivo y
          habla de estos cocientes. Los plazos, la concurrencia y la ejecución
          salen de otras cuatro fuentes y viven en /gestion. El reparto lo
          declara cada indicador al construirse, no esta página. */}
      {municipalesDeAqui.length > 0 && (
        <section id="sec-declaracion" style={seccion}>
          <PanelMunicipal
            municipales={municipalesDeAqui}
            titulo="Sobre la declaración de estas cifras"
            intro="Los cocientes de arriba salen de dos cantidades que el ayuntamiento declara cada entrega; esto mide con qué frecuencia vuelve a medir la de abajo."
          />
        </section>
      )}

      {bloqueados.length > 0 && (
        <section id="sec-bloqueados" style={seccion}>
          <h2
            style={{
              fontSize: 'var(--fs-body)',
              fontWeight: 650,
              margin: '28px 0 4px',
              letterSpacing: '-.01em',
            }}
          >
            {t('eficiencia.bloqueados.titulo')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
            {bloqueados.map((i) => (
              <ServicioCard
                key={i.id}
                indicador={i}
                formatea={formateaCon(i.unidad)}
                competencia={porClave.get(i.id)}
              />
            ))}
          </div>

          {/* CE4 va pegado a los bloqueados porque es su explicación: los ceros
              de turismo, ferias, deporte y ocio no son funciones inexistentes,
              son funciones cuya parte supramunicipal rinde la Mancomunitat. */}
          <Supramunicipal filas={data?.supramunicipales} entrega={data?.anioBase} />
        </section>
      )}

      {/* Las ausencias son datos: el resultado que no existe se dice, con su
          porqué medido, en vez de dejar que el hueco parezca un olvido. */}
      <AusenciasResultados ausencias={data?.resultados?.ausencias} />

      {/* Al final, y no arriba: una ficha firmada es una lectura del panel, y
          el panel se lee primero. Un hallazgo en cabecera convertiría la página
          en la conclusión de otro en vez de en las cifras con las que el lector
          puede sacar la suya. */}
      {!loading && !error && (
        <HallazgosEficiencia
          data={hallazgos}
          indicadorIds={idsDeAqui}
          otroPanel={{ to: '/gestion', nombre: 'cómo funciona la casa por dentro' }}
        />
      )}

      {/* Al cierre, después de los hallazgos: lo que el panel deja preguntado.
          Cada pregunta nace de una cifra publicada y se dirige a una
          institución; el fichero es curado a mano y su validador rechaza
          cualquier campo que pudiera nombrar a una persona. */}
      {!loading && !error && <PreguntasRegistradas data={preguntas} panel="coste-efectivo" />}

      <p style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', marginTop: 18 }}>
        Lo que este panel deja a la vista —la entrega sin rendir, los denominadores congelados, la
        inflación que se leía como gestión y las dos casillas del agua que se quedan en blanco— está
        contado entero en el reportaje{' '}
        <a href="/reportajes/coste-efectivo" style={{ color: 'var(--civic)' }}>
          «El panel se queda en blanco donde está el dinero»
        </a>
        . La parte de la declaración existe además como{' '}
        <a href="/infografias/eficiencia-2026-08.html" style={{ color: 'var(--civic)' }}>
          infografía para compartir
        </a>
        .
      </p>

      <p style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', marginTop: 28 }}>
        Cómo se calcula, qué se descarta y por qué no hay nota global:{' '}
        <a href="/metodologia#eficiencia" style={{ color: 'var(--civic)' }}>
          metodología
        </a>
        .
      </p>
    </div>
  )
}
