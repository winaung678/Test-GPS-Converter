// ==========================================================================
// TOPO LARGE-DATA HELPERS - Point သောင်း/သိန်းချီ project များအတွက်
//
//  1) topoMakeConverter / topoBuildLLCache : N,E -> Lat/Lon ကို point တစ်ခုကို တစ်ကြိမ်သာ တွက်ပြီး Float64Array ထဲ cache
//  2) fillPointsLayer : Point ၈,၀၀၀ အောက် = မူလအတိုင်း marker အကုန်၊ ပိုများလျှင် "မြင်ရတဲ့ဧရိယာ" က point များကိုသာ
//                       (အများဆုံး ၅,၀၀၀ marker၊ screen cell တစ်ခုမှာ တစ်ခု) marker ဆောက်ပြီး pan/zoom ပြီးတိုင်း ပြန်ဆောက်
//  3) L.TopoTinLayer : TIN ကို Leaflet polygon သိန်းချီအစား canvas တစ်ခုတည်းဖြင့် (မြင်ရသော triangle များသာ၊ များလွန်းလျှင် zoom-in ညွှန်)
//  ဤဖိုင်ကို sv_01_topo.js ရှေ့တွင် load ရမည် (Leaflet load ပြီးနောက်)
// ==========================================================================
(function () {
    'use strict';
    var W = window;
    var VIRTUAL_THRESHOLD = 8000;   // ဒီ point အရေအတွက်အထိ marker အကုန်ဆောက် (မူလ အပြုအမူ)
    var MAX_MARKERS = 5000;         // virtual mode မှာ တစ်ကြိမ်ပြမည့် marker အများဆုံး
    var MAX_TRI_DRAW = 60000;       // TIN canvas မှာ တစ်ကြိမ်ဆွဲမည့် triangle အများဆုံး

    // ---------------------------------------------------------------- datum converter
    W.topoDatumKey = function () {
        var sel = document.getElementById('topo_datum'); var d = sel ? sel.value : 'WGS_LL';
        if (d === 'GLOBAL_UTM') {
            var z = document.getElementById('topo_custom_zone'), h = document.getElementById('topo_custom_hemi');
            d += '|' + (z ? z.value : '') + '|' + (h ? h.value : '');
        } else if (d === 'LOCAL') { d += '|' + (W.localOffsetN || 0) + '|' + (W.localOffsetE || 0); }
        return d;
    };

    // (n, e) -> [lat, lon]  (မူလ code ထဲက datum ခွဲပုံအတိုင်း - အကြိမ်တိုင်း DOM မဖတ်ဘဲ တစ်ကြိမ်သာဖတ်)
    W.topoMakeConverter = function (datum) {
        if (datum === undefined || datum === null) { var sel = document.getElementById('topo_datum'); datum = sel ? sel.value : 'WGS_LL'; }
        if (datum === 'LOCAL') {
            var oN = W.localOffsetN || 0, oE = W.localOffsetE || 0;
            return function (n, e) { return [(n - oN) / 100000, (e - oE) / 100000]; };
        }
        if (datum === 'SVY21') return function (n, e) { var r = calc_v2_rev(e, n); return [r.lat, r.lon]; };
        if (datum.indexOf('MM') === 0) {
            var zoneM = parseInt(datum.slice(-2));
            return function (n, e) {
                var r = m_inverse(e, n, zoneM, m_EVE); var x = m_llh2xyz(r.lat, r.lon, 0, m_EVE);
                var w = m_xyz2llh(x.x - m_DX, x.y - m_DY, x.z - m_DZ, m_WGS); return [w.lat, w.lon];
            };
        }
        if (datum.indexOf('WGS_UTM') === 0) {
            var zoneW = parseInt(datum.slice(-2));
            return function (n, e) { var i = m_inverse(e, n, zoneW, m_WGS); return [i.lat, i.lon]; };
        }
        if (datum === 'GLOBAL_UTM') {
            var zInput = document.getElementById('topo_custom_zone'), hInput = document.getElementById('topo_custom_hemi');
            var zoneG = (zInput && zInput.value) ? parseInt(zInput.value) : 47, hemi = hInput ? hInput.value : 'N';
            return function (n, e) { var calcN = n; if (hemi === 'S') calcN -= 10000000; var i = m_inverse(e, calcN, zoneG, m_WGS); return [i.lat, i.lon]; };
        }
        return function (n, e) { return [n, e]; };   // WGS_LL
    };

    // points[] အတွက် lat/lon (+ Web-Mercator 0..1) ကို Float64Array များထဲ တစ်ကြိမ်တွက်သိမ်း
    W.topoBuildLLCache = function (points, conv, datumKey) {
        var N = points.length, lat = new Float64Array(N), lon = new Float64Array(N), mx = new Float64Array(N), my = new Float64Array(N);
        var valid = 0, minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
        var LIM = 85.0511287798, TWO_PI = 2 * Math.PI;
        for (var i = 0; i < N; i++) {
            var p = points[i], ll = conv(p.n, p.e), la = ll[0], lo = ll[1];
            if (isNaN(la) || isNaN(lo)) { lat[i] = NaN; lon[i] = NaN; mx[i] = NaN; my[i] = NaN; continue; }
            lat[i] = la; lon[i] = lo;
            var c = la > LIM ? LIM : (la < -LIM ? -LIM : la);
            mx[i] = (lo + 180) / 360;
            my[i] = 0.5 - Math.log(Math.tan(Math.PI / 4 + c * Math.PI / 360)) / TWO_PI;
            valid++;
            if (la < minLat) minLat = la; if (la > maxLat) maxLat = la; if (lo < minLon) minLon = lo; if (lo > maxLon) maxLon = lo;
        }
        var cache = { pts: points, key: datumKey, n: N, lat: lat, lon: lon, mx: mx, my: my, valid: valid, minLat: minLat, maxLat: maxLat, minLon: minLon, maxLon: maxLon };
        W.topoLLCache = cache;
        return cache;
    };
    // လက်ရှိ topoPoints + datum အတွက် cache (မရှိ/ဟောင်းလျှင် ပြန်တည်ဆောက်)
    W.topoGetLLCache = function () {
        var pts = W.topoPoints, key = W.topoDatumKey(), c = W.topoLLCache;
        if (c && c.pts === pts && c.key === key && c.n === pts.length) return c;
        return W.topoBuildLLCache(pts, W.topoMakeConverter(), key);
    };

    // ---------------------------------------------------------------- virtual / full point layer
    var moveTimer = null;
    function onMapMove() { clearTimeout(moveTimer); moveTimer = setTimeout(function () { W.refreshTopoPointsView(); }, 120); }

    // W.topoPointsLayer (L.layerGroup) ကို ကြိုဆောက်ပြီးမှ ခေါ်ရမည်။ makeMarker(pt, lat, lon) -> L marker
    W.fillPointsLayer = function (points, cache, makeMarker) {
        var group = W.topoPointsLayer, map = W.leafletMap;
        if (map) map.off('moveend', onMapMove);
        W._topoPtsVirt = null;
        if (cache.n <= VIRTUAL_THRESHOLD) {                       // အနည်းငယ် - မူလအတိုင်း marker အကုန်
            for (var i = 0; i < cache.n; i++) {
                if (isNaN(cache.lat[i])) continue;
                group.addLayer(makeMarker(points[i], cache.lat[i], cache.lon[i]));
            }
            return;
        }
        W._topoPtsVirt = { group: group, points: points, cache: cache, makeMarker: makeMarker };
        group.isDxfCanvas = true;                                  // zoomToCustomLayer က getBounds() ကို သုံးစေရန်
        group.getBounds = function () { return L.latLngBounds([[cache.minLat, cache.minLon], [cache.maxLat, cache.maxLon]]); };
        if (map) map.on('moveend', onMapMove);
        W.refreshTopoPointsView();
    };

    W.refreshTopoPointsView = function () {
        var st = W._topoPtsVirt, map = W.leafletMap;
        if (!st || !map || !map.hasLayer(st.group)) return;
        var c = st.cache, lat = c.lat, lon = c.lon, n = c.n;
        var b = map.getBounds().pad(0.25), S = b.getSouth(), Nn = b.getNorth(), Wd = b.getWest(), E = b.getEast();
        var idx = [];
        for (var i = 0; i < n; i++) {
            var la = lat[i], lo = lon[i];
            if (la >= S && la <= Nn && lo >= Wd && lo <= E) idx.push(i);   // NaN ကို ဤစစ်ချက်က ဖယ်ပေး
        }
        var chosen = idx;
        if (idx.length > MAX_MARKERS) {                                    // screen cell တစ်ခုမှာ တစ်ခုသာ (zoom out ချိန် ညီညာစွာ ပြ)
            var size = map.getSize(), scale = 256 * Math.pow(2, map.getZoom());
            var cell = Math.max(4, Math.ceil(Math.sqrt(size.x * size.y * 2.25 / MAX_MARKERS)));
            var cx0 = Math.floor(c.mx[idx[0]] * scale / cell), cy0 = Math.floor(c.my[idx[0]] * scale / cell);
            var seen = new Set(); chosen = [];
            for (var k = 0; k < idx.length; k++) {
                var j = idx[k];
                var key = (Math.floor(c.mx[j] * scale / cell) - cx0 + 4096) * 16384 + (Math.floor(c.my[j] * scale / cell) - cy0 + 4096);
                if (seen.has(key)) continue; seen.add(key); chosen.push(j);
            }
        }
        st.group.clearLayers();
        for (var m = 0; m < chosen.length; m++) { var q = chosen[m]; st.group.addLayer(st.makeMarker(st.points[q], lat[q], lon[q])); }
    };

    // ---------------------------------------------------------------- canvas TIN layer
    var lastHint = 0;
    L.TopoTinLayer = L.Layer.extend({
        onAdd: function (map) {
            this._canvas = L.DomUtil.create('canvas', 'leaflet-layer leaflet-zoom-hide');
            this._canvas.style.pointerEvents = 'none';
            map.getPane('overlayPane').appendChild(this._canvas);
            map.on('moveend', this._reset, this); map.on('resize', this._reset, this);
            this._reset();
        },
        onRemove: function (map) {
            map.off('moveend', this._reset, this); map.off('resize', this._reset, this);
            if (this._canvas) L.DomUtil.remove(this._canvas);
            this._canvas = null;
        },
        clearLayers: function () { if (this._canvas) { var ctx = this._canvas.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this._canvas.width, this._canvas.height); } return this; },
        _reset: function () {
            if (!this._canvas || !this._map) return;
            var map = this._map, size = map.getSize(), pad = 0.5, r = L.Browser.retina ? 2 : 1;
            var w = Math.round(size.x * (1 + 2 * pad)), h = Math.round(size.y * (1 + 2 * pad));
            this._origin = { x: -size.x * pad, y: -size.y * pad };
            L.DomUtil.setPosition(this._canvas, map.containerPointToLayerPoint([this._origin.x, this._origin.y]));
            this._canvas.width = w * r; this._canvas.height = h * r;
            this._canvas.style.width = w + 'px'; this._canvas.style.height = h + 'px';
            this._draw(w, h, r);
        },
        _draw: function (w, h, r) {
            var ctx = this._canvas.getContext('2d'); ctx.setTransform(r, 0, 0, r, 0, 0); ctx.clearRect(0, 0, w, h);
            var tris = W.topoTriangles;
            if (!tris || !tris.length || !W.topoPoints || !W.topoPoints.length) return;
            var c = W.topoGetLLCache(), map = this._map;
            var scale = 256 * Math.pow(2, map.getZoom()), pb = map.getPixelBounds();
            var ox = pb.min.x + this._origin.x, oy = pb.min.y + this._origin.y;      // canvas (0,0) ၏ world pixel
            var x0 = ox, y0 = oy, x1 = ox + w, y1 = oy + h, mx = c.mx, my = c.my;
            var vis = [];
            for (var i = 0, T = tris.length; i < T; i++) {
                var t = tris[i]; if (t.i1 === undefined) continue;
                var ax = mx[t.i1] * scale, bx = mx[t.i2] * scale, cx = mx[t.i3] * scale;
                var minx = ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx), maxx = ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx);
                if (!(maxx >= x0 && minx <= x1)) continue;                           // NaN ကိုပါ ဖယ်
                var ay = my[t.i1] * scale, by = my[t.i2] * scale, cy = my[t.i3] * scale;
                var miny = ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy), maxy = ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy);
                if (!(maxy >= y0 && miny <= y1)) continue;
                vis.push(i);
                if (vis.length > MAX_TRI_DRAW) break;
            }
            if (vis.length > MAX_TRI_DRAW) {
                var now = Date.now();
                if (now - lastHint > 6000 && typeof W.mapToast === 'function') { lastHint = now; W.mapToast('\u2139\uFE0F TIN: too many triangles in view - zoom in to see them'); }
                return;
            }
            ctx.beginPath();
            for (var q = 0; q < vis.length; q++) {
                var tt = tris[vis[q]];
                ctx.moveTo(mx[tt.i1] * scale - ox, my[tt.i1] * scale - oy);
                ctx.lineTo(mx[tt.i2] * scale - ox, my[tt.i2] * scale - oy);
                ctx.lineTo(mx[tt.i3] * scale - ox, my[tt.i3] * scale - oy);
                ctx.closePath();
            }
            ctx.fillStyle = 'rgba(148,163,184,0.1)'; ctx.fill();
            ctx.lineWidth = 1; ctx.strokeStyle = '#64748b'; ctx.stroke();
        }
    });
})();
