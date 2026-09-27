---
name: revisar-borrador
description: Revisar afirmación por afirmación un borrador que nombra a una persona viva, ANTES de publicarlo — ¿el extracto citado sostiene la frase, o solo se le parece? Cubre biografías del agente periodista, hallazgos de pleno, cambios de estado de promesas y reportajes. Úsalo antes de promote-report, promote-claim, apply-promise-draft o de publicar un reportaje, y cuando alguien pregunte «¿puedo publicar esto?» o «revisa este borrador».
---

# Revisar un borrador antes de publicarlo

En la auditoría del 03-08-2026, de los 300 commits anteriores, **27 arreglos**
cayeron sobre superficies que nombran a un cargo electo. Todos los detectó una
persona leyendo el borrador contra sus fuentes; ninguno una comprobación. Este
procedimiento es esa lectura, escrita para que no dependa de acordarse.

Lo que busca no es «¿el dato es correcto?» —para eso están las comprobaciones
deterministas— sino **«¿la fuente citada dice lo que la frase afirma?»**. Divergen constantemente: el extracto está bien, la cita resuelve, y
la frase concluye algo que el extracto no sostiene.

## Paso 0 — Lo determinista primero, siempre

Cada clase de borrador tiene su puerta, y no son intercambiables:

| Borrador                                                                     | Puerta determinista                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| biografía del agente periodista (`editorial/journalist-drafts/<id>.draft.json`) | `npm run check:citations -- --draft editorial/journalist-drafts/<id>.draft.json`: sale 1 si algo BLOQUEA                                                                                                                         |
| hallazgo de pleno                                                            | `npm run promote-claim -- <claimId…> --title "…" --summary "…" --edit`: valida el esquema entero (cita literal ≥20, resumen ≥40, un `critical` exige ≥1 referencia de contradicción) y deja el candidato en `/tmp/finding-*.json` sin publicar. No abre ninguna URL: las de sus evidencias, a mano |
| cambio de estado de una promesa                                              | el validador de `apply-promise-draft`: un estado fuera de `V1_STATUSES` (`documentada`, `en-verificacion`) exige ≥1 evidencia. No tiene modo de prueba: mira la evidencia del borrador antes de aplicarlo                              |
| reportaje                                                                    | no hay puerta de citas. Si la pieza tiene infografía, `npx vitest run tests/infografia-sync.test.js`; las citas se leen a mano en el paso 1                                                                                           |

`check:citations -- --draft` lee la forma de un informe del agente. Con un
hallazgo se cae con un `TypeError` y sale 1, y eso **no es un BLOQUEO**: es la
puerta equivocada, que no ha comprobado nada.

Si la puerta que toca BLOQUEA, **para aquí**. Una cita huérfana, una cita
textual que no está en su extracto o una URL muerta se arreglan sin gastar un
solo token de criterio, y revisar el resto de un borrador cuyas citas no
resuelven es tiempo tirado.

Si un documento se ha movido (el ayuntamiento reestructuró su portal en agosto
de 2026 y tumbó 68 citas de golpe), no edites el JSON: `npm run
repoint-source-url`, que se niega a mover una cita salvo que el extracto siga
literal en el documento nuevo.

## Paso 1 — Afirmación por afirmación

Para **cada** frase de cada sección `narrative`, localiza el extracto de la
fuente que cita y responde en voz alta:

1. **¿Lo sostiene o solo se le parece?** El extracto puede mencionar al sujeto y
   al hecho sin ligarlos. Esta es la clase que obligó a escribir una regla de
   proximidad al sujeto, y la que retiró una acusación al PSOE que ningún dato
   sostenía.
2. **¿Coincide el tiempo verbal?** Un extracto en futuro («se aprobará», «está
   previsto») no sostiene una frase en pasado. Un PEF *anunciado* se publicó
   como PEF *aprobado*.
3. **¿Falta algo que cambia la conclusión?** No basta con que lo escrito sea
   cierto. La pieza de la DANA omitía al mayor adjudicatario de la
   reconstrucción: cada cifra correcta, la conclusión falsa.
4. **¿Nombra a una persona con prueba de bloque?** `speakerGroup` es
   PSOE/PP/VOX/Compromís o `null`. Cruzar a un individuo lo hace un curador, por
   hallazgo, con prueba propia.

## Paso 2 — Las notas del curador son públicas

`curatorNotes` se publica. Tres biografías tuvieron que corregirse el mismo día
(31-07-2026) porque las notas explicaban **qué se había excluido y por qué** —
homonimia, una causa que resultó ser de otra persona— y así nombraban
exactamente aquello que la exclusión protegía.

Regla: la nota describe **el criterio**, nunca el material descartado.

- ✅ «Se han descartado fuentes que no acreditan identidad con el sujeto.»
- ❌ «Se ha descartado una detención de 2006 que resultó ser de otro Rafael Gómez.»

## Paso 3 — Informa, no edites

Una tabla por afirmación señalada: qué frase, qué fuente, qué dice el extracto
literalmente, qué clase de [`references/failure-taxonomy.md`](references/failure-taxonomy.md)
es y, si es D, cuál de las cuatro preguntas del paso 1 falla. En una biografía,
A–C ya las ha parado `check:citations`; en las demás clases de borrador ninguna
puerta abre las URL ni busca la cita en su extracto antes de publicar, así que
esas tres también se miran aquí. **No corrijas el borrador tú.**
Decide una persona, igual que en `revisar-superficies`.

Si la pieza **ya está publicada**, no la reescribas en silencio: `npm run
correct-journalist-report` o `correct-pleno-finding`, que dejan constancia.
Nada automático reescribe prosa publicada.

## Qué NO hace

- No juzga estilo ni longitud.
- No decide si la pieza es interesante.
- No sustituye a `--ack-legal-review`: que las citas resuelvan no es que la
  pieza sea segura.
- No confía en los `warnings` del propio agente. La pasada de verificación del
  LLM es **falsa en ambos sentidos**: en el borrador de Raga v4 avisó de que
  cinco `sourceIds` no existían en las fuentes; los cinco existían. Comprueba
  cada aviso contra el JSON antes de actuar.

## El detalle

Los 27 casos reales, agrupados por clase, en
[`references/failure-taxonomy.md`](references/failure-taxonomy.md). Léelo cuando
no tengas claro en qué clase cae algo, no antes.
