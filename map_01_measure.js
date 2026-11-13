// [split from map_engine.js] lines 1-351 | part 1/7 | ထပ်ခွဲထားသည် - load order မပြောင်းရ (app.html ၏ script tag အစီအစဉ်အတိုင်း)
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
        let _bc = Math.round(bearingDec * 3600 * 10);   // 0.1" ကို integer ဖြင့်ပိုင်း (59.96" => 60.0" မဖြစ်စေရန်)
        let d = Math.floor(_bc / 36000);
        let m = Math.floor((_bc % 36000) / 600);
        let s = ((_bc % 600) / 10).toFixed(1); 
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

