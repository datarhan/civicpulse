import { useState, useMemo } from 'react'
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, useMap } from 'react-leaflet'
import { incidents, getPolitician, MAP_CENTER, MAP_ZOOM } from '../data/mockData'
import PoliticianCard from './PoliticianCard'
import './CityMap.css'

const STATUS_COLORS = {
  open: '#ef5350',
  in_progress: '#ffa726',
  fixed: '#00e676'
}

const STATUS_LABELS = {
  open: 'Abierta',
  in_progress: 'En progreso',
  fixed: 'Resuelta'
}

const CATEGORY_ICONS = {
  Baches: '🕳️',
  Iluminación: '💡',
  Limpieza: '🧹'
}

const FILTERS = ['Todos', 'Baches', 'Iluminación', 'Limpieza']

function CityMap() {
  const [activeFilter, setActiveFilter] = useState('Todos')
  const [selectedIncident, setSelectedIncident] = useState(null)

  const filteredIncidents = useMemo(() => {
    if (activeFilter === 'Todos') return incidents
    return incidents.filter(i => i.category === activeFilter)
  }, [activeFilter])

  const handlePinClick = (incident) => {
    setSelectedIncident(incident)
  }

  return (
    <section className="city-map animate-fade-in animate-fade-in-delay-3" id="city-map">
      <div className="city-map__header">
        <div className="city-map__title-row">
          <h2 className="city-map__title">
            <span>🗺️</span> Mapa del Municipio
          </h2>
          <div className="city-map__legend">
            <span className="city-map__legend-item">
              <span className="city-map__legend-dot" style={{ background: '#ef5350' }}></span>
              Abierta
            </span>
            <span className="city-map__legend-item">
              <span className="city-map__legend-dot" style={{ background: '#ffa726' }}></span>
              En progreso
            </span>
            <span className="city-map__legend-item">
              <span className="city-map__legend-dot" style={{ background: '#00e676' }}></span>
              Resuelta
            </span>
          </div>
        </div>
        <div className="city-map__filters" id="map-filters">
          {FILTERS.map(filter => (
            <button
              key={filter}
              className={`city-map__filter-btn ${activeFilter === filter ? 'city-map__filter-btn--active' : ''}`}
              onClick={() => setActiveFilter(filter)}
            >
              {CATEGORY_ICONS[filter] && <span>{CATEGORY_ICONS[filter]}</span>}
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="city-map__container glass-card">
        <MapContainer
          center={MAP_CENTER}
          zoom={MAP_ZOOM}
          className="city-map__leaflet"
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />

          {/* Watchzone — glowing blue radius */}
          <Circle
            center={MAP_CENTER}
            radius={400}
            pathOptions={{
              color: '#42a5f5',
              fillColor: '#42a5f5',
              fillOpacity: 0.06,
              weight: 1.5,
              dashArray: '8 4',
              opacity: 0.4
            }}
          />

          {/* Incident pins */}
          {filteredIncidents.map(incident => (
            <CircleMarker
              key={incident.id}
              center={[incident.lat, incident.lng]}
              radius={incident.status === 'open' ? 10 : 8}
              pathOptions={{
                color: STATUS_COLORS[incident.status],
                fillColor: STATUS_COLORS[incident.status],
                fillOpacity: 0.7,
                weight: 2,
                opacity: 0.9
              }}
              eventHandlers={{
                click: () => handlePinClick(incident)
              }}
            >
              <Popup className="city-map__popup">
                <div className="city-map__popup-inner">
                  <strong>{incident.label}</strong>
                  <span>{incident.location}</span>
                  <span className="city-map__popup-status" style={{ color: STATUS_COLORS[incident.status] }}>
                    {STATUS_LABELS[incident.status]}
                  </span>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>

        {/* Watchzone label */}
        <div className="city-map__watchzone-label">
          <span className="city-map__watchzone-dot"></span>
          Tu Zona de Vigilancia
        </div>
      </div>

      {/* Politician Card Overlay */}
      {selectedIncident && (
        <PoliticianCard
          incident={selectedIncident}
          politician={getPolitician(selectedIncident.assignedTo)}
          onClose={() => setSelectedIncident(null)}
        />
      )}
    </section>
  )
}

export default CityMap
