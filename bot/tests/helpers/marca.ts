/**
 * Ahora, en la forma de las marcas del bot (UTC, sin la Z), como la escribe
 * `datetime('now')` de SQLite. Para las pruebas que registran una queja «ahora»:
 * desde el 28-09-2026 la fecha de registro no la pone el bot, la trae el recibo.
 */
export const marcaDeAhora = () => new Date().toISOString().slice(0, 19).replace('T', ' ')
