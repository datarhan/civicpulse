# Encaje declarado · de qué se sostiene lo que decimos

_Diseño · 2026-08-04 · amplía [2026-08-03](2026-08-03-encaje-declarado-design.md)_

## El problema

El bloque «encaje declarado» trata cada línea de formación y trayectoria como un
hecho. No lo es. Al medirlo:

> **Las 109 referencias de evidencia de las 40 filas publicadas proceden, sin
> excepción, de un documento que escribió la propia persona.** Cero corroboración
> independiente.

Son CV publicados en el portal municipal y declaraciones de actividades —también
autodeclaradas, aunque su presentación sea obligatoria—. La biografía de Pozuelo
sí cita el BOP n.º 79 y el acta constitutiva de 2015, pero sostienen una
afirmación de trayectoria **política**, no la formación ni la trayectoria
profesional que este bloque usa.

Y las biografías ya lo saben: **las 11** llevan un aviso que dice que esos datos
son autodeclarados. El bloque no lo escuchaba.

Peor: hay discrepancias documentadas que el bloque tira. El CV de Eva Lara y su
declaración estatutaria difieren en el inicio de su plaza docente (2006 frente a
09/2008) y la biografía lo publica **sin resolver**. Tres concejales tienen avisos
de que sus delegaciones han cambiado durante el mandato, lo que significa que una
fila puede estar analizando un área que ya no llevan.

## Lo que NO se hace

La petición nació de la sospecha de que los CV pueden contener datos falsos
«sobre todo en el PP». Dos hechos lo reencuadran:

1. **Ningún concejal del PP entra en este análisis.** Las 11 personas con filas
   son del PSOE, porque son las únicas con área delegada. PP (7), VOX, EU-Podem y
   Compromís no llevan ninguna, así que tienen cero filas.
2. Aplicar más escrutinio a un partido que a otro rompería el compromiso de
   neutralidad publicado en `/metodologia`. La regla es la misma para todos.

El hallazgo real es más incómodo que el sospechado, y apunta al gobierno, no a la
oposición: **de todo lo que este sitio dice sobre la formación y la trayectoria
de quienes gobiernan Riba-roja, nada está verificado de forma independiente.**

## Diseño

### 1. `selfDeclared`, en la fuente

```ts
// src/scraper/journalist/types.ts
export interface SourceCitation {
  // …
  trust: 'high' | 'medium' | 'low'
  /**
   * El SUJETO escribió este documento. Ortogonal a `trust`, que califica al
   * EDITOR: un CV en el portal del ayuntamiento es official-doc/high y a la vez
   * enteramente autodeclarado. Confundirlos sella lo autodeclarado como
   * verificado, que es el error que este campo existe para impedir.
   */
  selfDeclared?: boolean
}
```

Es una propiedad del documento, así que vive en el documento: lo aprovecha
cualquier superficie, no sólo esta. `journalist-reports.json` es curado y está
protegido por el hook, así que el relleno va por un script validado con
`curatorNotes`, nunca a mano.

Criterio del relleno, revisado fila a fila: «CV autodeclarado…», «CV publicado en
el portal municipal…» y «Declaración de actividades / de bienes…» son
`selfDeclared: true`. BOP, BOE, actas, registros y resoluciones son `false`.

### 2. El respaldo, eje propio

```ts
export const RESPALDO_VALUES = ['autodeclarada', 'corroborada', 'discrepancia-documentada'] as const
```

Se deriva por evaluación desde las fuentes que cita, y **nunca se mezcla con
`FIT_VALUES`**: «¿guarda relación con el área?» y «¿de qué se sostiene?» son dos
preguntas, y fundirlas repetiría el error del porcentaje.

**Regla de pintado, adaptativa.** Mientras todas las evaluaciones de una tarjeta
coinciden —hoy las 40 filas y sus 109 referencias son `autodeclarada`— el bloque
lo dice **una vez**:

> Todo lo anterior lo declara la propia persona; ninguna fuente independiente lo
> corrobora.

En cuanto divergen, pasa a marcas por elemento. Un distintivo que se repite
idéntico 80 veces no distingue nada: es la misma trampa que mató al chip
`cargoPublicoPrevio`. El modelo de datos es por elemento; sólo el pintado se
agrupa.

### 3. Avisos → eje (modelo propone, curador firma)

Para cada aviso de la biografía el modelo devuelve
`{ eje: 'formacion' | 'experiencia' | 'area' | 'ninguno', tipo, avisoIndex }`,
**citando por índice** sobre la lista de avisos de ese informe, igual que la
evidencia se cita por índice sobre el CV: así no puede inventarse un aviso.

Cae en la misma cola `editorial/` con `requiresHumanApproval: true` y lo firma un
curador. Los avisos sobre compatibilidad de actividades privadas o sobre cobertura
de prensa salen con `eje: 'ninguno'` y no tocan el bloque.

`eje: 'area'` **no decora un chip**: marca la fila como posiblemente referida a un
área que la persona ya no lleva. Es un problema de corrección de la fila, no una
nota sobre la persona.

### 4. El límite, dicho

El bloque declara de qué se sostiene, como `MoneyCoverage` declara qué porción del
contrato municipal pinta el mapa. Una superficie que cubre una fracción de su
dominio lo dice; el límite es un hallazgo, no una vergüenza.

Se corrige además el copy actual «Según su CV publicado», que describe la
procedencia sin decir lo que implica. `/metodologia` y `/aviso-legal` se enmiendan
en el mismo PR.

### 5. Guardas

La comprobación **no puede** afirmar que haya `corroborada`: hoy no hay ninguna.
Así que se invierte —y esto es exactamente lo que distingue `check:runs`—:

- afirmar que el clasificador **corrió y cubrió las 109 referencias**, de modo que
  «0 corroboradas» sea un resultado medido y no un campo que nadie rellenó;
- afirmar que `selfDeclared` está poblado en toda fuente citada por
  `education` / `career-professional`, y fallar si alguna queda indefinida —un
  `undefined` que se pinta como «corroborada» es el fallo caro;
- `check:relations`: todo `avisoIndex` firmado ha de existir en el informe citado;
- ablación: forzar una fuente a `selfDeclared: false` ha de mover el texto del
  bloque, y forzar un `avisoIndex` fuera de rango ha de romper.

## Fuera de alcance

Ninguna regla por partido. Ninguna nota, ningún porcentaje, ninguna ordenación.
No se retiran las 40 filas: se publica de qué se sostienen.
