// ==========================================
// --- MEASURE TOOL (OPTIMIZED NO-GHOST) ---
// ==========================================

window.measureDistMode = 'grid'; 

window.toggleMeasureDistMode = function(e) {
    if(e) L.DomEvent.stopPropagation(e);
    window.measureDistMode = (window.measureDistMode === 'grid') ? 'ground' : 'grid';
    window.updateMeasureModeButton();
    if (window.activeMeasureSession) window.refreshMeasureVisuals();
};

window.updateMeasureModeButton = function() {
    let modeBtn = document.getElementById('measureModeBtn');
    if (!modeBtn) return;

    let isLocal = false;
    
    if (window.activeApp === 4) {
        let topoTool = document.getElementById('cogo_topo_tool');
        let volTool = document.getElementById('cogo_vol_tool');
        if ((topoTool && !topoTool.classList.contains('hidden')) || (volTool && !volTool.classList.contains('hidden'))) {
            let datum = document.getElementById('topo_datum') ? document.getElementById('topo_datum').value : "WGS_LL";
            if (datum === 'LOCAL') isLocal = true;
        }
    }

    if (isLocal) {
        modeBtn.innerHTML = "<span style='font-size:13px; margin-bottom:2px; display:block;'>📐</span>L<br>O<br>C";
        modeBtn.style.background = "#64748b"; 
        modeBtn.style.borderColor = "#475569";
        modeBtn.style.pointerEvents = "none"; 
    } else {
        modeBtn.innerHTML = window.measureDistMode === 'grid' 
            ? "<span style='font-size:13px; margin-bottom:2px; display:block;'>🌐</span>G<br>R<br>I<br>D" 
            : "<span style='font-size:13px; margin-bottom:2px; display:block;'>📐</span>G<br>N<br>D";
        modeBtn.style.background = window.measureDistMode === 'grid' ? "#3b82f6" : "#10b981";
        modeBtn.style.borderColor = window.measureDistMode === 'grid' ? "#2563eb" : "#059669";
        modeBtn.style.pointerEvents = "auto";
    }
    modeBtn.style.width = "28px"; 
};

function calcSegmentDistance(lat1, lon1, lat2, lon2) {
    let isLocal = false;
    
    if (window.activeApp === 4) {
        let topoTool = document.getElementById('cogo_topo_tool');
        let volTool = document.getElementById('cogo_vol_tool');
        if ((topoTool && !topoTool.classList.contains('hidden')) || (volTool && !volTool.classList.contains('hidden'))) {
            let datum = document.getElementById('topo_datum') ? document.getElementById('topo_datum').value : "WGS_LL";
            if (datum === 'LOCAL') isLocal = true;
        }
    }
    
    if (isLocal || window.measureDistMode === 'grid') {
        let p1 = window.getDatumCoordsForLatLon(lat1, lon1);
        let p2 = window.getDatumCoordsForLatLon(lat2, lon2);
        if (p1.showLocal && p2.showLocal) {
            return Math.hypot(p2.localE - p1.localE, p2.localN - p1.localN);
        }
    }
    return calcDistance(lat1, lon1, lat2, lon2);
}

function calcMeasureTotal(latlngs) {
    let total = 0;
    for (let i = 0; i < latlngs.length - 1; i++) {
        total += calcSegmentDistance(latlngs[i][0], latlngs[i][1], latlngs[i + 1][0], latlngs[i + 1][1]);
    }
    return total;
}

function buildMeasureSessionPopup(session) {
    let total = calcMeasureTotal(session.latlngs);
    return `<div style="text-align:center; padding:5px;">
        <b style="color:#b91c1c; font-size:14px;">Total: ${total.toFixed(3)} m</b><br>
        <span style="font-size:11px; color:#64748b;">${session.latlngs.length - 1} segment(s)</span><br>
        <button class="so-popup-btn" style="background:#ef4444; margin-top:8px;" onclick="window.deleteMeasureSession(${session.id})">🗑️ Delete Line</button>
    </div>`;
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
        L.popup().setLatLng(e.latlng).setContent(buildMeasureSessionPopup(session)).openOn(window.leafletMap);
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
};

window.toggleMeasureMode = function() {
    if (window.isDrawingBoundary || window.isDrawingExclude || window.isVolDrawing) {
        alert("⚠️ Please finish or clear the current boundary drawing first.");
        return;
    }

    window.isMeasuring = !window.isMeasuring;
    let btn = document.getElementById('measureBtn');
    
    let modeBtnId = 'measureModeBtn';
    let existingModeBtn = document.getElementById(modeBtnId);
    
    let undoBtnId = 'measureUndoBtn';
    let existingUndoBtn = document.getElementById(undoBtnId);

    if (window.isMeasuring) {
        btn.style.background = "#dc2626"; btn.style.borderColor = "#991b1b";
        if (!window.leafletMap) return;
        startActiveMeasureSession();
        
        if (!existingModeBtn) {
            let modeBtn = document.createElement('button');
            modeBtn.id = modeBtnId;
            modeBtn.className = "map-loc-btn";
            modeBtn.style.bottom = "70px"; 
            modeBtn.style.right = "70px"; 
            modeBtn.style.width = "25px";
            modeBtn.style.padding = "5px 0";
            modeBtn.style.fontSize = "11px";
            modeBtn.style.fontWeight = "bold";
            modeBtn.style.lineHeight = "1.2";
            modeBtn.style.borderRadius = "8px";
            modeBtn.onclick = window.toggleMeasureDistMode;
            document.getElementById('map_container').appendChild(modeBtn); 
        } else {
            existingModeBtn.style.display = 'block';
        }
        window.updateMeasureModeButton();

        if (!existingUndoBtn) {
            let undoBtn = document.createElement('button');
            undoBtn.id = undoBtnId;
            undoBtn.className = "map-loc-btn";
            undoBtn.style.bottom = "35px"; 
            undoBtn.style.right = "70px"; 
            undoBtn.style.width = "30px";
            undoBtn.style.padding = "5px 0";
            undoBtn.style.fontSize = "14px";
            undoBtn.style.borderRadius = "8px";
            undoBtn.style.background = "#8b5cf6"; 
            undoBtn.style.borderColor = "#7c3aed";
            undoBtn.style.color = "white";
            undoBtn.innerHTML = "↩️";
            undoBtn.onclick = function(e) { L.DomEvent.stopPropagation(e); window.undoMeasurePoint(); };
            document.getElementById('map_container').appendChild(undoBtn); 
        } else {
            existingUndoBtn.style.display = 'block';
        }

    } else {
        btn.style.background = "#f59e0b"; btn.style.borderColor = "#d97706";
        stopMeasureMode();
        if (existingModeBtn) existingModeBtn.style.display = 'none';
        if (existingUndoBtn) existingUndoBtn.style.display = 'none'; 
    }
};

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
            if ((topoTool && !topoTool.classList.contains('hidden')) || (volTool && !volTool.classList.contains('hidden'))) {
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
                if ((topoTool && !topoTool.classList.contains('hidden')) || (volTool && !volTool.classList.contains('hidden'))) {
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

        let coords = window.getDatumCoordsForLatLon(finalLat, finalLon);

        let popupContent = `<div style="text-align:center; padding: 5px;">`;
        if (snapResult.snapped) { popupContent += `<div style="background:#10b981; color:white; font-size:11px; font-weight:bold; padding:3px; border-radius:4px; margin-bottom:5px;">🧲 Snapped to DXF Node</div>`; }

        if (coords.showLocal) { popupContent += `<b style="font-size:12px; color:#d97706;">[${coords.datumLabel}]</b><br><b style="font-size:14px; color:#b91c1c;">N: ${coords.localN.toFixed(3)}<br>E: ${coords.localE.toFixed(3)}</b><hr style="margin:5px 0; border:0.5px solid #ccc;">`; }
        else { popupContent += `<b style="font-size:11px; color:#ef4444; background:#fee2e2; padding:3px; border-radius:4px; display:block; margin-bottom:5px;">⚠️ Out of Local Bounds</b>`; }

        popupContent += `<b style="font-size:12px; color:#1e3a8a;">Lat: ${finalLat.toFixed(7)}<br>Lon: ${finalLon.toFixed(7)}</b>`;

        if (window.activeApp === 3 && typeof window.setOutFromMapClick === 'function') {
            popupContent += `<div style="margin-top:5px; display:flex; justify-content:center;">`;
            popupContent += `<button class="so-popup-btn" style="background:#dc2626; padding:6px 12px; font-size:11px;" onclick="setOutFromMapClick(${finalLat}, ${finalLon})">🎯 Set Out Here</button>`;
            popupContent += `</div>`;
        } 

        if (window.activeApp === 4 && window.isVolDrawing) {
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

        if (this._map.getZoom() < 19) return;

        let bounds = this._map.getBounds();
        let isDarkMode = document.getElementById('master-ui').classList.contains('dark-mode');

        ctx.save();
        ctx.scale(dpr, dpr); 

        for (let i = 0; i < this._texts.length; i++) {
            let t = this._texts[i];
            if (!t.text || t.text.trim() === "") continue;

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
            window.leafletMap.addLayer(window.recordedLayerGroup);
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
    if (total === 0) return;

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
            if (typeof window.updateSoMapPointTexts === 'function') window.updateSoMapPointTexts();
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