# Cotejo: cada frase publicada, un desenlace

El cotejo recorre TODO lo que la biografía publicada afirma —relatos, cronología,
trayectorias, filas financieras, citas, lagunas— y le pone a cada afirmación uno
de seis desenlaces. Ni cinco ni siete: los seis existen porque cada uno dispara
una acción distinta, y un desenlace que no cambia lo que se hace después es ruido.

| Desenlace        | Significa                                                                                          | Acción que dispara                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `sostiene`       | el documento citado dice lo que la frase dice                                                      | ninguna                                                                                                                            |
| `se-parece`      | el extracto citado se parece a la frase pero no la sostiene (tiempo verbal, matiz, generalización) | si un extracto ya citado sostiene la frase ajustada → corrección (`correct-journalist-report`); si hace falta documento nuevo → v2 |
| `contradice`     | otro documento dice lo contrario                                                                   | si el documento ya está citado o publicado en el sitio → corrección; si es nuevo → v2 con el documento sembrado                    |
| `desactualizado` | era verdad y dejó de serlo (cese, cargo nuevo, empresa disuelta)                                   | corrección de tiempo verbal o fecha (`narrative.<heading>.bodyMarkdown`, `career-political[i].endYear`)                            |
| `sin-fuente`     | la frase no tiene cita, o la cita no resuelve                                                      | corrección que la retira o la matiza; con documento nuevo → v2                                                                     |
| `no-comprobable` | ninguna fuente accesible la confirma ni la desmiente                                               | a «Lagunas» del dossier; NUNCA se publica como hecho ni como duda                                                                  |

Reglas del cotejo:

- Una afirmación autodeclarada (CV, LinkedIn, declaración de bienes) se coteja
  contra fuentes independientes; si sólo la sostiene la autodeclaración, sigue
  siendo `sostiene` **como autodeclarada** y el dossier lo anota. No es
  `no-comprobable`: la biografía ya dice de dónde sale.
- Una frase con varias afirmaciones se parte: cada una lleva su desenlace.
- `contradice` exige el documento que contradice, con su extracto literal, no una
  impresión.
- Los recuentos por desenlace van al `manifest.json`: son lo que se compara entre
  personas y lo que dice si la campaña midió algo.

Formato de fila (`cotejo.json`):

```json
{
  "seccion": "narrative:Elección y trayectoria",
  "frase": "En 2019 ya concurrió en el puesto n.º 11 de la candidatura del Partido Popular",
  "sourceIds": ["src-008"],
  "extracto": "…PARTIDO POPULAR… 11. LAURA GUZMAN BRUNO…",
  "documentoNuevo": null,
  "veredicto": "sostiene",
  "accion": "ninguna"
}
```

Relación con `revisar-borrador`: sus clases D («el extracto se parece pero no
sostiene») y E («la nota de curaduría publica lo excluido») son `se-parece` y
una alarma de la fase de propuesta, respectivamente. Este cotejo se hace sobre lo
YA publicado; aquel, sobre el borrador antes de publicar.
