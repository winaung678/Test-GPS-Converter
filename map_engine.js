// ==========================================
// --- MEASURE TOOL (OPTIMIZED NO-GHOST) ---
// ==========================================
function calcSegmentDistance(lat1, lon1, lat2, lon2) {
    let p1 = window.getDatumCoordsForLatLon(lat1, lon1);
    let p2 = window.getDatumCoordsForLatLon(lat2, lon2);

    if (p1.showLocal && p2.showLocal) {
        // Grid Distance ကိုသာ တွက်ချက်ပြသမည်
        return Math.hypot(p2.localE - p1.localE, p2.localN - p1.localN);
    }
    // Out of bounds ဖြစ်နေပါက Haversine (Curve) အကြမ်းဖျင်းဖြင့်တွက်မည်
    return calcDistance(lat1, lon1, lat2, lon2);
}

function calcMeasureTotal(latlngs) {
    let total = 0;
    for (let i = 0; i < latlngs.length - 1; i++) {
        total += calcSegmentDistance(latlngs[i][0], latlngs[i][1], latlngs[i + 1][0], latlngs[i + 1][1]);
    }
    return total;
}

// ထောက်လိုက်သောနေရာနှင့် အနီးဆုံး Segment Index ကို ရှာပေးမည့် Function
function getClosestSegmentIndex(map, latlngs, clickLatLng) {
    if (latlngs.length < 2) return 0;
    let clickPt = map.latLngToLayerPoint(clickLatLng);
    let minDist = Infinity;
    let bestIdx = 0;

    for (let i = 0; i < latlngs.length - 1; i++) {
        let p1 = map.latLngToLayerPoint(latlngs[i]);
        let p2 = map.latLngToLayerPoint(latlngs[i+1]);

        let l2 = Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2);
        let t = (l2 === 0) ? 0 : Math.max(0, Math.min(1, ((clickPt.x - p1.x) * (p2.x - p1.x) + (clickPt.y - p1.y) * (p2.y - p1.y)) / l2));
        
        let projX = p1.x + t * (p2.x - p1.x);
        let projY = p1.y + t * (p2.y - p1.y);
        
        let dist = Math.pow(clickPt.x - projX, 2) + Math.pow(clickPt.y - projY, 2);
        
        if (dist < minDist) { minDist = dist; bestIdx = i; }
    }
    return bestIdx;
}

function buildMeasureSessionPopup(session, clickedIdx) {
    let total = calcMeasureTotal(session.latlngs);
    let html = `<div style="text-align:center; padding: 2px; line-height: 1.4; width: 150px;">`;
    html += `<b style="color:#b91c1c; font-size:13px;">Total: ${total.toFixed(3)} m</b><br>`;
    
    if (clickedIdx >= 0 && clickedIdx < session.latlngs.length - 1) {
        let p1 = session.latlngs[clickedIdx];
        let p2 = session.latlngs[clickedIdx + 1];
        
        let segDist = 0;
        let bearingDec = 0;

        // 1. Lat/Lon ကို Local Grid (N, E) အဖြစ် ပြောင်းယူခြင်း
        let pt1Grid = window.getDatumCoordsForLatLon(p1[0], p1[1]);
        let pt2Grid = window.getDatumCoordsForLatLon(p2[0], p2[1]);

        // 2. N, E မှန်ကန်ပါက COGO tool အတိုင်း Grid Bearing တွက်ခြင်း
        if (pt1Grid.showLocal && pt2Grid.showLocal) {
            let inv = calcGridInverse(pt1Grid.localN, pt1Grid.localE, pt2Grid.localN, pt2Grid.localE);
            segDist = inv.dist;
            bearingDec = inv.bearing;
        } else {
            // Out of bounds ဖြစ်နေရင် Geodetic နဲ့ တွက်ပေးမည် (Fallback)
            segDist = calcSegmentDistance(p1[0], p1[1], p2[0], p2[1]);
            bearingDec = calcBearing(p1[0], p1[1], p2[0], p2[1]);
        }
        
        // 3. Bearing ကို DMS ပုံစံပြောင်းခြင်း (Second ကို ဒသမ ၁ နေရာအထိ ယူမည်)
        let d = Math.floor(bearingDec);
        let minFloat = (bearingDec - d) * 60;
        let m = Math.floor(minFloat);
        let s = ((minFloat - m) * 60).toFixed(1); 
        let brgStr = `${d}° ${m}' ${s}"`;

        html += `<hr style="margin:4px 0; border:0.5px solid #ccc;">`;
        html += `<div style="font-size:11px; font-weight:bold; color:#1e40af;">Seg ${clickedIdx + 1} ➔ ${clickedIdx + 2}</div>`;
        html += `<div style="font-size:11px; color:#059669;"><b>Brg:</b> ${brgStr}</div>`;
        html += `<div style="font-size:11px; color:#059669;"><b>Dist:</b> ${segDist.toFixed(3)} m</div>`;
    } else {
        html += `<span style="font-size:11px; color:#64748b;">${session.latlngs.length - 1} segment(s)</span><br>`;
    }

    html += `<button class="so-popup-btn" style="background:#ef4444; margin-top:6px; width:100%; padding: 4px;" onclick="window.deleteMeasureSession(${session.id})">🗑️ Delete</button>`;
    html += `</div>`;
    return html;
}

function bindMeasureSessionClick(session) {
    session.hitLineLayer = L.polyline(session.latlngs, {
        color: 'transparent', weight: 30, interactive: true, pane: 'measurePane'
    }).addTo(window.leafletMap);

    let handleClick = function(e) {
        if (window.isMeasuring) {
            window.leafletMap.fireEvent('click', {latlng: e.latlng});
            return;
        }
        L.DomEvent.stopPropagation(e);
        
        let clickedIdx = -1;
        if (session.latlngs.length > 1) {
            clickedIdx = getClosestSegmentIndex(window.leafletMap, session.latlngs, e.latlng);
        }
        
        L.popup().setLatLng(e.latlng).setContent(buildMeasureSessionPopup(session, clickedIdx)).openOn(window.leafletMap);
    };

    session.hitLineLayer.on('click', handleClick);
    session.nodes.forEach(node => node.on('click', handleClick));
}

window.deleteMeasureSession = function(id) {
    let idx = window.measureSessions.findIndex(s => s.id === id);
    if (idx === -1) return;
    let session = window.measureSessions[idx];
    if (session.lineLayer) window.leafletMap.removeLayer(session.lineLayer);
    if (session.hitLineLayer) window.leafletMap.removeLayer(session.hitLineLayer);
    session.nodes.forEach(n => window.leafletMap.removeLayer(n));
    session.midLabels.forEach(l => window.leafletMap.removeLayer(l));
    if (session.totalLabel) window.leafletMap.removeLayer(session.totalLabel);
    window.measureSessions.splice(idx, 1);
    if (window.leafletMap) window.leafletMap.closePopup();
};

function clearMeasurePreview() {
    if (window.measurePreviewLine && window.leafletMap) { window.leafletMap.removeLayer(window.measurePreviewLine); window.measurePreviewLine = null; }
    if (window.measurePreviewLabel && window.leafletMap) { window.leafletMap.removeLayer(window.measurePreviewLabel); window.measurePreviewLabel = null; }
}

function updateMeasurePreview(from, to) {
    if (!window.measurePreviewLine || !window.measurePreviewLabel) return;
    window.measurePreviewLine.setLatLngs([from, to]);
    let dist = calcSegmentDistance(from[0], from[1], to[0], to[1]);
    let midLat = (from[0] + to[0]) / 2; let midLon = (from[1] + to[1]) / 2;
    window.measurePreviewLabel.setLatLng([midLat, midLon]);
    window.measurePreviewLabel.setIcon(L.divIcon({ className: 'measure-label measure-preview-label', html: `${dist.toFixed(3)} m`, iconSize: [60, 20], iconAnchor: [30, 10] }));
}

window._measureMouseMoveHandler = function(e) {
    if (!window.isMeasuring || !window.activeMeasureSession) return;
    let latlngs = window.activeMeasureSession.latlngs;
    if (latlngs.length === 0) return;
    let last = latlngs[latlngs.length - 1];
    updateMeasurePreview(last, [e.latlng.lat, e.latlng.lng]);
};

function discardActiveMeasureSession() {
    let active = window.activeMeasureSession;
    if (!active) return;
    if (active.lineLayer) window.leafletMap.removeLayer(active.lineLayer);
    active.nodes.forEach(n => window.leafletMap.removeLayer(n));
    active.midLabels.forEach(l => window.leafletMap.removeLayer(l));
    if (active.totalLabel) window.leafletMap.removeLayer(active.totalLabel);
    window.activeMeasureSession = null;
}

function finalizeActiveMeasureSession() {
    let active = window.activeMeasureSession;
    if (!active || active.latlngs.length < 2) {
        discardActiveMeasureSession();
        return;
    }
    active.id = window.nextMeasureSessionId++;
    bindMeasureSessionClick(active);
    window.measureSessions.push(active);
    window.activeMeasureSession = null;
}

function startActiveMeasureSession() {
    if (!window.leafletMap.getPane('measurePane')) {
        window.leafletMap.createPane('measurePane');
        window.leafletMap.getPane('measurePane').style.zIndex = 550; 
    }

    window.activeMeasureSession = {
        id: null, latlngs: [],
        lineLayer: L.polyline([], { color: '#ef4444', weight: 4, dashArray: '5, 5', pane: 'measurePane' }).addTo(window.leafletMap),
        nodes: [], midLabels: [], totalLabel: null
    };

    window.measurePreviewLine = L.polyline([], { color: '#f87171', weight: 3, dashArray: '8, 8', opacity: 0.85, interactive: false, pane: 'measurePane' }).addTo(window.leafletMap);
    window.measurePreviewLabel = L.marker([0, 0], { icon: L.divIcon({ className: 'measure-label measure-preview-label', html: '', iconSize: [0, 0] }), interactive: false }).addTo(window.leafletMap);

    if (window.leafletMap) {
        window.leafletMap.on('mousemove', window._measureMouseMoveHandler);
        window.leafletMap.on('touchmove', window._measureMouseMoveHandler);
    }
}

function stopMeasureMode() {
    if (window.leafletMap) {
        window.leafletMap.off('mousemove', window._measureMouseMoveHandler);
        window.leafletMap.off('touchmove', window._measureMouseMoveHandler);
    }
    clearMeasurePreview();
    finalizeActiveMeasureSession();
}

window.refreshMeasureVisuals = function() {
    let active = window.activeMeasureSession;
    if (!active || active.latlngs.length === 0) return;

    active.lineLayer.setLatLngs(active.latlngs);
    let totalDist = 0;
    
    for (let i = 0; i < active.latlngs.length - 1; i++) {
        let p1 = active.latlngs[i]; let p2 = active.latlngs[i+1];
        let segDist = calcSegmentDistance(p1[0], p1[1], p2[0], p2[1]);
        totalDist += segDist;

        let midLat = (p1[0] + p2[0]) / 2; let midLon = (p1[1] + p2[1]) / 2;
        let htmlStr = `${segDist.toFixed(3)} m`;

        if (active.midLabels[i]) {
            active.midLabels[i].setLatLng([midLat, midLon]);
            active.midLabels[i].setIcon(L.divIcon({ className: 'measure-label', html: htmlStr, iconSize: [60, 20], iconAnchor: [30, 10] }));
        } else {
            let lbl = L.marker([midLat, midLon], { icon: L.divIcon({ className: 'measure-label', html: htmlStr, iconSize: [60, 20], iconAnchor: [30, 10] }), interactive: false }).addTo(window.leafletMap);
            active.midLabels.push(lbl);
        }
    }

    let lastPt = active.latlngs[active.latlngs.length - 1];
    if (active.latlngs.length === 1) {
        let startHtml = `<div style="text-align:center;"><b style="color:#1e40af; text-shadow: 1px 1px 2px white, -1px -1px 2px white;">Start Point</b></div>`;
        if (active.totalLabel) {
            active.totalLabel.setLatLng(lastPt).setIcon(L.divIcon({ className: '', html: startHtml, iconSize: [80, 20], iconAnchor: [40, 25] }));
        } else {
            active.totalLabel = L.marker(lastPt, { icon: L.divIcon({ className: '', html: startHtml, iconSize: [80, 20], iconAnchor: [40, 25] }), interactive: false }).addTo(window.leafletMap);
        }
    } else {
        let endHtml = `<div style="text-align:center; padding: 2px;"><b style="color:#b91c1c; font-size:14px; text-shadow: 1px 1px 2px white, -1px -1px 2px white;">Total: ${totalDist.toFixed(3)} m</b></div>`;
        if (active.totalLabel) {
            active.totalLabel.setLatLng(lastPt).setIcon(L.divIcon({ className: '', html: endHtml, iconSize: [120, 25], iconAnchor: [60, 30] }));
        }
    }
};

function addMeasurePoint(finalLat, finalLon, snapResult) {
    let active = window.activeMeasureSession;
    if (!active) return;
    
    let now = Date.now();
    if (active.lastAddTime && (now - active.lastAddTime < 400)) return; 
    
    if (active.latlngs.length > 0) {
        let lastPt = active.latlngs[active.latlngs.length - 1];
        let pxDist = window.leafletMap.latLngToLayerPoint([finalLat, finalLon])
                    .distanceTo(window.leafletMap.latLngToLayerPoint([lastPt[0], lastPt[1]]));
        if (pxDist < 10) return;
    }
    active.lastAddTime = now; 
    
    let idx = active.latlngs.length;
    active.latlngs.push([finalLat, finalLon]);

    let markerIcon = L.divIcon({
        className: 'dxf-text-label',
        html: `<div style="background:white; border-radius:50%; width:16px; height:16px; border:4px solid #10b981; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>`,
        iconSize: [16, 16]
    });
    
    let node = L.marker([finalLat, finalLon], { icon: markerIcon, interactive: true }).addTo(window.leafletMap);
    
    node.on('click', function(e) {
        L.DomEvent.stopPropagation(e);
        if (window.isMeasuring) window.leafletMap.fireEvent('click', {latlng: e.latlng});
    });

    active.nodes.push(node);
    window.refreshMeasureVisuals();
    window.syncDrawBar();

    if (window.measurePreviewLine) {
        window.measurePreviewLine.setLatLngs([]);
    }
    if (window.measurePreviewLabel) {
        window.measurePreviewLabel.setLatLng([0, 0]).setIcon(L.divIcon({ className: 'measure-label measure-preview-label', html: '', iconSize: [0, 0] }));
    }
}

window.undoMeasurePoint = function() {
    let active = window.activeMeasureSession;
    if (!active || active.latlngs.length === 0) return;

    active.latlngs.pop();

    let lastNode = active.nodes.pop();
    if (lastNode) window.leafletMap.removeLayer(lastNode);

    if (active.midLabels.length > active.latlngs.length - 1) {
        let lastLabel = active.midLabels.pop();
        if (lastLabel) window.leafletMap.removeLayer(lastLabel);
    }

    if (active.latlngs.length === 0) {
        if (active.totalLabel) {
            window.leafletMap.removeLayer(active.totalLabel);
            active.totalLabel = null;
        }
        clearMeasurePreview();
    }

    window.refreshMeasureVisuals();
    window.syncDrawBar();
};

window.toggleMeasureMode = function() {
    // တခြား Map tool (Boundary / Volume / PF / Label) ဆွဲနေလျှင် Measure မစရ
    if (!window.isMeasuring && !window.canStartMapTool('measure')) return;

    let btn = document.getElementById('measureBtn');
    if (!window.isMeasuring) {
        if (!window.leafletMap) return;
        window.isMeasuring = true;
        if (btn) { btn.style.background = "#dc2626"; btn.style.borderColor = "#991b1b"; }
        startActiveMeasureSession();
    } else {
        window.isMeasuring = false;
        if (btn) { btn.style.background = "#f59e0b"; btn.style.borderColor = "#d97706"; }
        stopMeasureMode();
    }
    window.syncDrawBar();
};

// Measure: ယခု line ကိုပြီးအောင်သိမ်းပြီး Measure mode မထွက်ဘဲ နောက် line ဆက်တိုင်း
window.measureNewLine = function() {
    if (!window.isMeasuring) return;
    finalizeActiveMeasureSession();
    clearMeasurePreview();
    startActiveMeasureSession();
    window.syncDrawBar();
};

// Measure: Clear (which = 'current' | 'all')
window.measureClear = function(which) {
    if (!window.isMeasuring) return;
    discardActiveMeasureSession();
    clearMeasurePreview();
    if (which === 'all') window.measureSessions.slice().forEach(s => window.deleteMeasureSession(s.id));
    startActiveMeasureSession();
    window.syncDrawBar();
};

// ==========================================
// 🔒 MAP TOOL GATE - Map ပေါ်တွင် tool တစ်ခုချင်းသာ အလုပ်လုပ်ခွင့်ပြုသည်
// လက်ရှိ flag များ (isMeasuring, isLabelDrawing, isDrawingBoundary/Exclude, isVolDrawing, isProfDrawing)
// ကိုပဲ ကြည့်ပြီး ဆုံးဖြတ်သဖြင့် သီးခြား state မရှိ (flag နှင့် မကိုက်ညီတာ မဖြစ်နိုင်)။
// Tab အားလုံး (SVY21 / MM2000 / Topo / Volume / PF ...) တွင် map_engine.js ကို မျှသုံးသည်။
// ==========================================
// checkbox ရှိလျှင် ၎င်း၏ အခြေအနေ၊ မရှိလျှင် true (layer ဆွဲရာတွင် ပိတ်ထားသော checkbox ကို လေးစား)
window.layerOn = function(id) { let e = document.getElementById(id); return e ? !!e.checked : true; };

window.escHtml = function(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };

window.MAP_TOOL_NAMES = {
    measure: '📏 Measure', label: '🏷️ Label Line', boundary: '✏️ Boundary',
    vol: '✏️ Volume boundary', prof: '✏️ Centerline'
};

window.getActiveMapTool = function() {
    if (window.isMeasuring) return 'measure';
    if (window.isLabelDrawing) return 'label';
    if (window.isDrawingBoundary || window.isDrawingExclude) return 'boundary';
    if (window.isVolDrawing) return 'vol';
    if (window.isProfDrawing) return 'prof';
    return null;
};

// tool အသစ်စခွင့်ရှိလား (တခြား tool အလုပ်လုပ်နေလျှင် စာတန်းပြပြီး false)
window.canStartMapTool = function(name) {
    let cur = window.getActiveMapTool();
    if (!cur || cur === name) return true;
    window.mapToast("Finish " + (window.MAP_TOOL_NAMES[cur] || cur) + " first (tap ✔ Done)");
    return false;
};

// Map အပေါ်ဘက်မှာ မှိန်သွားသော စာတန်း (Map မမြင်ရလျှင် alert သုံး)
window.mapToast = function(msg) {
    let c = document.getElementById('map_container');
    if (!c || c.offsetParent === null) { alert(msg); return; }
    let t = document.getElementById('map_toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'map_toast';
        t.className = 'map-toast';
        c.appendChild(t);
    }
    t.innerText = msg;
    t.style.opacity = '1';
    clearTimeout(window._mapToastTimer);
    window._mapToastTimer = setTimeout(function() { t.style.opacity = '0'; }, 2600);
};

window.isToolPanelVisible = function(toolId) {
    let tool = document.getElementById(toolId);
    if (!tool || tool.classList.contains('hidden')) return false;
    let map = document.getElementById('shared_map_view');
    return !!map && !map.classList.contains('hidden');
};

// ==========================================
// 🎛️ ဘုံ DRAW TOOLBAR (Map အောက်ပိုင်းမှာ မျောနေသော ခလုတ်တန်း - tab အားလုံး မျှသုံး)
//   registerDrawBar({ name, tool, persistent, fn }) - fn() က { hint, buttons:[{text,bg,hidden,active,fn}] } (သို့) null ပြန်သည်
//   - tool = ထို tool အလုပ်လုပ်နေချိန် ဦးစားပေးပြမည့် provider
//   - persistent = tool မစသေးလည်း (ထို panel ဖွင့်ထားချိန်) ပြနေမည့် provider
// ==========================================
window.drawBarProviders = window.drawBarProviders || [];
window.drawBarMenuOwner = null;     // Clear မီနူး ဖွင့်ထားသော provider name
window.drawBarLastSig = '';
window.drawBarCollapsed = false;   // ဘာမှမဆွဲနေချိန် toolbar ကို ခေါက်ထားလိုလျှင် true

window.registerDrawBar = function(p) {
    let i = window.drawBarProviders.findIndex(x => x.name === p.name);
    if (i >= 0) window.drawBarProviders[i] = p; else window.drawBarProviders.push(p);
};

window.openDrawBarMenu = function(owner) { window.drawBarMenuOwner = owner; window.syncDrawBar(); };

// "Clear what?" စသည့် ရွေးချယ်ရန်မီနူး (ခလုတ်တန်းထဲမှာပဲ ပြ)
window.drawBarMenuCfg = function(title, items) {
    let close = function() { window.drawBarMenuOwner = null; window.syncDrawBar(); };
    let btns = items.map(it => ({ text: it.text, tone: it.tone, fn: function() { window.drawBarMenuOwner = null; it.fn(); window.syncDrawBar(); } }));
    btns.push({ text: "Cancel", tone: "slate", fn: close });
    return { hint: title, buttons: btns };
};

window.drawBarUndo = function() {
    let cur = window.getActiveMapTool();
    if (cur && cur !== 'measure' && typeof window.handleSharedMapUndo === 'function') window.handleSharedMapUndo();
    else window.mapToast("Start drawing first, then use Undo");
};

window.syncDrawBar = function() {
    let bar = document.getElementById('draw_bar');
    if (!bar) return;
    let cfg = null, owner = '', active = window.getActiveMapTool();
    let run = function(p) { try { return p.fn(); } catch (e) { console.error('drawBar provider', p.name, e); return null; } };

    if (active) {
        let p = window.drawBarProviders.find(x => x.tool === active);
        if (p) { cfg = run(p); if (cfg) owner = p.name; }
    }
    if (!cfg) {
        for (let i = 0; i < window.drawBarProviders.length && !cfg; i++) {
            let p = window.drawBarProviders[i];
            if (p.persistent) { cfg = run(p); if (cfg) owner = p.name; }
        }
    }
    if (!cfg) { bar.classList.remove('show'); window.drawBarLastSig = ''; return; }

    // Tool တစ်ခု အလုပ်လုပ်နေလျှင် toolbar ကို အပြည့်ပြ (ခေါက်ထားလည်း ပြန်ဖြန့်) - Undo/Done မရောက်တာ မဖြစ်စေရန်
    if (active) window.drawBarCollapsed = false;
    let collapsed = !!window.drawBarCollapsed && !active;

    // ခလုတ်များ အပြောင်းအလဲရှိမှသာ ပြန်ဆွဲသည် (နှိပ်နေစဉ် ခလုတ်ပျက်မသွားစေရန်)
    // owner (provider) ကိုပါ ထည့်စစ်သည် - မဟုတ်လျှင် စာသားတူသော bar နှစ်ခု (ဥပမာ PF / Volume) ကြားပြောင်းရာတွင် ခလုတ်အဟောင်း (tool မှား) ကျန်နေမည်
    let sig = JSON.stringify([owner, collapsed, cfg.hint, cfg.buttons.map(b => [b.text, !!b.hidden, !!b.active])]);
    if (sig === window.drawBarLastSig && bar.classList.contains('show')) return;
    window.drawBarLastSig = sig;

    if (collapsed) {
        bar.classList.add('collapsed'); bar.classList.add('show');
        let open = document.createElement('button');
        open.className = 'draw-open';
        open.innerText = "🎛 Tools ▸";
        open.onclick = function(ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); window.drawBarCollapsed = false; window.syncDrawBar(); };
        bar.replaceChildren(open);
        return;
    }
    bar.classList.remove('collapsed');

    let nodes = [];
    let row = document.createElement('div');
    row.className = 'draw-row';
    let h = document.createElement('div');
    h.className = 'draw-hint';
    h.innerText = cfg.hint;
    row.appendChild(h);
    if (!active) {      // ဘာမှမဆွဲနေချိန်သာ ခေါက်ခွင့်ပေး
        let hide = document.createElement('button');
        hide.className = 'draw-hide';
        hide.innerText = "▾ Hide";
        hide.onclick = function(ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); window.drawBarCollapsed = true; window.syncDrawBar(); };
        row.appendChild(hide);
    }
    nodes.push(row);
    cfg.buttons.forEach(b => {
        if (b.hidden) return;
        let btn = document.createElement('button');
        btn.className = 'draw-btn tone-' + (b.tone || 'slate') + (b.active ? ' active' : '');
        btn.innerText = b.text;
        btn.onclick = function(ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); b.fn(); };
        nodes.push(btn);
    });
    bar.replaceChildren(...nodes);
    bar.classList.add('show');
};
if (typeof setInterval === 'function') setInterval(function() { try { window.syncDrawBar(); } catch (e) {} }, 500);

// ---- Measure provider ----
window.registerDrawBar({ name: 'measure', tool: 'measure', fn: function() {
    if (window.drawBarMenuOwner === 'measure') {
        return window.drawBarMenuCfg("Clear what?", [
            { text: "This line", tone: "amber", fn: () => window.measureClear('current') },
            { text: "All", tone: "red", fn: () => window.measureClear('all') }
        ]);
    }
    let a = window.activeMeasureSession, n = a ? a.latlngs.length : 0, tot = 0;
    for (let i = 0; i < n - 1; i++) tot += calcSegmentDistance(a.latlngs[i][0], a.latlngs[i][1], a.latlngs[i + 1][0], a.latlngs[i + 1][1]);
    return {
        hint: n === 0 ? "📏 Tap points to measure" : ("📏 " + n + " pts · " + tot.toFixed(3) + " m"),
        buttons: [
            { text: "➕ New Line", tone: "blue", hidden: n < 2, fn: () => window.measureNewLine() },
            { text: "↩ Undo", tone: "violet", fn: () => window.undoMeasurePoint() },
            { text: "🗑️ Clear", tone: "slate", fn: () => window.openDrawBarMenu('measure') },
            { text: "✔ Done", tone: "red", fn: () => window.toggleMeasureMode() }
        ]
    };
}});

// ==========================================
// --- ONLINE MAP ENGINE ---
// ==========================================

window.getDatumCoordsForLatLon = function(finalLat, finalLon) {
    let datumLabel = "WGS_LL", localN = 0, localE = 0, showLocal = false;
    let autoDetectedZone = Math.floor((finalLon + 180) / 6) + 1;

    if (window.activeApp === 1) {
        if (finalLat >= 1.0 && finalLat <= 2.0 && finalLon >= 103.0 && finalLon <= 104.5) {
            let pW = calc_v2_fwd(finalLat, finalLon); localN = pW.N; localE = pW.E; datumLabel = "SVY21"; showLocal = true;
        }
    } else if (window.activeApp === 2) {
        if (finalLat >= 9.0 && finalLat <= 29.0 && finalLon >= 92.0 && finalLon <= 102.0) {
            let x = m_llh2xyz(finalLat, finalLon, 0, m_WGS);
            let mL = m_xyz2llh(x.x+m_DX, x.y+m_DY, x.z+m_DZ, m_EVE);
            let pM = m_project(mL.lat, mL.lon, autoDetectedZone, m_EVE);
            localN = pM.n; localE = pM.e; datumLabel = `MM2000 Z${autoDetectedZone}`; showLocal = true;
        }
    } else if (window.activeApp === 5) {
        let hemi = finalLat >= 0 ? 'N' : 'S';
        let pW = m_project(finalLat, finalLon, autoDetectedZone, m_WGS);
        localN = pW.n; localE = pW.e; if(hemi === 'S') localN += 10000000;
        datumLabel = `UTM Z${autoDetectedZone}${hemi}`; showLocal = true;
    } else {
        let soDatumVal = document.getElementById('so_datum') ? document.getElementById('so_datum').value : "WGS_LL";
        let cogoDatumVal = document.getElementById('cogo_datum') ? document.getElementById('cogo_datum').value : "WGS_LL";
        let dxfDatumVal = document.getElementById('dxf_datum') ? document.getElementById('dxf_datum').value : "WGS_LL";
        let datum = "WGS_LL";
        
        if (window.activeApp === 3) {
            datum = soDatumVal;
        } else if (window.activeApp === 4) {
            let topoTool = document.getElementById('cogo_topo_tool');
            let volTool = document.getElementById('cogo_vol_tool');
            let profTool = document.getElementById('cogo_prof_tool'); // 🔴 Profile Tool ကိုပါ ဖတ်မည်
            
            if ((topoTool && !topoTool.classList.contains('hidden')) || 
                (volTool && !volTool.classList.contains('hidden')) || 
                (profTool && !profTool.classList.contains('hidden'))) { // 🔴
                datum = document.getElementById('topo_datum') ? document.getElementById('topo_datum').value : "WGS_LL";
            } else {
                datum = cogoDatumVal; 
            }
        } else if (window.activeApp === 6) {
            datum = dxfDatumVal;
        }

        if (datum === "LOCAL") {
            localN = (finalLat * 100000) + (window.localOffsetN || 0);
            localE = (finalLon * 100000) + (window.localOffsetE || 0);
            datumLabel = "LOCAL GRID"; 
            showLocal = true;
        } 
        else if (datum === "SVY21") {
            if (finalLat >= 1.0 && finalLat <= 2.0 && finalLon >= 103.0 && finalLon <= 104.5) {
                let pW = calc_v2_fwd(finalLat, finalLon); localN = pW.N; localE = pW.E; datumLabel = "SVY21"; showLocal = true;
            }
        } else if (datum.startsWith("MM")) {
            if (finalLat >= 9.0 && finalLat <= 29.0 && finalLon >= 92.0 && finalLon <= 102.0) {
                let x = m_llh2xyz(finalLat, finalLon, 0, m_WGS);
                let mL = m_xyz2llh(x.x+m_DX, x.y+m_DY, x.z+m_DZ, m_EVE);
                let pM = m_project(mL.lat, mL.lon, autoDetectedZone, m_EVE);
                localN = pM.n; localE = pM.e; datumLabel = `MM2000 Z${autoDetectedZone}`; showLocal = true;
            }
        } else if (datum.startsWith("WGS_UTM")) {
            let pW = m_project(finalLat, finalLon, autoDetectedZone, m_WGS);
            localN = pW.n; localE = pW.e; datumLabel = `UTM Z${autoDetectedZone}`; showLocal = true;
        } else if (datum === "GLOBAL_UTM") {
            let zInput = null, hInput = null;
            if (window.activeApp === 6) { 
                zInput = document.getElementById('dxf_custom_zone'); hInput = document.getElementById('dxf_custom_hemi'); 
            } else if (window.activeApp === 4) {
                let topoTool = document.getElementById('cogo_topo_tool');
                let volTool = document.getElementById('cogo_vol_tool');
                let profTool = document.getElementById('cogo_prof_tool'); // 🔴 Profile Tool ကိုပါ ဖတ်မည်
                
                if ((topoTool && !topoTool.classList.contains('hidden')) || 
                    (volTool && !volTool.classList.contains('hidden')) || 
                    (profTool && !profTool.classList.contains('hidden'))) { // 🔴
                    zInput = document.getElementById('topo_custom_zone'); hInput = document.getElementById('topo_custom_hemi');
                } else {
                    zInput = document.getElementById('cogo_custom_zone'); hInput = document.getElementById('cogo_custom_hemi');
                }
            } else if (window.activeApp === 3) { 
                zInput = document.getElementById('so_custom_zone'); hInput = document.getElementById('so_custom_hemi'); 
            }
            
            let customZone = (zInput && zInput.value) ? parseInt(zInput.value) : autoDetectedZone;
            let hemi = hInput ? hInput.value : (finalLat >= 0 ? 'N' : 'S');
            let pW = m_project(finalLat, finalLon, customZone, m_WGS);
            localN = pW.n; localE = pW.e; if(hemi === 'S') localN += 10000000; datumLabel = `UTM Z${customZone}${hemi}`; showLocal = true;
        }
    }
    return { datumLabel, localN, localE, showLocal };
};

// Local Grid (N, E) မှ Lat, Lon သို့ ပြန်လည်ပြောင်းလဲပေးသော Helper Function
window.getDatumCoordsForLocal = function(localN, localE) {
    let datum = document.getElementById('topo_datum') ? document.getElementById('topo_datum').value : "WGS_LL";
    let autoZone = 47; // Default
    let lat = 0, lon = 0;

    if (datum === 'LOCAL') {
        lat = (localN - (window.localOffsetN || 0)) / 100000;
        lon = (localE - (window.localOffsetE || 0)) / 100000;
    } else if (datum === "SVY21") {
        let r = calc_v2_rev(localE, localN); lat = r.lat; lon = r.lon;
    } else if (datum.startsWith("MM")) {
        let zone = parseInt(datum.slice(-2)); let r = m_inverse(localE, localN, zone, m_EVE);
        let x = m_llh2xyz(r.lat, r.lon, 0, m_EVE); let w = m_xyz2llh(x.x-m_DX, x.y-m_DY, x.z-m_DZ, m_WGS);
        lat = w.lat; lon = w.lon;
    } else if (datum.startsWith("WGS_UTM")) {
        let zone = parseInt(datum.slice(-2)); let i = m_inverse(localE, localN, zone, m_WGS);
        lat = i.lat; lon = i.lon;
    } else if (datum === "GLOBAL_UTM") {
        let zInput = document.getElementById('topo_custom_zone'); let hInput = document.getElementById('topo_custom_hemi');
        let zone = (zInput && zInput.value) ? parseInt(zInput.value) : autoZone;
        let hemi = hInput ? hInput.value : 'N';
        let calcN = localN; if (hemi === 'S') calcN -= 10000000;
        let i_w = m_inverse(localE, calcN, zone, m_WGS); lat = i_w.lat; lon = i_w.lon;
    } else {
        // Fallback to UTM WGS84
        let i_w = m_inverse(localE, localN, autoZone, m_WGS); lat = i_w.lat; lon = i_w.lon;
    }
    return { lat: lat, lon: lon };
};

window.buildSavedPointPopup = function(lat, lon, opts) {
    opts = opts || {};
    let coords = window.getDatumCoordsForLatLon(lat, lon);
    let zVal = (opts.z !== undefined && opts.z !== null && !isNaN(opts.z)) ? opts.z : 0;
    let icon = opts.icon || '📍';
    let nameColor = opts.nameColor || '#f59e0b';

    let html = `<div style="text-align:center; padding: 2px;">`;
    
    if (opts.pointName) {
        html += `<div style="font-weight:bold; font-size:12px; color:${nameColor}; margin-bottom:2px;">${icon} [ ${opts.pointName} ]</div>`;
    }
    
    if (coords.showLocal) {
       
        html += `<b style="font-size:11px; color:#d97706;">[${coords.datumLabel}]</b><br><b style="font-size:12px; color:#b91c1c; display:block; margin:2px 0;">N: ${coords.localN.toFixed(3)}<br>E: ${coords.localE.toFixed(3)}<br>Z: ${zVal.toFixed(3)}</b>`;
    } else {
        html += `<b style="font-size:10px; color:#ef4444; background:#fee2e2; padding:2px; border-radius:3px; display:block; margin-bottom:2px;">⚠️ Out of Bounds</b>`;
        html += `<b style="font-size:12px; color:#b91c1c;">Z: ${zVal.toFixed(3)}</b>`;
    }
    
    html += `<div style="margin-top:4px;"></div>`;
    html += `<b style="font-size:10px; color:#1e3a8a;">Lat: ${lat.toFixed(6)}<br>Lon: ${lon.toFixed(6)}</b>`;
    
    if (opts.buttonsHtml) {
        html += `<div style="margin-top:5px; display:flex; justify-content:center;">`;
        let modBtn = opts.buttonsHtml.replace(/padding:[^;]+;/g, 'padding: 6px 12px;').replace(/font-size:[^;]+;/g, 'font-size: 11px;').replace(/margin-top:[^;]+;/g, 'margin-top: 0;');
        html += modBtn;
        html += `</div>`;
    }
    html += `</div>`;
    return html;
};

function getSnapPoint(lat, lon, zoomLevel) {
    if (!window.rawDxfEntities || window.rawDxfEntities.length === 0) return { lat, lon, snapped: false };
    let snapRadiusMeters = 0.2; 
    let bestPt = null; let minDist = snapRadiusMeters;
    
    const checkPt = (pX, pY) => { 
        let p = window.dxfToLatLon(pX, pY); 
        if (isNaN(p.lat)) return; 
        let d = calcDistance(lat, lon, p.lat, p.lon); 
        if (d < minDist) { minDist = d; bestPt = { lat: p.lat, lon: p.lon, snapped: true }; } 
    };
    
    window.rawDxfEntities.forEach(ent => { 
        try { 
            if (ent.type === 'LINE') { checkPt(ent.vertices[0].x, ent.vertices[0].y); checkPt(ent.vertices[1].x, ent.vertices[1].y); } 
            else if (ent.type === 'POLYLINE' || ent.type === 'LWPOLYLINE') { ent.vertices.forEach(v => checkPt(v.x, v.y)); } 
            else if (ent.type === 'POINT' || ent.type === 'CIRCLE') { let px = ent.center ? ent.center.x : (ent.position ? ent.position.x : ent.x); let py = ent.center ? ent.center.y : (ent.position ? ent.position.y : ent.y); checkPt(px, py); } 
        } catch(e) {} 
    });
    
    return bestPt ? bestPt : { lat, lon, snapped: false };
}

window.initMap = function() {
    window.leafletMap = L.map('map_view', {
        zoomControl: true,
        maxZoom: 24,
        updateWhenZooming: false,
        updateWhenIdle: true
    }).setView([1.3521, 103.8198], 15);

    window.leafletMap.createPane('dxfPane');
    window.leafletMap.getPane('dxfPane').style.zIndex = 450;

    window.leafletMap.createPane('topoPane');
    window.leafletMap.getPane('topoPane').style.zIndex = 460;

    let satLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 24, maxNativeZoom: 21, crossOrigin: 'anonymous' });
    let streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 24, maxNativeZoom: 19 });

    satLayer.addTo(window.leafletMap);
    L.control.layers({"Street Map": streetLayer, "Satellite": satLayer}).addTo(window.leafletMap);
    window.pointsLayerGroup = L.layerGroup().addTo(window.leafletMap);

    let zoomLevelBox = L.control({position: 'topleft'});
    zoomLevelBox.onAdd = function(map) { this._div = L.DomUtil.create('div', 'zoom-level-display'); this.update(map.getZoom()); return this._div; };
    zoomLevelBox.update = function(z) { this._div.innerHTML = "<b>Z: " + z + "</b>"; };
    zoomLevelBox.addTo(window.leafletMap);

    window.leafletMap.on('zoomend', function() {
        let currentZoom = window.leafletMap.getZoom();
        zoomLevelBox.update(currentZoom);

        let mapCont = document.getElementById('map_container');
        if (mapCont) {
            if (currentZoom < 17) mapCont.classList.add('zoom-out-texts');
            else mapCont.classList.remove('zoom-out-texts');
        }
    });

    window.leafletMap.on('dragstart', function() { window.isAutoCenter = false; document.getElementById('autoCenterBtn').classList.remove('active'); });
    if(window.setOutPoints.length > 0 && typeof window.plotPointsOnMap === 'function') window.plotPointsOnMap();

    window.leafletMap.on('click', function(e) {
        let tapLat = e.latlng.lat;
        let tapLon = ((e.latlng.lng + 180) % 360 + 360) % 360 - 180;

        let currentZoom = window.leafletMap.getZoom();
        let chkLines = document.getElementById('tgl_dxf_lines'); let snapResult = { lat: tapLat, lon: tapLon, snapped: false };
        if (chkLines && chkLines.checked) snapResult = getSnapPoint(tapLat, tapLon, currentZoom);
        let finalLat = snapResult.lat; let finalLon = snapResult.lon;

        if (window.isMeasuring) {
            addMeasurePoint(finalLat, finalLon, snapResult);
            return;
        }
        if (window.isLabelDrawing) return;      // Label Line ဆွဲနေချိန် ပုံမှန် coordinate popup မပေါ်စေ

        let coords = window.getDatumCoordsForLatLon(finalLat, finalLon);

        let popupContent = `<div style="text-align:center; padding: 5px;">`;
        if (snapResult.snapped) { popupContent += `<div style="background:#10b981; color:white; font-size:11px; font-weight:bold; padding:3px; border-radius:4px; margin-bottom:5px;">🧲 Snapped to DXF Node</div>`; }

        if (coords.showLocal) { 
            popupContent += `<b style="font-size:12px; color:#d97706;">[${coords.datumLabel}]</b><br><b style="font-size:14px; color:#b91c1c;">N: ${coords.localN.toFixed(3)}<br>E: ${coords.localE.toFixed(3)}</b><hr style="margin:5px 0; border:0.5px solid #ccc;">`; 
        }
        else { popupContent += `<b style="font-size:11px; color:#ef4444; background:#fee2e2; padding:3px; border-radius:4px; display:block; margin-bottom:5px;">⚠️ Out of Local Bounds</b>`; }

        popupContent += `<b style="font-size:12px; color:#1e3a8a;">Lat: ${finalLat.toFixed(7)}<br>Lon: ${finalLon.toFixed(7)}</b>`;

        if (window.activeApp === 3 && typeof window.setOutFromMapClick === 'function') {
            popupContent += `<div style="margin-top:5px; display:flex; justify-content:center;">`;
            popupContent += `<button class="so-popup-btn" style="background:#dc2626; padding:6px 12px; font-size:11px;" onclick="setOutFromMapClick(${finalLat}, ${finalLon})">🎯 Set Out Here</button>`;
            popupContent += `</div>`;
        } 

        // 🔴 Profile မျဉ်းဆွဲနေချိန်မှာ Default Popup ထွက်မလာအောင် တားထားမည်
        if (window.activeApp === 4 && (window.isVolDrawing || window.isProfDrawing)) {
            return; 
        }

        else if (window.activeApp === 4 && typeof window.addMapPointToArea === 'function' && !document.getElementById('cogo_area_tool').classList.contains('hidden')) {
            popupContent += `<div style="margin-top:5px; display:flex; justify-content:center;">`;
            popupContent += `<button class="so-popup-btn" style="background:#10b981; padding:6px 12px; font-size:11px;" onclick="addMapPointToArea(${finalLat}, ${finalLon})">➕ Add to Area</button>`;
            popupContent += `</div>`;
        }

        popupContent += `</div>`;
        L.popup().setLatLng([finalLat, finalLon]).setContent(popupContent).openOn(window.leafletMap);
    });
};
window.toggleAutoCenter = function() {
    window.isAutoCenter = !window.isAutoCenter;
    let btn = document.getElementById('autoCenterBtn');
    if(window.isAutoCenter) {
        btn.classList.add('active');
        if (window.currentLat !== 0) {
            window.leafletMap.setView([window.currentLat, window.currentLon], 21);
        } else { alert("Waiting for GPS Location..."); }
    } else {
        btn.classList.remove('active');
    }
};

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
        try {
            const parser = new window.DxfParser(); const dxfData = parser.parseSync(e.target.result);
            window.rawDxfEntities = dxfData.entities || [];
            window.dxfLayerTable = {};
            if(dxfData.tables && dxfData.tables.layer && dxfData.tables.layer.layers) {
                let layers = dxfData.tables.layer.layers;
                for (let key in layers) {
                    let cNum = layers[key].colorNumber;
                    if (cNum === undefined) cNum = layers[key].color;
                    window.dxfLayerTable[key.toUpperCase()] = cNum;
                }
            }

            if (window.mapDB) {
                let tx = window.mapDB.transaction("dxf_data", "readwrite");
                tx.objectStore("dxf_data").put({entities: window.rawDxfEntities, layerTable: window.dxfLayerTable}, "saved_dxf");
            }

            document.getElementById('dxf_status').innerText = `⚙️ Processing ${window.rawDxfEntities.length} entities...`;
            let exportBtn = document.getElementById('btn_export_kml'); if(exportBtn) exportBtn.style.display = 'block';
            setTimeout(() => { window.renderDXF(); window.toggleDxfPanel(); }, 100);
        } catch(err) { document.getElementById('dxf_status').innerText = `❌ Error parsing DXF!`; alert("Failed to parse DXF. Please ensure it's a valid text-based DXF file."); }
    };
    reader.readAsText(file); event.target.value = '';
};

window.loadSavedDXF = function() {
    if (!window.mapDB) return;
    let tx = window.mapDB.transaction("dxf_data", "readonly");
    let req = tx.objectStore("dxf_data").get("saved_dxf");
    req.onsuccess = function(e) {
        if (e.target.result) {
            let data = e.target.result;
            window.rawDxfEntities = data.entities || [];
            window.dxfLayerTable = data.layerTable || {};
            document.getElementById('dxf_status').innerText = `✅ Loaded saved DXF map.`;
            let exportBtn = document.getElementById('btn_export_kml'); if(exportBtn) exportBtn.style.display = 'block';

            let chkLines = document.getElementById('tgl_dxf_lines'); if (chkLines) { chkLines.checked = true; chkLines.disabled = false; }
            let chkTexts = document.getElementById('tgl_dxf_texts'); if (chkTexts) { chkTexts.checked = true; chkTexts.disabled = false; }

            if (window.leafletMap && window.rawDxfEntities.length > 0) {
                setTimeout(() => { window.renderDXF(); }, 500);
            }
        }
    };
};

window.clearDXF = function() {
    if (!window.leafletMap) return;
    if (!confirm("Are you sure you want to clear the DXF map?")) return;
    window.dxfCancelFlag = true;
    window.rawDxfEntities = [];
    window.dxfLayerTable = {};
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

window.aciToHex = function(colorNumber) {
    const aciPalette = [
        "#000000", "#FF0000", "#FFFF00", "#00FF00", "#00FFFF", "#0000FF", "#FF00FF", "#FFFFFF",
        "#414141", "#808080", "#FF0000", "#FFAAAA", "#BD0000", "#BD7E7E", "#810000", "#815656",
        "#7C0000", "#7C5353", "#4C0000", "#4C3333", "#FF3F00", "#FFBFAA", "#BD2E00", "#BD8D7E",
        "#7C1F00", "#7C5D53", "#4C1300", "#4C3933", "#FF7F00", "#FFDFAA", "#BD5E00", "#BDA57E"
    ];
    if (colorNumber >= 0 && colorNumber < aciPalette.length) return aciPalette[colorNumber];
    return null;
};

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

window.renderDXF = function() {
    if (!window.leafletMap || !window.rawDxfEntities || window.rawDxfEntities.length === 0) return;

    window.dxfCancelFlag = false;

    if (window.dxfLineLayer) window.leafletMap.removeLayer(window.dxfLineLayer); 
    if (window.dxfTextLayer) window.leafletMap.removeLayer(window.dxfTextLayer);
    
    window.dxfLineLayer = L.layerGroup(); 
    let textsData = []; 
    let bounds = [];
    
    let isDarkLines = false; 
    let chkDark = document.getElementById('tgl_dxf_dark'); 
    if(chkDark) isDarkLines = chkDark.checked;
    
    let lineCount = 0; let textCount = 0; 
    let totalEntities = window.rawDxfEntities.length; 
    let currentIndex = 0; let chunkSize = 500;

    document.getElementById('dxf_status').innerHTML = `⏳ Drawing Map... Please wait.`;
    
    let sharedCanvasRenderer = L.canvas({ padding: 0.5, pane: 'dxfPane' });
    window.dxfCanvasRenderer = sharedCanvasRenderer; 

    function processChunk() {
        if (window.dxfCancelFlag) return;

        let end = Math.min(currentIndex + chunkSize, totalEntities);
        for (; currentIndex < end; currentIndex++) {
            let ent = window.rawDxfEntities[currentIndex];

            let color = "#3b82f6";

            if (isDarkLines) {
                color = "#0f172a";
            } else {
                if (ent.trueColor) {
                    color = "#" + ent.trueColor.toString(16).padStart(6, '0');
                } else {
                    let rawColorNum = ent.colorIndex;
                    if (rawColorNum === 256 || rawColorNum === 0 || rawColorNum === undefined || rawColorNum === null) {
                        if (ent.layer && window.dxfLayerTable[ent.layer.toUpperCase()] !== undefined) {
                            rawColorNum = window.dxfLayerTable[ent.layer.toUpperCase()];
                        }
                    }

                    let aciColor = window.aciToHex(rawColorNum);
                    if (aciColor !== null) {
                        color = aciColor;
                    } else if (ent.layer) {
                        color = window.stringToColor(ent.layer);
                    }
                }
                if (color.toLowerCase() === "#ffffff") color = "#f8fafc";
            }

            function bindDxfEvent(layer, type, layerName) {
                layer.on('click', function(e) {
                    if (window.isMeasuring || window.isDrawingBoundary || window.isDrawingExclude || window.isVolDrawing) return;
                    
                    L.DomEvent.stopPropagation(e);
                    let html = `<div style="text-align:center; padding: 5px;">
                        <b style="color:#ca8a04; font-size:13px;">DXF Element</b><br>
                        <b style="font-size:11px; color:#1e3a8a;">Type: ${type}</b><br>
                        <span style="font-size:11px; color:#64748b;">Layer: ${layerName || 'Unknown'}</span>
                    </div>`;
                    L.popup().setLatLng(e.latlng).setContent(html).openOn(window.leafletMap);
                });
            }

            try {
                if (ent.type === 'LINE') { 
                    let start = window.dxfToLatLon(ent.vertices[0].x, ent.vertices[0].y); 
                    let end = window.dxfToLatLon(ent.vertices[1].x, ent.vertices[1].y); 
                    if (!isNaN(start.lat) && !isNaN(end.lat)) { 
                        let poly = L.polyline([[start.lat, start.lon], [end.lat, end.lon]], {color: color, weight: 1.5, renderer: sharedCanvasRenderer}); 
                        bindDxfEvent(poly, 'Line', ent.layer); 
                        window.dxfLineLayer.addLayer(poly); bounds.push([start.lat, start.lon]); lineCount++; 
                    } 
                }
                else if (ent.type === 'POLYLINE' || ent.type === 'LWPOLYLINE') { 
                    let latlngs = []; 
                    ent.vertices.forEach(v => { 
                        let p = window.dxfToLatLon(v.x, v.y); 
                        if (!isNaN(p.lat) && !isNaN(p.lon)) { bounds.push([p.lat, p.lon]); latlngs.push([p.lat, p.lon]); } 
                    }); 
                    if (latlngs.length > 1) { 
                        if (ent.shape === true) latlngs.push(latlngs[0]); 
                        let poly = L.polyline(latlngs, {color: color, weight: 1.5, renderer: sharedCanvasRenderer}); 
                        bindDxfEvent(poly, 'Polyline', ent.layer); window.dxfLineLayer.addLayer(poly); lineCount++; 
                    } 
                }
                else if (ent.type === 'CIRCLE') { 
                    let center = window.dxfToLatLon(ent.center.x, ent.center.y); 
                    if (!isNaN(center.lat)) { 
                        let circle = L.circle([center.lat, center.lon], {radius: ent.radius, color: color, weight: 1.5, fill: false, renderer: sharedCanvasRenderer}); 
                        bindDxfEvent(circle, 'Circle', ent.layer); window.dxfLineLayer.addLayer(circle); bounds.push([center.lat, center.lon]); lineCount++; 
                    } 
                }
                else if (ent.type === 'ARC') { 
                    let cx = ent.center.x, cy = ent.center.y, r = ent.radius; 
                    let startAngle = ent.startAngle, endAngle = ent.endAngle; 
                    if (endAngle < startAngle) endAngle += 2 * Math.PI; 
                    let arcPoints = []; 
                    let step = 5 * Math.PI / 180; 
                    for (let angle = startAngle; angle <= endAngle; angle += step) { 
                        let p = window.dxfToLatLon(cx + r * Math.cos(angle), cy + r * Math.sin(angle)); 
                        if (!isNaN(p.lat)) arcPoints.push([p.lat, p.lon]); 
                    } 
                    let pLast = window.dxfToLatLon(cx + r * Math.cos(endAngle), cy + r * Math.sin(endAngle)); 
                    if (!isNaN(pLast.lat)) arcPoints.push([pLast.lat, pLast.lon]); 
                    if (arcPoints.length > 1) { 
                        let arcPoly = L.polyline(arcPoints, {color: color, weight: 1.5, renderer: sharedCanvasRenderer}); 
                        bindDxfEvent(arcPoly, 'Arc', ent.layer); window.dxfLineLayer.addLayer(arcPoly); bounds.push(arcPoints[0]); lineCount++; 
                    } 
                }
                else if (ent.type === 'POINT') { 
                    let px = ent.position ? ent.position.x : ent.x; 
                    let py = ent.position ? ent.position.y : ent.y; 
                    let pt = window.dxfToLatLon(px, py); 
                    if (!isNaN(pt.lat)) { 
                        let dot = L.circleMarker([pt.lat, pt.lon], {radius: 2, color: color, weight: 1, fillColor: color, fillOpacity: 1, renderer: sharedCanvasRenderer}); 
                        bindDxfEvent(dot, 'Point', ent.layer); window.dxfLineLayer.addLayer(dot); bounds.push([pt.lat, pt.lon]); lineCount++; 
                    } 
                }
                else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
                    let px = ent.startPoint.x; let py = ent.startPoint.y;
                    if (ent.attachmentPoint && [2, 3, 5, 6, 8, 9].includes(ent.attachmentPoint)) { 
                        if(ent.x !== undefined && ent.y !== undefined) { px = ent.x; py = ent.y; } 
                    }
                    let p = window.dxfToLatLon(px, py);
                    if (!isNaN(p.lat)) {
                        let align = 'left'; 
                        if (ent.attachmentPoint) { 
                            if ([2, 5, 8].includes(ent.attachmentPoint)) align = 'center'; 
                            else if ([3, 6, 9].includes(ent.attachmentPoint)) align = 'right'; 
                        }
                        textsData.push({ lat: p.lat, lon: p.lon, text: ent.text, color: color, align: align, rotation: ent.rotation });
                        textCount++;
                    }
                }
            } catch(e) {}
        }
        let percent = Math.round((currentIndex / totalEntities) * 100);

        if (window.dxfCancelFlag) return;

        document.getElementById('dxf_status').innerHTML = `⏳ Drawing... ${percent}%`;
        if (currentIndex < totalEntities) { setTimeout(processChunk, 5); }
        else {
            document.getElementById('dxf_status').innerHTML = `✅ Loaded <b>${lineCount}</b> entities & <b>${textCount}</b> texts.`;
            window.dxfTextLayer = new L.CanvasTextLayer(textsData);

            let chkLines = document.getElementById('tgl_dxf_lines'); if (chkLines) { chkLines.checked = true; chkLines.disabled = false; }
            let chkTexts = document.getElementById('tgl_dxf_texts'); if (chkTexts) { chkTexts.checked = true; chkTexts.disabled = false; }
            window.toggleDxfLayers();

            setTimeout(() => { 
                window.leafletMap.invalidateSize(); 
                if (bounds.length > 0) { 
                    let validBounds = bounds.filter(b => !isNaN(b[0]) && !isNaN(b[1])); 
                    if(validBounds.length > 0) { 
                        window.leafletMap.fitBounds(L.latLngBounds(validBounds), {padding: [20, 20], maxZoom: 22}); 
                    } 
                    window.isAutoCenter = false; 
                    let btn = document.getElementById('autoCenterBtn'); 
                    if(btn) btn.classList.remove('active'); 
                } 
            }, 100);
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

// ==========================================
// 🔴 SHARED MAP UNDO FUNCTION
// ==========================================
window.handleSharedMapUndo = function() {
    if (window.isVolDrawing) {
        if (typeof window.undoVolBoundary === 'function') window.undoVolBoundary();
    } else if (window.isDrawingBoundary) {
        if (typeof window.undoManualBoundary === 'function') window.undoManualBoundary();
    } else if (window.isDrawingExclude) {
        if (typeof window.undoExcludeBoundary === 'function') window.undoExcludeBoundary();
    }
};
// ==========================================
// --- PLOT POINTS ON MAP (SO & TOPO) ---
// ==========================================
window.refreshPointsAfterDataChange = function() {
    if (!window.leafletMap || typeof window.refreshMapPointLayers !== 'function') return;
    setTimeout(() => window.refreshMapPointLayers(window.activeApp), 50);
};

window.plotRecordedPointsOnMap = function() {
    if (!window.leafletMap) return;
    if (!window.recordedLayerGroup) {
        window.recordedLayerGroup = L.layerGroup().addTo(window.leafletMap);
    } else if (!window.leafletMap.hasLayer(window.recordedLayerGroup)) {
        window.leafletMap.addLayer(window.recordedLayerGroup);
    }
    window.recordedLayerGroup.clearLayers();

    window.recordedPointsBank.forEach((pt, index) => {
        let pLat = pt.wLa !== undefined ? pt.wLa : pt.lat;
        let pLon = pt.wLo !== undefined ? pt.wLo : pt.lon;
        if (pLat === undefined || pLon === undefined || isNaN(pLat) || isNaN(pLon)) return;

        let topoIcon = L.divIcon({
            className: '', iconSize: [36, 36], iconAnchor: [18, 18],
            html: '<div style="width:14px; height:14px; background:#fef08a; border:3px solid #000; border-radius:50%; margin:11px auto; box-shadow:0 0 5px rgba(0,0,0,0.5);"></div>'
        });

        let ptMarker = L.marker([pLat, pLon], { icon: topoIcon });

        ptMarker.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            if (window.isMeasuring) {
                window.leafletMap.fireEvent('click', {latlng: e.latlng});
            } else {
                let isAreaToolActive = (window.activeApp === 4 && document.getElementById('cogo_area_tool') && !document.getElementById('cogo_area_tool').classList.contains('hidden'));
                let buttonsHtml = '';
                if (window.activeApp === 3) { 
                    buttonsHtml = `<button class="so-popup-btn" style="background:#2563eb; margin-top:8px;" onclick="window.startMapSetOutFromTopo(${index})">🎯 Set Out</button>`; 
                } else if (isAreaToolActive) { 
                    buttonsHtml = `<button class="so-popup-btn" style="background:#10b981; margin-top:8px;" onclick="window.addTopoPointToArea(${index})">➕ Add to Area</button>`; 
                } else if (window.activeApp === 1 || window.activeApp === 2 || window.activeApp === 5) { 
                    buttonsHtml = `<button class="so-popup-btn" style="background:#ef4444; margin-top:8px;" onclick="window.deleteRecordedPoint(${index})">🗑️ Delete Point</button>`; 
                }
                let popupContent = window.buildSavedPointPopup(pLat, pLon, { pointName: pt.p, z: pt.z, icon: '📍', nameColor: '#f59e0b', buttonsHtml: buttonsHtml });
                L.popup().setLatLng(e.latlng).setContent(popupContent).openOn(window.leafletMap);
            }
        });
        ptMarker.addTo(window.recordedLayerGroup);
    });
    if (typeof window.forceMapLayerRedraw === 'function') window.forceMapLayerRedraw(window.recordedLayerGroup);
};

window.plotPointsOnMap = function() {
    if (!window.leafletMap) return;
    
    if (window.pointsLayerGroup) {
        window.pointsLayerGroup.clearLayers();
        window.leafletMap.removeLayer(window.pointsLayerGroup);
    }
    window.pointsLayerGroup = L.layerGroup().addTo(window.leafletMap);

    let total = window.setOutPoints.length;
    if (total === 0) {
        // Point တစ်ခုမှ မကျန်တော့လျှင်လည်း စာသား layer ဟောင်းကို ရှင်းပေးရမည် (မရှင်းလျှင် name ပုံရိပ်ကျန်နေသည်)
        if (typeof window.updateMapPointTexts === 'function') window.updateMapPointTexts();
        return;
    }

    let i = 0;
    let chunkSize = 50;

    function processChunk() {
        let end = Math.min(i + chunkSize, total);
        for (; i < end; i++) {
            let ptIndex = i;
            let pt = window.setOutPoints[ptIndex];

            let isSelectedAtCreation = false;
            let areaToolDiv = document.getElementById('cogo_area_tool');
            if (window.activeApp === 4 && areaToolDiv && !areaToolDiv.classList.contains('hidden') && window.orderedAreaPoints) {
                isSelectedAtCreation = window.orderedAreaPoints.includes(ptIndex);
            }

            let markerFillColor = isSelectedAtCreation ? '#10b981' : '#ef4444'; 
            let markerRadius = isSelectedAtCreation ? 7 : 5; 

            let ptMarker = L.circleMarker([pt.lat, pt.lon], {
                radius: markerRadius, color: 'rgba(0,0,0,0.01)', weight: 25, fillColor: markerFillColor, fillOpacity: 1, pane: 'markerPane'
            });

            ptMarker.on('click', function(e) {
                L.DomEvent.stopPropagation(e);
                
                let isActionTaken = false;
                let coords = window.getDatumCoordsForLatLon(pt.lat, pt.lon);
                let localN = coords.showLocal ? coords.localN : 0;
                let localE = coords.showLocal ? coords.localE : 0;
                let ptZ = pt.z || 0;

                let topoTool = document.getElementById('cogo_topo_tool');
                // 🔴 ပြင်ဆင်ချက်: window.activeApp === 4 ဟု သေချာအောင် စစ်ဆေးခြင်း
                if (window.activeApp === 4 && topoTool && !topoTool.classList.contains('hidden') && coords.showLocal) {
                    if (window.isDrawingBoundary) {
                        window.topoBoundaryPolygon.push({ n: localN, e: localE, lat: pt.lat, lon: pt.lon });
                        if (typeof updateBoundaryDrawUI === 'function') updateBoundaryDrawUI();
                        isActionTaken = true;
                    } else if (window.isDrawingExclude) {
                        window.currentExcludePolygon.push({ n: localN, e: localE, lat: pt.lat, lon: pt.lon });
                        if (typeof updateBoundaryDrawUI === 'function') updateBoundaryDrawUI();
                        isActionTaken = true;
                    }
                }
                
                let volTool = document.getElementById('cogo_vol_tool');
                // 🔴 ပြင်ဆင်ချက်: window.activeApp === 4 ဟု သေချာအောင် စစ်ဆေးခြင်း
                if (window.activeApp === 4 && volTool && !volTool.classList.contains('hidden') && coords.showLocal) {
                    if (window.isVolDrawing) {
                        window.volDraftPoint = { lat: pt.lat, lon: pt.lon, n: localN, e: localE, groundZ: ptZ };
                        if (typeof window.volUpdateBoundaryUI === 'function') window.volUpdateBoundaryUI();
                        isActionTaken = true;
                    }
                }

                if (isActionTaken) return; 

                if (window.isMeasuring) { 
                    window.leafletMap.fireEvent('click', {latlng: e.latlng}); 
                } else {
                    let buttonsHtml = '';
                    let isAreaActiveNow = (window.activeApp === 4 && document.getElementById('cogo_area_tool') && !document.getElementById('cogo_area_tool').classList.contains('hidden'));
                    
                    if (isAreaActiveNow) { 
                        let isSelectedNow = window.orderedAreaPoints.includes(ptIndex);
                        let areaBtnText = isSelectedNow ? "➖ Remove from Area" : "➕ Add to Area";
                        let areaBtnColor = isSelectedNow ? "#f59e0b" : "#10b981"; 
                        buttonsHtml = `<button class="so-popup-btn" style="background:${areaBtnColor}; margin-top:8px;" onclick="window.addPointToArea(${ptIndex})">${areaBtnText}</button>`; 
                    } else if (window.activeApp === 3) { 
                        buttonsHtml = `<button class="so-popup-btn" style="background:#2563eb; margin-top:8px;" onclick="window.startMapSetOut(${ptIndex})">🎯 Set Out Here</button>`; 
                    }
                    let popupContent = window.buildSavedPointPopup(pt.lat, pt.lon, { pointName: pt.p, z: pt.z, icon: '🎯', nameColor: '#1e40af', buttonsHtml: buttonsHtml });
                    L.popup().setLatLng(e.latlng).setContent(popupContent).openOn(window.leafletMap);
                }
            });
            ptMarker.addTo(window.pointsLayerGroup);
        }
        
        if (i < total) {
            setTimeout(processChunk, 15);
        } else {
            if (typeof window.ensureSoPointsLayerVisible === 'function') window.ensureSoPointsLayerVisible();
            if (typeof window.updateMapPointTexts === 'function') window.updateMapPointTexts();
        }
    }
    processChunk();
};

// ==========================================
// --- UTM ZONE GRID (ALL 60 ZONES) RESTORED ---
// ==========================================
window.utmZonesLayer = null;

window.drawUTMZones = function() {
    if (!window.leafletMap) return;
    
    if (window.utmZonesLayer) {
        window.leafletMap.removeLayer(window.utmZonesLayer);
    }
    
    window.utmZonesLayer = L.layerGroup();
    let isDarkMode = document.getElementById('master-ui').classList.contains('dark-mode');
    let lineColor = isDarkMode ? '#60a5fa' : '#2563eb'; 
    
    for (let lon = -180; lon <= 180; lon += 6) {
        let line = L.polyline([[84, lon], [-80, lon]], {
            color: lineColor, weight: 1.5, dashArray: '5, 5', opacity: 0.6, interactive: false
        });
        window.utmZonesLayer.addLayer(line);
    }

    for (let zone = 1; zone <= 60; zone++) {
        let centerLon = -180 + (zone * 6) - 3; 
        let latIntervals = [-60, -40, -20, 0, 20, 40, 60, 80];
        
        latIntervals.forEach(lat => {
            let labelIcon = L.divIcon({
                className: 'utm-zone-label',
                html: `<div style="color:${lineColor}; font-weight:bold; font-size:14px; text-shadow: 1px 1px 2px white, -1px -1px 2px white;">Zone ${zone}</div>`,
                iconSize: [60, 20], iconAnchor: [30, 10]
            });
            let marker = L.marker([lat, centerLon], { icon: labelIcon, interactive: false });
            window.utmZonesLayer.addLayer(marker);
        });
    }
};

window.toggleUTMZones = function() {
    if (!window.leafletMap) return;
    let chk = document.getElementById('tgl_utm_zones');
    
    if (chk && chk.checked) {
        if (!window.utmZonesLayer) { window.drawUTMZones(); }
        if (!window.leafletMap.hasLayer(window.utmZonesLayer)) { window.leafletMap.addLayer(window.utmZonesLayer); }
    } else {
        if (window.utmZonesLayer && window.leafletMap.hasLayer(window.utmZonesLayer)) { window.leafletMap.removeLayer(window.utmZonesLayer); }
    }
};

let originalToggleDarkModeUTM = window.toggleDarkMode;
window.toggleDarkMode = function() {
    if (typeof originalToggleDarkModeUTM === 'function') originalToggleDarkModeUTM();
    if (window.utmZonesLayer) {
        window.drawUTMZones(); 
        let chk = document.getElementById('tgl_utm_zones');
        if (chk && chk.checked) window.leafletMap.addLayer(window.utmZonesLayer);
    }
};

// ==========================================
// --- EQUATOR LINE (LATITUDE 0) ---
// ==========================================
window.equatorLayer = null;

window.drawEquator = function() {
    if (!window.leafletMap) return;
    
    if (window.equatorLayer) {
        window.leafletMap.removeLayer(window.equatorLayer);
    }
    
    window.equatorLayer = L.layerGroup();
    
    // အီကွေတာမျဉ်း (Latitude 0, Longitude -180 မှ 180 ထိ) ကို အနီရောင် မျဉ်းပြတ်ဖြင့် ဆွဲမည်
    let eqLine = L.polyline([[0, -180], [0, 180]], {
        color: '#ef4444', 
        weight: 2.5, 
        dashArray: '8, 8', 
        opacity: 0.9, 
        interactive: false
    });
    window.equatorLayer.addLayer(eqLine);

    // မြေပုံရွှေ့တိုင်း စာသားမြင်ရအောင် Longitude ကွာဟချက်အလိုက် စာသားများ ထည့်မည်
    let eqLons = [-150, -90, -30, 30, 90, 150];
    eqLons.forEach(lon => {
        let labelIcon = L.divIcon({
            className: 'equator-label',
            html: `<div style="color:#ef4444; font-weight:bold; font-size:14px; text-shadow: 1px 1px 2px white, -1px -1px 2px white;">Equator (0°)</div>`,
            iconSize: [80, 20], iconAnchor: [40, 10]
        });
        let marker = L.marker([0, lon], { icon: labelIcon, interactive: false });
        window.equatorLayer.addLayer(marker);
    });
};

window.toggleEquator = function() {
    if (!window.leafletMap) return;
    let chk = document.getElementById('tgl_equator');
    
    if (chk && chk.checked) {
        if (!window.equatorLayer) { window.drawEquator(); }
        if (!window.leafletMap.hasLayer(window.equatorLayer)) { window.leafletMap.addLayer(window.equatorLayer); }
    } else {
        if (window.equatorLayer && window.leafletMap.hasLayer(window.equatorLayer)) { window.leafletMap.removeLayer(window.equatorLayer); }
    }
};

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
    let pts = window.profCenterlinePts;
    el.value = pts.length > 0 ? Math.floor(Math.min(...pts.map(p => p.groundZ)) - 2) : "";
};

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
        if (activeAl) banner.innerText = `✏️ Editing ${activeAl.name} — press Update to keep changes`;
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
window.profBuildDraftPopup = function(dPt) {
    let pre = (dPt.mode === 'move') ? window.profCenterlinePts[dPt.index] : null;
    let radVal = (pre && pre.radius > 0) ? pre.radius : 0;
    let dirVal = (pre && pre.curveDir === 'Left') ? 'Left' : 'Right';
    let btnText = dPt.mode === 'move' ? '✔ Move here' : (dPt.mode === 'insert' ? '↳ Insert here' : '➕ Add');
    let title = dPt.mode === 'move' ? '↔ New Position' : (dPt.mode === 'insert' ? '↳ Insert Node' : '📍 Centerline Node');

    return `<div style="text-align:center; padding: 0px; line-height: 1.2;">
            <div style="font-weight:bold; font-size:10px; color:#d97706; margin-bottom:1px;">${title}</div>
            <div style="font-size:10px; color:#0284c7; font-weight:bold; margin-bottom:2px;">
                N: ${dPt.n.toFixed(2)} | E: ${dPt.e.toFixed(2)}<br>Z: ${dPt.groundZ.toFixed(2)}
            </div>

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
    let d = window.profDraftPoint;
    if (!d) return;

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
    } else {
        alert("No points to undo.");
    }
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
    });
    return s;
};

window.profApplySettings = function(s) {
    if (!s) return;
    window.PROF_SETTING_IDS.forEach(id => {
        let el = document.getElementById(id);
        if (!el || s[id] === undefined) return;
        if (el.type === 'checkbox') el.checked = !!s[id]; else el.value = s[id];
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
    if (box && sum) { box.classList.remove('hidden'); sum.innerHTML = `<div style="font-size:14px; font-weight:bold; color:#047857;">✅ ${savedName} saved</div>Draw the next alignment, or Export all.`; }
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
        let nSt = (al.sectionData && al.sectionData.stations) ? al.sectionData.stations.length : 0;
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
            ? '<tr><td>' + window.escHtml(r.name) + '</td><td>' + r.sd.totalLength.toFixed(1) + ' m</td><td>' + r.sd.stations.length + '</td><td>' + r.sd.minZ.toFixed(2) + '</td></tr>'
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
    if (drawing) hint = n < 2 ? (pre + "Tap map → ➕ Add (" + n + " pts, need 2+)") : (pre + n + " pts · tap a point: Move/Delete · tap the line: Insert");
    else hint = n >= 2 ? (al ? ("Editing " + al.name + " · press 💾 Update") : (n + " pts · press 💾 Save")) : "Tap ✏️ Draw, then tap the map";
    return { hint: hint, buttons: [
        { text: drawing ? "✏️ Draw ●" : (n > 0 ? "✏️ Edit" : "✏️ Draw"), tone: "amber", active: drawing, fn: () => window.toggleProfDrawMode() },
        { text: "↩ Undo", tone: "violet", fn: () => window.drawBarUndo() },
        { text: "🗑️ Clear", tone: "slate", fn: () => window.openDrawBarMenu('prof') },
        { text: al ? "💾 Update" : "💾 Save", tone: "purple", hidden: drawing || n < 2, fn: () => window.profSaveAlignment() },
        { text: "✔ Done", tone: "red", hidden: !drawing, fn: () => window.profStopDrawing() }
    ]};
}});

// Shared Undo ခလုတ်နှိပ်ရင် အလုပ်လုပ်အောင် Hook ဝင်ထည့်ခြင်း
let _oldHandleSharedMapUndoProf = window.handleSharedMapUndo;
window.handleSharedMapUndo = function() {
    if (window.isProfDrawing) {
        window.undoProfCenterline();
    } else if (typeof _oldHandleSharedMapUndoProf === 'function') {
        _oldHandleSharedMapUndoProf();
    }
};
