---
name: revisar-superficies
description: Read CivicPulse pages as a visitor would and flag anything the data does not support — misleading juxtapositions, sentinels published as facts, "0" that means "not recorded", copy that describes retired behaviour. Use after changing a data figure, a KPI, page copy, or a pipeline, and before publishing anything. Triggers on "revisar superficies", "¿la portada dice algo falso?", "review the pages as a reader".
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

## Qué NO hace

- No edita nada. Nunca. Señala; decide una persona.
- No juzga estilo, diseño ni accesibilidad — para eso está la suite axe.
- No inventa el contexto que no tiene: no sabe qué contratos existen en el mundo,
  solo si la página contradice los datos que se le pasan.

## Lo que cazó el día que se escribió

| Página | Frase | Lo que concluía un lector |
|---|---|---|
| `/` | «Presup. 2025 €41,6M» junto a «Contratos adj. €68,0M» | que el pueblo adjudica más que su presupuesto anual (uno es acumulado de diez años) |
| `/` | «CONTRATOS ADJUDICADOS · 804 · 68 M€» | que se adjudicaron 804; son 698 — 804 incluye anulados, y la misma pantalla decía 698 |

## Coste

claude-code sobre el plan Max: $0 facturado. Una ruta ≈ 2 llamadas. El set por
defecto son 6 rutas.
