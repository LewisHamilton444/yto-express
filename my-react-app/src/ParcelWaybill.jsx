import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, QrCode as QrIcon } from 'lucide-react';
import { buildWaybill } from './services/waybill';

// ============================================================================
// Parcel QR + printable waybill (7-Section Thermal Sticker Parity).
//
// Formats standard A6 shipping stickers (100mm x 150mm) matching Android
// WaybillGeneratorUtils.java with full vector Code 128 1D barcode, routing
// banner, stacked consignee and merchant details, payment stamp box, 2D QR code,
// and verified YTO hotline footer.
// ============================================================================

const PRINT_STYLE = `
@media print {
  @page {
    size: 100mm 150mm;
    margin: 0;
  }
  body * { visibility: hidden !important; }
  .waybill-print-area, .waybill-print-area * { visibility: visible !important; }
  .waybill-print-area {
    position: absolute !important;
    left: 0; top: 0;
    width: 100mm !important;
    min-height: 148mm !important;
    max-height: 148mm !important;
    box-sizing: border-box !important;
    margin: 0 !important;
    padding: 3mm !important;
    box-shadow: none !important;
    border: 2px solid #000 !important;
  }
  .waybill-no-print { display: none !important; }
}
`;

// Standard Code 128 Pattern Table (Subset B)
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

function generateCode128Modules(text) {
  if (!text) return [];
  const clean = String(text).trim();
  const codes = [104]; // Start Code B
  let sum = 104;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i) - 32;
    if (code >= 0 && code <= 95) {
      codes.push(code);
      sum += code * (i + 1);
    }
  }
  codes.push(sum % 103); // Checksum
  codes.push(106); // Stop symbol

  const modules = [];
  codes.forEach(code => {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) return;
    let isBar = true;
    for (let i = 0; i < pattern.length; i++) {
      const width = parseInt(pattern[i], 10);
      for (let w = 0; w < width; w++) {
        modules.push(isBar);
      }
      isBar = !isBar;
    }
  });
  return modules;
}

function Barcode1D({ text, height = 48 }) {
  const modules = useMemo(() => generateCode128Modules(text), [text]);
  if (!modules.length) return null;
  const quietZone = 10;
  const totalWidth = modules.length + quietZone * 2;
  const rects = [];
  let barStart = null;
  for (let i = 0; i < modules.length; i++) {
    const x = quietZone + i;
    if (modules[i]) {
      if (barStart === null) barStart = x;
    } else {
      if (barStart !== null) {
        rects.push(<rect key={barStart} x={barStart} y={0} width={x - barStart} height={height} fill="#000" />);
        barStart = null;
      }
    }
  }
  if (barStart !== null) {
    rects.push(<rect key={barStart} x={barStart} y={0} width={quietZone + modules.length - barStart} height={height} fill="#000" />);
  }

  return (
    <svg viewBox={`0 0 ${totalWidth} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: 'block' }}>
      {rects}
    </svg>
  );
}

function formatIssuedDate(createdAt) {
  const d = createdAt ? new Date(createdAt) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatPhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('9')) {
    return `+63 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  if (digits.length === 12 && digits.startsWith('63')) {
    return `+63 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `+63 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return phone;
}

export default function ParcelWaybill({ parcel }) {
  const waybill = useMemo(() => buildWaybill(parcel), [parcel]);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrError, setQrError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const payload = waybill.qrPayload;
    if (!payload) {
      setQrDataUrl('');
      return () => { cancelled = true; };
    }
    QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 240 })
      .then((url) => { if (!cancelled) { setQrDataUrl(url); setQrError(''); } })
      .catch((err) => { if (!cancelled) { setQrDataUrl(''); setQrError(err.message || 'Could not build the code'); } });
    return () => { cancelled = true; };
  }, [waybill.qrPayload]);

  if (!waybill.trackingNumber) return null;

  const isCod = waybill.package.paymentMode?.toUpperCase() === 'COD' || Number(waybill.package.codAmount || 0) > 0;
  const serviceType = (waybill.routing.serviceType || 'STANDARD').toUpperCase();

  return (
    <div>
      <style>{PRINT_STYLE}</style>

      {/* Top operator action header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }} className="waybill-no-print">
        <div style={{ fontSize: 10, fontWeight: 800, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.7 }}>Parcel Code &amp; Waybill</div>
        <button
          type="button"
          onClick={() => window.print()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'white', background: '#390955', border: 'none', borderRadius: 'var(--yto-radius-button, 8px)', padding: '6px 14px', cursor: 'pointer' }}
        >
          <Printer size={12} aria-hidden="true" /> Print waybill
        </button>
      </div>

      {/* Operator scannable QR inspect box */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', background: '#faf8ff', border: '1.5px solid #e8e0f5', borderRadius: 12, padding: 14 }} className="waybill-no-print">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt={`Scannable code for parcel ${waybill.trackingNumber}`} width={132} height={132} style={{ borderRadius: 8, border: '1px solid #e2d8f2', background: 'white', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 132, height: 132, borderRadius: 8, border: '1px dashed #d4c8e8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'white' }}>
            <QrIcon size={26} strokeWidth={1.5} color="#c4a8d8" aria-hidden="true" />
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Scan value</div>
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: 12, fontWeight: 700, color: '#1a1a1a', wordBreak: 'break-all' }}>{waybill.qrPayload}</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
            {qrError ? `Code unavailable: ${qrError}` : 'The rider app scans this to open the parcel.'}
          </div>
          <div style={{ fontSize: 11, color: '#390955', fontWeight: 700, marginTop: 6 }}>Sort code {waybill.routing.sortCode}</div>
        </div>
      </div>

      {/* Authentic A6 100x150mm Thermal Sticker Card (7-Section Parity) */}
      <div
        className="waybill-print-area"
        style={{
          marginTop: 14,
          background: 'white',
          border: '2.5px solid #000',
          borderRadius: 2,
          padding: 0,
          maxWidth: 440,
          boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#000',
        }}
      >
        {/* Section 1: Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px 8px', borderBottom: '2.5px solid #000' }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: 0.5, lineHeight: 1.1 }}>YTO EXPRESS</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#333', marginTop: 2 }}>Official Logistics Air Waybill</div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Issued: {formatIssuedDate(waybill.createdAt)}</div>
          </div>
          <div>
            <div
              style={{
                background: '#000',
                color: '#fff',
                borderRadius: 6,
                padding: '5px 14px',
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: 0.5,
                textAlign: 'center',
                textTransform: 'uppercase',
              }}
            >
              {serviceType}
            </div>
          </div>
        </div>

        {/* Section 2: Routing Hub Banner */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#efefef', padding: '7px 12px', borderBottom: '2.5px solid #000' }}>
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 }}>ROUTING &amp; SORT HUB:</div>
            <div style={{ fontSize: 13.5, fontWeight: 900, color: '#000', marginTop: 1 }}>
              {waybill.routing.originHub?.split(' ')[0] || 'BUL-PUL-01'} &nbsp;➔&nbsp; {waybill.routing.destinationHub || 'Bulacan Hub'}
            </div>
          </div>
          <div>
            <div
              style={{
                background: '#000',
                color: '#fff',
                fontFamily: "'Courier New', monospace",
                fontSize: 12,
                fontWeight: 900,
                padding: '4px 8px',
                borderRadius: 4,
                letterSpacing: 0.5,
              }}
            >
              {waybill.routing.sortCode || 'BUL-MAL-02-D01'}
            </div>
          </div>
        </div>

        {/* Section 3: 1D Barcode Section */}
        <div style={{ padding: '8px 16px 6px', textAlign: 'center', borderBottom: '2.5px solid #000' }}>
          <div style={{ maxWidth: 360, margin: '0 auto' }}>
            <Barcode1D text={waybill.trackingNumber} height={50} />
          </div>
          <div
            style={{
              fontFamily: "'Courier New', monospace",
              fontSize: 13,
              fontWeight: 900,
              letterSpacing: 2,
              marginTop: 4,
              color: '#000',
            }}
          >
            {waybill.trackingNumber.split('').join(' ')}
          </div>
        </div>

        {/* Section 4: Deliver To & Sender Boxes */}
        <div>
          {/* Deliver To / Recipient */}
          <div style={{ padding: '7px 12px 8px' }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 }}>SHIP TO / DELIVER TO:</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#000', marginTop: 2 }}>
              {waybill.recipient.name || 'Customer'}
            </div>
            {waybill.recipient.phone && (
              <div style={{ fontSize: 11, fontWeight: 800, color: '#000', marginTop: 2 }}>
                Phone: {formatPhone(waybill.recipient.phone)}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#222', marginTop: 2, lineHeight: 1.35 }}>
              {waybill.recipient.address || 'Delivery Address'}
            </div>
            {waybill.recipient.enterpriseId && (
              <div style={{ fontSize: 9.5, fontFamily: "'Courier New', monospace", color: '#555', marginTop: 2 }}>
                Customer ID: {waybill.recipient.enterpriseId}
              </div>
            )}
          </div>

          <div style={{ borderBottom: '1px solid #000' }} />

          {/* From / Sender */}
          <div style={{ padding: '7px 12px 8px' }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 }}>FROM / SENDER:</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#000', marginTop: 2 }}>
              {waybill.sender.storeName || waybill.sender.name || 'Merchant Store'}
            </div>
            {waybill.sender.phone && (
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#000', marginTop: 1 }}>
                Contact: {formatPhone(waybill.sender.phone)}
              </div>
            )}
            <div style={{ fontSize: 10.5, color: '#222', marginTop: 1, lineHeight: 1.3 }}>
              {waybill.sender.address || 'Pickup Location'}
            </div>
            {waybill.sender.enterpriseId && (
              <div style={{ fontSize: 9.5, fontFamily: "'Courier New', monospace", color: '#555', marginTop: 2 }}>
                Seller ID: {waybill.sender.enterpriseId}
              </div>
            )}
          </div>
        </div>

        {/* Section 5: Package Specification & Payment Mode */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', borderTop: '2.5px solid #000', borderBottom: '2.5px solid #000' }}>
          <div style={{ padding: '7px 12px 8px' }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
              PACKAGE SPECIFICATION:
            </div>
            <div style={{ fontSize: 10.5, color: '#000', lineHeight: 1.4 }}>
              <div>Weight: <strong>{waybill.package.weight || '1.0'} kg</strong> &nbsp;•&nbsp; Qty: <strong>{waybill.package.count || 1} pc(s)</strong></div>
              <div>Dims: {waybill.package.dimensions}</div>
              <div>Item: <strong>{waybill.package.productName || waybill.package.category}</strong></div>
              {waybill.package.notes && (
                <div style={{ fontSize: 9.5, fontStyle: 'italic', color: '#555', marginTop: 2 }}>
                  Notes: {waybill.package.notes}
                </div>
              )}
            </div>
          </div>

          <div style={{ borderLeft: '1px solid #000', padding: '7px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isCod ? (
              <div style={{ width: '100%', background: '#000', color: '#fff', borderRadius: 6, padding: '7px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5 }}>CASH ON DELIVERY</div>
                <div style={{ fontSize: 17, fontWeight: 900, marginTop: 2, letterSpacing: 0.5 }}>
                  ₱ {Number(waybill.package.codAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 8, opacity: 0.9, marginTop: 2 }}>Collect amount from recipient</div>
              </div>
            ) : (
              <div style={{ width: '100%', border: '2px solid #000', borderRadius: 6, padding: '7px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#000', letterSpacing: 0.5 }}>PREPAID</div>
                <div style={{ fontSize: 9.5, fontWeight: 800, color: '#000', marginTop: 2 }}>DO NOT COLLECT CASH</div>
                <div style={{ fontSize: 8, color: '#555', marginTop: 2 }}>Shipping fee settled online</div>
              </div>
            )}
          </div>
        </div>

        {/* Section 6: 2D QR Code & Security Terms */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #000' }}>
          <div style={{ flexShrink: 0 }}>
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt={`Waybill QR ${waybill.trackingNumber}`}
                width={88}
                height={88}
                style={{ border: '1px solid #000', display: 'block' }}
              />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 9, color: '#222', lineHeight: 1.35 }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: '#000', marginBottom: 3 }}>
              LOGISTICS VERIFICATION &amp; TERMS:
            </div>
            <div>• Handle with care - fragile contents protected</div>
            <div>• Scan QR code for live delivery proof &amp; tracking</div>
            <div>• Tampering with this seal is strictly prohibited</div>
            {(waybill.sender.enterpriseId || waybill.recipient.enterpriseId) && (
              <div style={{ marginTop: 3, fontFamily: "'Courier New', monospace", fontWeight: 700, fontSize: 8.5 }}>
                Enterprise Ref: {waybill.sender.enterpriseId || waybill.recipient.enterpriseId}
              </div>
            )}
          </div>
        </div>

        {/* Section 7: Footer & 24/7 Hotline */}
        <div style={{ padding: '5px 10px', textAlign: 'center', fontSize: 9, fontStyle: 'italic', fontWeight: 600, color: '#444' }}>
          YTO Express Philippines Network • 24/7 Hotline (02) 845-99999
        </div>
      </div>
    </div>
  );
}
