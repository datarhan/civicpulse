import { partyColor } from '../../hooks/useOfficials'

/**
 * La foto de un cargo, la que publica el Ayuntamiento, o sus iniciales cuando
 * la fuente no trae ninguna. La usan las tarjetas de /cargos y la lista de los
 * 21 de la lectura vecinal.
 *
 * `decorativo` es para cuando el nombre va escrito al lado: la foto calla
 * (`alt=""`) y las iniciales también, que si no un lector de pantalla diría
 * «R R» antes de «Robert Raga Gadea».
 */
export default function Retrato({ o, size, radius = 'var(--r-card)', decorativo = false }) {
  const color = partyColor(o.party)
  if (o.photoUrl) {
    return (
      <img
        src={o.photoUrl}
        alt={decorativo ? '' : o.name}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          objectFit: 'cover',
          flexShrink: 0,
          border: `2px solid ${color}22`,
        }}
      />
    )
  }
  return (
    <div
      title={o.photoNote || undefined}
      aria-hidden={decorativo || undefined}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--soft)',
        color: 'var(--ink50)',
        fontWeight: 700,
      }}
    >
      {o.name
        .split(' ')
        .slice(0, 2)
        .map((x) => x[0])
        .join('')}
    </div>
  )
}
