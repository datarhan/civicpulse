import { Card, SectionHead } from '../components/Primitives'
import { usePlenoFindings } from '../hooks/usePlenoFindings'
import { useFindingQuoteProvenance } from '../hooks/useFindingQuoteProvenance'
import { authorshipBreakdown } from '../scraper/finding-authorship'

/**
 * How many published findings a machine wrote, counted from the snapshot at
 * render time rather than typed into the prose.
 *
 * This page is the published editorial contract, so a stale number here is a
 * false statement about how the site works — not a typo. CLAUDE.md forbids
 * writing row counts into docs because every one that was ever written here was
 * wrong when audited; on a PUBLISHED page the same number is worse, because it
 * goes false on its own the next time the auto-curator runs and nobody edits a
 * page to notice. Reading it live is the only version that cannot rot.
 *
 * Falls back to prose without figures while the snapshot loads or if it 404s:
 * an unqualified «la mayoría» is true regardless, and a number rendered from a
 * half-loaded snapshot would be worse than no number.
 */
function useAuthorshipDisclosure() {
  const { data } = usePlenoFindings()
  const items = data?.items ?? []
  if (items.length === 0) return null
  return authorshipBreakdown(items)
}

/**
 * How many published pleno findings carry a refutation, which is the gate that
 * decides whether a finding is syndicated as a machine-readable fact-check
 * (see `src/components/ClaimReviewJsonLd.jsx`).
 *
 * Read live for the same reason as the authorship disclosure above. Sharing
 * `usePlenoFindings` with it costs nothing: hooks ride the module-level
 * snapshot store, so both mounts resolve from one fetch.
 */
function useAdjudicationDisclosure() {
  const { data } = usePlenoFindings()
  const items = data?.items ?? []
  if (items.length === 0) return null
  return {
    total: items.length,
    adjudicated: items.filter((f) => (f.contradiction ?? []).length > 0).length,
  }
}

/**
 * How many published verbatims are still traceable to the transcript vigente,
 * read live from the derived snapshot for the same reason as the two above.
 *
 * Here the reason is sharper than staleness: this figure moves every time a
 * session is re-transcribed, which is a routine background job. A number typed
 * into this paragraph would be a false statement about how many quotes on the
 * site are confirmed — on the page that IS the editorial contract.
 */
function useQuoteProvenanceDisclosure() {
  const { data } = useFindingQuoteProvenance()
  return data?.stats ?? null
}

/**
 * How many published verbatims the editorial gate would withhold from
 * `/plenos`, read live from the same derived snapshot.
 *
 * The most volatile figure on this page: the verdict engine re-judges claims on
 * a schedule of its own, so a claim grounded overnight moves between these
 * three buckets without anybody editing anything. Typing the number here would
 * be a false statement about how many published accusations are uncontrasted,
 * on the page that IS the editorial contract.
 */
function useQuoteContrastDisclosure() {
  const { data } = useFindingQuoteProvenance()
  const stats = data?.contraste?.stats ?? null
  return stats?.porContraste ? stats : null
}

export default function Metodologia() {
  const authorship = useAuthorshipDisclosure()
  const adjudication = useAdjudicationDisclosure()
  const quoteProvenance = useQuoteProvenanceDisclosure()
  const quoteContrast = useQuoteContrastDisclosure()
  return (
    <div
      className="cp-page"
      style={{ padding: '24px', maxWidth: 860, margin: '0 auto', fontSize: 14, lineHeight: 1.6 }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        Documento editorial público
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
        Metodología del tracker de promesas
      </h1>
      <p style={{ color: 'var(--ink70)' }}>
        Este documento explica exactamente cómo se recopilan, clasifican y muestran los compromisos
        políticos en CivicPulse. Está pensado para ser diseccionable por cualquier vecino,
        periodista o cargo público. Si algún punto te parece ambiguo, abre una issue en nuestro
        repositorio público.
      </p>

      <Card style={{ marginTop: 22 }}>
        <SectionHead eyebrow="Principios rectores" title="Qué hacemos y qué no hacemos" />
        <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>
            <strong>Neutralidad entre partidos.</strong> Todos los grupos con representación en el
            pleno pueden aparecer. El tracker no rankea partidos por tasa de cumplimiento en V1.
          </li>
          <li>
            <strong>Fuente primaria obligatoria.</strong> Cada promesa se atribuye mediante una cita
            verbatim (≥20 caracteres) que enlaza a un documento público primario (programa
            electoral, nota de prensa, acta de pleno, presupuesto aprobado).
          </li>
          <li>
            <strong>Conservadurismo en los estados.</strong> El estado por defecto es{' '}
            <em>documentada</em>. Los estados no acusatorios pueden auto-publicarse cuando una
            propuesta supera el umbral de confianza (≥0,70) <em>y</em> queda anclada a su fuente
            (URL que resuelve + cita textual presente); se marcan en su ficha con «publicada
            automáticamente · revisión pendiente» hasta que un curador los revisa. El veredicto{' '}
            <em>no-ejecutada</em> (incumplimiento) nunca se auto-publica: queda listo para publicar
            con un solo clic humano. El estado <em>inviable</em> es siempre exclusivamente humano,
            con justificación documental.
          </li>
          <li>
            <strong>Transparencia del algoritmo.</strong> Un proceso diario escanea prensa y plenos
            con un modelo de lenguaje y emite <em>propuestas</em> con su cadena de razonamiento.
            Cada propuesta pasa una verificación determinista de anclaje; las que superan el umbral
            de confianza (≥0,70) y quedan ancladas a su fuente se auto-publican etiquetadas como
            «publicada automáticamente · revisión pendiente», y las demás se muestran como
            "propuesta automática · pendiente de revisión humana" y esperan en cola. Los veredictos
            acusatorios (incumplimiento) y el estado <em>inviable</em> nunca se auto-publican (ver{' '}
            <a href="#auto-curacion-promesas" style={{ color: 'var(--civic)' }}>
              auto-curación
            </a>
            ).
          </li>
          <li>
            <strong>Derecho de rectificación.</strong> Cualquier persona, colectivo o partido puede
            proponer correcciones mediante issue pública en GitHub. Plazo de revisión: 24 h hábiles
            (L-V). Plazo de resolución: 72 h. Son los mismos plazos que fija{' '}
            <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
              /aviso-legal
            </a>
            , y se cuentan igual en ambos documentos.
          </li>
        </ol>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Taxonomía de estados" title="Qué significa cada estado" />
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginTop: 6 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border2)', textAlign: 'left' }}>
              <th style={{ padding: '6px 0' }}>Estado</th>
              <th style={{ padding: '6px 0' }}>Qué exige publicarlo</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border2)' }}>
              <td style={{ padding: '6px 0' }}>
                <strong>documentada</strong>
              </td>
              <td style={{ padding: '6px 0' }}>
                Tenemos la promesa y su fuente. Sin juicio sobre cumplimiento.
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border2)' }}>
              <td style={{ padding: '6px 0' }}>
                <strong>en-verificacion</strong>
              </td>
              <td style={{ padding: '6px 0' }}>
                Hay señales mixtas; estamos recabando evidencia. No se afirma incumplimiento.
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border2)' }}>
              <td style={{ padding: '6px 0' }}>
                <strong>en-progreso</strong>
              </td>
              <td style={{ padding: '6px 0' }}>
                ≥1 evidencia de avance (licitación publicada, obra iniciada, partida presupuestaria
                comprometida).
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border2)' }}>
              <td style={{ padding: '6px 0' }}>
                <strong>cumplida</strong>
              </td>
              <td style={{ padding: '6px 0' }}>
                Acto formal de finalización o resolución administrativa que acredita el
                cumplimiento.
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border2)' }}>
              <td style={{ padding: '6px 0' }}>
                <strong>parcial</strong>
              </td>
              <td style={{ padding: '6px 0' }}>
                Cumplida en parte; el resto no ejecutado o pendiente.
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border2)' }}>
              <td style={{ padding: '6px 0' }}>
                <strong>no-ejecutada</strong>
              </td>
              <td style={{ padding: '6px 0' }}>
                Requiere (a) voto en pleno rechazando la medida, (b) desfinanciación del
                presupuesto, o (c) finalización del mandato sin inicio. El algoritmo automático{' '}
                <strong>NO</strong> puede asignar este estado.
              </td>
            </tr>
            <tr>
              <td style={{ padding: '6px 0' }}>
                <strong>inviable</strong>
              </td>
              <td style={{ padding: '6px 0' }}>
                Causa externa que impide el cumplimiento. Sólo curador humano, con justificación
                documental.
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead
          eyebrow="Qué NO hace el motor automático"
          title="Límites del inferido algorítmico"
        />
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>
            No auto-publica ninguna propuesta que no supere el umbral de confianza (≥0,70){' '}
            <em>y</em> la verificación determinista de anclaje (URL que resuelve + cita textual
            presente); lo que no lo supera espera revisión humana en cola.
          </li>
          <li>
            No auto-publica veredictos acusatorios: <em>no-ejecutada</em> (incumplimiento) queda
            como propuesta lista para publicar con un solo clic humano, e <em>inviable</em> es
            siempre exclusivamente humano.
          </li>
          <li>
            No genera titulares ni resúmenes originales. Sólo cita la cabecera literal de las
            noticias encontradas.
          </li>
          <li>No puntúa ni rankea partidos por tasa de cumplimiento.</li>
          <li>
            Durante el periodo electoral oficial (LOREG art. 50) el proceso se detiene por completo:
            no propone ni auto-publica nada.
          </li>
        </ul>
      </Card>

      <Card style={{ marginTop: 14 }} id="auto-curacion-promesas">
        <SectionHead
          eyebrow="Auto-curación · /promesas"
          title="Cómo se auto-publican promesas (y qué nunca se auto-publica)"
        />
        <p style={{ margin: '8px 0 0', color: 'var(--ink70)' }}>
          Un proceso diario propone promesas nuevas y cambios de estado a partir de fuentes públicas
          (prensa, plenos) usando un modelo de lenguaje. Cada propuesta pasa por una verificación
          determinista de anclaje: la URL de la fuente debe resolver y la cita textual debe aparecer
          literalmente en ella. Sólo se publica automáticamente lo que supera un umbral de confianza
          (≥0,70) <em>y</em> queda anclado; el resto espera revisión humana en cola.
        </p>
        <p style={{ margin: '8px 0 0', color: 'var(--ink70)' }}>
          Los <em>cambios de estado</em> sobre promesas ya publicadas se infieren de licitaciones y
          adjudicaciones (PLACSP), subvenciones (BDNS), el presupuesto municipal y la prensa. Un
          avance a «en progreso» se auto-publica cuando supera el umbral (≥0,70) y queda anclado a
          una fila real de esas fuentes; «parcial» y «cumplida» nunca se auto-publican — quedan a un
          solo clic humano. Cada cambio sólo puede <em>avanzar</em> una promesa, nunca revertirla, y
          adjunta la evidencia citada en la propia ficha.
        </p>
        <ul style={{ margin: '10px 0 0', paddingLeft: 20, color: 'var(--ink70)' }}>
          <li>
            Lo auto-publicado se marca en su ficha con «publicada automáticamente · revisión
            pendiente» hasta que un curador lo revisa.
          </li>
          <li>
            Un veredicto de «no ejecutada» (incumplimiento) nunca se auto-publica: queda como
            propuesta lista para publicar con un solo clic humano.
          </li>
          <li>
            El anclaje de un cambio de estado demuestra que la licitación o la noticia existe, no
            que corresponda exactamente a la promesa; por eso un avance a «cumplida» siempre lo
            confirma una persona.
          </li>
          <li>El estado «inviable» es siempre exclusivamente humano.</li>
          <li>
            Durante el periodo electoral (LOREG art. 50) el proceso se detiene por completo: no
            propone ni publica nada.
          </li>
          <li>
            El anclaje demuestra que la <em>fuente</em> existe, no que una inferencia acusatoria sea
            correcta; por eso los veredictos de incumplimiento mantienen a una persona en el bucle.
          </li>
        </ul>
      </Card>

      <Card style={{ marginTop: 14 }} id="plazos-vencidos">
        <SectionHead
          eyebrow="Verificación de compromisos públicos"
          title="Plazos vencidos · señalización editorial"
        />
        <p style={{ margin: '8px 0 0', color: 'var(--ink70)' }}>
          El dashboard{' '}
          <a href="/departamentos" style={{ color: 'var(--civic)' }}>
            /departamentos
          </a>{' '}
          cruza promesas electorales, votos de pleno y quejas ciudadanas por concejalía. Cuando un
          compromiso con fecha (<code>dueBy</code>) supera su plazo sin que se haya registrado
          evidencia de ejecución, se muestra el aviso{' '}
          <strong>«plazo vencido · sin evidencia de ejecución»</strong>. Reglas que rigen este
          aviso:
        </p>
        <ul style={{ margin: '10px 0 0', paddingLeft: 20 }}>
          <li>
            <strong>Los votos de pleno son el hecho primario.</strong> Son el material más
            verificable y las promesas electorales son secundarias. Pero un voto no se lee de una
            sola fuente, y hasta agosto de 2026 esta página decía que se transcribía «del acta
            oficial». No era cierto: <strong>cada voto cita ahora dos fuentes distintas</strong>. El{' '}
            <strong>resultado</strong> (aprobado, rechazado) procede del portal de sesiones del
            Ayuntamiento (regmeet.com), que publica el orden del día y el resultado. El{' '}
            <strong>desglose por grupos</strong> —quién votó qué— <em>no</em> lo publica ese portal:
            procede de la transcripción automática (Whisper) del audio de la sesión, que publicamos
            íntegra en <code>/data/pleno-transcripts/</code>. Antes ambas mitades colgaban de un
            único enlace que sólo sostenía una de ellas, y en{' '}
            <a href="/departamentos" style={{ color: 'var(--civic)' }}>
              /departamentos
            </a>{' '}
            ese enlace se rotulaba «Acta oficial». Tres desgloses se comprobaron y resultaron
            erróneos; están retirados y su retirada consta.
          </li>
          <li>
            <strong>Un desglose no cotejado se declara como tal.</strong> Mientras no se haya
            cotejado un desglose contra una segunda fuente, se publica con la marca{' '}
            <strong>«transcripción automática, sin cotejar con otra fuente»</strong> junto a su
            fuente, y el catálogo de{' '}
            <a href="/datos" style={{ color: 'var(--civic)' }}>
              /datos
            </a>{' '}
            da la cifra con su denominador: cuántos de los desgloses publicados están sin cotejar.
            Esa marca va en la fila del <em>desglose</em>, no en la del resultado: el resultado lo
            publica el propio portal de sesiones del Ayuntamiento, y advertir ahí de que «falta el
            acta» sería falso. Hasta agosto de 2026 la misma frase aparecía bajo las dos filas de
            cada votación, y una de las dos no era cierta.
          </li>
          <li>
            <strong>Cotejar significa contra otro documento, no releer el mismo.</strong> Para
            levantar la marca hacen falta una cita literal, la firma de quien comprueba y —desde
            agosto de 2026— <strong>el documento contra el que se ha cotejado</strong>, que el
            esquema exige que sea independiente del que originó el dato. Dos transcripciones de la
            misma sesión no valen (comparten el mismo modo de error); el vídeo sí vale para cotejar
            una transcripción, porque lo que se comprueba es precisamente el paso de transcribir. La
            página nombra el documento consultado, nunca «el acta» por defecto. Antes de ese cambio
            bastaba con citar la propia transcripción de la que salía el recuento: una verificación
            que no verificaba nada. No hay proceso automático que pueda levantar la marca. El
            esquema rechaza además atribuir un desglose a una fuente que no publica desgloses, de
            modo que el fallo original no puede repetirse por descuido.
          </li>
          <li>
            <strong>Hoy no hay ningún desglose cotejado, y no es por dejadez.</strong> El documento
            que zanjaría un desglose es el acta, y este proyecto <em>no puede descargarla</em>: el
            portal municipal se reorganizó dos veces en 2026 y el descargador de actas quedó
            apuntando a rutas que ya no existen. No hay ni una sola acta almacenada aquí; las 45
            transcripciones que hay en disco son todas automáticas. Preferimos decirlo así —fuente
            inaccesible— antes que dejar entender que alguien no ha hecho el trabajo.
          </li>
          <li>
            <strong>El plazo debe venir del acta.</strong> Para los votos de pleno, un{' '}
            <code>dueBy</code> sólo se publica acompañado de una cita verbatim del acuerdo (
            <code>dueBySource</code>, ≥20 caracteres). Sin cita literal no hay plazo.
          </li>
          <li>
            <strong>El grupo también debe venir de la fuente.</strong> Cuando la fuente registra un
            voto sin decir qué grupo lo emitió, la fila se publica como{' '}
            <strong>«Grupo no identificado»</strong>, nunca con una etiqueta que parezca un partido.
            Deducir el grupo restando escaños identificaría por eliminación al único concejal fuera
            de PSOE, PP, VOX y Compromís. Poner el nombre real exige que el acta lo nombre{' '}
            <em>en esa votación</em>, y lo hace una persona, no el extractor.
          </li>
          <li>
            <strong>El aviso de plazo vencido no cambia ningún estado.</strong> Es una señalización
            editorial; por sí solo, el estado de la promesa o del voto no pasa a{' '}
            <em>no-ejecutada</em>, que —como todo veredicto de incumplimiento— exige curación humana
            (un solo clic, nunca automático; ver la sección de auto-curación).
          </li>
          <li>
            <strong>Derecho de réplica intacto.</strong> Cualquier persona o grupo afectado puede
            responder con una cita textual contactando con la redacción (ver{' '}
            <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
              /aviso-legal
            </a>
            ).
          </li>
          <li>
            <strong>Suspensión durante el periodo electoral.</strong> Bajo la LOREG art. 50, el
            aviso de plazo vencido se oculta en todo el dashboard mientras <code>frozenUntil</code>{' '}
            esté activo, igual que los estados del tracker de promesas.
          </li>
          <li>
            <strong>Los puntos debatidos sin voto transcrito NO son compromisos.</strong> Un punto
            en el orden del día sólo se cuenta como compromiso cuando existe una transcripción de
            voto emparejada (por <code>plenoId + itemNumber</code>).
          </li>
          <li>
            <strong>Una votación publicada se puede retirar.</strong> Cuando la fuente contradice lo
            publicado, un curador humano la retracta con firma y motivo. Hay dos alcances, porque
            las dos mitades del registro no tienen el mismo respaldo documental:{' '}
            <strong>retirar la votación entera</strong> —desaparece del sitio y deja de contar en
            los recuentos de /plenos y /departamentos y en el aviso de plazo vencido— o{' '}
            <strong>retirar sólo el desglose por grupos</strong>, dejando publicados el punto, el
            resultado y la fuente. Lo retirado no se borra: queda archivado con su contenido
            original, quién lo retiró y por qué, y el validador impide que vuelva a publicarse sin
            una revocación explícita, también firmada. Nunca se retracta de forma automática.
          </li>
        </ul>
      </Card>

      <Card style={{ marginTop: 14 }} id="relacion-quejas-contratos">
        <SectionHead
          eyebrow="Cruce de datos"
          title="Relación entre quejas ciudadanas y contratos"
        />
        <p style={{ margin: '8px 0 0', color: 'var(--ink70)' }}>
          En la ficha de cada queja (
          <a href="/quejas" style={{ color: 'var(--civic)' }}>
            /quejas
          </a>
          ) mostramos los contratos municipales que <strong>coinciden en zona y/o materia</strong>{' '}
          con la queja. Es un motor <strong>determinista</strong> —sin IA, reproducible— que combina
          cuatro señales, y su marco es deliberadamente <strong>no causal</strong>: una coincidencia
          nunca afirma que el contrato resuelva la queja.
        </p>
        <ul style={{ margin: '10px 0 0', paddingLeft: 20 }}>
          <li>
            <strong>Zona.</strong> El lugar de la queja se compara con el lugar donde el
            place-resolver situó el contrato (mismo callejero OSM), a nivel de calle/urbanización o
            de barrio. Sólo se usa la granularidad ya publicada; nunca coordenadas exactas del
            ciudadano.
          </li>
          <li>
            <strong>Materia.</strong> La concejalía de la queja frente al departamento/CPV del
            contrato, con la misma taxonomía que <code>/departamentos</code>.
          </li>
          <li>
            <strong>Ventana temporal.</strong> Sólo matiza una relación existente; por sí sola nunca
            crea un vínculo.
          </li>
          <li>
            <strong>Dos niveles.</strong> <em>Nivel A</em> (misma zona <u>y</u> materia) es un hecho
            de coocurrencia verificable y se publica directamente con etiqueta neutra («misma zona y
            materia»). <em>Nivel B</em> (sólo zona, o sólo materia) queda como sugerencia{' '}
            <code>requiresHumanApproval</code> y <strong>no se muestra</strong> hasta que un curador
            la promueve.
          </li>
          <li>
            <strong>Sin lenguaje causal.</strong> Las etiquetas son un enum fijo («misma zona»,
            «misma materia», «misma zona y materia»). No usamos palabras como «ignorada» o
            «abandonada»: el lector saca sus propias conclusiones a partir de las cifras.
          </li>
          <li>
            <strong>Triaje opcional con IA (interno).</strong> Cuando una queja acumula muchas
            candidatas de Nivel B, un pase con modelo de lenguaje puede ordenar cuál es la más
            plausible, con una confianza y una frase neutra. Es una herramienta de curación privada:
            su salida sigue siendo <code>requiresHumanApproval</code> y{' '}
            <strong>no se publica</strong> hasta que un curador la promueve — la IA nunca decide qué
            se muestra.
          </li>
          <li>
            <strong>Suspensión electoral (LOREG).</strong> Bajo <code>frozenUntil</code> el motor no
            emite ningún vínculo, igual que el resto de superficies legalmente sensibles.
          </li>
        </ul>
      </Card>

      <Card style={{ marginTop: 14 }} id="politica-automatizacion">
        <SectionHead
          eyebrow="Qué se publica sin revisión humana"
          title="Política de automatización"
        />
        <div style={{ padding: '0 14px 14px', fontSize: 13, lineHeight: 1.6 }}>
          <p style={{ marginTop: 0 }}>
            Hasta agosto de 2026 casi todo lo que escribía una máquina esperaba aprobación humana.
            Esa regla parecía prudente y funcionaba como una cola: los borradores se acumulaban sin
            que nadie tuviera capacidad de revisarlos, mientras el mayor origen de veredictos
            equivocados publicados aquí no era ningún modelo de lenguaje, sino el{' '}
            <strong>verificador determinista</strong> — código escrito a mano que llegó a publicar
            744 veredictos que nadie había revisado, 176 de ellos como «verificado», incluidos
            juicios de valor y fragmentos de conversación sin ningún dato comprobable.
          </p>
          <p>
            El eje, por tanto, no es «humano contra máquina» ni «determinista contra IA». Es{' '}
            <strong>medido o no medido</strong>, y <strong>reversible o no</strong>:
          </p>
          <ul style={{ paddingLeft: 18 }}>
            <li>
              <strong>Automático, sin puerta.</strong> Todo lo que <em>retira o suaviza</em> una
              afirmación ya publicada: retractar un veredicto, bajar la gravedad, despublicar. Es
              reversible y equivocarse significa decir <em>menos</em> de lo que podríamos, que es el
              error seguro para un observatorio.
            </li>
            <li>
              <strong>Automático sólo con medición.</strong> Publicar algo nuevo que no nombra a
              ninguna persona concreta se hace sin curador únicamente si esa categoría tiene una
              precisión medida y registrada (≥0,90 para hallazgos informativos, ≥0,95 para los
              notables), sobre al menos 50 casos y medida en los últimos 90 días. Una categoría{' '}
              <strong>sin medición se trata como no fiable</strong>: el camino para automatizar algo
              es medirlo, no afirmar que funciona. Lo que se compara con el umbral no es la cifra
              medida sino el <strong>límite inferior de su intervalo de confianza al 95 %</strong>,
              porque una muestra pequeña no permite saber de qué lado del umbral está. La auditoría
              de agosto de 2026 revisó los 52 hallazgos publicados <em>entonces</em> y encontró 4
              defectos —un 92,3 % de acierto, por encima del 0,90—, pero con 52 casos ese 92,3 % es
              compatible con un 81 % real, así que la publicación automática sigue cerrada hasta que
              haya más casos revisados. Esa cifra está congelada a propósito: es lo que se midió en
              esa fecha, no una afirmación sobre hoy, y sólo cambia cuando se registra una medición
              nueva.
            </li>
            <li>
              <strong>Siempre con firma humana.</strong> Nombrar a una persona concreta, cualquier
              hallazgo de gravedad crítica (que es una acusación), los informes marcados como
              jurídicamente sensibles, y todo lo irreversible o dirigido al exterior — registrar una
              queja en sede, publicar en el canal. No porque una persona acierte más, sino porque la
              responsabilidad legal necesita una firma.
            </li>
          </ul>
          <p style={{ marginBottom: 0 }}>
            La suspensión electoral (LOREG art. 50) prevalece sobre todo lo anterior: con{' '}
            <code>frozenUntil</code> activo no se publica ni se retracta nada de forma automática.
            Las mediciones vigentes son públicas en el repositorio (
            <code>.automation-measurements.json</code>) y caducan a los 90 días, porque una
            precisión medida contra un modelo que ya no se usa es un dato histórico, no una
            garantía.
          </p>
        </div>
      </Card>

      <Card style={{ marginTop: 14 }} id="encaje">
        <SectionHead
          eyebrow="Qué trae al puesto quien dirige cada área"
          title="Encaje declarado · y qué NO significa"
        />
        <div style={{ padding: '0 14px 14px', fontSize: 13, lineHeight: 1.6 }}>
          <p style={{ marginTop: 0 }}>
            En la ficha de cada concejal con delegación aparece, área por área, si lo que declara en
            su CV publicado guarda relación con la materia de esa área. Es un cruce entre dos cosas
            que ya publicábamos por separado: las <strong>concejalías delegadas</strong> por decreto
            de alcaldía y la <strong>formación y trayectoria</strong> que consta en su biografía,
            con su cita.
          </p>
          <p>
            <strong>No es una calificación, y conviene decir por qué.</strong> La primera versión de
            esta idea era un «perfil ideal» por cargo y un porcentaje de encaje. Se descartó: un
            concejal no es una contratación. La ley electoral no exige título académico ni
            experiencia profesional para ser elegible —basta ser mayor de edad, estar en el censo y
            no incurrir en causa de inelegibilidad—, así que puntuar a un cargo electo contra un
            perfil que ninguna norma contiene sería una opinión con apariencia de métrica. El
            contraste que sí es un hecho comprobable está en la ficha: quienes fiscalizan la
            legalidad y los pagos del ayuntamiento —secretaría, intervención, tesorería— acceden por
            oposición estatal y con titulación universitaria; quienes deciden en qué se gasta, no.
          </p>
          <p>Por tanto, esta sección:</p>
          <ul style={{ paddingLeft: 18 }}>
            <li>
              <strong>No puntúa, no suma y no ordena.</strong> No hay porcentaje, ni ranking, ni
              agregado por persona. En la ficha, cada eje nombra <strong>lo declarado</strong>: el
              título en «Formación», el puesto en «Experiencia» —sin el centro ni la empresa, que
              van en la vista por áreas junto a su cita—. Los nombres de las áreas se añaden detrás,
              precedidos de «solo en»,{' '}
              <strong>únicamente cuando la relación no alcanza a todas</strong> las que dirige:
              donde las alcanza todas no hay nada que acotar. Ni las áreas ni los títulos se cuentan
              nunca. «3 de 4» sería una nota con pasos intermedios.
            </li>
            <li>
              <strong>«No consta» no significa «no tiene».</strong> Significa que la fuente
              publicada no lo recoge, y enlaza al apartado de huecos de su propia biografía. Es
              distinto de «sin relación declarada», que sí afirma algo: que consta formación y que
              corresponde a otra materia. Son hechos diferentes sobre una persona y llevan palabras
              diferentes.
            </li>
            <li>
              <strong>Se dice de qué se sostiene lo citado.</strong> Cada cita que respalda una
              relación se clasifica por quién la publicó: si sale del CV que la propia persona
              declara, o si además la respalda una fuente independiente de ella. La frase habla{' '}
              <strong>sólo de lo citado</strong>: donde no se cita nada no se dice nada, porque
              sobre lo que no se citó no se comprobó ninguna corroboración y negarla sería publicar
              como hallazgo lo que nadie llegó a medir. Mientras todas las evaluaciones de una ficha
              coinciden se dice <strong>una sola vez</strong>, no como un distintivo repetido junto
              a cada elemento — una marca idéntica en todos no distingue nada. Cuando divergen, la
              ficha lo indica en el eje —formación o trayectoria— en el que pueda decirse entero, y
              donde ni siquiera ahí coincide, calla en lugar de aproximar; la vista por áreas sí lo
              marca evaluación por evaluación, que es donde están las citas. «Autodeclarada»
              describe la fuente, no a la persona, y no es un reproche: declarar el propio currículo
              es lo que la ley pide. Queda reservado un tercer valor, «discrepancia documentada»,
              que ningún automatismo deriva: sólo puede ponerlo un curador leyendo dos fuentes que
              se contradicen. Cuando una advertencia de la biografía recae sobre uno de estos ejes,
              el proceso la propone clasificada y ahí se detiene: la firma un curador una por una, y
              puede no firmarla. Que sea cierta y esté bien clasificada no basta para publicarla. La
              que se firma sale con su texto literal; la que no, no sale, y la ficha no dice nada de
              ella.
            </li>
            <li>
              <strong>No mide gestión.</strong> Que la formación de alguien coincida con su área no
              dice nada sobre cómo la dirige, y que no coincida tampoco. Lo que sí se puede medir de
              su gestión —votaciones, promesas con plazo, contratación, quejas— está en{' '}
              <code>/departamentos</code>, y se cuenta por área, no por persona.
            </li>
            <li>
              <strong>Nada de esto se publica solo.</strong> Un modelo propone la relación citando
              por índice sobre la propia lista del CV —de modo que no puede inventarse una fuente— y
              un curador revisa y <strong>firma cada fila</strong> antes de que se publique. Nombrar
              a una persona concreta es Nivel C de la política de automatización: ninguna precisión
              medida lo desbloquea. La cola de revisión no es pública.
            </li>
            <li>
              <strong>Los 10 concejales sin delegación no aparecen en blanco.</strong> Se dice
              expresamente que no dirigen ninguna concejalía, porque un hueco sin explicar
              convertiría la página en «el partido de gobierno tiene credenciales y el resto no» —
              un reflejo de quién gobierna, no de quién está formado.
            </li>
            <li>
              <strong>Se suspende en periodo electoral.</strong> Con <code>frozenUntil</code> activo
              el bloque desaparece por completo. Los hechos no cambian; publicarlos en campaña, sí.
            </li>
          </ul>
          <p>
            <strong>De qué está hecha esa clasificación.</strong> Hoy, todas las referencias que
            sostienen este bloque proceden de un documento que la propia persona redactó sobre sí
            misma: el CV que el ayuntamiento publica en su portal. Una declaración de bienes y
            actividades contaría igual —la custodia un registro oficial, pero lo que dice sigue
            siendo el relato del interesado—. Por eso de cada fuente se anotan{' '}
            <strong>dos cosas distintas</strong>: quién la publica y de quién es el relato. Un CV
            colgado en el portal municipal tiene un publicador fiable y una afirmación sin
            verificar; tomar el sello del ayuntamiento por una comprobación sería dar por hecha una
            que nadie hizo. Que ninguna evaluación diga hoy «corroborada» es el resultado de esa
            clasificación, hecha fuente a fuente: no es un valor decorativo ni inalcanzable —se
            deriva en cuanto una de las citas la publica un tercero ajeno a la persona—, sino una
            medición. Y se comprueba: una evaluación que cita algo sin decir de qué se sostiene, o
            que lo deja en «sin clasificar», rompe la auditoría de integridad que se pasa sobre los
            datos publicados. Y cuando la biografía deja constancia de una discrepancia sin resolver
            sobre la formación o la trayectoria, el proceso la propone como advertencia clasificada;
            que llegue al bloque —con el texto literal de la advertencia— depende de que un curador
            la firme, y puede no firmarla aunque la clasificación sea correcta. Sin esa firma la
            ficha no la menciona, así que la ausencia de advertencias en una ficha no significa que
            la biografía no recoja ninguna.
          </p>
          <p style={{ marginBottom: 0 }}>
            Los requisitos legales citados proceden del texto consolidado del BOE: la{' '}
            <strong>Ley Orgánica 5/1985 del Régimen Electoral General</strong>, artículo 6.1, para
            los cargos electos, y el <strong>Real Decreto 128/2018</strong>, artículos 17, 18 y 19,
            para los funcionarios de Administración Local con habilitación de carácter nacional.
            Sólo se recogen artículos verificados literalmente; donde no se pudo verificar el texto,
            no se afirma nada.
          </p>
        </div>
      </Card>

      <Card style={{ marginTop: 14 }} id="verificacion-declaraciones">
        <SectionHead
          eyebrow="Verificación de declaraciones de pleno"
          title="Del discurso al contraste documental"
        />
        <p style={{ margin: '8px 0 0', color: 'var(--ink70)' }}>
          Los concejales hacen afirmaciones en las intervenciones del pleno: cifras presupuestarias,
          obras en marcha, convenios cerrados, promesas futuras. Algunas son verificables contra
          documentos públicos; otras son opinión política. Este sistema, visible en el apartado{' '}
          <a href="/plenos" style={{ color: 'var(--civic)' }}>
            /plenos
          </a>
          , procesa cada declaración en tres pasos:
        </p>
        <ol style={{ margin: '10px 0 0', paddingLeft: 20 }}>
          <li>
            <strong>Extracción automática</strong> (LLM, requiere aprobación humana). Sobre el texto
            de la sesión, el modelo extrae <em>verbatim</em> las afirmaciones y las clasifica en
            cinco tipos: <code>promesa</code> · <code>afirmacion_numerica</code> ·{' '}
            <code>cita_obra</code> · <code>cita_convenio</code> · <code>acusacion_publica</code>.
            Cada registro se guarda en <code>pleno-claims-suggestions.json</code> con{' '}
            <strong>atribución primaria a nivel de grupo municipal</strong>. La identificación
            individual (concejal concreto) sólo se anota como señal secundaria (
            <code>speakerSlug</code>) cuando el sistema de identificación por voz —entrenado con
            muestras públicas de cada concejal— ha asignado esa línea con alta confianza (cosine ≥
            0,6 y margen ≥ 0,15 frente al segundo candidato). Aún así, ninguna superficie pública (
            <code>/declaraciones</code>, <code>/hallazgos</code>) nombra al individuo hasta que un
            curador lo promueve manualmente. La atribución por grupo es la única que aparece sin
            revisión humana.
            <p style={{ margin: '8px 0 0' }}>
              <strong>Ese texto no siempre es la transcripción del vídeo.</strong> Cuando no hay
              audio de la sesión, lo que se procesa es el <strong>acta municipal</strong>, que es un
              resumen ya redactado por secretaría. La diferencia importa a quien lee: una cita
              «literal» sacada de un acta cita al acta, no a la intervención. Cada sesión en{' '}
              <a href="/plenos" style={{ color: 'var(--civic)' }}>
                /plenos
              </a>{' '}
              indica cuál de las dos está mostrando, y el clasificador nunca adivina — si un
              documento no lleva marcas de tiempo que avancen, no se da por transcripción de audio.
            </p>
          </li>
          <li>
            <strong>Contraste determinista</strong> (sin LLM) contra la base de datos municipal:
            contratos (<code>tenders.json</code>), subvenciones (<code>bdns.json</code>),
            presupuesto (<code>budget.json</code>) y promesas documentadas (
            <code>promises.json</code>). El verificador emite uno de cinco veredictos:
            <ul style={{ marginTop: 6 }}>
              <li>
                <strong>verificado</strong> — coincidencia fuerte (importe + entidad) en alguna base
                documental.
              </li>
              <li>
                <strong>parcial</strong> — coincidencia moderada; entidad o importe difieren algo.
              </li>
              <li>
                <strong>contradicho</strong> — la base documental registra un importe distinto, o el
                discurso afirma «obra terminada» cuando la licitación sigue abierta.{' '}
                <strong>Desde el 2 de agosto de 2026 no se publica de forma automática.</strong> El
                comparador determinista llegó a emitir 49 y los 49 estaban mal: comparaban dinero
                autonómico o estatal con un contrato municipal que compartía una palabra suelta. Una
                concejala citando el precio del alquiler de vivienda quedaba «desmentida» por el
                alquiler de un camión de basura; los 63.000 millones de deuda de la Generalitat, por
                una ampliación de 32.591 € del <em>parque Generalitat</em>. Hoy un{' '}
                <em>contradicho</em> de máquina se retiene y sólo aparece si una persona lo
                promueve.
              </li>
              <li>
                <strong>sin-datos</strong> — no hay registro en las bases abiertas. Puede ser
                cierto, pero no atestado (muy frecuente: reconocimientos extrajudiciales,
                operaciones internas).
              </li>
              <li>
                <strong>promesa-repetida</strong> — la promesa coincide con una ya documentada en el
                tracker de años anteriores.
              </li>
            </ul>
          </li>
          <li>
            <strong>
              Segunda pasada de fundamentación con un modelo NLI local sobre los{' '}
              <code>sin-datos</code>
            </strong>{' '}
            (opcional, sólo cuando el contraste determinista no encontró nada). Tomamos hasta 8
            candidatos del corpus municipal (contratos, subvenciones, promesas previas) por
            coincidencia léxica y semántica, y un modelo de inferencia de lenguaje natural (NLI,
            mDeBERTa multilingüe) ejecutado <strong>localmente</strong> —coste cero, sin cuota—
            decide si algún extracto <em>implica</em> (entailment) la afirmación. El modelo no
            genera texto: puntúa el par (extracto, afirmación), de modo que{' '}
            <strong>no puede inventar evidencia</strong> — la cita es siempre una fila real del
            corpus. Sólo puede <strong>subir</strong> un veredicto <code>sin-datos</code> a
            verificado/parcial; <strong>nunca</strong> marca <em>contradicho</em> de forma
            automática (una contradicción fuerte sólo se <em>señala</em> para revisión humana).
          </li>
          <li>
            <strong>Re-fundamentación de veredictos publicados (sólo señalización).</strong> El
            mismo modelo NLI revisa los veredictos ya publicados (verificado / parcial /
            contradicho): si la evidencia citada no implica la afirmación —o, para un{' '}
            <em>contradicho</em>, no la contradice— el veredicto se{' '}
            <strong>marca para revisión de un curador</strong>. Esa revisión{' '}
            <strong>no cambia ningún veredicto</strong>: sólo una persona puede rebajarlo (nunca
            subirlo) con una herramienta dedicada, dejando el motivo verbatim. Las decisiones de
            segunda pasada y de curación viven en una capa («overlay») separada del veredicto
            determinista base, de modo que recalcular la base nunca borra esas decisiones.
          </li>
          <li>
            <strong>Motor de veredictos (re-derivación, sólo a la baja).</strong> Una segunda pasada
            de fundamentación —«razonar y luego formatear» sobre los mismos candidatos del corpus,
            con la regla de <em>no-evidencia por defecto</em> y la misma comprobación de que el
            valor citado aparezca literalmente en el extracto— vuelve a juzgar los veredictos
            marcados verificado/parcial, tanto los de la pasada LLM como —desde el 2 de agosto de
            2026— los que había afirmado el comparador determinista. Esa primera pasada sobre la
            base retractó <strong>229 de 264 veredictos juzgados</strong>, coherente con el conjunto
            de control: el determinista acierta un 33&nbsp;% en <em>verificado</em> y un 22&nbsp;%
            en <em>parcial</em>. Una parte de las declaraciones el modelo no llega a verlas, porque
            sin cifra en euros la recuperación léxica no encuentra candidatos; conservan su
            veredicto determinista hasta que la vía semántica las alcance. (Aquí no damos el número
            exacto a propósito: cambia con cada pleno transcrito, y una cifra escrita en esta página
            se quedaría falsa sin que nadie lo notara. El recuento vigente está en el bloque{' '}
            <code>stats</code> de <code>pleno-claims-verified.json</code>, que se publica junto al
            resto de los datos.) En una muestra de control etiquetada a mano, su veredicto{' '}
            <code>sin-datos</code> acierta ~92&nbsp;%, así que{' '}
            <strong>
              sólo aplicamos sus retractaciones a <code>sin-datos</code>
            </strong>{' '}
            (nunca sube ni introduce un veredicto nuevo). El resultado es más conservador: retira
            afirmaciones que el trazado de datos abiertos no atestigua, dejando el motivo verbatim
            en el overlay. Nunca marca <em>contradicho</em>.
          </li>
          <li>
            <strong>Hallazgos editoriales.</strong> La mayoría los redacta un proceso automático
            bajo reglas fijas, no una persona
            {authorship ? (
              <>
                : de los {authorship.total} publicados,{' '}
                <strong>{authorship.machine} los firma una máquina</strong> (
                {authorship.byMachineName.map(([name, n], i) => (
                  <span key={name}>
                    {i > 0 && ', '}
                    {n} <code>{name}</code>
                  </span>
                ))}
                )
              </>
            ) : null}
            . El pie de cada ficha dice quién la editó, y un nombre así significa que el título y el
            resumen los escribió una máquina. Cuando un veredicto merece contexto se escribe un
            hallazgo en <code>pleno-findings.json</code> con título, resumen (≥40 caracteres), citas
            verbatim y los documentos con los que se ha cotejado. Esa lista es lo que se cotejó, no
            lo que da la razón: el campo se llama <code>crossChecked</code> y recoge toda la
            evidencia que el verificador encontró para las citas del hallazgo, así que la ficha la
            publica bajo el rótulo neutro «documentos cotejados». Hasta el 5 de agosto de 2026 ese
            mismo campo se llamaba <code>corroboration</code> con exactamente el mismo contenido:{' '}
            <strong>ningún</strong> paso de este proceso comprueba que un documento respalde una
            frase —los cruces son coincidencias de importe o de palabras en un título— y el nombre
            afirmaba lo que la lista no había medido. Se renombró sin tocar una sola referencia,
            pero hasta el 9 de agosto de 2026 la instrucción que recibía el redactor automático
            seguía obligándole a citar al menos un registro «que corrobore», así que el resumen
            afirmaba en prosa el vínculo que el campo ya había dejado de afirmar. Hoy el resumen no
            puede decir que un expediente confirme, corrobore, respalde o desmienta una frase, y
            cuando ninguno de los cotejados viene a cuento —que es el caso normal— lo dice y se
            acaba ahí. El campo <code>contradiction</code> sólo admite documentos que el verificador
            marcó como incompatibles con la cita. Los hallazgos se publican con derecho de réplica
            literal para el grupo afectado.
          </li>
        </ol>
        <p style={{ margin: '12px 0 0', color: 'var(--ink70)' }}>
          <strong>Dos límites deterministas del redactor automático.</strong> El primero es la
          fecha: <strong>un expediente posterior a la sesión no se cruza con ella</strong>, porque
          no pudo estar sobre la mesa. Lo que se compara es la fecha <em>más temprana</em> que
          consta del expediente —la apertura de la licitación, no la adjudicación—, ya que un
          contrato se debate mientras se licita, a veces meses antes de adjudicarse; descartar por
          la fecha de adjudicación tiraría cruces buenos. Un expediente que no podemos fechar se
          conserva y se cuenta aparte: la lista es el registro de lo que se cotejó, no una selección
          de lo que encaja. El segundo es el filtro del registro público de declaraciones: el
          redactor <strong>sólo cita frases que ese filtro ya muestra</strong> en{' '}
          <a href="/plenos" style={{ color: 'var(--civic)' }}>
            /plenos
          </a>
          . El filtro retiene las acusaciones opinativas y las que no sostiene ningún dato; la vía
          prevista para publicarlas es que una persona las promueva a hallazgo, y una máquina no es
          esa persona.
        </p>
        <p style={{ margin: '12px 0 0', color: 'var(--ink70)' }}>
          <strong>Frontera legal para las acusaciones.</strong> El LLM clasifica cada acusación
          pública en tres subtipos:
        </p>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>
            <strong>factual</strong> — cita cifras, contratos o entidades concretas. Se contrasta
            con la base documental igual que una afirmación numérica.
          </li>
          <li>
            <strong>contra-datos</strong> — afirma algo directamente contradictorio con los datos
            publicados (p. ej. «X votó en contra de Y» cuando el registro de votos dice lo
            contrario). El verificador lo marca como <em>contradicho</em>.
          </li>
          <li>
            <strong>opinativa</strong> — valoración de carácter, intención o estilo («nunca
            escuchan», «siempre improvisan»). <strong>Nunca</strong> se verifica automáticamente.
            Sólo revisión editorial.
          </li>
        </ul>
      </Card>

      <Card id="citas-transcripcion" style={{ marginTop: 14, scrollMarginTop: 24 }}>
        <SectionHead
          eyebrow="Citas literales y transcripciones"
          title="Qué significa que una cita esté marcada"
        />
        <p style={{ margin: '8px 0 0', color: 'var(--ink70)' }}>
          Las citas entrecomilladas de{' '}
          <a href="/hallazgos" style={{ color: 'var(--civic)' }}>
            /hallazgos
          </a>{' '}
          se toman de la transcripción automática de la sesión, no de un acta ni de un taquígrafo.{' '}
          <strong>Varias sesiones se han transcrito una segunda vez</strong> con un motor mejor, y
          la transcripción antigua se conserva. Eso permite hacer una pregunta que antes no se podía
          hacer: ¿las palabras que publicamos siguen apareciendo en el mejor texto que tenemos de
          esa sesión?
        </p>
        <p style={{ margin: '10px 0 0', color: 'var(--ink70)' }}>
          Para muchas, la respuesta es <strong>no</strong>. En la mayoría de esas sesiones la
          transcripción nueva es bastante más extensa que la que sustituyó, así que la ausencia no
          es falta de cobertura: es que el primer motor oía mal. Transcribía <em>Riba-roja</em> como
          «Rivarroch» e inventaba palabras que no existen. El asunto se debatió —los temas aparecen
          en las dos pasadas—, pero{' '}
          <strong>
            la literalidad que hay entre comillas puede ser la del transcriptor y no la del concejal
          </strong>
          .
        </p>
        <p style={{ margin: '10px 0 0', color: 'var(--ink70)' }}>
          Cada cita afectada lleva su marca al lado, y hay dos porque son dos cosas distintas:
        </p>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: 'var(--ink70)' }}>
          <li>
            <strong>«no consta en la transcripción revisada»</strong> — la cita aparece palabra por
            palabra en la transcripción anterior y no en la vigente, y la vigente <em>no</em> es más
            corta. Lo que el lector debe concluir: el intercambio ocurrió, la atribución al grupo se
            mantiene, y el <em>tenor exacto</em> de las palabras no está confirmado contra el mejor
            texto disponible.
          </li>
          <li>
            <strong>«no hemos podido comprobarlo»</strong> — en esa sesión la transcripción vigente
            es <em>más corta</em> que la que sustituyó, así que la ausencia puede deberse al cambio
            de motor o a un tramo que la nueva pasada no cubre. No afirmamos ninguna de las dos
            cosas. Es un estado propio precisamente para no dejarlo caer en el anterior.
          </li>
        </ul>
        {quoteProvenance && (
          <p style={{ margin: '10px 0 0', color: 'var(--ink70)' }}>
            Hoy, de {quoteProvenance.quotes} literales publicados,{' '}
            <strong>{quoteProvenance.enVigente}</strong> aparecen en la transcripción vigente de su
            sesión, <strong>{quoteProvenance.soloEnSustituida}</strong> sólo en la que se sustituyó
            y <strong>{quoteProvenance.sinDeterminar}</strong> no se pueden situar. La cifra se lee
            del fichero derivado <code>finding-quote-provenance.json</code> en el momento de mostrar
            esta página, no está escrita aquí: cambia cada vez que se vuelve a transcribir una
            sesión.
          </p>
        )}
        <p style={{ margin: '10px 0 0', color: 'var(--ink70)' }}>
          <strong>No reescribimos ninguna cita por nuestra cuenta.</strong> El estado es un cálculo
          sobre dos ficheros —lo comprueba <code>npm run check:finding-quotes</code>, que se niega a
          pasar si la marca publicada deja de coincidir con las transcripciones—, pero elegir el
          pasaje equivalente en el texto nuevo es una decisión editorial sobre lo que dijo una
          persona. Esas citas están en una cola de reanclaje para revisión humana, y el cambio, si
          se hace, entra por la vía de corrección de siempre: queda en la bitácora pública de la
          ficha, con el texto anterior tachado y el motivo. Una cita que no aparece en{' '}
          <strong>ninguna</strong> de las dos transcripciones es un problema distinto —posible
          invención, no desgaste— y no se publica con marca: se bloquea.
        </p>
      </Card>

      <Card id="citas-contraste" style={{ marginTop: 14, scrollMarginTop: 24 }}>
        <SectionHead
          eyebrow="Citas y datos municipales"
          title="Por qué una acusación puede estar publicada sin contrastar"
        />
        <p style={{ margin: '8px 0 0', color: 'var(--ink70)' }}>
          Cada afirmación que extraemos de un pleno se coteja automáticamente con la base documental
          del ayuntamiento: contratos, subvenciones, presupuesto y promesas publicadas. Una{' '}
          <strong>puerta editorial</strong> decide después qué puede salir a la vista, y su regla es
          fallar del lado prudente: si el cotejo no encontró datos, la afirmación no se presenta
          como comprobada. En{' '}
          <a href="/plenos" style={{ color: 'var(--civic)' }}>
            el registro de declaraciones del pleno
          </a>{' '}
          esa puerta hace tres cosas distintas — publica la afirmación con sus datos, la publica
          etiquetada como sin contraste, o <strong>no la publica</strong>. Lo último se reserva a
          las acusaciones públicas que el cotejo no pudo respaldar, y a los desmentidos que asigna
          una máquina, que son pistas para un redactor y no veredictos.
        </p>
        <p style={{ margin: '10px 0 0', color: 'var(--ink70)' }}>
          <strong>
            Un hallazgo es la excepción que esa puerta concede, y la concede porque delante hay una
            persona.
          </strong>{' '}
          Promover una declaración a hallazgo es un acto editorial: alguien lee la frase, la sitúa
          en su contexto documental y firma. Por eso una cita puede aparecer en{' '}
          <a href="/hallazgos" style={{ color: 'var(--civic)' }}>
            /hallazgos
          </a>{' '}
          aunque la puerta la retenga en el registro.
        </p>
        <p style={{ margin: '10px 0 0', color: 'var(--ink70)' }}>
          En estas fichas <strong>la excepción la tomó una máquina</strong>. El proceso automático
          que redacta la mayoría de los hallazgos venía promoviendo declaraciones sin comprobar qué
          decía la puerta, y esta página no consultaba la puerta al pintarlas. Lo declaramos en vez
          de borrar nada: retirar citas ya publicadas sería un acto editorial mayor que el que las
          publicó, tomado por el mismo tipo de proceso. Las fichas afectadas están en una cola de
          revisión humana con una sola pregunta —<em>¿merece este hallazgo la excepción?</em>— y
          hasta que una persona la responda, cada cita afectada lleva su marca.
        </p>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: 'var(--ink70)' }}>
          <li>
            <strong>«acusación no contrastada»</strong> — lo que se afirma es una acusación pública
            sobre la gestión municipal y el cotejo no encontró ningún dato que la respalde{' '}
            <em>ni que la desmienta</em>. Lo que el lector debe concluir: se dijo, lo publicamos, y
            no sabemos si es cierto. No estamos diciendo que sea falsa.
          </li>
          <li>
            <strong>«sin contraste en los datos»</strong> — lo mismo, pero la afirmación no es una
            acusación. Se distingue a propósito: que no haya datos sobre una cifra de presupuesto y
            que no los haya sobre una adjudicación a dedo no significan lo mismo, y la puerta las
            separa por eso.
          </li>
        </ul>
        {quoteContrast && (
          <p style={{ margin: '10px 0 0', color: 'var(--ink70)' }}>
            Hoy, de {quoteContrast.citasConClaim} literales publicados en /hallazgos, el cotejo
            encontró datos sobre <strong>{quoteContrast.porContraste.shown}</strong>;{' '}
            <strong>{quoteContrast.porContraste.toggle}</strong> se publican sin contraste y{' '}
            <strong>{quoteContrast.porContraste.hidden}</strong> son acusaciones que la puerta
            retiene en el registro de declaraciones.{' '}
            <strong>{quoteContrast.hallazgosSinCitaMostrable}</strong> fichas no tienen ni una sola
            cita que la puerta publicaría, y {quoteContrast.hallazgosSoloConCitasOcultas} están
            hechas por entero de citas que retiene. Las cifras se leen del fichero derivado{' '}
            <code>finding-quote-provenance.json</code> al mostrar esta página, no están escritas
            aquí: cambian cada vez que el verificador vuelve a juzgar una declaración.
          </p>
        )}
        <p style={{ margin: '10px 0 0', color: 'var(--ink70)' }}>
          La marca es un cálculo, no una opinión: se obtiene preguntando a la misma puerta que
          gobierna el registro, sobre el mismo veredicto vigente del verificador —el determinista
          más las revisiones posteriores, que es lo que se publica—.{' '}
          <code>npm run check:relations</code> vuelve a preguntárselo en cada pasada nocturna y se
          pone en rojo si la marca publicada deja de coincidir, para que no pueda quedarse vieja en
          silencio. <strong>Ninguna cita se ha retirado ni reescrito</strong>, y el único escritor
          del fichero de hallazgos sigue siendo la CLI de correcciones, que deja el cambio en la
          bitácora pública de la ficha.
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Proceso de corrección" title="Cómo pedir una rectificación" />
        <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>
            Contacta con la redacción a través del canal indicado en{' '}
            <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
              /aviso-legal
            </a>
            .
          </li>
          <li>
            Incluye el <code>id</code> de la promesa o del hallazgo afectado y el enlace a la fuente
            que propones (programa electoral, acta de pleno, nota de prensa, BOE/BOPV).
          </li>
          <li>
            Te responderemos en 24 h hábiles con una de tres opciones: acepto la corrección,
            necesito más evidencia, o la rechazo con motivo público.
          </li>
          <li>Los cambios aplicados se registran en la bitácora interna del proyecto.</li>
        </ol>
      </Card>

      <Card id="laboratorio-prensa" style={{ marginTop: 22, scrollMarginTop: 24 }}>
        <SectionHead
          eyebrow="Laboratorio de prensa"
          title="Cómo auditamos noticias publicadas sobre Riba-roja"
        />
        <p style={{ marginTop: 8 }}>
          El{' '}
          <a href="/laboratorio" style={{ color: 'var(--civic)' }}>
            laboratorio
          </a>{' '}
          aplica el contraste editorial habitual de la verificación de hechos al flujo de prensa
          local. Cada afirmación citada se extrae de forma textual y se cruza, de forma
          determinista, contra el rastro de datos municipales públicos (PLACSP, TED, BDNS, BOE,
          presupuesto CONPREL, plenos, padrón INE, paro SEPE). La fuente primaria siempre gana.
        </p>

        <h3 style={{ marginTop: 16, fontSize: 15 }}>Escala de veredictos</h3>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li>
            <strong>Verificado.</strong> El número, fecha o hecho citado coincide con el documento
            municipal autoritativo (contrato adjudicado, convocatoria BDNS, gaceta BOE, asiento
            presupuestario).
          </li>
          <li>
            <strong>Parcial.</strong> Existe la entidad pero el detalle no coincide en su totalidad
            (importe distinto, fecha distinta, condicionantes no mencionados).
          </li>
          <li>
            <strong>Contradicho.</strong> El documento municipal contradice la afirmación. Estos
            veredictos requieren ≥1 enlace público a la pieza que contradice antes de poder
            promoverse a hallazgo crítico.
          </li>
          <li>
            <strong>Sin datos.</strong> El verificador no ha encontrado señal municipal. La ausencia
            de evidencia no es evidencia de falsedad: el hallazgo no se publica como crítico.
          </li>
          <li>
            <strong>Promesa repetida.</strong> La afirmación corresponde a un compromiso ya
            registrado en{' '}
            <a href="/promesas" style={{ color: 'var(--civic)' }}>
              /promesas
            </a>
            .
          </li>
        </ul>

        <h3 style={{ marginTop: 16, fontSize: 15 }}>Disciplina antilibellos</h3>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li>
            <strong>Acusaciones opinativas.</strong> Cuando el LLM extrae una "acusación pública"
            cuyo subtipo es <em>opinativa</em>, el verificador la marca <em>sin datos</em>
            automáticamente y nunca se publica como verificada o contradicha. Es política, no
            heurística.
          </li>
          <li>
            <strong>Qué se publica en el registro público.</strong> La página <code>/plenos</code>{' '}
            solo muestra declaraciones <em>contrastables con datos</em>: verificadas, parciales,
            contradichas o promesas ya documentadas. Las acusaciones de subtipo <em>opinativa</em>,
            y cualquier acusación que el verificador deja <em>sin datos</em>, no se publican en
            bruto: solo llegan al público si una persona curadora las convierte en un{' '}
            <a href="/hallazgos" style={{ color: 'var(--civic)' }}>
              hallazgo
            </a>{' '}
            editorial con contexto y derecho de réplica. Las declaraciones numéricas{' '}
            <em>sin datos</em> (no acusatorias) quedan ocultas tras el conmutador «mostrar sin
            datos». Este filtro se aplica al generar los datos, no solo en pantalla: el material no
            publicable no se incluye en los ficheros descargables.
          </li>
          <li>
            <strong>Atribución por medio, no por periodista.</strong> Los hallazgos editoriales
            citan únicamente al medio que publicó la pieza. Nunca al/a la firmante.
          </li>
          <li>
            <strong>La lista de documentos dice «cotejado», no «corrobora».</strong> Un hallazgo de
            prensa publica en <code>crossChecked</code> todos los documentos municipales contra los
            que se cruzaron sus citas, los respalden o no: <strong>ningún</strong> paso de este
            verificador comprueba que un expediente sostenga una frase. Los cruces son coincidencias
            de importe, de cifra contra la última serie publicada o de palabras en un título — la
            única fila de evidencia del laboratorio a día de hoy empareja un contrato del Plan de
            Movilidad Urbana Sostenible con una noticia sobre 61.000 € en artes escénicas. Hasta el
            5 de agosto de 2026 ese campo se llamaba <code>corroboration</code> con exactamente el
            mismo contenido, igual que en los hallazgos de pleno. Se renombró sin ninguna fila
            publicada dentro, así que aquí no cambió ninguna afirmación; el cambio es incompatible
            para quien leyera el fichero. El campo <code>contradiction</code> sólo admite documentos
            que el verificador marcó como incompatibles con la cita.
          </li>
          <li>
            <strong>Severity crítico exige una contradicción.</strong> El validador rechaza un
            hallazgo etiquetado como <code>critical</code> sin al menos una referencia de
            contradicción dateada y enlazada. Hasta el 5 de agosto de 2026 aceptaba en su lugar
            cualquier documento cotejado, de modo que esta regla —publicada desde el principio—
            nunca había llegado a exigirse: «hemos mirado estos expedientes» valía por «un
            expediente lo desmiente». Se apretó primero el validador de los hallazgos de pleno y,
            ese mismo día, el de los de prensa: entre ambos cambios esta página afirmó de los
            segundos algo que su código todavía no hacía. Hoy los dos dicen lo que dice esta página.
            No hay ningún hallazgo <code>critical</code> publicado.
          </li>
        </ul>

        <h3 style={{ marginTop: 16, fontSize: 15 }}>Preservación de fuentes (Wayback)</h3>
        <p style={{ marginTop: 6 }}>
          Una tarea diaria recorre cada URL citada y la archiva en Internet Archive (
          <code>web.archive.org</code>). El snapshot resultante se publica junto al enlace original
          en cada tarjeta del laboratorio, siguiendo la regla GIJN{' '}
          <em>"archivar antes de citar"</em>. Si el medio retira la pieza después, el lector aún
          puede acceder a la copia congelada.
        </p>

        <h3 style={{ marginTop: 16, fontSize: 15 }}>ClaimReview (schema.org)</h3>
        <p style={{ marginTop: 6 }}>
          Un hallazgo que lleva una <strong>referencia de contradicción</strong> se publica además
          como datos estructurados{' '}
          <a
            href="https://schema.org/ClaimReview"
            style={{ color: 'var(--civic)' }}
            rel="noopener noreferrer"
            target="_blank"
          >
            schema.org/ClaimReview
          </a>{' '}
          embebidos en la página. Es el mismo estándar W3C que la API de Google Fact Check Tools
          indexa — y del que <em>leemos</em> a Newtral, Maldita, EFE Verifica y AFP Factual. Al
          publicarlo, terceros pueden cosecharnos en igualdad de condiciones.
        </p>
        <p style={{ marginTop: 8 }}>
          <strong>Y sólo ése.</strong> El bloque incluye un <code>reviewRating</code>: nuestro
          veredicto sobre la frase citada, que en estas fichas son las palabras textuales de quien
          habló en el pleno. El único veredicto que este sitio puede sostener es el negativo —{' '}
          <code>contradiction</code> es el único campo del esquema que recoge una conclusión
          direccional sobre una cita, y, como se explica más arriba, ningún paso del verificador
          establece que un documento <em>respalde</em> una frase. Un hallazgo sin contradicción no
          emite marcado ninguno: preferimos no figurar en un índice de verificaciones a figurar con
          una verificación que no hemos hecho.
          {adjudication ? (
            <>
              {' '}
              De los {adjudication.total} hallazgos de pleno publicados,{' '}
              <strong>{adjudication.adjudicated} cumplen hoy ese requisito</strong>.
            </>
          ) : null}
        </p>
        <p style={{ marginTop: 8 }}>
          <strong>Corrección del 9 de agosto de 2026.</strong> Hasta esa fecha el{' '}
          <code>reviewRating</code> se derivaba de la <code>severity</code> del hallazgo:{' '}
          <code>informational</code> se publicaba como 5/5 «Verificado», <code>notable</code> como
          3/5 «Parcialmente verificado» y <code>critical</code> como 1/5. Son dos ejes distintos: la
          gravedad de <em>nuestro</em> hallazgo no dice nada sobre si la frase citada es cierta. Y
          como <code>informational</code> es lo que escriben los curadores automáticos, casi todos
          los hallazgos publicados llevaban sindicado, en formato legible por máquina, que
          CivicPulse había verificado las palabras del cargo citado — incluidas descalificaciones
          políticas, fragmentos mal segmentados de la transcripción y frases sobre personas con
          nombre y apellidos. No se había comprobado ninguna. El marcado se retiró de toda ficha sin
          contradicción el mismo día.
        </p>

        <h3 style={{ marginTop: 16, fontSize: 15 }}>Política de correcciones</h3>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li>
            Cada modificación posterior al primer publicado a <code>title</code>,{' '}
            <code>summary</code> o <code>severity</code> se aplica vía las herramientas{' '}
            <code>npm run correct-press-finding</code> / <code>correct-pleno-finding</code>, que
            añaden al hallazgo una fila permanente con texto original, texto corregido, motivo (≥20
            caracteres), editor/a y fecha ISO.
          </li>
          <li>
            En hallazgos de pleno, los campos de cita (<code>sourceClaimIds</code>, texto e id de
            cada cita) solo son corregibles cuando una <strong>re-transcripción</strong> sustituye
            el transcript de registro y re-genera los ids/verbatim de los claims citados
            («record-supersession»). Cada re-anclaje deja su fila pública en la bitácora. Editar una
            cita por cualquier otro motivo sigue prohibido: se retira y re-publica el hallazgo.
          </li>
          <li>
            La bitácora de correcciones se renderiza pública dentro de la tarjeta del hallazgo. El
            historial es <em>append-only</em>.
          </li>
          <li>
            Las refutaciones del medio citado pasan por el formulario público{' '}
            <code>finding-response</code> y se publican verbatim.
          </li>
        </ul>

        <h3 style={{ marginTop: 16, fontSize: 15 }}>Fuentes auditadas</h3>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 13.5 }}>
          <li>
            <strong>PLACSP / Gobierto</strong> — contratos municipales adjudicados y en licitación.
          </li>
          <li>
            <strong>TED (Tenders Electronic Daily)</strong> — contratos europeos sobre el umbral UE,
            incluido NextGenerationEU / DANA.
          </li>
          <li>
            <strong>BOE</strong> — gaceta oficial estatal (convenios, expropiaciones, subvenciones
            nominativas).
          </li>
          <li>
            <strong>BDNS</strong> — base nacional de subvenciones.
          </li>
          <li>
            <strong>Presupuesto CONPREL (MinHac)</strong> — capítulos de gasto e ingreso anuales.
          </li>
          <li>
            <strong>Plenos de Riba-roja</strong> — actas + votos transcritos.
          </li>
          <li>
            <strong>INE / SEPE</strong> — padrón y paro registrado mensual.
          </li>
          <li>
            <strong>Google Fact Check Tools + Maldita + Newtral RSS</strong> — fact-checks de
            terceros (cruzamos para "promesa repetida" y consenso externo).
          </li>
          <li>
            <strong>Catastro (OVC)</strong> — referencia catastral y dirección, sólo en revisión
            curatorial; no llega al verificador automático.
          </li>
        </ul>
        <p style={{ marginTop: 8, fontSize: 13.5 }}>
          La página{' '}
          <a href="/lab-health" style={{ color: 'var(--civic)' }}>
            Diagnóstico de fuentes →
          </a>{' '}
          publica en directo cuándo se generó cada snapshot, cuántas filas trae y si el scraper
          nocturno está funcionando. Permite auditar la frescura del corpus sin tener que ejecutar
          ningún script.
        </p>

        <h3 style={{ marginTop: 16, fontSize: 15 }}>Alineación con IFCN</h3>
        <p style={{ marginTop: 6, fontSize: 13.5 }}>
          Este apartado cubre los cinco pilares del Código de Principios de IFCN: (1) compromiso con
          la <em>no partisanía</em> y la equidad — el mismo criterio se aplica a cada bloc; (2)
          transparencia de fuentes — cada hallazgo cita documento + fecha + URL primaria; (3)
          transparencia de financiación — el proyecto no recibe financiación pública ni privada y su
          código es íntegramente público; (4) transparencia de metodología — esta sección; (5)
          política abierta y honesta de correcciones — la bitácora pública sobre el propio hallazgo.
        </p>
      </Card>

      <Card style={{ marginTop: 14 }} id="gasto-por-concejalia">
        <SectionHead
          eyebrow="Transparencia · gasto por concejalía"
          title="Cómo se asigna un contrato a un área"
        />
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink70)', marginTop: 8 }}>
          La cifra de contratación que aparece en cada ficha de{' '}
          <a href="/departamentos" style={{ color: 'var(--civic)' }}>
            /departamentos
          </a>{' '}
          se asigna por el <strong>código CPV</strong> —el vocabulario común europeo de
          contratación, que declara el propio órgano contratante junto al expediente—, no por la
          etiqueta de categoría del portal de datos. Se lee el código <strong>principal</strong>, el
          primero: el CPV se declara con el objeto del contrato delante y los accesorios detrás. Los
          códigos genéricos (98 «servicios diversos», 79 «servicios empresariales») no asignan área:
          dicen que el expediente no precisa de qué se trata, y eso no es una respuesta.
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink70)', marginTop: 8 }}>
          Antes se asignaba por la categoría del portal, que es una etiqueta gruesa. El{' '}
          <strong>4 de agosto de 2026</strong> se corrigió: 40 contratos figuraban bajo{' '}
          <em>Salud</em> sin ser gasto sanitario —alumbrado ornamental de Navidad, clases de inglés,
          vallado— por valor de unos 355.000 €, y se mostraban bajo el nombre de la concejala que
          responde por esa área. La cifra <strong>infra-estima a propósito</strong>: cuando los
          códigos declarados no nombran ningún área, el contrato queda sin asignar. Un cero
          significa «no atribuible», nunca «no se gastó».
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead
          eyebrow="Transparencia · mapa del gasto"
          title="Mapa del gasto: qué situamos y qué no"
        />
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink70)', marginTop: 8 }}>
          No existe un campo de «lugar de ejecución» en la fuente (Gobierto/PLACSP): el título del
          contrato es la única señal de ubicación. Por eso situamos un contrato en el mapa solo
          cuando su título <strong>nombra</strong> un lugar concreto —una calle o camino, un
          equipamiento público (colegio, polideportivo, parque), una urbanización o un barrio— y lo
          cotejamos contra un callejero de OpenStreetMap y el índice de equipamientos. Cada punto
          declara su procedencia («situado por «…»»). En los contratos por <strong>lotes</strong>,
          cuyo título es solo el nombre del lote («Obra completa»), consultamos además el objeto de
          la licitación madre — y solo lo usamos cuando nombra <strong>un único</strong> lugar: si
          la licitación enumera los sitios de varios lotes, no se puede saber qué lote va dónde y
          preferimos no situar. El pin declara el objeto de la licitación («Lote de: …»).
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink70)', marginTop: 8 }}>
          El emparejamiento es deliberadamente <strong>conservador</strong> —preferimos no situar un
          contrato antes que situarlo mal—: descartamos el nombre del municipio y de la provincia
          («Riba-roja de Túria», «València», que aparecen en casi todas las direcciones), las
          palabras genéricas de expediente («social», «municipal», «pública», «mayor»), y solo
          fiamos una calle cuando el título lleva un indicador de vía (C/, Camino, Ctra.). Un
          equipamiento solo se sitúa para contratos de <strong>obra</strong>: un «suministro para la
          Policía Local» es <em>para</em> el servicio, no una obra <em>en</em> el edificio. El gasto
          sin lugar citado (servicios, suministros y obras sin ubicación) nunca se reparte por el
          mapa.
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink70)', marginTop: 8 }}>
          Cada punto abre la ficha del contrato con el dato que ya publica el expediente:
          adjudicatario, importe de licitación → adjudicación (la baja), objeto (código CPV
          traducido), procedimiento, número de licitadores y plazo. La etiqueta CPV usa el
          vocabulario oficial CPV-2008 de la UE.
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink70)', marginTop: 8 }}>
          Para los títulos que el emparejamiento automático no consigue situar (abreviaturas,
          castellano/valenciano), un modelo de lenguaje propone el nombre del lugar citado. Ese
          nombre se resuelve <strong>siempre</strong> contra el mismo callejero —el modelo nunca
          inventa coordenadas— y la propuesta <strong>no aparece en el mapa</strong> hasta que una
          persona la revisa y la aprueba. Es una ayuda de cobertura, no una fuente: el listado
          automático nunca sustituye a la revisión humana.
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink70)', marginTop: 8 }}>
          El callejero se completa con un <strong>suplemento curado</strong> de lugares que
          OpenStreetMap aún no recoge o solo recoge en valenciano (el Mercat Municipal, el Castell,
          el Pavelló, polígonos y urbanizaciones): cada entrada es editada a mano, cita su
          procedencia (el objeto OSM o la página oficial de la que sale la coordenada) y pasa por
          las mismas vallas conservadoras del emparejador. Sin procedencia verificable, el lugar no
          entra.
        </p>
      </Card>

      <p style={{ marginTop: 22, fontSize: 12, color: 'var(--ink50)' }}>
        Última revisión de este documento: 14 de julio de 2026 (suplemento curado del callejero con
        procedencia obligatoria para lugares ausentes de OSM). Cambios futuros sólo mediante PR
        público.
      </p>
    </div>
  )
}
