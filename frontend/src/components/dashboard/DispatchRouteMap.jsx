/**
 * DispatchRouteMap.jsx
 * ═══════════════════════════════════════════════════════════════════════
 * Person 5 — Interactive OSRM Route Map (react-leaflet v4 + OpenStreetMap)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Stack: react-leaflet@4 (React 18 compatible), leaflet@1.9.x
 * Pattern mirrors: Zero-HungerImpeccable / src/features/distribution-map/components/MapArea.jsx
 *
 * Features:
 * - 🏪 Origin marker  — FreshGuard Retail Hub (Kota Damansara)
 * - 🏦 Receiver marker — Target food bank (dynamic per batch)
 * - 🛣️ OSRM polyline  — Real road route from /api/dispatch-route/{batch_id}
 * - 📍 Haversine fallback straight line if OSRM/FastAPI offline
 * - 💬 Popups — partner name, distance km, ETA minutes, cold-chain badge
 * - 📦 Cargo ML spec panel — from dispatch_estimator.py output
 */

import { useEffect, useCallback, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// ── Fix default icon paths broken by Vite bundler ───────────────────────────
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ── Store location (Person 5 backend STORE_LOCATION constant) ───────────────
const STORE_LOCATION = {
  name: 'FreshGuard Retail Hub (MY-KL-001)',
  address: 'Kota Damansara, Petaling Jaya',
  lat: 3.1517,
  lng: 101.5947,
}

// ── All known food bank receivers (mirrors backend/routers/dispatch.py) ─────
const ALL_RECEIVERS = [
  {
    id: 'REC-01',
    name: 'Kechara Soup Kitchen',
    location: 'Jalan Imbi, Bukit Bintang, KL',
    lat: 3.1448,
    lng: 101.7139,
    cold_storage: false,
    accepted: 'Vegetables, Fruits, Bakery, Prepared',
  },
  {
    id: 'REC-02',
    name: 'The Lost Food Project (TLFP)',
    location: 'Kota Damansara, Petaling Jaya',
    lat: 3.1517,
    lng: 101.5947,
    cold_storage: true,
    accepted: 'All Perishable & Dry Categories',
  },
  {
    id: 'REC-03',
    name: 'Yayasan Food Bank Malaysia',
    location: 'Seksyen 15, Shah Alam, Selangor',
    lat: 3.0645,
    lng: 101.5302,
    cold_storage: true,
    accepted: 'Produce, Dairy, Meat, Dry Goods',
  },
  {
    id: 'REC-04',
    name: 'Dapur Jalanan Kuala Lumpur',
    location: 'Panggung Anniversary, KL',
    lat: 3.1485,
    lng: 101.6912,
    cold_storage: false,
    accepted: 'Bakery, Prepared Food, Fruits',
  },
]

// ── Haversine fallback distance (km) ────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── SVG icon factory (no external image dependency) ──────────────────────────
function makeIcon(emoji, bgColor, size = 36) {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:${size}px; height:${size}px;
        background:${bgColor};
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        box-shadow:0 3px 12px rgba(0,0,0,0.3);
        border:2.5px solid #fff;
        display:flex; align-items:center; justify-content:center;
      ">
        <span style="transform:rotate(45deg); font-size:${Math.round(size * 0.5)}px; line-height:1;">${emoji}</span>
      </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  })
}

// ── MapController — invalidateSize when modal becomes visible ────────────────
// Must be rendered INSIDE <MapContainer> to access useMap() hook
function MapController({ isVisible, fitBounds }) {
  const map = useMap()
  useEffect(() => {
    if (!isVisible) return
    const t = setTimeout(() => {
      map.invalidateSize()
      if (fitBounds) {
        map.fitBounds(fitBounds, { animate: false, padding: [32, 32] })
      }
    }, 80)
    return () => clearTimeout(t)
  }, [isVisible, map, fitBounds])
  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════════
export default function DispatchRouteMap({ batch, isVisible }) {
  const [routeData, setRouteData] = useState(null)        // OSRM/fallback result
  const [routeStatus, setRouteStatus] = useState('idle')  // idle|loading|ok|fallback
  const [cargoData, setCargoData] = useState(null)        // dispatch_estimator output

  // ── Fetch OSRM route + cargo data when batch changes ────────────────────
  const fetchRoute = useCallback(async (b) => {
    if (!b) return
    setRouteStatus('loading')
    setRouteData(null)
    setCargoData(null)

    const receiverIdx = ALL_RECEIVERS.findIndex(
      (r) => r.name === b.assignedReceiver?.name
    )
    const receiver = receiverIdx >= 0 ? ALL_RECEIVERS[receiverIdx] : ALL_RECEIVERS[0]

    try {
      const res = await fetch(`/api/dispatch-route/${encodeURIComponent(b.id)}`, {
        signal: AbortSignal.timeout(6000),
      })
      if (res.ok) {
        const data = await res.json()
        setRouteData({ ...data, receiver })
        setCargoData(data.cargo_specs || null)
        setRouteStatus('ok')
        return
      }
    } catch (_) {
      // Network / CORS / backend not running — fall through to haversine
    }

    // Haversine fallback
    const distKm = haversineKm(
      STORE_LOCATION.lat, STORE_LOCATION.lng,
      receiver.lat, receiver.lng
    )
    setRouteData({
      receiver,
      distance_km: distKm.toFixed(2),
      eta_minutes: Math.round(distKm * 2.3 + 4),
      geometry: null,
      is_fallback: true,
    })
    setRouteStatus('fallback')
  }, [])

  useEffect(() => {
    if (batch) fetchRoute(batch)
  }, [batch, fetchRoute])

  // ── Derived display values ───────────────────────────────────────────────
  const distKm = routeData?.distance_km
  const etaMins = routeData?.eta_minutes
  const receiverName = routeData?.receiver?.name || batch?.assignedReceiver?.name || '—'
  const isCold = routeData?.receiver?.cold_storage
  const receiver = routeData?.receiver

  // ── Build polyline coordinates ───────────────────────────────────────────
  // OSRM GeoJSON: coordinates are [lng, lat] → flip to [lat, lng] for Leaflet
  const polylinePositions =
    routeData?.geometry?.coordinates?.length > 1
      ? routeData.geometry.coordinates.map(([lng, lat]) => [lat, lng])
      : receiver
      ? [
          [STORE_LOCATION.lat, STORE_LOCATION.lng],
          [receiver.lat, receiver.lng],
        ]
      : null

  // ── Fit bounds for MapController ─────────────────────────────────────────
  const fitBounds =
    receiver
      ? [
          [STORE_LOCATION.lat, STORE_LOCATION.lng],
          [receiver.lat, receiver.lng],
        ]
      : null

  // ── Marker icons ─────────────────────────────────────────────────────────
  const storeIcon = makeIcon('🏪', '#1b9b55', 40)
  const receiverIcon = makeIcon(isCold ? '❄️' : '🏦', '#3b82f6', 40)

  return (
    <div className="fg-route-map-wrapper">
      {/* ── Status Bar ────────────────────────────────────────────────── */}
      <div className="fg-route-map-statusbar">
        {routeStatus === 'loading' && (
          <span className="fg-route-map-status fg-route-map-status--loading">
            <span className="fg-route-map-spinner" />
            Fetching OSRM route…
          </span>
        )}
        {routeStatus === 'ok' && (
          <span className="fg-route-map-status fg-route-map-status--ok">
            🛣️ OSRM Road Route · {distKm} km · ETA {etaMins} min
          </span>
        )}
        {routeStatus === 'fallback' && (
          <span className="fg-route-map-status fg-route-map-status--warn">
            ⚠️ Straight-line estimate (FastAPI offline) · ~{distKm} km
          </span>
        )}
        {routeStatus === 'idle' && (
          <span className="fg-route-map-status fg-route-map-status--idle">
            🗺️ Interactive Route Map
          </span>
        )}
      </div>

      {/* ── react-leaflet MapContainer ───────────────────────────────── */}
      <MapContainer
        center={[3.12, 101.65]}
        zoom={12}
        style={{ width: '100%', height: '340px', borderRadius: '10px', overflow: 'hidden' }}
        scrollWheelZoom
        className="fg-route-map-canvas"
      >
        {/* Invalidate size + fit bounds on visibility change */}
        <MapController isVisible={isVisible} fitBounds={fitBounds} />

        {/* OpenStreetMap tiles */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />

        {/* Store / Origin marker */}
        <Marker position={[STORE_LOCATION.lat, STORE_LOCATION.lng]} icon={storeIcon}>
          <Popup maxWidth={240}>
            <div style={{ minWidth: 180 }}>
              <strong style={{ color: '#147b43' }}>🏪 {STORE_LOCATION.name}</strong><br />
              <span style={{ color: '#666', fontSize: '0.8rem' }}>{STORE_LOCATION.address}</span><br />
              <span style={{ fontSize: '0.78rem' }}>📦 Dispatch Origin</span>
            </div>
          </Popup>
        </Marker>

        {/* All food bank context markers (grey/small) */}
        {ALL_RECEIVERS.map((rec) => {
          const isActive = receiver?.name === rec.name
          const icon = makeIcon(
            rec.cold_storage ? '❄️' : '🤝',
            isActive ? '#2563eb' : '#9ca3af',
            isActive ? 32 : 26
          )
          return (
            <Marker key={rec.id} position={[rec.lat, rec.lng]} icon={icon}>
              <Popup maxWidth={220}>
                <div style={{ minWidth: 160 }}>
                  <strong>{rec.name}</strong><br />
                  <span style={{ color: '#666', fontSize: '0.78rem' }}>{rec.location}</span><br />
                  <span style={{ fontSize: '0.75rem' }}>
                    {rec.cold_storage ? '❄️ Cold Storage' : '📦 Ambient'}
                  </span><br />
                  <span style={{ fontSize: '0.72rem', color: '#888' }}>Accepts: {rec.accepted}</span>
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* Active receiver marker (larger, blue) */}
        {receiver && (
          <Marker position={[receiver.lat, receiver.lng]} icon={receiverIcon}>
            <Popup maxWidth={260}>
              <div style={{ minWidth: 200 }}>
                <strong style={{ color: '#2563eb' }}>🏦 {receiver.name}</strong><br />
                <span style={{ color: '#666', fontSize: '0.78rem' }}>{receiver.location}</span><br />
                <hr style={{ margin: '4px 0', borderColor: '#e5e7eb' }} />
                <div style={{ display: 'flex', gap: 12, fontSize: '0.8rem', marginTop: 4 }}>
                  <span>📏 <strong>{distKm} km</strong></span>
                  <span>⏱ <strong>{etaMins} min ETA</strong></span>
                </div>
                <div style={{ fontSize: '0.76rem', marginTop: 4, color: '#666' }}>
                  {isCold ? '❄️ Cold-Chain Storage Available' : '📦 Ambient / Dry Goods'}
                </div>
                {routeData?.is_fallback && (
                  <div style={{ fontSize: '0.7rem', color: '#f59e0b', marginTop: 4 }}>
                    ⚠️ Straight-line estimate (OSRM offline)
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Route polyline — OSRM (green solid) or fallback (yellow dashed) */}
        {polylinePositions && (
          <Polyline
            positions={polylinePositions}
            pathOptions={
              routeData?.geometry?.coordinates?.length > 1
                ? { color: '#1b9b55', weight: 5, opacity: 0.85, lineJoin: 'round' }
                : { color: '#f59e0b', weight: 3, opacity: 0.7, dashArray: '8, 6' }
            }
          >
            <Popup maxWidth={220}>
              <span style={{ fontSize: '0.82rem' }}>
                {routeData?.geometry?.coordinates?.length > 1
                  ? `🛣️ OSRM Road Route · ${distKm} km · ETA ${etaMins} min`
                  : `📏 Straight-line estimate · ${distKm} km`}
              </span>
            </Popup>
          </Polyline>
        )}
      </MapContainer>

      {/* ── Route Info Strip ──────────────────────────────────────────── */}
      {routeData && (
        <div className="fg-route-map-infostrip">
          <div className="fg-route-map-infoitem">
            <span className="fg-route-map-infoitem__label">Origin</span>
            <span className="fg-route-map-infoitem__value">🏪 {STORE_LOCATION.address}</span>
          </div>
          <div className="fg-route-map-infoarrow">→</div>
          <div className="fg-route-map-infoitem">
            <span className="fg-route-map-infoitem__label">Destination</span>
            <span className="fg-route-map-infoitem__value">
              🏦 {receiverName}
              {isCold && <span className="fg-route-map-badge fg-route-map-badge--cold">❄️ Cold-Chain</span>}
            </span>
          </div>
          <div className="fg-route-map-infodivider" />
          <div className="fg-route-map-infoitem fg-route-map-infoitem--stat">
            <span className="fg-route-map-infoitem__label">Distance</span>
            <span className="fg-route-map-infoitem__value fg-route-map-infoitem__value--big">{distKm} km</span>
          </div>
          <div className="fg-route-map-infoitem fg-route-map-infoitem--stat">
            <span className="fg-route-map-infoitem__label">ETA</span>
            <span className="fg-route-map-infoitem__value fg-route-map-infoitem__value--big">{etaMins} min</span>
          </div>
        </div>
      )}

      {/* ── Cargo ML Spec Panel (Person 5 dispatch_estimator output) ─── */}
      {cargoData && (
        <div className="fg-route-map-cargopanel">
          <div className="fg-route-map-cargopanel__title">📦 ML Cargo Specification (Person 5)</div>
          <div className="fg-route-map-cargopanel__grid">
            <div className="fg-route-map-cargopanel__item">
              <span>Estimated Cargo</span>
              <strong>{cargoData.estimated_cargo_kg} kg</strong>
            </div>
            <div className="fg-route-map-cargopanel__item">
              <span>Vehicle</span>
              <strong>{cargoData.vehicle_title}</strong>
            </div>
            <div className="fg-route-map-cargopanel__item">
              <span>Cold-Chain</span>
              <strong>{cargoData.cold_chain_type}</strong>
            </div>
            <div className="fg-route-map-cargopanel__item">
              <span>Urgency</span>
              <strong style={{ color: cargoData.transport_urgency?.includes('CRITICAL') ? '#c82d32' : '#147b43' }}>
                {cargoData.transport_urgency?.includes('CRITICAL') ? '🚨 Critical' : '✅ Standard'}
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
