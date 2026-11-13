const CACHE_NAME = 'survey-pro-cache-v9.0.9';

// Local files (a missing file is skipped; it no longer breaks the whole install)
const localFiles = [
  './', './index.html', './app.html', './blog.html', './privacy.html', './terms.html', './about.html',
  './post1.html', './post2.html', './post3.html', './post4.html', './post5.html',
  './style.css', './leaflet.css', './leaflet.js',
  './formulas.js', './globals.js', './map_01_measure.js', './map_02_toolgate_drawbar.js', './map_03_online.js', './map_04_dxf_import.js',
  './map_05_dxf_canvas.js', './map_06_plot_grid.js', './map_07_profile.js', './dxf_tools.js', './app_conversions.js',
  './module_cogo_stakeout.js', './sv_01_topo.js', './sv_02_contour_clip.js', './sv_03_export_3d_kml.js', './sv_04_volume_ui.js',
  './sv_05_volume_calc.js', './sv_06_profile_section.js', './sv_07_pfcs_dxf.js', './sv_08_contour_labels.js', './app_camera.js', './app_logic.js',
  './manifest.json', './egm2008_1min.bin', './egm96_global.bin', './icon-192.png', './icon-512.png'
];

// CDN libraries needed offline (DXF import, TIN, 3D / volume)
const cdnFiles = [
  'https://unpkg.com/dxf-parser@1.1.2/dist/dxf-parser.js',
  'https://unpkg.com/delaunator@5.0.0/delaunator.min.js',
  'https://cdn.plot.ly/plotly-2.27.0.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      const jobs = localFiles.map(u => cache.add(u).catch(() => console.warn('SW skip:', u)));
      cdnFiles.forEach(u => jobs.push(
        fetch(u, { mode: 'no-cors' }).then(r => cache.put(u, r)).catch(() => console.warn('SW skip:', u))
      ));
      return Promise.all(jobs);
    })
  );
  self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.map(n => (n !== CACHE_NAME) ? caches.delete(n) : null)
    ))
  );
  self.clients.claim();
});
