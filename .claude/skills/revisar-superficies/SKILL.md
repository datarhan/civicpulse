---
name: revisar-superficies
description: Read CivicPulse pages as a visitor would and flag anything the data does not support — misleading juxtapositions, sentinels published as facts, "0" that means "not recorded", copy that describes retired behaviour. Also carries the procedure for the commonest finding here: two figures side by side that are BOTH correct and that the reader cannot reconcile, because they come from different fields or universes. Use after changing a data figure, a KPI, page copy, or a pipeline, and before publishing anything. Triggers on "revisar superficies", "¿la portada dice algo falso?", "review the pages as a reader", "arriba pone X y abajo Y", "estas dos cifras no cuadran".
---

# Revisar superficies como lector

Cinco comprobaciones cruzadas responden «¿el dato es correcto?». Ninguna responde
«¿la página dice algo verdadero?». Divergen constantemente: el 2026-08-02, cinco
defectos publicados tenían todos su dato bien y la frase mal.

**Cuándo se ejecuta esto:** después de mover una cifra, de tocar un KPI, de
cambiar copy, o de modificar un pipeline que alguna página describe. Es
exactamente cuando la prosa se queda atrás.

## Procedimiento

1. **Levanta el preview** (el agente lee la página RENDERIZADA, no el JSX — el
   defecto que se busca solo existe una vez montada la página):

   ```bash
   npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort &
   ```

2. **Ejecuta la revisión** a coste cero:

   ```bash
   set -a; . ./.env; set +a
   env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY \
       GEMINI_BIN=/nonexistent-disabled AGY_BIN=/nonexistent-disabled \
       LLM_BACKEND=claude-code LLM_CONCURRENCY=1 \
       npm run review:surfaces -- /            # o sin ruta, para el set por defecto
   ```

3. **Verifica CADA señalamiento antes de tocar nada.** El agente cita literal —si
   parafrasea, el grounding lo descarta— pero puede estar equivocado sobre la
   implicación. Comprueba la cifra contra el snapshot tú mismo. En su primera
   ejecución acertó las dos: una la había arreglado un humano en otro sitio de la
   misma página, y la otra (`804` contratos bajo «CONTRATOS ADJUDICADOS» cuando
   adjudicados son 698) se le había pasado a un humano que ya había auditado esa
   página.

4. **Arregla la frase, no el dato** — salvo que el dato esté mal. La mayoría de
   estos defectos se corrigen añadiendo la unidad que falta: un periodo, un
   «acumulado», un «—» donde había un «0».

5. **Si la página es prosa publicada** (reportaje, /metodologia, un hallazgo), NO
   la reescribas en silencio: usa el flujo de correcciones
   (`meta.correcciones`, `npm run correct-pleno-finding`). Reescribir una
   investigación publicada sin dejar constancia es peor que el error.

## Cuando las dos cifras son CIERTAS

La familia más repetida de este sitio, y la que peor se responde a bote pronto.
El señalamiento dice «arriba pone X y abajo Y», compruebas las dos contra el
snapshot, y **las dos son correctas**. Salen de campos o de universos distintos.

Las DOS filas de «Lo que cazó el día que se escribió» son de esta familia —«€41,6M»
anual junto a «€68,0M» acumulado de diez años, y «804 · 68 M€»— y ha vuelto
cuatro veces más. Cada cifra es la medida del día del arreglo, no una cifra viva:

| Página         | El par                                                          | El puente                                                         | PR  |
| -------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- | --- |
| `/presupuesto` | pestaña 124.349.688,09 € · universo del mapa 124.039.832,54 €   | 5 firmados sin importe de adjudicación                            | #78 |
| `/presupuesto` | «el presupuesto que se aprobó», en singular, con DOS publicados | CONPREL da 905.517,35 € donde la ejecución da 0 €                 | #78 |
| `/`            | 711 contratos con el dinero de 706                              | los 5 sin importe publicado                                       | #80 |
| `/empleo`      | KPI 38 · gráfico «Dónde» 26                                     | 12 con localidad Riba-roja y sin `detail.municipio`: 26 + 12 = 38 | #84 |

Ninguna guarda de datos lo ve, porque las dos cifras son ciertas. Lo levanta
siempre esta revisión, y por eso el procedimiento vive aquí.

1. **No elijas todavía.** El reflejo es borrar una de las dos o cuadrarlas a la
   fuerza; las dos cosas tiran información que el lector necesita.

2. **Localiza el CAMPO de cada una.** Del componente a la función, de la función
   al predicado. En /empleo eran `inRibaRoja` —la columna LOCALIDAD del
   listado— y `byMunicipio` —el `detail.municipio` de cada ficha—: dos campos,
   dos poblaciones, las dos bien contadas.

3. **Mide el solape sobre el snapshot publicado**, con un script de usar y
   tirar. Si sale exacto —26 + 12 = 38, sin residuo— hay puente y se puede
   publicar. Comprueba también que no haya filas en el otro sentido: si las hay,
   no es un hueco, es un desacuerdo, y eso es otra conversación.

4. **Publica el puente, DERIVADO y CONDICIONAL.** Nunca escrito: el día que la
   fuente cierre el hueco tiene que valer cero y desaparecer sola. Una salvedad
   a mano sobrevive al defecto que explicaba y se queda mintiendo.

5. **Decir cuánto queda fuera NO es el puente.** /empleo ya avisaba de que «19
   ofertas no traen municipio». Eso explica el DENOMINADOR del gráfico —44, no
   63— y sigue sin dejar pasar de 26 a 38. Hay que decir **qué parte de lo que
   queda fuera pertenece a la cifra de al lado**.

6. **Si el puente no se puede calcular, una de las dos cifras no debería estar
   ahí.** Es la otra rama, y también tiene precedente: «804 · 68 M€» se arregló
   quitando el 804, no explicándolo.

7. **Ata con la premisa MEDIDA**, no sólo con el resultado: la prueba tiene que
   afirmar que hoy las dos cifras NO cuadran solas. Sin eso, el día que la
   fuente publique el dato que falta la guarda pasa en verde sin comprobar nada
   — verde por no mirar, que es el defecto que esta skill existe para no
   cometer.

## Qué NO hace

- No edita nada. Nunca. Señala; decide una persona.
- No juzga estilo, diseño ni accesibilidad — para eso está la suite axe.
- No inventa el contexto que no tiene: no sabe qué contratos existen en el mundo,
  solo si la página contradice los datos que se le pasan.

## Lo que cazó el día que se escribió

| Página | Frase                                                 | Lo que concluía un lector                                                             |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `/`    | «Presup. 2025 €41,6M» junto a «Contratos adj. €68,0M» | que el pueblo adjudica más que su presupuesto anual (uno es acumulado de diez años)   |
| `/`    | «CONTRATOS ADJUDICADOS · 804 · 68 M€»                 | que se adjudicaron 804; son 698 — 804 incluye anulados, y la misma pantalla decía 698 |

## Coste

claude-code sobre el plan Max: $0 facturado. Una ruta ≈ 2 llamadas. El set por
defecto son 6 rutas.
