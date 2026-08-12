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
 */
export function Lectura({ lectura, conAvisos = true }) {
  if (!lectura) return null
  const cabecera = [lectura.que, lectura.donde].filter(Boolean).join(' ')
  return (
    <div
      style={{
        margin: '12px 0 0',
        padding: '10px 12px',
        borderLeft: '2px solid var(--civic)',
        background: 'var(--soft)',
        borderRadius: '0 4px 4px 0',
      }}
    >
      {cabecera && (
        <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--ink)' }}>
          {lectura.que ? <strong>{lectura.que}</strong> : null}
          {lectura.que && lectura.donde ? ' ' : ''}
          {lectura.donde ?? ''}
        </p>
      )}
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink70, var(--ink60))' }}>
        {lectura.como}
      </p>
      {conAvisos && lectura.avisos?.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--ink60)' }}>
          {lectura.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
