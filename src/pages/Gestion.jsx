import { Card } from '../components/Primitives'
import { LibroGestion } from '../components/eficiencia/LibroGestion'
import { PanelMunicipal } from '../components/eficiencia/PanelMunicipal'
import { HallazgosEficiencia } from '../components/eficiencia/HallazgosEficiencia'
import { PreguntasRegistradas } from '../components/eficiencia/PreguntasRegistradas'
import { useIndicadores } from '../hooks/useIndicadores'
import { useEficienciaFindings } from '../hooks/useEficienciaFindings'
import { useEficienciaPreguntas } from '../hooks/useEficienciaPreguntas'
import { useCompetencias, indexarCompetencias, useNombresVisibles } from '../hooks/useCompetencias'

/**
 * /gestion — plazos, concurrencia y ejecución. Cómo funciona la casa por dentro.
 *
 * Vivía dentro de /eficiencia, y era el 28 % de una página que ya iba por las
 * trece pantallas. Se separa por FUENTE, que es lo único que hace del corte algo
 * comprobable y no una cuestión de gusto: /eficiencia sale entera del coste
 * efectivo de los servicios, y esto de las series PMP, de CONPREL, del perfil de
 * contratante y del estado de ejecución. Cada indicador declara su panel al
 * construirse (`indicadores-friccion.ts`), así que el reparto no puede
 * desincronizarse con una tabla escrita aparte.
 *
 * La distinción no es de presentación. Un coste unitario responde «qué cuesta
 * esto»; el plazo de pago y la concurrencia responden «cómo se decide y cuánto
 * se tarda», que es la X-ineficiencia de Leibenstein: el desperdicio que nace de
 * la falta de competencia y del control interno débil, no del precio.
 *
 * Sin nota global, igual que su hermana. Y las fichas firmadas van con la cifra
 * que congelan: una afirmación sobre el plazo de pago sin el panel del plazo de
 * pago delante es una afirmación sin su comprobación al lado.
 */
export default function Gestion() {
  const { loading, error, data } = useIndicadores()
  const { data: hallazgos } = useEficienciaFindings()
  const { data: preguntas } = useEficienciaPreguntas()
  const { data: competencias } = useCompetencias()
  // Durante la ventana LOREG la capa de nombres desaparece entera; el Map vacío
  // hace que cada tarjeta pinte sin ella, sin ninguna rama extra en el render.
  const nombresOn = useNombresVisibles()
  const porClave = nombresOn ? indexarCompetencias(competencias) : new Map()

  const municipales = (data?.municipales ?? []).filter((m) => m.panel === 'gestion')
  const ids = municipales.map((m) => m.id)
  const firmados = (hallazgos?.items ?? []).filter((f) => ids.includes(f.indicadorId)).length

  return (
    <div className="cp-page" style={{ padding: 24, maxWidth: 1180, margin: '0 auto' }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        Ayuntamiento · plazos, concurrencia y ejecución
      </div>
      <h1
        style={{
          fontSize: 'var(--fs-page)',
          fontWeight: 700,
          letterSpacing: '-.015em',
          marginTop: 2,
        }}
      >
        Cómo funciona la casa por dentro
      </h1>
      <p style={{ color: 'var(--ink50)', maxWidth: '64ch' }}>
        Cuánto tarda en pagar, cuánto dedica por vecino, cuánta competencia hubo en sus contratos y
        qué distancia hay entre el presupuesto que se aprobó y el que se ejecutó. Son medidas de
        plazo y de fricción, no de coste: lo que cuesta cada servicio está en{' '}
        <a href="/eficiencia" style={{ color: 'var(--civic)' }}>
          eficiencia
        </a>
        .
      </p>

      {firmados > 0 && (
        <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-meta)' }}>
          <a href="#hallazgos" style={{ color: 'var(--civic)' }}>
            {firmados === 1
              ? '1 hallazgo firmado sobre estas cifras'
              : `${firmados} hallazgos firmados sobre estas cifras`}{' '}
            ↓
          </a>
        </p>
      )}

      {loading && <p style={{ color: 'var(--ink50)' }}>Cargando…</p>}
      {error && <p style={{ color: 'var(--ink50)' }}>No se pudo cargar el panel.</p>}
      {!loading && !error && municipales.length === 0 && (
        <Card style={{ marginTop: 16 }}>
          <p style={{ margin: 0, color: 'var(--ink50)' }}>
            Todavía no hay indicadores de gestión calculados.
          </p>
        </Card>
      )}

      {/* El mismo libro que /eficiencia, otra fuente: los siete indicadores en
          una tabla, cada uno frente a la referencia que su fuente permite. Va
          ANTES que las fichas y no en su lugar — el libro deja comparar, la
          ficha lleva la descripción, las salvedades, la fuente y la réplica, y
          quitar la segunda dejaría una tabla sin nada detrás. Cada fila lleva a
          su ficha por `#m-<id>`. */}
      <LibroGestion municipales={municipales} competencias={porClave} conNombres={nombresOn} />

      <div style={{ maxWidth: 900 }}>
        <PanelMunicipal
          municipales={municipales}
          titulo="Cada indicador, con su fuente y sus salvedades"
          intro="Cada cifra lleva su periodo, porque los contratos abarcan casi una década y la ejecución es de un ejercicio."
          competencias={porClave}
        />
      </div>

      {!loading && !error && (
        <HallazgosEficiencia
          data={hallazgos}
          indicadorIds={ids}
          otroPanel={{ to: '/eficiencia', nombre: 'el coste de los servicios' }}
        />
      )}

      {/* Las preguntas de ESTE panel — el fichero se reparte por `panel`, igual
          que los indicadores y las fichas. */}
      {!loading && !error && <PreguntasRegistradas data={preguntas} panel="gestion" />}

      <p style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', marginTop: 28 }}>
        Cómo se calcula y qué se descarta:{' '}
        <a href="/metodologia#eficiencia" style={{ color: 'var(--civic)' }}>
          metodología
        </a>
        .
      </p>
    </div>
  )
}
