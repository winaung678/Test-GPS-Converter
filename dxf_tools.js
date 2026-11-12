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
window.dxfOpts = { scale: 'auto', custom: false, paper: 'A3', frame: true, bar: true };

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
    else return;
    try { localStorage.setItem(window.DXF_OPTS_KEY, JSON.stringify(window.dxfOpts)); } catch (e) {}
    window.dxfOptsApplyToUI();
};

window.dxfOptsInit = function() {
    window.dxfOptsLoad();
    window.dxfOptsApplyToUI();
    document.addEventListener('change', window.dxfOptsOnChange);
    document.addEventListener('input', function(ev) { if (ev.target && ev.target.classList && ev.target.classList.contains('dxf-opt-scale-custom')) window.dxfOptsOnChange(ev); });
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
// ---------- စာရွက်များခွဲ (multi-sheet tiling) ----------
// Plot scale ကို ကိုယ်တိုင်သတ်မှတ်ထားပြီး ပုံက A3/A4 တစ်ရွက်ထဲ မဆန့်လျှင် စာရွက်ဘောင်များကို grid ပုံစံ ဆက်ဆွဲ
// overlap = ကပ်လျက်ဘောင်နှစ်ခု ထပ်မည့် အကျယ် (mm)၊ edge = ပုံနှင့် ဘောင်အနား (mm)၊ reserve = အောက်ဘက် scale bar နေရာ (mm)
window.DXF_TILE = { overlap: 10, edge: 15, reserve: 25, maxSheets: 64 };
window.dxfTileLayout = function(bbox, scale, P) {
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
    if (best.n > T.maxSheets) return { tooMany: best.n };
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
    return { tiled: true, scale: scale, paper: ui.paper, orient: best.name, cols: best.cols, rows: best.rows, pw: best.pw, ph: best.ph, ov: ov,
             tiles: tiles, grid: grid, frame: grid, inner: grid, bbox: bbox, k: k, barX: grid.minX + 20 * k, barY: grid.minY + 22 * k };
};

window.dxfPlanLayout = function(bbox) {
    let ui = window.dxfOpts, P = window.DXF_PAPER[ui.paper] || window.DXF_PAPER.A3;
    let W = Math.max(bbox.maxX - bbox.minX, 0.001), H = Math.max(bbox.maxY - bbox.minY, 0.001);
    let orients = [{ name: 'landscape', pw: P[0], ph: P[1] }, { name: 'portrait', pw: P[1], ph: P[0] }];
    orients.forEach(function(o) { o.uw = o.pw - 20 - 10; o.uh = o.ph - 20 - 10 - 25; o.need = Math.max(W * 1000 / o.uw, H * 1000 / o.uh); });
    let best = orients[0].need <= orients[1].need ? orients[0] : orients[1];
    let scale;
    if (ui.scale !== 'auto' && Number(ui.scale) > 0) {
        scale = Number(ui.scale);
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
        let tl = window.dxfTileLayout(bbox, scale, P);        // တစ်ရွက်မဆန့်လျှင် စာရွက်များခွဲ
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
    // Plot scale / စာရွက်ဘောင်: PF/CS export က plan အပိုင်းကိုသာ ကြိုတွက်ပေးထားသည် (o.layout)၊ ကျန် export များမှာ ပုံတစ်ခုလုံးအပေါ် တွက်
    let lay = o.layout || window.dxfPlanLayout(bb);
    let scale = lay.scale, k = lay.k;

    let extra = [], newLayers = [];
    let ext = { minX: bb.minX, minY: bb.minY, maxX: bb.maxX, maxY: bb.maxY };
    const grow = function(x1, y1, x2, y2) { ext.minX = Math.min(ext.minX, x1); ext.minY = Math.min(ext.minY, y1); ext.maxX = Math.max(ext.maxX, x2); ext.maxY = Math.max(ext.maxY, y2); };
    if (wantFrame && lay.tiled) {
        // ===== စာရွက်များခွဲ: ဘောင်တစ်ခုချင်း + စာရွက်နံပါတ် + ကပ်လျက်ဘောင်ကြား Match line =====
        newLayers.push({ name: 'PLOT_FRAME', color: 1 });
        newLayers.push({ name: 'PLOT_MATCH', color: 3 });
        let sh = lay.tiles, g = lay.grid, ov = lay.ov, nS = sh.length;
        sh.forEach(function(s) {
            let f = s.frame;
            extra.push(window.dxfClosedPolyE('PLOT_FRAME', [[f.minX, f.minY], [f.maxX, f.minY], [f.maxX, f.maxY], [f.minX, f.maxY]]));
            let lbl = 'SHEET ' + s.no + ' / ' + nS + '   ' + lay.paper + '   SCALE 1:' + scale, th = 3 * k;
            // ကပ်လျက်ဘောင်နှင့် မထပ်သော ဘောင်အတွင်း ၁၄ mm အတွင်းနေရာတွင် ထား (တစ်ရွက်ချင်း ပရင့်လျှင် အဲ့ရွက်ရဲ့ နံပါတ်ပဲပါ)
            extra.push(window.dxfTextE('PLOT_FRAME', f.minX + 14 * k + lbl.length * th * 0.4, f.maxY - 14 * k, th, lbl, 0));
        });
        for (let j = 1; j < lay.cols; j++) {                       // ဒေါင်လိုက် match line
            let x = g.minX + (j * (lay.pw - ov) + ov / 2) * k;
            for (let i = 0; i < lay.rows; i++) {
                let a = sh[i * lay.cols + j - 1], b = sh[i * lay.cols + j];
                let y1 = a.frame.minY + (i < lay.rows - 1 ? ov * k : 0), y2 = a.frame.maxY;
                extra.push(window.dxfLineE('PLOT_MATCH', x, y1, x, y2));
                extra.push(window.dxfTextE('PLOT_MATCH', x - 2 * k, (y1 + y2) / 2, 2.5 * k, 'MATCH LINE  -  SHEET ' + a.no + ' | SHEET ' + b.no, 90));
            }
        }
        for (let i = 1; i < lay.rows; i++) {                       // အလျားလိုက် match line
            let y = g.maxY - (i * (lay.ph - ov) + ov / 2) * k;
            for (let j = 0; j < lay.cols; j++) {
                let a = sh[(i - 1) * lay.cols + j], b = sh[i * lay.cols + j];
                let x1 = a.frame.minX + (j > 0 ? ov * k : 0), x2 = a.frame.maxX;
                extra.push(window.dxfLineE('PLOT_MATCH', x1, y, x2, y));
                extra.push(window.dxfTextE('PLOT_MATCH', (x1 + x2) / 2, y + 2 * k, 2.5 * k, 'MATCH LINE  -  SHEET ' + a.no + ' / SHEET ' + b.no, 0));
            }
        }
        extra.push(window.dxfTextE('PLOT_FRAME', (g.minX + g.maxX) / 2, g.maxY + 6 * k, 4 * k, nS + ' SHEETS (' + lay.cols + ' x ' + lay.rows + ')  ' + lay.paper + ' ' + lay.orient + '  -  PLOT SCALE 1:' + scale + '  (window-select each sheet frame; match lines = overlap)', 0));
        grow(g.minX, g.minY, g.maxX, g.maxY + 10 * k);
    } else if (wantFrame) {
        newLayers.push({ name: 'PLOT_FRAME', color: 1 });
        let f = lay.frame, i = lay.inner;     // inner = ဘောင်အတွင်း ချန်ထားသော အလွတ်နေရာ (မဆွဲ)၊ fit စစ်ရန်သာ
        extra.push(window.dxfClosedPolyE('PLOT_FRAME', [[f.minX, f.minY], [f.maxX, f.minY], [f.maxX, f.maxY], [f.minX, f.maxY]]));
        let b = lay.bbox, fits = b.minX >= i.minX - 1e-6 && b.maxX <= i.maxX + 1e-6 && b.minY >= i.minY - 1e-6 && b.maxY <= i.maxY + 1e-6;
        extra.push(window.dxfTextE('PLOT_FRAME', (f.minX + f.maxX) / 2, f.maxY + 6 * k, 4 * k, lay.paper + ' ' + lay.orient + '  -  PLOT SCALE 1:' + scale + (fits ? '  (window-select this frame)' : '  -  WARNING: drawing is larger than this frame' + (lay.tooMany ? ' (needs ' + lay.tooMany + ' sheets - too many)' : '') + ' - choose Auto or a larger scale number'), 0));
        grow(f.minX, f.minY, f.maxX, f.maxY + 10 * k);
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
