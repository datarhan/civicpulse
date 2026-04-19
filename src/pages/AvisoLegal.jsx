import { Card, SectionHead } from '../components/Primitives'

export default function AvisoLegal() {
  return (
    <div
      className="cp-page"
      style={{ padding: '24px', maxWidth: 860, margin: '0 auto', fontSize: 14, lineHeight: 1.6 }}
    >
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
        Transparencia editorial
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
        Aviso legal y política editorial
      </h1>

      <Card style={{ marginTop: 22 }}>
        <SectionHead eyebrow="Quién es CivicPulse" title="Identidad y responsabilidad" />
        <p>
          CivicPulse es un proyecto independiente de civic-tech. No es un medio de comunicación al amparo de la LO 2/1997, ni un partido político, ni está vinculado al Ayuntamiento de Riba-roja de Túria ni a ninguna administración. Se publica en{' '}
          <a href="https://github.com/datarhan/civicpulse" target="_blank" rel="noreferrer" style={{ color: 'var(--civic)' }}>
            github.com/datarhan/civicpulse
          </a>{' '}
          y se aloja en Vercel bajo el dominio civicpulse-virid.vercel.app.
        </p>
        <p>
          El mantenedor del repositorio asume responsabilidad editorial individual por el contenido publicado. Contacto directo:{' '}
          <a href="https://github.com/datarhan/civicpulse/issues/new" target="_blank" rel="noreferrer" style={{ color: 'var(--civic)' }}>
            issue pública en GitHub
          </a>
          .
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Fuentes" title="De dónde salen los datos" />
        <p>
          Todos los datos mostrados proceden de fuentes públicas del sector público español o de proyectos de datos abiertos (Transparencia Act 19/2013, CC-BY 4.0 datos.gob.es, ODbL OpenStreetMap, CC0 Wikidata, reutilización abierta PLACSP/BDNS/CONPREL, REST pública de prensa). Cada dato individual enlaza a su fuente primaria. El listado completo de feeds está en{' '}
          <a href="/datos" style={{ color: 'var(--civic)' }}>/datos</a>.
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Derecho de rectificación" title="Cómo pedir una corrección" />
        <p>
          Si apareces nombrado en el tracker de promesas, en la ficha de Cargos o en cualquier otra sección con información incorrecta, tienes derecho a solicitar rectificación. El canal oficial es una issue pública en GitHub:
        </p>
        <p>
          <strong>
            <a
              href="https://github.com/datarhan/civicpulse/issues/new?labels=correccion-promesa"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--civic)' }}
            >
              Abrir solicitud de rectificación →
            </a>
          </strong>
        </p>
        <ul>
          <li>Revisión en 24 h hábiles (L-V).</li>
          <li>Resolución en 72 h: aceptamos la corrección, la rechazamos con motivo público, o pedimos más evidencia.</li>
          <li>El historial git del repositorio es la bitácora pública de todas las ediciones. Nada se borra en silencio.</li>
        </ul>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Periodo electoral" title="Modo congelado LOREG" />
        <p>
          Durante el periodo electoral oficial convocado mediante real decreto y hasta la proclamación definitiva de la Junta Electoral de Zona (Ley Orgánica del Régimen Electoral General 5/1985, art. 50), el tracker de promesas entra en modo solo-lectura:
        </p>
        <ul>
          <li>El motor de sugerencias sigue ejecutándose cada noche pero no aplica cambios de estado.</li>
          <li>Los estados publicados quedan congelados a la fecha de inicio del periodo.</li>
          <li>El pleno principal del sitio, incluidas las páginas <code>/presupuesto</code>, <code>/cargos</code> y <code>/datos</code>, sigue operativo con datos objetivos de fuente pública.</li>
          <li>Las solicitudes de rectificación siguen atendiéndose en el mismo plazo de 24/72 h.</li>
        </ul>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Privacidad / protección de datos" title="Datos personales tratados" />
        <p>
          Los únicos datos personales tratados en CivicPulse son los publicados por el propio Ayuntamiento de Riba-roja de Túria sobre sus cargos electos (nombre, fotografía pública, correo institucional, concejalía asignada) y las menciones en prensa pública. No se rastrea a los visitantes del sitio ni se usa analítica invasiva.
        </p>
        <p>
          Los titulares de cargo pueden solicitar la eliminación de su fotografía concreta manteniendo el resto del registro (nombre, concejalía). Canal: el mismo de rectificación.
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Licencia del código" title="Open source y reutilización" />
        <p>
          El código fuente del proyecto es abierto y reutilizable. La URL del repositorio se indica más arriba. Las licencias de las fuentes externas (CC-BY, ODbL, CC0, Transparencia 19/2013) se respetan en cada vista; donde procede, la cita a la fuente aparece al lado del dato.
        </p>
      </Card>

      <p style={{ marginTop: 22, fontSize: 12, color: 'var(--ink50)' }}>
        Versión vigente: 20 de abril de 2026. Las modificaciones a este aviso legal quedan trazadas en el historial git del repositorio.
      </p>
    </div>
  )
}
