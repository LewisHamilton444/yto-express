// Shared vehicle-type icon component for the React tree.
// Replaces the duplicated emoji mappings previously copied into LiveRiderMap,
// MonitorParcel, MonitorRiderStatus and GenerateRiderDataReport.
// Leaflet/HTML strings -> see vehicleGlyphSvg in vehicleIconUtils.js
import { typeIcon } from './vehicleIconUtils';

export function VehicleIcon({ type, size = 16, ...rest }) {
  const Icon = typeIcon(type);
  return <Icon size={size} aria-hidden="true" {...rest} />;
}