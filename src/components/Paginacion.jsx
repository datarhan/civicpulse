import { useEffect, useMemo, useState } from 'react'
import { paginar } from '../lib/paginacion'

/**
 * Los controles de página, y el estado que los acompaña.
 *
 * Dos listados de /presupuesto paginan —los contratos y las obras— y sin esto
 * cada uno se traería su propia copia del acotado, del reinicio al filtrar y de
 * los botones. La aritmética vive en `lib/paginacion`, probada aparte; aquí sólo
 * queda el estado y lo que se pinta.
 */

const BOTON = {
  fontSize: 'var(--fs-meta)',
  padding: '5px 8px',
  border: '1px solid var(--border2)',
  borderRadius: 'var(--r-input)',
  background: 'var(--paper)',
  color: 'var(--ink)',
  fontWeight: 600,
  lineHeight: 1.2,
}

function Paso({ children, onClick, disabled, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{ ...BOTON, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1 }}
    >
      {children}
    </button>
  )
}

/**
 * @param {object} props
 * @param {any[]} props.items el conjunto ENTERO, sin cortar
 * @param {number} [props.porPagina]
 * @param {string} [props.clave] cuando cambia, se vuelve a la primera página.
 *   Es la firma de los filtros: sin ella, filtrar deja al lector a mitad de un
 *   listado que acaba de cambiar debajo.
 * @param {string} props.etiqueta el listado que se pagina, en sintagma nominal
 *   («listado de contratos»). Nombra la navegación Y sus dos botones: con dos
 *   paginaciones en la misma página, un «Página anterior» a secas se oye dos
 *   veces y no dice de cuál de las dos listas es.
 * @param {(rows: any[], info: {desde: number, hasta: number, pagina: number, paginas: number}) => import('react').ReactNode} props.children
 */
export default function Paginacion({ items, porPagina = 10, clave = '', etiqueta, children }) {
  const [pedida, setPedida] = useState(1)
  useEffect(() => setPedida(1), [clave])

  const total = items?.length ?? 0
  const { pagina, paginas, desde, hasta } = paginar(total, pedida, porPagina)
  const rows = useMemo(() => (items ?? []).slice(desde, hasta), [items, desde, hasta])

  return (
    <>
      {children(rows, { desde, hasta, pagina, paginas })}
      {paginas > 1 && (
        <nav
          aria-label={`Paginación del ${etiqueta}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            flexWrap: 'wrap',
            paddingTop: 12,
          }}
        >
          <Paso
            onClick={() => setPedida(pagina - 1)}
            disabled={pagina <= 1}
            label={`Página anterior del ${etiqueta}`}
          >
            ← Anterior
          </Paso>
          {/* `aria-live` porque al cambiar de página no se mueve el foco: sin
              esto, quien usa lector de pantalla pulsa «siguiente» y no se entera
              de que la lista ha cambiado debajo. */}
          <span
            className="mono"
            aria-live="polite"
            style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)' }}
          >
            {pagina} / {paginas}
          </span>
          <Paso
            onClick={() => setPedida(pagina + 1)}
            disabled={pagina >= paginas}
            label={`Página siguiente del ${etiqueta}`}
          >
            Siguiente →
          </Paso>
        </nav>
      )}
    </>
  )
}
