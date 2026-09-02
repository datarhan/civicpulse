/**
 * Qué declaró el ayuntamiento, entrega a entrega.
 *
 * La cifra congelada estaba dicha en prosa —«la misma cifra desde 2019»— y una
 * frase así se lee y se olvida. Puesta en una rejilla, cinco casillas idénticas
 * en fila debajo de cinco casillas que cambian todos los años son la
 * demostración, no la afirmación.
 *
 * TRES AUSENCIAS, TRES TRATAMIENTOS. Hasta agosto de 2026 había dos casillas y
 * una de ellas mentía por agregación: `falta` juntaba «el ayuntamiento rindió la
 * entrega pero no declaró este servicio» con «el ayuntamiento no rindió», y las
 * dos salían como el mismo «—» rayado. Son hechos de tamaño muy distinto —2014
 * es un hueco de rutina; 2020 es un incumplimiento del artículo 116 ter— y
 * escribirlos igual convertía el más fuerte en el más débil. Es el defecto del
 * centinela que DATA_INTEGRITY §3 describe: una casilla que significa dos cosas
 * no significa ninguna.
 *
 * El dato para distinguirlas ya estaba en el snapshot y nadie lo leía:
 * `cobertura.entregasNoPresentadas` dice qué entregas no rindió el ayuntamiento
 * —es un hecho de TODA la rendición, no de este servicio— y `serie[].estado`
 * dice si este servicio venía declarado en las que sí rindió.
 *
 * Dos detalles que no son estéticos:
 *
 * - La tinta sobre una casilla --warn SÓLIDA es `--warn-on`, nunca #fff.
 *   `--warn-ink` sobre `--warn` da 1,58:1 y el blanco tampoco pasa; el token
 *   existe justamente para este par y lo mide `tests/brand-tokens.test.js`.
 * - La entrega que falta lleva su rayado, pero el texto va sobre una pastilla
 *   SÓLIDA encima. `contraste.spec.ts` se salta cualquier elemento con
 *   `background-image` por no poder componerlo, así que un «—» sobre el rayado
 *   sería una casilla que ninguna pasada de contraste mira: verde por no
 *   ejecutarse, que es el defecto que esta casa lleva años pagando.
 */
const HATCH = 'repeating-linear-gradient(135deg, var(--warn-soft) 0 4px, var(--paper) 4px 8px)'

function Casilla({ children, tono, primera, ultima }) {
  const radio = `${primera ? 'var(--r-input)' : 0} ${ultima ? 'var(--r-input)' : 0} ${
    ultima ? 'var(--r-input)' : 0
  } ${primera ? 'var(--r-input)' : 0}`
  const base = {
    height: 22,
    display: 'grid',
    placeItems: 'center',
    borderRadius: radio,
    fontSize: 'var(--fs-micro)',
  }
  // No rindió la entrega: el hecho fuerte, y el único que lleva ámbar. La
  // pastilla sólida sobre el rayado existe para que la pasada de contraste
  // pueda componer este texto en vez de saltárselo.
  if (tono === 'no-rindio') {
    return (
      <span style={{ ...base, background: HATCH, border: '1px dashed var(--warn)' }}>
        <span
          className="mono"
          style={{
            background: 'var(--paper)',
            color: 'var(--warn-ink)',
            padding: '0 4px',
            borderRadius: 'var(--r-input)',
          }}
        >
          {children}
        </span>
      </span>
    )
  }
  // Rindió, pero sin este servicio: un hueco de rutina. Discontinuo porque
  // tampoco es una cifra, gris porque no es un incumplimiento.
  if (tono === 'no-declarado') {
    return (
      <span
        className="mono"
        style={{
          ...base,
          background: 'var(--paper)',
          border: '1px dashed var(--border)',
          color: 'var(--ink50)',
        }}
      >
        {children}
      </span>
    )
  }
  const fondo =
    tono === 'congelada'
      ? { background: 'var(--warn)', color: 'var(--warn-on)', fontWeight: 500 }
      : tono === 'coste'
        ? { background: 'var(--civic-soft)', color: 'var(--civic-ink)' }
        : { background: 'var(--soft)', color: 'var(--ink70)' }
  return (
    <span className="mono" style={{ ...base, ...fondo }}>
      {children}
    </span>
  )
}

/**
 * El coste se abrevia; la cantidad NUNCA.
 *
 * Es la diferencia entre enseñar el hecho y borrarlo. «32 k» cinco veces
 * seguidas no demuestra nada —podrían ser 31.992, 32.100 y 31.950— y la
 * afirmación de esta ficha es justamente que es la MISMA cifra. Del coste, en
 * cambio, sólo hace falta ver que se mueve.
 */
/** La cantidad, entera y sin abreviar. Es la cifra que la ficha afirma repetida. */
const exacto = (v) => v.toLocaleString('es-ES', { maximumFractionDigits: 0 })

const compacto = (v) =>
  v >= 1e6
    ? `${(v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M`
    : v >= 1000
      ? `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 0 })} k`
      : v.toLocaleString('es-ES', { maximumFractionDigits: 0 })

function Muestra({ estilo, children }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 'var(--fs-micro)',
        color: 'var(--ink50)',
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 22, height: 14, borderRadius: 'var(--r-input)', flex: 'none', ...estilo }}
      />
      {children}
    </span>
  )
}

export function DeclaracionEntregas({ indicador, entregasPublicadas = [], noPresentadas = [] }) {
  const i = indicador
  const anios = entregasPublicadas.length
    ? [...entregasPublicadas].sort((a, b) => a - b)
    : (i.serie ?? []).map((p) => p.anio)
  if (anios.length < 3) return null

  const porAnio = new Map((i.serie ?? []).map((p) => [p.anio, p]))
  const congeladaDesde = i.declaracion?.denominador?.congelada
    ? i.declaracion.denominador.desde
    : null

  /**
   * Qué clase de casilla es este año. Tres desenlaces, nunca dos.
   *
   * Y por MAGNITUD, no por año. Se decidía con `p.estado`, que es el del
   * cociente y sólo vale «declarado» cuando salen las dos mitades: en el agua,
   * donde el ayuntamiento declara los metros de red y deja el coste a cero, las
   * dos filas se rotulaban «rindió la entrega, no declaró este servicio» — y
   * los 268.530 m están en la fuente. La fila del denominador desmentía a su
   * propia fuente para acompañar a la del numerador.
   */
  const desenlace = (a, clave) => {
    if (noPresentadas.includes(a)) return 'no-rindio'
    const p = porAnio.get(a)
    if (!p) return 'no-declarado'
    if (clave) return typeof p[clave] === 'number' ? 'declarado' : 'no-declarado'
    return p.estado === 'declarado' ? 'declarado' : 'no-declarado'
  }

  const declaradas = anios.filter((a) => desenlace(a) === 'declarado').length
  const aniosSinDeclarar = anios.filter((a) => desenlace(a) === 'no-declarado')
  const sinDeclarar = aniosSinDeclarar.length
  const sinRendir = anios.filter((a) => desenlace(a) === 'no-rindio')
  // Y de qué clase es esa ausencia, que no es siempre la misma. En el agua el
  // ayuntamiento rinde la entrega, declara los metros de red y deja el coste a
  // cero: decir «no declaró este servicio» de un año así lo desmiente el dato
  // de la casilla de al lado, que trae 268.530.
  const aMedias = aniosSinDeclarar.filter(
    (a) => desenlace(a, 'numerador') === 'declarado' || desenlace(a, 'denominador') === 'declarado',
  ).length

  const fila = (clave, rotulo, formato, tonoDe) => (
    <>
      <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink70)' }}>{rotulo}</span>
      {anios.map((a, k) => {
        const d = desenlace(a, clave)
        const v = porAnio.get(a)?.[clave]
        return (
          <Casilla
            key={a}
            tono={d === 'declarado' ? tonoDe(a) : d}
            primera={k === 0}
            ultima={k === anios.length - 1}
          >
            {d === 'no-rindio'
              ? 'no rindió'
              : d === 'no-declarado' || typeof v !== 'number'
                ? '—'
                : formato(v)}
          </Casilla>
        )
      })}
    </>
  )

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border2)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            textTransform: 'uppercase',
            letterSpacing: '.07em',
            color: 'var(--ink50)',
          }}
        >
          Qué declaró el ayuntamiento, entrega a entrega
        </span>
        <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
          {anios.length} entregas obligatorias · {declaradas} con este servicio declarado
        </span>
      </div>

      {/* overflowX explícito: `.cp-scroll-x` de index.css sólo enciende por
          debajo de 720px, así que en escritorio esta rejilla empujaría la
          página igual que hizo la tabla del libro. */}
      <div style={{ marginTop: 12, overflowX: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `92px repeat(${anios.length}, minmax(52px, 1fr))`,
            gap: 4,
            alignItems: 'center',
            minWidth: 92 + anios.length * 56,
          }}
        >
          <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
            entrega
          </span>
          {anios.map((a) => (
            <span
              key={a}
              className="mono"
              style={{
                fontSize: 'var(--fs-micro)',
                textAlign: 'center',
                color: noPresentadas.includes(a) ? 'var(--warn-ink)' : 'var(--ink50)',
              }}
            >
              {a}
            </span>
          ))}

          {fila(
            'numerador',
            'coste',
            (v) => `${compacto(v)}`,
            () => 'coste',
          )}
          {fila('denominador', i.divisor.singular, exacto, (a) =>
            congeladaDesde && a >= congeladaDesde ? 'congelada' : 'neutra',
          )}
        </div>
      </div>

      {/* La leyenda existe porque ahora hay tres tratamientos y dos de ellos son
          huecos: sin decir cuál es cuál, la distinción que este bloque acaba de
          ganar sería invisible. Se pinta sólo lo que esta ficha usa. */}
      {(sinRendir.length > 0 || sinDeclarar > 0 || congeladaDesde) && (
        <div
          style={{
            display: 'flex',
            gap: 20,
            flexWrap: 'wrap',
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid var(--border2)',
          }}
        >
          {congeladaDesde && (
            <Muestra estilo={{ background: 'var(--warn)' }}>cantidad repetida sin remedir</Muestra>
          )}
          {sinDeclarar > 0 && (
            <Muestra estilo={{ background: 'var(--paper)', border: '1px dashed var(--border)' }}>
              {/* «no declaró este servicio» rotulaba una casilla que ahora es de
                  UNA magnitud: en el agua, la del coste está vacía y la de los
                  metros de red trae 268.530, y la leyenda las llamaba a las dos
                  lo mismo. Lo que la casilla dice es que esa cifra no está. */}
              rindió la entrega, no declaró esta cifra
            </Muestra>
          )}
          {sinRendir.length > 0 && (
            <Muestra estilo={{ background: HATCH, border: '1px dashed var(--warn)' }}>
              no rindió la entrega
            </Muestra>
          )}
        </div>
      )}

      {/* El 116 ter colgaba de `congeladaDesde &&`, o sea del denominador de
          ESTE servicio. Es un hecho de toda la rendición del ayuntamiento: en
          una ficha sin congelación desaparecía, y aparecía como nota al pie de
          un divisor en las que sí la tienen. Ahora cada frase cuelga de lo suyo:
          la repetición del denominador, del denominador; la entrega que no se
          rindió, de la rejilla de entregas. */}
      <p
        style={{
          margin: '12px 0 0',
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink70)',
          lineHeight: 1.6,
          textWrap: 'pretty',
        }}
      >
        {congeladaDesde && (
          <>
            {i.declaracion.denominador.repeticionesFinales} casillas idénticas debajo de otras que
            cambian todos los años: eso es el hallazgo, y no hace falta afirmarlo.{' '}
          </>
        )}
        {sinRendir.length > 0 && sinDeclarar > 0 && (
          <>
            <strong>
              {sinDeclarar === 1
                ? `${anios.find((a) => desenlace(a) === 'no-declarado')} y ${sinRendir.join(', ')} son ausencias distintas`
                : 'las ausencias de esta rejilla no son todas iguales'}
            </strong>
            {' — '}
            en {sinDeclarar === 1 ? aniosSinDeclarar[0] : 'unas entregas'} el ayuntamiento rindió la
            entrega{' '}
            {aMedias === sinDeclarar
              ? 'y declaró este servicio a medias: una de las dos casillas viene con cifra y la otra no'
              : aMedias > 0
                ? 'y dejó este servicio sin cociente: en unas falta una de las dos casillas y en otras las dos'
                : 'pero no declaró este servicio'}
            ; en {sinRendir.join(', ')} no rindió nada.{' '}
          </>
        )}
        {sinRendir.length > 0 && (
          <>
            Calcular el coste efectivo antes del 1 de noviembre y comunicarlo al ministerio es una
            obligación del artículo 116 <em>ter</em> de la Ley de Bases de Régimen Local.
          </>
        )}
      </p>
    </div>
  )
}
