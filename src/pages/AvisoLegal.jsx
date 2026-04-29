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
          CivicPulse es un proyecto independiente de civic-tech. No es un medio de comunicación al amparo de la LO 2/1997, ni un partido político, ni está vinculado al Ayuntamiento de Riba-roja de Túria ni a ninguna administración. Se aloja en Vercel bajo el dominio civicpulse-virid.vercel.app.
        </p>
        <p>
          El mantenedor del proyecto asume responsabilidad editorial individual por el contenido publicado. Para correcciones, derecho de réplica o consultas legales, contacte con la redacción a través del canal indicado más abajo.
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
          Si apareces nombrado en el tracker de promesas, en la ficha de Cargos o en cualquier otra sección con información incorrecta, tienes derecho a solicitar rectificación. Contacta con la redacción para abrir el procedimiento.
        </p>
        <ul>
          <li>Revisión en 24 h hábiles (L-V).</li>
          <li>Resolución en 72 h: aceptamos la corrección, la rechazamos con motivo público, o pedimos más evidencia.</li>
          <li>Las ediciones del contenido publicado se registran en la bitácora interna del proyecto. Nada se borra en silencio.</li>
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
        <SectionHead eyebrow="Privacidad / protección de datos" title="Datos personales de cargos electos" />
        <p>
          Los datos personales tratados sobre cargos electos (nombre, fotografía pública, correo institucional, concejalía asignada) provienen de publicaciones del propio Ayuntamiento de Riba-roja de Túria y menciones en prensa pública. No se rastrea a los visitantes del sitio ni se usa analítica invasiva.
        </p>
        <p>
          Los titulares de cargo pueden solicitar la eliminación de su fotografía concreta manteniendo el resto del registro (nombre, concejalía). Canal: el mismo de rectificación.
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Quejas ciudadanas · RGPD" title="Qué hacemos con las quejas que envías" />
        <p>
          Cuando presentas una queja a través del bot de Telegram, los datos recogidos son:
        </p>
        <ul>
          <li><strong>Texto de la queja</strong>, categoría y barrio aproximado — se publican en el dashboard</li>
          <li><strong>Coordenadas exactas</strong> (si las envías) — <strong>nunca</strong> se publican; se agregan a nivel de barrio</li>
          <li><strong>Tu identidad de Telegram</strong> (ID numérico + nombre de usuario) — <strong>nunca</strong> se publica; sólo sirve para que puedas consultar, apoyar o eliminar tus propias quejas</li>
          <li><strong>Fotografía adjunta</strong> (si la envías) — se almacena internamente para el expediente; puede publicarse en el dashboard tras revisión si el contenido lo permite</li>
        </ul>
        <p>
          <strong>Base jurídica</strong>: Art. 6.1.e del Reglamento (UE) 2016/679 (RGPD) — tratamiento necesario para el cumplimiento de una misión realizada en interés público (fiscalización ciudadana del servicio municipal). <strong>Responsable del tratamiento</strong>: el proyecto CivicPulse, sin fines comerciales.
        </p>
        <p>
          <strong>Plazo de conservación</strong>: 5 años desde la resolución de la queja o su última actualización (Art. 55 de la Ley Orgánica 3/2018, LOPD-GDD, para fines de interés público + garantía del derecho a la tutela judicial efectiva). Al cumplirse el plazo, el registro interno se destruye. Las estadísticas agregadas anonimizadas pueden conservarse indefinidamente.
        </p>
        <p>
          <strong>Derecho al olvido (RGPD art. 17)</strong>: en cualquier momento puedes enviar <code>/olvidar Q-XXXXXXXX</code> al bot para eliminar tu queja del dashboard, del heatmap, del feed público y del snapshot abierto. La queja desaparece inmediatamente de todas las superficies públicas; queda un registro anónimo interno durante el plazo legal de conservación, y después se destruye. Sólo el autor original puede ejercer este derecho sobre su propia queja.
        </p>
        <p>
          <strong>Derechos adicionales</strong> (acceso, rectificación, oposición, portabilidad): contacto igual que la vía de rectificación de esta página. Reclamación ante autoridad de control: <a href="https://www.aepd.es" target="_blank" rel="noreferrer">Agencia Española de Protección de Datos</a> (AEPD) o <a href="https://avpd.euskadi.eus" target="_blank" rel="noreferrer">Autoridad Valenciana de Protección de Datos</a>.
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
