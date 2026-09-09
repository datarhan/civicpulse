/**
 * Quién es administrador, en un solo sitio.
 *
 * `ADMIN_USER_IDS` se parseaba por su cuenta en cuatro módulos —`batch`,
 * `curar`, `escalar` y `convocatorias`—, cada uno con su bucle y su
 * `Number.isFinite`. Cuatro copias de una regla es cuatro sitios donde puede
 * divergir, y aquí divergir significa que un administrador reciba unos avisos y
 * otros no, sin que nada falle.
 *
 * Los avisos nuevos usan ésta, y `convocatorias` se pasó a ella. Los tres
 * comandos siguen con la suya: cambiarlos es un barrido aparte y no se hace de
 * paso, que es como se rompen las cosas que funcionan.
 */
export function parseAdminIds(raw = process.env.ADMIN_USER_IDS ?? ''): number[] {
  const out: number[] = []
  for (const s of raw.split(',')) {
    const n = Number(s.trim())
    if (Number.isFinite(n) && n > 0) out.push(n)
  }
  return out
}
