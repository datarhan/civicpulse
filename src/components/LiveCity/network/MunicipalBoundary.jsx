// @ts-check
import { Polyline } from 'react-leaflet'
import { useGeo } from '../../../hooks/useGeo'
import { BOUNDARY_COLOR } from '../shared'

export function MunicipalBoundary() {
  const { loading, error, data } = useGeo()
  if (loading || error || !data?.boundary) return null
  return (
    <Polyline
      positions={data.boundary.polygon}
      pathOptions={{
        color: BOUNDARY_COLOR,
        weight: 2,
        opacity: 0.55,
        dashArray: '6 4',
        fill: false,
      }}
    />
  )
}
