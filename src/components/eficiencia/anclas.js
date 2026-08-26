/**
 * El margen que necesita cualquier ancla de estas páginas para no aterrizar
 * debajo de lo que se queda pegado arriba.
 *
 * Vivía en `SubnavSecciones.jsx` y valía 112 porque descontaba DOS barras: la
 * topbar del shell y el submenú de secciones de /eficiencia. Desde que la
 * página dejó de tener pestañas —la respuesta no puede vivir detrás de un
 * submenú— la única barra pegajosa es la topbar, y el valor baja.
 *
 * MEDIDO en el navegador con getBoundingClientRect, no calculado: el número
 * anterior también parecía deducible y llevaba dentro un margen de respiro que
 * nadie recordaba. `useHashScroll` mide la topbar de verdad en tiempo de
 * ejecución; esto es su contrapartida estática para el `scrollMarginTop` de
 * cada ancla, y las dos tienen que decir aproximadamente lo mismo.
 */
export const MARGEN_ANCLA = 64
