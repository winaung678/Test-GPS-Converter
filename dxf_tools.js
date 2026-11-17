// ==========================================
// 📐 DXF TOOLS - DXF export အားလုံး (Topo / 3D TIN / Volume / PF-CS / Eccentricity) မျှသုံး
//   ၁) ပုံအကျယ်အဝန်း ($EXTMIN/$EXTMAX/$LIMMIN/$LIMMAX) နှင့် စတင်မြင်ရမည့် view (VPORT *ACTIVE) ထည့်
//      → AutoCAD ဖွင့်တာနဲ့ ပုံတစ်ခုလုံး မြင်ရ (Zoom Extents ပြန်မလုပ်ရ)
//   ၂) Scale bar (1:xxx) ကို SCALE_BAR layer ထဲ၊ စာရွက်အရွယ် (A3/A4) ဘောင်ကို PLOT_FRAME layer ထဲ ထည့်
//      → AutoCAD Plot ၌ Window ဖြင့် ဘောင်ကို ရွေးပြီး ရွေးထားသည့် scale ထည့်လျှင် စာရွက်အပြည့် တိတိကျကျ ထွက်
//   Export function များသည် နောက်ဆုံး DXF string ကို window.dxfPostProcess() ကို ဖြတ်ပေးရုံသာ လိုသည်။
// ==========================================

window.DXF_STD_SCALES = [20, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];
window.DXF_OPTS_KEY = 'svy_dxf_opts_v1';
window.DXF_PAPER = { A3: [420, 297], A4: [297, 210] };      // mm (ဘေးလှဲ)
window.DXF_UI_SCALES = [100, 200, 500, 1000, 2000, 5000, 10000];     // dropdown မှာ ပါသော scale များ (ကျန်တာ = Custom)
// sheets: 'full' (လေးထောင့်ကွက်အပြည့် - မူလ) | 'topo' (Topo ရှိသော စာရွက်ကိုသာ)
// grid: 'full' (လေးထောင့်တစ်ခုလုံး - မူလ) | 'sheets' (ထားသော စာရွက်များထဲသာ) | 'near' (Topo အနီးက ကွက်များသာ)
// maxSheets: Auto scale + sheets='topo' တွင် စာရွက်အရေအတွက် အများဆုံး (၁ = တစ်ရွက်ထဲ ဆန့်အောင် - မူလ)
// စာရွက်ခွဲခြင်း အများဆုံးအရေအတွက် (မှားရိုက်၍ scale အသေးလွန်းသော်လည်း ထောင်ချီ မထွက်စေရန် ကာကွယ်ချက်၊ ၆၄ မှ ၄၀၀ သို့ တိုးထား)
window.DXF_MAX_SHEETS = 400;
window.dxfOpts = { scale: 'auto', custom: false, paper: 'A3', frame: true, bar: true, sheets: 'full', grid: 'full', maxSheets: 1 };

// ---------- Options (Export ခလုတ်များနားက "Plot scale / Paper / Frame / Scale bar" အကွက်များ) ----------
window.dxfOptsLoad = function() {
    try {
        let o = JSON.parse(localStorage.getItem(window.DXF_OPTS_KEY) || 'null');
        if (o && typeof o === 'object') {
            if (o.scale === 'auto') window.dxfOpts.scale = 'auto';
            else if (isFinite(Number(o.scale)) && Number(o.scale) >= 1 && Number(o.scale) <= 10000000) window.dxfOpts.scale = Math.round(Number(o.scale));
            if (typeof o.custom === 'boolean') window.dxfOpts.custom = o.custom;
            if (typeof o.bar === 'boolean') window.dxfOpts.bar = o.bar;
            if (typeof o.frame === 'boolean') window.dxfOpts.frame = o.frame;
            if (o.paper === 'A3' || o.paper === 'A4') window.dxfOpts.paper = o.paper;
            if (o.sheets === 'topo' || o.sheets === 'full') window.dxfOpts.sheets = o.sheets;
            if (o.grid === 'full' || o.grid === 'sheets' || o.grid === 'near') window.dxfOpts.grid = o.grid;
            if (isFinite(Number(o.maxSheets)) && Number(o.maxSheets) >= 1 && Number(o.maxSheets) <= window.DXF_MAX_SHEETS) window.dxfOpts.maxSheets = Math.round(Number(o.maxSheets));
        }
    } catch (e) {}
};

window.dxfOptsApplyToUI = function() {
    let o = window.dxfOpts;
    let isCustom = (o.scale !== 'auto') && (o.custom || window.DXF_UI_SCALES.indexOf(Number(o.scale)) < 0);
    Array.prototype.slice.call(document.querySelectorAll('.dxf-opt-scale')).forEach(function(el) { el.value = (o.scale === 'auto') ? 'auto' : (isCustom ? 'custom' : String(o.scale)); });
    Array.prototype.slice.call(document.querySelectorAll('.dxf-opt-scale-custom')).forEach(function(el) {
        el.style.display = isCustom ? 'inline-block' : 'none';
        if (isCustom && document.activeElement !== el) el.value = String(o.scale);      // ရိုက်နေစဉ် value မပြင်
    });
    Array.prototype.slice.call(document.querySelectorAll('.dxf-opt-bar')).forEach(function(el) { el.checked = !!o.bar; });
    Array.prototype.slice.call(document.querySelectorAll('.dxf-opt-frame')).forEach(function(el) { el.checked = !!o.frame; });
    Array.prototype.slice.call(document.querySelectorAll('.dxf-opt-paper')).forEach(function(el) { el.value = String(o.paper); });
    Array.prototype.slice.call(document.querySelectorAll('.dxf-opt-sheets')).forEach(function(el) { el.value = String(o.sheets); });
    Array.prototype.slice.call(document.querySelectorAll('.dxf-opt-grid')).forEach(function(el) { el.value = String(o.grid); });
    Array.prototype.slice.call(document.querySelectorAll('.dxf-opt-maxsheets')).forEach(function(el) { if (document.activeElement !== el) el.value = String(o.maxSheets); });
    // Max sheets အကွက်ကို Auto scale + Topo only ဖြစ်မှသာ ပြ
    Array.prototype.slice.call(document.querySelectorAll('.dxf-opt-maxsheets-wrap')).forEach(function(el) { el.style.display = (o.scale === 'auto' && o.sheets === 'topo') ? 'inline-flex' : 'none'; });
};

// အကွက်တစ်ခုပြောင်းလျှင် state ပြောင်း၊ မှတ်ထား၊ တခြား tab ရှိ ထပ်တူအကွက်များကိုလည်း ညှိ
window.dxfOptsOnChange = function(ev) {
    let t = ev && ev.target;
    if (!t || !t.classList) return;
    if (t.classList.contains('dxf-opt-scale')) {
        if (t.value === 'auto') { window.dxfOpts.scale = 'auto'; window.dxfOpts.custom = false; }
        else if (t.value === 'custom') { window.dxfOpts.custom = true; if (window.dxfOpts.scale === 'auto') window.dxfOpts.scale = 1000; }
        else { window.dxfOpts.scale = Number(t.value); window.dxfOpts.custom = false; }
    }
    else if (t.classList.contains('dxf-opt-scale-custom')) {
        let v = Math.round(Number(t.value));
        if (!(v >= 1 && v <= 10000000)) return;            // မပြည့်စုံသေးလျှင် (ဗလာ/မမှန်) မပြောင်း
        window.dxfOpts.scale = v; window.dxfOpts.custom = true;
    }
    else if (t.classList.contains('dxf-opt-bar')) window.dxfOpts.bar = !!t.checked;
    else if (t.classList.contains('dxf-opt-frame')) window.dxfOpts.frame = !!t.checked;
    else if (t.classList.contains('dxf-opt-paper')) window.dxfOpts.paper = (t.value === 'A4') ? 'A4' : 'A3';
    else if (t.classList.contains('dxf-opt-sheets')) {
        window.dxfOpts.sheets = (t.value === 'topo') ? 'topo' : 'full';
        if (window.dxfOpts.sheets === 'topo' && window.dxfOpts.grid === 'full') window.dxfOpts.grid = 'sheets';   // စာရွက်ဖယ်လျှင် grid ကိုပါ စာရွက်အတိုင်း (ပြန်ပြောင်း၍ရ)
    }
    else if (t.classList.contains('dxf-opt-grid')) window.dxfOpts.grid = (t.value === 'near' || t.value === 'sheets') ? t.value : 'full';
    else if (t.classList.contains('dxf-opt-maxsheets')) {
        let v = Math.round(Number(t.value));
        if (!(v >= 1 && v <= window.DXF_MAX_SHEETS)) return;
        window.dxfOpts.maxSheets = v;
    }
    else return;
    try { localStorage.setItem(window.DXF_OPTS_KEY, JSON.stringify(window.dxfOpts)); } catch (e) {}
    window.dxfOptsApplyToUI();
    if (typeof window.dxfSheetInfoUpdate === 'function') window.dxfSheetInfoUpdate();
};

window.dxfOptsInit = function() {
    window.dxfOptsLoad();
    window.dxfOptsApplyToUI();
    document.addEventListener('change', window.dxfOptsOnChange);
    document.addEventListener('input', function(ev) { if (ev.target && ev.target.classList && (ev.target.classList.contains('dxf-opt-scale-custom') || ev.target.classList.contains('dxf-opt-maxsheets'))) window.dxfOptsOnChange(ev); });
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.dxfOptsInit);
else window.dxfOptsInit();

// ---------- Helpers ----------
// target ထက်မကျော်သော 1/2/5 × 10ⁿ အကြီးဆုံးကိန်း
window.dxfNiceLen = function(target) {
    if (!(target > 0)) return 1;
    let p = Math.pow(10, Math.floor(Math.log10(target))), best = p;
    [1, 2, 5, 10].forEach(function(m) { if (m * p <= target * 1.0001) best = m * p; });
    return best;
};

window.dxfFmt = function(v) {
    let r = Math.round(v * 1000) / 1000;
    return String(r);
};

window.dxfNum = function(v) { return (Math.abs(v) < 1e-9 ? 0 : v).toFixed(3); };

// Entity builders (R12 format, လိုင်းအဆုံးမှာ newline မပါ)
window.dxfLineE = function(layer, x1, y1, x2, y2) {
    let n = window.dxfNum;
    return "0\nLINE\n8\n" + layer + "\n10\n" + n(x1) + "\n20\n" + n(y1) + "\n30\n0.0\n11\n" + n(x2) + "\n21\n" + n(y2) + "\n31\n0.0";
};
window.dxfSolidE = function(layer, p1, p2, p3, p4) {     // zig-zag အစဉ် (SOLID): p1,p2 = တစ်ဖက်၊ p3,p4 = ကျန်တစ်ဖက်
    let n = window.dxfNum;
    return "0\nSOLID\n8\n" + layer + "\n62\n7\n10\n" + n(p1[0]) + "\n20\n" + n(p1[1]) + "\n30\n0.0\n11\n" + n(p2[0]) + "\n21\n" + n(p2[1]) + "\n31\n0.0\n12\n" +
        n(p3[0]) + "\n22\n" + n(p3[1]) + "\n32\n0.0\n13\n" + n(p4[0]) + "\n23\n" + n(p4[1]) + "\n33\n0.0";
};
window.dxfTextE = function(layer, x, y, h, txt, rot) {   // အလယ်ချိန် (center / middle)
    let n = window.dxfNum;
    return "0\nTEXT\n8\n" + layer + "\n10\n" + n(x) + "\n20\n" + n(y) + "\n30\n0.0\n40\n" + n(h) + "\n1\n" + txt + "\n50\n" + (rot || 0).toFixed(3) +
        "\n72\n1\n11\n" + n(x) + "\n21\n" + n(y) + "\n31\n0.0\n73\n2";
};

// ရေပြင်ညီ scale bar: x0,y0 = ဘယ်အောက်ထောင့်၊ len = အစစ်အမှန်မီတာ၊ barH = bar အထူ၊ th = စာအမြင့်
window.dxfHBar = function(x0, y0, len, barH, th, layer, caption) {
    let out = [], n = 4, seg = len / n, L = window.dxfLineE, F = window.dxfFmt;
    out.push(L(layer, x0, y0, x0 + len, y0), L(layer, x0, y0 + barH, x0 + len, y0 + barH));
    for (let i = 0; i <= n; i++) out.push(L(layer, x0 + i * seg, y0, x0 + i * seg, y0 + barH));
    for (let i = 0; i < n; i += 2) out.push(window.dxfSolidE(layer, [x0 + i * seg, y0], [x0 + (i + 1) * seg, y0], [x0 + i * seg, y0 + barH], [x0 + (i + 1) * seg, y0 + barH]));
    out.push(window.dxfTextE(layer, x0, y0 - th * 1.3, th, "0", 0));
    out.push(window.dxfTextE(layer, x0 + len / 2, y0 - th * 1.3, th, F(len / 2), 0));
    out.push(window.dxfTextE(layer, x0 + len, y0 - th * 1.3, th, F(len) + " m", 0));
    if (caption) out.push(window.dxfTextE(layer, x0 + len / 2, y0 + barH + th * 1.2, th, caption, 0));
    return out;
};

// ထောင်လိုက် scale bar: height = ပုံထဲက အမြင့် (exaggeration ပါပြီးသား)၊ realLen = အစစ်အမှန်မီတာ
window.dxfVBar = function(x0, y0, height, realLen, barW, th, layer, caption) {
    let out = [], n = 4, seg = height / n, L = window.dxfLineE, F = window.dxfFmt;
    out.push(L(layer, x0, y0, x0, y0 + height), L(layer, x0 + barW, y0, x0 + barW, y0 + height));
    for (let i = 0; i <= n; i++) out.push(L(layer, x0, y0 + i * seg, x0 + barW, y0 + i * seg));
    for (let i = 0; i < n; i += 2) out.push(window.dxfSolidE(layer, [x0, y0 + i * seg], [x0 + barW, y0 + i * seg], [x0, y0 + (i + 1) * seg], [x0 + barW, y0 + (i + 1) * seg]));
    out.push(window.dxfTextE(layer, x0 + barW + th * 2.2, y0, th, "0", 0));
    out.push(window.dxfTextE(layer, x0 + barW + th * 2.2, y0 + height, th, F(realLen) + " m", 0));
    if (caption) out.push(window.dxfTextE(layer, x0 + barW / 2, y0 + height + th * 1.6, th, caption, 0));
    return out;
};

window.dxfRectE = function(layer, minX, minY, maxX, maxY) {
    let L = window.dxfLineE;
    return [L(layer, minX, minY, maxX, minY), L(layer, maxX, minY, maxX, maxY), L(layer, maxX, maxY, minX, maxY), L(layer, minX, maxY, minX, minY)];
};

// တစ်ဆက်တည်း ပိတ်ထားသော POLYLINE (R12) - ဘောင်လိုင်းအတွက် (LINE ၄ ကြောင်းခွဲမဟုတ်)
window.dxfClosedPolyE = function(layer, pts) {
    let n = window.dxfNum, out = ["0\nPOLYLINE\n8\n" + layer + "\n66\n1\n70\n1\n10\n0.0\n20\n0.0\n30\n0.0"];
    pts.forEach(function(p) { out.push("0\nVERTEX\n8\n" + layer + "\n10\n" + n(p[0]) + "\n20\n" + n(p[1]) + "\n30\n0.0"); });
    out.push("0\nSEQEND\n8\n" + layer);
    return out.join("\n");
};

// Plan ပုံအတွက် Plot scale ၊ စာရွက်ဘောင် ၊ scale bar နေရာကို တွက်ချက်သည်
//  bbox = ပုံ (plan) ၏ အကျယ်အဝန်း (မီတာ)
//  စာရွက်ပေါ်: ဘောင်အတွင်းအနား ၁၀ mm၊ ပုံနှင့် အနား ၅ mm၊ အောက်ဘက် ၂၅ mm ကို scale bar နေရာအဖြစ် ချန်
//  Auto = အလျားလိုက်/ထောင်လိုက် နှစ်မျိုးထဲက ပိုသေးသော scale နှင့် ဆန့်သည့်ဘက်၊ စံ scale ထဲက အနီးဆုံး
// ---------- Topo footprint (Topo ရှိသော နေရာ) - စာရွက်/grid ကွက် ဖယ်ရန် ----------
// src = { points:[{e,n}], tris:[{p1,p2,p3}], polys:[[{e,n}]] }   cellHint = ကွက်အသေးဆုံး အရွယ် (m)
// Triangle များကို (bbox မဟုတ်ဘဲ) ကွက်နှင့် တကယ်ထိမထိ စစ်၍ မှတ်၊ summed-area table ဖြင့် "ထောင့်မှန်စတုဂံ အတွင်း Topo ရှိ/မရှိ" ကို O(1) စစ်
function _fpTriRect(ax, ay, bx, by, cx, cy, x0, y0, x1, y1) {       // bbox ထပ်နေပြီးသား triangle နှင့် rect (SAT)
    const P = [[ax, ay], [bx, by], [cx, cy]], C = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    for (let i = 0; i < 3; i++) {
        const p = P[i], q = P[(i + 1) % 3], r = P[(i + 2) % 3];
        const nx = -(q[1] - p[1]), ny = (q[0] - p[0]);
        const sr = nx * (r[0] - p[0]) + ny * (r[1] - p[1]);
        if (sr === 0) continue;
        let sep = true;
        for (let k = 0; k < 4; k++) { if ((nx * (C[k][0] - p[0]) + ny * (C[k][1] - p[1])) * sr >= 0) { sep = false; break; } }
        if (sep) return false;
    }
    return true;
}
window.dxfBuildFootprint = function(src, cellHint) {
    let pts = src.points || [], tris = src.tris || [], polys = src.polys || [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = function(x, y) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };
    for (let i = 0; i < pts.length; i++) grow(pts[i].e, pts[i].n);
    polys.forEach(function(pl) { pl.forEach(function(p) { grow(p.e, p.n); }); });
    if (!isFinite(minX)) return null;
    let W = Math.max(maxX - minX, 1e-6), H = Math.max(maxY - minY, 1e-6);
    let cell = Math.max(cellHint > 0 ? cellHint : 1, Math.sqrt(W * H / 360000), 1e-3);     // ကွက်အရေအတွက် ~၃.၆ သိန်းအောက်
    let cols = Math.max(1, Math.ceil(W / cell) + 1), rows = Math.max(1, Math.ceil(H / cell) + 1);
    let occ = new Uint8Array(cols * rows);
    const cx = function(x) { let c = Math.floor((x - minX) / cell); return c < 0 ? 0 : (c >= cols ? cols - 1 : c); };
    const cy = function(y) { let r = Math.floor((y - minY) / cell); return r < 0 ? 0 : (r >= rows ? rows - 1 : r); };
    for (let i = 0; i < pts.length; i++) occ[cy(pts[i].n) * cols + cx(pts[i].e)] = 1;
    for (let t = 0; t < tris.length; t++) {
        const T = tris[t], a = T.p1, b = T.p2, c = T.p3;
        const tx0 = Math.min(a.e, b.e, c.e), tx1 = Math.max(a.e, b.e, c.e), ty0 = Math.min(a.n, b.n, c.n), ty1 = Math.max(a.n, b.n, c.n);
        const c0 = cx(tx0), c1 = cx(tx1), r0 = cy(ty0), r1 = cy(ty1);
        const small = (c1 - c0 <= 1 && r1 - r0 <= 1);
        for (let r = r0; r <= r1; r++) {
            for (let cc = c0; cc <= c1; cc++) {
                if (occ[r * cols + cc]) continue;
                if (small || _fpTriRect(a.e, a.n, b.e, b.n, c.e, c.n, minX + cc * cell, minY + r * cell, minX + (cc + 1) * cell, minY + (r + 1) * cell)) occ[r * cols + cc] = 1;
            }
        }
    }
    polys.forEach(function(pl) {                                    // Boundary polygon ၏ အနားများ (cell/2 အကွာဖြင့် sample)
        for (let i = 0; i < pl.length; i++) {
            const p = pl[i], q = pl[(i + 1) % pl.length];
            const steps = Math.max(1, Math.ceil(Math.hypot(q.e - p.e, q.n - p.n) / (cell / 2)));
            for (let s = 0; s <= steps; s++) { const f = s / steps; occ[cy(p.n + (q.n - p.n) * f) * cols + cx(p.e + (q.e - p.e) * f)] = 1; }
        }
    });
    let sat = new Int32Array((cols + 1) * (rows + 1));
    for (let r = 0; r < rows; r++) {
        let run = 0;
        for (let c = 0; c < cols; c++) { run += occ[r * cols + c]; sat[(r + 1) * (cols + 1) + (c + 1)] = sat[r * (cols + 1) + (c + 1)] + run; }
    }
    return {
        cell: cell, cols: cols, rows: rows, minX: minX, minY: minY, bbox: { minX: minX, minY: minY, maxX: maxX, maxY: maxY }, pad: 0,
        // (x0,y0)-(x1,y1) ထောင့်မှန်စတုဂံအတွင်း Topo ကွက် တစ်ခုခုရှိလျှင် true
        intersects: function(x0, y0, x1, y1) {
            if (x1 < minX || y1 < minY || x0 > minX + cols * cell || y0 > minY + rows * cell) return false;
            let c0 = Math.floor((x0 - minX) / cell), c1 = Math.floor((x1 - minX - 1e-9) / cell);
            let r0 = Math.floor((y0 - minY) / cell), r1 = Math.floor((y1 - minY - 1e-9) / cell);
            if (c1 < c0) c1 = c0; if (r1 < r0) r1 = r0;
            c0 = Math.max(0, c0); r0 = Math.max(0, r0); c1 = Math.min(cols - 1, c1); r1 = Math.min(rows - 1, r1);
            if (c1 < c0 || r1 < r0) return false;
            const W2 = cols + 1;
            return (sat[(r1 + 1) * W2 + (c1 + 1)] - sat[r0 * W2 + (c1 + 1)] - sat[(r1 + 1) * W2 + c0] + sat[r0 * W2 + c0]) > 0;
        }
    };
};

// ---------- Topo grid (E/N ကွက်) ထုတ်ပေးသော function - Sheets/Grid ရွေးချယ်စရာ မူလမဟုတ်သောအခါ ----------
// mode: 'full' (လေးထောင့်တစ်ခုလုံး) | 'sheets' (ထားသော စာရွက်များထဲသာ) | 'near' (Topo အနီးကွက်များသာ)
// placeIn: စာရွက်တစ်ရွက်၏ frame (ထားလျှင် title/north arrow ကို ဒီ frame ထဲ) သို့မဟုတ် null (မူလအတိုင်း grid အပေါ်/ညာ)
window.dxfTopoGridBuild = function(tg, fp, lay, frames, mode, placeIn) {
    const I = tg.interval, T = tg.txtH, out = [];
    const bb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const touch = function(x, y) { if (x < bb.minX) bb.minX = x; if (x > bb.maxX) bb.maxX = x; if (y < bb.minY) bb.minY = y; if (y > bb.maxY) bb.maxY = y; };
    const lineE = function(x1, y1, x2, y2) { out.push('0\nLINE\n8\nGRID_LINES\n10\n' + x1 + '\n20\n' + y1 + '\n30\n0.0\n11\n' + x2 + '\n21\n' + y2 + '\n31\n0.0'); touch(x1, y1); touch(x2, y2); };
    const textE = function(x, y, txt, rot, align) {
        out.push('0\nTEXT\n8\nGRID_TEXT\n10\n' + x + '\n20\n' + y + '\n30\n0.0\n40\n' + T + '\n1\n' + txt + (rot ? '\n50\n90.0' : '') + '\n72\n' + align + '\n11\n' + x + '\n21\n' + y + '\n31\n0.0\n73\n2');
        touch(x, y);
    };
    const eTxt = function(v) { return 'E ' + v.toFixed(0); }, nTxt = function(v) { return 'N ' + v.toFixed(0); };
    const num = function(v) { return +v.toFixed(6); };

    // ---- grid မျဉ်း + စာ ----
    if (mode === 'full') {                                              // မူလ code နှင့် တူ (လေးထောင့်တစ်ခုလုံး)
        let gMinE = tg.minE - I, gMaxE = tg.maxE + I, gMinN = tg.minN - I, gMaxN = tg.maxN + I;
        let startE = Math.ceil(gMinE / I) * I, startN = Math.ceil(gMinN / I) * I;
        for (let e = startE; e <= gMaxE; e += I) {
            let tx = e + T * 0.3; lineE(e, gMinN, e, gMaxN);
            textE(tx, gMaxN + T, eTxt(e), true, 0); textE(tx, gMinN - T, eTxt(e), true, 2);
        }
        for (let n = startN; n <= gMaxN; n += I) {
            lineE(gMinE, n, gMaxE, n);
            textE(gMinE - T, n, nTxt(n), false, 2); textE(gMaxE + T, n, nTxt(n), false, 0);
        }
        out.push('0\nPOLYLINE\n8\nGRID_LINES\n66\n1\n70\n1\n10\n0.0\n20\n0.0\n30\n0.0');
        [[gMinE, gMinN], [gMaxE, gMinN], [gMaxE, gMaxN], [gMinE, gMaxN]].forEach(function(p) { out.push('0\nVERTEX\n8\nGRID_LINES\n70\n32\n10\n' + p[0] + '\n20\n' + p[1] + '\n30\n0.0'); touch(p[0], p[1]); });
        out.push('0\nSEQEND\n8\nGRID_LINES');
    } else {
        // 1) ကွက်တစ်ခုချင်း (c,r) ကို ထားမလား (Topo နှင့် ကွက်ကြား I/2 အတွင်းဆိုလျှင် ထား) -> ဒေါင်လိုက်/အလျားလိုက် မျဉ်းများကို run အလိုက် ပေါင်း
        let vSegs = {}, hSegs = {};     // vSegs[k] = [[y0,y1],...] (x = k*I)  hSegs[k] = [[x0,x1],...] (y = k*I)
        if (mode === 'near') {
            let c0 = Math.floor((fp.bbox.minX - I) / I) - 1, c1 = Math.ceil((fp.bbox.maxX + I) / I) + 1;
            let r0 = Math.floor((fp.bbox.minY - I) / I) - 1, r1 = Math.ceil((fp.bbox.maxY + I) / I) + 1;
            let nc = c1 - c0 + 1, nr = r1 - r0 + 1;
            if (nc * nr > 6e6) return window.dxfTopoGridBuild(tg, fp, lay, frames, 'full', placeIn);   // ကွက်အရမ်းများ - ကာကွယ်
            let keep = new Uint8Array(nc * nr);
            for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {          // ကွက်ပတ်ပတ်လည် I/2 အတွင်း Topo ရှိလျှင်
                let cc = c + c0, rr = r + r0;
                if (fp.intersects((cc - 0.5) * I, (rr - 0.5) * I, (cc + 1.5) * I, (rr + 1.5) * I)) keep[r * nc + c] = 1;
            }
            const K = function(c, r) { return (c >= c0 && c <= c1 && r >= r0 && r <= r1) ? keep[(r - r0) * nc + (c - c0)] : 0; };
            const clip = !!(lay && lay.tiled && lay.filtered && frames && frames.length);
            const ivOf = function(coord, vertical) {            // coord တည့်ရာ frame များ၏ ကြားကာလ (merge)
                let iv = [];
                frames.forEach(function(f) { if (vertical ? (f.minX <= coord && coord <= f.maxX) : (f.minY <= coord && coord <= f.maxY)) iv.push(vertical ? [f.minY, f.maxY] : [f.minX, f.maxX]); });
                iv.sort(function(a, b) { return a[0] - b[0]; });
                let m = [];
                iv.forEach(function(q) { if (m.length && q[0] <= m[m.length - 1][1] + 1e-9) m[m.length - 1][1] = Math.max(m[m.length - 1][1], q[1]); else m.push([q[0], q[1]]); });
                return m;
            };
            const clipRuns = function(runs, coord, vertical) {
                if (!clip) return runs;
                let iv = ivOf(coord, vertical), res = [];
                runs.forEach(function(rn) { iv.forEach(function(q) { let a = Math.max(rn[0], q[0]), b = Math.min(rn[1], q[1]); if (b > a + 1e-9) res.push([a, b]); }); });
                return res;
            };
            for (let k = c0; k <= c1 + 1; k++) {
                let runs = [], start = null;
                for (let r = r0; r <= r1 + 1; r++) {
                    let on = (r <= r1) && (K(k - 1, r) || K(k, r));
                    if (on && start === null) start = r;
                    if (!on && start !== null) { runs.push([start * I, r * I]); start = null; }
                }
                runs = clipRuns(runs, k * I, true);
                if (runs.length) vSegs[k] = runs;
            }
            for (let k = r0; k <= r1 + 1; k++) {
                let runs = [], start = null;
                for (let c = c0; c <= c1 + 1; c++) {
                    let on = (c <= c1) && (K(c, k - 1) || K(c, k));
                    if (on && start === null) start = c;
                    if (!on && start !== null) { runs.push([start * I, c * I]); start = null; }
                }
                runs = clipRuns(runs, k * I, false);
                if (runs.length) hSegs[k] = runs;
            }
        } else {                                                            // 'sheets' : ထားသော စာရွက် frame များ၏ union ထဲသာ (frame ဘောင်နှင့် အတိအကျ ဖြတ်)
            let fx0 = Infinity, fx1 = -Infinity, fy0 = Infinity, fy1 = -Infinity;
            frames.forEach(function(f) { fx0 = Math.min(fx0, f.minX); fx1 = Math.max(fx1, f.maxX); fy0 = Math.min(fy0, f.minY); fy1 = Math.max(fy1, f.maxY); });
            const merge = function(iv) {
                iv.sort(function(a, b) { return a[0] - b[0]; });
                let m = [];
                iv.forEach(function(s) { if (m.length && s[0] <= m[m.length - 1][1] + 1e-9) m[m.length - 1][1] = Math.max(m[m.length - 1][1], s[1]); else m.push([s[0], s[1]]); });
                return m;
            };
            for (let k = Math.ceil(fx0 / I); k * I <= fx1; k++) {
                let x = k * I, iv = [];
                frames.forEach(function(f) { if (f.minX <= x && x <= f.maxX) iv.push([f.minY, f.maxY]); });
                if (iv.length) vSegs[k] = merge(iv);
            }
            for (let k = Math.ceil(fy0 / I); k * I <= fy1; k++) {
                let y = k * I, iv = [];
                frames.forEach(function(f) { if (f.minY <= y && y <= f.maxY) iv.push([f.minX, f.maxX]); });
                if (iv.length) hSegs[k] = merge(iv);
            }
        }
        // 2) မျဉ်းထုတ် + စာ (မျဉ်းတစ်ကြောင်းချင်း အဆုံး ၂ ဖက်မှာ - 'near' = အပြင်၊ 'sheets' = ဘောင်အတွင်း)
        const inside = (mode === 'sheets');
        Object.keys(vSegs).forEach(function(ks) {
            let k = +ks, x = num(k * I), runs = vSegs[ks];
            runs.forEach(function(s) { lineE(x, num(s[0]), x, num(s[1])); });
            let lo = runs[0][0], hi = runs[runs.length - 1][1], tx = num(x + T * 0.3);
            if (inside) { textE(tx, num(hi - T * 0.5), eTxt(x), true, 2); textE(tx, num(lo + T * 0.5), eTxt(x), true, 0); }
            else { textE(tx, num(hi + T), eTxt(x), true, 0); textE(tx, num(lo - T), eTxt(x), true, 2); }
        });
        Object.keys(hSegs).forEach(function(ks) {
            let k = +ks, y = num(k * I), runs = hSegs[ks];
            runs.forEach(function(s) { lineE(num(s[0]), y, num(s[1]), y); });
            let lo = runs[0][0], hi = runs[runs.length - 1][1];
            if (inside) { textE(num(lo + T * 0.5), y, nTxt(y), false, 0); textE(num(hi - T * 0.5), y, nTxt(y), false, 2); }
            else { textE(num(lo - T), y, nTxt(y), false, 2); textE(num(hi + T), y, nTxt(y), false, 0); }
        });
    }

    // ---- Title + North arrow ----
    const arrow = function(bE, bN, nSize, th) {
        const w = nSize * 0.25, tN = bN + nSize, cN = bN + nSize * 0.3;
        out.push('0\nLINE\n8\nNORTH_ARROW\n10\n' + bE + '\n20\n' + bN + '\n30\n0.0\n11\n' + bE + '\n21\n' + tN + '\n31\n0.0');
        out.push('0\nSOLID\n8\nNORTH_ARROW\n10\n' + bE + '\n20\n' + tN + '\n30\n0.0\n11\n' + (bE + w) + '\n21\n' + cN + '\n31\n0.0\n12\n' + bE + '\n22\n' + cN + '\n32\n0.0\n13\n' + bE + '\n23\n' + cN + '\n33\n0.0');
        out.push('0\nLINE\n8\nNORTH_ARROW\n10\n' + bE + '\n20\n' + tN + '\n30\n0.0\n11\n' + (bE - w) + '\n21\n' + cN + '\n31\n0.0');
        out.push('0\nLINE\n8\nNORTH_ARROW\n10\n' + (bE - w) + '\n20\n' + cN + '\n30\n0.0\n11\n' + bE + '\n21\n' + cN + '\n31\n0.0');
        out.push('0\nCIRCLE\n8\nNORTH_ARROW\n10\n' + bE + '\n20\n' + bN + '\n30\n0.0\n40\n' + (nSize * 0.1));
        out.push('0\nTEXT\n8\nNORTH_ARROW\n10\n' + bE + '\n20\n' + (tN + th * 0.8) + '\n30\n0.0\n40\n' + (th * 1.5) + '\n1\nN\n72\n1\n11\n' + bE + '\n21\n' + (tN + th * 0.8) + '\n31\n0.0\n73\n1');
        touch(bE - w, bN); touch(bE + w, tN + th * 3);
    };
    const title = function(x, y, h) {
        out.push('0\nTEXT\n8\nMAP_TITLE\n10\n' + x + '\n20\n' + y + '\n30\n0.0\n40\n' + h + '\n1\n' + tg.title + '\n72\n1\n11\n' + x + '\n21\n' + y + '\n31\n0.0\n73\n1');
        touch(x, y + h);
    };
    if (placeIn) {                                                       // ထားသော ပထမစာရွက်ထဲ (စာရွက်အရွယ်နှင့် အချိုးကျ)
        const k = lay.k, f = placeIn;
        title((f.minX + f.maxX) / 2, f.maxY - 26 * k, 6 * k);
        arrow(f.maxX - 22 * k, f.maxY - 46 * k, 16 * k, 2.2 * k);
    } else {                                                             // မူလနေရာ (grid ၏ အပေါ်/ညာ)
        let gMinE = tg.minE - I, gMaxE = tg.maxE + I, gMinN = tg.minN - I, gMaxN = tg.maxN + I;
        title((gMinE + gMaxE) / 2, gMaxN + T * 10, T * 2.5);
        let nSize = Math.min(Math.max((gMaxN - gMinN) * 0.08, I * 0.4), 50);
        arrow(gMaxE + T * 8, gMaxN - nSize * 1.5 + T * 4, nSize, T);
    }
    return { entities: out, bbox: isFinite(bb.minX) ? bb : null };
};

// ---------- စာရွက်အရေအတွက် ကြိုကြည့်ချက် (Options အောက်က စာကြောင်း) ----------
window.dxfSheetInfoText = function() {
    if (!window.topoPoints || window.topoPoints.length < 3 || !window.topoTriangles || !window.topoTriangles.length) return '';
    let ui = window.dxfOpts, P = window.DXF_PAPER[ui.paper] || window.DXF_PAPER.A3;
    let gi = document.getElementById('topo_grid_interval');
    let I = gi ? (parseFloat(gi.value) || 50) : 50, T = Math.max(2.5, I * 0.12);
    let c = window._dxfFpCache;
    if (!c || c.tris !== window.topoTriangles || c.pts !== window.topoPoints || c.I !== I || c.bdy !== window.topoBoundaryPolygon) {
        let fp = window.dxfBuildFootprint({ points: window.topoPoints, tris: window.topoTriangles, polys: [window.topoBoundaryPolygon || []].concat(window.topoExcludePolygons || []).filter(function(p) { return p.length > 2; }) }, I / 2);
        c = window._dxfFpCache = { tris: window.topoTriangles, pts: window.topoPoints, I: I, bdy: window.topoBoundaryPolygon, fp: fp };
    }
    let fp = c.fp; if (!fp) return '';
    fp.pad = 0;
    let b = fp.bbox, pad = I + 2 * T;
    let bbTopo = { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
    let bbFull = { minX: b.minX - I - 2 * T, maxX: b.maxX + I + 12 * T, minY: b.minY - I - 2 * T, maxY: b.maxY + I + 13 * T };
    let saved = ui.sheets, a, t;
    try { ui.sheets = 'full'; a = window.dxfPlanLayout(bbFull, null); ui.sheets = 'topo'; t = window.dxfPlanLayout(bbTopo, fp); }
    finally { ui.sheets = saved; }
    const fmt = function(l) {
        if (l.tooMany && !l.tiled) return '1:' + l.scale + ' - too many sheets';
        let n = l.tiled ? (l.keptCount || l.tiles.length) : 1;
        return '1:' + l.scale + ' \u00B7 ' + n + (n === 1 ? ' sheet' : ' sheets');
    };
    return (saved === 'topo') ? ('\u2248 ' + ui.paper + ' Topo only: ' + fmt(t) + '   (full rectangle: ' + fmt(a) + ')')
                              : ('\u2248 ' + ui.paper + ' Full rectangle: ' + fmt(a) + '   (Topo only: ' + fmt(t) + ')');
};
window.dxfSheetInfoUpdate = function() {
    let els = document.querySelectorAll('.dxf-sheet-info');
    if (!els.length) return;
    let txt = '';
    try { txt = window.dxfSheetInfoText(); } catch (e) { console.warn('dxfSheetInfo', e); }
    Array.prototype.slice.call(els).forEach(function(el) { el.textContent = txt; });
};

// ---------- စာရွက်များခွဲ (multi-sheet tiling) ----------
// Plot scale ကို ကိုယ်တိုင်သတ်မှတ်ထားပြီး ပုံက A3/A4 တစ်ရွက်ထဲ မဆန့်လျှင် စာရွက်ဘောင်များကို grid ပုံစံ ဆက်ဆွဲ
// overlap = ကပ်လျက်ဘောင်နှစ်ခု ထပ်မည့် အကျယ် (mm)၊ edge = ပုံနှင့် ဘောင်အနား (mm)၊ reserve = အောက်ဘက် scale bar နေရာ (mm)
window.DXF_TILE = { overlap: 10, edge: 15, reserve: 25, maxSheets: window.DXF_MAX_SHEETS };
window.dxfTileLayout = function(bbox, scale, P, fp) {
    let T = window.DXF_TILE, ui = window.dxfOpts, ov = T.overlap;
    let W = Math.max(bbox.maxX - bbox.minX, 0.001), H = Math.max(bbox.maxY - bbox.minY, 0.001);
    let Wp = W * 1000 / scale, Hp = H * 1000 / scale;                 // စာရွက်ပေါ်ရှိ ပုံအရွယ် (mm)
    // တစ်ရွက်ထဲ ဆန့်လျှင် မခွဲ (မူလ single-frame logic ကိုသုံး)
    let single = [[P[0], P[1]], [P[1], P[0]]].some(function(d) { return Wp <= d[0] - 30 + 1e-9 && Hp <= d[1] - 55 + 1e-9; });
    if (single) return null;
    let cands = [{ name: 'landscape', pw: P[0], ph: P[1] }, { name: 'portrait', pw: P[1], ph: P[0] }];
    cands.forEach(function(o) {
        o.cols = Math.max(1, Math.ceil((Wp + 2 * T.edge - ov) / (o.pw - ov) - 1e-9));
        o.rows = Math.max(1, Math.ceil((Hp + 2 * T.edge + T.reserve - ov) / (o.ph - ov) - 1e-9));
        o.n = o.cols * o.rows;
    });
    let best = cands[0].n < cands[1].n ? cands[0] : (cands[1].n < cands[0].n ? cands[1] : (W >= H ? cands[0] : cands[1]));
    let topoOnly = !!(fp && ui.sheets === 'topo');                    // Topo ရှိသော စာရွက်ကိုသာ ထား
    // Topo-only မှာ "ဖယ်ပြီးနောက် ကျန်သောအရေအတွက်" ကို အများဆုံးနှင့်တိုက်စစ် (လေးထောင့်ကွက်အပြည့်က ၆၄ ကျော်နေသော်လည်း ရနိုင်)၊ ထိုသို့မဟုတ်ရင် မူလအတိုင်း
    if (topoOnly ? best.n > 40000 : best.n > T.maxSheets) return { tooMany: best.n };
    let k = scale / 1000;
    let Gw = (best.cols * best.pw - (best.cols - 1) * ov) * k, Gh = (best.rows * best.ph - (best.rows - 1) * ov) * k;
    let cx = (bbox.minX + bbox.maxX) / 2, cy = ((bbox.minY - T.reserve * k) + bbox.maxY) / 2;
    let grid = { minX: cx - Gw / 2, minY: cy - Gh / 2, maxX: cx + Gw / 2, maxY: cy + Gh / 2 };
    let tiles = [];
    for (let i = 0; i < best.rows; i++) {
        for (let j = 0; j < best.cols; j++) {
            let x0 = grid.minX + j * (best.pw - ov) * k, y1 = grid.maxY - i * (best.ph - ov) * k;
            tiles.push({ no: i * best.cols + j + 1, row: i + 1, col: j + 1, frame: { minX: x0, minY: y1 - best.ph * k, maxX: x0 + best.pw * k, maxY: y1 } });
        }
    }
    let fullCount = tiles.length, filtered = false;
    if (topoOnly) {
        // ကွက်တစ်ခု၏ "ကိုယ်ပိုင်နေရာ" = frame - ကပ်လျက်ဘောင်နှင့် ထပ်သော အပိုင်း၏ တစ်ဝက် (match line ကို အလယ်ထား၍ ကွက်များ မထပ်စပ်ပဲ ဖုံး)
        let h = ov * k / 2, pad = fp.pad || 0;
        let kept = tiles.filter(function(t) {
            let f = t.frame, i = t.row - 1, j = t.col - 1;
            let x0 = f.minX + (j > 0 ? h : 0), x1 = f.maxX - (j < best.cols - 1 ? h : 0);
            let y1b = f.maxY - (i > 0 ? h : 0), y0b = f.minY + (i < best.rows - 1 ? h : 0);
            return fp.intersects(x0 - pad, y0b - pad, x1 + pad, y1b + pad);
        });
        if (kept.length > 0 && kept.length < fullCount) {
            filtered = true; tiles = kept;
            tiles.forEach(function(t, idx) { t.gridNo = t.no; t.no = idx + 1; });
        }
        if (tiles.length > T.maxSheets) return { tooMany: tiles.length };
    }
    let byRC = {};
    tiles.forEach(function(t) { byRC[(t.row - 1) + ',' + (t.col - 1)] = t; });
    let barSrc = (filtered ? tiles[0].frame : null);
    let kb = null;
    if (filtered) { kb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }; tiles.forEach(function(t) { let f = t.frame; kb.minX = Math.min(kb.minX, f.minX); kb.minY = Math.min(kb.minY, f.minY); kb.maxX = Math.max(kb.maxX, f.maxX); kb.maxY = Math.max(kb.maxY, f.maxY); }); }
    return { tiled: true, scale: scale, paper: ui.paper, orient: best.name, cols: best.cols, rows: best.rows, pw: best.pw, ph: best.ph, ov: ov,
             tiles: tiles, grid: grid, frame: grid, inner: grid, bbox: bbox, k: k, byRC: byRC, fullCount: fullCount, keptCount: tiles.length, filtered: filtered, keptBBox: kb,
             barX: barSrc ? barSrc.minX + 20 * k : grid.minX + 20 * k, barY: barSrc ? barSrc.minY + 22 * k : grid.minY + 22 * k };
};

window.dxfPlanLayout = function(bbox, fp) {
    let ui = window.dxfOpts, P = window.DXF_PAPER[ui.paper] || window.DXF_PAPER.A3;
    let W = Math.max(bbox.maxX - bbox.minX, 0.001), H = Math.max(bbox.maxY - bbox.minY, 0.001);
    let orients = [{ name: 'landscape', pw: P[0], ph: P[1] }, { name: 'portrait', pw: P[1], ph: P[0] }];
    orients.forEach(function(o) { o.uw = o.pw - 20 - 10; o.uh = o.ph - 20 - 10 - 25; o.need = Math.max(W * 1000 / o.uw, H * 1000 / o.uh); });
    let best = orients[0].need <= orients[1].need ? orients[0] : orients[1];
    let scale;
    let manual = (ui.scale !== 'auto' && Number(ui.scale) > 0) ? Number(ui.scale) : 0;
    // Auto + Topo only + စာရွက်အများဆုံး > 1 : "ကျန်သောစာရွက်အရေအတွက် ≤ အများဆုံး" ဖြစ်စေသော အကြီးဆုံး (အနည်းဆုံး denominator) စံ scale ကိုရွေး
    if (!manual && fp && ui.sheets === 'topo' && ui.maxSheets > 1) {
        let list = window.DXF_STD_SCALES;
        for (let i = 0; i < list.length; i++) {
            let tl = window.dxfTileLayout(bbox, list[i], P, fp);
            if (!tl) { manual = list[i]; break; }                        // တစ်ရွက်ထဲ ဆန့်
            if (tl.tooMany) continue;
            if (tl.tiled && tl.keptCount <= ui.maxSheets) return tl;
        }
    }
    if (manual) {
        scale = manual;
        // ရွေးထားသော scale မှာ ပိုကောင်းစွာဆန့်သည့် အရှည်/အနံ ဘက်ကို ရွေး
        let fit = function(o) { return Math.min(o.uw / (W * 1000 / scale), o.uh / (H * 1000 / scale)); };
        best = fit(orients[0]) >= fit(orients[1]) ? orients[0] : orients[1];
    } else {
        let need = best.need, list = window.DXF_STD_SCALES;       // (ပုံနှင့်အနား ၅ mm ကို usable ထဲမှာ ထည့်တွက်ပြီးသား)
        scale = list[list.length - 1];
        for (let i = 0; i < list.length; i++) { if (list[i] >= need) { scale = list[i]; break; } }
    }
    let tooMany = 0;
    if (ui.scale !== 'auto' && Number(ui.scale) > 0) {
        let tl = window.dxfTileLayout(bbox, scale, P, fp);        // တစ်ရွက်မဆန့်လျှင် စာရွက်များခွဲ
        if (tl && tl.tiled) return tl;
        if (tl && tl.tooMany) tooMany = tl.tooMany;           // အရမ်းများလွန်း → တစ်ဘောင်ထဲ + သတိပေး
    }
    let k = scale / 1000;                                         // စာရွက် ၁ mm = မော်ဒယ် k မီတာ
    let Fw = best.pw * k, Fh = best.ph * k, reserve = 25 * k;
    let cx = (bbox.minX + bbox.maxX) / 2, cy = ((bbox.minY - reserve) + bbox.maxY) / 2;
    let frame = { minX: cx - Fw / 2, minY: cy - Fh / 2, maxX: cx + Fw / 2, maxY: cy + Fh / 2 };
    let inner = { minX: frame.minX + 10 * k, minY: frame.minY + 10 * k, maxX: frame.maxX - 10 * k, maxY: frame.maxY - 10 * k };
    return { scale: scale, paper: ui.paper, orient: best.name, frame: frame, inner: inner, bbox: bbox, k: k,
             barX: inner.minX + 10 * k, barY: inner.minY + 12 * k, tooMany: tooMany };
};

// ---------- Bounding box (entity အလိုက်ဖတ် - POLYLINE ခေါင်းစီးထဲက အတု (0,0) ကို ကျော်) ----------
window.dxfScanBBox = function(lines, s, e) {
    const ENT = { LINE: 1, POINT: 1, TEXT: 1, VERTEX: 1, SOLID: 1, '3DFACE': 1, CIRCLE: 1, ARC: 1 };
    const CW = 0.8;                                  // TEXT တစ်လုံး အကျယ် ≈ 0.8 × အမြင့်
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let type = null, xs = [0, 0, 0, 0], ys = [0, 0, 0, 0], have = [false, false, false, false], rad = 0, cx = 0, cy = 0;
    let tx = null;
    const add = function(x, y) {
        if (!isFinite(x) || !isFinite(y)) return;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    };
    // TEXT တစ်ခု၏ အကျယ်/အမြင့်/လှည့်ထားမှု/alignment ကိုထည့်တွက် (စာတွေ ဘောင်ကျော်မသွားစေရန်)
    const flushText = function() {
        if (!tx) return;
        let t = tx; tx = null;
        if (!t.str || !(t.h > 0)) return;
        let ax = have[1] ? xs[1] : xs[0], ay = have[1] ? ys[1] : ys[0];
        if (!isFinite(ax) || !isFinite(ay)) return;
        let w = t.str.length * t.h * CW;
        let x0 = (t.ha === 1) ? -w / 2 : (t.ha === 2 ? -w : 0), x1 = x0 + w;
        let y0 = (t.va === 2) ? -t.h / 2 : (t.va === 3 ? -t.h : 0), y1 = y0 + t.h;
        let r = (t.rot || 0) * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
        [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(function(p) { add(ax + p[0] * cs - p[1] * sn, ay + p[0] * sn + p[1] * cs); });
    };
    for (let i = s; i < e && i < lines.length - 1; i += 2) {
        let code = lines[i].trim(), val = lines[i + 1];
        if (code === '0') {
            flushText();
            type = val.trim(); have[0] = have[1] = have[2] = have[3] = false;
            if (type === 'TEXT') tx = { str: '', h: 0, rot: 0, ha: 0, va: 0 };
            continue;
        }
        if (!ENT[type]) continue;
        let c = parseInt(code, 10);
        if (c >= 10 && c <= 13) { xs[c - 10] = parseFloat(val); have[c - 10] = true; }
        else if (c >= 20 && c <= 23 && have[c - 20]) {
            let y = parseFloat(val);
            ys[c - 20] = y;
            add(xs[c - 20], y);
            if ((type === 'CIRCLE' || type === 'ARC') && c === 20) { cx = xs[0]; cy = y; }
        } else if (c === 40 && (type === 'CIRCLE' || type === 'ARC')) {
            rad = parseFloat(val);
            if (isFinite(rad)) { add(cx - rad, cy - rad); add(cx + rad, cy + rad); }
        } else if (tx) {
            if (c === 1) tx.str = val.replace(/\r$/, '');
            else if (c === 40) tx.h = parseFloat(val);
            else if (c === 50) tx.rot = parseFloat(val);
            else if (c === 72) tx.ha = parseInt(val, 10);
            else if (c === 73) tx.va = parseInt(val, 10);
        }
    }
    flushText();
    if (!isFinite(minX)) return null;
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
};

// နောက်ဆုံး DXF string ကို ဖြတ်ပြီး Extents / View / Plot frame / Scale bar ထည့်ပေးသည်
// o.layout = PF/CS export က plan အပိုင်းအတွက် ကြိုတွက်ထားသော dxfPlanLayout() ရလဒ်
// Error ဖြစ်လျှင် မူလ DXF ကို ပြန်ပေး (export မပျက်စေရန်)
window.dxfPostProcess = function(dxf, o) {
    try { return window._dxfPostProcess(String(dxf), o || {}); }
    catch (e) { console.error('dxfPostProcess', e); return dxf; }
};

window._dxfPostProcess = function(dxf, o) {
    let lines = dxf.split('\n');
    let es = -1;
    for (let i = 1; i < lines.length; i++) { if (lines[i].trim() === 'ENTITIES' && lines[i - 1].trim() === '2') { es = i + 1; break; } }
    let ee = -1;
    for (let i = lines.length - 1; i >= 1; i--) { if (lines[i].trim() === 'ENDSEC') { ee = i - 1; break; } }
    if (es < 0 || ee < es) return dxf;
    let bb = window.dxfScanBBox(lines, es, ee);
    if (!bb) return dxf;

    let ui = window.dxfOpts, wantBar = !!ui.bar, wantFrame = !!ui.frame;
    // Topo export က Sheets/Grid ကို မူလမဟုတ်သော ရွေးချယ်မှုဖြင့် ခေါ်လျှင် (o.topoGrid + o.footprint ပါ) grid/title/north arrow ကို ဤနေရာမှာ layout ပြီးမှ ထုတ်
    let useNew = !!(o.topoGrid && o.footprint && (ui.grid !== 'full' || ui.sheets !== 'full'));
    let layBB = bb;
    if (useNew) {
        let tg = o.topoGrid, I = tg.interval, Tt = tg.txtH, pad = I + 2 * Tt;
        o.footprint.pad = 0;                         // စာရွက်ထားမထား = Topo ကိုယ်တိုင် ဝင်မဝင် (grid ring ကြောင့် စာရွက်မပိုထည့်)
        if (ui.sheets === 'topo') layBB = { minX: bb.minX - pad, minY: bb.minY - pad, maxX: bb.maxX + pad, maxY: bb.maxY + pad };      // title/arrow ကို စာရွက်ထဲ ထည့်မည်၊ အပိုနေရာ မလို
        else layBB = { minX: Math.min(bb.minX, tg.minE - I - 2 * Tt), maxX: Math.max(bb.maxX, tg.maxE + I + 12 * Tt), minY: Math.min(bb.minY, tg.minN - I - 2 * Tt), maxY: Math.max(bb.maxY, tg.maxN + I + 13 * Tt) };
    }
    // Plot scale / စာရွက်ဘောင်: PF/CS export က plan အပိုင်းကိုသာ ကြိုတွက်ပေးထားသည် (o.layout)၊ ကျန် export များမှာ ပုံတစ်ခုလုံးအပေါ် တွက်
    let lay = o.layout || window.dxfPlanLayout(layBB, useNew ? o.footprint : null);
    let scale = lay.scale, k = lay.k;

    let extra = [], newLayers = [];
    let ext = { minX: bb.minX, minY: bb.minY, maxX: bb.maxX, maxY: bb.maxY };
    const grow = function(x1, y1, x2, y2) { ext.minX = Math.min(ext.minX, x1); ext.minY = Math.min(ext.minY, y1); ext.maxX = Math.max(ext.maxX, x2); ext.maxY = Math.max(ext.maxY, y2); };
    if (wantFrame && lay.tiled) {
        // ===== စာရွက်များခွဲ: ဘောင်တစ်ခုချင်း + စာရွက်နံပါတ် + ကပ်လျက်ဘောင်ကြား Match line =====
        newLayers.push({ name: 'PLOT_FRAME', color: 1 });
        newLayers.push({ name: 'PLOT_MATCH', color: 3 });
        let sh = lay.tiles, g = lay.grid, ov = lay.ov, nS = sh.length, filt = !!lay.filtered;
        const at = function(i, j) { return lay.byRC ? lay.byRC[i + ',' + j] : sh[i * lay.cols + j]; };       // (row,col) → tile (ဖယ်ထားသော ကွက်ဆိုလျှင် undefined)
        sh.forEach(function(s) {
            let f = s.frame;
            extra.push(window.dxfClosedPolyE('PLOT_FRAME', [[f.minX, f.minY], [f.maxX, f.minY], [f.maxX, f.maxY], [f.minX, f.maxY]]));
            let lbl = 'SHEET ' + s.no + ' / ' + nS + (filt ? '  (R' + s.row + '-C' + s.col + ')' : '') + '   ' + lay.paper + '   SCALE 1:' + scale, th = 3 * k;
            // ကပ်လျက်ဘောင်နှင့် မထပ်သော ဘောင်အတွင်း ၁၄ mm အတွင်းနေရာတွင် ထား (တစ်ရွက်ချင်း ပရင့်လျှင် အဲ့ရွက်ရဲ့ နံပါတ်ပဲပါ)
            extra.push(window.dxfTextE('PLOT_FRAME', f.minX + 14 * k + lbl.length * th * 0.4, f.maxY - 14 * k, th, lbl, 0));
        });
        for (let j = 1; j < lay.cols; j++) {                       // ဒေါင်လိုက် match line
            let x = g.minX + (j * (lay.pw - ov) + ov / 2) * k;
            for (let i = 0; i < lay.rows; i++) {
                let a = at(i, j - 1), b = at(i, j);
                if (!a || !b) continue;                            // ဖယ်ထားသော စာရွက်နှင့် ကပ်လျက်ဆိုလျှင် match line မလို
                let y1 = a.frame.minY + (i < lay.rows - 1 ? ov * k : 0), y2 = a.frame.maxY;
                extra.push(window.dxfLineE('PLOT_MATCH', x, y1, x, y2));
                extra.push(window.dxfTextE('PLOT_MATCH', x - 2 * k, (y1 + y2) / 2, 2.5 * k, 'MATCH LINE  -  SHEET ' + a.no + ' | SHEET ' + b.no, 90));
            }
        }
        for (let i = 1; i < lay.rows; i++) {                       // အလျားလိုက် match line
            let y = g.maxY - (i * (lay.ph - ov) + ov / 2) * k;
            for (let j = 0; j < lay.cols; j++) {
                let a = at(i - 1, j), b = at(i, j);
                if (!a || !b) continue;
                let x1 = a.frame.minX + (j > 0 ? ov * k : 0), x2 = a.frame.maxX;
                extra.push(window.dxfLineE('PLOT_MATCH', x1, y, x2, y));
                extra.push(window.dxfTextE('PLOT_MATCH', (x1 + x2) / 2, y + 2 * k, 2.5 * k, 'MATCH LINE  -  SHEET ' + a.no + ' / SHEET ' + b.no, 0));
            }
        }
        if (filt) {                                                // ဖယ်ထားလျှင် စုစုပေါင်းစာကို ပထမစာရွက်၏ အပေါ်မှာ၊ extents ကို ထားသော ဘောင်များဖြင့်
            let f1 = sh[0].frame, kb = lay.keptBBox;
            extra.push(window.dxfTextE('PLOT_FRAME', (f1.minX + f1.maxX) / 2, f1.maxY + 6 * k, 4 * k, nS + ' SHEETS (of ' + lay.fullCount + ' in ' + lay.cols + ' x ' + lay.rows + ' grid)  ' + lay.paper + ' ' + lay.orient + '  -  PLOT SCALE 1:' + scale + '  (Topo area only; window-select each sheet frame; match lines = overlap)', 0));
            grow(kb.minX, kb.minY, kb.maxX, kb.maxY + 10 * k);
        } else {
            extra.push(window.dxfTextE('PLOT_FRAME', (g.minX + g.maxX) / 2, g.maxY + 6 * k, 4 * k, nS + ' SHEETS (' + lay.cols + ' x ' + lay.rows + ')  ' + lay.paper + ' ' + lay.orient + '  -  PLOT SCALE 1:' + scale + '  (window-select each sheet frame; match lines = overlap)', 0));
            grow(g.minX, g.minY, g.maxX, g.maxY + 10 * k);
        }
    } else if (wantFrame) {
        newLayers.push({ name: 'PLOT_FRAME', color: 1 });
        let f = lay.frame, i = lay.inner;     // inner = ဘောင်အတွင်း ချန်ထားသော အလွတ်နေရာ (မဆွဲ)၊ fit စစ်ရန်သာ
        extra.push(window.dxfClosedPolyE('PLOT_FRAME', [[f.minX, f.minY], [f.maxX, f.minY], [f.maxX, f.maxY], [f.minX, f.maxY]]));
        let b = lay.bbox, fits = b.minX >= i.minX - 1e-6 && b.maxX <= i.maxX + 1e-6 && b.minY >= i.minY - 1e-6 && b.maxY <= i.maxY + 1e-6;
        extra.push(window.dxfTextE('PLOT_FRAME', (f.minX + f.maxX) / 2, f.maxY + 6 * k, 4 * k, lay.paper + ' ' + lay.orient + '  -  PLOT SCALE 1:' + scale + (fits ? '  (window-select this frame)' : '  -  WARNING: drawing is larger than this frame' + (lay.tooMany ? ' (needs ' + lay.tooMany + ' sheets - too many)' : '') + ' - choose Auto or a larger scale number'), 0));
        grow(f.minX, f.minY, f.maxX, f.maxY + 10 * k);
    }
    if (useNew) {
        // ===== Grid / Title / North arrow (layout ပြီးမှ - ထားသော စာရွက်များ/Topo နီးကွက်များအလိုက်) =====
        let frames = lay.tiled ? lay.tiles.map(function(t) { return t.frame; }) : [lay.frame];
        let placeIn = (lay.tiled && (lay.filtered || ui.grid === 'sheets')) ? lay.tiles[0].frame : null;
        let gm = (ui.grid === 'sheets' && !lay.tiled && !wantFrame) ? 'full' : ui.grid;     // frame မဆွဲဘဲ တစ်ရွက်ထဲဆို 'sheets' ကို အဓိပ္ပာယ်မရှိ -> လေးထောင့်အပြည့်
        let res = window.dxfTopoGridBuild(o.topoGrid, o.footprint, lay, frames, gm, placeIn);
        res.entities.forEach(function(e) { extra.push(e); });
        if (res.bbox) grow(res.bbox.minX, res.bbox.minY, res.bbox.maxX, res.bbox.maxY);
    }
    if (wantBar) {
        newLayers.push({ name: 'SCALE_BAR', color: 7 });
        let th = 2.5 * k, barH = 2 * k;                          // စာရွက်ပေါ် စာ ၂.၅ mm၊ bar အထူ ၂ mm
        let len = window.dxfNiceLen(scale * 0.1);                // စာရွက်ပေါ် ≤ ၁၀ cm
        let x0 = wantFrame ? lay.barX : lay.bbox.minX, y0 = wantFrame ? lay.barY : lay.bbox.minY - scale * 0.02;
        window.dxfHBar(x0, y0, len, barH, th, 'SCALE_BAR', 'SCALE 1:' + scale).forEach(function(e) { extra.push(e); });
        grow(x0 - th, y0 - th * 2.4, x0 + len + th * 3, y0 + barH + th * 2.4);
    }
    bb = ext;

    if (extra.length) lines.splice(ee, 0, extra.join('\n'));
    let out = lines.join('\n');

    // ---- HEADER: Extents / Limits ----
    let n = window.dxfNum;
    let hdr = "9\n$EXTMIN\n10\n" + n(bb.minX) + "\n20\n" + n(bb.minY) + "\n30\n0.0\n9\n$EXTMAX\n10\n" + n(bb.maxX) + "\n20\n" + n(bb.maxY) + "\n30\n0.0\n" +
              "9\n$LIMMIN\n10\n" + n(bb.minX) + "\n20\n" + n(bb.minY) + "\n9\n$LIMMAX\n10\n" + n(bb.maxX) + "\n20\n" + n(bb.maxY) + "\n";
    if (out.indexOf("$ACADVER\n1\nAC1009\n") >= 0) out = out.replace("$ACADVER\n1\nAC1009\n", function() { return "$ACADVER\n1\nAC1009\n" + hdr; });

    // ---- VPORT *ACTIVE: စတင်ဖွင့်ချိန် view ကို ပုံအလယ်၊ ပုံတစ်ခုလုံးဆန့်အောင် ----
    let w = bb.maxX - bb.minX, h = bb.maxY - bb.minY;
    let viewH = Math.max(h, w / 1.5, 1) * 1.08;
    let cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
    let vport = "0\nTABLE\n2\nVPORT\n70\n1\n0\nVPORT\n2\n*ACTIVE\n70\n0\n10\n0.0\n20\n0.0\n11\n1.0\n21\n1.0\n12\n" + n(cx) + "\n22\n" + n(cy) +
        "\n13\n0.0\n23\n0.0\n14\n1.0\n24\n1.0\n15\n0.0\n25\n0.0\n16\n0.0\n26\n0.0\n36\n1.0\n17\n0.0\n27\n0.0\n37\n0.0\n40\n" + n(viewH) +
        "\n41\n1.5\n42\n50.0\n43\n0.0\n44\n0.0\n50\n0.0\n51\n0.0\n71\n0\n72\n100\n73\n1\n74\n3\n75\n0\n76\n0\n77\n0\n78\n0\n0\nENDTAB\n";
    let m = out.match(/0\nTABLE\n2\nLAYER\n70\n(\d+)/);
    if (m) {
        // LAYER table ထဲ တကယ်ရှိသော record အရေအတွက်အတိုင်း count ကိုညှိ (မူလ export များတွင် ကြေညာထားသောအရေအတွက်နှင့် မကိုက်တာ ရှိသည်)
        let tStart = out.indexOf(m[0]), tEnd = out.indexOf("\n0\nENDTAB", tStart);
        let defined = (out.slice(tStart, tEnd < 0 ? out.length : tEnd).match(/\n0\nLAYER\n/g) || []).length;
        let count = defined + newLayers.length;
        let layerRec = newLayers.map(function(l) { return "\n0\nLAYER\n2\n" + l.name + "\n70\n0\n62\n" + l.color + "\n6\nCONTINUOUS"; }).join('');
        out = out.replace(m[0], function() { return vport + "0\nTABLE\n2\nLAYER\n70\n" + count + layerRec; });
    } else {
        // TABLES section မရှိလျှင် header ပြီးနောက်မှာ VPORT တစ်ခုတည်းပါ TABLES section ထည့်
        let hi = out.indexOf("0\nENDSEC\n");
        if (hi >= 0) { hi += "0\nENDSEC\n".length; out = out.slice(0, hi) + "0\nSECTION\n2\nTABLES\n" + vport + "0\nENDSEC\n" + out.slice(hi); }
    }
    return out;
};
