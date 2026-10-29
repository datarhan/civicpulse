import { useReportaje } from '../../hooks/useReportaje'
import CabeceraPieza from '../../components/reportajes/CabeceraPieza'
import { CorrectionNote } from '../../components/reportajes/CorrectionNote'
import { SecHead, Pliegue, Aparte } from '../../components/reportajes/Pieza'
import SolicitudLector from '../../components/reportajes/SolicitudLector'
import { debeOfrecerSolicitud } from '../../lib/solicitud-lector'
import {
  clasesApartadas,
  preguntasDe,
  solicitables as soloSolicitables,
} from '../../lib/solicitud-apartadas'
// La tabla y la cita son las de las otras piezas. La tabla propia se
// desplazaba de lado a 375px —520 px de mínimo, el texto cortado a media
// palabra y sin aviso—; la compartida apila cada fila en pares etiqueta ·
// valor. La cita propia no decía qué documento hablaba.
import { Cita, Tabla } from './ConteoVisitantes'
import { CATALOGUE } from '../../i18n'

/**
 * El estado del contrato como lo diría la prosa. La instantánea lo guarda en la
 * palabra de Gobierto (`formalized`), y la sección 06 la imprimía tal cual en
 * mitad de una frase en castellano. El rótulo es el castellano del catálogo,
 * el mismo que lee el listado de /presupuesto; se lee de aquí y no de
 * `useTenders`, porque importar ese hook ataría la pieza a tenders.json en el
 * mapa de prosa sin que la pieza lea ese fichero.
 * Exportada para que la prueba vea que el estado congelado tiene uno.
 */
export const estadoEnCastellano = (estado) =>
  CATALOGUE.es[`contrato.estado.${estado}`]?.toLowerCase()

function eur(n, dec = 0) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: dec,
    minimumFractionDigits: dec,
  }).format(n)
}
function num(n, dec = 2) {
  return new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: dec,
    minimumFractionDigits: dec,
  }).format(n)
}

const cap = () => ({
  fontSize: 'var(--fs-meta)',
  color: 'var(--ink50)',
  margin: '10px 0 4px',
  lineHeight: 1.45,
})
const boxH = () => ({
  fontSize: 'var(--fs-meta)',
  textTransform: 'uppercase',
  letterSpacing: '.1em',
  color: 'var(--ink50)',
  margin: '0 0 12px',
  fontWeight: 700,
})
const boxUl = () => ({ margin: 0, paddingLeft: 18 })
const boxLi = () => ({
  fontSize: 'var(--fs-aux)',
  color: 'var(--ink50)',
  marginBottom: 8,
  lineHeight: 1.45,
})

export default function Basuras() {
  const { loading, error, data } = useReportaje('basuras')

  if (loading)
    return (
      <div className="cp-page" style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
        <p style={{ color: 'var(--ink70)' }}>Cargando reportaje…</p>
      </div>
    )
  if (error || !data)
    return (
      <div className="cp-page" style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
        <p style={{ color: 'var(--ink70)' }}>No se pudo cargar el reportaje.</p>
      </div>
    )

  const m = data.meta
  const d = data.dinero
  const ce = data.costeEfectivo
  const cal = data.calendario
  const ch = cal.contradiccionHoraria
  // Qué preguntas del cuestionario van en el escrito del lector: la lista
  // editorial de src/lib/solicitud-apartadas.js, con el porqué de cada una.
  const todasLasPreguntas = preguntasDe(data)
  const solicitables = soloSolicitables('basuras', todasLasPreguntas)
  // La tabla del coste declarado, año a año, con el año que no se rindió en su
  // sitio. Saltaba de 2019 a 2021 sin decirlo, y la pieza del coste efectivo
  // cuenta que la entrega de 2020 no se presentó: un hueco mudo se lee como un
  // año que falta en la tabla, no en la declaración. `sinEntrega` lo coteja
  // tests/reportaje-basuras-coste.test.js con esa otra pieza.
  const filasCoste = [
    ...[...ce.filas.map((f) => f.anio), ...(ce.sinEntrega ?? [])]
      .sort((a, b) => a - b)
      .map((anio) => {
        const f = ce.filas.find((x) => x.anio === anio)
        return f
          ? [String(anio), eur(f.coste), num(f.porHabitante, 2)]
          : [String(anio), 'sin entrega', '—']
      }),
    ['Contrato', eur(ce.contratoPorAnio), num(ce.contratoPorHabitante, 2)],
  ]

  return (
    <div
      className="cp-page cp-pieza"
      style={{
        padding: '24px',
        maxWidth: 760,
        margin: '0 auto',
        fontSize: 'var(--fs-head)',
        lineHeight: 1.62,
      }}
    >
      <CabeceraPieza
        slug="basuras"
        data={data}
        borrador={{
          titulo: 'Borrador editorial · pendiente de derecho de réplica.',
          texto:
            'Esta pieza aún no es una publicación definitiva: se recabará la versión del Ayuntamiento de Riba-roja y de las empresas citadas, y se incorporará antes de darla por publicada.',
        }}
      />

      <article style={{ color: 'var(--ink70)' }}>
        {/* 01 */}
        <SecHead num="01" kicker="La contrata" title="La empresa que llevaba casi quince años" />
        <p>
          El 1 de febrero de 2011, una empresa llamada SAV —Sociedad Agricultores de la Vega— empezó
          a recoger la basura de Riba-roja de Túria. El Ayuntamiento se lo había adjudicado «para
          los próximos diez años» después de que superase en puntuación a Vareser, Urbaser, Secopsa
          y Acciona. Ofertó 55.381,40 € al mes, pagó 150.000 € por la maquinaria que ya había en el
          municipio y trajo seis camiones nuevos, dos de carga lateral. De aquel contrato salieron
          dos cosas que un vecino de Riba-roja sigue usando hoy: el horario de sacar la basura de
          20.00 a 23.00 y el teléfono gratuito 900 714 318.
        </p>
        <p>
          SAV siguió prestando el servicio catorce años y nueve meses. En 2025 el Ayuntamiento sacó
          el contrato de nuevo, esta vez por catorce años y 16,6 millones de euros de presupuesto.
          Se presentaron cuatro empresas: Garbialdi, FCC, Urbaser y la propia SAV. Ganó Garbialdi
          con 95,54 puntos sobre 100. La empresa que llevaba casi quince años en el pueblo quedó la
          última.
        </p>
        <p>
          El servicio nuevo empezó el 1 de diciembre de 2025. El 23 de diciembre, el Ayuntamiento
          abrió expediente de penalidades. El 7 de enero acordó iniciar la resolución del contrato.
          Duró, contando generosamente, un mes.
        </p>

        {/* Plegada desde el 19-10-2026. Abierta, sus veintitrés filas ocupan
            1.360 px en escritorio y 3.650 apiladas a 375px, y repiten los
            pasos de Parla que la sección 03 cuenta en su recuadro. Los tres
            párrafos de arriba ya dan el hilo; la tabla es para quien quiera
            cada fecha. El rótulo dice cuántos hitos y de qué años salen de los
            datos, no de una frase escrita a mano. */}
        <Pliegue
          kicker="Cronología"
          titulo={`${data.cronologia.length} hitos, de ${data.cronologia[0].fecha.slice(0, 4)} a ${data.cronologia[data.cronologia.length - 1].fecha.slice(0, 4)}: la contrata, el concurso, Parla y lo que vino después`}
        >
          <Tabla
            caption="Cronología, con la fuente de cada hito."
            cols={[{ label: 'Fecha', mono: true, nowrap: true }, { label: 'Qué ocurre' }]}
            rows={data.cronologia.map((c) => [c.fecha, c.hito])}
          />
        </Pliegue>

        {/* 02 */}
        <SecHead num="02" kicker="El concurso" title="Lo que compró el concurso" />
        <p>
          El anuncio de licitación publicado en el Diario Oficial de la Unión Europea dice cómo se
          repartían los cien puntos del lote principal. El precio valía{' '}
          <strong style={{ color: 'var(--ink)' }}>32</strong>. Los otros{' '}
          <strong style={{ color: 'var(--ink)' }}>68</strong> se daban por cosas que la empresa
          prometía hacer: un proyecto técnico, contenedores, vehículos, contrataciones, emisiones.
        </p>

        {/* Barra 32 / 68. Los compromisos en petróleo, que es de lo que habla la
            pieza, y el precio en gris. Iban el precio en petróleo y los
            compromisos en ámbar, y el pie llamaba «azul» al petróleo: el azul
            es el color de un partido, y este sitio no lo usa. */}
        <div style={{ margin: '18px 0 6px' }}>
          <div
            style={{
              display: 'flex',
              height: 30,
              borderRadius: 'var(--r-input)',
              overflow: 'hidden',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                width: `${data.criterios.totalPrecio}%`,
                background: 'var(--ink20)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink)' }}>
                {data.criterios.totalPrecio}
              </span>
            </div>
            <div
              style={{
                width: `${data.criterios.totalCompromisos}%`,
                background: 'var(--civic)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', color: 'var(--civic-on)' }}
              >
                {data.criterios.totalCompromisos}
              </span>
            </div>
          </div>
          <p className="cp-pie" style={cap()}>
            Reparto de los 100 puntos del lote 1: en gris el precio, en petróleo los compromisos.
          </p>
        </div>

        <Tabla
          compacta
          cols={[{ label: 'Criterio' }, { label: 'Puntos', right: true, mono: true, strong: true }]}
          rows={data.criterios.filas.map((f) => [f.criterio, num(f.puntos, f.puntos % 1 ? 1 : 0)])}
        />
        <p className="cp-pie" style={cap()}>
          {data.criterios.nota}
        </p>

        <p>
          Garbialdi se llevó los 32 puntos del precio —fue la oferta más barata de las cuatro— y
          casi todos los de los compromisos. Prometió {data.compromisos.length} mejoras concretas:{' '}
          {data.compromisos.map((c) => c.toLowerCase()).join('; ')}. Las cuatro puntuaciones
          quedaron muy juntas: {data.puntuaciones.map((p) => num(p, 2)).join(' · ')}.
        </p>
        <p>
          Conviene decir lo que no fue: la baja no fue temeraria. Garbialdi ofertó un{' '}
          <span className="mono">{num(d.bajaPct, 2)} %</span> por debajo del presupuesto base, la
          rebaja más pequeña de las cuatro grandes adjudicaciones que el Ayuntamiento ha hecho en
          este ámbito. El precio era normal. Lo que falló fueron los compromisos.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 14,
            margin: '18px 0 4px',
          }}
        >
          <div
            style={{
              background: 'var(--soft)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-card)',
              padding: '18px 20px',
            }}
          >
            <h3 style={boxH()}>Lo que prometió</h3>
            <ul style={boxUl()}>
              {data.compromisos.map((c, i) => (
                <li key={i} style={boxLi()}>
                  {c}
                </li>
              ))}
            </ul>
          </div>
          {/* Rojo: son los incumplimientos que documentan los informes
              municipales, un fallo que la pieza documenta. Iba en ámbar. */}
          <div
            style={{
              background: 'var(--soft)',
              border: '1px solid var(--crit)',
              borderRadius: 'var(--r-card)',
              padding: '18px 20px',
            }}
          >
            <h3 style={boxH()}>Lo que los informes municipales encontraron</h3>
            <ul style={boxUl()}>
              {data.incumplimientos.map((c, i) => (
                <li key={i} style={boxLi()}>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="cp-pie" style={cap()}>
          Los incumplimientos proceden de los informes técnicos municipales y de AUDITESA S.L., la
          empresa que el propio Ayuntamiento contrató por {eur(d.supervisionAuditesa)} para
          supervisar este contrato. Es la parte del expediente que funcionó.
        </p>

        {/* 03 */}
        <SecHead num="03" kicker="El precedente" title="Lo que ya constaba: Parla, 2014-2018" />
        <p>Nada de lo que ocurrió en diciembre era inédito. {data.parla.intro}</p>
        <div
          style={{
            background: 'var(--soft)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            padding: '18px 20px',
            margin: '16px 0',
          }}
        >
          <h3 style={boxH()}>{data.parla.titulo} · paso a paso</h3>
          {data.parla.hitos.map((h, i) => (
            <div key={i} style={{ margin: i === 0 ? '0 0 12px' : '12px 0 0' }}>
              <div
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginBottom: 3 }}
              >
                {h.f}
              </div>
              <p style={{ margin: 0, fontSize: 'var(--fs-body)' }}>{h.t}</p>
            </div>
          ))}
        </div>
        <p>
          El estado de la flota devuelta no lo describe este reportaje, sino la primera teniente de
          alcalde de Parla, el día en que su ayuntamiento despedía el contrato:
        </p>
        <Cita
          tipo="nota-municipal"
          de="Ayuntamiento de Parla · 27-04-2018"
          fuente={data.parla.quien}
        >
          {data.parla.citaVehiculos}
        </Cita>
        <p>Y el criterio, en la misma nota: «{data.parla.citaObligacion}».</p>
        <p>{data.parla.balance}</p>
        <p>El rastro de la empresa en otros lugares es más corto, pero existe:</p>
        {data.expedienteGarbialdi.map((e, i) => (
          <div key={i} className="cp-texto" style={{ margin: '14px 0' }}>
            <div
              className="mono"
              style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginBottom: 4 }}
            >
              {e.titulo}
            </div>
            <p style={{ margin: 0, fontSize: 'var(--fs-body)' }}>{e.texto}</p>
          </div>
        ))}
        <Aparte title="La pregunta que esto abre" tono="foco">
          {/* Decía «antes de que se valorasen las ofertas», y el bloque de
              JUSTO ARRIBA lo desmiente: la huelga de Ugao-Miraballes se cerró
              el 19 de julio de 2025 «mientras en Riba-roja se valoraban las
              ofertas» — la propia pieza lo escribe así. Parla (2014-2018) y
              Barakaldo (2022) sí eran anteriores; el expediente vasco corría al
              mismo tiempo. «Ya era público cuando» los cubre a los tres sin
              perder la pregunta, que no depende de que fuera antes: dependía de
              que estuviera disponible. */}
          Todo lo anterior ya era público cuando se valoraron las ofertas —lo de Ugao-Miraballes se
          cerró mientras se valoraban—. La pregunta que deja no es sobre la empresa, que compitió y
          ganó con las reglas del pliego, sino sobre el procedimiento:{' '}
          <strong>
            ¿miró la mesa de contratación cómo le había ido a este licitador en otros municipios?
          </strong>{' '}
          Es una pregunta que se responde con el expediente, y es una de las que esta pieza abre al
          Ayuntamiento en su derecho de réplica.
        </Aparte>

        {/* 04 */}
        <SecHead num="04" kicker="Los dueños" title="La empresa y la política" />
        <p>
          La versión que dio origen a este reportaje hablaba de una sociedad pantalla vinculada a un
          político. No lo es, y el político no es el que decía el rumor — pero la pregunta de quién
          hay detrás de la empresa tiene una respuesta documentada. La Garbialdi que concurrió en
          Riba-roja venía de una década dirigida por dos socios: José Luis Castellanos Palacios, su
          director general, y —hasta su muerte en marzo de 2024— Josu Olazarán. Y Olazarán no era un
          empresario cualquiera.
        </p>
        <div
          style={{
            background: 'var(--soft)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            padding: '18px 20px',
            margin: '16px 0',
          }}
        >
          <h3 style={boxH()}>
            {data.politica.olazaran.nombre} ({data.politica.olazaran.vida})
          </h3>
          <ul style={boxUl()}>
            {data.politica.olazaran.cargos.map((c, i) => (
              <li key={i} style={boxLi()}>
                {c}
              </li>
            ))}
          </ul>
          <p style={cap()}>{data.politica.olazaran.fuenteBio}.</p>
        </div>
        <p>
          {data.politica.elSalto.texto}{' '}
          <span style={{ color: 'var(--ink50)' }}>({data.politica.elSalto.atribucion}.)</span>
        </p>
        <p>
          <strong style={{ color: 'var(--ink)' }}>{data.politica.castellanos.nombre}.</strong>{' '}
          {data.politica.castellanos.texto}
        </p>
        <Aparte title="Lo que esto significa aquí — y lo que no">
          {data.politica.limites.map((l, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : '8px 0 0' }}>
              {l}
            </p>
          ))}
        </Aparte>

        {/* 05 */}
        <SecHead num="05" kicker="La venta" title="Quién era la empresa cuando firmó" />
        <p>
          Mientras se resolvía el concurso, Garbialdi se estaba vendiendo. Sus dueños habían
          encargado la operación a Deloitte a principios de 2024 y el proceso se retrasó por la
          muerte de Olazarán, en marzo de aquel año. El comprador fue {data.venta.comprador}, del
          grupo danés {data.venta.matriz}.
        </p>
        <Cita
          tipo="resolucion"
          de={`CNMC · exp. ${data.venta.expediente}`}
          fuente="Resolución de la Comisión Nacional de los Mercados y la Competencia, 1 de octubre de 2025"
        >
          la adquisición, por parte de ISS FACILITY SERVICES, S.A. (ISS), del control exclusivo
          sobre Garbialdi, S.A. (GARBIALDI) mediante la adquisición de la totalidad de su capital
          social
        </Cita>
        <p>
          Las fechas importan. El Ayuntamiento adjudicó el 10 de septiembre de 2025. ISS notificó la
          compra a la CNMC el 22 de septiembre, doce días después. La CNMC la autorizó el 1 de
          octubre. ISS completó la compra el 21 de octubre, y lo hizo público el 5 de noviembre, en
          su informe trimestral. Y el Ayuntamiento formalizó el contrato el 11 de noviembre, tres
          semanas después de que la adjudicataria cambiara de manos.
        </p>
        <p>
          En enero, cuando el nuevo propietario pidió que se le reconociera como contratista, el
          pleno dijo que no:
        </p>
        <Cita
          tipo="orden-del-dia"
          de="pleno de 7-1-2026 · exp. 615/2025/GEN"
          fuente="Orden del día del pleno extraordinario y urgente de 7 de enero de 2026, expediente 615/2025/GEN"
        >
          desestimación de solicitud de sucesión en la posición de contratista […] en virtud de
          operación de transmisión de rama de actividad mediante absorción de la empresa contratista
          Garbialdi, S.A. por la mercantil ISS Facility Services, S.A.U., en el marco del artículo
          98 de la Ley 9/2017, de 8 de noviembre, de Contratos del Sector Público
        </Cita>
        <p>
          La nota municipal de ese mismo día explicó el motivo: se presumía que pudiera existir
          «riesgo de la elusión de responsabilidades». Es el único vínculo que el propio
          Ayuntamiento traza entre la venta y el contrato, y no dice de qué responsabilidades habla
          ni de quién.
        </p>
        <Aparte title="Lo que aquí no decimos">
          Que la venta causara el fallo del servicio. La secuencia está documentada; la relación de
          causa no lo está. Es la pregunta que esta pieza abre a ISS, a Garbialdi y al Ayuntamiento,
          y publicaremos íntegra la respuesta de cada uno.
        </Aparte>

        {/* 06 */}
        <SecHead
          num="06"
          kicker="El registro"
          title="Un contrato resuelto que sigue vivo en el registro"
        />
        <p>
          El 9 de marzo de 2026 el pleno acordó, como asunto de urgencia, la resolución definitiva
          del contrato «por incumplimiento culpable del contratista». Tres días después, la nota de
          prensa municipal describía la misma resolución como «de mutuo acuerdo». La diferencia no
          es de matiz: de la culpa dependen la incautación de la garantía y la reclamación de daños,
          y el propio alcalde había anunciado que reclamaría «con toda la contundencia legal».
        </p>
        <p>
          Hay una segunda discordancia, y es comprobable en un minuto. El{' '}
          {data.registro.comprobadoEl}, el registro público de la contratación municipal seguía
          dando el contrato por {estadoEnCastellano(data.registro.estadoPublicado)} a nombre de{' '}
          {data.registro.adjudicatariaPublicada}, vigente hasta el {data.registro.finPublicado}, por{' '}
          {eur(data.registro.importePublicado)} sin IVA. No consta la resolución. Y no consta ningún
          contrato de FCC, la empresa que presta el servicio desde marzo.
        </p>
        <Aparte title="El control que hicimos antes de decir esto">
          Un registro desactualizado podría estar sencillamente abandonado, y entonces esto no sería
          noticia. No lo está: ese mismo día contenía{' '}
          <span className="mono">{data.registro.filasEnRegistro}</span> expedientes —de los que{' '}
          <span className="mono">{data.registro.contratosAdjudicadosEnRegistro}</span> están
          adjudicados o formalizados y el resto anulados, revocados, desistidos o sin estado
          publicado— con adjudicaciones anotadas hasta el{' '}
          <span className="mono">{data.registro.ultimaAdjudicacionDelRegistro}</span>. Se mantiene
          al día. Lo que falta es esta anotación.
        </Aparte>

        {/* 07 */}
        <SecHead num="07" kicker="El servicio" title="Lo que te toca, y cuándo" />
        <p>
          Al margen de quién tenga el contrato, el servicio que un vecino usa se rige por un
          calendario. Riba-roja no es sólo un casco urbano: la recogida cubre{' '}
          <span className="mono">más de {cal.puntosDeRecogida}</span> puntos repartidos entre el
          casco, doce urbanizaciones, los diseminados y el polígono. Estas son las doce:{' '}
          {cal.urbanizaciones.join(', ')}.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 14,
            margin: '14px 0 4px',
          }}
        >
          <div
            style={{
              background: 'var(--soft)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-card)',
              padding: '18px 20px',
            }}
          >
            <h3 style={boxH()}>Enseres y muebles</h3>
            <ul style={boxUl()}>
              {cal.enseres.map((e, i) => (
                <li key={i} style={boxLi()}>
                  <strong style={{ color: 'var(--ink70)' }}>{e.dia}</strong> · {e.zona}
                </li>
              ))}
            </ul>
          </div>
          <div
            style={{
              background: 'var(--soft)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-card)',
              padding: '18px 20px',
            }}
          >
            <h3 style={boxH()}>Poda</h3>
            <ul style={boxUl()}>
              {cal.poda.map((e, i) => (
                <li key={i} style={boxLi()}>
                  <strong style={{ color: 'var(--ink70)' }}>{e.dia}</strong> · {e.zona}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="cp-pie" style={cap()}>
          {cal.urbanizacionesNota}
        </p>
        <p>
          Las reglas: {cal.limites.join('. ')}. Y antes de sacar nada hay que llamar al{' '}
          <span className="mono">{cal.telefono}</span>, gratuito, donde Riba-roja Neta indica el día
          que corresponde. Ese número lleva funcionando desde 2011.
        </p>
        <Aparte title="Dos documentos municipales, la misma página, horas distintas" tono="aviso">
          El <em>{ch.documentoA}</em> pide sacarlo el día anterior «{ch.textoA}». El{' '}
          <em>{ch.documentoB}</em> dice, para la poda, «{ch.textoB}», y para los muebles, «
          {ch.textoB2}». {ch.nota} Un vecino que siga el cartel puede dejar un mueble en la calle
          tres horas antes de lo que dice el calendario.
        </Aparte>

        {/* 08 */}
        <SecHead num="08" kicker="El dinero" title="Lo que cuesta y quién lo paga" />
        <p>
          En 2023 el Ayuntamiento ya intentó sacar este contrato: el expediente 97/2023, con{' '}
          {eur(d.presupuesto2023)} de presupuesto base. No consta adjudicado. Cuando volvió a
          sacarlo en 2025, el presupuesto era de {eur(d.presupuesto2025)}: un{' '}
          <span className="mono">{num(d.subidaPresupuestoPct, 2)} %</span> más para, en lo esencial,
          el mismo objeto.
        </p>
        <p>
          De ese presupuesto, {eur(d.presupuestoLote1SinIva)} sin IVA corresponden al lote de
          recogida; sobre esa base, la adjudicación de {eur(d.adjudicadoSinIva)} supone una baja de{' '}
          {eur(d.bajaEuros)}. El Ayuntamiento anunció un ahorro «de hasta 731.000 euros» por los dos
          lotes; la lectura más cercana que encontramos —sumar las bajas de ambos, con IVA— da{' '}
          {eur(d.ahorroDosLotesConIva)}. Cerca, pero no exacto, y lo hacemos constar como
          aritmética, no como reproche: puede haber un redondeo o un criterio que no conocemos.
        </p>
        <p>
          Hay además un gasto que no estaba en el contrato. Tras la caída del servicio, el
          Ayuntamiento compró por su cuenta {eur(d.contenedoresSulo)} en 320 contenedores de carga
          lateral y {eur(d.sensorizacionDistromel)} en una plataforma de sensorización con fondos
          Next Generation: {eur(d.sumaEquipamiento)} de equipamiento. Queda por comprobar en el
          pliego si esa reposición correspondía a la concesionaria.
        </p>

        {/* 09 */}
        <SecHead
          num="09"
          kicker="La comparación"
          title="¿Es caro? La pregunta que los datos no dejan responder"
        />
        <p>
          La respuesta honesta empieza por reconocer lo que no se puede hacer. El Ministerio de
          Hacienda publica el «coste efectivo» de cada servicio municipal, y sería el sitio natural
          para comparar Riba-roja con municipios parecidos. Sus denominadores no lo permiten: en la
          entrega de 2024, {ce.tonelajeMax.municipio} declara{' '}
          <span className="mono">{num(ce.tonelajeMax.toneladas, 0)}</span> toneladas de residuos y{' '}
          {ce.tonelajeMin.municipio},{' '}
          <span className="mono">{num(ce.tonelajeMin.toneladas, 2)}</span>. Con cifras así no se
          construye una tabla, y por eso aquí no hay ninguna.
        </p>
        <p>
          Riba-roja tiene su propio problema con el denominador: lleva declarando las mismas{' '}
          <span className="mono">{num(ce.toneladasCongeladas, 2)}</span> toneladas y los mismos{' '}
          <span className="mono">{ce.contenedoresCongelados}</span> contenedores en las cinco
          entregas publicadas desde 2019. Cualquier serie de coste por tonelada suya mide inflación,
          no eficiencia.
        </p>
        <p>
          Lo que sí se puede leer es el coste total declarado, y ahí hay una cifra que merece
          atención:
        </p>
        <Tabla
          compacta
          caption="Coste efectivo declarado del programa de recogida de residuos, y lo que costará el contrato nuevo."
          cols={[
            { label: 'Año', mono: true },
            { label: 'Coste declarado', right: true, mono: true },
            { label: '€ por habitante', right: true, mono: true, strong: true },
          ]}
          rows={filasCoste}
          // La fila del contrato es la comparación de la que habla el texto.
          foco={[filasCoste.length - 1]}
        />
        <p>
          El último ejercicio con gestión anterior costó {eur(ce.filas[ce.filas.length - 1].coste)}.
          El contrato nuevo sale a {eur(ce.contratoPorAnio)} al año: un{' '}
          <span className="mono">{num(ce.variacionPct, 1)} %</span> más. La comparación es
          indicativa y no equivalente —el contrato agrupa recogida, poda y voluminosos, y el
          programa ministerial es sólo recogida—, pero el orden de magnitud es el que es.
        </p>
        <Aparte title="Un defecto del dato, no del servicio">
          En esa misma declaración ministerial, Riba-roja consta como «gestión directa por la
          entidad local» en todos los ejercicios de 2015 a 2024. No puede ser cierto: la concesión
          de SAV estuvo vigente durante todo ese periodo. Es un error del dato oficial, y conviene
          saberlo antes de usar esa serie para nada.
        </Aparte>

        <SecHead num="10" kicker="El cuestionario" title="Dieciocho preguntas incómodas" />
        <p>{data.preguntas.intro}</p>
        {data.preguntas.bloques.map((b, bi) => {
          const offset = data.preguntas.bloques.slice(0, bi).reduce((s, x) => s + x.items.length, 0)
          return (
            <div key={bi} className="cp-texto" style={{ margin: '22px 0 0' }}>
              <h3 style={boxH()}>
                {b.titulo} · {b.destinatario}
              </h3>
              {b.items.map((it, i) => (
                <div key={i} data-pregunta style={{ margin: '0 0 16px' }}>
                  <p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--ink)' }}>
                    <span className="mono" style={{ color: 'var(--ink50)', marginRight: 8 }}>
                      {offset + i + 1}.
                    </span>
                    {it.q}
                  </p>
                  <p style={{ ...cap(), margin: '4px 0 0' }}>Se pregunta porque: {it.base}</p>
                </div>
              ))}
            </div>
          )
        })}
        <p style={{ color: 'var(--ink50)', fontSize: 'var(--fs-body)' }}>{data.preguntas.cierre}</p>
        {debeOfrecerSolicitud({
          meta: m,
          preguntas: solicitables,
          solicitudes: data.solicitudes,
        }) && (
          <SolicitudLector
            meta={m}
            ruta="/reportajes/basuras"
            preguntas={solicitables}
            total={todasLasPreguntas.length}
            clases={clasesApartadas('basuras', todasLasPreguntas)}
          />
        )}
      </article>

      {/* Fuentes y método: una caja debajo de la otra, con el texto a la medida
          de lectura. En dos columnas, el método —unas veinte cautelas, más del
          doble de largo— se leía en media columna, al lado de un hueco. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          margin: '32px 0 0',
        }}
      >
        <div
          style={{
            background: 'var(--soft)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            padding: '18px 20px',
          }}
        >
          <h3 style={boxH()}>Fuentes primarias</h3>
          <ul style={{ ...boxUl(), maxWidth: 'var(--medida)' }}>
            {data.fuentes.map((f, i) => (
              <li key={i} style={boxLi()}>
                <a
                  href={f.url}
                  target={f.url.startsWith('/') ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  style={{ color: 'var(--civic)' }}
                >
                  {f.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div
          style={{
            background: 'var(--soft)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            padding: '18px 20px',
          }}
        >
          <h3 style={boxH()}>Método y cautelas</h3>
          <ul style={{ ...boxUl(), maxWidth: 'var(--medida)' }}>
            {data.metodo.map((t, i) => (
              <li key={i} style={boxLi()}>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          margin: '16px 0 0',
          lineHeight: 1.5,
        }}
      >
        Datos a {m.fechaDatos}. El derecho de réplica está abierto para el Ayuntamiento y las
        empresas citadas: cualquier respuesta se publicará íntegra. Contacto y correcciones:{' '}
        <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
          aviso legal
        </a>
        .
      </p>

      <CorrectionNote correcciones={m.correcciones} />
    </div>
  )
}
