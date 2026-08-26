import { Card, SectionHead } from '../Primitives'

/**
 * Lo que otros entes declaran prestar a este municipio (CE4).
 *
 * Es la tabla que explica los ceros: turismo, ferias, promoción del deporte y
 * ocio aparecen sin coste municipal no porque no existan, sino porque parte de
 * la función la rinde la Mancomunitat en su propio coste efectivo. Once
 * entregas de esta tabla estuvieron cacheadas sin que las leyera nadie; su
 * ausencia hacía pasar una función mancomunada por una función inexistente.
 *
 * Derivado del snapshot, nunca a mano: el título nombra al ente si todos los
 * programas son del mismo, y la lista desaparece sola el año que CE4 venga
 * vacío. Sin filas no se renderiza nada — ni un «no hay» que envejezca mal.
 */
export function Supramunicipal({ filas = [], entrega }) {
  if (!filas.length) return null
  const entes = [...new Set(filas.map((f) => f.entePrincipal))]
  const titulo = entes.length === 1 ? `Lo que presta ${entes[0]}` : 'Lo que prestan otros entes'

  return (
    <Card style={{ marginTop: 18 }}>
      <SectionHead as="h3" size="head" eyebrow="Fuera del ayuntamiento" title={titulo} />
      <p
        style={{
          margin: '8px 0 0',
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink70, var(--ink50))',
        }}
      >
        En la entrega de <span className="mono">{entrega}</span>, el propio coste efectivo declara
        que estas funciones las presta{' '}
        {entes.length === 1 ? 'la entidad supramunicipal' : 'otro ente'} para este municipio. Su
        coste lo rinde quien las presta: no está en las tarjetas de arriba, y por eso algunos de
        estos servicios aparecen en el panel con gasto municipal a cero.
      </p>
      {/* La lista es CE4 entera, y decirlo importa por dónde está puesta: justo
          debajo de los servicios sin cociente. Sin esta frase, un lector que
          acaba de ver el agua y el alcantarillado en blanco los mete en el
          mismo saco —«también los presta la Mancomunitat»— y es falso: están
          concedidos a una empresa, que es otra cosa y su tarjeta lo dice. Lo
          señaló la revisión de superficies, no una prueba de datos: las cifras
          eran correctas y la vecindad mentía. */}
      <p
        style={{
          margin: '6px 0 0',
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink70, var(--ink50))',
        }}
      >
        Son <strong>todas</strong> las que declara esa entrega: un servicio que no esté en esta
        lista no lo presta ningún ente supramunicipal. Si su casilla está vacía, es por otro motivo
        —una concesión, por ejemplo— y su propia tarjeta lo explica.
      </p>
      <ul
        style={{
          margin: '10px 0 0',
          paddingLeft: 18,
          fontSize: 'var(--fs-meta)',
          color: 'var(--ink70, var(--ink50))',
        }}
      >
        {filas.map((f) => (
          <li key={`${f.programa}-${f.entePrincipal}`} style={{ marginBottom: 3 }}>
            <span className="mono" style={{ color: 'var(--ink50)' }}>
              {f.programa}
            </span>{' '}
            · {f.descripcion || 'sin descripción en la fuente'}
            {entes.length > 1 ? ` — ${f.entePrincipal}` : ''}
          </li>
        ))}
      </ul>
    </Card>
  )
}
