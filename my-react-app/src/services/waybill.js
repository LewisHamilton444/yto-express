// ============================================================================
// Waybill / shipping-label builder — PARITY PORT of the mobile backend's
// buildWaybillPayload (A yto_express_backend/controllers/shipmentController.js
// :2386) behind GET /api/shipments/tracking/:trackingId/waybill.
//
// Why a port and not a re-implementation: the portal prints the SAME physical
// label the app does (A6 thermal 100x150mm, the same origin hub, the same
// destination hub code and sort code). If either side drifts, the same parcel
// prints two different sort codes and the hub mis-sorts it — so the resolver
// table below is copied 1:1, in the same order, with the same fallback, and the
// pairing is asserted by scripts/qa/waybillParityCheck (run with the real A
// module) rather than trusted by eye.
// ============================================================================

const ORIGIN_HUB = {
  code: 'BUL-PUL-01',
  name: 'Pulilan Main Sorting Hub',
};

/** A6 thermal label geometry — same template the app prints. */
export const WAYBILL_TEMPLATE = {
  name: 'A6_THERMAL_100x150',
  widthMm: 100,
  heightMm: 150,
  dpi: 203,
};

// 1:1 with A's resolveDestinationHub (shipmentController.js:2348-2371). Order
// matters: the first substring match wins, exactly as it does on the app side.
export function resolveDestinationHub(address) {
  const addr = String(address || '').toLowerCase();

  if (addr.includes('pulilan')) return { code: 'BUL-PUL-01', name: 'Pulilan Hub', sortCode: 'BUL-PUL-01-D01' };
  if (addr.includes('malolos')) return { code: 'BUL-MAL-02', name: 'Malolos Hub', sortCode: 'BUL-MAL-02-D02' };
  if (addr.includes('meycauayan')) return { code: 'BUL-MEY-03', name: 'Meycauayan Hub', sortCode: 'BUL-MEY-03-D03' };
  if (addr.includes('baliuag') || addr.includes('baliwag')) return { code: 'BUL-BAL-04', name: 'Baliuag Hub', sortCode: 'BUL-BAL-04-D04' };
  if (addr.includes('san jose del monte') || addr.includes('sjdm')) return { code: 'BUL-SJD-05', name: 'SJDM Hub', sortCode: 'BUL-SJD-05-D05' };
  if (addr.includes('marilao')) return { code: 'BUL-MAR-06', name: 'Marilao Hub', sortCode: 'BUL-MAR-06-D06' };
  if (addr.includes('santa maria') || addr.includes('sta. maria') || addr.includes('sta maria')) return { code: 'BUL-STM-07', name: 'Santa Maria Hub', sortCode: 'BUL-STM-07-D07' };
  if (addr.includes('guiguinto')) return { code: 'BUL-GUI-08', name: 'Guiguinto Hub', sortCode: 'BUL-GUI-08-D08' };
  if (addr.includes('calumpit')) return { code: 'BUL-CAL-09', name: 'Calumpit Hub', sortCode: 'BUL-CAL-09-D09' };
  if (addr.includes('plaridel')) return { code: 'BUL-PLA-10', name: 'Plaridel Hub', sortCode: 'BUL-PLA-10-D10' };
  if (addr.includes('bocaue')) return { code: 'BUL-BOC-11', name: 'Bocaue Hub', sortCode: 'BUL-BOC-11-D11' };
  if (addr.includes('hagonoy')) return { code: 'BUL-HAG-12', name: 'Hagonoy Hub', sortCode: 'BUL-HAG-12-D12' };
  if (addr.includes('bulacan')) return { code: 'BUL-GEN-13', name: 'Bulacan Central Hub', sortCode: 'BUL-GEN-13-D13' };
  if (addr.includes('manila') || addr.includes('quezon') || addr.includes('makati') || addr.includes('taguig') || addr.includes('pasig') || addr.includes('caloocan')) {
    return { code: 'NCR-MNL-01', name: 'Metro Manila Hub', sortCode: 'NCR-MNL-01-D01' };
  }
  if (addr.includes('pampanga') || addr.includes('angeles') || addr.includes('san fernando')) {
    return { code: 'PAM-SFE-01', name: 'Pampanga Hub', sortCode: 'PAM-SFE-01-D01' };
  }
  return { code: 'PH-MAIN-01', name: 'Main Distribution Hub', sortCode: 'PH-MAIN-01-D01' };
}

// 1:1 with A's formatWaybillDimensions (shipmentController.js:2375-2384): a
// stored row may hold a display string or a {length,width,height} / {l,w,h}
// object, and an all-zero box falls back to the same default label text.
export function formatWaybillDimensions(dims) {
  if (typeof dims === 'string') return dims || '25 x 20 x 10 cm';
  if (dims && typeof dims === 'object') {
    const l = dims.length ?? dims.l ?? 0;
    const w = dims.width ?? dims.w ?? 0;
    const h = dims.height ?? dims.h ?? 0;
    if (l || w || h) return `${l} x ${w} x ${h} cm`;
  }
  return '25 x 20 x 10 cm';
}

/**
 * Build the label payload from a portal parcel row (the /api/parcels document),
 * in the same shape A returns from its waybill endpoint.
 *
 * The canonical QR payload is the ONE the portal itself minted on sync-parcel
 * (`Parcel.qrPayload`, YTOQR1|<tracking>|<sellerEntId>|<customerEntId>), which
 * is exactly what A stores on Shipment.webQrPayload and prefers for its label —
 * so a portal-printed label carries the same code the app's scanner reads. It
 * degrades to the bare tracking number when no enterprise party resolved, on
 * both sides.
 */
export function buildWaybill(parcel, options = {}) {
  const routing = resolveDestinationHub(parcel?.destination || parcel?.address);
  const trackingNumber = parcel?.trackingNumber || '';
  const qrPayload = options.qrPayload
    || parcel?.qrPayload
    || trackingNumber;

  const dims = parcel?.dimensions;
  const dimensions = typeof dims === 'object' && dims !== null && (dims.length || dims.width || dims.height)
    ? dims
    : dims;

  return {
    trackingNumber,
    barcodePayload: trackingNumber,
    qrPayload,
    template: WAYBILL_TEMPLATE.name,
    dimensionsMm: { widthMm: WAYBILL_TEMPLATE.widthMm, heightMm: WAYBILL_TEMPLATE.heightMm, dpi: WAYBILL_TEMPLATE.dpi },
    routing: {
      originHub: `${ORIGIN_HUB.code} (${ORIGIN_HUB.name})`,
      destinationHub: routing.name,
      destinationHubCode: routing.code,
      sortCode: routing.sortCode,
      serviceType: parcel?.packageType || 'Standard',
    },
    sender: {
      name: parcel?.sender?.name || '',
      phone: parcel?.sender?.phone || '',
      storeName: parcel?.sender?.storeName || '',
      address: parcel?.pickupAddress || parcel?.origin || '',
      email: parcel?.sender?.email || '',
      enterpriseId: parcel?.sellerEnterpriseId || '',
    },
    recipient: {
      name: parcel?.receiver?.name || '',
      phone: parcel?.receiver?.phone || '',
      address: parcel?.deliveryAddress || parcel?.address || '',
      email: parcel?.receiver?.email || '',
      enterpriseId: parcel?.customerEnterpriseId || '',
    },
    package: {
      weight: parcel?.weight || '',
      count: parcel?.packageCount || 1,
      category: parcel?.packageCategory || parcel?.category || 'Standard Parcel',
      productName: parcel?.productName || parcel?.contents || '',
      type: parcel?.packageType || 'Standard',
      paymentMode: parcel?.paymentMode || 'COD',
      codAmount: parcel?.codAmountValue ?? 0,
      deliveryFee: parcel?.deliveryFeeValue ?? 0,
      dimensions: formatWaybillDimensions(dimensions),
      notes: parcel?.instructions && parcel.instructions !== '—' ? parcel.instructions : '',
    },
    status: parcel?.status || 'Pending',
    createdAt: parcel?.createdAt || null,
    estimatedDeliveryDate: parcel?.estimatedDeliveryDate || null,
  };
}
