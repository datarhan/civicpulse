import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { CorreoPartible } from '../Primitives'
import { buscaTema, respuestaDeTema } from '../../scraper/temas-cargos'
import { mailboxKinds } from '../../lib/mailboxes'
import { partePorHueco, rellena } from '../../lib/formatters'
import { useLocale } from '../../i18n'

/*
 * «¿A quién le pregunto por…?» (auditoría de las dos lecturas, §3; decisión
 * D3). Una palabra de la vida diaria → el área delegada que la lleva, por el
 * vocabulario curado (`temas-cargos.json`) → quién tiene hoy esa área, por la
 * lista de cargos, como en su tarjeta de /cargos.
 *
 * Lo que dice y lo que no:
 * - Nombra a quien tiene el área, que es a quien se pregunta; no a quien
 *   responde de cada caso. La salvedad va en la misma respuesta.
 * - Si el salto del asunto al área lo damos nosotros (`editorial`), lo dice, con
 *   la razón firmada en el vocabulario.
 * - Un asunto sin área: «pregunta en el registro general», nunca una conjetura.
 *   Un área que ya no figura en la lista: «hoy no lo sabemos», no «nadie».
 * - Durante el periodo electoral no pone nombres, como la capa de competencias
 *   de /eficiencia (`useNombresVisibles`).
 */

const estilo = `
.cp-buscador-temas { display: grid; gap: 8px; margin-top: 4px; }
.cp-buscador-temas label { font-size: var(--fs-micro); color: var(--ink50); text-transform: uppercase; letter-spacing: .06em; }
.cp-buscador-temas input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  font: inherit;
  font-size: var(--fs-aux);
  color: var(--ink);
  background: var(--paper);
  border: 1px solid var(--border);
  border-radius: var(--r-input);
}
.cp-buscador-temas input:focus-visible { outline: 2px solid var(--civic); outline-offset: 1px; }
.cp-buscador-respuesta { display: grid; gap: 6px; font-size: var(--fs-aux); line-height: 1.45; color: var(--ink70); }
.cp-buscador-respuesta p { margin: 0; }
.cp-buscador-respuesta strong a { color: var(--ink); }
.cp-buscador-respuesta .cp-buscador-nota { font-size: var(--fs-micro); color: var(--ink50); }
.cp-buscador-opciones { display: flex; flex-wrap: wrap; gap: 6px; }
.cp-buscador-opciones button {
  font: inherit;
  font-size: var(--fs-micro);
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--soft);
  color: var(--ink70);
  cursor: pointer;
}
`

/** «Nombre (Partido)», cada uno enlazado a su ficha, en una lista del idioma. */
function Quien({ titulares, locale }) {
  const y = new Intl.ListFormat(locale === 'ca' ? 'ca' : 'es', { type: 'conjunction' })
  const porSlug = new Map(titulares.map((o) => [o.slug, o]))
  return y.formatToParts(titulares.map((o) => o.slug)).map((p, i) =>
    p.type === 'element' ? (
      <strong key={i}>
        <Link to={`/cargos/${p.value}`}>
          {porSlug.get(p.value).name} ({porSlug.get(p.value).party})
        </Link>
      </strong>
    ) : (
      <span key={i}>{p.value}</span>
    ),
  )
}

function Correos({ titulares, kinds, t }) {
  return titulares.map((o) => {
    const info = kinds.get(o.slug)
    return (
      <p key={o.slug} className="cp-buscador-nota" data-correo-de={o.slug}>
        {titulares.length > 1 ? `${o.name} · ` : ''}
        {t('cargos.enBreve.buscador.escribele')}{' '}
        {info ? (
          <>
            <a href={`mailto:${info.email}`} style={{ overflowWrap: 'anywhere' }}>
              <CorreoPartible email={info.email} />
            </a>
            {info.compartido && ` ${t('cargos.card.buzonCompartido').replace('{n}', info.n)}`}
          </>
        ) : (
          t('cargos.card.sinCorreo')
        )}
      </p>
    )
  })
}

function Respuesta({ resultado, lista, nombresVisibles, alElegir }) {
  const { t, locale } = useLocale()
  if (resultado.tipo === 'vacio') return null
  if (resultado.tipo === 'ninguno') return <p>{t('cargos.enBreve.buscador.ninguno')}</p>
  if (resultado.tipo === 'varios') {
    return (
      <>
        <p>{t('cargos.enBreve.buscador.varios')}</p>
        <div className="cp-buscador-opciones">
          {resultado.entradas.map((e) => (
            <button key={e.tema} type="button" onClick={() => alElegir(e)}>
              {e.tema}
            </button>
          ))}
        </div>
      </>
    )
  }
  const r = respuestaDeTema(resultado.entrada, lista.officials)
  if (r.tipo === 'sinTitular')
    return <p>{rellena(t('cargos.enBreve.buscador.sinTitular'), { cargo: r.cargo })}</p>
  if (r.tipo === 'sinAsignar') {
    return (
      <>
        <p>{t('cargos.enBreve.buscador.sinAsignar')}</p>
        <p className="cp-buscador-nota">{r.motivo}</p>
        {r.aviso && <p className="cp-buscador-nota">{r.aviso}</p>}
      </>
    )
  }
  if (!nombresVisibles)
    return <p>{rellena(t('cargos.enBreve.buscador.congelado'), { cargo: r.cargo })}</p>
  const plantilla =
    r.titulares.length > 1
      ? rellena(t('cargos.enBreve.buscador.llevan'), { cargo: r.cargo })
      : rellena(t('cargos.enBreve.buscador.lleva'), { cargo: r.cargo })
  const [antes, despues] = partePorHueco(plantilla, '{quien}')
  return (
    <>
      <p data-quien="">
        {antes}
        <Quien titulares={r.titulares} locale={locale} />
        {despues}
      </p>
      {r.razon && (
        <p className="cp-buscador-nota">
          {rellena(t('cargos.enBreve.buscador.razon'), { razon: r.razon })}
        </p>
      )}
      {r.aviso && <p className="cp-buscador-nota">{r.aviso}</p>}
      <p className="cp-buscador-nota">{t('cargos.enBreve.buscador.competencia')}</p>
      <Correos titulares={r.titulares} kinds={mailboxKinds(lista.officials)} t={t} />
    </>
  )
}

export default function BuscadorDeTemas({ vocabulario, lista, nombresVisibles }) {
  const { t } = useLocale()
  // Sin los dos puntos de `useId` (`:r6:`): el atributo `list` del campo busca su
  // <datalist> por id, y happy-dom lo resuelve con un selector que no los admite.
  const id = useId().replace(/:/g, '')
  const [consulta, setConsulta] = useState('')
  const [elegido, setElegido] = useState(null)
  const resultado = elegido ? { tipo: 'uno', entrada: elegido } : buscaTema(vocabulario, consulta)
  // Los ejemplos, del propio vocabulario: el primer asunto de tres áreas distintas.
  const ejemplos = []
  const areas = new Set()
  for (const e of vocabulario.temas) {
    if (areas.has(e.cargo)) continue
    areas.add(e.cargo)
    ejemplos.push(e.tema)
    if (ejemplos.length === 3) break
  }
  return (
    <div className="cp-buscador-temas">
      <style>{estilo}</style>
      <label htmlFor={`${id}-q`}>{t('cargos.enBreve.buscador.etiqueta')}</label>
      <input
        id={`${id}-q`}
        type="search"
        list={`${id}-l`}
        autoComplete="off"
        value={consulta}
        placeholder={rellena(t('cargos.enBreve.buscador.ejemplos'), {
          ejemplos: ejemplos.join(', '),
        })}
        onChange={(e) => {
          setConsulta(e.target.value)
          setElegido(null)
        }}
      />
      <datalist id={`${id}-l`}>
        {[...vocabulario.temas, ...vocabulario.sinAsignar].map((e) => (
          <option key={e.tema} value={e.tema} />
        ))}
      </datalist>
      <div
        className="cp-buscador-respuesta"
        aria-live="polite"
        data-respuesta-tema={resultado.tipo}
      >
        <Respuesta
          resultado={resultado}
          lista={lista}
          nombresVisibles={nombresVisibles}
          alElegir={(e) => {
            setElegido(e)
            setConsulta(e.tema)
          }}
        />
      </div>
    </div>
  )
}
