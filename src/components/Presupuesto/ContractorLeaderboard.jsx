import { useMemo, useState } from 'react'
import { concentracion, resolverDeEmpresas, topContractors } from '../../lib/tender-geo'
import { useEntities } from '../../hooks/useEntities'
import {
  isCommittedContract,
  importeAdjudicado,
  ingresoMunicipal,
} from '../../lib/contract-status.js'
import { entero, rellena, euros } from '../../lib/formatters'
import { useT } from '../../i18n'

/** Cuántas filas pinta la lista. La cuenta de arriba las mide a todas. */
const FILAS = 15

export default function ContractorLeaderboard({ contracts, tenders }) {
  const t = useT()
  const [open, setOpen] = useState(null)
  const entities = useEntities()
  const resolver = useMemo(() => resolverDeEmpresas(entities.data?.companies), [entities.data])
  const todos = useMemo(() => topContractors(contracts, Infinity, resolver), [contracts, resolver])
  const top = todos.slice(0, FILAS)
  const resumen = concentracion(todos)
  const byAssignee = useMemo(() => {
    const m = new Map()
    for (const c of contracts || []) {
      if (!c.assignee) continue
      if (!(isCommittedContract(c) && importeAdjudicado(c) > 0)) continue
      // Key the drill-down by the same display name the row uses, so a
      // merged company lists the contracts of every razón social variant.
      const display = resolver?.(c.assignee)?.canonicalName ?? c.assignee
      const arr = m.get(display) || []
      arr.push(c)
      m.set(display, arr)
    }
    return m
  }, [contracts, resolver])
  // La pestaña se llama «¿Quién recibe el dinero?», y no todos lo reciben: quien
  // compra una parcela municipal le paga al Ayuntamiento. El importe se queda en
  // la lista y en las sumas, las mismas que /gestion y la portada; lo que no puede
  // quedarse es la lectura de que lo cobró. Por el título, igual que la bitácora de
  // las subidas firmadas (`ingresoMunicipal`).
  const titulos = useMemo(
    () => new Map((tenders ?? []).map((l) => [l.permalink, l.title])),
    [tenders],
  )
  const esVenta = (c) => ingresoMunicipal(c, titulos.get(c.permalink) ?? null) === 'enajenacion'
  const ventas = [...byAssignee.values()].flat().filter(esVenta).length
  const max = top.length ? top[0].amount : 1
  return (
    <div>
      <p
        data-resumen-adjudicatarios=""
        style={{
          margin: '0 0 10px',
          fontSize: 'var(--fs-aux)',
          lineHeight: 1.5,
          color: 'var(--ink70)',
          maxWidth: '92ch',
        }}
      >
        {resumen
          ? `${rellena(t('presupuesto.gasto.contratistas.resumen'), {
              n: resumen.deCada100,
              mayor: resumen.mayorDeCada100,
              total: entero(resumen.adjudicatarios),
            })} `
          : ''}
        {t('presupuesto.gasto.contratistas.adjudicado')}
        {ventas > 0
          ? ` ${rellena(t('presupuesto.gasto.contratistas.ventas'), { n: entero(ventas) })}`
          : ''}
      </p>
      {top.map((fila) => (
        <div
          key={fila.assignee}
          style={{ borderBottom: '1px solid var(--border2)', padding: '8px 0' }}
        >
          <button
            onClick={() => setOpen(open === fila.assignee ? null : fila.assignee)}
            aria-expanded={open === fila.assignee}
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              width: '100%',
            }}
          >
            <span style={{ flex: 1, fontSize: 'var(--fs-meta)', fontWeight: 500 }}>
              {fila.assignee}
              {fila.variantCount > 1 && (
                <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginLeft: 6 }}>
                  · {rellena(t('presupuesto.gasto.razonesSociales'), { n: fila.variantCount })}
                </span>
              )}
              {byAssignee.get(fila.assignee)?.every(esVenta) && (
                <span
                  data-compra-al-ayuntamiento=""
                  style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginLeft: 6 }}
                >
                  · {t('presupuesto.gasto.contratistas.compra')}
                </span>
              )}
            </span>
            <span
              style={{
                height: 6,
                width: Math.max(6, (fila.amount / max) * 120),
                background: 'var(--civic)',
                borderRadius: 'var(--r-input)',
              }}
            />
            <span className="mono" style={{ fontWeight: 700, fontSize: 'var(--fs-meta)' }}>
              {euros(fila.amount)}
            </span>
            <span
              style={{
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink50)',
                width: 70,
                textAlign: 'right',
              }}
            >
              {rellena(
                t(
                  fila.count === 1
                    ? 'presupuesto.gasto.contratos.uno'
                    : 'presupuesto.gasto.contratos.varios',
                ),
                { n: fila.count },
              )}
            </span>
          </button>
          {open === fila.assignee && (
            <div style={{ paddingLeft: 8, marginTop: 4 }}>
              {(byAssignee.get(fila.assignee) || []).slice(0, 20).map((c) => (
                <div
                  key={c.id}
                  style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', padding: '3px 0' }}
                >
                  {c.title.length > 90 ? c.title.slice(0, 90) + '…' : c.title} —{' '}
                  <span className="mono">
                    {euros(importeAdjudicado(c)) || t('importe.noPublicado')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
