// [split from map_engine.js] lines 2293-3118 | part 7/7 | ထပ်ခွဲထားသည် - load order မပြောင်းရ (app.html ၏ script tag အစီအစဉ်အတိုင်း)
// ==========================================
// --- PROFILE & SECTION MAP DRAWING (Centerline: Draw / Edit / Undo) ---
// ဖွဲ့စည်းပုံ:  1) Config  2) State helpers  3) Geometry  4) Map click  5) Draw/Finish
//              6) Draft popup  7) Confirm / Delete / Move  8) Map layers  9) Undo / Clear
// ပြင်လိုလျှင်:  ကိန်းသေ => PROF_CFG | ခလုတ်/စာ => profRefreshControls | Edit အပိုင်း => 7 နှင့် 8
// ==========================================

// ---------- 1) Config ----------
window.PROF_CFG = {
    segPickPx: 14,     // မျဉ်းနှင့် ဤ pixel အကွာအတွင်း နှိပ်လျှင် "Insert" အဖြစ်သတ်မှတ်မည်
    historyMax: 50     // Undo မှတ်တမ်း အများဆုံးအရေအတွက်
};

// ---------- 2) State & helpers ----------
window.profCenterlinePts = window.profCenterlinePts || [];
window.profAlignments = window.profAlignments || [];   // သိမ်းထားသော alignment များ { id, name, color, pts, settings, sectionData }
window.profActiveId = null;                            // လက်ရှိ Edit လုပ်နေသော alignment id (အသစ်ဆွဲနေလျှင် null)
window.profHistory = [];          // Undo အတွက် centerline snapshot များ
window.profMoveIndex = null;      // Move လုပ်နေသော point index (မရှိလျှင် null)
window.profMovePopup = null;

// ပြင်ဆင်မှုမလုပ်မီ လက်ရှိ centerline ကို မှတ်တမ်းသိမ်းသည်
window.profPushHistory = function() {
    window.profHistory.push(JSON.parse(JSON.stringify(window.profCenterlinePts)));
    if (window.profHistory.length > window.PROF_CFG.historyMax) window.profHistory.shift();
};

// Centerline ပြောင်းသွားလျှင် ယခင်တွက်ထားသော Section ရလဒ်များ ရှင်းထုတ်သည် (Calculate ပြန်လုပ်ရန်)
window.profInvalidateResults = function() {
    window.profSectionData = null;
    let box = document.getElementById('prof_status_box');
    if (box) box.classList.add('hidden');
};

window.profAutoDatum = function() {
    let el = document.getElementById('prof_datum_z');
    if (!el) return;
    if (el.dataset.auto === '0' && el.value !== '') return;     // user ကိုယ်တိုင်ရိုက်ထားလျှင် မထိ
    let pts = window.profCenterlinePts;
    el.value = pts.length > 0 ? Math.floor(Math.min(...pts.map(p => p.groundZ)) - 2) : "";
    el.dataset.auto = '1';      // Auto value: Calculate က Center + Left + Right profile အားလုံး၏ အနိမ့်ဆုံးကနေ ပြန်တွက်မည်
};
(function() {
    function bindDatumInput() {
        let el = document.getElementById('prof_datum_z');
        if (!el || el._autoBound) return;
        el._autoBound = true;
        el.addEventListener('input', function() { el.dataset.auto = (el.value === '') ? '1' : '0'; });
    }
    bindDatumInput();
    document.addEventListener('DOMContentLoaded', bindDatumInput);
})();

// Draw/Edit ခလုတ်၊ Calculate ခလုတ်၊ status စာကြောင်း တို့ကို အခြေအနေအလိုက် ပြောင်းသည်
window.profRefreshControls = function() {
    let n = window.profCenterlinePts.length;
    let drawing = !!window.isProfDrawing;

    let drawBtn = document.getElementById('btn_prof_draw');
    if (drawBtn) {
        if (drawing) { drawBtn.innerText = n > 0 ? "🛑 Finish Editing" : "🛑 Finish Centerline"; drawBtn.style.background = "#ef4444"; }
        else { drawBtn.innerText = n > 0 ? "✏️ Edit Centerline" : "✏️ Draw Centerline"; drawBtn.style.background = "#f59e0b"; }
    }

    let calcBtn = document.getElementById('btn_prof_calc');
    if (calcBtn) {
        let nAl = window.profAlignments.length;
        let ready = !drawing && (n >= 2 || nAl > 0);
        if (ready) calcBtn.classList.add('ready'); else calcBtn.classList.remove('ready');
        calcBtn.innerText = drawing ? "⚙️ Calculate (finish the centerline first)"
                          : (ready ? "⚙️ Calculate All Alignments" : "⚙️ Calculate (draw & save an alignment first)");
    }

    let activeAl = window.profActiveId ? window.profAlignments.find(a => a.id === window.profActiveId) : null;
    let saveBtn = document.getElementById('btn_prof_save');
    if (saveBtn) {
        let okSave = !drawing && n >= 2;
        saveBtn.innerText = activeAl ? `💾 Update ${activeAl.name}` : "💾 Save Alignment";
        saveBtn.style.opacity = okSave ? "1" : "0.55";
    }
    let banner = document.getElementById('prof_edit_banner');
    if (banner) {
        banner.style.display = activeAl ? 'block' : 'none';
        if (activeAl) banner.innerHTML = `✏️ Editing ${window.escHtml(activeAl.name)} — press Update to keep changes <button type="button" class="acc-tool-btn" style="margin-left:6px;" onclick="window.profRevertEdit()">↺ Revert</button>`;
    }

    let info = document.getElementById('prof_cl_info');
    if (info) {
        info.innerText = n === 0 ? "No centerline yet."
                       : `Centerline: ${n} point${n > 1 ? 's' : ''}` + (drawing ? " · editing…" : " · finished ✓");
    }
};

// ---------- 3) Geometry ----------
window.profDistToSegmentPx = function(p, a, b) {
    let dx = b.x - a.x, dy = b.y - a.y;
    let len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

// နှိပ်လိုက်သည့်နေရာနှင့် အနီးဆုံး segment index ကို ပြန်ပေးသည် (မရှိလျှင် -1)
window.profFindNearSegment = function(containerPt) {
    let pts = window.profCenterlinePts;
    if (!window.leafletMap || pts.length < 2 || !containerPt) return -1;
    let best = -1, bestD = window.PROF_CFG.segPickPx;
    for (let i = 0; i < pts.length - 1; i++) {
        let a = window.leafletMap.latLngToContainerPoint([pts[i].lat, pts[i].lon]);
        let b = window.leafletMap.latLngToContainerPoint([pts[i + 1].lat, pts[i + 1].lon]);
        let d = window.profDistToSegmentPx(containerPt, a, b);
        if (d < bestD) { bestD = d; best = i; }
    }
    return best;
};

// ---------- 4) Map click ----------
window.profMapClickListener = function(e) {
    if (!window.isProfDrawing) return;
    let _pt = document.getElementById('cogo_prof_tool');
    if (!_pt || _pt.classList.contains('hidden')) return;

    let coords = window.getDatumCoordsForLatLon(e.latlng.lat, e.latlng.lng);
    if (!coords.showLocal) return;

    // Topo Surface (TIN) ရှိ/မရှိ စစ်ဆေးခြင်း
    if (!window.topoTriangles || window.topoTriangles.length === 0) {
        return alert("⚠️ No Topo Surface generated! Please go to 'Topo Surface' tool and generate surface first.");
    }

    let z = typeof getZFromTIN === 'function' ? getZFromTIN(coords.localN, coords.localE, window.topoTriangles) : null;
    if (z === null) return alert("⚠️ Please tap INSIDE the generated Topo Surface area.");

    if (window.profMovePopup && window.leafletMap) { window.leafletMap.closePopup(window.profMovePopup); window.profMovePopup = null; }

    // mode: append (အဆုံးမှာထည့်) | insert (မျဉ်းပေါ်နှိပ်၍ ကြားထဲထည့်) | move (ရွေးထားသော point ကို ရွှေ့)
    let draft = { lat: e.latlng.lat, lon: e.latlng.lng, n: coords.localN, e: coords.localE, groundZ: z,
                  mode: 'append', index: window.profCenterlinePts.length };
    if (window.profMoveIndex !== null) {
        draft.mode = 'move'; draft.index = window.profMoveIndex;
    } else {
        let seg = window.profFindNearSegment(e.containerPoint);
        if (seg >= 0) { draft.mode = 'insert'; draft.index = seg + 1; }
    }
    window.profDraftPoint = draft;
    window.profUpdateBoundaryUI();
};

// ---------- 5) Draw / Edit / Finish ----------
window.toggleProfDrawMode = function() {
    if (window.isProfDrawing) return window.profStopDrawing();
    if (!window.topoTriangles || window.topoTriangles.length === 0) return alert("⚠️ Please generate Topo Surface first!");
    window.profStartDrawing();
};

window.profStartDrawing = function(silent) {
    if (!window.isProfDrawing && !window.canStartMapTool('prof')) return;
    window.isProfDrawing = true;
    window.profMoveIndex = null;
    window.drawBarMenuOwner = null;
    if (window.leafletMap) {
        window.leafletMap.off('click', window.profMapClickListener);
        window.leafletMap.on('click', window.profMapClickListener);
    }
    if (typeof window.accCollapse === 'function') window.accCollapse(['prof:common', 'prof:pf', 'prof:cs']);   // ဆွဲစဉ် Setting များကို ခေါက်ထားပြီး map ကို နေရာပေး
    window.profRefreshControls();
    window.profUpdateBoundaryUI();
};

window.profStopDrawing = function() {
    window.isProfDrawing = false;
    window.profMoveIndex = null;
    window.profDraftPoint = null;
    window.drawBarMenuOwner = null;
    if (window.leafletMap) {
        window.leafletMap.off('click', window.profMapClickListener);
        window.leafletMap.closePopup();
    }
    window.profMovePopup = null;
    window.profRefreshControls();
    window.profUpdateBoundaryUI();
};

// ---------- 6) Draft popup ----------
// Draft point ၏ ရည်ညွှန်းမည့် ရှေ့ point (Distance / Bearing တွက်ရန်)
window.profDraftRef = function(d) {
    let pts = window.profCenterlinePts;
    if (d.mode === 'append') return pts.length > 0 ? pts[pts.length - 1] : null;
    return d.index > 0 ? (pts[d.index - 1] || null) : null;      // insert / move
};

window.profBearingDeg = function(a, b) {
    let br = Math.atan2(b.e - a.e, b.n - a.n) * 180 / Math.PI;
    return br < 0 ? br + 360 : br;
};

// Distance (m) + Bearing (°, N ကနေ နာရီလက်တံအတိုင်း) ကို ရိုက်ထည့်၍ draft point ကို တိတိကျကျ ပြန်ချ
// quiet = true: UI မဆွဲ (Add နှိပ်ချိန်မှာ ခေါ်ရန်)၊ အောင်မြင်လျှင် true ပြန်
window.profApplyDraftPolar = function(quiet) {
    let d = window.profDraftPoint;
    if (!d) return false;
    let dIn = document.getElementById('prof_draft_dist_inp'), bIn = document.getElementById('prof_draft_brg_inp');
    if (!dIn || !bIn) return true;                                 // ရည်ညွှန်း point မရှိ (ပထမ point) - ပုံမှန်အတိုင်း
    if (dIn.value === d._distTxt && bIn.value === d._brgTxt) return true;   // မပြင်ထား - နှိပ်ထားသည့် နေရာအတိုင်း ထား
    let ref = window.profDraftRef(d);
    if (!ref) return true;
    let dist = parseFloat(dIn.value), brg = parseFloat(bIn.value);
    if (isNaN(dist) || dist <= 0 || isNaN(brg)) { window.mapToast("Enter a distance > 0 and a bearing in degrees"); return false; }
    let rad = brg * Math.PI / 180;
    let nn = ref.n + dist * Math.cos(rad), ne = ref.e + dist * Math.sin(rad);
    let z = typeof getZFromTIN === 'function' ? getZFromTIN(nn, ne, window.topoTriangles) : null;
    if (z === null) { window.mapToast("⚠️ That point is outside the Topo Surface - shorten the distance"); return false; }
    // ပြင်ထားသော Radius/Direction ကို မဆုံးရှုံးအောင် မှတ်ထား
    let rIn = document.getElementById('prof_draft_radius_inp'), drIn = document.getElementById('prof_draft_dir_inp');
    if (rIn) d.radius = parseFloat(rIn.value) || 0;
    if (drIn) d.curveDir = drIn.value;
    let ll = window.getDatumCoordsForLocal(nn, ne);
    d.n = nn; d.e = ne; d.groundZ = z; d.lat = ll.lat; d.lon = ll.lon;
    if (!quiet) window.profUpdateBoundaryUI();
    return true;
};

// ရှေ့ segment ရဲ့ direction အတိုင်း ဆက်ဆွဲ (Bearing ကို ရှေ့ segment နှင့် တူအောင်ထား)
window.profDraftSameDir = function() {
    let d = window.profDraftPoint;
    if (!d) return;
    let pts = window.profCenterlinePts;
    let refIdx = (d.mode === 'append') ? pts.length - 1 : d.index - 1;
    if (refIdx < 1) return window.mapToast("Need a previous segment to copy its direction");
    let bIn = document.getElementById('prof_draft_brg_inp');
    if (!bIn) return;
    bIn.value = window.profBearingDeg(pts[refIdx - 1], pts[refIdx]).toFixed(4);
    window.profApplyDraftPolar(false);
};

window.profBuildDraftPopup = function(dPt) {
    let pre = (dPt.mode === 'move') ? window.profCenterlinePts[dPt.index] : null;
    let radVal = (dPt.radius !== undefined) ? dPt.radius : ((pre && pre.radius > 0) ? pre.radius : 0);
    let dirVal = (dPt.curveDir !== undefined) ? (dPt.curveDir === 'Left' ? 'Left' : 'Right') : ((pre && pre.curveDir === 'Left') ? 'Left' : 'Right');
    let ref = window.profDraftRef(dPt), polarHtml = '';
    if (ref) {
        dPt._distTxt = Math.hypot(dPt.n - ref.n, dPt.e - ref.e).toFixed(3);
        dPt._brgTxt = window.profBearingDeg(ref, dPt).toFixed(4);
        let keys = "event.stopPropagation(); if(event.key==='Enter'){ window.profApplyDraftPolar(); }";
        polarHtml = `<div class="dp-box">
                <div class="dp-row"><span class="dp-lbl">Dist:</span><input type="number" id="prof_draft_dist_inp" class="dp-in" value="${dPt._distTxt}" min="0" step="0.001" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();" onkeydown="${keys}" onchange="window.profApplyDraftPolar()"><span class="dp-lbl">m</span></div>
                <div class="dp-row"><span class="dp-lbl">Brg:</span><input type="number" id="prof_draft_brg_inp" class="dp-in" value="${dPt._brgTxt}" step="0.0001" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();" onkeydown="${keys}" onchange="window.profApplyDraftPolar()"><span class="dp-lbl">°</span>
                    <button type="button" class="dp-mini" title="Same direction as the previous segment" onclick="event.stopPropagation(); window.profDraftSameDir();">⤴ prev</button></div>
            </div>`;
    }
    let btnText = dPt.mode === 'move' ? '✔ Move here' : (dPt.mode === 'insert' ? '↳ Insert here' : '➕ Add');
    let title = dPt.mode === 'move' ? '↔ New Position' : (dPt.mode === 'insert' ? '↳ Insert Node' : '📍 Centerline Node');

    return `<div style="text-align:center; padding: 0px; line-height: 1.2;">
            <div style="font-weight:bold; font-size:10px; color:#d97706; margin-bottom:1px;">${title}</div>
            <div style="font-size:10px; color:#0284c7; font-weight:bold; margin-bottom:2px;">
                N: ${dPt.n.toFixed(2)} | E: ${dPt.e.toFixed(2)}<br>Z: ${dPt.groundZ.toFixed(2)}
            </div>

            ${polarHtml}
            <div style="margin-top:4px; margin-bottom:4px; border-top:1px dashed #cbd5e1; padding-top:4px; padding-bottom:2px;">
                <div style="display:flex; align-items:center; justify-content:center; gap:2px;">
                    <span style="font-size:10px; color:#64748b; font-weight:bold;">Rad:</span>
                    <input type="number" id="prof_draft_radius_inp" value="${radVal}" min="0" step="1" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();" style="width:45px; font-size:11px; padding:2px; border:1px solid #94a3b8; border-radius:3px; text-align:center; color:#1e40af; font-weight:bold; height:20px; margin:0;">
                    <select id="prof_draft_dir_inp" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();" style="font-size:10px; padding:1px; height:20px; border:1px solid #94a3b8; border-radius:3px; color:#b91c1c; font-weight:bold; margin:0;">
                        <option value="Right" ${dirVal === 'Right' ? 'selected' : ''}>Right ⤵</option>
                        <option value="Left" ${dirVal === 'Left' ? 'selected' : ''}>Left ⤴</option>
                    </select>
                </div>
            </div>

            <button class="so-popup-btn" style="background:#10b981; padding: 4px; font-size: 11px; margin-top: 2px; font-weight:bold; border-radius:3px; width:100%;" onclick="event.stopPropagation(); window.confirmProfDraftPoint();">${btnText}</button>
        </div>`;
};

// ---------- 7) Confirm / Delete / Move ----------
window.confirmProfDraftPoint = function() {
    if (!window.profDraftPoint) return;
    if (!window.profApplyDraftPolar(true)) return;      // ရိုက်ထည့်ထားသော Distance/Bearing ရှိလျှင် အရင်အသုံးချ (မအောင်မြင်လျှင် မထည့်)
    let d = window.profDraftPoint;

    let radInput = document.getElementById('prof_draft_radius_inp');
    let dirInput = document.getElementById('prof_draft_dir_inp');
    let radiusVal = radInput ? parseFloat(radInput.value) : 0;
    if (isNaN(radiusVal) || radiusVal <= 0) radiusVal = 0;

    let pt = { lat: d.lat, lon: d.lon, n: d.n, e: d.e, groundZ: d.groundZ,
               radius: radiusVal, curveDir: radiusVal > 0 ? (dirInput ? dirInput.value : 'Right') : 'None' };

    window.profPushHistory();
    if (d.mode === 'move') window.profCenterlinePts[d.index] = pt;
    else if (d.mode === 'insert') window.profCenterlinePts.splice(d.index, 0, pt);
    else window.profCenterlinePts.push(pt);

    window.profDraftPoint = null;
    window.profMoveIndex = null;
    if (window.leafletMap) window.leafletMap.closePopup();

    window.profAutoDatum();
    window.profInvalidateResults();
    window.profUpdateBoundaryUI();
};

window.profDeletePoint = function(i) {
    if (i < 0 || i >= window.profCenterlinePts.length) return;
    window.profPushHistory();
    window.profCenterlinePts.splice(i, 1);
    window.profDraftPoint = null;
    window.profMoveIndex = null;
    if (window.leafletMap) window.leafletMap.closePopup();
    window.profAutoDatum();
    window.profInvalidateResults();
    window.profUpdateBoundaryUI();
};

window.profStartMovePoint = function(i) {
    let pt = window.profCenterlinePts[i];
    if (!pt || !window.leafletMap) return;
    window.profMoveIndex = i;
    window.profDraftPoint = null;
    window.leafletMap.closePopup();
    window.profMovePopup = L.popup({ closeOnClick: false, autoClose: false })
        .setLatLng([pt.lat, pt.lon])
        .setContent('<div style="font-size:11px; font-weight:bold; color:#d97706; text-align:center;">↔ Tap the new location<br>on the map</div>')
        .openOn(window.leafletMap);
    window.profUpdateBoundaryUI();
};

// Point တစ်ခုကို နှိပ်လျှင် ပေါ်မည့် Move / Delete menu
window.profShowPointMenu = function(i) {
    let pt = window.profCenterlinePts[i];
    if (!pt || !window.leafletMap || !window.isProfDrawing) return;
    let radText = (pt.radius && pt.radius > 0) ? `<br>R: ${pt.radius}m (${pt.curveDir})` : "";
    let html = `<div style="text-align:center; line-height:1.3;">
        <div style="font-weight:bold; font-size:11px; color:#0284c7;">CH-${i + 1}</div>
        <div style="font-size:10px; color:#475569;">N: ${pt.n.toFixed(2)} | E: ${pt.e.toFixed(2)}<br>Z: ${pt.groundZ.toFixed(2)}${radText}</div>
        <div style="display:flex; gap:4px; margin-top:5px;">
            <button class="so-popup-btn" style="background:#0284c7; padding:4px 8px; font-size:11px; font-weight:bold; border-radius:3px; flex:1;" onclick="event.stopPropagation(); window.profStartMovePoint(${i});">↔ Move</button>
            <button class="so-popup-btn" style="background:#ef4444; padding:4px 8px; font-size:11px; font-weight:bold; border-radius:3px; flex:1;" onclick="event.stopPropagation(); window.profDeletePoint(${i});">🗑️ Delete</button>
        </div></div>`;
    L.popup({ closeOnClick: true }).setLatLng([pt.lat, pt.lon]).setContent(html).openOn(window.leafletMap);
};

// ---------- 8) Map layers ----------
window.profUpdateBoundaryUI = function() {
    if (!window.leafletMap) return;

    if (window.profBoundaryLayer) window.leafletMap.removeLayer(window.profBoundaryLayer);
    let pts = window.profCenterlinePts;

    let layers = [];
    if (pts.length > 0) {
        let displayLatLngs = [];

        // 2-Point စနစ်ဖြင့် မြေပုံပေါ်တွင် ဆွဲခြင်း (radius ပါလျှင် မျဉ်းကွေး)
        for (let i = 0; i < pts.length - 1; i++) {
            let p1 = pts[i];
            let p2 = pts[i + 1];

            if (i === 0) displayLatLngs.push([p1.lat, p1.lon]);

            let curveData = (p2.radius > 0) ? calcArcGeometry(p1, p2) : null;

            if (curveData) {
                curveData.arcPoints.forEach(arcPt => {
                    let arcLatLon = window.getDatumCoordsForLocal(arcPt.n, arcPt.e);
                    displayLatLngs.push([arcLatLon.lat, arcLatLon.lon]);
                });
            } else {
                displayLatLngs.push([p2.lat, p2.lon]);
            }
        }

        layers.push(L.polyline(displayLatLngs, { color: '#0284c7', weight: 4, opacity: 0.8, interactive: false }));

        pts.forEach((pt, index) => {
            let isMoving = (window.profMoveIndex === index);
            let border = isMoving ? '#f59e0b' : '#0284c7';
            let size = isMoving ? 16 : 12;
            let ptMarker = L.marker([pt.lat, pt.lon], {
                icon: L.divIcon({ className: 'bdy-point-marker', html: `<div style="width:${size}px; height:${size}px; background:#fff; border:3px solid ${border}; border-radius:50%; box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
                interactive: true
            });
            // Draw/Edit mode ဖြစ်မှသာ point menu ပေါ်စေသည်
            ptMarker.on('click', () => { if (window.isProfDrawing) window.profShowPointMenu(index); });

            let labelText = `CH-${index + 1}`;
            let radText = (pt.radius && pt.radius > 0) ? `<br><span style="color:#ef4444; font-size:9px;">R: ${pt.radius}m (${pt.curveDir})</span>` : "";
            ptMarker.bindTooltip(`<div style="text-align:center; font-weight:bold; font-size:10px; color:#0284c7;">${labelText}${radText}</div>`, { permanent: true, direction: 'top', className: 'pt-tooltip', offset: [0, -5] });

            layers.push(ptMarker);
        });
        window.profBoundaryLayer = L.layerGroup(layers).addTo(window.leafletMap);
    }

    if (window.isProfDrawing && window.profDraftPoint) {
        let dPt = window.profDraftPoint;
        let popupHTML = window.profBuildDraftPopup(dPt);

        if (!window.profDraftMarker) {
            window.profDraftMarker = L.marker([dPt.lat, dPt.lon], {
                icon: L.divIcon({ className: 'draft-marker', html: `<div style="background:#eab308; width:18px; height:18px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 5px rgba(0,0,0,0.8);"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] })
            }).bindPopup(popupHTML, { closeOnClick: false, autoClose: false }).addTo(window.leafletMap);
            setTimeout(() => { window.profDraftMarker.openPopup(); }, 50);
        } else {
            window.profDraftMarker.setLatLng([dPt.lat, dPt.lon]);
            window.profDraftMarker.setPopupContent(popupHTML);
            if (!window.leafletMap.hasLayer(window.profDraftMarker)) window.profDraftMarker.addTo(window.leafletMap);
            setTimeout(() => { window.profDraftMarker.openPopup(); }, 50);
        }

        // Draft မျဉ်း: append = နောက်ဆုံးမှတ်မှ၊ insert/move = ရှေ့မှတ် → draft → နောက်မှတ်
        let ll = (p) => [p.lat, p.lon];
        let chain = [];
        if (dPt.mode === 'append') {
            if (pts.length > 0) chain = [ll(pts[pts.length - 1]), ll(dPt)];
        } else {
            let prev = pts[dPt.index - 1];
            let next = (dPt.mode === 'move') ? pts[dPt.index + 1] : pts[dPt.index];
            if (prev) chain.push(ll(prev));
            chain.push(ll(dPt));
            if (next) chain.push(ll(next));
        }
        if (chain.length >= 2) {
            if (!window.profDraftLine) window.profDraftLine = L.polyline(chain, { color: '#eab308', weight: 3, dashArray: '5, 5', interactive: false }).addTo(window.leafletMap);
            else { window.profDraftLine.setLatLngs(chain); if (!window.leafletMap.hasLayer(window.profDraftLine)) window.profDraftLine.addTo(window.leafletMap); }
        } else if (window.profDraftLine) {
            window.leafletMap.removeLayer(window.profDraftLine);
        }
    } else {
        if (window.profDraftMarker) window.leafletMap.removeLayer(window.profDraftMarker);
        if (window.profDraftLine) window.leafletMap.removeLayer(window.profDraftLine);
    }

    window.profRefreshControls();
    window.profRenderSavedAlignments();
    window.syncDrawBar();
};

// ---------- 9) Undo / Clear ----------
window.undoProfCenterline = function() {
    if (window.profDraftPoint) {                       // ၁) မအတည်ပြုရသေးသော draft ကို ပယ်
        window.profDraftPoint = null;
        window.profUpdateBoundaryUI();
    } else if (window.profMoveIndex !== null) {        // ၂) Move ရွေးထားခြင်းကို ပယ်
        window.profMoveIndex = null;
        if (window.profMovePopup && window.leafletMap) { window.leafletMap.closePopup(window.profMovePopup); window.profMovePopup = null; }
        window.profUpdateBoundaryUI();
    } else if (window.profHistory.length > 0) {        // ၃) နောက်ဆုံး ပြင်ဆင်မှုကို ပြန်ဖျက် (add/insert/move/delete)
        window.profCenterlinePts = window.profHistory.pop();
        window.profAutoDatum();
        window.profInvalidateResults();
        window.profUpdateBoundaryUI();
    } else if (window.profCenterlinePts.length > 2) {   // ၄) History မကျန်တော့ (သိမ်းထားသော line ကို Edit စတွင်) - နောက်ဆုံး point ကို နောက်ပြန်ဖယ်
        window.profCenterlinePts.pop();
        window.profAutoDatum();
        window.profInvalidateResults();
        window.profUpdateBoundaryUI();
    } else {
        window.mapToast("A centerline needs at least 2 points. Use 🗑️ Clear to remove it.");
    }
};

// Edit လုပ်နေသော alignment ကို သိမ်းထားသော version အတိုင်း ပြန်ယူ
window.profRevertEdit = function() {
    let al = window.profActiveId ? window.profAlignments.find(a => a.id === window.profActiveId) : null;
    if (!al) return;
    window.profCenterlinePts = JSON.parse(JSON.stringify(al.pts));
    window.profApplySettings(al.settings);
    window.profHistory = [];
    window.profDraftPoint = null;
    window.profMoveIndex = null;
    window.profSectionData = null;
    if (window.leafletMap) window.leafletMap.closePopup();
    window.profInvalidateResults();
    window.profUpdateBoundaryUI();
    window.mapToast("Reverted to the saved " + al.name);
};

window.clearProfCenterline = function(skipConfirm) {
    if (!skipConfirm && window.profCenterlinePts.length > 0 && !confirm("Clear centerline?")) return;
    window.profCenterlinePts = [];
    window.profActiveId = null;     // Edit လုပ်နေသော alignment ရှိလျှင် Edit ကို ပယ်သည် (သိမ်းထားသော version မပျက်)
    window.profHistory = [];
    window.profDraftPoint = null;
    window.profMoveIndex = null;
    window.profInvalidateResults();
    window.profAutoDatum();
    if (window.isProfDrawing) window.profStopDrawing();   // (ထဲမှာ profUpdateBoundaryUI ပါပြီးသား)
    else window.profUpdateBoundaryUI();
};


// Toolbar Clear: which = 'current' (editor ထဲက line) | 'saved' (သိမ်းထားသော alignment အားလုံး) | 'both'
// ဆွဲနေစဉ်ဆိုလျှင် Draw mode ကို ဆက်ဖွင့်ထားသည်
window.profClear = function(which) {
    let was = !!window.isProfDrawing;
    if (which === 'saved' || which === 'both') {
        window.profAlignments = [];
        window.profActiveId = null;
    }
    if (which === 'current' || which === 'both') window.clearProfCenterline(true);
    window.profUpdateBoundaryUI();
    if (was && !window.isProfDrawing) window.profStartDrawing(true);
    window.syncDrawBar();
};

// ---------- 10) Multi-alignment (သိမ်းထားသော alignment များ - တစ်ခုချင်း setting သီးသန့်၊ တစ်ခုချင်း Edit) ----------
window.PROF_ALIGN_COLORS = ['#0284c7', '#16a34a', '#c026d3', '#ea580c', '#0d9488', '#7c3aed', '#be123c', '#4d7c0f'];
// Alignment တစ်ခုချင်းစီနှင့်အတူ သိမ်းမည့် panel input များ
window.PROF_SETTING_IDS = ['prof_interval', 'prof_ch_text_h', 'prof_h_scale', 'prof_v_scale', 'prof_datum_z', 'prof_grid_z_int',
    'prof_draw_offsets', 'prof_pf_left', 'prof_pf_right', 'prof_sampling', 'prof_cs_grid_z', 'prof_cs_left', 'prof_cs_right',
    'prof_cs_h_scale', 'prof_cs_v_scale'];

window.profSnapshotSettings = function() {
    let s = {};
    window.PROF_SETTING_IDS.forEach(id => {
        let el = document.getElementById(id);
        if (!el) return;
        s[id] = (el.type === 'checkbox') ? el.checked : el.value;
        if (id === 'prof_datum_z') s.prof_datum_auto = (el.dataset.auto === '0') ? '0' : '1';
    });
    return s;
};

window.profApplySettings = function(s) {
    if (!s) return;
    window.PROF_SETTING_IDS.forEach(id => {
        let el = document.getElementById(id);
        if (!el || s[id] === undefined) return;
        if (el.type === 'checkbox') el.checked = !!s[id]; else el.value = s[id];
        if (id === 'prof_datum_z') el.dataset.auto = (s[id] === '' || s[id] === null) ? '1' : (s.prof_datum_auto !== undefined ? s.prof_datum_auto : '1');
    });
    if (typeof window.updatePfCsSummary === 'function') window.updatePfCsSummary();
    window.profRefreshSummaries();
};

// သုံးပြီးသား နံပါတ်ကို ကျော်၍ PF-1, PF-2 … အမည်ပေးသည်
window.profNextName = function() {
    let used = new Set(window.profAlignments.map(a => a.name));
    let k = 1;
    while (used.has('PF-' + k)) k++;
    return 'PF-' + k;
};

window.profAlignLatLngs = function(pts) {
    let out = [];
    for (let i = 0; i < pts.length - 1; i++) {
        let p1 = pts[i], p2 = pts[i + 1];
        if (i === 0) out.push([p1.lat, p1.lon]);
        let curve = (p2.radius > 0 && typeof calcArcGeometry === 'function') ? calcArcGeometry(p1, p2) : null;
        if (curve) {
            curve.arcPoints.forEach(a => { let ll = window.getDatumCoordsForLocal(a.n, a.e); out.push([ll.lat, ll.lon]); });
        } else {
            out.push([p2.lat, p2.lon]);
        }
    }
    return out;
};

window.profEditorDirty = function() {
    if (window.profActiveId) {
        let al = window.profAlignments.find(a => a.id === window.profActiveId);
        return !!al && JSON.stringify(al.pts) !== JSON.stringify(window.profCenterlinePts);
    }
    return window.profCenterlinePts.length > 0;
};

// Editor ကို အသစ်ပြန်စသည် (setting တန်ဖိုးများကို ကျန်ခဲ့သည် - နောက် alignment အတွက် ပြန်သုံးနိုင်ရန်)
window.profNewAlignment = function(skipConfirm) {
    if (!skipConfirm && window.profEditorDirty() && !confirm("Discard the centerline currently in the editor?")) return;
    window.profActiveId = null;
    window.profCenterlinePts = [];
    window.profHistory = [];
    window.profDraftPoint = null;
    window.profMoveIndex = null;
    window.profInvalidateResults();
    window.profAutoDatum();
    if (window.isProfDrawing) window.profStopDrawing(); else window.profUpdateBoundaryUI();
    window.profRenderAlignList();
};

window.profSaveAlignment = function() {
    if (window.isProfDrawing) return alert("⚠️ Please finish the centerline first (press 'Finish Centerline' / 'Finish Editing').");
    if (!window.profCenterlinePts || window.profCenterlinePts.length < 2) return alert("⚠️ Please draw a centerline with at least 2 points.");

    // Setting/Centerline အပြောင်းအလဲ မကျန်စေရန် သိမ်းတိုင်း ပြန်တွက်သည်
    window.processProfileSection();
    if (!window.profSectionData) return;

    let existing = window.profActiveId ? window.profAlignments.find(a => a.id === window.profActiveId) : null;
    let snap = {
        pts: JSON.parse(JSON.stringify(window.profCenterlinePts)),
        settings: window.profSnapshotSettings(),
        sectionData: window.profSectionData
    };
    if (existing) {
        Object.assign(existing, snap);
    } else {
        window.profAlignments.push(Object.assign({
            id: 'pf' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            name: window.profNextName(),
            color: window.PROF_ALIGN_COLORS[window.profAlignments.length % window.PROF_ALIGN_COLORS.length]
        }, snap));
    }
    let savedName = existing ? existing.name : window.profAlignments[window.profAlignments.length - 1].name;
    window.profNewAlignment(true);
    let sum = document.getElementById('prof_summary'), box = document.getElementById('prof_status_box');
    if (box && sum) { box.classList.remove('hidden'); sum.innerHTML = `<div style="font-size:14px; font-weight:bold; color:#047857;">✅ ${window.escHtml(savedName)} saved</div>Draw the next alignment, or Export all.`; }
};

window.profEditAlignment = function(id) {
    let al = window.profAlignments.find(a => a.id === id);
    if (!al) return;
    if (window.profActiveId !== id && window.profEditorDirty() && !confirm("Discard the centerline currently in the editor and edit " + al.name + "?")) return;
    if (window.isProfDrawing) window.profStopDrawing();
    if (window.leafletMap) window.leafletMap.closePopup();

    window.profActiveId = id;
    window.profCenterlinePts = JSON.parse(JSON.stringify(al.pts));
    window.profHistory = [];
    window.profDraftPoint = null;
    window.profMoveIndex = null;
    window.profSectionData = null;
    let box = document.getElementById('prof_status_box');
    if (box) box.classList.add('hidden');
    window.profApplySettings(al.settings);

    if (window.leafletMap) {
        let ll = window.profAlignLatLngs(al.pts);
        if (ll.length > 1) window.leafletMap.fitBounds(L.latLngBounds(ll), { padding: [40, 40] });
    }
    window.profStartDrawing(true);       // တန်းခါ Edit mode ဝင်သည်
};

window.profDeleteAlignment = function(id) {
    let al = window.profAlignments.find(a => a.id === id);
    if (!al || !confirm("Delete " + al.name + "?")) return;
    window.profAlignments = window.profAlignments.filter(a => a.id !== id);
    if (window.leafletMap) window.leafletMap.closePopup();
    if (window.profActiveId === id) window.profNewAlignment(true);
    else { window.profUpdateBoundaryUI(); window.profRenderAlignList(); }
};

window.profRenameAlignment = function(id) {
    let al = window.profAlignments.find(a => a.id === id);
    if (!al) return;
    let nm = prompt("Alignment name:", al.name);
    if (nm === null) return;
    nm = nm.trim();
    if (!nm) return;
    al.name = nm.replace(/[\r\n,]/g, ' ').substring(0, 40);
    window.profUpdateBoundaryUI();
    window.profRenderAlignList();
};

window.profZoomAlignment = function(id) {
    let al = window.profAlignments.find(a => a.id === id);
    if (!al || !window.leafletMap) return;
    let ll = window.profAlignLatLngs(al.pts);
    if (ll.length > 1) window.leafletMap.fitBounds(L.latLngBounds(ll), { padding: [40, 40] });
};

window.profRenderAlignList = function() {
    let div = document.getElementById('prof_align_list');
    if (!div) return;
    if (window.profAlignments.length === 0) {
        div.innerHTML = '<div style="font-size:11px; color:#64748b;">No saved alignments yet. Draw a centerline → Save Alignment.</div>';
        return;
    }
    div.innerHTML = window.profAlignments.map(al => {
        let isActive = (al.id === window.profActiveId);
        let len = (al.sectionData && al.sectionData.totalLength) ? al.sectionData.totalLength.toFixed(1) + ' m' : '-';
        let nSt = (al.sectionData && al.sectionData.stations) ? al.sectionData.stations.filter(s => s.csPoints && s.csPoints.length > 1).length : 0;
        let bs = 'border:none; border-radius:4px; color:#fff; font-size:12px; padding:5px 7px; font-weight:bold;';
        return `<div style="display:flex; align-items:center; gap:5px; padding:6px; margin-top:4px; border-radius:6px; background:${isActive ? 'rgba(245,158,11,0.18)' : 'rgba(148,163,184,0.12)'}; border:1px solid ${isActive ? '#f59e0b' : 'var(--input-border)'};">
            <span style="width:12px; height:12px; border-radius:50%; background:${al.color}; flex:none;"></span>
            <div style="flex:1; min-width:0; font-size:12px; line-height:1.25;">
                <b>${window.escHtml(al.name)}</b>${isActive ? ' <span style="color:#d97706;">· editing</span>' : ''}<br>
                <span style="font-size:10px; color:#64748b;">${al.pts.length} pts · ${len} · ${nSt} CS</span>
            </div>
            <button style="${bs} background:#f59e0b;" onclick="window.profEditAlignment('${al.id}')">✏️</button>
            <button style="${bs} background:#0284c7;" onclick="window.profZoomAlignment('${al.id}')">🔍</button>
            <button style="${bs} background:#64748b;" onclick="window.profRenameAlignment('${al.id}')">Aa</button>
            <button style="${bs} background:#ef4444;" onclick="window.profDeleteAlignment('${al.id}')">🗑️</button>
        </div>`;
    }).join('');
};

// သိမ်းထားသော alignment များကို map ပေါ်ပြသည် (လက်ရှိ Edit လုပ်နေသည့်တစ်ခုကို မပြ - ၎င်းက ပုံမှန် layer နှင့် ပြနေပြီ)
window.profRenderSavedAlignments = function() {
    if (window.leafletMap && window.profSavedLayer) { window.leafletMap.removeLayer(window.profSavedLayer); window.profSavedLayer = null; }
    window.profRenderAlignList();
    if (!window.leafletMap) return;
    if (!window.layerOn('tgl_pf_lines')) return;      // 📐 PF lines ကို ပိတ်ထားလျှင် မပြ
    let drawing = !!window.isProfDrawing;
    let layers = [];
    window.profAlignments.forEach(al => {
        if (al.id === window.profActiveId) return;
        let ll = window.profAlignLatLngs(al.pts);
        if (ll.length < 2) return;
        let line = L.polyline(ll, { color: al.color, weight: 4, opacity: 0.85, interactive: !drawing });
        line.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            let html = `<div style="text-align:center; line-height:1.3;">
                <div style="font-weight:bold; font-size:12px; color:${al.color};">${window.escHtml(al.name)}</div>
                <div style="display:flex; gap:4px; margin-top:5px;">
                    <button class="so-popup-btn" style="background:#f59e0b; padding:4px 8px; font-size:11px; font-weight:bold; border-radius:3px; flex:1;" onclick="event.stopPropagation(); window.profEditAlignment('${al.id}');">✏️ Edit</button>
                    <button class="so-popup-btn" style="background:#ef4444; padding:4px 8px; font-size:11px; font-weight:bold; border-radius:3px; flex:1;" onclick="event.stopPropagation(); window.profDeleteAlignment('${al.id}');">🗑️ Delete</button>
                </div></div>`;
            L.popup().setLatLng(e.latlng).setContent(html).openOn(window.leafletMap);
        });
        layers.push(line);
        let m = L.marker(ll[0], { interactive: false, icon: L.divIcon({ className: 'bdy-point-marker', html: `<div style="width:10px; height:10px; background:#fff; border:3px solid ${al.color}; border-radius:50%;"></div>`, iconSize: [10, 10], iconAnchor: [5, 5] }) });
        m.bindTooltip(`<b style="color:${al.color}; font-size:10px;">${window.escHtml(al.name)}</b>`, { permanent: true, direction: 'top', className: 'pt-tooltip', offset: [0, -5] });
        layers.push(m);
    });
    if (layers.length) window.profSavedLayer = L.layerGroup(layers).addTo(window.leafletMap);
};

setTimeout(function() { if (window.profRenderAlignList) window.profRenderAlignList(); }, 0);

// Export အတွက် alignment စာရင်း (သိမ်းထားသည်များ + Edit/Calculate လုပ်ထားသော editor ၏ နောက်ဆုံးအခြေအနေ)
window.profCollectExportAlignments = function() {
    let list = [];
    let editorReady = !!window.profSectionData && window.profCenterlinePts.length >= 2;
    window.profAlignments.forEach(al => {
        if (al.id === window.profActiveId && editorReady) {
            list.push({ name: al.name, pts: window.profCenterlinePts, settings: window.profSnapshotSettings(), sectionData: window.profSectionData });
        } else if (al.sectionData) {
            list.push({ name: al.name, pts: al.pts, settings: al.settings, sectionData: al.sectionData });
        }
    });
    if (!window.profActiveId && editorReady) {
        list.push({ name: window.profNextName(), pts: window.profCenterlinePts, settings: window.profSnapshotSettings(), sectionData: window.profSectionData });
    }
    return list;
};

// ---- Calculate All: Alignment အားလုံးကို တစ်ခုချင်း (ကိုယ်ပိုင် Setting ဖြင့်) ပြန်တွက်ပြီး အကျဉ်းပြသည် ----
// Topo surface ပြန်ထုတ်ပြီးနောက် alignment အားလုံးကို ပြန်လည်မွမ်းမံရန်လည်း သုံးသည်
window.profCalcAll = function() {
    if (window.isProfDrawing) return window.mapToast("Finish the centerline first (tap ✔ Done)");
    if (!window.topoTriangles || window.topoTriangles.length === 0) return alert("⚠️ Topo Surface is missing. Please generate surface first.");

    let editorN = window.profCenterlinePts.length;
    let items = [];
    window.profAlignments.forEach(al => {
        if (al.id === window.profActiveId && editorN >= 2) items.push({ al: null, editor: true, name: al.name + " (editing)", pts: window.profCenterlinePts, settings: window.profSnapshotSettings() });
        else items.push({ al: al, editor: false, name: al.name, pts: al.pts, settings: al.settings });
    });
    if (!window.profActiveId && editorN >= 2) items.push({ al: null, editor: true, name: window.profNextName() + " (not saved)", pts: window.profCenterlinePts, settings: window.profSnapshotSettings() });
    if (items.length === 0) return alert("⚠️ Draw a centerline and save it first.");

    let keepPts = window.profCenterlinePts, keepSettings = window.profSnapshotSettings(), keepData = window.profSectionData;
    let editorData = null, rows = [];
    try {
        items.forEach(it => {
            window.profApplySettings(it.settings);
            window.profCenterlinePts = it.pts;
            window.profSectionData = null;
            window.processProfileSection(true);
            let sd = window.profSectionData;
            if (sd && it.al) it.al.sectionData = sd;
            if (it.editor) editorData = sd;
            rows.push({ name: it.name, sd: sd });
        });
    } finally {
        window.profCenterlinePts = keepPts;
        window.profApplySettings(keepSettings);
        window.profSectionData = editorData || keepData;
    }

    let ok = rows.filter(r => r.sd).length;
    let html = '<div class="pf-sum-title">✅ Calculated ' + ok + '/' + rows.length + ' alignment' + (rows.length > 1 ? 's' : '') + '</div>' +
        '<table class="pf-sum-table"><tr><th>Alignment</th><th>Length</th><th>CS</th><th>Min Z</th></tr>' +
        rows.map(r => r.sd
            ? '<tr><td>' + window.escHtml(r.name) + '</td><td>' + r.sd.totalLength.toFixed(1) + ' m</td><td>' + r.sd.stations.filter(s => s.csPoints && s.csPoints.length > 1).length + '</td><td>' + r.sd.minZ.toFixed(2) + '</td></tr>'
            : '<tr><td>' + window.escHtml(r.name) + '</td><td colspan="3">⚠️ failed</td></tr>').join('') + '</table>';
    let box = document.getElementById('prof_status_box'), sum = document.getElementById('prof_summary');
    if (box && sum) { box.classList.remove('hidden'); sum.innerHTML = html; }
    window.profRefreshControls();
};

// Setting box ခေါင်းစဉ်အောက် (ခေါက်ထားစဉ်ပြမည့်) အကျဉ်းတစ်ကြောင်း
window.profRefreshSummaries = function() {
    if (typeof window.accSetSummary !== 'function') return;
    let v = id => { let e = document.getElementById(id); return e ? e.value : ''; };
    let chk = id => { let e = document.getElementById(id); return !!(e && e.checked); };
    window.accSetSummary('prof:common', 'CH every ' + v('prof_interval') + ' m · plan text ' + v('prof_ch_text_h') + ' m');
    window.accSetSummary('prof:pf', 'H 1:' + v('prof_h_scale') + ' · V 1:' + v('prof_v_scale') + ' · grid ' + v('prof_grid_z_int') + ' m' + (chk('prof_draw_offsets') ? ' · offsets ' + v('prof_pf_left') + '/' + v('prof_pf_right') + ' m' : ''));
    window.accSetSummary('prof:cs', 'sampling ' + v('prof_sampling') + ' m · offsets ' + v('prof_cs_left') + '/' + v('prof_cs_right') + ' m · H 1:' + v('prof_cs_h_scale') + (v('prof_cs_v_scale') ? ' · V 1:' + v('prof_cs_v_scale') : ''));
};
setTimeout(function() {
    let panel = document.getElementById('prof_controls_panel');
    if (panel) { panel.addEventListener('input', window.profRefreshSummaries); panel.addEventListener('change', window.profRefreshSummaries); }
    window.profRefreshSummaries();
}, 0);

// ---- PF/CS provider (ဘုံ Draw toolbar) ----
window.registerDrawBar({ name: 'prof', tool: 'prof', persistent: true, fn: function() {
    if (!window.isToolPanelVisible('cogo_prof_tool')) return null;
    if (!window.isProfDrawing && !(window.topoTriangles && window.topoTriangles.length > 0)) return null;   // Topo surface မထုတ်ရသေးလျှင် မပြ
    if (window.drawBarMenuOwner === 'prof') {
        return window.drawBarMenuCfg("Clear what?", [
            { text: "Current", tone: "amber", fn: () => window.profClear('current') },
            { text: "Saved", tone: "sky", fn: () => window.profClear('saved') },
            { text: "Both", tone: "red", fn: () => window.profClear('both') }
        ]);
    }
    let drawing = !!window.isProfDrawing, n = window.profCenterlinePts.length;
    let al = window.profActiveId ? window.profAlignments.find(a => a.id === window.profActiveId) : null;
    let pre = al ? (al.name + " · ") : "";
    let hint;
    if (drawing) hint = n < 2 ? (pre + "Tap map → set Dist/Bearing → ➕ Add (" + n + " pts, need 2+)") : (pre + n + " pts · tap map: next point (Dist/Bearing) · tap a point: Move/Delete · tap the line: Insert");
    else hint = n >= 2 ? (al ? ("Editing " + al.name + " · press 💾 Update") : (n + " pts · press 💾 Save")) : "Tap ✏️ Draw, then tap the map";
    return { hint: hint, buttons: [
        { text: drawing ? "✏️ Draw ●" : (n > 0 ? "✏️ Edit" : "✏️ Draw"), tone: "amber", active: drawing, fn: () => window.toggleProfDrawMode() },
        { text: "↩ Undo", tone: "violet", fn: () => window.drawBarUndo() },
        { text: "↺ Revert", tone: "teal", hidden: !al, fn: () => window.profRevertEdit() },
        { text: "🗑️ Clear", tone: "slate", fn: () => window.openDrawBarMenu('prof') },
        { text: al ? "💾 Update" : "💾 Save", tone: "purple", hidden: drawing || n < 2, fn: () => window.profSaveAlignment() },
        { text: "✔ Done", tone: "red", hidden: !drawing, fn: () => window.profStopDrawing() }
    ]};
}});

// (Profile undo ကိုလည်း module_surface_volume.js ထဲက handleSharedMapUndo က ကိုင်ပြီးသား)
