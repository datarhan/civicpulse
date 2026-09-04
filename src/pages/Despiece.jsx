/**
 * /despiece — el manual de esta aplicación, dibujado del código.
 *
 * SÓLO EN DESARROLLO. `App.jsx` no monta la ruta en producción y
 * `vite.config.js` no registra sus extremos, igual que el panel del curador.
 * El grafo no se guarda bajo `public/`: lo sirve el plugin del servidor de
 * desarrollo, así que no hay fichero que Vercel pueda acabar publicando.
 *
 * Lo que se pinta por defecto es el ESPINAZO —una relación por pieza—, no todo.
 * Está medido: con todas las aristas, el dominio más grande da 450 cruces; con
 * el espinazo, 65 de 78 dominios salen sin ni un cruce.
 */
import { useEffect, useMemo, useState } from 'react'
import { Card, Pill, SectionHead } from '../components/Primitives'
import LienzoDespiece from '../components/despiece/LienzoDespiece'
import { estiloDespiece } from '../components/despiece/despiece.css.js'
import {
  CARRILES,
  cierre,
  espina,
  medida,
  ordenarCarriles,
} from '../components/despiece/despiece-geometria'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const PROFUNDIDAD = 3

const TONO_ESTADO = { ok: 'ok', aviso: 'warn', malo: 'crit', 'no-medido': 'ghost' }

/**
 * «Ahora mismo»: lo único de esta página que se mide en vez de derivarse.
 *
 * `no-medido` lleva su propio tono y su propia frase. Pintarlo como un «ok»
 * apagado sería exactamente el error que esta página existe para no cometer.
 */
function EstadoNodo({ estado, id }) {
  if (estado === null) {
    return (
      <p
        className="mono"
        style={{ margin: '0 0 8px', fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}
      >
        midiendo el disco…
      </p>
    )
  }
  const e = estado[id]
  if (!e) {
    return (
      <p style={{ margin: '0 0 8px', fontSize: 'var(--fs-aux)', color: 'var(--ink50)' }}>
        Esta clase de pieza no se mide: el despiece no sabe qué preguntarle al disco sobre ella.
      </p>
    )
  }
  return (
    <div style={{ margin: '0 0 8px' }}>
      <Pill tone={TONO_ESTADO[e.tono] ?? 'neutral'} size="xs">
        {e.tono === 'no-medido' ? 'no medido' : e.tono}
      </Pill>
      <ul style={{ margin: '4px 0 0', paddingLeft: 16, listStyle: 'none' }}>
        {e.lineas.map((l) => (
          <li
            key={l}
            className="mono"
            style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)' }}
          >
            {l}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Ordena por hora del día; lo que no la declara va al final, no al principio. */
function claveHoraria(detalle) {
  const m = /(\d{2}):(\d{2})/.exec(detalle ?? '')
  if (m) return Number(m[1]) * 60 + Number(m[2])
  const c = /cron ([\d*]+) ([\d*]+)/.exec(detalle ?? '')
  if (c && c[2] !== '*' && c[1] !== '*') return Number(c[2]) * 60 + Number(c[1])
  return Number.POSITIVE_INFINITY
}

/**
 * Mantenimiento: qué corre, cuándo, y qué mueve.
 *
 * Un proceso sin horario NO se oculta ni se ordena como si fuera medianoche: se
 * pone al final diciendo por qué no lo tiene. «Se dispara con un push» es un
 * hecho sobre el proceso, no un dato que falte.
 */
function Mantenimiento({ grafo }) {
  const [abierto, setAbierto] = useState(false)
  const programa = new Map()
  for (const a of grafo.aristas) {
    if (a.tipo !== 'programa') continue
    programa.set(a.de, [...(programa.get(a.de) ?? []), a.a])
  }
  // Sólo lo que corre solo. Un comando del bot y un orquestador en shell son
  // procesos, pero no tienen horario: mezclarlos aquí convierte «qué corre y
  // cuándo» en «qué existe».
  const filas = grafo.nodos
    .filter((n) => n.clase === 'cron' || n.clase === 'flujo')
    .sort(
      (x, y) =>
        claveHoraria(x.detalle) - claveHoraria(y.detalle) || x.nombre.localeCompare(y.nombre),
    )
  if (filas.length === 0) return null

  const conHorario = filas.filter((f) => Number.isFinite(claveHoraria(f.detalle))).length

  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionHead
        title="Mantenimiento"
        as="h2"
        size="head"
        right={
          <button
            type="button"
            onClick={() => setAbierto(!abierto)}
            className="mono"
            style={{
              border: '1px solid var(--border)',
              background: 'transparent',
              borderRadius: 'var(--r-pill)',
              padding: '3px 10px',
              cursor: 'pointer',
              color: 'var(--ink70)',
              fontSize: 'var(--fs-meta)',
            }}
          >
            {abierto ? 'cerrar' : `${filas.length} procesos`}
          </button>
        }
      />
      <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-aux)', color: 'var(--ink70)' }}>
        {conHorario} con horario declarado; {filas.length - conHorario} se disparan por push, por
        issue o a mano — que no es lo mismo que no correr.
      </p>
      {abierto && (
        <ul className="cp-desp-mant" style={{ margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
          {filas.map((f) => {
            const mueve = programa.get(f.id) ?? []
            return (
              <li key={f.id} style={{ fontSize: 'var(--fs-meta)' }}>
                <span className="mono" style={{ color: 'var(--ink)' }}>
                  {f.nombre}
                </span>
                <span className="mono" style={{ color: 'var(--ink50)' }}>
                  {f.detalle}
                </span>
                <span className="mono" style={{ color: 'var(--ink70)' }}>
                  {mueve.length > 0
                    ? `mueve ${mueve.length}: ${mueve
                        .slice(0, 3)
                        .map((m) => m.split(':').slice(1).join(':'))
                        .join(', ')}${mueve.length > 3 ? '…' : ''}`
                    : 'no se derivó qué mueve'}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/**
 * Los puntos débiles, y APARTE lo que no se pudo comprobar.
 *
 * Los dos bloques no se suman ni se mezclan. «No pude mirar» presentado junto a
 * «no encontré nada» se lee como un visto bueno, y ése es el defecto más caro
 * que este repositorio se ha hecho a sí mismo.
 */
function AveriasResumen({ parte }) {
  const [abierto, setAbierto] = useState(null)
  const porCodigo = new Map()
  for (const a of parte.averias) porCodigo.set(a.codigo, [...(porCodigo.get(a.codigo) ?? []), a])
  if (porCodigo.size === 0 && parte.noMedido.length === 0) return null

  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionHead title="Puntos débiles" as="h2" size="head" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
        {[...porCodigo].map(([codigo, filas]) => (
          <button
            key={codigo}
            type="button"
            onClick={() => setAbierto(abierto === codigo ? null : codigo)}
            style={{
              border: '1px solid var(--border)',
              background: abierto === codigo ? 'var(--warn-soft)' : 'transparent',
              borderRadius: 'var(--r-pill)',
              padding: '3px 10px',
              cursor: 'pointer',
              color: 'var(--ink)',
              fontSize: 'var(--fs-meta)',
            }}
            className="mono"
          >
            {codigo} {filas.length}
          </button>
        ))}
        {parte.noMedido.length > 0 && (
          <button
            type="button"
            onClick={() => setAbierto(abierto === '_nomedido' ? null : '_nomedido')}
            style={{
              border: '1px dashed var(--border2)',
              background: abierto === '_nomedido' ? 'var(--soft)' : 'transparent',
              borderRadius: 'var(--r-pill)',
              padding: '3px 10px',
              cursor: 'pointer',
              color: 'var(--ink70)',
              fontSize: 'var(--fs-meta)',
            }}
            className="mono"
          >
            no medido {parte.noMedido.length}
          </button>
        )}
      </div>

      {abierto === '_nomedido' && (
        <div>
          <p style={{ margin: '0 0 6px', fontSize: 'var(--fs-aux)', color: 'var(--ink70)' }}>
            Comprobaciones que <strong>no se pudieron hacer</strong>. No son hallazgos, y tampoco
            son un visto bueno.
          </p>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 'var(--fs-meta)',
              color: 'var(--ink70)',
            }}
          >
            {parte.noMedido.map((n) => (
              <li key={n.motivo} className="mono" style={{ marginBottom: 2 }}>
                {n.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}

      {abierto && abierto !== '_nomedido' && (
        <div>
          <p style={{ margin: '0 0 6px', fontSize: 'var(--fs-aux)', color: 'var(--ink70)' }}>
            {porCodigo.get(abierto)[0].detalle}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--fs-meta)' }}>
            {porCodigo.get(abierto).map((a) => (
              <li key={a.nodo} className="mono" style={{ marginBottom: 2, color: 'var(--ink70)' }}>
                {a.nodo.split(':').slice(1).join(':')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

export default function Despiece() {
  useDocumentTitle('Despiece')
  const [grafo, setGrafo] = useState(null)
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState(null)
  const [dominio, setDominio] = useState(null)
  const [elegido, setElegido] = useState(null)
  const [filtro, setFiltro] = useState('')
  // Por defecto sólo el espinazo. Medido: con todas las relaciones el dominio
  // más grande da 450 cruces y el dibujo deja de leerse; con el espinazo, 65 de
  // 78 dominios salen sin ni un cruce. Las secundarias se piden.
  const [todasLasRelaciones, setTodasLasRelaciones] = useState(false)

  useEffect(() => {
    let vivo = true
    fetch('/api/despiece/grafo')
      .then(async (r) => {
        const cuerpo = await r.json()
        if (!r.ok) throw new Error(cuerpo.error ?? `HTTP ${r.status}`)
        return cuerpo
      })
      .then((g) => vivo && setGrafo(g))
      .catch((e) => vivo && setError(e))
    // El estado va en su propia petición y detrás: mide el disco, tarda más que
    // derivar el grafo, y la página tiene que servir de algo mientras llega.
    fetch('/api/despiece/estado')
      .then((r) => (r.ok ? r.json() : null))
      .then((e) => vivo && e && setEstado(e.estado))
      .catch(() => {
        /* sin estado la página sigue: lo dice en el panel, no revienta */
      })
    return () => {
      vivo = false
    }
  }, [])

  /** Los dominios, con lo que hace falta para marcarlos en la lista. */
  const dominios = useMemo(() => {
    if (!grafo) return []
    const mapa = new Map()
    for (const n of grafo.nodos) {
      if (n.dominio === null) continue
      const d = mapa.get(n.dominio) ?? { id: n.dominio, piezas: 0, sinLeer: 0, rutas: 0 }
      d.piezas += 1
      if (!n.analizado) d.sinLeer += 1
      mapa.set(n.dominio, d)
    }
    const suyo = new Map(grafo.nodos.map((n) => [n.id, n.dominio]))
    for (const a of grafo.aristas) {
      if (!a.a.startsWith('ruta:')) continue
      const d = mapa.get(suyo.get(a.de))
      if (d) d.rutas += 1
    }
    return [...mapa.values()].sort((x, y) => y.piezas - x.piezas || x.id.localeCompare(y.id))
  }, [grafo])

  const activo = dominio ?? dominios[0]?.id ?? null

  const vista = useMemo(() => {
    if (!grafo || !activo) return null
    const propios = grafo.nodos.filter((n) => n.dominio === activo)
    const ids = new Set(propios.map((n) => n.id))
    const aristas = grafo.aristas.filter((a) => ids.has(a.de) || ids.has(a.a))
    const tocados = new Set(aristas.flatMap((a) => [a.de, a.a]))
    // Los vecinos de otro dominio entran para que la cadena no se corte en seco:
    // una ruta o un snapshot compartido es parte del recorrido de este dato.
    const vecinos = grafo.nodos.filter((n) => !ids.has(n.id) && tocados.has(n.id))
    const todos = [...propios, ...vecinos]
    // El espinazo es el recorrido del dato. Los procesos —crones, flujos,
    // guardas, CLIs— no son un carril de ese recorrido y se listan aparte, no
    // se pierden: `ordenarCarriles` los deja fuera a posta.
    const nodos = todos.filter((n) => CARRILES.includes(n.carril))
    const procesos = todos.filter((n) => !CARRILES.includes(n.carril))
    // `nombra` NUNCA entra en el espinazo: dice que un guion menciona el
    // fichero y que el escaneo no supo si lo lee o lo escribe. Es una relación
    // de verdad y por eso se dibuja al abrir el nodo o con «todas», pero no es
    // el recorrido del dato y ponerla en la columna vertebral afirmaría una
    // dirección que nadie ha derivado.
    const esp = espina(
      nodos,
      aristas.filter((a) => a.tipo !== 'nombra'),
    )
    const orden = ordenarCarriles(nodos, aristas, esp)
    return {
      nodos,
      aristas,
      orden,
      medidas: medida(orden),
      primarias: new Set(aristas.filter((a) => esp.get(a.de) === a.a).map((a) => `${a.de}→${a.a}`)),
      procesos,
      ajenos: vecinos.length,
    }
  }, [grafo, activo])

  const recorrido = useMemo(() => {
    if (!vista || !elegido) return null
    const { arriba, abajo } = cierre(elegido, vista.aristas, { profundidad: PROFUNDIDAD })
    return { centro: elegido, arriba, abajo }
  }, [vista, elegido])

  /**
   * Lo que se PINTA. El recorrido se calcula siempre sobre todas las aristas —
   * ocultar una relación no es no tenerla— pero sólo se dibujan el espinazo y
   * las del nodo abierto.
   */
  const aristasVisibles = useMemo(() => {
    if (!vista) return []
    if (todasLasRelaciones) return vista.aristas
    return vista.aristas.filter(
      (a) => vista.primarias.has(`${a.de}→${a.a}`) || a.de === elegido || a.a === elegido,
    )
  }, [vista, todasLasRelaciones, elegido])

  const nodoElegido = vista?.nodos.find((n) => n.id === elegido) ?? null

  if (error) {
    return (
      <div className="cp-page" style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{ fontSize: 'var(--fs-page)' }}>Despiece</h1>
        <Card style={{ borderLeft: '3px solid var(--crit)' }}>
          <p style={{ margin: 0 }}>No se pudo construir el despiece: {error.message}</p>
          <p style={{ margin: '8px 0 0', color: 'var(--ink70)', fontSize: 'var(--fs-aux)' }}>
            Esta página sólo existe con <code className="mono">npm run dev</code>. El grafo lo sirve
            un plugin del servidor de desarrollo.
          </p>
        </Card>
      </div>
    )
  }

  if (!grafo) {
    return (
      <div className="cp-page" style={{ padding: 24 }}>
        <p style={{ color: 'var(--ink70)' }}>Leyendo el repositorio…</p>
      </div>
    )
  }

  const { stats } = grafo
  const sinVerbo = grafo.aristas.filter((a) => a.tipo === 'nombra').length
  const filtrados = dominios.filter((d) => d.id.includes(filtro.trim().toLowerCase()))

  return (
    <div className="cp-page" style={{ padding: 24, maxWidth: 1240, margin: '0 auto' }}>
      <style>{estiloDespiece}</style>

      <p
        className="mono"
        style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', margin: '0 0 4px' }}
      >
        LOCAL · NO SE DESPLIEGA
      </p>
      <h1 style={{ fontSize: 'var(--fs-page)', margin: '0 0 8px' }}>Despiece</h1>
      <p style={{ maxWidth: '66ch', color: 'var(--ink70)', margin: '0 0 4px' }}>
        De dónde sale cada dato y en qué página acaba. Todo esto se deriva del código: se recorre el
        grafo de imports, se lee qué escribe cada guion y se juntan las dos mitades. Pulsa una pieza
        para ver su recorrido.
      </p>
      <p className="mono" style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
        {grafo.nodos.length} piezas · {stats.aristas} relaciones · {dominios.length} dominios
      </p>

      {stats.scriptsSinAnalizar > 0 && (
        <Card style={{ borderLeft: '3px solid var(--warn)', marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 'var(--fs-aux)' }}>
            <strong>{stats.scriptsSinAnalizar}</strong> de{' '}
            {stats.scriptsAnalizados + stats.scriptsSinAnalizar} guiones construyen sus rutas de una
            forma que el escaneo no sigue. Salen con el borde a trazos y un ⚠: sus relaciones{' '}
            <strong>faltan de este dibujo</strong>, que no es lo mismo que no tenerlas.
          </p>
        </Card>
      )}

      {sinVerbo > 0 && (
        <Card>
          <p style={{ margin: 0, fontSize: 'var(--fs-aux)', color: 'var(--ink70)' }}>
            <strong>{sinVerbo}</strong> relaciones salen punteadas: el escaneo ve el fichero en el
            texto del guion y no puede decir si lo lee o lo escribe —una tabla de nombres, un
            ayudante local—. La relación existe; el <em>verbo</em> no está derivado, y por eso no
            entra en el espinazo.
          </p>
        </Card>
      )}

      <AveriasResumen parte={grafo.averias} />
      <Mantenimiento grafo={grafo} />

      <div className="cp-desp">
        <div>
          <SectionHead title="Dominios" as="h2" size="head" />
          <input
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="filtrar…"
            aria-label="Filtrar dominios"
            className="mono"
            style={{
              width: '100%',
              padding: '6px 8px',
              margin: '6px 0 8px',
              borderRadius: 'var(--r-input)',
              border: '1px solid var(--border)',
              background: 'var(--paper)',
              color: 'var(--ink)',
              fontSize: 'var(--fs-meta)',
            }}
          />
          <div className="cp-desp-lista">
            {filtrados.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setDominio(d.id)
                  setElegido(null)
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  textAlign: 'left',
                  padding: '5px 8px',
                  marginBottom: 2,
                  borderRadius: 'var(--r-input)',
                  border: '1px solid',
                  borderColor: d.id === activo ? 'var(--civic)' : 'transparent',
                  background: d.id === activo ? 'var(--civic-soft)' : 'transparent',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                  fontSize: 'var(--fs-meta)',
                }}
              >
                <span className="mono">{d.id}</span>
                <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {d.sinLeer > 0 && (
                    <Pill tone="warn" size="xs">
                      {d.sinLeer} ⚠
                    </Pill>
                  )}
                  {d.rutas === 0 && (
                    <Pill tone="crit" size="xs">
                      sin página
                    </Pill>
                  )}
                  <Pill tone="ghost" size="xs">
                    {d.piezas}
                  </Pill>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <SectionHead
            title={activo ?? '—'}
            as="h2"
            size="head"
            right={
              vista ? (
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Pill tone="neutral" size="xs">
                    {vista.nodos.length} piezas · {aristasVisibles.length} de {vista.aristas.length}{' '}
                    relaciones
                  </Pill>
                  <label
                    className="mono"
                    style={{
                      display: 'flex',
                      gap: 5,
                      alignItems: 'center',
                      fontSize: 'var(--fs-micro)',
                      color: 'var(--ink70)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={todasLasRelaciones}
                      onChange={(e) => setTodasLasRelaciones(e.target.checked)}
                    />
                    todas
                  </label>
                </span>
              ) : null
            }
          />
          {vista && (
            <Card style={{ marginTop: 8 }} pad={false}>
              <div style={{ padding: 10 }}>
                <LienzoDespiece
                  nodos={vista.nodos}
                  aristas={aristasVisibles}
                  medidas={vista.medidas}
                  primarias={vista.primarias}
                  recorrido={recorrido}
                  elegido={elegido}
                  onElegir={setElegido}
                />
              </div>
            </Card>
          )}

          {vista && vista.procesos.length > 0 && (
            <Card style={{ marginTop: 12 }}>
              <SectionHead
                title="Quién lo mueve y quién lo vigila"
                as="h3"
                size="head"
                right={
                  <Pill tone="ghost" size="xs">
                    {vista.procesos.length}
                  </Pill>
                }
              />
              <p style={{ margin: '4px 0 8px', fontSize: 'var(--fs-aux)', color: 'var(--ink70)' }}>
                No son carriles del recorrido del dato: son lo que lo empuja y lo comprueba.
              </p>
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                {vista.procesos.map((p) => (
                  <li
                    key={p.id}
                    className="mono"
                    style={{
                      fontSize: 'var(--fs-meta)',
                      color: 'var(--ink70)',
                      padding: '2px 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {p.nombre}
                    {p.detalle ? (
                      <span style={{ color: 'var(--ink50)' }}> · {p.detalle}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {nodoElegido && (
            <Card style={{ marginTop: 12 }}>
              <p
                className="mono"
                style={{ margin: 0, fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
              >
                {nodoElegido.carril.toUpperCase()}
                {nodoElegido.dominio ? ` · ${nodoElegido.dominio}` : ' · sin dominio'}
              </p>
              <h3 className="mono" style={{ margin: '2px 0 6px', fontSize: 'var(--fs-card)' }}>
                {nodoElegido.nombre}
              </h3>
              {nodoElegido.ruta && (
                <p
                  className="mono"
                  style={{ margin: '0 0 8px', fontSize: 'var(--fs-meta)', color: 'var(--ink70)' }}
                >
                  {nodoElegido.ruta}
                </p>
              )}
              {nodoElegido.detalle && (
                <p style={{ margin: '0 0 8px', fontSize: 'var(--fs-aux)', color: 'var(--ink70)' }}>
                  {nodoElegido.detalle}
                </p>
              )}
              {nodoElegido.carril === 'snapshot' && (
                <p style={{ margin: '0 0 8px', fontSize: 'var(--fs-aux)' }}>
                  <Pill tone={nodoElegido.publicado ? 'civic' : 'neutral'}>
                    {nodoElegido.publicado ? 'publicado · lo sirve Vercel' : 'no publicado'}
                  </Pill>
                </p>
              )}
              {!nodoElegido.analizado && nodoElegido.carril !== 'snapshot' && (
                <p
                  style={{ margin: '0 0 8px', fontSize: 'var(--fs-aux)', color: 'var(--warn-ink)' }}
                >
                  ⚠ No se pudo leer qué toca este guion. Las relaciones que faltan aquí no son
                  relaciones que no existan.
                </p>
              )}
              <EstadoNodo estado={estado} id={nodoElegido.id} />
              <p style={{ margin: 0, fontSize: 'var(--fs-aux)', color: 'var(--ink70)' }}>
                Recorrido a {PROFUNDIDAD} saltos:{' '}
                <span className="mono">{recorrido?.arriba.size ?? 0}</span> piezas aguas arriba,{' '}
                <span className="mono">{recorrido?.abajo.size ?? 0}</span> aguas abajo.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
