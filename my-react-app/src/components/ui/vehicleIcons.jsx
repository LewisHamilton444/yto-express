// Shared vehicle-type icon helpers.
// Replaces the duplicated emoji mappings previously copied into LiveRiderMap,
// MonitorParcel, MonitorRiderStatus and GenerateRiderDataReport.
// React tree -> <VehicleIcon type={...} size={...} /> (lucide SVG, colorable)
// Leaflet/HTML  -> vehicleGlyphSvg(type) (crisp monochrome SVG data URI)
import { Zap, Bike, Truck } from 'lucide-react';

export function VehicleIcon({ type, size = 16, ...rest }) {
  const Icon = typeIcon(type);
  return <Icon size={size} aria-hidden="true" {...rest} />;
}

export function typeIcon(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('e-bike') || t.includes('ebike') || t.includes('electric')) return Zap;
  if (t.includes('bicycle')) return Bike;
  if (t.includes('van')) return Truck;
  return Bike;
}

const SVG_CACHE = new Map();
const DEFAULT_COLOR = '%23390955'; // brand purple, URL-encoded

function svgDataUriFor(iconName, color = DEFAULT_COLOR) {
  const cacheKey = `${iconName}|${color}`;
  if (SVG_CACHE.has(cacheKey)) return SVG_CACHE.get(cacheKey);
  // Whitelisted lucide 24x24 stroke paths (Zap / Bike / Truck), baked in.
  const paths = {
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    bike: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2"/>',
    truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  };
  const body = paths[iconName];
  if (!body) return '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  SVG_CACHE.set(cacheKey, uri);
  return uri;
}

function typeIconName(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('e-bike') || t.includes('ebike') || t.includes('electric')) return 'zap';
  if (t.includes('van')) return 'truck';
  return 'bike';
}

// Renders inside Leaflet divIcon html strings (map markers/pins).
export function vehicleGlyphSvg(type, color) {
  return svgDataUriFor(typeIconName(type), color);
}

// Short text label used in popup/leaflet HTML where only plain text is safe.
export function vehicleTypeLabel(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('e-bike') || t.includes('ebike') || t.includes('electric')) return 'E-BIKE';
  if (t.includes('bicycle')) return 'BIKE';
  if (t.includes('van')) return 'VAN';
  return 'MOTOR';
}
