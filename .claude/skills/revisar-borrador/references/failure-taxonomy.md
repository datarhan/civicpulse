# Las 27 formas en que esto ya ha salido mal

Commits `fix` sobre superficies que nombran a un cargo electo, de los últimos
300 commits (auditado 2026-08-03). No son categorías teóricas: cada fila es un
arreglo real, con su hash.

Se agrupan en cinco clases. **Las tres primeras las coge `check:citations`
gratis**; las dos últimas necesitan criterio, y son las que este skill lee.

---

## Clase A · La cita no resuelve — *determinista*

| Commit | Qué pasó |
|---|---|
| `722bc94` | Dos promesas citaban al PSOE con un enlace que nunca existió. |
| `e704b04` | El LLM emitió filas de cuentas con URLs inválidas; se descartan al construir la sección. |
| `a35c4ac` | La tabla de confianza por dominio gobernaba unas llamadas sí y otras no. |
| `b3324ee` | Prueba legal sin forma verificable. |
| — | **2026-08-03**: dos actas de 2023 movidas por el ayuntamiento tumbaron 68 citas en 12 de 21 biografías. Ni un test, ni un scraper, ni ninguna de las diez comprobaciones se enteró. |

Lo coge: `check:citations` (`url-dead`, `orphan-source-ref`).
Lo arregla: `repoint-source-url` si el documento se movió; editar el borrador si
la cita nunca fue buena.

---

## Clase B · La prueba no existe o no se puede volver a verificar — *determinista*

| Commit | Qué pasó |
|---|---|
| `8989c3b` | Se retiraron **dos corroboraciones documentales que no existían**. |
| `0d7d242` | El registro legal se emitía como prosa, sin estructura: imposible de comprobar después. |
| `54767d3` | El verificador leía importes por nombres de campo inexistentes: 0 de 1.231 filas. |

Lo coge: `check:citations` (`source-without-evidence`, `quote-not-in-excerpt`).

---

## Clase C · La cita textual no está en lo que cita — *determinista*

| Commit | Qué pasó |
|---|---|
| `0c2baa6` | La comprobación de citas anclaba en las **primeras 8 palabras**: cuatro citas literales se reportaron como inventadas porque un curador había recortado el principio. |
| `4fdc5d7` | Se recuperó la transcripción que respaldaba 26 frases publicadas. |

Lo coge: `check:citations` (`quote-not-in-excerpt`), con `quoteAppearsIn`, que
desliza la ventana en vez de anclar al principio.

**Cuidado con el falso positivo.** Es la trampa de esta clase: 11 de 68 citas
reales fallaron una comparación literal ingenua contra el PDF del acta —
viñetas que `pdftotext` deja solas en su línea, un número de página metido a
mitad de lista. Mismas palabras, otra maquetación. Una comprobación equivocada
el 16% de las veces enseña a ignorarla, y entonces no protege nada.

---

## Clase D · El extracto se PARECE a la frase pero no la SOSTIENE — *criterio*

| Commit | Qué pasó |
|---|---|
| `26a430f` | Regla de proximidad al sujeto: mata la clase entera de falsa asociación. |
| `c66cf93` | Retirada **una acusación al PSOE que no sostenía ningún dato**. |
| `a8d10c6` | Corrección pública: cláusula «Edifican Heredado» retirada. |
| `c2b61c6` | Un PEF **anunciado en futuro** publicado como registro. |
| `faeda51` | «Contradicho» exigía una coincidencia que no lo era: el alquiler de vivienda refutado por el alquiler de un camión de basura. |
| `d4141eb` | `Otro` nombraba a un concejal **por eliminación**: con un solo concejal debajo del centinela, decir «Otro» era decir su nombre. |
| `959dc7c` | La pieza DANA **omitía al mayor adjudicatario** de la reconstrucción. Cada cifra correcta; la conclusión, falsa. |
| `5899307`, `63a24a8`, `eed6887` | Las mismas correcciones, hechas visibles en vez de solo anotadas. |
| `3e40017` | Relaciones documentadas y comprobaciones nominales. |
| `e099f53` | «Elección y nombramiento»: cómo accedió realmente el sujeto al cargo. |
| `166cb34` | Claridad editorial de cronología, citas, lagunas y advertencias. |

Nadie lo coge automáticamente. **Esto es el paso 1 del skill.**

Las cuatro preguntas, en orden de cuánto daño hacen:

1. ¿Liga el extracto al sujeto **y** al hecho, o solo los menciona?
2. ¿Coincide el tiempo verbal? Futuro no sostiene pasado.
3. ¿Falta algo cuya ausencia cambia la conclusión?
4. ¿Nombra a un individuo con prueba que solo es de bloque?

---

## Clase E · Publicar de más — *criterio*

| Commit | Qué pasó |
|---|---|
| `cbfd6cd`, `78226a6`, `d879e91` | **Tres biografías el mismo día**: `curatorNotes` explicaba qué se había excluido, y al explicarlo lo nombraba. |
| `b4d811a` | La regla resultante, endurecida en CLAUDE.md. |
| `cb7c56d` | Se dejaron de servir borradores sin revisar desde el sitio público. |
| `e608605` | Rutas de borradores obsoletas en los comentarios, apuntando a donde ya no están. |
| `23c151b` | Que el pipeline no pueda regenerar los bloques ilegibles. |

La regla de `curatorNotes`: describe **el criterio**, nunca el material
descartado. Si al leer la nota un lector puede reconstruir lo que se excluyó, la
exclusión no ha servido de nada.

---

## Por qué el reparto es así

Determinista antes que probabilístico, siempre — es el orden de la escalera de
`docs/DATA_INTEGRITY.md`, y aquí es además el orden barato.

Un ejemplo de por qué no se puede confiar la clase A a un modelo: en el borrador
`a-robert-raga-bio-v4`, la pasada de verificación del LLM avisó de que
`src-019`, `src-020`, `src-021`, `src-024` y `src-025` estaban «ausentes de las
fuentes proporcionadas». Los cinco estaban. `check:citations` responde a esa
pregunta en milisegundos, sin equivocarse y sin coste.

El corolario es incómodo y va en las dos direcciones: **audita cada aviso del
agente contra el JSON antes de actuar**, porque los falsos negativos se ven
igual de bien que los verdaderos.
