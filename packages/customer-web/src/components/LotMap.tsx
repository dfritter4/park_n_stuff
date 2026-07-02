import { useEffect } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Link } from 'react-router-dom';
import type { Lot } from '@parking/shared';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Vite doesn't serve Leaflet's default marker images from the expected
// relative path, so the default icon silently fails to render unless we
// re-point it at the bundled asset URLs. Known issue: leaflet/leaflet#4968.
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export interface MapPoint {
  lat: number;
  lng: number;
}

interface LotMapProps {
  center: MapPoint;
  lots: Lot[];
}

function RecenterOnChange({ center }: { center: MapPoint }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng]);
  }, [center.lat, center.lng, map]);
  return null;
}

function formatRate(hourlyRateCents: number): string {
  return `$${(hourlyRateCents / 100).toFixed(2)}/hr`;
}

export function LotMap({ center, lots }: LotMapProps) {
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={13} className="lot-map" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <RecenterOnChange center={center} />
      {lots.map((lot) => (
        <Marker key={lot.id} position={[lot.lat, lot.lng]}>
          <Popup>
            <strong>{lot.name}</strong>
            <div>{formatRate(lot.hourlyRateCents)}</div>
            <div>{lot.availableSpaces} spaces</div>
            <Link to={`/lots/${lot.id}`}>View details</Link>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
