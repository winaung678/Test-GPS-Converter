// [split from map_engine.js] lines 860-1362 | part 4/7 | ထပ်ခွဲထားသည် - load order မပြောင်းရ (app.html ၏ script tag အစီအစဉ်အတိုင်း)
// ==========================================
// --- DXF ENGINE (CANVAS RENDERED) ---
// ==========================================
window.toggleDxfPanel = function() {
    let panel = document.getElementById('dxf_controls_panel'); let mapDiv = document.getElementById('map_view'); let btn = document.getElementById('btn_toggle_dxf_panel');
    if (panel.classList.contains('hidden')) { panel.classList.remove('hidden'); mapDiv.classList.remove('map-expanded'); btn.innerText = "🔼 Hide Controls & Expand Map"; }
    else { panel.classList.add('hidden'); mapDiv.classList.add('map-expanded'); btn.innerText = "🔽 Show Controls"; }
    setTimeout(() => { if(window.leafletMap) window.leafletMap.invalidateSize(); }, 350);
};

window.handleDXFUpload = function(event) {
    const file = event.target.files[0]; if (!file) return;
    document.getElementById('dxf_status').innerText = `⏳ Parsing ${file.name}... Please wait.`;
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        // Parse ကို background worker ထဲလုပ် (screen မတုံ့) - မရလျှင် main thread
        window.dxfParseAsync(text, function(err, res) {
            if (err) { document.getElementById('dxf_status').innerText = `❌ Error parsing DXF!`; alert("Failed to parse DXF. Please ensure it's a valid text-based DXF file."); return; }
            window.rawDxfEntities = res.entities || [];
            window.rawDxfBlocks = res.blocks || {};                      // INSERT/DIMENSION ချဲ့ရန် block ဖွဲ့စည်းပုံ
            window.dxfLayerTable = window.dxfBuildLayerTable(res.layers);
            window.dxfCache = null;

            window.dxfSaveRaw(text);                                      // မူရင်းစာသားကိုသာ save (မြန်)

            document.getElementById('dxf_status').innerText = `⚙️ Processing ${window.rawDxfEntities.length} entities...`;
            let exportBtn = document.getElementById('btn_export_kml'); if(exportBtn) exportBtn.style.display = 'block';
            setTimeout(() => { window.renderDXF(); window.toggleDxfPanel(); }, 100);
        });
    };
    reader.readAsText(file); event.target.value = '';
};

window.loadSavedDXF = function() {
    if (!window.mapDB) return;
    if (window._dxfLoading) return;
    let tx = window.mapDB.transaction("dxf_data", "readonly");
    let req = tx.objectStore("dxf_data").get("saved_dxf");
    req.onsuccess = function(e) {
        if (!e.target.result) return;
        let data = e.target.result;

        const activate = function(entities, blocks, layerTable) {
            window.rawDxfEntities = entities || [];
            window.rawDxfBlocks = blocks || {};
            window.dxfLayerTable = layerTable || {};
            window.dxfCache = null;
            document.getElementById('dxf_status').innerText = `✅ Loaded saved DXF map.`;
            let exportBtn = document.getElementById('btn_export_kml'); if(exportBtn) exportBtn.style.display = 'block';

            let chkLines = document.getElementById('tgl_dxf_lines'); if (chkLines) { chkLines.checked = true; chkLines.disabled = false; }
            let chkTexts = document.getElementById('tgl_dxf_texts'); if (chkTexts) { chkTexts.checked = true; chkTexts.disabled = false; }

            if (window.leafletMap && window.rawDxfEntities.length > 0) {
                setTimeout(() => { window.renderDXF(); }, 500);
            }
        };

        if (typeof data.raw === 'string') {                                // အသစ်: မူရင်း DXF စာသား → background parse
            window._dxfLoading = true;
            document.getElementById('dxf_status').innerText = `⏳ Loading saved DXF...`;
            window.dxfParseAsync(data.raw, function(err, res) {
                window._dxfLoading = false;
                if (err) { document.getElementById('dxf_status').innerText = `❌ Saved DXF could not be read.`; return; }
                activate(res.entities, res.blocks, window.dxfBuildLayerTable(res.layers));
            });
        } else {                                                           // အရင်ပုံစံ (parse ပြီးသား object) ကိုလည်း ဆက်ဖတ်နိုင်
            activate(data.entities, data.blocks, data.layerTable);
        }
    };
};

window.clearDXF = function() {
    if (!window.leafletMap) return;
    if (!confirm("Are you sure you want to clear the DXF map?")) return;
    window.dxfCancelFlag = true;
    window.rawDxfEntities = [];
    window.rawDxfBlocks = {};
    window.dxfLayerTable = {};
    window.dxfCache = null;
    if (window.dxfLineLayer) { window.leafletMap.removeLayer(window.dxfLineLayer); }
    if (window.dxfTextLayer) { window.leafletMap.removeLayer(window.dxfTextLayer); }
    window.dxfLineLayer = null;
    window.dxfTextLayer = null;
    
    let statusEl = document.getElementById('dxf_status');
    if (statusEl) statusEl.innerHTML = "Waiting for DXF file...";
    
    let exportBtn = document.getElementById('btn_export_kml');
    if(exportBtn) exportBtn.style.display = 'none';
    
    let dxfFileInp = document.getElementById('dxf_file');
    if(dxfFileInp) dxfFileInp.value = "";
    
    let chkLines = document.getElementById('tgl_dxf_lines');
    if (chkLines) { chkLines.checked = false; chkLines.disabled = true; }
    
    let chkTexts = document.getElementById('tgl_dxf_texts');
    if (chkTexts) { chkTexts.checked = false; chkTexts.disabled = true; }
    
    let chkDark = document.getElementById('tgl_dxf_dark');
    if (chkDark) { chkDark.checked = false; }

    if (window.mapDB) {
        let tx = window.mapDB.transaction("dxf_data", "readwrite");
        tx.objectStore("dxf_data").delete("saved_dxf");
    }
};

// ==== DXF IMPORT HELPERS (BEGIN) ====
// AutoCAD Color Index (ACI) ၂၅၆ ခုလုံး - 1-9 အခြေခံ၊ 10-249 = hue ၂၄ ခု × (အလင်းအမှောင် ၅ ဆင့် × ရောင်ပြင်း/ပျော့)၊ 250-255 မီးခိုးရောင်
window._aciCache = null;
window.aciToHex = function(n) {
    if (!window._aciCache) {
        const fixed = ["#000000", "#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff", "#ffffff", "#414141", "#808080"];
        const hx = v => ('0' + Math.max(0, Math.min(255, v)).toString(16)).slice(-2);
        const greys = [51, 92, 132, 173, 214, 255];
        let t = [];
        for (let i = 0; i < 256; i++) {
            if (i < 10) { t.push(fixed[i]); continue; }
            if (i >= 250) { let g = greys[i - 250]; t.push('#' + hx(g) + hx(g) + hx(g)); continue; }
            let k = i - 10, hue = Math.floor(k / 10) * 15, w = k % 10;
            let V = [255, 189, 129, 104, 79][w >> 1], S = (w % 2 === 0) ? 1 : 1 / 3;
            let C = V * S, h6 = hue / 60, X = C * (1 - Math.abs(h6 % 2 - 1)), m = V - C, r = 0, g = 0, b = 0;
            switch (Math.floor(h6)) {
                case 0: r = C; g = X; break;
                case 1: r = X; g = C; break;
                case 2: g = C; b = X; break;
                case 3: g = X; b = C; break;
                case 4: r = X; b = C; break;
                default: r = C; b = X; break;
            }
            t.push('#' + hx(Math.floor(r + m + 1e-6)) + hx(Math.floor(g + m + 1e-6)) + hx(Math.floor(b + m + 1e-6)));
        }
        window._aciCache = t;
    }
    if (typeof n !== 'number' || isNaN(n)) return null;
    n = Math.abs(Math.round(n));
    return (n >= 0 && n <= 255) ? window._aciCache[n] : null;
};

window.dxfRgbHex = function(v) { return '#' + ('000000' + (v & 0xFFFFFF).toString(16)).slice(-6); };

// Layer table မှ တစ်ခုချင်း → { c: '#rrggbb' | null, off: true/false }
window.dxfParseLayerEntry = function(l) {
    let idx = (typeof l.colorIndex === 'number') ? l.colorIndex : ((typeof l.colorNumber === 'number') ? l.colorNumber : undefined);
    let c = null, off = false;
    if (typeof idx === 'number') {
        if (idx < 0) off = true;                                  // အနုတ်အရောင်နံပါတ် = layer ပိတ်ထား
        c = (typeof l.color === 'number' && l.color >= 0 && l.color <= 0xFFFFFF && Math.abs(idx) !== 0) ? window.dxfRgbHex(l.color) : window.aciToHex(Math.abs(idx));
    } else if (typeof l.color === 'number') {
        c = l.color > 255 ? window.dxfRgbHex(l.color) : window.aciToHex(l.color);
    }
    if (l.visible === false || l.frozen === true) off = true;
    return { c: c, off: off };
};

window.dxfLayerInfo = function(name) {
    let v = (window.dxfLayerTable || {})[String(name || '0').toUpperCase()];
    if (v === undefined || v === null) return { c: null, off: false };
    if (typeof v === 'number') return { c: window.aciToHex(Math.abs(v)), off: v < 0 };        // အရင် save ထားသော ဟောင်းပုံစံ
    return v;
};

// Entity အရောင် = True color > ACI > ByBlock (INSERT အရောင်) > ByLayer
window.dxfEntityColor = function(ent, L, ctx) {
    let ci = ent.colorIndex;
    if (ci === 0) return ctx.color || L.c || '#ffffff';                         // ByBlock
    if (typeof ent.trueColor === 'number') return window.dxfRgbHex(ent.trueColor);
    let hasRgb = (typeof ent.color === 'number' && ent.color >= 0 && ent.color <= 0xFFFFFF);
    if (typeof ci === 'number' && ci !== 256) {
        if (hasRgb) return window.dxfRgbHex(ent.color);                          // parser ၏ ACI ဇယား သို့မဟုတ် true color (420)
        let a = window.aciToHex(ci); if (a) return a;
    } else if (hasRgb && ent.color > 0) {
        return window.dxfRgbHex(ent.color);                                      // true color (ByLayer ဟု မှတ်ထားသော်လည်း 420 ပါလျှင်)
    }
    return L.c || '#ffffff';                                                      // ByLayer
};

// TEXT/MTEXT ထဲက formatting code များ ဖယ်ပြီး ပုံမှန်စာသာ ထုတ်
window.dxfCleanText = function(s) {
    if (s === undefined || s === null) return '';
    s = String(s);
    s = s.replace(/\\P/g, ' ').replace(/\\~/g, ' ')
         .replace(/\\[fFcCHhWwQqTtAa][^;]*;/g, '')
         .replace(/\\[LlOoKk]/g, '')
         .replace(/\\S([^;^\/#]*)[\/#^]([^;]*);/g, '$1/$2')
         .replace(/\\U\+([0-9A-Fa-f]{4})/g, function(m, h) { return String.fromCharCode(parseInt(h, 16)); })
         .replace(/\\\\/g, '\\').replace(/\\([{}])/g, '$1').replace(/[{}]/g, '')
         .replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[cC]/g, 'Ø').replace(/%%[uUoO]/g, '').replace(/%%%/g, '%');
    return s.replace(/\s+/g, ' ').trim();
};

// Polyline bulge (အကွေ့ arc) : p1→p2 အကြား arc ပေါ်က အမှတ်များ (p1 မပါ၊ p2 ပါ)
window.dxfBulgePoints = function(p1, p2, bulge) {
    let dx = p2[0] - p1[0], dy = p2[1] - p1[1], c = Math.hypot(dx, dy);
    if (c < 1e-12 || Math.abs(bulge) < 1e-9) return [p2];
    let theta = 4 * Math.atan(bulge);
    let h = (c / 2) * (1 - bulge * bulge) / (2 * bulge);
    let cx = (p1[0] + p2[0]) / 2 + h * (-dy / c), cy = (p1[1] + p2[1]) / 2 + h * (dx / c);
    let r = Math.hypot(p1[0] - cx, p1[1] - cy), a0 = Math.atan2(p1[1] - cy, p1[0] - cx);
    let n = Math.max(2, Math.ceil(Math.abs(theta) / (5 * Math.PI / 180)));
    let pts = [];
    for (let i = 1; i < n; i++) { let a = a0 + theta * i / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    pts.push(p2);
    return pts;
};

window.dxfEllipsePoints = function(ent) {
    let c = ent.center, m = ent.majorAxisEndPoint; if (!c || !m) return [];
    let ratio = (typeof ent.axisRatio === 'number') ? ent.axisRatio : 1;
    let a0 = ent.startAngle || 0, a1 = (typeof ent.endAngle === 'number') ? ent.endAngle : 2 * Math.PI;
    if (a1 <= a0) a1 += 2 * Math.PI;
    let nx = -m.y * ratio, ny = m.x * ratio, n = Math.max(24, Math.ceil((a1 - a0) / (5 * Math.PI / 180))), pts = [];
    for (let i = 0; i <= n; i++) { let t = a0 + (a1 - a0) * i / n; pts.push([c.x + m.x * Math.cos(t) + nx * Math.sin(t), c.y + m.y * Math.cos(t) + ny * Math.sin(t)]); }
    return pts;
};

// SPLINE : knot/control point ပါလျှင် B-spline (de Boor) ဖြင့်တွက်၊ မပါလျှင် fit/control point များကို ဆက်
window.dxfSplinePoints = function(ent) {
    let cp = (ent.controlPoints || []).map(function(p) { return [p.x, p.y]; });
    let deg = ent.degreeOfSplineCurve || 3, kn = ent.knotValues || [];
    let w = (ent.weights && ent.weights.length === cp.length) ? ent.weights : null;
    if (cp.length >= deg + 1 && kn.length === cp.length + deg + 1) {
        let n = cp.length, t0 = kn[deg], t1 = kn[n], steps = Math.min(Math.max(n * 8, 24), 2000), pts = [];
        for (let q = 0; q <= steps; q++) {
            let t = t0 + (t1 - t0) * q / steps, s = deg;
            while (s < n - 1 && t >= kn[s + 1]) s++;
            let d = [];
            for (let j = 0; j <= deg; j++) { let i = s - deg + j, wt = w ? w[i] : 1; d.push([cp[i][0] * wt, cp[i][1] * wt, wt]); }
            for (let r = 1; r <= deg; r++) {
                for (let j = deg; j >= r; j--) {
                    let den = kn[j + 1 + s - r] - kn[j + s - deg], al = den === 0 ? 0 : (t - kn[j + s - deg]) / den;
                    d[j] = [(1 - al) * d[j - 1][0] + al * d[j][0], (1 - al) * d[j - 1][1] + al * d[j][1], (1 - al) * d[j - 1][2] + al * d[j][2]];
                }
            }
            let wd = d[deg][2] || 1; pts.push([d[deg][0] / wd, d[deg][1] / wd]);
        }
        return pts;
    }
    let fp = (ent.fitPoints || []).map(function(p) { return [p.x, p.y]; });
    return fp.length > 1 ? fp : cp;
};

// Entity တစ်ခု (INSERT/DIMENSION block များကိုပါ recursive ချဲ့၍) out.poly/circle/point/text သို့ ပို့
// ctx = { m:[a,b,c,d,e,f], depth, color(ByBlock), layer, blocks, budget:{n,hidden,unsup} }
window.dxfEmitEntity = function(ent, ctx, out) {
    if (!ent || ctx.depth > 8 || ctx.budget.n <= 0) return;
    if (ent.visible === false) return;
    if (ctx.depth === 0 && ent.inPaperSpace) return;                              // Paper space (layout) ထဲက entity များကို မြေပုံပေါ် မဆွဲ
    let t = ent.type, layerName = ent.layer || '0';
    if (layerName === '0' && ctx.layer) layerName = ctx.layer;                    // Block ထဲ layer 0 = INSERT ၏ layer
    let Li = window.dxfLayerInfo(layerName);
    if (Li.off) { ctx.budget.hidden++; return; }
    let color = window.dxfEntityColor(ent, Li, ctx), M = ctx.m;
    const ap = function(x, y) { return [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]; };
    const flip = !!(ent.extrusionDirection && ent.extrusionDirection.z < 0);      // OCS mirror (extrusion z = -1)
    const P = function(p) { let q = ap(flip ? -p.x : p.x, p.y); if (typeof p.z === 'number') q[2] = p.z; return q; };       // z (elevation) ကိုပါ ယူ
    const rotDeg = Math.atan2(M[1], M[0]) * 180 / Math.PI, scl = Math.hypot(M[0], M[1]);
    const poly = function(pts, closed, type, fill) { ctx.budget.n--; out.poly(pts, closed, color, layerName, type, fill); };
    switch (t) {
        case 'LINE': {
            let v = ent.vertices; if (!v || v.length < 2) break;
            poly([P(v[0]), P(v[1])], false, 'Line'); break;
        }
        case 'POLYLINE': case 'LWPOLYLINE': case 'LEADER': {
            let vs = ent.vertices || []; if (vs.length < 2) break;
            let closed = ent.shape === true || ent.closed === true;
            let raw = vs.map(function(v) { return [flip ? -v.x : v.x, v.y, v.z]; });
            let rp = [raw[0]], segs = closed ? vs.length : vs.length - 1;
            for (let i = 0; i < segs; i++) {
                let b = vs[i].bulge || 0; if (flip) b = -b;
                let p2 = raw[(i + 1) % vs.length];
                if (b) { let a = window.dxfBulgePoints(raw[i], p2, b); for (let j = 0; j < a.length; j++) rp.push(a[j]); } else rp.push(p2);
            }
            poly(rp.map(function(q) { let r = ap(q[0], q[1]); if (typeof q[2] === 'number') r[2] = q[2]; return r; }), false, t === 'LEADER' ? 'Leader' : 'Polyline'); break;
        }
        case 'CIRCLE': {
            if (!ent.center) break;
            let cx = flip ? -ent.center.x : ent.center.x, cy = ent.center.y, r = ent.radius;
            let sx = Math.hypot(M[0], M[1]), sy = Math.hypot(M[2], M[3]);
            if (Math.abs(sx - sy) < 1e-6 * Math.max(sx, sy, 1e-12) && Math.abs(M[0] * M[2] + M[1] * M[3]) < 1e-6 * sx * sy) {
                let q = ap(cx, cy); ctx.budget.n--; out.circle(q[0], q[1], r * sx, color, layerName);
            } else {
                let pts = []; for (let i = 0; i <= 72; i++) { let a = i * Math.PI / 36; pts.push(ap(cx + r * Math.cos(a), cy + r * Math.sin(a))); }
                poly(pts, false, 'Circle');
            }
            break;
        }
        case 'ARC': {
            if (!ent.center) break;
            let cx = flip ? -ent.center.x : ent.center.x, cy = ent.center.y, r = ent.radius, a0 = ent.startAngle, a1 = ent.endAngle;
            if (flip) { let s0 = Math.PI - a1, s1 = Math.PI - a0; a0 = s0; a1 = s1; }
            if (a1 <= a0) a1 += 2 * Math.PI;
            let n = Math.max(4, Math.ceil((a1 - a0) / (5 * Math.PI / 180))), pts = [];
            for (let i = 0; i <= n; i++) { let a = a0 + (a1 - a0) * i / n; pts.push(ap(cx + r * Math.cos(a), cy + r * Math.sin(a))); }
            poly(pts, false, 'Arc'); break;
        }
        case 'ELLIPSE': {
            let pts = window.dxfEllipsePoints(ent); if (pts.length > 1) poly(pts.map(function(q) { return ap(q[0], q[1]); }), false, 'Ellipse'); break;
        }
        case 'SPLINE': {
            let pts = window.dxfSplinePoints(ent); if (pts.length > 1) poly(pts.map(function(q) { return ap(q[0], q[1]); }), false, 'Spline'); break;
        }
        case 'SOLID': case 'TRACE': case '3DFACE': {
            let pp = ent.points || ent.vertices || []; if (pp.length < 3) break;
            let q = pp.map(function(p) { return P(p); });
            if (t !== '3DFACE' && q.length === 4) q = [q[0], q[1], q[3], q[2]];             // SOLID ၏ အမှတ်စဉ် 1,2,4,3
            poly(q, true, t === '3DFACE' ? '3D Face' : 'Solid', t !== '3DFACE'); break;
        }
        case 'POINT': {
            let pp = ent.position || ent; if (typeof pp.x !== 'number') break;
            let q = P(pp); ctx.budget.n--; out.point(q[0], q[1], color, layerName, q[2]); break;
        }
        case 'TEXT': {
            let sp = ent.startPoint || ent.position; if (!sp) break;
            let align = 'left', pnt = sp;
            if (ent.halign === 1 || ent.halign === 4) { align = 'center'; if (ent.endPoint) pnt = ent.endPoint; }
            else if (ent.halign === 2) { align = 'right'; if (ent.endPoint) pnt = ent.endPoint; }
            let q = P(pnt); ctx.budget.n--;
            let hh = (typeof ent.textHeight === 'number' && ent.textHeight > 0) ? ent.textHeight * scl : undefined;     // စာအမြင့် (မီတာ) - zoom နှင့်အတူ အရွယ်ပြောင်းရန်
            out.text(q[0], q[1], window.dxfCleanText(ent.text), color, align, (ent.rotation || 0) + rotDeg, layerName, hh); break;
        }
        case 'MTEXT': {
            let pos = ent.position || ent.startPoint; if (!pos) break;
            let ap9 = ent.attachmentPoint || 1, align = [2, 5, 8].includes(ap9) ? 'center' : ([3, 6, 9].includes(ap9) ? 'right' : 'left');
            let rot = (typeof ent.rotation === 'number') ? ent.rotation : (ent.directionVector ? Math.atan2(ent.directionVector.y, ent.directionVector.x) * 180 / Math.PI : 0);
            let q = P(pos); ctx.budget.n--;
            let hh = (typeof ent.height === 'number' && ent.height > 0) ? ent.height * scl : undefined;
            out.text(q[0], q[1], window.dxfCleanText(ent.text), color, align, rot + rotDeg, layerName, hh); break;
        }
        case 'INSERT': case 'DIMENSION': {
            let name = (t === 'INSERT') ? ent.name : ent.block;
            let blk = ctx.blocks && name ? ctx.blocks[name] : null;
            if (!blk || !blk.entities) { if (t === 'INSERT') ctx.budget.unsup['INSERT(no block)'] = (ctx.budget.unsup['INSERT(no block)'] || 0) + 1; break; }
            let base = blk.position || blk.basePoint || { x: 0, y: 0 };
            let childCtx = { depth: ctx.depth + 1, color: color, layer: layerName, blocks: ctx.blocks, budget: ctx.budget };
            if (t === 'DIMENSION') {                                                  // Dimension ၏ anonymous block = WCS အတိုင်း
                childCtx.m = M.slice();
                blk.entities.forEach(function(e) { window.dxfEmitEntity(e, childCtx, out); });
                break;
            }
            let pos = ent.position || { x: 0, y: 0 }, sx = (typeof ent.xScale === 'number') ? ent.xScale : 1, sy = (typeof ent.yScale === 'number') ? ent.yScale : 1;
            let th = (ent.rotation || 0) * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
            let rows = Math.min(ent.rowCount || 1, 200), cols = Math.min(ent.columnCount || 1, 200), rsp = ent.rowSpacing || 0, csp = ent.columnSpacing || 0;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    let ox = c * csp, oy = r * rsp, tx = pos.x + ox * cs - oy * sn, ty = pos.y + ox * sn + oy * cs;
                    // M_ins = T(tx,ty) · R(th) · S(sx,sy) · T(-base)
                    let a = cs * sx, b = sn * sx, cc = -sn * sy, d = cs * sy;
                    let e = tx - (a * base.x + cc * base.y), f = ty - (b * base.x + d * base.y);
                    childCtx.m = [M[0] * a + M[2] * b, M[1] * a + M[3] * b, M[0] * cc + M[2] * d, M[1] * cc + M[3] * d, M[0] * e + M[2] * f + M[4], M[1] * e + M[3] * f + M[5]];
                    blk.entities.forEach(function(ch) { window.dxfEmitEntity(ch, childCtx, out); });
                }
            }
            break;
        }
        default:
            ctx.budget.unsup[t] = (ctx.budget.unsup[t] || 0) + 1;
    }
};
// ==== DXF IMPORT HELPERS (END) ====

window.stringToColor = function(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
    let color = '#';
    for (let i = 0; i < 3; i++) {
        let value = (hash >> (i * 8)) & 0xFF;
        color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
};

window.dxfToLatLon = function(e, n) {
    let datum = document.getElementById('dxf_datum') ? document.getElementById('dxf_datum').value : "WGS_LL";
    if (datum === "SVY21") { 
        return calc_v2_rev(e, n); 
    }
    else if (datum.startsWith("WGS_UTM")) { 
        let zone = parseInt(datum.slice(-2)); let i_w = m_inverse(e, n, zone, m_WGS); return { lat: i_w.lat, lon: i_w.lon }; 
    }
    else if (datum === "GLOBAL_UTM") { 
        let zInput = document.getElementById('dxf_custom_zone'); let hInput = document.getElementById('dxf_custom_hemi'); 
        let zone = (zInput && zInput.value) ? parseInt(zInput.value) : 47; let hemi = hInput ? hInput.value : 'N'; 
        let calcN = n; if (hemi === 'S') calcN -= 10000000; let i_w = m_inverse(e, calcN, zone, m_WGS); return { lat: i_w.lat, lon: i_w.lon }; 
    }
    else { 
        let isMM = datum.startsWith("MM"); let zone = parseInt(datum.slice(-2)); let r = m_inverse(e, n, zone, isMM ? m_EVE : m_WGS); 
        if (isMM) { let x = m_llh2xyz(r.lat, r.lon, 0, m_EVE); let w = m_xyz2llh(x.x-m_DX, x.y-m_DY, x.z-m_DZ, m_WGS); return { lat: w.lat, lon: w.lon }; } 
        return { lat: r.lat, lon: r.lon }; 
    }
};

L.CanvasTextLayer = L.Layer.extend({
    initialize: function (texts, options) { this._texts = texts; L.setOptions(this, options); },
    onAdd: function (map) {
        this._map = map;
        if (!this._canvas) { 
            this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated'); 
            this._canvas.style.position = 'absolute'; 
            this._canvas.style.left = '0'; 
            this._canvas.style.top = '0'; 
            this._canvas.style.pointerEvents = 'none'; 
            this._canvas.style.zIndex = '650'; 
            this._ctx = this._canvas.getContext('2d'); 
        }
        
        map._panes.tooltipPane.appendChild(this._canvas); 
        
        map.on('move', this._reset, this); map.on('resize', this._reset, this); map.on('zoom', this._reset, this); 
        this._reset();
    },
    onRemove: function (map) { 
        L.DomUtil.remove(this._canvas); 
        map.off('move', this._reset, this); map.off('resize', this._reset, this); map.off('zoom', this._reset, this); 
    },
    _reset: function () { 
        let size = this._map.getSize(); 
        let tl = this._map.containerPointToLayerPoint([0, 0]); 
        L.DomUtil.setPosition(this._canvas, tl); 
        
        let dpr = window.devicePixelRatio || 1;
        this._canvas.width = size.x * dpr; 
        this._canvas.height = size.y * dpr; 
        this._canvas.style.width = size.x + 'px';
        this._canvas.style.height = size.y + 'px';

        this._draw(); 
    },
    _draw: function () {
        let ctx = this._ctx;
        let dpr = window.devicePixelRatio || 1;

        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

        let _z = this._map.getZoom();
        if (_z < 16) return;

        let bounds = this._map.getBounds();
        let isDarkMode = document.getElementById('master-ui').classList.contains('dark-mode');

        ctx.save();
        ctx.scale(dpr, dpr); 

        for (let i = 0; i < this._texts.length; i++) {
            let t = this._texts[i];
            if (!t.text || t.text.trim() === "") continue;
            if (_z < 19 && !t.isContour) continue;      // Contour label များသာ zoom 16 မှစပြ၊ ကျန်စာများ အရင်အတိုင်း zoom 19 မှ

            if (bounds.contains([t.lat, t.lon])) {
                let p = this._map.latLngToContainerPoint([t.lat, t.lon]);
                
                ctx.save();
                ctx.translate(p.x, p.y);
                if (t.rotation) { ctx.rotate(-t.rotation * Math.PI / 180); }

                if(t.align === 'center') ctx.textAlign = 'center'; 
                else if(t.align === 'right') ctx.textAlign = 'right'; 
                else ctx.textAlign = 'left';

                ctx.textBaseline = 'middle';
                ctx.lineJoin = 'round';

                if (t.isContour) {
                    ctx.font = 'bold 13px Arial, sans-serif'; 
                    ctx.fillStyle = t.color; 
                    ctx.strokeStyle = isDarkMode ? "rgba(15, 23, 42, 0.8)" : "rgba(255, 255, 255, 0.9)";
                    ctx.lineWidth = 2.5; 
                } 
                else {
                    ctx.font = `bold ${window.currentDxfTextSize}px sans-serif`;
                    let txtColor = t.color;
                    if ((txtColor === "#000000" || txtColor === "#0f172a") && isDarkMode) txtColor = "#FFFFFF";
                    if ((txtColor === "#FFFFFF" || txtColor === "#ffffff") && !isDarkMode) txtColor = "#0f172a";

                    ctx.fillStyle = txtColor;
                    ctx.strokeStyle = isDarkMode ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.8)";
                    ctx.lineWidth = 3;
                }

                ctx.strokeText(t.text, 0, 0); 
                ctx.fillText(t.text, 0, 0);   
                ctx.restore();
            }
        }
        ctx.restore();
    }
});

window.changeDxfTextSize = function(val) {
    window.currentDxfTextSize += val; 
    if (window.currentDxfTextSize < 6) window.currentDxfTextSize = 6; 
    if (window.currentDxfTextSize > 40) window.currentDxfTextSize = 40;
    
    let disp = document.getElementById('dxf_text_size_display'); 
    if(disp) disp.innerText = window.currentDxfTextSize;
    
    document.documentElement.style.setProperty('--pt-font-size', window.currentDxfTextSize + 'px');
    if (window.dxfTextLayer && window.leafletMap.hasLayer(window.dxfTextLayer)) { window.dxfTextLayer._reset(); }
};

