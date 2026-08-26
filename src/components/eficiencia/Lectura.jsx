/**
 * La lectura de una cifra: qué es, dónde queda y cómo se lee.
 *
 * Va pegada al número y antes de las salvedades, porque el orden importa: un
 * percentil sin la frase de «cómo se lee» ya se ha leído como una nota para
 * cuando el ojo llega a la letra pequeña.
 *
 * El texto lo produce src/scraper/indicador-lectura.ts a partir del propio
 * indicador. No hay modelo detrás: la rejilla de frases es cerrada y la parte
 * con criterio depende del escalón, no del valor, así que se escribe una vez y
 * no puede desviarse de la cifra que describe.
 *
 * `que` y `donde` llegan a `null` cuando la tarjeta ya los enseña por su cuenta
 * —la cifra en grande, la banda con su percentil—, que es lo normal en un
 * servicio con pares. Ver `lecturaVisible`.
 *
 * `comoPrimero` invierte el orden, y es el hallazgo crítico de la revisión de
 * la ficha. Por defecto encabeza `que`, que glosa el divisor; pero en la ficha
 * de un servicio `que` reformula la aritmética que la ecuación acaba de enseñar
 * tres centímetros más arriba, mientras `como` —«es un precio y no un
 * rendimiento»— es lo ÚNICO que impide leer 81.965 €/efectivo como mala
 * gestión, y salía de segundo y en tinta más floja. El propio docblock de
 * `COMO_SE_LEE` ya lo dice: «la negación va primero y la frase va arriba, junto
 * al número: es el orden en el que se lee, no el orden en el que se deduce».
 *
 * Va tras una prop y no por defecto porque `PanelMunicipal` comparte este
 * componente, y sus tarjetas no llevan una ecuación encima que haga redundante
 * el `que`.
 */
export function Lectura({ lectura, conAvisos = true, comoPrimero = false }) {
  if (!lectura) return null
  const cabecera = [lectura.que, lectura.donde].filter(Boolean).join(' ')
  return (
    <div
      style={{
        margin: '12px 0 0',
        padding: '10px 12px',
        borderLeft: '2px solid var(--civic)',
        background: 'var(--soft)',
        borderRadius: '0 var(--r-input) var(--r-input) 0',
      }}
    >
      {comoPrimero ? (
        <>
          <p style={{ margin: '0 0 6px', fontSize: 'var(--fs-aux)', color: 'var(--ink)' }}>
            <strong>{lectura.como}</strong>
          </p>
          {cabecera && (
            <p style={{ margin: 0, fontSize: 'var(--fs-aux)', color: 'var(--ink70)' }}>
              {lectura.que ?? ''}
              {lectura.que && lectura.donde ? ' ' : ''}
              {lectura.donde ?? ''}
            </p>
          )}
        </>
      ) : (
        <>
          {cabecera && (
            <p style={{ margin: '0 0 6px', fontSize: 'var(--fs-aux)', color: 'var(--ink)' }}>
              {lectura.que ? <strong>{lectura.que}</strong> : null}
              {lectura.que && lectura.donde ? ' ' : ''}
              {lectura.donde ?? ''}
            </p>
          )}
          <p style={{ margin: 0, fontSize: 'var(--fs-aux)', color: 'var(--ink70, var(--ink50))' }}>
            {lectura.como}
          </p>
        </>
      )}
      {conAvisos && lectura.avisos?.length > 0 && (
        <ul
          style={{
            margin: '6px 0 0',
            paddingLeft: 18,
            fontSize: 'var(--fs-meta)',
            color: 'var(--ink50)',
          }}
        >
          {lectura.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
