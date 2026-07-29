'use client';

// ── Luzon-only mock dataset ─────────────────────────────────────────────────
// Used as a local fallback whenever the backend is unreachable, so the map
// still renders a believable, fully-Luzon scene. Every rider ships with a
// multi-waypoint route (real Luzon towns, roughly following the real road
// corridor toward its destination hub), a cruising speedKmh, and a
// destinationHubId, so LiveRiderMap can animate movement and show hub-to-hub
// routing without needing the backend.

export const MOCK_LUZON_RIDERS = [
  {
    riderId: 'RD-LZN-00101',
    fullName: 'Ramon Castillo',
    vehicleType: 'Motorcycle',
    city: 'Valenzuela',
    province: 'Metro Manila',
    lat: 14.7011,
    lng: 120.9830,
    speedKmh: 32,
    destinationHubId: 'HUB-001', // Quezon City Main Hub
    route: [
      { lat: 14.7011, lng: 120.9830 }, // Valenzuela
      { lat: 14.6494, lng: 120.9673 }, // Caloocan
      { lat: 14.6507, lng: 121.1029 }, // Marikina
      { lat: 14.6760, lng: 121.0437 }, // Quezon City Main Hub
    ],
  },
  {
    riderId: 'RD-LZN-00102',
    fullName: 'Bea Fernandez',
    vehicleType: 'Van',
    city: 'Malolos',
    province: 'Bulacan',
    lat: 14.8430,
    lng: 120.8110,
    speedKmh: 45,
    destinationHubId: 'HUB-002', // Central Luzon Hub - Bulacan/Pampanga
    route: [
      { lat: 14.8430, lng: 120.8110 }, // Malolos
      { lat: 14.9150, lng: 120.7650 }, // Calumpit
      { lat: 15.0289, lng: 120.6900 }, // Central Luzon Hub (San Fernando, Pampanga)
    ],
  },
  {
    riderId: 'RD-LZN-00103',
    fullName: 'Carlo Villanueva',
    vehicleType: 'Bicycle',
    city: 'Biñan',
    province: 'Laguna',
    lat: 14.3406,
    lng: 121.0792,
    speedKmh: 18,
    destinationHubId: 'HUB-003', // South Luzon Hub - Laguna
    route: [
      { lat: 14.3406, lng: 121.0792 }, // Biñan
      { lat: 14.3122, lng: 121.1114 }, // Santa Rosa
      { lat: 14.2758, lng: 121.1244 }, // Cabuyao
      { lat: 14.2117, lng: 121.1653 }, // South Luzon Hub (Calamba, Laguna)
    ],
  },
  {
    riderId: 'RD-LZN-00104',
    fullName: 'Nico Ramirez',
    vehicleType: 'Motorcycle',
    city: 'Urdaneta',
    province: 'Pangasinan',
    lat: 15.9761,
    lng: 120.5711,
    speedKmh: 38,
    destinationHubId: 'HUB-002', // routing south into Central Luzon Hub
    route: [
      { lat: 15.9761, lng: 120.5711 }, // Urdaneta, Pangasinan
      { lat: 15.3319, lng: 120.5883 }, // Capas, Tarlac
      { lat: 15.4755, lng: 120.5963 }, // Tarlac City
      { lat: 15.0289, lng: 120.6900 }, // Central Luzon Hub (San Fernando, Pampanga)
    ],
  },
];

export const MOCK_LUZON_PARCELS = [
  { trackingNumber: 'TRK-LZN-00001', item: 'Documents',  destination: 'Quezon City', status: 'in-transit', lat: 14.6800, lng: 121.0300 },
  { trackingNumber: 'TRK-LZN-00002', item: 'Electronics', destination: 'Malolos',     status: 'pending',    lat: 14.8400, lng: 120.8050 },
  { trackingNumber: 'TRK-LZN-00003', item: 'Groceries',   destination: 'Santa Rosa',  status: 'in-transit', lat: 14.3100, lng: 121.1100 },
];
