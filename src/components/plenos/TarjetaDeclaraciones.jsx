import { Link } from 'react-router-dom'
import { Card } from '../Primitives'

const n = (v) => v.toLocaleString('es-ES')

/**
 * El embudo de declaraciones: de lo extraído a lo que un documento municipal
 * llegó a contrastar.
 *
 * Existe por dos hallazgos de la auditoría que son el mismo:
 *
 * · La columna ✓ estaba vacía en 59 de 61 sesiones y el índice le dedicaba dos
 *   de sus cinco contadores. Enseñar «2 verificadas» sin las 4.664 de las que
 *   salen lee como sesiones sin nada que declarar, cuando lo que describe es
 *   un corpus sin contrastar.
 * · Las 2.255 acusaciones que la puerta editorial retiene no se nombraban en
 *   ninguna parte. Está bien retenerlas; lo que no está bien es presentar los
 *   contadores como si contaran lo dicho en el pleno cuando cuentan lo dicho
 *   MENOS lo que no se publica. La ausencia se publica, no se omite.
 *
 * Las cuatro filas salen del manifiesto entero. Ninguna cifra está escrita
 * aquí.
 */
export function TarjetaDeclaraciones({ embudo }) {
  if (!embudo?.extraidas) return null

  const filas = [
    {
      id: 'extraidas',
      rotulo: 'Extraídas de la transcripción',
      valor: n(embudo.extraidas),
      tono: 'var(--ink)',
      nota: `en ${embudo.sesiones} sesiones con transcripción`,
    },
    {
      id: 'retenidas',
      rotulo: 'Retenidas por la puerta editorial',
      valor: n(embudo.retenidas),
      tono: 'var(--warn-ink)',
      nota: 'acusaciones públicas sin contrastar: no se publican aquí',
    },
    // Segundo motivo de retirada, y de otra clase: arriba se retiene lo que no
    // podemos contrastar, aquí lo que no podemos demostrar que se dijera. Sólo
    // aparece si hay alguna, así que la tarjeta no le explica al lector una
    // categoría vacía — y cuando la haya, la dirá sin que nadie se acuerde.
    ...(embudo.retenidasSinProcedencia
      ? [
          {
            id: 'sin-procedencia',
            rotulo: 'Retenidas por falta de procedencia',
            valor: n(embudo.retenidasSinProcedencia),
            tono: 'var(--warn-ink)',
            nota: 'su literal no consta en ninguna transcripción nuestra: no se publican',
          },
        ]
      : []),
    {
      id: 'sin-datos',
      rotulo: 'Publicadas sin datos que las contrasten',
      valor: n(embudo.sinDatos),
      tono: 'var(--ink70)',
      nota: 'ni confirmadas ni desmentidas',
    },
    {
      id: 'contrastadas',
      rotulo: 'Parciales o verificadas',
      valor: `${n(embudo.parcial)} · ${n(embudo.verificado)}`,
      tono: 'var(--ok-ink)',
      nota: 'lo único que cotejó un documento municipal',
    },
  ]

  return (
    <Card style={{ padding: 20 }}>
      <div
        style={{
          fontSize: 'var(--fs-meta)',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '.05em',
          color: 'var(--ink50)',
        }}
      >
        Declaraciones extraídas · {embudo.sesiones} sesiones
      </div>
      <h2
        style={{ fontSize: 'var(--fs-head)', fontWeight: 700, margin: '7px 0 0', lineHeight: 1.3 }}
      >
        {n(embudo.extraidas)} declaraciones, {n(embudo.verificado)} verificadas
      </h2>

      <div style={{ marginTop: 13 }}>
        {filas.map((f, i) => (
          <div
            key={f.id}
            style={{
              padding: '10px 0',
              borderBottom: i < filas.length - 1 ? '1px solid var(--border2)' : undefined,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink70)' }}>{f.rotulo}</span>
              <span
                className="mono"
                style={{
                  fontSize: 'var(--fs-body)',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  flex: 'none',
                  color: f.tono,
                }}
              >
                {f.valor}
              </span>
            </div>
            <div
              style={{
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink50)',
                marginTop: 2,
                lineHeight: 1.4,
              }}
            >
              {f.nota}
            </div>
          </div>
        ))}
      </div>

      {/* «Sin datos» eran DOS hechos, y el corpus los separa: no había dónde
          buscar, o se buscó y no salió nada. Fundirlos es lo que hace que un
          veredicto vacío se lea como un desmentido. */}
      <p
        style={{
          margin: '13px 0 0',
          fontSize: 'var(--fs-aux)',
          lineHeight: 1.6,
          color: 'var(--ink70)',
        }}
      >
        Un «sin datos» no desmiente nada: dice que no encontramos ningún documento municipal que
        hable de eso. De los {n(embudo.sinDatos)},{' '}
        <strong>{n(embudo.sinCorpus)} no tenían corpus donde buscar</strong> y{' '}
        {n(embudo.comprobadoSinHallar)} se comprobaron sin hallar nada.
      </p>

      <div style={{ marginTop: 11 }}>
        <Link to="/declaraciones" style={{ fontSize: 'var(--fs-aux)', color: 'var(--civic)' }}>
          Verificación de declaraciones, todas las sesiones →
        </Link>
      </div>
    </Card>
  )
}
