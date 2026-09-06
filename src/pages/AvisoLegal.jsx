import { Card, SectionHead } from '../components/Primitives'
import { fmtDateLong } from '../lib/formatters'

export default function AvisoLegal() {
  return (
    <div
      className="cp-page"
      style={{
        padding: '24px',
        maxWidth: 860,
        margin: '0 auto',
        fontSize: 'var(--fs-body)',
        lineHeight: 1.6,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        Transparencia editorial
      </div>
      <h1
        style={{
          fontSize: 'var(--fs-page)',
          fontWeight: 700,
          letterSpacing: '-.015em',
          marginTop: 2,
        }}
      >
        Aviso legal y política editorial
      </h1>

      <Card style={{ marginTop: 22 }}>
        <SectionHead eyebrow="Quién es CivicPulse" title="Identidad y responsabilidad" />
        <p>
          CivicPulse es un proyecto independiente de civic-tech. No es un medio de comunicación al
          amparo de la LO 2/1997, ni un partido político, ni está vinculado al Ayuntamiento de
          Riba-roja de Túria ni a ninguna administración. Se aloja en Vercel bajo el dominio
          civicpulse.es.
        </p>
        <p>
          El mantenedor del proyecto asume responsabilidad editorial individual por el contenido
          publicado. Para correcciones, derecho de réplica o consultas legales, contacte con la
          redacción a través del canal indicado más abajo.
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Fuentes" title="De dónde salen los datos" />
        <p>
          Todos los datos mostrados proceden de fuentes públicas del sector público español o de
          proyectos de datos abiertos (Transparencia Act 19/2013, CC-BY 4.0 datos.gob.es, ODbL
          OpenStreetMap, CC0 Wikidata, reutilización abierta PLACSP/BDNS/CONPREL, REST pública de
          prensa, la API JSON del INE —índice de precios con el que se deflactan las series de
          coste, y padrón municipal—, el Portal Estadístico de Criminalidad del Ministerio del
          Interior (Ley 37/2007; «Origen de los datos: Portal Estadístico de Criminalidad»), y la
          capa 0503_Residuos y la cartografía de incendios forestales del Institut Cartogràfic
          Valencià / Generalitat Valenciana (CC BY 4.0) bajo sus condiciones de reutilización, con
          la atribución que exigen). Cada dato individual enlaza a su fuente primaria. El listado
          completo de feeds está en{' '}
          <a href="/datos" style={{ color: 'var(--civic)' }}>
            /datos
          </a>
          .
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Derecho de rectificación" title="Cómo pedir una corrección" />
        <p>
          Si apareces nombrado en el tracker de promesas, en la ficha de Cargos o en cualquier otra
          sección con información incorrecta, tienes derecho a solicitar rectificación. Contacta con
          la redacción para abrir el procedimiento.
        </p>
        <ul>
          <li>Revisión en 24 h hábiles (L-V).</li>
          <li>
            Resolución en 72 h: aceptamos la corrección, la rechazamos con motivo público, o pedimos
            más evidencia.
          </li>
          <li>
            Las ediciones del contenido publicado se registran en la bitácora interna del proyecto.
            Nada se borra en silencio.
          </li>
        </ul>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead
          eyebrow="Coste de los servicios"
          title="Qué afirmamos, y qué no, cuando una cifra se sale de su banda"
        />
        <p>
          En <code>/eficiencia</code> y <code>/gestion</code> publicamos fichas sobre cifras que se
          separan de lo que declaran municipios comparables, o que superan un umbral que fija una
          norma.{' '}
          <strong>
            Una ficha describe un servicio municipal y nunca a una persona ni a un grupo político
          </strong>
          : el formato en que se guardan no tiene ningún campo donde poner un nombre, y rechaza los
          del formato de los hallazgos de pleno. La fuente respalda lo que costó recoger la basura,
          no quién lo decidió.
        </p>
        <p>
          <strong>Junto a cada cifra sí decimos quién responde de ese servicio</strong>, y eso es
          una cosa distinta de lo anterior. El Ayuntamiento publica en su portal de transparencia
          qué áreas tiene delegada cada concejal; nosotros republicamos esa atribución al lado del
          servicio que le corresponde, para que quien quiera preguntar sepa a quién dirigirse. No
          afirma que la cifra sea responsabilidad personal de nadie —un coste por efectivo de
          policía es un precio, no un rendimiento—, y la advertencia sobre cómo se lee cada número
          va siempre con el nombre, en la misma tarjeta. Por eso el nombre vive en la ficha de cada
          servicio y no en la tabla que los compara: en una fila de tabla esa advertencia no cabe, y
          un nombre pegado a una cifra sin la frase que la matiza afirma más de lo que la fuente
          sostiene. Cuando el enlace entre el área delegada y el servicio lo hacemos nosotros, y no
          el Ayuntamiento con sus propias palabras, se marca donde aparece el nombre y la marca
          lleva a la explicación. Si ningún área delegada nombra un servicio, no se atribuye a
          nadie: se dice que no consta. La lista está firmada y congelada —no la reescribe ningún
          proceso automático— y una comprobación avisa antes de cada despliegue si el reparto de
          áreas ha cambiado.
        </p>
        <p>
          <strong>Cuando un servicio está concedido, la ficha nombra a la empresa</strong> que lo
          presta, con el importe y las fechas de la adjudicación y un enlace al expediente público.
          Sin eso, una casilla vacía se lee como un dato que falta, cuando lo que dice es otra cosa:
          que ese gasto no aparece en las cuentas del ayuntamiento porque lo cobra la concesionaria
          directamente del recibo. Son datos de la adjudicación —hechos fechados— contrastados uno a
          uno contra la ficha del expediente en la Plataforma de Contratación del Estado, no contra
          un volcado intermedio. No se publica el estado en curso de ningún contrato.
        </p>
        <p>
          Ninguna ficha afirma una causa, y en particular ninguna afirma mala gestión, despilfarro
          ni irregularidad. Que una cifra se salga de su banda es una pregunta con los números
          puestos: puede responder a una diferencia real de coste, a una decisión legítima, o a que
          cada ayuntamiento rellena esa casilla a su manera —lo que ocurre a menudo, y la ficha lo
          advierte cuando es el caso—.
        </p>
        <p>
          <strong>Ninguna se publica de forma automática.</strong> Un proceso señala candidatos y
          los deja sin publicar; el texto lo escribe y lo firma una persona con su nombre visible,
          tras comprobar el expediente. Cada ficha congela la cifra y el periodo de los que habla, y
          una comprobación automática la contrasta contra la fuente antes de cada despliegue: si el
          ministerio revisa esa entrega y el número deja de coincidir, el despliegue se detiene.
          Corregir una ficha deja fila pública con el texto anterior; retirarla la quita de la
          página y deja constancia comprobable de cuál se fue.
        </p>
        <p>
          El derecho de réplica es <strong>institucional</strong>: el ayuntamiento, la intervención,
          la empresa concesionaria del servicio o el ministerio pueden remitir una respuesta
          literal, que se publica íntegra junto a la ficha. Lo mismo vale para las{' '}
          <strong>preguntas registradas</strong> al pie de los dos paneles: cada una se dirige a una
          institución, y su respuesta se publica íntegra junto a la pregunta que contesta. Quien
          aparezca nombrado como titular de una competencia delegada tiene además{' '}
          <strong>su propia vía de réplica, a título personal</strong>, por si la atribución es
          incorrecta, el reparto de áreas ha cambiado o quiere explicar la cifra; su respuesta se
          publica íntegra igual. Las vías y los plazos son los mismos descritos más arriba. Todo el
          proceso se detiene durante el periodo electoral (LOREG art. 50), y durante esa ventana los
          nombres desaparecen de todas las superficies que los publican: las fichas de servicio y el
          panel de gestión.
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Periodo electoral" title="Modo congelado LOREG" />
        <p>
          Durante el periodo electoral oficial convocado mediante real decreto y hasta la
          proclamación definitiva de la Junta Electoral de Zona (Ley Orgánica del Régimen Electoral
          General 5/1985, art. 50), el tracker de promesas entra en modo solo-lectura:
        </p>
        <ul>
          <li>
            El proceso diario de auto-curación se detiene por completo: no propone ni auto-publica
            ninguna promesa, y el publicador automático con umbral de confianza queda igualmente
            suspendido.
          </li>
          <li>Los estados publicados quedan congelados a la fecha de inicio del periodo.</li>
          <li>
            El pleno principal del sitio, incluidas las páginas <code>/presupuesto</code>,{' '}
            <code>/cargos</code> y <code>/datos</code>, sigue operativo con datos objetivos de
            fuente pública.
          </li>
          <li>
            Las solicitudes de rectificación siguen atendiéndose en el mismo plazo de 24/72 h.
          </li>
        </ul>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Auto-curación" title="Publicación automática con revisión" />
        <p>
          Un proceso diario puede publicar automáticamente promesas no acusatorias extraídas de
          fuentes públicas cuando superan un umbral de confianza y su cita textual queda anclada a
          la fuente. Cada registro auto-publicado se marca como «publicada automáticamente ·
          revisión pendiente» y es retractable. Los veredictos de incumplimiento y el estado
          «inviable» siguen requiriendo intervención humana, y todo el proceso se detiene durante el
          periodo electoral (LOREG art. 50).
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead
          eyebrow="Formación y trayectoria de cargos electos"
          title="Qué afirmamos, y qué no, sobre la cualificación de un concejal"
        />
        <p>
          En la ficha de cada concejal con delegación publicamos, área por área, si la formación y
          la trayectoria que constan en su CV público guardan relación con la materia de esa área.{' '}
          <strong>No es una evaluación de su competencia ni de su idoneidad para el cargo</strong>,
          y no se expresa como nota, porcentaje ni clasificación. La ley electoral no exige
          titulación alguna para ser concejal: la comparación no mide un incumplimiento, porque no
          hay requisito que incumplir.
        </p>
        <p>
          «No consta» significa que la fuente publicada no lo recoge —no que la persona carezca de
          ello—, y enlaza al apartado de huecos de su propia biografía. Cada fila la propone una
          máquina citando exclusivamente elementos de esa misma lista, y{' '}
          <strong>la revisa y la firma una persona</strong> antes de publicarse, con su nombre
          visible junto a la fecha. Ninguna fila se publica de forma automática, y el bloque
          desaparece por completo durante el periodo electoral (LOREG art. 50).
        </p>
        <p>
          Las referencias que sostienen cada fila proceden hoy, todas, del CV que la propia persona
          declara y el ayuntamiento publica:{' '}
          <strong>
            no afirmamos que lo declarado sea cierto, sino que consta declarado y dónde consta
          </strong>
          , y la ficha lo dice donde hay algo citado. Cualquier cargo puede ejercer su derecho de
          rectificación por las vías descritas más arriba, con los mismos plazos.
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead
          eyebrow="Privacidad / protección de datos"
          title="Datos personales de cargos electos"
        />
        <p>
          Los datos personales tratados sobre cargos electos provienen de publicaciones del
          Ayuntamiento de Riba-roja de Túria, de boletines y registros oficiales (BOP, BOE, DOGV,
          BORME, candidaturas electorales, contratación y subvenciones públicas), de menciones en
          prensa pública y de las cuentas públicas que el propio cargo usa para comunicar en su
          papel institucional. Comprenden el nombre, la fotografía pública, el correo institucional,
          la concejalía asignada, la trayectoria política y profesional que consta en esos
          documentos, los cargos societarios inscritos en el Registro Mercantil, el patrimonio y las
          actividades que el cargo declara por ley y las retribuciones publicadas. No se rastrea a
          los visitantes del sitio ni se usa analítica invasiva.
        </p>
        <p>
          <strong>Qué no se trata nunca:</strong> datos de menores, de salud, de orientación sexual
          o de religión, ideología más allá del partido por el que el cargo concurre, domicilio,
          documento de identidad ni teléfono. Un vínculo familiar o un bien sólo se publica cuando
          un documento público lo recoge de forma explícita y guarda relación con el ejercicio del
          cargo (un contrato, una subvención, un nombramiento, una decisión municipal, una
          incompatibilidad); sin una de las dos condiciones no se publica. Base jurídica: interés
          público y libertad de información (art. 6.1.e y f del RGPD, art. 20 de la Constitución y
          art. 8.2 de la LO 1/1982); todo cargo aludido dispone de derecho de réplica y de
          rectificación por los canales descritos en esta página.
        </p>
        <p>
          Los titulares de cargo pueden solicitar la eliminación de su fotografía concreta
          manteniendo el resto del registro (nombre, concejalía). Canal: el mismo de rectificación.
          La retirada se anota en la lista firmada de competencias, que se edita a mano y no la toca
          ningún proceso automático: borrar el fichero de imagen no bastaría, porque el raspado
          nocturno del padrón municipal lo volvería a descargar. Retirada la fotografía, la ficha
          sigue diciendo el nombre y el área — es lo que esta promesa protege.
        </p>
        <p>
          Quien deja la corporación durante el mandato no desaparece del sitio: su registro se
          conserva en una sección aparte, con la fecha de cese y el acta que la recoge, y sin ningún
          dato en presente —retribución, áreas delegadas, quejas asignadas— sobre un escaño que ya
          no ocupa. Conserva los mismos derechos que el resto de cargos: rectificación por el canal
          descrito más arriba, réplica publicada junto a su registro y retirada de la fotografía
          manteniendo el nombre. Quien toma posesión antes de que el padrón municipal lo recoja
          aparece con lo que el acta dice y nada más: sin retrato ni correo mientras el ayuntamiento
          no los publique.
        </p>
        <p>
          <strong>Huellas de voz.</strong> Para saber qué concejal interviene en cada punto de un
          pleno, el proyecto puede registrar una <em>huella vocal</em> de un cargo electo y
          compararla con las voces de la sesión. Una huella vocal es un{' '}
          <strong>dato biométrico</strong>, así que las condiciones se declaran aquí y no en un
          manual técnico:
        </p>
        <ul>
          <li>
            <strong>El audio de origen es siempre público y del propio cargo</strong>: grabaciones
            de plenos o vídeos que el cargo ha publicado en sus cuentas institucionales o públicas.
            Nunca audio privado, ni grabaciones hechas por nosotros.
          </li>
          <li>
            <strong>La huella no sale de este equipo</strong>, pero un fragmento del audio de origen
            sí. La huella —el vector numérico— no se publica ni se sube a ningún servicio. La
            transcripción de un pleno se envía <em>sin ninguna voz de referencia</em>. En cambio, la
            herramienta que busca a quién pertenece cada voz de la sala sube a la API de diarización
            un recorte de hasta 8 segundos del audio público de cada cargo ya registrado, porque es
            la única forma de que el servicio distinga esas voces del resto. Ese recorte viaja{' '}
            <strong>sin nombre</strong>: se etiqueta con una referencia opaca (<code>ref1</code>,{' '}
            <code>ref2</code>…) y la correspondencia con la persona se resuelve en este equipo.
          </li>
          <li>
            <strong>Es una herramienta de curación, desactivada por defecto</strong>, que se ejecuta
            a mano. La transcripción publica hablantes anónimos («SPEAKER_01»), y ninguna superficie
            pública atribuye una intervención a una persona concreta hasta que un curador lo
            promueve — la atribución automática es de grupo municipal, nunca individual.
          </li>
          <li>
            <strong>Se borra a petición</strong>, por el mismo canal de rectificación, sin que ello
            afecte al resto del registro. No hay plazo de conservación pactado: si el cargo lo pide,
            se elimina.
          </li>
        </ul>
        <p>
          Esta declaración faltaba: hasta el 3 de agosto de 2026 esta página enumeraba los datos
          tratados sobre cargos electos sin mencionar ni las huellas de voz ni las cuentas públicas,
          y describía un origen —publicaciones municipales y prensa— que se había quedado corto. Lo
          detectó una comprobación automática que compara esta página con lo que ha cambiado en el
          código. No se había publicado nunca ninguna atribución derivada de una huella vocal.
        </p>
        <p>
          Y la primera versión de esa declaración, publicada ese mismo día, era inexacta: afirmaba
          que la huella no se subía «a ningún servicio», cuando la herramienta de búsqueda de voces
          llevaba desde el 1 de agosto enviando recortes de audio —entonces todavía etiquetados con
          el nombre del cargo— a la API de diarización. Lo detectó la misma comprobación, en su
          segunda pasada, el 3 de agosto de 2026. El texto de arriba describe lo que ocurre de
          verdad, y desde esa fecha los recortes viajan con una etiqueta opaca en lugar del nombre.
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead
          eyebrow="Quejas ciudadanas · RGPD"
          title="Qué hacemos con las quejas que envías"
        />
        <p>Cuando presentas una queja a través del bot de Telegram, los datos recogidos son:</p>
        <ul>
          <li>
            <strong>Texto de la queja</strong>, categoría y barrio aproximado — se publican en el
            dashboard
          </li>
          <li>
            <strong>Coordenadas exactas</strong> (si las envías) — <strong>nunca</strong> se
            publican; se agregan a nivel de barrio
          </li>
          <li>
            <strong>Tu identidad de Telegram</strong> (ID numérico + nombre de usuario) —{' '}
            <strong>nunca</strong> se publica; sólo sirve para que puedas consultar, apoyar o
            eliminar tus propias quejas
          </li>
          <li>
            <strong>Fotografía adjunta</strong> (si la envías) — se almacena internamente para el
            expediente; puede publicarse en el dashboard tras revisión si el contenido lo permite
          </li>
        </ul>
        <p>
          <strong>Base jurídica</strong>: Art. 6.1.e del Reglamento (UE) 2016/679 (RGPD) —
          tratamiento necesario para el cumplimiento de una misión realizada en interés público
          (fiscalización ciudadana del servicio municipal).{' '}
          <strong>Responsable del tratamiento</strong>: el proyecto CivicPulse, sin fines
          comerciales.
        </p>
        <p>
          <strong>Plazo de conservación</strong>: 5 años desde la resolución de la queja o su última
          actualización (Art. 55 de la Ley Orgánica 3/2018, LOPD-GDD, para fines de interés público
          + garantía del derecho a la tutela judicial efectiva). Al cumplirse el plazo, el registro
          interno se destruye. Las estadísticas agregadas anonimizadas pueden conservarse
          indefinidamente.
        </p>
        <p>
          <strong>Fotografías adjuntas</strong>: si adjuntas una foto a tu queja, antes de
          publicarla se procesa automáticamente para difuminar caras y matrículas y se le eliminan
          todos los metadatos (incluida la geolocalización EXIF). Sólo esa versión anonimizada llega
          al repositorio público; la imagen original nunca se publica ni se sube a git — permanece
          en el almacén local del bot bajo el mismo plazo de conservación y derecho al olvido que el
          resto de la queja. La anonimización es automática y sin revisión humana previa: si
          detectas que ha quedado algún dato personal visible, ejerce el derecho al olvido y la
          imagen se retira de inmediato. La detección automática puede fallar; por eso mantenemos el
          difuminado global de refuerzo y la vía de retirada inmediata.
        </p>
        <p>
          <strong>Derecho al olvido (RGPD art. 17)</strong>: en cualquier momento puedes enviar{' '}
          <code>/olvidar Q-XXXXXXXX</code> al bot para eliminar tu queja del dashboard, del heatmap,
          del feed público, del snapshot abierto y de la foto anonimizada publicada. La queja
          desaparece inmediatamente de todas las superficies públicas; queda un registro anónimo
          interno durante el plazo legal de conservación, y después se destruye. Sólo el autor
          original puede ejercer este derecho sobre su propia queja.
        </p>
        <p>
          <strong>Historial git e inmutabilidad de la cadena de custodia</strong>: el snapshot
          público (<code>quejas.json</code>) vive en un repositorio git como garantía editorial:
          cada cambio queda firmado y fechado en el commit log, lo que permite auditar
          retroactivamente qué se publicó y cuándo. Esa misma propiedad implica que un commit
          anterior puede contener una versión obsoleta de tu queja después de que ejerzas el derecho
          al olvido. Compatibilizamos ambas obligaciones así:
        </p>
        <ul>
          <li>
            <strong>Eliminación inmediata del snapshot vigente</strong>: en el momento en que envías{' '}
            <code>/olvidar Q-XXXXXXXX</code> tu queja desaparece de las páginas públicas y del JSON
            que se sirve a los visitantes.
          </li>
          <li>
            <strong>Reescritura del historial bajo solicitud formal</strong>: si requieres además
            que se borren las versiones presentes en el historial git (commits anteriores), usa la
            misma vía de rectificación contactando al responsable del tratamiento. Procederemos a
            reescribir el historial (<code>git filter-repo</code> o equivalente) y a forzar la
            actualización del repositorio público y de los <em>mirrors</em> de Vercel, dejando traza
            interna de la solicitud y de la fecha de ejecución (sin republicar el contenido
            eliminado).
          </li>
          <li>
            <strong>Base jurídica de la retención por defecto</strong>: la conservación del
            historial git como bitácora de cambios responde al interés público de transparencia
            documentado en el Art. 6.1.e RGPD y al deber de archivo (Art. 55 LOPD-GDD) durante el
            plazo legal de conservación. La reescritura se reserva como excepción a petición
            individual del titular del dato, no como práctica habitual.
          </li>
          <li>
            <strong>Plazo</strong>: la eliminación del snapshot vigente es instantánea (≤24 h). La
            reescritura del historial git se ejecuta en un plazo máximo de 30 días desde la
            recepción de la solicitud.
          </li>
        </ul>
        <p>
          <strong>Derechos adicionales</strong> (acceso, rectificación, oposición, portabilidad):
          contacto igual que la vía de rectificación de esta página. Reclamación ante autoridad de
          control:{' '}
          <a href="https://www.aepd.es" target="_blank" rel="noreferrer">
            Agencia Española de Protección de Datos
          </a>{' '}
          (AEPD) o{' '}
          <a href="https://avpd.euskadi.eus" target="_blank" rel="noreferrer">
            Autoridad Valenciana de Protección de Datos
          </a>
          .
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Licencia del código" title="Open source y reutilización" />
        <p>
          El código fuente del proyecto es abierto y reutilizable. La URL del repositorio se indica
          más arriba. Las licencias de las fuentes externas (CC-BY, ODbL, CC0, Transparencia
          19/2013) se respetan en cada vista; donde procede, la cita a la fuente aparece al lado del
          dato.
        </p>
      </Card>

      {/* La fecha sale de git en el build, no escrita a mano — igual que en
          /metodologia y por una razón más fuerte: esto es un aviso legal, y
          decía «2 de julio» mientras el fichero incorporaba compromisos
          nuevos. Una fecha de vigencia que va por detrás de lo vigente es
          justo lo contrario de lo que una fecha de vigencia sirve. */}
      <p style={{ marginTop: 22, fontSize: 'var(--fs-aux)', color: 'var(--ink50)' }}>
        {__REVISION_AVISO_LEGAL__ ? (
          <>Versión vigente: {fmtDateLong(__REVISION_AVISO_LEGAL__)}. </>
        ) : null}
        Las modificaciones a este aviso legal quedan trazadas en el historial git del repositorio.
      </p>
    </div>
  )
}
