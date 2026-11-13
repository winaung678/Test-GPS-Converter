// [split from map_engine.js] lines 1363-2026 | part 5/7 | ထပ်ခွဲထားသည် - load order မပြောင်းရ (app.html ၏ script tag အစီအစဉ်အတိုင်း)
// ==== DXF CANVAS ENGINE (BEGIN) ====
// DXF ကို Leaflet object သန်းချီမဆောက်ဘဲ coordinate များကို typed array ထဲ တစ်ကြိမ်ပဲ ပြောင်းသိမ်း၍
// canvas layer တစ်ခုတည်း (spatial index ဖြင့် မျက်နှာပြင်ထဲရှိတာသာ) ဆွဲသည်။

window.dxfFinalColor = function(col, dark) {
    if (dark) return "#0f172a";
    col = String(col || "#ffffff").toLowerCase();
    if (col === "#ffffff" || col === "#000000") return "#f8fafc";     // ACI 7 (အဖြူ/အနက်) ကို မြေပုံပေါ် မြင်ရအောင်
    return col;
};

// dxfToLatLon နှင့် တူညီသော တွက်နည်း - သို့သော် datum ကို DOM မှ vertex တိုင်း မဖတ်ဘဲ တစ်ကြိမ်ပဲ ဖတ်
window.dxfMakeConverter = function() {
    let dEl = document.getElementById('dxf_datum'); let datum = dEl ? dEl.value : "WGS_LL";
    if (datum === "SVY21") { return function(e, n) { return calc_v2_rev(e, n); }; }
    if (datum.startsWith("WGS_UTM")) {
        let zone = parseInt(datum.slice(-2));
        return function(e, n) { let i_w = m_inverse(e, n, zone, m_WGS); return { lat: i_w.lat, lon: i_w.lon }; };
    }
    if (datum === "GLOBAL_UTM") {
        let zInput = document.getElementById('dxf_custom_zone'); let hInput = document.getElementById('dxf_custom_hemi');
        let zone = (zInput && zInput.value) ? parseInt(zInput.value) : 47; let hemi = hInput ? hInput.value : 'N';
        return function(e, n) { let calcN = n; if (hemi === 'S') calcN -= 10000000; let i_w = m_inverse(e, calcN, zone, m_WGS); return { lat: i_w.lat, lon: i_w.lon }; };
    }
    let isMM = datum.startsWith("MM"); let zone2 = parseInt(datum.slice(-2));
    return function(e, n) {
        let r = m_inverse(e, n, zone2, isMM ? m_EVE : m_WGS);
        if (isMM) { let x = m_llh2xyz(r.lat, r.lon, 0, m_EVE); let w = m_xyz2llh(x.x - m_DX, x.y - m_DY, x.z - m_DZ, m_WGS); return { lat: w.lat, lon: w.lon }; }
        return { lat: r.lat, lon: r.lon };
    };
};

// ---------- Geometry store ----------
// kind: 0 = polyline, 1 = filled polygon, 2 = circle (center + radius), 3 = point
window.DxfGeom = function() {
    this.nv = 0; this.np = 0;
    this._vcap = 1 << 16; this.xy = new Float64Array(this._vcap * 2); this.z = new Float32Array(this._vcap); this.src = new Float64Array(this._vcap * 2);   // src = DXF မူရင်း E,N (round-trip error မရှိစေရန်)
    this._pcap = 1 << 14;
    this.kind = new Uint8Array(this._pcap); this.col = new Uint16Array(this._pcap); this.lay = new Uint16Array(this._pcap); this.typ = new Uint16Array(this._pcap);
    this.start = new Uint32Array(this._pcap); this.cnt = new Uint32Array(this._pcap); this.rad = new Float64Array(this._pcap); this.rr = new Float64Array(this._pcap); this.bb = new Float64Array(this._pcap * 4);
    this.colors = []; this.layers = []; this.types = [];
    this._cm = Object.create(null); this._lm = Object.create(null); this._tm = Object.create(null);
    this.minLat = 90; this.maxLat = -90; this.minLon = 180; this.maxLon = -180;
    this.G = 0;
};
window.DxfGeom.R = 6378137;
window.DxfGeom.unproject = function(x, y) { let R = 6378137; return { lon: x / R * 180 / Math.PI, lat: (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI }; };
window.DxfGeom.prototype._growV = function(extra) {
    let need = this.nv + extra; if (need <= this._vcap) return;
    let cap = this._vcap; while (cap < need) cap *= 2;
    let nxy = new Float64Array(cap * 2); nxy.set(this.xy.subarray(0, this.nv * 2)); this.xy = nxy;
    let nz = new Float32Array(cap); nz.set(this.z.subarray(0, this.nv)); this.z = nz;
    let ns = new Float64Array(cap * 2); ns.set(this.src.subarray(0, this.nv * 2)); this.src = ns; this._vcap = cap;
};
window.DxfGeom.prototype._growP = function() {
    if (this.np < this._pcap) return;
    let cap = this._pcap * 2;
    const g = function(A, m) { let B = new A.constructor(cap * m); B.set(A); return B; };
    this.kind = g(this.kind, 1); this.col = g(this.col, 1); this.lay = g(this.lay, 1); this.typ = g(this.typ, 1);
    this.start = g(this.start, 1); this.cnt = g(this.cnt, 1); this.rad = g(this.rad, 1); this.rr = g(this.rr, 1); this.bb = g(this.bb, 4); this._pcap = cap;
};
window.DxfGeom.prototype._pal = function(map, arr, key) {
    key = String(key); let i = map[key];
    if (i === undefined) { if (arr.length >= 65535) return 65534; i = arr.length; arr.push(key); map[key] = i; }
    return i;
};
window.DxfGeom.prototype._prim = function(kind, color, layer, type, start, cnt, x0, y0, x1, y1, rad) {
    this._growP(); let id = this.np++;
    this.kind[id] = kind; this.col[id] = this._pal(this._cm, this.colors, color); this.lay[id] = this._pal(this._lm, this.layers, layer); this.typ[id] = this._pal(this._tm, this.types, type);
    this.start[id] = start; this.cnt[id] = cnt; this.rad[id] = rad || 0;
    let b = id * 4; this.bb[b] = x0; this.bb[b + 1] = y0; this.bb[b + 2] = x1; this.bb[b + 3] = y1;
};
// lat/lon → Web Mercator (Leaflet SphericalMercator နှင့်တူ)
window.DxfGeom.prototype._push = function(lat, lon, z, e, n) {
    let la = lat > 85.0511287798 ? 85.0511287798 : (lat < -85.0511287798 ? -85.0511287798 : lat);
    let s = Math.sin(la * 0.017453292519943295);
    let mx = 6378137 * lon * 0.017453292519943295, my = 6378137 * Math.log((1 + s) / (1 - s)) / 2;
    let i = this.nv; this.xy[i * 2] = mx; this.xy[i * 2 + 1] = my; this.src[i * 2] = e; this.src[i * 2 + 1] = n; this.z[i] = (typeof z === 'number' && z === z) ? z : NaN; this.nv++;
    if (lat < this.minLat) this.minLat = lat; if (lat > this.maxLat) this.maxLat = lat; if (lon < this.minLon) this.minLon = lon; if (lon > this.maxLon) this.maxLon = lon;
    return mx;
};
// pts = [[x,y,z?], ...] (DXF coordinate), conv = dxfMakeConverter()
window.DxfGeom.prototype.addPath = function(kind, color, layer, type, pts, conv) {
    this._growV(pts.length);
    let start = this.nv, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i++) {
        let p = pts[i], ll = conv(p[0], p[1]);
        if (!(ll.lat === ll.lat) || !(ll.lon === ll.lon)) continue;
        let mx = this._push(ll.lat, ll.lon, p[2], p[0], p[1]), my = this.xy[(this.nv - 1) * 2 + 1];
        if (mx < x0) x0 = mx; if (mx > x1) x1 = mx; if (my < y0) y0 = my; if (my > y1) y1 = my;
    }
    let c = this.nv - start;
    if (c < (kind === 1 ? 3 : 2)) { this.nv = start; return false; }
    this._prim(kind, color, layer, type, start, c, x0, y0, x1, y1, 0); return true;
};
window.DxfGeom.prototype.addPoint = function(color, layer, x, y, z, conv) {
    let ll = conv(x, y); if (!(ll.lat === ll.lat) || !(ll.lon === ll.lon)) return false;
    this._growV(1); let start = this.nv, mx = this._push(ll.lat, ll.lon, z, x, y), my = this.xy[start * 2 + 1];
    this._prim(3, color, layer, 'Point', start, 1, mx, my, mx, my, 0); return true;
};
window.DxfGeom.prototype.addCircle = function(color, layer, x, y, r, conv) {
    let ll = conv(x, y); if (!(ll.lat === ll.lat) || !(ll.lon === ll.lon)) return false;
    this._growV(1); let start = this.nv, mx = this._push(ll.lat, ll.lon, NaN, x, y), my = this.xy[start * 2 + 1];
    let rm = r / Math.max(Math.cos(Math.max(Math.min(ll.lat, 85), -85) * Math.PI / 180), 0.01);   // ground meter → mercator meter
    this._prim(2, color, layer, 'Circle', start, 1, mx - rm, my - rm, mx + rm, my + rm, rm); this.rr[this.np - 1] = r; return true;
};
// vertex/prim array များကို အတိအကျ trim + grid spatial index ဆောက်
window.DxfGeom.prototype.finalize = function() {
    let nv = this.nv, np = this.np;
    this.xy = this.xy.slice(0, nv * 2); this.z = this.z.slice(0, nv); this.src = this.src.slice(0, nv * 2);
    const t = function(A, m) { return A.slice(0, np * m); };
    this.kind = t(this.kind, 1); this.col = t(this.col, 1); this.lay = t(this.lay, 1); this.typ = t(this.typ, 1);
    this.start = t(this.start, 1); this.cnt = t(this.cnt, 1); this.rad = t(this.rad, 1); this.rr = t(this.rr, 1); this.bb = t(this.bb, 4);
    this._vcap = nv; this._pcap = np;
    if (np === 0) { this.G = 0; return this; }
    let bb = this.bb, gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
    for (let i = 0; i < np; i++) { let b = i * 4; if (bb[b] < gx0) gx0 = bb[b]; if (bb[b + 1] < gy0) gy0 = bb[b + 1]; if (bb[b + 2] > gx1) gx1 = bb[b + 2]; if (bb[b + 3] > gy1) gy1 = bb[b + 3]; }
    // Zoom-fit နယ်ပယ်: အဝေးကြီးရောက်နေသော object အနည်းငယ် (ဥပမာ 0,0 မှာ ကျန်ခဲ့သော entity) ကို ချန်ပြီး ပုံအဓိကရှိရာကို ဦးတည်
    let fx0 = gx0, fx1 = gx1, fy0 = gy0, fy1 = gy1, outl = 0;
    if (np >= 30) {
        let cxs = new Float64Array(np), cys = new Float64Array(np);
        for (let i = 0; i < np; i++) { let b = i * 4; cxs[i] = (bb[b] + bb[b + 2]) / 2; cys[i] = (bb[b + 1] + bb[b + 3]) / 2; }
        let sx = cxs.slice().sort(), sy = cys.slice().sort();
        let lo = Math.floor(np * 0.01), hi = Math.min(np - 1, Math.ceil(np * 0.99) - 1);
        let px0 = sx[lo], px1 = sx[hi], py0 = sy[lo], py1 = sy[hi], wx = Math.max(px1 - px0, 1), wy = Math.max(py1 - py0, 1);
        if ((gx1 - gx0) > wx * 3 || (gy1 - gy0) > wy * 3) {
            fx0 = px0 - wx * 0.05; fx1 = px1 + wx * 0.05; fy0 = py0 - wy * 0.05; fy1 = py1 + wy * 0.05;
            for (let i = 0; i < np; i++) { if (cxs[i] < fx0 || cxs[i] > fx1 || cys[i] < fy0 || cys[i] > fy1) outl++; }
        }
    }
    this.fit = { x0: fx0, y0: fy0, x1: fx1, y1: fy1 }; this.outliers = outl;
    let G = Math.max(8, Math.min(512, Math.ceil(Math.sqrt(np / 2))));
    let w = Math.max(gx1 - gx0, 1e-6), h = Math.max(gy1 - gy0, 1e-6);
    this.G = G; this.gx0 = gx0; this.gy0 = gy0; this.cw = w / G; this.chh = h / G;
    let cs = new Int32Array(G * G + 1), big = [], self = this;
    const range = function(id) {
        let b = id * 4;
        let a0 = Math.floor((bb[b] - gx0) / self.cw), a1 = Math.floor((bb[b + 2] - gx0) / self.cw), c0 = Math.floor((bb[b + 1] - gy0) / self.chh), c1 = Math.floor((bb[b + 3] - gy0) / self.chh);
        return [Math.max(0, Math.min(G - 1, a0)), Math.min(G - 1, Math.max(0, a1)), Math.max(0, Math.min(G - 1, c0)), Math.min(G - 1, Math.max(0, c1))];
    };
    for (let id = 0; id < np; id++) {
        let r = range(id); if ((r[1] - r[0] + 1) * (r[3] - r[2] + 1) > 64) { big.push(id); continue; }
        for (let cy = r[2]; cy <= r[3]; cy++) for (let cx = r[0]; cx <= r[1]; cx++) cs[cy * G + cx + 1]++;
    }
    for (let i = 1; i < cs.length; i++) cs[i] += cs[i - 1];
    let items = new Int32Array(cs[cs.length - 1]), pos = cs.slice(0, G * G);
    for (let id = 0; id < np; id++) {
        let r = range(id); if ((r[1] - r[0] + 1) * (r[3] - r[2] + 1) > 64) continue;
        for (let cy = r[2]; cy <= r[3]; cy++) for (let cx = r[0]; cx <= r[1]; cx++) items[pos[cy * G + cx]++] = id;
    }
    this.cellStart = cs; this.items = items; this.big = Int32Array.from(big); this.stamp = new Int32Array(np); this.qid = 0;
    return this;
};
// mercator bbox ထဲ ကျသော prim id များကို fn(id) သို့ တစ်ခါစီပို့
window.DxfGeom.prototype.query = function(qx0, qy0, qx1, qy1, fn) {
    if (!this.G) return;
    let bb = this.bb, st = this.stamp, qid = ++this.qid, G = this.G;
    const hit = function(id) { let b = id * 4; return !(bb[b + 2] < qx0 || bb[b] > qx1 || bb[b + 3] < qy0 || bb[b + 1] > qy1); };
    for (let i = 0; i < this.big.length; i++) { let id = this.big[i]; if (hit(id)) { st[id] = qid; fn(id); } }
    let a0 = Math.max(0, Math.floor((qx0 - this.gx0) / this.cw)), a1 = Math.min(G - 1, Math.floor((qx1 - this.gx0) / this.cw));
    let c0 = Math.max(0, Math.floor((qy0 - this.gy0) / this.chh)), c1 = Math.min(G - 1, Math.floor((qy1 - this.gy0) / this.chh));
    if (a0 > a1 || c0 > c1) return;
    let cs = this.cellStart, items = this.items;
    for (let cy = c0; cy <= c1; cy++) {
        for (let cx = a0; cx <= a1; cx++) {
            let cell = cy * G + cx;
            for (let t = cs[cell]; t < cs[cell + 1]; t++) { let id = items[t]; if (st[id] === qid) continue; st[id] = qid; if (hit(id)) fn(id); }
        }
    }
};

// ---------- Canvas layer ----------
L.DxfCanvasLayer = L.Layer.extend({
    isDxfCanvas: true,
    initialize: function(geom, dark) { this._geom = geom; this._dark = !!dark; this._pad = 0.25; this._palette = null; },
    getBounds: function() {
        let g = this._geom; if (!g || !g.np) return L.latLngBounds();
        if (g.fit) { let a = window.DxfGeom.unproject(g.fit.x0, g.fit.y0), b = window.DxfGeom.unproject(g.fit.x1, g.fit.y1); return L.latLngBounds([[a.lat, a.lon], [b.lat, b.lon]]); }
        return L.latLngBounds([[g.minLat, g.minLon], [g.maxLat, g.maxLon]]);
    },
    onAdd: function(map) {
        this._map = map;
        if (!this._canvas) {
            this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated');
            this._canvas.style.position = 'absolute'; this._canvas.style.pointerEvents = 'none';
            this._ctx = this._canvas.getContext('2d');
        }
        let pane = map.getPane('dxfPane') || map.getPane('overlayPane'); pane.appendChild(this._canvas);
        map.on('moveend zoomend resize', this._schedule, this);
        if (map.options.zoomAnimation && L.Browser.any3d) map.on('zoomanim', this._animateZoom, this);
        this._update();
    },
    onRemove: function(map) {
        L.DomUtil.remove(this._canvas);
        map.off('moveend zoomend resize', this._schedule, this);
        map.off('zoomanim', this._animateZoom, this);
        if (this._raf) { (window.cancelAnimationFrame || clearTimeout)(this._raf); this._raf = null; }
    },
    setDark: function(flag) { this._dark = !!flag; this._palette = null; if (this._map) this._update(); },
    _schedule: function() {
        if (this._raf) return; let self = this;
        this._raf = (window.requestAnimationFrame || function(f) { return setTimeout(f, 16); })(function() { self._raf = null; if (self._map) self._update(); });
    },
    _animateZoom: function(e) {
        try {
            let map = this._map, scale = map.getZoomScale(e.zoom, this._zoom);
            let viewHalf = map.getSize().multiplyBy(0.5 + this._pad), cur = map.project(this._center, e.zoom);
            let off = viewHalf.multiplyBy(-scale).add(cur).subtract(map._getNewPixelOrigin(e.center, e.zoom));
            L.DomUtil.setTransform(this._canvas, off, scale);
        } catch (err) {}
    },
    _update: function() {
        let map = this._map; if (!map) return;
        let size = map.getSize(), pad = this._pad, dpr = Math.min(window.devicePixelRatio || 1, 2);
        let w = Math.ceil(size.x * (1 + 2 * pad)), h = Math.ceil(size.y * (1 + 2 * pad));
        this._tl = map.containerPointToLayerPoint([-size.x * pad, -size.y * pad]).round();
        let c = this._canvas;
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
        c.style.width = w + 'px'; c.style.height = h + 'px';
        L.DomUtil.setPosition(c, this._tl);
        this._center = map.getCenter(); this._zoom = map.getZoom(); this._w = w; this._h = h; this._dpr = dpr;
        this._draw();
    },
    _pal: function() {
        if (this._palette) return this._palette;
        let cols = this._geom.colors, out = new Array(cols.length);
        for (let i = 0; i < cols.length; i++) out[i] = window.dxfFinalColor(cols[i], this._dark);
        return (this._palette = out);
    },
    _view: function() {   // pixel ↔ mercator ကူးရန် ကိန်းများ
        let map = this._map, R = window.DxfGeom.R, S = 256 * Math.pow(2, map.getZoom()), k = S / (2 * Math.PI * R), po = map.getPixelOrigin();
        let Lx = po.x + this._tl.x, Ly = po.y + this._tl.y;
        return { S: S, k: k, ax: S / 2 - Lx, ay: S / 2 - Ly };
    },
    _draw: function() {
        let g = this._geom, ctx = this._ctx, w = this._w, h = this._h; if (!ctx) return;
        ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0); ctx.clearRect(0, 0, w, h);
        if (!g || !g.np) return;
        let v = this._view(), k = v.k, ax = v.ax, ay = v.ay, xy = g.xy, bb = g.bb, pal = this._pal();
        let mx0 = (0 - ax) / k, mx1 = (w - ax) / k, my1 = ay / k, my0 = (ay - h) / k;
        let byCol = {}, cols = [], count = 0;
        g.query(mx0, my0, mx1, my1, function(id) {
            let b = id * 4;
            if ((bb[b + 2] - bb[b]) * k < 0.6 && (bb[b + 3] - bb[b + 1]) * k < 0.6 && g.kind[id] !== 3) return;   // မျက်စိမမြင်နိုင်လောက်အောင် သေးသော object ကို ကျော် (LOD)
            let ci = g.col[id], arr = byCol[ci]; if (!arr) { arr = byCol[ci] = []; cols.push(ci); } arr.push(id); count++;
        });
        this.lastDrawn = count;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 1.5;
        // (၁) fill polygon  (၂) မျဉ်း/စက်ဝိုင်း (အရောင်အလိုက် batch)  (၃) point
        for (let a = 0; a < cols.length; a++) {
            let ids = byCol[cols[a]], col = pal[cols[a]], any = false;
            ctx.fillStyle = col; ctx.strokeStyle = col; ctx.globalAlpha = 0.55; ctx.beginPath();
            for (let i = 0; i < ids.length; i++) { let id = ids[i]; if (g.kind[id] !== 1) continue; any = true; this._path(id, ax, ay, k, true); }
            if (any) { ctx.fill(); ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.stroke(); ctx.lineWidth = 1.5; }
            ctx.globalAlpha = 1;
        }
        for (let a = 0; a < cols.length; a++) {
            let ids = byCol[cols[a]], any = false; ctx.strokeStyle = pal[cols[a]]; ctx.beginPath();
            for (let i = 0; i < ids.length; i++) {
                let id = ids[i], kd = g.kind[id];
                if (kd === 0) { any = true; this._path(id, ax, ay, k, false); }
                else if (kd === 2) { any = true; let o = g.start[id] * 2, cx = ax + xy[o] * k, cy = ay - xy[o + 1] * k, r = g.rad[id] * k; ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, 6.283185307179586); }
            }
            if (any) ctx.stroke();
        }
        for (let a = 0; a < cols.length; a++) {
            let ids = byCol[cols[a]], any = false; ctx.fillStyle = pal[cols[a]]; ctx.beginPath();
            for (let i = 0; i < ids.length; i++) { let id = ids[i]; if (g.kind[id] !== 3) continue; any = true; let o = g.start[id] * 2, px = ax + xy[o] * k, py = ay - xy[o + 1] * k; ctx.moveTo(px + 2.2, py); ctx.arc(px, py, 2.2, 0, 6.283185307179586); }
            if (any) ctx.fill();
        }
    },
    _path: function(id, ax, ay, k, closeIt) {
        let g = this._geom, ctx = this._ctx, xy = g.xy, o = g.start[id], n = g.cnt[id];
        let x = ax + xy[o * 2] * k, y = ay - xy[o * 2 + 1] * k, lx = x, ly = y; ctx.moveTo(x, y);
        for (let j = 1; j < n; j++) {
            x = ax + xy[(o + j) * 2] * k; y = ay - xy[(o + j) * 2 + 1] * k;
            if (j < n - 1 && Math.abs(x - lx) < 0.4 && Math.abs(y - ly) < 0.4) continue;   // pixel တစ်ခုထက်နီးသော vertex များကို ကျော်
            ctx.lineTo(x, y); lx = x; ly = y;
        }
        if (closeIt) ctx.closePath();
    },
    // နှိပ်လိုက်သည့်နေရာ အနီးဆုံး vertex / point / center / မျဉ်းပေါ်အမှတ်ကို ရှာ (screen pixel tolerance)
    pick: function(latlng, tolPx) {
        let g = this._geom, map = this._map; if (!g || !g.G || !map) return null;
        let R = window.DxfGeom.R, k = (256 * Math.pow(2, map.getZoom())) / (2 * Math.PI * R);
        let la = Math.max(Math.min(85.0511287798, latlng.lat), -85.0511287798), s = Math.sin(la * Math.PI / 180);
        let mx = R * latlng.lng * Math.PI / 180, my = R * Math.log((1 + s) / (1 - s)) / 2;
        let tol = tolPx / k, tolL = tol * 0.75, xy = g.xy, zz = g.z, bestV = null, bestL = null;
        const vtx = function(id, vi, d, kind) { if (d <= tol && (!bestV || d < bestV.d)) bestV = { d: d, id: id, vi: vi, kind: kind }; };
        g.query(mx - tol, my - tol, mx + tol, my + tol, function(id) {
            let kd = g.kind[id], o = g.start[id], n = g.cnt[id];
            if (kd === 3) { vtx(id, o, Math.hypot(xy[o * 2] - mx, xy[o * 2 + 1] - my), 'point'); return; }
            if (kd === 2) {
                let dc = Math.hypot(xy[o * 2] - mx, xy[o * 2 + 1] - my); vtx(id, o, dc, 'center');
                let dr = Math.abs(dc - g.rad[id]); if (dr <= tolL && (!bestL || dr < bestL.d)) { let f = g.rad[id] / (dc || 1); bestL = { d: dr, id: id, x: xy[o * 2] + (mx - xy[o * 2]) * f, y: xy[o * 2 + 1] + (my - xy[o * 2 + 1]) * f, z: NaN, ring: o, ux: (mx - xy[o * 2]) / (dc || 1), uy: (my - xy[o * 2 + 1]) / (dc || 1) }; }
                return;
            }
            let segs = (kd === 1) ? n : n - 1;
            for (let j = 0; j < n; j++) vtx(id, o + j, Math.hypot(xy[(o + j) * 2] - mx, xy[(o + j) * 2 + 1] - my), 'vertex');
            for (let j = 0; j < segs; j++) {
                let i0 = o + j, i1 = o + ((j + 1) % n), x0 = xy[i0 * 2], y0 = xy[i0 * 2 + 1], dx = xy[i1 * 2] - x0, dy = xy[i1 * 2 + 1] - y0, l2 = dx * dx + dy * dy;
                let t = l2 > 0 ? ((mx - x0) * dx + (my - y0) * dy) / l2 : 0; t = t < 0 ? 0 : (t > 1 ? 1 : t);
                let px = x0 + t * dx, py = y0 + t * dy, d = Math.hypot(px - mx, py - my);
                if (d <= tolL && (!bestL || d < bestL.d)) { let za = zz[i0], zb = zz[i1]; bestL = { d: d, id: id, x: px, y: py, z: (za === za && zb === zb) ? za + (zb - za) * t : NaN, i0: i0, i1: i1, t: t }; }
            }
        });
        let res = null;
        let sr = g.src;
        if (bestV) { res = { id: bestV.id, kind: bestV.kind, x: xy[bestV.vi * 2], y: xy[bestV.vi * 2 + 1], z: zz[bestV.vi], e: sr[bestV.vi * 2], n: sr[bestV.vi * 2 + 1] }; }
        else if (bestL) {
            res = { id: bestL.id, kind: 'line', x: bestL.x, y: bestL.y, z: bestL.z };
            if (bestL.i0 !== undefined) { res.e = sr[bestL.i0 * 2] + (sr[bestL.i1 * 2] - sr[bestL.i0 * 2]) * bestL.t; res.n = sr[bestL.i0 * 2 + 1] + (sr[bestL.i1 * 2 + 1] - sr[bestL.i0 * 2 + 1]) * bestL.t; }
            else { res.e = sr[bestL.ring * 2] + bestL.ux * g.rr[bestL.id]; res.n = sr[bestL.ring * 2 + 1] + bestL.uy * g.rr[bestL.id]; }
        }
        if (!res) return null;
        res.lon = res.x / R * 180 / Math.PI; res.lat = (2 * Math.atan(Math.exp(res.y / R)) - Math.PI / 2) * 180 / Math.PI;
        res.type = g.types[g.typ[res.id]]; res.layer = g.layers[g.lay[res.id]];
        return res;
    }
});


// DXF object ကို နှိပ်လျှင် ပေါ်မည့် popup (ဖုန်းအတွက် သေးသေးလေး၊ layer နာမည်ရှည်လျှင် ... ဖြင့်ဖြတ်ပြီး ထိလိုက်လျှင် အပြည့်ပြန်ချဲ့)
window.dxfDatumLabel = function() {
    let el = document.getElementById('dxf_datum'), v = el ? el.value : '';
    const m = { SVY21: 'SVY21', MM47: 'MM2000 Z47', MM46: 'MM2000 Z46', WGS_UTM47: 'WGS84 UTM47', WGS_UTM46: 'WGS84 UTM46' };
    if (m[v]) return m[v];
    if (v === 'GLOBAL_UTM') { let z = document.getElementById('dxf_custom_zone'), h = document.getElementById('dxf_custom_hemi'); return 'UTM ' + ((z && z.value) ? z.value : '47') + (h ? h.value : 'N'); }
    return v || 'DXF';
};
window.dxfPickPopupHtml = function(d, lat, lon) {
    const esc = window.escHtml;
    let kind = d.kind === 'line' ? 'On line' : (d.kind === 'center' ? 'Center' : (d.kind === 'point' ? 'Point' : 'Vertex'));
    let full = esc(d.layer);
    let toggle = "var s=this.style;if(s.whiteSpace==='normal'){s.whiteSpace='nowrap';s.wordBreak='normal';}else{s.whiteSpace='normal';s.wordBreak='break-all';}";
    let h = `<div style="background:#10b981; color:white; font-size:10px; font-weight:bold; padding:1px 4px; border-radius:4px; margin-bottom:2px; white-space:nowrap;">🧲 ${kind} · ${esc(d.type)}</div>`;
    h += `<div title="${full}" onclick="${toggle}" style="font-size:10px; color:#475569; margin:0 auto 3px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer;">🗂 ${full}</div>`;
    h += `<b style="font-size:10px; color:#d97706;">[${esc(window.dxfDatumLabel())}]</b><br>`;
    h += `<b style="font-size:12.5px; color:#b91c1c; white-space:nowrap;">N: ${d.n.toFixed(3)} &nbsp; E: ${d.e.toFixed(3)}</b>`;
    if (isFinite(d.z)) h += `<div style="font-size:11px; font-weight:bold; color:#7c3aed; white-space:nowrap;">Z: ${d.z.toFixed(3)}</div>`;
    h += `<div style="font-size:10.5px; font-weight:bold; color:#1e3a8a; white-space:nowrap;">Lat ${lat.toFixed(7)} · Lon ${lon.toFixed(7)}</div>`;
    return h;
};

// ---------- Parse (background worker ဖြင့်၊ မရလျှင် main thread) ----------
window.dxfBuildLayerTable = function(layers) {
    let t = {}; if (!layers) return t;
    for (let key in layers) { t[key.toUpperCase()] = window.dxfParseLayerEntry(layers[key]); }
    return t;
};
// done(err, { entities, blocks, layers })
window.dxfParseAsync = function(text, done) {
    let finished = false;
    const finish = function(err, res) { if (finished) return; finished = true; done(err, res); };
    const mainThread = function() {
        try {
            const parser = new window.DxfParser(); const d = parser.parseSync(text);
            finish(null, { entities: d.entities || [], blocks: d.blocks || {}, layers: (d.tables && d.tables.layer && d.tables.layer.layers) || {} });
        } catch (e) { finish(e); }
    };
    let w = null, url = null;
    try {
        let tag = document.querySelector('script[src*="dxf-parser"]');
        if (!tag || typeof Worker === 'undefined' || typeof Blob === 'undefined' || !window.URL || !window.URL.createObjectURL) return setTimeout(mainThread, 0);
        let src = "var _ok=true;try{importScripts(" + JSON.stringify(tag.src) + ");}catch(e){_ok=false;}" +
            "onmessage=function(ev){try{var P=self.DxfParser;if(!_ok||!P){postMessage({ok:false,env:true});return;}" +
            "var d=new P().parseSync(ev.data);postMessage({ok:true,entities:d.entities||[],blocks:d.blocks||{},layers:(d.tables&&d.tables.layer&&d.tables.layer.layers)||{}});}" +
            "catch(err){postMessage({ok:false,msg:String(err&&err.message||err)});}};";
        url = window.URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        w = new Worker(url);
        const cleanup = function() { try { w.terminate(); } catch (e) {} try { window.URL.revokeObjectURL(url); } catch (e) {} };
        w.onmessage = function(ev) {
            let m = ev.data; cleanup();
            if (m && m.ok) finish(null, { entities: m.entities, blocks: m.blocks, layers: m.layers });
            else if (m && m.env) mainThread();                       // worker ထဲ parser မရ → main thread
            else finish(new Error((m && m.msg) || 'DXF parse error'));
        };
        w.onerror = function() { cleanup(); mainThread(); };
        w.postMessage(text);
    } catch (e) { try { if (w) w.terminate(); } catch (x) {} mainThread(); }
};
// မူရင်း DXF စာသားကိုသာ save (object ပေါင်းသန်းချီ clone လုပ်ခြင်းထက် အလွန်မြန်)
window.dxfSaveRaw = function(text) {
    if (!window.mapDB) return;
    try { let tx = window.mapDB.transaction("dxf_data", "readwrite"); tx.objectStore("dxf_data").put({ raw: text, v: 2 }, "saved_dxf"); } catch (e) {}
};
// ==== DXF CANVAS ENGINE (END) ====

window.renderDXF = function() {
    if (!window.leafletMap || !window.rawDxfEntities || window.rawDxfEntities.length === 0) return;

    window.dxfCancelFlag = false;

    if (window.dxfLineLayer) window.leafletMap.removeLayer(window.dxfLineLayer);
    if (window.dxfTextLayer) window.leafletMap.removeLayer(window.dxfTextLayer);
    window.dxfLineLayer = L.layerGroup();      // build လုပ်နေစဉ် null မဖြစ်စေရန် placeholder (app_logic က null စစ်သည်)
    window.dxfTextLayer = null;

    let isDarkLines = false;
    let chkDark = document.getElementById('tgl_dxf_dark');
    if (chkDark) isDarkLines = chkDark.checked;

    let statusEl = document.getElementById('dxf_status');

    // ---- Datum/entity မပြောင်းလျှင် geometry ကို ပြန်မတည်ဆောက်ဘဲ cache ကိုပဲသုံး (Dark colors ပြောင်းတာ၊ ပြန်ဖွင့်တာ ချက်ချင်းမြန်) ----
    let dz = document.getElementById('dxf_custom_zone'), dh = document.getElementById('dxf_custom_hemi'), dd = document.getElementById('dxf_datum');
    let cacheKey = [dd ? dd.value : '', dz ? dz.value : '', dh ? dh.value : ''].join('|');
    let cache = window.dxfCache;
    let useCache = !!(cache && cache.ents === window.rawDxfEntities && cache.blocks === window.rawDxfBlocks && cache.key === cacheKey);

    function finish(geom, rawTexts, info) {
        if (window.dxfCancelFlag) return;
        let textsData = rawTexts.map(function(t) { return { lat: t.lat, lon: t.lon, text: t.text, color: window.dxfFinalColor(t.color, isDarkLines), align: t.align, rotation: t.rotation, h: t.h }; });

        let extra = '';
        if (info.hidden) extra += ` · ${info.hidden} on hidden layers skipped`;
        let un = Object.keys(info.unsup);
        if (un.length) extra += ` · ⚠️ not drawn: ` + un.map(k => window.escHtml(k) + '×' + info.unsup[k]).join(', ');
        if (info.limit) extra += ' · ⚠️ drawing limit reached';
        if (geom.outliers) extra += ` · ${geom.outliers} far-away objects ignored for zoom`;
        statusEl.innerHTML = `✅ Loaded <b>${geom.np}</b> entities & <b>${textsData.length}</b> texts.${extra}`;

        window.dxfLineLayer = new L.DxfCanvasLayer(geom, isDarkLines);
        window.dxfTextLayer = new L.CanvasTextLayer(textsData);

        let chkLines = document.getElementById('tgl_dxf_lines'); if (chkLines) { chkLines.checked = true; chkLines.disabled = false; }
        let chkTexts = document.getElementById('tgl_dxf_texts'); if (chkTexts) { chkTexts.checked = true; chkTexts.disabled = false; }
        window.toggleDxfLayers();

        setTimeout(() => {
            window.leafletMap.invalidateSize();
            if (geom.np > 0) {
                let b = window.dxfLineLayer.getBounds();
                if (b.isValid()) window.leafletMap.fitBounds(b, { padding: [20, 20], maxZoom: 22 });
                window.isAutoCenter = false;
                let btn = document.getElementById('autoCenterBtn');
                if (btn) btn.classList.remove('active');
            }
        }, 100);
    }

    if (useCache) {
        statusEl.innerHTML = `⏳ Redrawing...`;
        setTimeout(function() { finish(cache.geom, cache.texts, cache.info); }, 0);
        return;
    }

    let totalEntities = window.rawDxfEntities.length;
    let currentIndex = 0;
    statusEl.innerHTML = `⏳ Drawing Map... Please wait.`;

    let geom = new window.DxfGeom();
    let conv = window.dxfMakeConverter();
    let rawTexts = [];
    let blocks = window.rawDxfBlocks || {};
    let budget = { n: 800000, hidden: 0, unsup: {} };                    // ဆွဲမည့် primitive အများဆုံး (block ချဲ့ပြီး မခဲစေရန်)
    let rootCtx = { m: [1, 0, 0, 1, 0, 0], depth: 0, color: null, layer: null, blocks: blocks, budget: budget };

    const out = {
        poly: function(pts, closed, color, layer, type, fill) { geom.addPath(fill ? 1 : 0, color, layer, type, pts, conv); },
        circle: function(x, y, r, color, layer) { geom.addCircle(color, layer, x, y, r, conv); },
        point: function(x, y, color, layer, z) { geom.addPoint(color, layer, x, y, z, conv); },
        text: function(x, y, text, color, align, rot, layer, h) {
            if (!text) return;
            let p = conv(x, y); if (!(p.lat === p.lat) || !(p.lon === p.lon)) return;
            rawTexts.push({ lat: p.lat, lon: p.lon, text: text, color: color, align: align, rotation: rot, h: h });
        }
    };

    function processChunk() {
        if (window.dxfCancelFlag) return;

        let _t0 = performance.now();
        for (; currentIndex < totalEntities && (performance.now() - _t0) < 40; currentIndex++) {
            let ent = window.rawDxfEntities[currentIndex];
            try { window.dxfEmitEntity(ent, rootCtx, out); } catch (e) {}
        }
        let percent = Math.round((currentIndex / totalEntities) * 100);

        if (window.dxfCancelFlag) return;

        statusEl.innerHTML = `⏳ Drawing... ${percent}%`;
        if (currentIndex < totalEntities) { setTimeout(processChunk, 5); }
        else {
            geom.finalize();
            let info = { hidden: budget.hidden, unsup: budget.unsup, limit: budget.n <= 0 };
            window.dxfCache = { ents: window.rawDxfEntities, blocks: window.rawDxfBlocks, key: cacheKey, geom: geom, texts: rawTexts, info: info };
            finish(geom, rawTexts, info);
        }
    }
    processChunk();
};

window.reRenderDXFColors = function() {
    if (!window.rawDxfEntities || window.rawDxfEntities.length === 0) return;
    window.renderDXF();
};

window.zoomToCustomLayer = function(layerGroup) {
    if (!window.leafletMap || !layerGroup) return;
    if (layerGroup.isDxfCanvas) {                                   // DXF canvas layer: ကိုယ်ပိုင် bounds
        let b0 = layerGroup.getBounds();
        if (b0.isValid()) window.leafletMap.fitBounds(b0, { padding: [30, 30], maxZoom: 22 });
        return;
    }
    let bounds = L.latLngBounds();
    layerGroup.eachLayer(function (layer) {
        if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
            bounds.extend(layer.getLatLng());
        } else if (layer instanceof L.Polyline || layer instanceof L.Polygon) {
            let latlngs = layer.getLatLngs();
            if (latlngs.length > 0 && Array.isArray(latlngs[0])) {
                latlngs.forEach(arr => arr.forEach(ll => bounds.extend(ll)));
            } else {
                latlngs.forEach(ll => bounds.extend(ll));
            }
        }
    });
    if (bounds.isValid()) {
        window.leafletMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 22 });
    }
};

window.toggleDxfLayers = function() {
    if (!window.leafletMap) return;

    if (window.dxfLineLayer) {
        let chkLines = document.getElementById('tgl_dxf_lines');
        if (chkLines && chkLines.checked) { 
            if (!window.leafletMap.hasLayer(window.dxfLineLayer)) window.leafletMap.addLayer(window.dxfLineLayer); 
            if (!window._prevChkDxfLines) window.zoomToCustomLayer(window.dxfLineLayer);
            window._prevChkDxfLines = true;
        } else { 
            window.leafletMap.removeLayer(window.dxfLineLayer); 
            window._prevChkDxfLines = false;
        }
    }

    if (window.dxfTextLayer) {
        let chkTexts = document.getElementById('tgl_dxf_texts');
        if (chkTexts && chkTexts.checked) {
            if (!window.leafletMap.hasLayer(window.dxfTextLayer)) window.leafletMap.addLayer(window.dxfTextLayer);
            window.dxfTextLayer._reset();
        } else { 
            window.leafletMap.removeLayer(window.dxfTextLayer); 
        }
    }

    if (window.pointsLayerGroup) {
        let chkPts = document.getElementById('tgl_so_pts');
        if (chkPts && chkPts.checked) { 
            if (!window.leafletMap.hasLayer(window.pointsLayerGroup)) window.leafletMap.addLayer(window.pointsLayerGroup); 
            if (!window._prevChkSoPts) window.zoomToCustomLayer(window.pointsLayerGroup);
            window._prevChkSoPts = true;
        } else { 
            window.leafletMap.removeLayer(window.pointsLayerGroup); 
            window._prevChkSoPts = false;
        }
    }

    // 🔴 အသစ်ထည့်ထားသောအပိုင်း: GPS Recorded Points အဖွင့်အပိတ် 
    if (window.recordedLayerGroup) {
        let chkGpsPts = document.getElementById('tgl_gps_pts');
        if (chkGpsPts && chkGpsPts.checked) {
            if (!window.leafletMap.hasLayer(window.recordedLayerGroup)) window.leafletMap.addLayer(window.recordedLayerGroup);
            if (!window._prevChkGpsPts) window.zoomToCustomLayer(window.recordedLayerGroup);
            window._prevChkGpsPts = true;
        } else {
            window.leafletMap.removeLayer(window.recordedLayerGroup);
            window._prevChkGpsPts = false;
        }
    }

    let chkSoTexts = document.getElementById('tgl_so_texts');
    let mapCont = document.getElementById('map_container');
    if (chkSoTexts && mapCont) {
        if (chkSoTexts.checked) mapCont.classList.remove('hide-so-texts');
        else mapCont.classList.add('hide-so-texts');
    }
};

window.forceMapLayerRedraw = function(layerGroup) {
    if (!layerGroup || !window.leafletMap) return;
    if (window.leafletMap.hasLayer(layerGroup)) {
        window.leafletMap.removeLayer(layerGroup);
        window.leafletMap.addLayer(layerGroup);
    }
    try { window.leafletMap.panBy([0, 0], { animate: false }); } catch (e) {}
};

window.ensureSoPointsLayerVisible = function() {
    if (!window.leafletMap || !window.pointsLayerGroup) return;
    let chkPts = document.getElementById('tgl_so_pts');
    if (chkPts && chkPts.checked && !window.leafletMap.hasLayer(window.pointsLayerGroup)) {
        window.leafletMap.addLayer(window.pointsLayerGroup);
    }
};

window.refreshMapPointLayers = function(n) {
    if (!window.leafletMap) return;
    window.leafletMap.invalidateSize({ animate: false });

    if (typeof window.toggleDxfLayers === 'function') window.toggleDxfLayers();

    let topoTool = document.getElementById('cogo_topo_tool');
    let datum = document.getElementById('topo_datum') ? document.getElementById('topo_datum').value : "WGS_LL";
    let isTopoLocalActive = (n === 4 && topoTool && !topoTool.classList.contains('hidden') && datum === 'LOCAL');
    
    if (!isTopoLocalActive) {
        document.getElementById('map_view').style.background = '#ddd'; 
        let layerCtrl = document.querySelector('.leaflet-control-layers');
        if (layerCtrl) layerCtrl.style.display = 'block';
        window.leafletMap.eachLayer(function (layer) {
            if (layer instanceof L.TileLayer) { layer.setOpacity(1); }
        });
    }

    if (n === 3 || n === 4 || n === 6) {
        if (window.recordedLayerGroup && window.leafletMap.hasLayer(window.recordedLayerGroup)) {
            window.leafletMap.removeLayer(window.recordedLayerGroup);
        }
        window.ensureSoPointsLayerVisible();
        if (typeof window.plotPointsOnMap === 'function') window.plotPointsOnMap();
        setTimeout(() => {
            window.ensureSoPointsLayerVisible();
            if (window.pointsLayerGroup) window.forceMapLayerRedraw(window.pointsLayerGroup);
        }, 200);
    }

    if (n === 1 || n === 2 || n === 5) {
        if (!window.recordedLayerGroup) {
            window.recordedLayerGroup = L.layerGroup().addTo(window.leafletMap);
        } else if (!window.leafletMap.hasLayer(window.recordedLayerGroup)) {
            // 🔴 Checkbox ဖွင့်ထားမှသာ Map ပေါ် ပြန်တင်မည်
            let chkGpsPts = document.getElementById('tgl_gps_pts');
            if (!chkGpsPts || chkGpsPts.checked) {
                window.leafletMap.addLayer(window.recordedLayerGroup);
            }
        }
        if (typeof window.plotRecordedPointsOnMap === 'function') window.plotRecordedPointsOnMap();
        window.forceMapLayerRedraw(window.recordedLayerGroup);
        if (window.pointsLayerGroup && window.leafletMap.hasLayer(window.pointsLayerGroup)) {
            window.leafletMap.removeLayer(window.pointsLayerGroup);
        }
    }

    setTimeout(() => {
        let topoPane = window.leafletMap.getPane('topoPane');
        let dxfPane = window.leafletMap.getPane('dxfPane');

        if (n === 4) {
            if (topoPane) { topoPane.style.zIndex = "460"; topoPane.style.pointerEvents = "auto"; }
            if (dxfPane) { dxfPane.style.zIndex = "450"; dxfPane.style.pointerEvents = "none"; }
        } else if (n === 6) {
            if (dxfPane) { dxfPane.style.zIndex = "460"; dxfPane.style.pointerEvents = "auto"; }
            if (topoPane) { topoPane.style.zIndex = "450"; topoPane.style.pointerEvents = "none"; }
        } else {
            if (topoPane) { topoPane.style.zIndex = "460"; topoPane.style.pointerEvents = "auto"; }
            if (dxfPane) { dxfPane.style.zIndex = "450"; dxfPane.style.pointerEvents = "none"; }
        }
    }, 200);
};

// handleSharedMapUndo ကို module_surface_volume.js ထဲမှာ တစ်နေရာတည်း သတ်မှတ်ထားသည် (ပြန်ထပ်မရေးရန်)
