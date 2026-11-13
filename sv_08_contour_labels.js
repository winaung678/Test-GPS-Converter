// [split from module_surface_volume.js] lines 3519-3999 | part 8/8 | ထပ်ခွဲထားသည် - load order မပြောင်းရ (app.html ၏ script tag အစီအစဉ်အတိုင်း)
// ==========================================
// 🏷️ CONTOUR LABEL LINES (Civil 3D style)
// Map ပေါ်မှာ Label Line (၂ မှတ် သို့ ကွေ့ပြီး ဆက်ဆွဲ) ကို contour များ ဖြတ်ဆွဲပါ။
// Line နှင့် contour ဆုံသည့်နေရာတိုင်းမှာ contour ဦးတည်ရာအတိုင်း label တပ်သည်။
// Line ကိုသာ သိမ်းထားသဖြင့် Surface/Interval ပြောင်းလျှင်လည်း label များ အလိုအလျောက် ပြန်ကျသည်။
// Label Line မရှိလျှင် Label မပြ။ Label အားလုံး (Map / Topo DXF / Volume DXF / Profile DXF) ဤ function တစ်ခုတည်းမှ ယူသည်။
// ==========================================
window.topoLabelLines = window.topoLabelLines || [];   // [{ pts: [{lat, lon, n, e}] }]
window.isLabelDrawing = false;
window.labelDraft = [];
window.labelEditIndex = null;      // ရှိပြီးသား line ကို Edit လုပ်နေလျှင် မူလ index
window.labelLineLayer = null;

// Label များ တွက်သည်: [{ n, e, z, isMajor, p1, p2, angleDeg, text }]
//   h = စာအမြင့် (မီတာ) - Label ၂ ခု ထပ်မထပ်ကို contour ဦးတည်ရာအတိုင်း လှည့်ထားသော စာဘောက်စ် (အလျား ≈ စာလုံးရေ × 0.62h၊ အမြင့် h) ဖြင့် စစ်သည်
//   ရလဒ် array တွင် .total (ဖြတ်မိသည့် အရေအတွက်) နှင့် .skipped (နီးလွန်းလို့ ကျော်ရသော နေရာများ) ပါသည်
//   ထပ်မထပ်စည်းမျဉ်း: Gap (စာအမြင့် × g) - '#topo_label_gap'၊ 'Label every crossing' (#topo_label_all) ဖွင့်ထားလျှင် ဘာမှမကျော်
window.computeContourLabels = function(h, optsIn) {
    let out = [];
    out.total = 0; out.skipped = [];
    let lines = (window.topoLabelLines || []).map(l => l.pts);
    if (window.isLabelDrawing && window.labelDraft && window.labelDraft.length >= 2) lines = lines.concat([window.labelDraft]);
    if (lines.length === 0 || !window.topoContours || window.topoContours.length === 0) return out;

    let minorEl = document.getElementById('topo_label_minor');
    let incMinor = !!(minorEl && minorEl.checked);
    let allEl = document.getElementById('topo_label_all'), gapEl = document.getElementById('topo_label_gap');
    let o = optsIn || {};
    let labelAll = (o.all !== undefined) ? !!o.all : !!(allEl && allEl.checked);
    let gapF = (o.gap !== undefined) ? o.gap : parseFloat(gapEl && gapEl.value);
    if (!isFinite(gapF) || gapF < 0) gapF = 0.1;
    h = (h > 0) ? h : 0.5;
    let cands = [];
    const EPS = 1e-12;

    lines.forEach(pts => {
        for (let k = 0; k < pts.length - 1; k++) {
            let a = pts[k], b = pts[k + 1];
            let rn = b.n - a.n, re = b.e - a.e;
            let loN = Math.min(a.n, b.n), hiN = Math.max(a.n, b.n), loE = Math.min(a.e, b.e), hiE = Math.max(a.e, b.e);
            let tMax = (k === pts.length - 2) ? 1 : 1 - 1e-9;      // အလယ်အမှတ်ကို နှစ်ခါ မရေတွက်ရန်

            window.topoContours.forEach(poly => {
                if (!poly.isMajor && !incMinor) return;
                let P = poly.points;
                if (!P || P.length < 2) return;
                for (let i = 0; i < P.length - 1; i++) {
                    let p1 = P[i], p2 = P[i + 1];
                    if (Math.max(p1.n, p2.n) < loN || Math.min(p1.n, p2.n) > hiN || Math.max(p1.e, p2.e) < loE || Math.min(p1.e, p2.e) > hiE) continue;
                    let sn = p2.n - p1.n, se = p2.e - p1.e;
                    let den = re * sn - rn * se;
                    if (Math.abs(den) < EPS) continue;
                    let qn = p1.n - a.n, qe = p1.e - a.e;
                    let t = (qe * sn - qn * se) / den;
                    let u = (qe * rn - qn * re) / den;
                    if (t < 0 || t > tMax || u < 0 || u >= 1) continue;
                    cands.push({ n: a.n + t * rn, e: a.e + t * re, z: poly.z, isMajor: !!poly.isMajor, p1: p1, p2: p2 });
                }
            });
        }
    });

    cands.sort((x, y) => (y.isMajor ? 1 : 0) - (x.isMajor ? 1 : 0));
    const clr = gapF * h;                                         // စာဘောက်စ်ပတ်လည် ချန်ရန်နေရာ
    const boxOf = c => {
        let ang = Math.atan2(c.p2.n - c.p1.n, c.p2.e - c.p1.e) * (180 / Math.PI);
        if (ang > 90 || ang <= -90) ang += 180;                   // စာ အမြဲ ဖတ်လို့ရသည့်ဘက် (ပြောင်းပြန်မဖြစ်စေ)
        c.angleDeg = ang;
        c.text = c.z.toFixed(2);
        let r = ang * Math.PI / 180, W = c.z.toFixed(3).length * 0.62 * h;
        let hw = W / 2 + clr, hh = h / 2 + clr;
        return { n: c.n, e: c.e, ux: Math.cos(r), uy: Math.sin(r), hw: hw, hh: hh, rad: Math.hypot(hw, hh) };   // (e,n) မြေပြင်ပေါ် u = စာအလျားဦးတည်ရာ
    };
    // Oriented rectangle ၂ ခု ထပ်မထပ် (Separating Axis)
    const overlap = (A, B) => {
        let de = B.e - A.e, dn = B.n - A.n;
        if (de * de + dn * dn > (A.rad + B.rad) * (A.rad + B.rad)) return false;
        let axes = [[A.ux, A.uy], [-A.uy, A.ux], [B.ux, B.uy], [-B.uy, B.ux]];
        for (let i = 0; i < 4; i++) {
            let ax = axes[i][0], ay = axes[i][1];
            let dist = Math.abs(de * ax + dn * ay);
            let rA = A.hw * Math.abs(A.ux * ax + A.uy * ay) + A.hh * Math.abs(-A.uy * ax + A.ux * ay);
            let rB = B.hw * Math.abs(B.ux * ax + B.uy * ay) + B.hh * Math.abs(-B.uy * ax + B.ux * ay);
            if (dist >= rA + rB - 1e-9) return false;      // ထိုက်ထိုက်တိုက်တိုက်ထိရုံ = မထပ်
        }
        return true;
    };
    let boxes = [];
    cands.forEach(c => {
        let bx = boxOf(c);
        out.total++;
        if (!labelAll) {
            for (let i = 0; i < boxes.length; i++) {
                if (overlap(boxes[i], bx)) { out.skipped.push({ n: c.n, e: c.e, z: c.z }); return; }
            }
        }
        boxes.push(bx);
        out.push(c);
    });
    return out;
};

// DXF TEXT entity (center aligned) - Topo / Volume export တွင် မူလပုံစံအတိုင်း
window.contourLabelDxfEntity = function(l, txtH, text) {
    return `0\nTEXT\n8\nTOPO_LABELS\n10\n${l.e.toFixed(3)}\n20\n${l.n.toFixed(3)}\n30\n${l.z.toFixed(3)}\n40\n${txtH}\n1\n${text}\n50\n${l.angleDeg.toFixed(3)}\n72\n1\n11\n${l.e.toFixed(3)}\n21\n${l.n.toFixed(3)}\n31\n${l.z.toFixed(3)}\n73\n2`;
};

window.updateLabelInfo = function(labels) {
    let info = document.getElementById('topo_label_info');
    if (!info) return;
    let nLines = window.topoLabelLines.length, n = labels ? labels.length : 0;
    if (nLines === 0 && !(window.isLabelDrawing && window.labelDraft.length >= 2)) { info.innerText = "No label line yet - no contour labels are shown."; return; }
    let sk = labels && labels.skipped ? labels.skipped.length : 0, tot = labels && labels.total ? labels.total : n;
    info.innerText = `${nLines} label line${nLines === 1 ? '' : 's'} · ${tot} crossing${tot === 1 ? '' : 's'} · ${n} label${n === 1 ? '' : 's'}` + (sk ? ` · ${sk} skipped (too close - purple dots)` : '');
};

// နီးလွန်းလို့ Label မတပ်ဘဲ ကျော်ထားသော နေရာများကို ခရမ်းရောင်အစက်ဖြင့် ပြ (Label lines ပြနေချိန်/ဆွဲနေချိန်သာ)
window.renderLabelSkipMarkers = function(labels) {
    if (!window.leafletMap) return;
    if (window.labelSkipLayer) { window.leafletMap.removeLayer(window.labelSkipLayer); window.labelSkipLayer = null; }
    let sk = labels && labels.skipped ? labels.skipped : [];
    if (sk.length === 0 || !(window.isLabelDrawing || window.layerOn('tgl_label_lines'))) return;
    let layers = sk.slice(0, 400).map(p => {
        let c = window.getDatumCoordsForLocal(p.n, p.e);
        return L.circleMarker([c.lat, c.lon], { radius: 4, color: '#7c3aed', weight: 2, fillColor: '#c4b5fd', fillOpacity: 0.9, interactive: false });
    });
    window.labelSkipLayer = L.layerGroup(layers).addTo(window.leafletMap);
};

// Label အစုထဲက အနီးဆုံးအကွာ minGap အတွင်း ထပ်နေသည်များကို ဖယ် (ဦးစားပေးအစဉ်အတိုင်း စောသည်ကို ထား)
window.thinLabels = function(labels, minGap) {
    let g2 = minGap * minGap, out = [];
    labels.forEach(l => {
        for (let i = 0; i < out.length; i++) { let dn = out[i].n - l.n, de = out[i].e - l.e; if (dn * dn + de * de < g2) return; }
        out.push(l);
    });
    return out;
};

// Map ပေါ်က contour label စာသား layer ကို ပြန်တည်ဆောက်သည် (Line / Surface / Setting / Zoom ပြောင်းတိုင်း)
// DXF အတွက်သည် မီတာအလိုက်၊ Map အတွက်သည် မျက်နှာပြင် pixel အလိုက် ထပ်တာဖယ် (zoom ဆွဲထွက်လျှင် ကျဲ၊ ဆွဲဝင်လျှင် ပိုပေါ်)
window.refreshContourLabels = function() {
    if (window.topoLayerGroup && window.topoContourTextLayer) window.topoLayerGroup.removeLayer(window.topoContourTextLayer);
    window.topoContourTextLayer = null;

    let txtH = parseFloat((document.getElementById('topo_text_height') || {}).value) || 0.5;
    let all = window.computeContourLabels(txtH);
    window.updateLabelInfo(all);
    window.renderLabelSkipMarkers(all);
    let map = window.leafletMap;
    if (!map || !window.topoLayerGroup || all.length === 0 || typeof L.CanvasTextLayer === 'undefined') return;
    if (!window.layerOn('tgl_contour_labels')) return;           // 🏷️ Contour labels chip ပိတ်ထားလျှင် မပြ

    let labels = all;
    if (typeof map.getZoom === 'function') {
        let z = map.getZoom(), lat = (typeof map.getCenter === 'function' && map.getCenter()) ? map.getCenter().lat : 0;
        let mpp = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);      // မီတာ / pixel
        labels = window.thinLabels(all, Math.max(txtH * 3, 64 * mpp));
        if (!window._lblZoomBound && typeof map.on === 'function') {
            window._lblZoomBound = true;
            map.on('zoomend', function() { clearTimeout(window._lblZoomTimer); window._lblZoomTimer = setTimeout(function() { window.refreshContourLabels(); }, 150); });
        }
    }

    let mColor = (document.getElementById('topo_major_color') || {}).value || '#f59e0b';
    let minColor = (document.getElementById('topo_minor_color') || {}).value || '#b45309';
    let data = labels.map(l => {
        let c = window.getDatumCoordsForLocal(l.n, l.e);
        let a = window.getDatumCoordsForLocal(l.p1.n, l.p1.e), b = window.getDatumCoordsForLocal(l.p2.n, l.p2.e);
        let dLat = b.lat - a.lat, dLon = (b.lon - a.lon) * Math.cos(a.lat * Math.PI / 180);
        let ang = Math.atan2(dLat, dLon) * (180 / Math.PI);
        if (ang > 90 || ang <= -90) ang += 180;
        return { lat: c.lat, lon: c.lon, text: l.text, color: l.isMajor ? mColor : minColor, major: l.isMajor, align: 'center', rotation: ang, isContour: true };
    });
    window.topoContourTextLayer = new L.CanvasTextLayer(data);
    window.topoLayerGroup.addLayer(window.topoContourTextLayer);
};

window.labelQuickMode = true;      // true = ၂ ချက်နှိပ်ရင် line တစ်ကြောင်းပြီး (Quick) / false = point များစွာနှိပ်ပြီး Next Line (Curve)

// Label line များကို Topo point/contour layer များအပေါ် (z-index 480) မှာ ထားသည် - မဟုတ်လျှင် အောက်မှာ ပိတ်မိပြီး နှိပ်လို့မရ
window.getLabelPane = function() {
    if (!window.leafletMap) return 'overlayPane';
    if (!window.leafletMap.getPane('labelPane')) {
        window.leafletMap.createPane('labelPane');
        window.leafletMap.getPane('labelPane').style.zIndex = 480;
    }
    return 'labelPane';
};

window.renderLabelLines = function() {
    if (!window.leafletMap) return;
    if (window.labelLineLayer) { window.leafletMap.removeLayer(window.labelLineLayer); window.labelLineLayer = null; }
    let layers = [];
    let drawing = !!window.isLabelDrawing;
    let pane = window.getLabelPane();

    // ✂️ Label lines chip ပိတ်ထားလျှင် (Draw/Edit မလုပ်နေချိန်) ကြိုးစက်မျဉ်းများကို မပြ - Label စာများသာ ပြ
    let showLines = drawing || window.layerOn('tgl_label_lines');
    (showLines ? window.topoLabelLines : []).forEach((ln, i) => {
        let latlngs = ln.pts.map(p => [p.lat, p.lon]);
        // မြင်ရသော မျဉ်း
        layers.push(L.polyline(latlngs, { pane: pane, color: '#e11d48', weight: 3, dashArray: '6,4', opacity: 0.95, interactive: false }));
        // လက်ချောင်းနှင့် ထိလွယ်အောင် မမြင်ရသော ကျယ်သော hit area
        let hit = L.polyline(latlngs, { pane: pane, color: '#e11d48', weight: 26, opacity: 0.01, interactive: !drawing });
        hit.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            let html = `<div style="text-align:center; line-height:1.3;">
                <div style="font-weight:bold; font-size:12px; color:#e11d48;">🏷️ Label Line ${i + 1}</div>
                <div style="display:flex; gap:4px; margin-top:5px;">
                    <button class="so-popup-btn" style="background:#f59e0b; padding:4px 8px; font-size:11px; font-weight:bold; border-radius:3px; flex:1;" onclick="event.stopPropagation(); window.editLabelLine(${i});">✏️ Edit</button>
                    <button class="so-popup-btn" style="background:#ef4444; padding:4px 8px; font-size:11px; font-weight:bold; border-radius:3px; flex:1;" onclick="event.stopPropagation(); window.deleteLabelLine(${i});">🗑️ Delete</button>
                </div></div>`;
            L.popup().setLatLng(e.latlng).setContent(html).openOn(window.leafletMap);
        });
        layers.push(hit);
    });

    if (drawing && window.labelDraft.length > 0) {
        layers.push(L.polyline(window.labelDraft.map(p => [p.lat, p.lon]), { pane: pane, color: '#f59e0b', weight: 3, dashArray: '4,4', interactive: false }));
        window.labelDraft.forEach((p, idx) => {
            let m = L.marker([p.lat, p.lon], {
                draggable: true,
                icon: L.divIcon({ className: 'bdy-point-marker', html: '<div style="width:14px; height:14px; background:#fff; border:3px solid #f59e0b; border-radius:50%; box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>', iconSize: [14, 14], iconAnchor: [7, 7] })
            });
            m.on('dragend', function(ev) {
                let ll = ev.target.getLatLng();
                let c = window.getDatumCoordsForLatLon(ll.lat, ll.lng);
                if (c && c.showLocal) { window.labelDraft[idx] = { lat: ll.lat, lon: ll.lng, n: c.localN, e: c.localE }; }
                window.renderLabelLines();
                window.refreshContourLabels();
            });
            layers.push(m);
        });
    }
    window.labelLineLayer = L.layerGroup(layers).addTo(window.leafletMap);
    window.labelRefreshButton();
};

// Draft ကို line တစ်ကြောင်းအဖြစ် သိမ်းသည် (အမှတ် ၂ ခုမပြည့်လျှင် မသိမ်း) - Draw mode ကို မပိတ်ပါ
window.labelCommitDraft = function() {
    if (window.labelDraft.length >= 2) {
        let ln = { pts: window.labelDraft.slice() };
        if (window.labelEditIndex !== null) window.topoLabelLines.splice(Math.min(window.labelEditIndex, window.topoLabelLines.length), 0, ln);
        else window.topoLabelLines.push(ln);
    }
    window.labelDraft = [];
    window.labelEditIndex = null;
};

window.labelMapClickListener = function(e) {
    if (!window.isLabelDrawing) return;
    let c = window.getDatumCoordsForLatLon(e.latlng.lat, e.latlng.lng);
    if (!c || !c.showLocal) return;
    window.labelDraft.push({ lat: e.latlng.lat, lon: e.latlng.lng, n: c.localN, e: c.localE });
    // Quick mode: ၂ ချက်နှိပ်ပြီးတာနှင့် line ပြီးပြီး နောက်တစ်ကြောင်းကို ဆက်စနိုင် (Edit လုပ်နေချိန်မှာ မသက်ရောက်)
    if (window.labelQuickMode && window.labelEditIndex === null && window.labelDraft.length >= 2) window.labelCommitDraft();
    window.renderLabelLines();
    window.refreshContourLabels();
};

window.labelRefreshButton = function() {
    let btn = document.getElementById('btn_label_draw');
    if (btn) {
        if (window.isLabelDrawing) { btn.innerText = "✔ Done"; btn.classList.remove('tone-rose'); btn.classList.add('tone-red'); }
        else { btn.innerText = "🏷️ Draw Label Line"; btn.classList.remove('tone-red'); btn.classList.add('tone-rose'); }
    }
    let modeBtn = document.getElementById('btn_label_mode');
    if (modeBtn) modeBtn.innerText = window.labelQuickMode ? "⚡ Quick: 2 taps = 1 line (tap to switch)" : "〰️ Curve: many points + Next Line (tap to switch)";
    window.syncDrawBar();
};

window.toggleLabelQuickMode = function() {
    window.labelQuickMode = !window.labelQuickMode;
    // Quick သို့ပြောင်းချိန် point ၂ ခုနှင့်အထက်ရှိနေလျှင် ယခု line ကို သိမ်းပြီး အသစ်စ
    if (window.labelQuickMode && window.isLabelDrawing && window.labelEditIndex === null && window.labelDraft.length >= 2) window.labelCommitDraft();
    window.renderLabelLines();
    window.refreshContourLabels();
};

// Curve mode: ယခု line ကိုပြီးအောင်သိမ်းပြီး နောက် line ဆက်ဆွဲ
window.labelNextLine = function() {
    if (!window.isLabelDrawing) return;
    window.labelCommitDraft();
    window.renderLabelLines();
    window.refreshContourLabels();
};

window.toggleLabelLineDraw = function() {
    if (window.isLabelDrawing) return window.stopLabelLineDraw(false);
    if (!window.topoContours || window.topoContours.length === 0) return alert("⚠️ Please generate the Topo Surface (contours) first!");
    if (!window.canStartMapTool('label')) return;
    window.startLabelLineDraw();
};

window.startLabelLineDraw = function() {
    window.isLabelDrawing = true;
    if (window.labelEditIndex === null) window.labelDraft = [];
    if (window.leafletMap) {
        window.leafletMap.closePopup();
        window.leafletMap.off('click', window.labelMapClickListener);
        window.leafletMap.on('click', window.labelMapClickListener);
    }
    window.renderLabelLines();
    window.refreshContourLabels();
};

// Draw mode ကို ပိတ်သည် - ဆွဲလက်စ line (အမှတ် ၂ ခုနှင့်အထက်) ရှိလျှင် သိမ်းပေး၊ ၁ ခုတည်းဆိုလျှင် ပယ်
window.stopLabelLineDraw = function(silent) {
    if (!window.isLabelDrawing) return;
    window.labelCommitDraft();
    window.isLabelDrawing = false;
    window.labelDraft = [];
    window.labelEditIndex = null;
    if (window.leafletMap) window.leafletMap.off('click', window.labelMapClickListener);
    if (!silent && window.topoLabelLines.length > 0 && !window.layerOn('tgl_label_lines')) window.mapToast("Label lines are hidden now - turn on ✂️ Label lines in Layers to see or edit them");
    window.renderLabelLines();
    window.refreshContourLabels();
};

window.undoLabelLine = function() {
    if (window.labelDraft.length > 0) {
        window.labelDraft.pop();
    } else if (window.labelEditIndex === null && window.topoLabelLines.length > 0) {
        // Draft မရှိတော့လျှင် နောက်ဆုံးသိမ်းထားသော line ကို ပြန်ဖျက်သည် (Quick mode ဆက်တိုက်ဆွဲရာတွင် အဆင်ပြေစေရန်)
        window.topoLabelLines.pop();
    } else {
        return alert("Nothing to undo.");
    }
    window.renderLabelLines();
    window.refreshContourLabels();
};

window.editLabelLine = function(i) {
    if (window.isLabelDrawing) return;
    let ln = window.topoLabelLines[i];
    if (!ln) return;
    if (window.leafletMap) window.leafletMap.closePopup();
    window.topoLabelLines.splice(i, 1);
    window.labelDraft = ln.pts.map(p => Object.assign({}, p));
    window.labelEditIndex = i;
    window.startLabelLineDraw();
};

window.deleteLabelLine = function(i) {
    if (!window.topoLabelLines[i]) return;
    if (!confirm("Delete this label line?")) return;
    window.topoLabelLines.splice(i, 1);
    if (window.leafletMap) window.leafletMap.closePopup();
    window.renderLabelLines();
    window.refreshContourLabels();
};

// Label line အားလုံးဖျက်သည် (Draw mode ဖွင့်ထားလျှင် ဆက်ဖွင့်ထားမည်)
window.clearLabelLines = function(skipConfirm) {
    let any = window.topoLabelLines.length > 0 || window.labelDraft.length > 0;
    if (any && !skipConfirm && !confirm("Clear all label lines?")) return;
    window.topoLabelLines = [];
    window.labelDraft = [];
    window.labelEditIndex = null;
    window.renderLabelLines();
    window.refreshContourLabels();
};
setTimeout(function() { if (window.updateLabelInfo) window.updateLabelInfo(0); }, 0);


// ==========================================
// 🎛️ DRAW TOOLBAR providers (ဘုံ toolbar ကို map_engine.js မှာ တည်ဆောက်ထားသည်)
//   Label Line / Boundary (Manual Draw) / Volume boundary
// ==========================================
window.registerDrawBar({ name: 'label', tool: 'label', fn: function() {
    let q = window.labelQuickMode, editing = window.labelEditIndex !== null, n = window.labelDraft.length, hint;
    if (editing) hint = `Editing · ${n} pts · drag points or tap to add · Done to save`;
    else if (q) hint = n === 0 ? "Tap point 1 of 2" : "Tap point 2 of 2";
    else hint = n < 2 ? `Tap points (${n}) - need at least 2` : `${n} pts · tap more or Next Line`;
    return { hint: hint, buttons: [
        { text: q ? "⚡ Quick" : "〰️ Curve", tone: "teal", fn: () => window.toggleLabelQuickMode() },
        { text: "➕ Next Line", tone: "blue", hidden: (q && !editing), fn: () => window.labelNextLine() },
        { text: "↩ Undo", tone: "violet", fn: () => window.undoLabelLine() },
        { text: "🗑️ Clear", tone: "slate", fn: () => window.clearLabelLines() },
        { text: "✔ Done", tone: "red", fn: () => window.toggleLabelLineDraw() }
    ]};
}});

window.registerDrawBar({ name: 'boundary', tool: 'boundary', persistent: true, fn: function() {
    let sel = document.getElementById('topo_bdy_method');
    if (!sel || sel.value !== 'manual' || !window.isToolPanelVisible('cogo_topo_tool')) return null;
    let outer = !!window.isDrawingBoundary, ex = !!window.isDrawingExclude;
    if (!outer && !ex && !(window.topoPoints && window.topoPoints.length > 0)) return null;   // CSV Points မတင်ရသေးလျှင် မပြ
    if (window.drawBarMenuOwner === 'boundary') {
        return window.drawBarMenuCfg("Clear what?", [
            { text: "Outer", tone: "amber", fn: () => window.bdyClear('outer') },
            { text: "Exclude", tone: "sky", fn: () => window.bdyClear('exclude') },
            { text: "Both", tone: "red", fn: () => window.bdyClear('both') }
        ]);
    }
    let hint;
    if (outer) hint = `Outer boundary · ${window.topoBoundaryPolygon.length} pts · tap topo points`;
    else if (ex) hint = `Exclude area · ${window.currentExcludePolygon.length} pts (now) · ${window.topoExcludePolygons.length} saved · tap topo points`;
    else hint = "Tap Outer or Exclude, then tap topo points on the map";
    return { hint: hint, buttons: [
        { text: outer ? "✏️ Outer ●" : "✏️ Outer", tone: "amber", active: outer, fn: () => window.toggleBoundaryDrawMode() },
        { text: ex ? "🚫 Exclude ●" : "🚫 Exclude", tone: "sky", active: ex, fn: () => window.toggleExcludeDrawMode() },
        { text: "➕ Next Area", tone: "blue", hidden: !ex, fn: () => window.excludeNextArea() },
        { text: "↩ Undo", tone: "violet", fn: () => window.drawBarUndo() },
        { text: "🗑️ Clear", tone: "slate", fn: () => window.openDrawBarMenu('boundary') },
        { text: "✔ Done", tone: "red", hidden: !(outer || ex), fn: () => { if (window.isDrawingBoundary) window.toggleBoundaryDrawMode(); else if (window.isDrawingExclude) window.toggleExcludeDrawMode(); } }
    ]};
}});

window.registerDrawBar({ name: 'vol', tool: 'vol', persistent: true, fn: function() {
    if (!window.isToolPanelVisible('cogo_vol_tool')) return null;
    if (!window.isVolDrawing && !(window.volPoints && window.volPoints.length > 0)) return null;   // Data Source မတင်ရသေးလျှင် မပြ
    if (window.drawBarMenuOwner === 'vol') {
        return window.drawBarMenuCfg("Clear what?", [
            { text: "Current", tone: "amber", fn: () => window.volClear('current') },
            { text: "Saved", tone: "sky", fn: () => window.volClear('saved') },
            { text: "Both", tone: "red", fn: () => window.volClear('both') }
        ]);
    }
    let drawing = !!window.isVolDrawing, n = (window.volBoundaryPts || []).length;
    let hint;
    if (drawing) hint = `Boundary · ${n} pts · ` + (window.volDraftPoint ? "tap ➕ Add to confirm the point" : "tap the map to place a point");
    else hint = n >= 3 ? `${n} pts · set the base level in the panel, then 💾 Save` : "Tap ✏️ Draw, then tap the map";
    return { hint: hint, buttons: [
        { text: drawing ? "✏️ Draw ●" : "✏️ Draw", tone: "amber", active: drawing, fn: () => window.toggleVolDrawMode() },
        { text: "↩ Undo", tone: "violet", fn: () => window.drawBarUndo() },
        { text: "🗑️ Clear", tone: "slate", fn: () => window.openDrawBarMenu('vol') },
        { text: "💾 Save", tone: "green", hidden: drawing || n < 3, fn: () => window.saveCurrentVolArea() },
        { text: "✔ Done", tone: "red", hidden: !drawing, fn: () => window.toggleVolDrawMode() }
    ]};
}});

// ==========================================
// 🔴 FIX: Draw Mode (Profile / Volume / Topo) တွေ Tool ပြောင်းရင် အလိုအလျောက် ပိတ်ပေးမည့် Reset
// (flag တွေ ကျန်နေလို့ map tap မရတာ၊ "Topo Surface" alert ပေါ်တာကို ဖြေရှင်းသည်)
// ==========================================
window.resetAllDrawModes = function() {
    try {
        if (window.leafletMap) {
            if (window.profMapClickListener) window.leafletMap.off('click', window.profMapClickListener);
            if (window.volMapClickListener) window.leafletMap.off('click', window.volMapClickListener);
            if (window.volMouseMoveListener) window.leafletMap.off('mousemove', window.volMouseMoveListener);
        }
        if (window.isProfDrawing && typeof window.profStopDrawing === 'function') window.profStopDrawing();
        if (window.isLabelDrawing && typeof window.stopLabelLineDraw === 'function') window.stopLabelLineDraw(true);
        if (window.isVolDrawing) {
            window.isVolDrawing = false;
            window.volDraftPoint = null;
            if (window.volDraftMarker && window.leafletMap) window.leafletMap.removeLayer(window.volDraftMarker);
            if (window.volDraftLine && window.leafletMap) window.leafletMap.removeLayer(window.volDraftLine);
            window.volDraftMarker = null; window.volDraftLine = null;
            let b = document.getElementById('btn_vol_draw');
            if (b) { b.innerText = "\u270F\uFE0F Draw Boundary"; b.style.background = "#f59e0b"; }
        }
        if (window.isDrawingExclude && window.currentExcludePolygon && window.currentExcludePolygon.length > 2) window.topoExcludePolygons.push([...window.currentExcludePolygon]);
        if (window.isDrawingBoundary || window.isDrawingExclude) {
            window.isDrawingBoundary = false; window.isDrawingExclude = false; window.currentExcludePolygon = [];
            if (typeof window.updateBoundaryDrawUI === 'function') window.updateBoundaryDrawUI(true);
        }
        window.drawBarMenuOwner = null;
        if (typeof window.syncDrawBar === 'function') window.syncDrawBar();
    } catch (err) { console.error('resetAllDrawModes:', err); }
};

let _oldOpenCogoToolReset = window.openCogoTool;
window.openCogoTool = function(toolName) {
    window.resetAllDrawModes();
    if (typeof _oldOpenCogoToolReset === 'function') _oldOpenCogoToolReset(toolName);
};
let _oldCloseCogoToolReset = window.closeCogoTool;
window.closeCogoTool = function() {
    window.resetAllDrawModes();
    if (typeof _oldCloseCogoToolReset === 'function') _oldCloseCogoToolReset();
};
let _oldSwitchAppReset = window.switchApp;
window.switchApp = function(n) {
    window.resetAllDrawModes();
    if (typeof _oldSwitchAppReset === 'function') _oldSwitchAppReset(n);
    if (typeof window.syncDrawBar === 'function') window.syncDrawBar();     // Tab ပြောင်းပြီးတာနဲ့ toolbar ကို အခြေအနေအသစ်အတိုင်း ပြန်စစ်
};
