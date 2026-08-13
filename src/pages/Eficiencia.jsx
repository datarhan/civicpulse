import { Card } from '../components/Primitives'
import { CoberturaEficiencia } from '../components/eficiencia/CoberturaEficiencia'
import { ResumenPosiciones } from '../components/eficiencia/ResumenPosiciones'
import { ServicioCard } from '../components/eficiencia/ServicioCard'
import { PanelMunicipal } from '../components/eficiencia/PanelMunicipal'
import { HallazgosEficiencia } from '../components/eficiencia/HallazgosEficiencia'
import { useIndicadores } from '../hooks/useIndicadores'
import { useEficienciaFindings } from '../hooks/useEficienciaFindings'
import { useT } from '../i18n'

/**
 * /eficiencia — cuánto costó cada servicio y qué se obtuvo a cambio.
 *
 * Deliberadamente NO hay nota global, ni por dimensión, ni ranking del
 * municipio. El precedente es `encaje declarado`: publica los componentes,
 * niégate a la suma. Un 0-100 en cabecera convierte la ponderación en la
 * noticia e invita a la tabla comparativa de ayuntamientos vecinos que después
 * habría que sostener.
 *
 * Las tarjetas bloqueadas son parte del contenido, no un residuo: que el
 * ayuntamiento declare 485.975,77 € de transporte urbano y cero viajeros dice
 * algo sobre su rendición de cuentas, y esconderlo dejaría la página más
 * completa y menos cierta.
 */
export default function Eficiencia() {
  const t = useT()
  const { loading, error, data } = useIndicadores()
  const { data: hallazgos } = useEficienciaFindings()
  const indicadores = data?.indicadores ?? []
  const municipalesDeAqui = (data?.municipales ?? []).filter((m) => m.panel === 'coste-efectivo')
  const idsDeAqui = [...indicadores.map((i) => i.id), ...municipalesDeAqui.map((m) => m.id)]
  const firmados = (hallazgos?.items ?? []).filter((f) => idsDeAqui.includes(f.indicadorId)).length

  const conRatio = indicadores
    .filter((i) => i.valor !== null)
    .sort((a, b) => (b.numerador.valor ?? 0) - (a.numerador.valor ?? 0))
  const bloqueados = indicadores.filter((i) => i.valor === null)

  const formateaCon = (unidad) => (v) => {
    const dec = v >= 1000 ? 0 : v >= 10 ? 2 : 2
    return `${v.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })} ${unidad.replace(/^€\//, '€/')}`
  }

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

      {/* Índice, no conclusión.
          Las fichas firmadas siguen AL FINAL y por el motivo de siempre: una
          ficha es una lectura del panel, y el panel se lee primero. Pero
          «después» y «sólo si llegas» no son lo mismo, y quien entra desde un
          enlace no llegaba nunca. Esto dice cuántas hay y dónde están, sin
          decir qué concluyen. */}
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
      {!loading && !error && indicadores.length === 0 && (
        <Card style={{ marginTop: 16 }}>
          <p style={{ margin: 0, color: 'var(--ink50)' }}>{t('eficiencia.empty')}</p>
        </Card>
      )}

      {indicadores.length > 0 && (
        <CoberturaEficiencia
          universe={data?.universe}
          cobertura={data?.cobertura}
          indicadores={indicadores}
        />
      )}

      {/* El resumen va DESPUÉS de la cobertura y antes de las fichas: primero
          qué cubre esta página, luego dónde queda cada cosa, luego el detalle.
          Al revés, diez puntos aparecerían antes de decir que hay tres
          servicios sobre los que esta página no puede dividir nada. */}
      <ResumenPosiciones indicadores={indicadores} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
        {conRatio.map((i) => (
          <ServicioCard key={i.id} indicador={i} formatea={formateaCon(i.unidad)} />
        ))}
      </div>

      {/* Sólo lo que sale del MISMO cuaderno que las tarjetas de arriba: el
          recuento de denominadores mide las declaraciones del coste efectivo y
          habla de estos diez cocientes. Los plazos, la concurrencia y la
          ejecución salen de otras cuatro fuentes y viven en /gestion. El reparto
          lo declara cada indicador al construirse, no esta página. */}
      <PanelMunicipal
        municipales={municipalesDeAqui}
        titulo="Sobre la declaración de estas cifras"
        intro="Los cocientes de arriba salen de dos cantidades que el ayuntamiento declara cada entrega; esto mide con qué frecuencia vuelve a medir la de abajo."
      />

      {bloqueados.length > 0 && (
        <>
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
              <ServicioCard key={i.id} indicador={i} formatea={formateaCon(i.unidad)} />
            ))}
          </div>
        </>
      )}

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
