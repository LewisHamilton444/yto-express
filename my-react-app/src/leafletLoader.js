'use client';

// Shared singleton loader for the Leaflet CDN assets, so multiple map
// components mounting around the same time don't race two <script> injections.
let leafletPromise = null;

export function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  if (!document.getElementById('lf-css')) {
    const link = document.createElement('link');
    link.id = 'lf-css';
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(link);
  }

  leafletPromise = new Promise((resolve) => {
    const existing = document.getElementById('lf-js');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L));
      return;
    }
    const script = document.createElement('script');
    script.id = 'lf-js';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.onload = () => resolve(window.L);
    document.head.appendChild(script);
  });

  return leafletPromise;
}
