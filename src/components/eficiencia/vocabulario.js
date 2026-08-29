/**
 * El vocabulario que comparten la fila del libro y la ficha del servicio.
 *
 * Vivía dentro de `ServicioCard`, que era su único lector. Con el libro de
 * servicios pasan a ser dos, y dos copias de «El servicio está concedido: lo
 * paga el concesionario…» que se separen dejarían la tabla y la ficha diciendo
 * cosas distintas del mismo servicio. Es el modo de fallo 1 de
 * docs/DATA_INTEGRITY.md aplicado a la prosa.
 */
export const GESTION = {
  directa: { label: 'gestión directa', tone: 'neutral' },
  concesion: { label: 'concesión', tone: 'warn' },
  mancomunada: { label: 'mancomunada', tone: 'neutral' },
  consorciada: { label: 'consorciada', tone: 'neutral' },
  convenio: { label: 'por convenio', tone: 'neutral' },
  mixta: { label: 'empresa mixta', tone: 'neutral' },
  otra: { label: 'otra forma de gestión', tone: 'ghost' },
  'sin-clasificar': { label: 'sin clasificar', tone: 'ghost' },
  'no-se-presta': { label: 'no se presta', tone: 'ghost' },
}

/**
 * Por qué NO hay cociente, en la lengua de un vecino.
 *
 * Cada uno de estos es un hecho sobre la rendición de cuentas del propio
 * ayuntamiento, no un defecto de esta página: por eso se enseñan en vez de
 * ocultar la tarjeta.
 */
export const MOTIVO = {
  concesion:
    'El servicio está concedido: lo paga el concesionario y lo recupera vía tarifa, así que lo que el ayuntamiento declare —declare una cifra o declare cero, y en estas diez entregas hace las dos cosas— no es lo que cuesta el servicio. Compararlo con un municipio de gestión directa diría que aquí es gratis.',
  'cero-sin-declarar':
    'Hay gasto declarado, pero la unidad física viene a cero. Un cero junto a un presupuesto real significa «no se declaró», no «no hubo» (regla 3).',
  'filas-duplicadas':
    'El ministerio publica más de un coste para este mismo servicio. Elegir uno sería un volado disfrazado de dato (regla 1 de la metodología).',
  'atributo-ambiguo':
    'La misma magnitud está declarada dos veces con valores distintos en la misma entrega (regla 2).',
  ausente: 'La entrega no trae esta magnitud.',
}

/**
 * El sufijo de unidad, abreviado para una celda de tabla.
 *
 * «147,25 €/punto de luz» mide 171px en una columna de 138 y se salía por la
 * derecha; abreviarlo es lo que hace también la propuesta. La unidad ENTERA
 * sigue en la ficha, que es donde hay sitio para decir qué se está dividiendo —
 * aquí sólo hace falta que dos filas no se confundan entre sí.
 */
const ABREVIA = {
  '€/efectivo': '/efect.',
  '€/punto de luz': '/pto',
  '€/préstamo': '/prést.',
  '€/m de red': '/m red',
}

export function unidadCorta(unidad) {
  return ABREVIA[unidad] ?? unidad.replace(/^€/, '')
}
