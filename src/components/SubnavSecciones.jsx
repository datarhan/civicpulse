import { useEffect, useState } from 'react'

/**
 * Submenú horizontal de secciones, pegajoso bajo la barra superior.
 *
 * Para páginas largas de una sola columna (/eficiencia mide trece pantallas):
 * el patrón vertical de la casa (`StickyToc`, journalist/Navigation.jsx) vive
 * en una tercera columna que estas páginas no tienen y se oculta bajo 1100 px,
 * así que aquí la navegación es una fila de chips con scroll-spy, con su
 * propio scroll horizontal cuando no cabe — el desbordamiento es del
 * contenedor, nunca de la página.
 *
 * Dos contratos que no se ven:
 *
 * - `useHashScroll` mide `.cp-subnav` además de `.cp-shell-topbar` para
 *   colocar los aterrizajes por hash; cambiar la clase rompe esa medición.
 * - `MARGEN_ANCLA` es el `scrollMarginTop` que necesita cualquier ancla de una
 *   página que monte esta barra (topbar 52 + barra + aire). Está exportado
 *   para que las secciones no hardcodeen un número que dejó de ser cierto el
 *   día que la barra apareció — la banda de 2020 enseñó lo que cuesta un
 *   desplazamiento que nadie mide.
 *
 * Lo responsivo va en un <style>, no en el prop `style`: los estilos inline no
 * pueden llevar media queries ni pseudo-clases (regla de la casa).
 */
export const MARGEN_ANCLA = 112

export function SubnavSecciones({
  items,
  ariaLabel = 'Secciones de la página',
  activa: activaFuera,
  onActivar,
}) {
  const [activaSpy, setActivaSpy] = useState(items[0]?.id ?? '')
  // Dos modos en un componente porque son la MISMA barra: la de scroll-spy,
  // que marca por dónde va el lector, y la de pestañas, que decide qué se ve.
  // Partirlas en dos daría dos barras que se parecen y no se comportan igual,
  // que es peor que una sola — la misma razón por la que los dos libros
  // comparten hoja.
  const pestanas = typeof onActivar === 'function'
  const activa = pestanas ? activaFuera : activaSpy

  useEffect(() => {
    if (pestanas) return undefined
    if (typeof window === 'undefined' || items.length === 0) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        const visibles = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top,
          )
        if (visibles[0]) setActivaSpy(visibles[0].target.id)
      },
      // El margen superior descuenta topbar + barra: la sección «activa» es la
      // que pasa por debajo de las dos, no la que asoma por el borde de la
      // ventana. Va 8px por dentro de MARGEN_ANCLA a propósito: un ancla
      // recién aterrizada queda EXACTAMENTE en el margen de scroll, y con el
      // mismo número la intersección en la frontera es una moneda al aire —
      // el spy no marcaría la sección a la que se acaba de saltar. El -60 %
      // inferior evita que una sección corta active a la siguiente antes de
      // tiempo.
      { rootMargin: `-${MARGEN_ANCLA - 8}px 0px -60% 0px`, threshold: 0 },
    )
    for (const it of items) {
      const el = document.getElementById(it.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [items, pestanas])

  if (items.length === 0) return null

  // Siguen siendo enlaces con href, no botones, y a propósito: cada apartado
  // es un destino citable —/eficiencia#hallazgos vive en enlaces publicados— y
  // un <button> no se copia, no se abre en otra pestaña y no sobrevive a que
  // alguien lo pegue en un correo. `role="tab"` encima de un enlace es ARIA
  // válido: el rol manda sobre el elemento y el href sigue haciendo su
  // trabajo.
  const teclas = (e, i) => {
    if (!pestanas) return
    const salto = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: items.length - 1 - i }[e.key]
    if (salto === undefined) return
    e.preventDefault()
    const destino = items[(i + salto + items.length) % items.length]
    onActivar(destino.id)
    e.currentTarget.parentElement?.parentElement?.querySelector(`a[href="#${destino.id}"]`)?.focus()
  }

  return (
    <nav aria-label={ariaLabel} className="cp-subnav">
      <style>{`
        .cp-subnav {
          position: sticky;
          top: 52px;
          z-index: 3;
          background: var(--paper);
          margin: 14px -24px 0;
          padding: 6px 24px;
          border-bottom: 1px solid var(--border);
        }
        .cp-subnav ol {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          gap: 2px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .cp-subnav ol::-webkit-scrollbar { display: none; }
        /* La regla global «li a[href]» subraya enlaces DENTRO de texto (WCAG
           1.4.1: distinguibles sin color). Estos son chips de navegación, no
           texto corrido — el contexto de barra ya los identifica, como en la
           Sidebar — así que se despublica el subrayado con más especificidad. */
        .cp-subnav li a[href] {
          display: block;
          white-space: nowrap;
          padding: 5px 10px;
          border-radius: var(--r-pill);
          font-size: var(--fs-meta);
          text-decoration: none;
          color: var(--ink50);
        }
        .cp-subnav li a[aria-current='true'],
        .cp-subnav li a[aria-selected='true'] {
          color: var(--ink);
          background: var(--soft);
          font-weight: 600;
        }
        /* Objetivo real, no un texto de 12 px: §15 pide 44 px en escritorio y
           48 en movil para todo lo que sea la puerta a unos datos, y una
           pestaña que oculta cinco sextos de la pagina lo es. */
        .cp-subnav li a[role='tab'] {
          display: flex;
          align-items: center;
          min-height: 40px;
          font-size: var(--fs-aux);
          padding: 0 14px;
        }
        @media (max-width: 720px) {
          .cp-subnav li a[role='tab'] { min-height: 48px; }
        }
        .cp-subnav li a:focus-visible {
          outline: 2px solid var(--civic);
          outline-offset: -2px;
        }
        /* §17 · «en papel no hay acordeon que abrir». Una hoja impresa con un
           sexto de la pagina no es la pagina: al imprimir salen los seis
           apartados y la barra se cae. */
        @media print {
          .cp-subnav { display: none; }
        }
      `}</style>
      <ol role={pestanas ? 'tablist' : undefined}>
        {items.map((it, i) => (
          <li key={it.id} role={pestanas ? 'presentation' : undefined}>
            <a
              href={`#${it.id}`}
              id={pestanas ? `tab-${it.id}` : undefined}
              role={pestanas ? 'tab' : undefined}
              aria-selected={pestanas ? activa === it.id : undefined}
              aria-controls={pestanas ? it.id : undefined}
              tabIndex={pestanas && activa !== it.id ? -1 : undefined}
              aria-current={!pestanas && activa === it.id ? 'true' : undefined}
              onKeyDown={(e) => teclas(e, i)}
              onClick={pestanas ? () => onActivar(it.id) : undefined}
            >
              {it.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
