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
            responder con una cita textual a través de la{' '}
            <a
              href="https://github.com/datarhan/civicpulse/issues/new/choose"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--civic)' }}
            >
              plantilla de respuesta
            </a>
            .
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
          Los concejales hacen afirmaciones en las intervenciones del pleno: cifras
          presupuestarias, obras en marcha, convenios cerrados, promesas futuras. Algunas son
          verificables contra documentos públicos; otras son opinión política. Este sistema,
          visible en el apartado{' '}
          <a href="/plenos" style={{ color: 'var(--civic)' }}>
            /plenos
          </a>
          , procesa cada declaración en tres pasos:
        </p>
        <ol style={{ margin: '10px 0 0', paddingLeft: 20 }}>
          <li>
            <strong>Extracción automática</strong> (LLM, requiere aprobación humana). Sobre la
            transcripción del vídeo del pleno, el modelo extrae <em>verbatim</em> las
            afirmaciones y las clasifica en cinco tipos:{' '}
            <code>promesa</code> · <code>afirmacion_numerica</code> · <code>cita_obra</code> ·{' '}
            <code>cita_convenio</code> · <code>acusacion_publica</code>. Cada registro se guarda
            en <code>pleno-claims-suggestions.json</code> con atribución a nivel de grupo
            municipal (nunca a personas — por fiabilidad de la transcripción Whisper).
          </li>
          <li>
            <strong>Contraste determinista</strong> (sin LLM) contra la base de datos municipal:
            contratos (<code>tenders.json</code>), subvenciones (<code>bdns.json</code>),
            presupuesto (<code>budget.json</code>) y promesas documentadas (
            <code>promises.json</code>). El verificador emite uno de cinco veredictos:
            <ul style={{ marginTop: 6 }}>
              <li>
                <strong>verificado</strong> — coincidencia fuerte (importe + entidad) en alguna
                base documental.
              </li>
              <li>
                <strong>parcial</strong> — coincidencia moderada; entidad o importe difieren
                algo.
              </li>
              <li>
                <strong>contradicho</strong> — la base documental registra un importe distinto,
                o el discurso afirma «obra terminada» cuando la licitación sigue abierta.
              </li>
              <li>
                <strong>sin-datos</strong> — no hay registro en las bases abiertas. Puede ser
                cierto, pero no atestado (muy frecuente: reconocimientos extrajudiciales,
                operaciones internas).
              </li>
              <li>
                <strong>promesa-repetida</strong> — la promesa coincide con una ya documentada
                en el tracker de años anteriores.
              </li>
            </ul>
          </li>
          <li>
            <strong>Hallazgos editoriales</strong> curados por una persona. Cuando un veredicto
            merece contexto, un curador escribe un hallazgo en{' '}
            <code>pleno-findings.json</code> con título, resumen (≥40 caracteres), citas
            verbatim y referencias explícitas de corroboración o contradicción. Los hallazgos
            se publican con derecho de réplica literal para el grupo afectado.
          </li>
        </ol>
        <p style={{ margin: '12px 0 0', color: 'var(--ink70)' }}>
          <strong>Frontera legal para las acusaciones.</strong> El LLM clasifica cada acusación
          pública en tres subtipos:
        </p>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>
            <strong>factual</strong> — cita cifras, contratos o entidades concretas. Se
            contrasta con la base documental igual que una afirmación numérica.
          </li>
          <li>
            <strong>contra-datos</strong> — afirma algo directamente contradictorio con los
            datos publicados (p. ej. «X votó en contra de Y» cuando el registro de votos dice
            lo contrario). El verificador lo marca como <em>contradicho</em>.
          </li>
          <li>
            <strong>opinativa</strong> — valoración de carácter, intención o estilo («nunca
            escuchan», «siempre improvisan»). <strong>Nunca</strong> se verifica
            automáticamente. Sólo revisión editorial.
          </li>
        </ul>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Proceso de corrección" title="Cómo pedir una rectificación" />
        <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>
            Abre una issue pública en{' '}
            <a
              href="https://github.com/datarhan/civicpulse/issues/new?labels=correccion-promesa"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--civic)' }}
            >
              github.com/datarhan/civicpulse
            </a>{' '}
            con la etiqueta <code>correccion-promesa</code>.
          </li>
          <li>
            Incluye el <code>id</code> de la promesa afectada y el enlace a la fuente que propones
            (programa electoral, acta de pleno, nota de prensa, BOE/BOPV).
          </li>
          <li>
            Te responderemos en 24 h hábiles con una de tres opciones: acepto la corrección,
            necesito más evidencia, o la rechazo con motivo público.
          </li>
          <li>
            Los cambios aplicados aparecen reflejados en el historial git del repositorio
            —auditables por cualquiera.
          </li>
        </ol>
      </Card>

      <p style={{ marginTop: 22, fontSize: 12, color: 'var(--ink50)' }}>
        Última revisión de este documento: 21 de abril de 2026 (añadida la sección "Plazos vencidos
        · señalización editorial"). Cambios futuros sólo mediante PR público.
      </p>
    </div>
  )
}
