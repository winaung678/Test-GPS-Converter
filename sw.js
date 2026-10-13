const CACHE_NAME = 'survey-pro-cache-v9.0.7'; 

const urlsToCache = [
  './',
  './post1.html',
  './post2.html',
  './post3.html',
  './post4.html',
  './post5.html',
  './index.html',
  './app.html',
  './blog.html',      // 🔴 အသစ်ထည့်ထားသည်
  './privacy.html',   // 🔴 အသစ်ထည့်ထားသည်
  './terms.html',     // 🔴 အသစ်ထည့်ထားသည်
  './about.html',     // 🔴 အသစ်ထည့်ထားသည်
  './style.css',
  './leaflet.css',
  './leaflet.js',
  './formulas.js',
  './globals.js',
  './map_engine.js',
  './app_conversions.js',
  './app_survey_tools.js',
  './app_camera.js',
  './app_logic.js',
  './egm2008_1min.bin',
  './egm96_global.bin',
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/dxf-parser/dist/dxf-parser.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
  // 🔴 ချက်ချင်း Update ဖြစ်စေရန် ထည့်ထားသည်
  self.skipWaiting(); 
});

self.addEventListener('fetch', event => {
  // ads.txt သို့မဟုတ် Google AdSense နဲ့ ပတ်သက်တာတွေကို Cache ထဲက မပေးဘဲ တိုက်ရိုက်ယူခိုင်းမည် (အရေးကြီး)
  if (event.request.url.includes('ads.txt') || event.request.url.includes('pagead2.googlesyndication.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) { return response; }
        return fetch(event.request);
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName); // Cache အဟောင်းတွေ ဖျက်မယ်
          }
        })
      );
    })
  );
  // 🔴 ပွင့်နေတဲ့ Page တွေကို Service Worker အသစ်က ချက်ချင်းလွှမ်းမိုးစေရန် ထည့်ထားသည်
  self.clients.claim(); 
});
