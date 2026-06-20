import { Card, SectionHead } from '../components/Primitives'

export default function Metodologia() {
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
            <em>documentada</em>. Sólo un curador humano puede subir un estado a{' '}
            <em>cumplida / parcial / no-ejecutada / inviable</em>, y únicamente con una cadena de
            evidencia dateada y enlazada.
          </li>
          <li>
            <strong>Transparencia del algoritmo.</strong> Un motor de inferencia nocturno escanea
            prensa y plenos y emite <em>propuestas</em> con su cadena de razonamiento. Las
            propuestas se muestran claramente etiquetadas como "propuesta automática · pendiente de
            revisión humana" y nunca sustituyen al estado publicado.
          </li>
          <li>
            <strong>Derecho de rectificación.</strong> Cualquier persona, colectivo o partido puede
            proponer correcciones mediante issue pública en GitHub. Plazo de revisión: 24 h. Plazo
            de resolución: 72 h.
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
          <li>No publica cambios de estado sin aprobación humana.</li>
          <li>
            No propone nunca <em>cumplida</em>, <em>no-ejecutada</em> ni <em>inviable</em>. Máximo:{' '}
            <em>en-progreso</em> cuando encuentra verbos de avance en una fuente periodística.
          </li>
          <li>
            No genera titulares ni resúmenes originales. Sólo cita la cabecera literal de las
            noticias encontradas.
          </li>
          <li>No puntúa ni rankea partidos por tasa de cumplimiento.</li>
          <li>
            Durante el periodo electoral oficial (LOREG art. 50) el motor sigue ejecutándose pero
            sus propuestas no pueden aplicarse al estado publicado.
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
            <strong>Los votos de pleno son el hecho primario.</strong> Se transcriben del acta
            oficial y son el material más verificable. Las promesas electorales son secundarias.
          </li>
          <li>
            <strong>El plazo debe venir del acta.</strong> Para los votos de pleno, un{' '}
            <code>dueBy</code> sólo se publica acompañado de una cita verbatim del acuerdo (
            <code>dueBySource</code>, ≥20 caracteres). Sin cita literal no hay plazo.
          </li>
          <li>
            <strong>No cambiamos estados automáticamente.</strong> El aviso de plazo vencido es una
            señalización editorial; el estado de la promesa o del voto no pasa a{' '}
            <em>no-ejecutada</em> sin curación humana (mismo principio que la sección anterior).
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
        </ul>
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
            <strong>Extracción automática</strong> (LLM, requiere aprobación humana). Sobre la
            transcripción del vídeo del pleno, el modelo extrae <em>verbatim</em> las afirmaciones y
            las clasifica en cinco tipos: <code>promesa</code> · <code>afirmacion_numerica</code> ·{' '}
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
                discurso afirma «obra terminada» cuando la licitación sigue abierta.
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
              Segunda pasada con LLM sobre los <code>sin-datos</code>
            </strong>{' '}
            (opcional, sólo cuando el contraste determinista no encontró nada). Tomamos un máximo de
            8 candidatos del corpus municipal (contratos, subvenciones, promesas previas)
            seleccionados por una combinación de coincidencia léxica y semántica (cosine sobre
            embeddings), y le pedimos al modelo que decida si alguno corrobora o contradice la
            afirmación.{' '}
            <strong>El LLM sólo puede citar por índice de la lista que le entregamos</strong> —
            nunca puede inventar una URL ni un contrato. Además, cada cita debe tener la forma{' '}
            <code>{'<dataset>[i].<campo>=<valor>'}</code> y el valor citado debe aparecer{' '}
            <em>literalmente</em> en el extracto del candidato que vio el modelo. Si la cita es
            sintácticamente inválida o el valor no aparece verbatim, el sistema la descarta como
            alucinación. Esta tubería se reporta en cada ejecución (telemetría:{' '}
            <code>missing-cite</code>, <code>cite-not-in-snippet</code>) para auditar deriva del
            modelo.
          </li>
          <li>
            <strong>Hallazgos editoriales</strong> curados por una persona. Cuando un veredicto
            merece contexto, un curador escribe un hallazgo en <code>pleno-findings.json</code> con
            título, resumen (≥40 caracteres), citas verbatim y referencias explícitas de
            corroboración o contradicción. Los hallazgos se publican con derecho de réplica literal
            para el grupo afectado.
          </li>
        </ol>
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
            <strong>Atribución por medio, no por periodista.</strong> Los hallazgos editoriales
            citan únicamente al medio que publicó la pieza. Nunca al/a la firmante.
          </li>
          <li>
            <strong>Severity crítico exige evidencia.</strong> El validador rechaza un hallazgo
            etiquetado como <code>critical</code> sin al menos una referencia de contradicción
            dateada y enlazada.
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
          Publicamos cada hallazgo editorial con datos estructurados{' '}
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

        <h3 style={{ marginTop: 16, fontSize: 15 }}>Política de correcciones</h3>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li>
            Cada modificación posterior al primer publicado a <code>title</code>,{' '}
            <code>summary</code> o <code>severity</code> se aplica vía la herramienta{' '}
            <code>npm run correct-press-finding</code>, que añade al hallazgo una fila permanente
            con texto original, texto corregido, motivo (≥20 caracteres), editor/a y fecha ISO.
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

      <Card style={{ marginTop: 14 }}>
        <SectionHead
          eyebrow="Transparencia · /presupuesto"
          title="Mapa del gasto: qué situamos y qué no"
        />
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink70)', marginTop: 8 }}>
          Situamos en el mapa únicamente los contratos cuyo título nombra una zona concreta
          (urbanización, polígono o paraje). No existe un campo de «lugar de ejecución» en la fuente
          (Gobierto/PLACSP), así que el título es la única señal disponible. El medidor de cobertura
          muestra qué parte del importe adjudicado se puede situar y qué parte no: el gasto sin
          ubicación (servicios, suministros y obras sin lugar citado) nunca se reparte por zonas. Un
          contrato que cita dos zonas aparece en ambas, pero cuenta una sola vez en el total
          situado.
        </p>
      </Card>

      <p style={{ marginTop: 22, fontSize: 12, color: 'var(--ink50)' }}>
        Última revisión de este documento: 21 de mayo de 2026 (añadida la sección "Laboratorio de
        prensa" con escala de veredictos, disciplina antilibellos, Wayback, ClaimReview, bitácora de
        correcciones y mapeo IFCN). Cambios futuros sólo mediante PR público.
      </p>
    </div>
  )
}
