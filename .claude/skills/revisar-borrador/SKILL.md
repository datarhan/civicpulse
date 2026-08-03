---
name: revisar-borrador
description: Revisar afirmación por afirmación un borrador que nombra a una persona viva, ANTES de publicarlo — ¿el extracto citado sostiene la frase, o solo se le parece? Cubre biografías del agente periodista, hallazgos de pleno, cambios de estado de promesas y reportajes. Úsalo antes de promote-report, promote-claim, apply-promise-draft o de publicar un reportaje, y cuando alguien pregunte «¿puedo publicar esto?» o «revisa este borrador».
---

# Revisar un borrador antes de publicarlo

De los últimos 300 commits, **27 arreglos** cayeron sobre superficies que
nombran a un cargo electo. Todos los detectó una persona leyendo el borrador
contra sus fuentes; ninguno una comprobación. Este procedimiento es esa lectura,
escrita para que no dependa de acordarse.

Lo que busca no es «¿el dato es correcto?» —para eso están las diez
comprobaciones deterministas— sino **«¿la fuente citada dice lo que la frase
afirma?»**. Divergen constantemente: el extracto está bien, la cita resuelve, y
la frase concluye algo que el extracto no sostiene.

## Paso 0 — Lo determinista primero, siempre

```bash
npm run check:citations -- --draft editorial/journalist-drafts/<archivo>.draft.json
```

Si sale BLOCKED, **para aquí**. Una cita huérfana, una cita textual que no está
en su extracto o una URL muerta se arreglan sin gastar un solo token de
criterio, y revisar el resto de un borrador cuyas citas no resuelven es tiempo
tirado.

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
literalmente, y cuál de las cuatro clases es. **No corrijas el borrador tú.**
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
