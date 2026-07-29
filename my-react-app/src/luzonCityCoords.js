'use client';

// ── Luzon-only city coordinate lookup ───────────────────────────────────────
// YTO Express operates strictly within Luzon (no Visayas/Mindanao). This is
// the single shared table every map/geocoding lookup in the app should use,
// so rider/parcel/hub coordinates never drift outside Luzon or diverge
// between components.
export const CITY_COORDS = {
  // Metro Manila
  Manila:             { lat:14.5995, lng:120.9842 },
  'Quezon City':      { lat:14.6760, lng:121.0437 },
  Makati:             { lat:14.5547, lng:121.0244 },
  Pasig:              { lat:14.5764, lng:121.0851 },
  Taguig:             { lat:14.5243, lng:121.0792 },
  Mandaluyong:        { lat:14.5794, lng:121.0359 },
  Marikina:           { lat:14.6507, lng:121.1029 },
  Caloocan:           { lat:14.6494, lng:120.9673 },
  Malabon:            { lat:14.6628, lng:120.9575 },
  Navotas:            { lat:14.6667, lng:120.9417 },
  Valenzuela:         { lat:14.7011, lng:120.9830 },
  'Las Piñas':        { lat:14.4453, lng:120.9829 },
  Parañaque:          { lat:14.4793, lng:121.0198 },
  Muntinlupa:         { lat:14.4081, lng:121.0415 },
  Pasay:              { lat:14.5378, lng:120.9938 },
  'San Juan':         { lat:14.6019, lng:121.0355 },
  BGC:                { lat:14.5409, lng:121.0503 },
  Pateros:            { lat:14.5436, lng:121.0683 },
  // Bulacan
  Hagonoy:            { lat:14.8340, lng:120.7310 },
  Malolos:            { lat:14.8430, lng:120.8110 },
  Meycauayan:         { lat:14.7350, lng:120.9580 },
  Marilao:            { lat:14.7580, lng:120.9490 },
  Balagtas:           { lat:14.8140, lng:120.9090 },
  Bocaue:             { lat:14.7970, lng:120.9290 },
  Pulilan:            { lat:14.8990, lng:120.8490 },
  Calumpit:           { lat:14.9150, lng:120.7650 },
  Guiguinto:          { lat:14.8290, lng:120.8790 },
  Obando:             { lat:14.7117, lng:120.9386 },
  'San Jose del Monte': { lat:14.8139, lng:121.0453 },
  Bulacan:            { lat:14.7942, lng:120.8800 },
  // Cavite
  Bacoor:             { lat:14.4624, lng:120.9645 },
  Imus:               { lat:14.4297, lng:120.9367 },
  Dasmarinas:         { lat:14.3294, lng:120.9367 },
  Kawit:              { lat:14.4353, lng:120.9014 },
  Noveleta:           { lat:14.4281, lng:120.8789 },
  Rosario:            { lat:14.4153, lng:120.8508 },
  'General Trias':    { lat:14.3867, lng:120.8817 },
  'Cavite City':      { lat:14.4824, lng:120.8960 },
  // Laguna
  'San Pedro':        { lat:14.3592, lng:121.0128 },
  Biñan:              { lat:14.3406, lng:121.0792 },
  'Santa Rosa':       { lat:14.3122, lng:121.1114 },
  Cabuyao:            { lat:14.2758, lng:121.1244 },
  Calamba:            { lat:14.2117, lng:121.1653 },
  'Los Baños':        { lat:14.1667, lng:121.2333 },
  'San Pablo':        { lat:14.0686, lng:121.3247 },
  // Rizal
  Antipolo:           { lat:14.5864, lng:121.1761 },
  Cainta:             { lat:14.5783, lng:121.1228 },
  Taytay:             { lat:14.5514, lng:121.1322 },
  Angono:             { lat:14.5244, lng:121.1536 },
  Binangonan:         { lat:14.4672, lng:121.1975 },
  Morong:             { lat:14.5297, lng:121.2394 },
  Baras:              { lat:14.5219, lng:121.2703 },
  // Pampanga
  Angeles:            { lat:15.1450, lng:120.5888 },
  'San Fernando (Pampanga)': { lat:15.0289, lng:120.6900 },
  Mabalacat:          { lat:15.2167, lng:120.5667 },
  Porac:              { lat:15.0736, lng:120.5364 },
  // Batangas
  'Batangas City':    { lat:13.7565, lng:121.0583 },
  Lipa:               { lat:13.9411, lng:121.1628 },
  Tanauan:            { lat:14.0844, lng:121.1503 },
  Nasugbu:            { lat:14.0667, lng:120.6333 },
  // Nueva Ecija
  Cabanatuan:         { lat:15.4864, lng:120.9670 },
  Gapan:              { lat:15.3072, lng:120.9458 },
  'San Jose':         { lat:15.7833, lng:120.9833 },
  Palayan:            { lat:15.5400, lng:121.0800 },
  // Pangasinan
  Dagupan:            { lat:16.0433, lng:120.3333 },
  Urdaneta:           { lat:15.9761, lng:120.5711 },
  Lingayen:           { lat:16.0167, lng:120.2333 },
  'San Carlos':       { lat:15.9269, lng:120.3525 },
  // La Union
  'San Fernando (La Union)': { lat:16.6159, lng:120.3166 },
  Agoo:               { lat:16.3258, lng:120.3697 },
  Bauang:             { lat:16.5333, lng:120.3333 },
  // Benguet
  Baguio:             { lat:16.4023, lng:120.5960 },
  'La Trinidad':      { lat:16.4617, lng:120.5872 },
  Itogon:             { lat:16.3697, lng:120.6703 },
  // Tarlac
  'Tarlac City':      { lat:15.4755, lng:120.5963 },
  Capas:              { lat:15.3319, lng:120.5883 },
  Bamban:             { lat:15.2628, lng:120.5583 },
  // Zambales
  Olongapo:           { lat:14.8285, lng:120.2824 },
  Subic:              { lat:14.7433, lng:120.2414 },
  Iba:                { lat:15.3258, lng:119.9786 },
  // Bataan
  Balanga:            { lat:14.6760, lng:120.5360 },
  Mariveles:          { lat:14.4333, lng:120.4833 },
  Dinalupihan:        { lat:14.8747, lng:120.4636 },
  // Cagayan
  Tuguegarao:         { lat:17.6133, lng:121.7270 },
  Aparri:             { lat:18.3564, lng:121.6406 },
  // Isabela
  Cauayan:            { lat:16.9333, lng:121.7667 },
  Santiago:           { lat:16.6875, lng:121.5500 },
  Ilagan:             { lat:17.1489, lng:121.8894 },
  // Nueva Vizcaya
  Bayombong:          { lat:16.4833, lng:121.1500 },
  Solano:             { lat:16.5167, lng:121.1833 },
};

// Manila — always a safe Luzon fallback for any city string not in the table.
export const LUZON_FALLBACK_COORDS = { lat: 14.5995, lng: 120.9842 };

export function resolveCityCoords(city) {
  return CITY_COORDS[city] || null;
}
