import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Card, SectionHead } from '../components/Primitives'
import { CoberturaEficiencia } from '../components/eficiencia/CoberturaEficiencia'
import {
  EstadoRendicion,
  RespuestaCorta,
  LoQuePermite,
} from '../components/eficiencia/EstadoRendicion'
import { LibroServicios } from '../components/eficiencia/LibroServicios'
import { ComoSeLee } from '../components/eficiencia/ComoSeLee'
import { PanelMunicipal } from '../components/eficiencia/PanelMunicipal'
import { EntregasBarras } from '../components/eficiencia/EntregasBarras'
import { HallazgosEficiencia } from '../components/eficiencia/HallazgosEficiencia'
import { Supramunicipal } from '../components/eficiencia/Supramunicipal'
import { AusenciasResultados } from '../components/eficiencia/Resultado'
import { MARGEN_ANCLA } from '../components/eficiencia/anclas'
import { PreguntasRegistradas } from '../components/eficiencia/PreguntasRegistradas'
import { useIndicadores } from '../hooks/useIndicadores'
import { useEficienciaFindings } from '../hooks/useEficienciaFindings'
import { useEficienciaPreguntas } from '../hooks/useEficienciaPreguntas'
import { useCompetencias, indexarCompetencias, useNombresVisibles } from '../hooks/useCompetencias'
import { useT } from '../i18n'

/**
 * /eficiencia — cuánto costó cada servicio y qué se obtuvo a cambio.
 *
 * UNA PÁGINA, SIN PESTAÑAS. Los seis apartados fueron primero seis anclas de
 * 6.140 px, luego seis pestañas, y la segunda forma tenía un defecto peor que
 * la primera: el H1 preguntaba «¿Cuánto cuesta y qué se obtiene?» y la
 * respuesta vivía dentro de `sec-lectura`, la primera de seis. Quien llegaba y
 * hacía scroll no leía la respuesta — leía un submenú. Y las seis se
 * presentaban como iguales cuando «Servicios» es la página y las otras cinco
 * son aparato, así que el hallazgo más fuerte del panel, las cantidades
 * congeladas, estaba en la cuarta, donde casi nadie entra.
 *
 * Ahora el orden es el del argumento: la respuesta corta y los cuatro
 * recuentos arriba, el libro, lo que el libro permite y lo que no, las dos
 * figuras que sostienen el hallazgo, las preguntas, y al final la COLA DE
 * MÉTODO — cómo se lee un coste unitario, qué cubre la página, la parte
 * supramunicipal, los resultados que faltan y las fichas firmadas.
 *
 * Los `#sec-*` siguen existiendo, ahora como anclas de scroll a secas: los cita
 * `eficiencia-preguntas.json`, que es curado y se edita por PR, nunca desde
 * aquí. Con ellos se va también el aparato que sostenía las pestañas —tres
 * efectos, un mapa ancla→pestaña y un replaceState por clic—, y queda el único
 * efecto que traducía enlaces viejos.
 *
 * Espacios de anclas: `#sec-*` secciones · `#g-<area>` grupos, cuando el libro
 * se agrupa · `#hallazgos` la sección firmada. Las fichas ya NO son anclas:
 * cada servicio es su propia ruta, `/eficiencia/:id`, y ahí es donde viven
 * ahora los NOMBRES de quien tiene la competencia delegada — el libro dejó de
 * tener columna para ellos. No es una supresión: en la ficha el nombre va en la
 * misma tarjeta que la salvedad que lo desarma, y una celda de tabla no tiene
 * sitio para eso.
 *
 * Las fichas van agrupadas por área funcional de la propia clasificación por
 * programas (`AREAS`, declarada servicio a servicio en el registro) — nunca
 * por concejalías: un coste unitario a un clic de un concejal con nombre es un
 * salto que la fuente no da.
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
  const navigate = useNavigate()
  const { hash: hashRouter } = useLocation()

  // El fragmento, leído de las DOS fuentes que pueden moverlo.
  //
  // `useLocation()` se queda corto y la diferencia se ve: React Router escucha
  // `popstate`, y cambiar sólo el fragmento —una marca del navegador, el botón
  // de atrás sobre un ancla, un enlace pegado en la barra— dispara
  // `hashchange`, no `popstate`.
  const [hash, setHash] = useState(
    () => (typeof window === 'undefined' ? '' : window.location.hash) || '',
  )
  useEffect(() => setHash(hashRouter), [hashRouter])
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const alCambiar = () => setHash(window.location.hash)
    window.addEventListener('hashchange', alCambiar)
    return () => window.removeEventListener('hashchange', alCambiar)
  }, [])

  // `#s-<id>` era el ancla de cada ficha cuando las quince vivían en esta
  // página. Ahora cada una es una ruta, y este efecto traduce el enlace viejo
  // en lugar de dejarlo aterrizar en el vacío. No es de adorno: el fichero
  // curado `eficiencia-preguntas.json` cita uno, y ese fichero se edita por PR,
  // nunca desde aquí.
  // Depende del HASH, no sólo del montaje: quien ya está en /eficiencia y pulsa
  // un `#s-` sólo cambia el fragmento, la página no se vuelve a montar y un
  // efecto de montaje se quedaría mirando. Lo cazó el spec de las preguntas
  // registradas, que es exactamente ese recorrido.
  useEffect(() => {
    // `#s-<id>` era la ficha y `#r-<id>` su bloque de resultado. Los dos viven
    // ahora dentro de /eficiencia/<id>, y `eficiencia-preguntas.json` —curado,
    // se edita por PR y nunca desde aquí— cita uno de cada.
    const m = /^#([sr])-(.+)$/.exec(hash)
    if (m) navigate(`/eficiencia/${m[2]}`, { replace: true })
  }, [hash, navigate])

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

  const bloqueados = indicadores.filter((i) => i.valor === null)

  const formateaCon = (unidad) => (v) => {
    const dec = v >= 1000 ? 0 : v >= 10 ? 2 : 2
    return `${v.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })} ${unidad.replace(/^€\//, '€/')}`
  }

  const seccion = { marginTop: 34, scrollMarginTop: MARGEN_ANCLA }

  return (
    <div className="cp-page" style={{ padding: 24, maxWidth: 1240, margin: '0 auto' }}>
      {/* La cabecera y la respuesta, uno al lado del otro. Los cuatro
          recuentos son sobre la RENDICIÓN y por eso van en su propia tarjeta
          ámbar: mezclarlos con el titular los habría convertido en la nota que
          esta página lleva dos años negándose a poner. */}
      <div className="cp-efi-hero">
        <div>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              fontWeight: 700,
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.1em',
            }}
          >
            {t('eficiencia.eyebrow')}
          </div>
          <h1
            style={{
              fontSize: 'var(--fs-page)',
              fontWeight: 700,
              letterSpacing: '-.022em',
              margin: '8px 0 0',
              lineHeight: 1.12,
            }}
          >
            {t('eficiencia.title')}
          </h1>
          <RespuestaCorta data={data} />
          <p
            style={{
              margin: '12px 0 0',
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink50)',
              // Lede, no prosa de sección: acompaña al titular y va estrecho a
              // propósito, como en la maqueta: el resto de la prosa ocupa su bloque.
              maxWidth: '66ch',
              lineHeight: 1.55,
            }}
          >
            No hay nota global del ayuntamiento en esta página y no la va a haber. Lo que se cuenta
            aquí es qué parte de sus propias cifras se puede usar.{' '}
            <a href="/metodologia#eficiencia" style={{ color: 'var(--civic)' }}>
              Cómo se calcula →
            </a>
          </p>
        </div>
        <EstadoRendicion data={data} firmados={firmados} sinAncla={false} />
      </div>

      {loading && <p style={{ color: 'var(--ink70)' }}>Cargando…</p>}
      {error && <p style={{ color: 'var(--ink70)' }}>No se pudo cargar el panel.</p>}
      {!loading && !error && indicadores.length === 0 && (
        <Card style={{ marginTop: 16 }}>
          <p style={{ margin: 0, color: 'var(--ink70)' }}>{t('eficiencia.empty')}</p>
        </Card>
      )}

      {/* El libro: los quince servicios en una pantalla y con una sola
          geometría, ahora en cinco columnas. Las dos filas sin cociente van
          dentro, al pie: sacarlas dejaría la tabla pareciendo completa. */}
      {indicadores.length > 0 && (
        <div id="sec-servicios" style={seccion}>
          <LibroServicios
            indicadores={indicadores}
            formateaCon={formateaCon}
            entrega={data?.anioBase}
          />
        </div>
      )}

      {/* Detrás del libro, no delante: son unas 480 palabras de método que
          califican unas cifras, y delante de ellas nadie las leía. */}
      {indicadores.length > 0 && (
        <div style={seccion}>
          <LoQuePermite data={data} />
        </div>
      )}

      {/* Las dos figuras del hallazgo, en paralelo. La izquierda sale del
          MISMO cuaderno que la tabla de arriba —el recuento de denominadores
          mide las declaraciones del coste efectivo—; los plazos, la
          concurrencia y la ejecución salen de otras cuatro fuentes y viven en
          /gestion. El reparto lo declara cada indicador al construirse, no
          esta página. */}
      {(municipalesDeAqui.length > 0 || data?.cobertura) && (
        <div className="cp-efi-par" style={seccion}>
          {municipalesDeAqui.length > 0 && (
            <div id="sec-declaracion" style={{ scrollMarginTop: MARGEN_ANCLA }}>
              <PanelMunicipal
                municipales={municipalesDeAqui}
                eyebrow="Sobre la declaración"
                titulo="Los divisores que no se mueven"
                intro="Los cocientes de arriba salen de dos cantidades que el ayuntamiento declara cada entrega; esto mide con qué frecuencia vuelve a medir la de abajo."
                competencias={porClave}
                nivel="h2"
                enTarjeta
              />
            </div>
          )}
          <EntregasBarras cobertura={data?.cobertura} />
        </div>
      )}

      {/* Lo que el panel deja preguntado. Cada pregunta nace de una cifra
          publicada y se dirige a una institución; el fichero es curado a mano y
          su validador rechaza cualquier campo que pudiera nombrar a una
          persona. */}
      {!loading && !error && (preguntas?.panels?.['coste-efectivo']?.bloques?.length ?? 0) > 0 && (
        <div style={seccion}>
          <PreguntasRegistradas data={preguntas} panel="coste-efectivo" sinAncla={false} />
        </div>
      )}

      {/* ── La cola de método ────────────────────────────────────────────────
          Lo que califica a todo lo de arriba y no compite con ello. Va después
          porque es método, y va ENTERO porque cada pieza dice algo que ninguna
          otra dice: la regla de lectura por escalón, qué entregas cubre esta
          página y por qué la última es de hace dos años, qué parte de estos
          servicios la presta la Mancomunitat, qué resultados no existen y por
          qué, y las fichas firmadas. */}
      {indicadores.length > 0 && (
        <div
          style={{ marginTop: 44, paddingTop: 28, borderTop: '1px solid var(--border)' }}
          aria-label="Método y cobertura"
        >
          {/* Un encabezado de verdad, no un rótulo mono. Era lo mismo que les
              pasaba a tres de los cinco bloques que cuelgan de él: se titulaban
              con una etiqueta de 11 px y para un lector de pantalla esta cola no
              tenía secciones. Con este h2 arriba, sus hijos pueden ir a h3 sin
              saltarse un nivel — que es un defecto distinto y lo mide `censo`. */}
          <SectionHead title="Método, cobertura y lo firmado" />

          {/* La regla antes que los ejemplos. Es de la CLASE de divisor, no del
              servicio, así que se dice tres veces aquí en lugar de quince en la
              tabla. */}
          {/* A todo el ancho, como el resto de la página. Estaban en una
              columna de 900 dentro de una página de 1160: la cola parecía otro
              documento pegado debajo. Los que son prosa fijan su medida por
              dentro —una línea de 140 caracteres no se lee— y los que tienen
              piezas repetidas las reparten en rejilla. */}
          <div style={{ marginTop: 18 }}>
            <ComoSeLee indicadores={indicadores} />
          </div>

          <div id="sec-cobertura" style={seccion}>
            <CoberturaEficiencia
              universe={data?.universe}
              cobertura={data?.cobertura}
              anioBase={data?.anioBase}
              indicadores={indicadores}
              conResultados={(data?.resultados?.items ?? []).length > 0}
            />
          </div>

          {/* CE4: turismo, ferias, deporte y ocio no son funciones
              inexistentes, son funciones cuya parte supramunicipal rinde la
              Mancomunitat. Es la explicación de los ceros del libro. */}
          {/* Los dos cortos, en pareja. Miden 260 y 166 px de alto: uno debajo
              del otro a todo el ancho dejaban dos tercios de fila en blanco
              cada uno. Las ausencias son datos —el resultado que no existe se
              dice, con su porqué medido, en vez de dejar que el hueco parezca
              un olvido— y lo supramunicipal explica los ceros del libro: son
              del mismo peso y del mismo rango. */}
          <div className="cp-efi-duo" style={seccion}>
            {bloqueados.length > 0 && (
              <Supramunicipal filas={data?.supramunicipales} entrega={data?.anioBase} />
            )}
            <AusenciasResultados ausencias={data?.resultados?.ausencias} />
          </div>

          {/* Al final, y no arriba: una ficha firmada es una lectura del panel,
              y el panel se lee primero. Un hallazgo en cabecera convertiría la
              página en la conclusión de otro en vez de en las cifras con las
              que el lector puede sacar la suya. */}
          {!loading && !error && firmados > 0 && (
            <div style={seccion}>
              <HallazgosEficiencia
                data={hallazgos}
                indicadorIds={idsDeAqui}
                otroPanel={{ to: '/gestion', nombre: 'cómo funciona la casa por dentro' }}
                sinAncla={false}
                nivel="h3"
              />
            </div>
          )}
        </div>
      )}

      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          marginTop: 28,
          paddingTop: 18,
          borderTop: '1px solid var(--border)',
          lineHeight: 1.55,
        }}
      >
        Fuente: Ministerio de Hacienda, coste efectivo de los servicios (art. 116 <em>ter</em>{' '}
        LRSAL). Lo que este panel deja a la vista —la entrega sin rendir, los denominadores
        congelados, la inflación que se leía como gestión y las dos casillas del agua que se quedan
        en blanco— está contado entero en el reportaje{' '}
        <a href="/reportajes/coste-efectivo" style={{ color: 'var(--civic)' }}>
          «El panel se queda en blanco donde está el dinero»
        </a>
        . La parte de la declaración existe además como{' '}
        <a href="/infografias/eficiencia-2026-08.html" style={{ color: 'var(--civic)' }}>
          infografía para compartir
        </a>
        . Cómo se calcula, qué se descarta y por qué no hay nota global, en la{' '}
        <a href="/metodologia#eficiencia" style={{ color: 'var(--civic)' }}>
          metodología
        </a>
        .
      </p>
    </div>
  )
}
