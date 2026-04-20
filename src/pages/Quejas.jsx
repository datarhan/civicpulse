import { Card, Pill, SectionHead } from '../components/Primitives'

export default function Quejas() {
  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          Voz ciudadana
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
          Quejas ciudadanas
        </div>
      </div>

      <Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <Pill tone="ghost" size="xs">
            Sin fuente de datos
          </Pill>
          <Pill tone="civic" size="xs">
            Contribuciones bienvenidas
          </Pill>
        </div>
        <SectionHead
          eyebrow="Estado"
          title="Aún no hay un canal público de quejas ciudadanas para Riba-roja"
        />
        <div style={{ fontSize: 14, color: 'var(--ink70)', lineHeight: 1.55, marginTop: 8 }}>
          <p>
            CivicPulse sólo publica datos trazables a fuentes primarias abiertas. A día de hoy, el
            Ayuntamiento de Riba-roja de Túria no expone un canal público y estructurado de quejas
            ciudadanas con posición geográfica, categoría y estado. Hasta que exista, esta página
            permanecerá vacía por respeto al principio editorial del proyecto.
          </p>
          <p>
            Las quejas que los vecinos tramitan por registro presencial o electrónico
            (sede.ribarroja.es) no se publican de forma abierta y por tanto{' '}
            <strong>no pueden aparecer aquí</strong>.
          </p>
        </div>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Mientras tanto" title="Datos relacionados que sí tenemos" />
        <div style={{ fontSize: 13.5, color: 'var(--ink70)', marginTop: 8, lineHeight: 1.55 }}>
          <p>Si buscas rendición de cuentas ciudadana, estas secciones están wiradas a fuentes reales:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>
              <a href="/promesas" style={{ color: 'var(--civic)' }}>Promesas políticas</a> —
              compromisos con cita verbatim, fuente primaria y cadena de evidencia.
            </li>
            <li>
              <a href="/plenos" style={{ color: 'var(--civic)' }}>Plenos municipales</a> — 53
              sesiones con su orden del día real (246 puntos) enlazados a la convocatoria oficial.
            </li>
            <li>
              <a href="/presupuesto" style={{ color: 'var(--civic)' }}>Presupuesto y contratos</a> —
              CONPREL MinHac + 730 contratos Gobierto/PLACSP + 171 subvenciones BDNS.
            </li>
            <li>
              <a href="/cargos" style={{ color: 'var(--civic)' }}>Cargos</a> — corporación municipal
              con correos institucionales por si quieres dirigir tu queja directamente.
            </li>
          </ul>
        </div>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Si el Ayuntamiento publica ese canal" title="Cómo añadirlo" />
        <div style={{ fontSize: 13.5, color: 'var(--ink70)', marginTop: 8, lineHeight: 1.55 }}>
          En el momento en que el Ayuntamiento abra un feed público (CSV/JSON) de quejas a través de
          su portal de transparencia o de un dataset en datos.gob.es, abrimos un adaptador siguiendo
          el mismo patrón RED → GREEN → wire que el resto del sistema.{' '}
          <a
            href="https://github.com/datarhan/civicpulse/issues/new"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--civic)' }}
          >
            Abre una issue
          </a>{' '}
          si tienes información sobre un feed que ya exista.
        </div>
      </Card>
    </div>
  )
}
