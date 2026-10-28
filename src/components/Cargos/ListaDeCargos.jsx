import { Link } from 'react-router-dom'
import { PartyTag } from '../Primitives'
import Retrato from './Retrato'
import { partyColor } from '../../hooks/useOfficials'
import { rellena } from '../../lib/formatters'
import { useT } from '../../i18n'

/*
 * Los 21 del pleno, en la lectura vecinal de /cargos (auditoría de las dos
 * lecturas, §3, punto 4). Debajo del divisor, cada cargo es una tarjeta de seis
 * bloques —áreas, paga, departamentos, encaje, quejas, buzón—, y la respuesta a
 * «¿quién lleva lo mío?» es una línea dentro de ella. Aquí va sólo esa línea:
 * la cara, el nombre, el partido y lo que lleva, con el nombre enlazado a su
 * ficha.
 *
 * Lo que lleva cada uno son sus áreas TAL CUAL las publica el Ayuntamiento y
 * TODAS: una lista recortada escondería justo el área que alguien busca. La
 * oposición va en la misma rejilla, rotulada una vez: que no tiene áreas
 * delegadas se dice en su rótulo, no en cada cara.
 *
 * Quién va en cada grupo lo decide la página con `conAreasDelegadas` y
 * `sinAreasDelegadas`, las mismas llamadas que reparten las tarjetas de abajo.
 */

/**
 * @param {{
 *   total: number,
 *   gobierno: object[],
 *   oposicion: object[],
 * }} props
 */
export default function ListaDeCargos({ total, gobierno, oposicion }) {
  const t = useT()
  if (gobierno.length + oposicion.length === 0) return null
  return (
    <section
      className="cp-card cp-en-breve"
      data-tarjeta=""
      data-lista-cargos=""
      aria-labelledby="lista-cargos-titulo"
    >
      <div className="cp-en-breve-cabeza">
        <div>
          <h2 id="lista-cargos-titulo" className="cp-en-breve-titulo">
            {rellena(t('cargos.lista.titulo'), { n: total })}
          </h2>
          <p className="cp-en-breve-intro">{t('cargos.lista.intro')}</p>
        </div>
        <a href="#quien-dirige" className="cp-en-breve-saltar">
          {t('cargos.lista.saltar')}
        </a>
      </div>
      {gobierno.length > 0 && (
        <Grupo
          id="gobierno"
          rotulo={rellena(t('cargos.lista.gobiernan'), { n: gobierno.length })}
          cargos={gobierno}
          lleva
        />
      )}
      {oposicion.length > 0 && (
        <Grupo
          id="oposicion"
          rotulo={rellena(t('cargos.lista.noGobiernan'), { n: oposicion.length })}
          cargos={oposicion}
        />
      )}
    </section>
  )
}

function Grupo({ id, rotulo, cargos, lleva = false }) {
  const t = useT()
  const idRotulo = `lista-cargos-${id}`
  return (
    <div data-grupo={id}>
      <h3 id={idRotulo} className="cp-cargos-lista-rotulo">
        {rotulo}
      </h3>
      <ul className="cp-cargos-lista" aria-labelledby={idRotulo}>
        {cargos.map((o) => (
          <li key={o.slug} className="cp-cargos-lista-cara" data-cargo={o.slug}>
            <Retrato o={o} size={40} decorativo />
            <div className="cp-cargos-lista-texto">
              <Link to={`/cargos/${o.slug}`} className="cp-cargos-lista-nombre">
                {o.name}
              </Link>
              <div className="cp-cargos-lista-meta">
                <PartyTag tone={partyColor(o.party)}>{o.party}</PartyTag>
                {o.role === 'alcalde' && (
                  <span className="mono cp-cargos-lista-alcalde">
                    {t(o.honorific === 'Sra.' ? 'cargos.card.alcaldesa' : 'cargos.card.alcalde')}
                  </span>
                )}
              </div>
              {lleva && (
                <p className="cp-cargos-lista-lleva" data-lleva="">
                  {rellena(t('cargos.lista.lleva'), { areas: o.portfolios.join(' · ') })}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
