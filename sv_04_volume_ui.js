// [split from module_surface_volume.js] lines 938-1799 | part 4/8 | ထပ်ခွဲထားသည် - load order မပြောင်းရ (app.html ၏ script tag အစီအစဉ်အတိုင်း)
// ==========================================
// --- EARTHWORK / VOLUME CALCULATOR LOGIC ---
// ==========================================

window.volPoints = [];
window.volTriangles = [];
window.volBoundaryPts = [];
window.volBoundaryLayer = null;
window.isVolDrawing = false;
window.volPolygonObj = null;
window.savedVolAreas = []; 

// 1. Topo Tool မှ Data ယူခြင်း
window.volLoadFromTopo = function() {
    if (!window.topoTriangles || window.topoTriangles.length === 0) {
        return alert("⚠️ No Topo Surface found! Please generate Topo first in 'Topo Surface & Contour' tool.");
    }
    
    // Topo ထဲက Data တွေကို Volume ဘက်သို့ ကူးယူခြင်း
    window.volPoints = JSON.parse(JSON.stringify(window.topoPoints));
    window.volTriangles = JSON.parse(JSON.stringify(window.topoTriangles));
    
    let statBox = document.getElementById('vol_status');
    statBox.style.display = 'block'; statBox.style.color = '#10b981';
    statBox.innerText = `✅ Successfully loaded surface from Topo Tool. (${window.volPoints.length} points)`;
    
    volShowPointsOnMap();
};

// 3. မြေပုံပေါ်တွင် အမှတ်များ ပြသခြင်း (Coordinate အမှန်ဖြင့်)
function volShowPointsOnMap() {
    if (!window.leafletMap) return;
    
    if (window.topoPointsLayer) {
        window.topoPointsLayer.clearLayers();
        window.leafletMap.removeLayer(window.topoPointsLayer);
    }
    window.topoPointsLayer = L.layerGroup(); if (window.layerOn('tgl_topo_pts')) window.topoPointsLayer.addTo(window.leafletMap);

    if (!window.masterTopoCanvas) window.masterTopoCanvas = L.canvas({ padding: 0.5 }); 

    let bounds = [];
    let datum = document.getElementById('topo_datum') ? document.getElementById('topo_datum').value : "WGS_LL";

    window.volPoints.forEach(pt => {
        let lat = pt.n, lon = pt.e; 

        if (datum === 'LOCAL') {
            lat = (pt.n - (window.localOffsetN || 0)) / 100000;
            lon = (pt.e - (window.localOffsetE || 0)) / 100000;
        } else if (datum === "SVY21") { 
            let r = calc_v2_rev(pt.e, pt.n); lat = r.lat; lon = r.lon; 
        } else if (datum.startsWith("MM")) {
            let zone = parseInt(datum.slice(-2)); let r = m_inverse(pt.e, pt.n, zone, m_EVE); 
            let x = m_llh2xyz(r.lat, r.lon, 0, m_EVE); let w = m_xyz2llh(x.x-m_DX, x.y-m_DY, x.z-m_DZ, m_WGS);
            lat = w.lat; lon = w.lon;
        } else if (datum.startsWith("WGS_UTM")) { 
            let zone = parseInt(datum.slice(-2)); 
            let i = m_inverse(pt.e, pt.n, zone, m_WGS); lat = i.lat; lon = i.lon; 
        } else if (datum === "GLOBAL_UTM") {
            let zInput = document.getElementById('topo_custom_zone'); 
            let hInput = document.getElementById('topo_custom_hemi');
            let zone = (zInput && zInput.value) ? parseInt(zInput.value) : 47; 
            let hemi = hInput ? hInput.value : 'N'; 
            let calcN = pt.n; if (hemi === 'S') calcN -= 10000000; 
            let i_w = m_inverse(pt.e, calcN, zone, m_WGS); lat = i_w.lat; lon = i_w.lon;
        }

        if (!isNaN(lat) && !isNaN(lon)) {
            let marker = L.circleMarker([lat, lon], { 
                radius: 4, color: 'transparent', weight: 25, fillColor: '#94a3b8', fillOpacity: 0.8,
                renderer: window.masterTopoCanvas 
            });
            
            marker.bindTooltip(`Z: ${pt.z.toFixed(3)}`, { direction: 'top', className: 'pt-tooltip' });
            
            marker.on('click', function(e) {
                L.DomEvent.stopPropagation(e);
                
                if (window.isMeasuring) {
                    window.leafletMap.fireEvent('click', {latlng: e.latlng});
                    return;
                }

                let isActionTaken = false;
                
                let topoTool = document.getElementById('cogo_topo_tool');
                if (topoTool && !topoTool.classList.contains('hidden')) {
                    if (window.isDrawingBoundary) {
                        window.topoBoundaryPolygon.push({ n: pt.n, e: pt.e, lat: lat, lon: lon });
                        if (typeof updateBoundaryDrawUI === 'function') updateBoundaryDrawUI();
                        isActionTaken = true;
                    } else if (window.isDrawingExclude) {
                        window.currentExcludePolygon.push({ n: pt.n, e: pt.e, lat: lat, lon: lon });
                        if (typeof updateBoundaryDrawUI === 'function') updateBoundaryDrawUI();
                        isActionTaken = true;
                    }
                }
                
                let volTool = document.getElementById('cogo_vol_tool');
                if (volTool && !volTool.classList.contains('hidden')) {
                    if (window.isVolDrawing) {
                        window.volDraftPoint = { lat: lat, lon: lon, n: pt.n, e: pt.e, groundZ: pt.z };
                        if (typeof window.volUpdateBoundaryUI === 'function') window.volUpdateBoundaryUI();
                        isActionTaken = true;
                    }
                }

                if (!isActionTaken) {
                    let pName = pt.p ? `<b style="color:#1e40af; font-size:13px;">[ ${window.escHtml(pt.p)} ]</b><hr style="margin:4px 0; border:0.5px solid #ccc;">` : '';
                    // ပြောင်းလဲပြီးသား Code (အစားထိုးရန်)
let popupHtml = `<div style="text-align:center; line-height:1.4; padding:2px;">${pName}<b style="color:#b91c1c; font-size:13px;">N: ${pt.n.toFixed(3)}<br>E: ${pt.e.toFixed(3)}<br>Z: ${pt.z.toFixed(3)}</b></div>`;
                    L.popup().setLatLng(e.latlng).setContent(popupHtml).openOn(window.leafletMap);
                }
            });

            window.topoPointsLayer.addLayer(marker);
            bounds.push([lat, lon]);
        }
    });

    if (bounds.length > 0) window.leafletMap.fitBounds(L.latLngBounds(bounds), {padding: [30, 30], maxZoom: 22});
    
    if (typeof toggleTopoLayers === 'function') toggleTopoLayers();
}

// ==========================================
// 4. BOUNDARY DRAWING & TARGET LEVEL UI
// ==========================================

function getZFromTIN(n, e, triangles) {
    for (let i = 0; i < triangles.length; i++) {
        let t = triangles[i];
        
        if (t.minN === undefined) {
            t.minN = Math.min(t.p1.n, t.p2.n, t.p3.n);
            t.maxN = Math.max(t.p1.n, t.p2.n, t.p3.n);
            t.minE = Math.min(t.p1.e, t.p2.e, t.p3.e);
            t.maxE = Math.max(t.p1.e, t.p2.e, t.p3.e);
        }

        if (n < t.minN || n > t.maxN || e < t.minE || e > t.maxE) continue;

        let det = (t.p2.n - t.p3.n) * (t.p1.e - t.p3.e) + (t.p3.e - t.p2.e) * (t.p1.n - t.p3.n);
        let l1 = ((t.p2.n - t.p3.n) * (e - t.p3.e) + (t.p3.e - t.p2.e) * (n - t.p3.n)) / det;
        let l2 = ((t.p3.n - t.p1.n) * (e - t.p3.e) + (t.p1.e - t.p3.e) * (n - t.p3.n)) / det;
        let l3 = 1.0 - l1 - l2;
        if (l1 >= -0.01 && l2 >= -0.01 && l3 >= -0.01) {
            return (l1 * t.p1.z) + (l2 * t.p2.z) + (l3 * t.p3.z);
        }
    }
    return null; 
}

window.volDraftPoint = null;
window.volDraftMarker = null;
window.volDraftLine = null;
window.volDraftLabel = null;
window.volGhostLine = null;
window.volGhostLabel = null;

window.volMapClickListener = function(e) {
    if (!window.isVolDrawing) return;
    let _vt = document.getElementById('cogo_vol_tool');
    if (!_vt || _vt.classList.contains('hidden')) return;
    
    let coords = window.getDatumCoordsForLatLon(e.latlng.lat, e.latlng.lng); 
    if (!coords.showLocal) return;

    let z = getZFromTIN(coords.localN, coords.localE, window.volTriangles);
    if (z === null) return alert("⚠️ Please tap INSIDE the generated Topo Surface area.");

    window.volDraftPoint = { lat: e.latlng.lat, lon: e.latlng.lng, n: coords.localN, e: coords.localE, groundZ: z };
    window.volUpdateBoundaryUI();
};

window.volMouseMoveListener = function(e) {
    return;
};

window.toggleVolDrawMode = function() {
    if (!window.volPoints || window.volPoints.length === 0) return alert("Please load Data Source first!");
    if (!window.isVolDrawing && !window.canStartMapTool('vol')) return;

    window.isVolDrawing = !window.isVolDrawing;
    window.drawBarMenuOwner = null;

    if (window.isVolDrawing) {
        if (typeof window.accCollapse === 'function') window.accCollapse(['vol:src']);
        if (window.leafletMap) {
            window.leafletMap.off('click', window.volMapClickListener);
            window.leafletMap.off('mousemove', window.volMouseMoveListener);
            window.leafletMap.on('click', window.volMapClickListener);
            window.leafletMap.on('mousemove', window.volMouseMoveListener);
        }
    } else {
        if (window.leafletMap) {
            window.leafletMap.off('click', window.volMapClickListener);
            window.leafletMap.off('mousemove', window.volMouseMoveListener);
        }
        window.volDraftPoint = null;
        if (window.volGhostLine) window.leafletMap.removeLayer(window.volGhostLine);
        if (window.volGhostLabel) window.leafletMap.removeLayer(window.volGhostLabel);

        window.volUpdateBoundaryUI(true);
    }

    window.renderVolTargetInputs();
    window.syncDrawBar();
};

// Toolbar Clear: which = 'current' | 'saved' | 'both' (Draw mode ကို မပိတ်ပါ)
window.volClear = function(which) {
    if (which === 'current' || which === 'both') window.clearVolBoundary(true);
    if (which === 'saved' || which === 'both') { window.savedVolAreas = []; updateSavedVolAreasUI(); }
    window.volUpdateBoundaryUI(!window.isVolDrawing);
};

window.confirmVolDraftPoint = function() {
    if (!window.volDraftPoint) return;
    window.volBoundaryPts.push(window.volDraftPoint);
    window.volDraftPoint = null; 
    if (window.leafletMap) window.leafletMap.closePopup(); 
    window.volUpdateBoundaryUI();
};

window.applyVolDraftDistance = function() {
    if (!window.volDraftPoint || window.volBoundaryPts.length === 0) return;

    let distInput = document.getElementById('vol_draft_dist_inp');
    if (!distInput) return;
    
    let targetDist = parseFloat(distInput.value);
    if (isNaN(targetDist) || targetDist <= 0) return alert("⚠️ Please enter a valid distance greater than 0.");

    let lastPt = window.volBoundaryPts[window.volBoundaryPts.length - 1];
    let dPt = window.volDraftPoint; 

    let diffN = dPt.n - lastPt.n;
    let diffE = dPt.e - lastPt.e;
    let bearingRad = Math.atan2(diffE, diffN);

    let newN = lastPt.n + (targetDist * Math.cos(bearingRad));
    let newE = lastPt.e + (targetDist * Math.sin(bearingRad));

    let datum = document.getElementById('topo_datum') ? document.getElementById('topo_datum').value : "WGS_LL";
    let newLat, newLon;

    if (datum === 'LOCAL') {
        newLat = (newN - (window.localOffsetN || 0)) / 100000;
        newLon = (newE - (window.localOffsetE || 0)) / 100000;
    } else if (datum === "SVY21") {
        let r = calc_v2_rev(newE, newN); newLat = r.lat; newLon = r.lon;
    } else if (datum.startsWith("MM")) {
        let zone = parseInt(datum.slice(-2)); let r = m_inverse(newE, newN, zone, m_EVE);
        let x = m_llh2xyz(r.lat, r.lon, 0, m_EVE); let w = m_xyz2llh(x.x-m_DX, x.y-m_DY, x.z-m_DZ, m_WGS);
        newLat = w.lat; newLon = w.lon;
    } else if (datum.startsWith("WGS_UTM")) {
        let zone = parseInt(datum.slice(-2)); let i = m_inverse(newE, newN, zone, m_WGS);
        newLat = i.lat; newLon = i.lon;
    } else if (datum === "GLOBAL_UTM") {
        let zInput = document.getElementById('topo_custom_zone'); let hInput = document.getElementById('topo_custom_hemi');
        let zone = (zInput && zInput.value) ? parseInt(zInput.value) : 47;
        let hemi = hInput ? hInput.value : 'N';
        let calcN = newN; if (hemi === 'S') calcN -= 10000000;
        let i_w = m_inverse(newE, calcN, zone, m_WGS); newLat = i_w.lat; newLon = i_w.lon;
    }

    let z = getZFromTIN(newN, newE, window.volTriangles);
    if (z === null) {
        return alert("⚠️ The calculated distance falls OUTSIDE the generated Topo Surface boundary!");
    }

    window.volDraftPoint = { lat: newLat, lon: newLon, n: newN, e: newE, groundZ: z };
    window.volUpdateBoundaryUI();
};

window.volUpdateBoundaryUI = function(isClosed = false) {
    if (!window.leafletMap) return;
    
    if (window.volBoundaryLayer) window.leafletMap.removeLayer(window.volBoundaryLayer);

    if (window.volBoundaryPts.length > 0) {
        let layers = [];
        let latlngs = window.volBoundaryPts.map(pt => [pt.lat, pt.lon]);
        if (isClosed && latlngs.length > 2) latlngs.push(latlngs[0]); 
        
        layers.push(L.polygon(latlngs, { color: '#ef4444', weight: 3, fillColor: '#ef4444', fillOpacity: 0.2, dashArray: '5, 5' }));

        window.volBoundaryPts.forEach((pt, index) => {
            let ptMarker = L.marker([pt.lat, pt.lon], {
                icon: L.divIcon({ className: 'bdy-point-marker', html: `<div style="width:12px; height:12px; background:#fff; border:3px solid #ef4444; border-radius:50%; box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>`, iconSize: [12, 12], iconAnchor: [6, 6] }),
                interactive: true 
            });

            ptMarker.bindTooltip(
                `<div style="line-height: 1.1; text-align:center;">
                    <b style="font-size:11px; color:#ef4444; display:block;">BDY ${index + 1}</b>
                    <span style="font-size:10px; color:#0f172a; font-weight:bold;">Z: ${pt.groundZ.toFixed(3)}</span>
                 </div>`, 
                 { permanent: true, direction: 'top', className: 'vol-bdy-tooltip', offset: [0, -6] }
            );
            layers.push(ptMarker);
        });
        window.volBoundaryLayer = L.layerGroup(layers).addTo(window.leafletMap);
    }
    
    if (window.isVolDrawing && window.volDraftPoint) {
        let dPt = window.volDraftPoint;

        let fixDistHTML = "";
        if (window.volBoundaryPts.length > 0) {
            let lastPt = window.volBoundaryPts[window.volBoundaryPts.length - 1];
            let currentDist = Math.hypot(dPt.e - lastPt.e, dPt.n - lastPt.n); 
            
            fixDistHTML = `
                <div style="margin-top:3px; margin-bottom:3px; border-top:1px dashed #cbd5e1; padding-top:3px;">
                    <div style="display:flex; align-items:center; justify-content:center; gap:3px;">
                        <span style="font-size:9px; color:#64748b; font-weight:bold;">Dist:</span>
                        <input type="number" id="vol_draft_dist_inp" value="${currentDist.toFixed(3)}" step="0.001" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();" style="width:55px; font-size:11px; padding:2px; border:1px solid #94a3b8; border-radius:3px; text-align:center; color:#1e40af; font-weight:bold; margin:0; height:20px;">
                        <button style="background:#3b82f6; color:white; border:none; border-radius:3px; font-size:10px; padding:0 6px; height:20px; font-weight:bold; cursor:pointer;" onclick="event.stopPropagation(); applyVolDraftDistance();">Apply</button>
                    </div>
                </div>
            `;
        }

        let compactPopupHTML = `<div style="text-align:center; padding: 0px; line-height: 1.2;">
            <div style="font-weight:bold; font-size:10px; color:#d97706; margin-bottom:1px;">📍 Draft</div>
            <div style="font-size:10px; color:#b91c1c; font-weight:bold; margin-bottom:2px;">
                N: ${dPt.n.toFixed(2)} | E: ${dPt.e.toFixed(2)}<br>Z: ${dPt.groundZ.toFixed(2)}
            </div>
            ${fixDistHTML}
            <button class="so-popup-btn" style="background:#10b981; padding: 4px; font-size: 11px; margin-top: 2px; font-weight:bold; border-radius:3px; width:100%;" onclick="event.stopPropagation(); confirmVolDraftPoint();">➕ Add</button>
        </div>`;

        if (!window.volDraftMarker) {
            window.volDraftMarker = L.marker([dPt.lat, dPt.lon], {
                draggable: true,
                icon: L.divIcon({ className: 'draft-marker', html: `<div style="background:#eab308; width:18px; height:18px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 5px rgba(0,0,0,0.8);"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] })
            }).bindPopup(compactPopupHTML, { closeOnClick: false, autoClose: false }).addTo(window.leafletMap);

            setTimeout(() => { window.volDraftMarker.openPopup(); }, 50);
            window.volDraftMarker.on('dragstart', function() { window.volDraftMarker.closePopup(); });
            window.volDraftMarker.on('drag', function(e) {
                let ll = e.latlng;
                if (window.volBoundaryPts.length > 0) {
                    let lastPt = window.volBoundaryPts[window.volBoundaryPts.length - 1];
                    if (window.volDraftLine) window.volDraftLine.setLatLngs([[lastPt.lat, lastPt.lon], [ll.lat, ll.lng]]);
                }
            });
            window.volDraftMarker.on('dragend', function(e) {
                let ll = e.target.getLatLng();
                let coords = window.getDatumCoordsForLatLon(ll.lat, ll.lng);
                let z = getZFromTIN(coords.localN, coords.localE, window.volTriangles);
                if (z === null) {
                    alert("⚠️ Outside TIN surface! Moved back to previous valid location.");
                    window.volUpdateBoundaryUI(); 
                } else {
                    window.volDraftPoint = { lat: ll.lat, lon: ll.lng, n: coords.localN, e: coords.localE, groundZ: z };
                    window.volUpdateBoundaryUI(); 
                }
            });
        } else {
            window.volDraftMarker.setLatLng([dPt.lat, dPt.lon]);
            window.volDraftMarker.setPopupContent(compactPopupHTML); 
            if (!window.leafletMap.hasLayer(window.volDraftMarker)) window.volDraftMarker.addTo(window.leafletMap);
            setTimeout(() => { window.volDraftMarker.openPopup(); }, 50);
        }

        if (window.volBoundaryPts.length > 0) {
            let lastPt = window.volBoundaryPts[window.volBoundaryPts.length - 1];
            if (!window.volDraftLine) window.volDraftLine = L.polyline([[lastPt.lat, lastPt.lon], [dPt.lat, dPt.lon]], { color: '#eab308', weight: 3, dashArray: '5, 5' }).addTo(window.leafletMap);
            else { window.volDraftLine.setLatLngs([[lastPt.lat, lastPt.lon], [dPt.lat, dPt.lon]]); if (!window.leafletMap.hasLayer(window.volDraftLine)) window.volDraftLine.addTo(window.leafletMap); }
            if (window.volDraftLabel) window.leafletMap.removeLayer(window.volDraftLabel);
        }

    } else {
        if (window.volDraftMarker) window.leafletMap.removeLayer(window.volDraftMarker);
        if (window.volDraftLine) window.leafletMap.removeLayer(window.volDraftLine);
        if (window.volDraftLabel) window.leafletMap.removeLayer(window.volDraftLabel);
    }
    
    window.renderVolTargetInputs();

    if(window.volBoundaryPts.length >= 3) document.getElementById('vol_multi_area_box').classList.remove('hidden');
    else document.getElementById('vol_multi_area_box').classList.add('hidden');
    if (typeof window.syncDrawBar === 'function') window.syncDrawBar();
};

window.undoVolBoundary = function() {
    if (window.volDraftPoint) {
        window.volDraftPoint = null;
        window.volUpdateBoundaryUI();
    } else if (window.volBoundaryPts.length > 0) {
        window.volBoundaryPts.pop();
        window.volUpdateBoundaryUI();
    }
};

window.clearVolBoundary = function(skipSavedClear = false) {
    window.volBoundaryPts = [];
    window.volDraftPoint = null;
    if (window.volBoundaryLayer) window.leafletMap.removeLayer(window.volBoundaryLayer);
    if (window.volDraftMarker) window.leafletMap.removeLayer(window.volDraftMarker);
    if (window.volDraftLine) window.leafletMap.removeLayer(window.volDraftLine);
    if (window.volDraftLabel) window.leafletMap.removeLayer(window.volDraftLabel);
    window.volBoundaryLayer = null;
    
    document.getElementById('vol_target_panel').classList.add('hidden');
    let settingsPanel = document.getElementById('vol_settings_panel');
    if (settingsPanel) settingsPanel.classList.add('hidden');
    document.getElementById('vol_multi_area_box').classList.add('hidden');
    document.getElementById('vol_result_box').classList.add('hidden');
    
    let baseTypeSelect = document.getElementById('vol_base_type');
    if (baseTypeSelect) baseTypeSelect.value = 'flat';
    
    if (!skipSavedClear) {
        window.savedVolAreas = [];
        updateSavedVolAreasUI();
        if (window.isVolDrawing) window.toggleVolDrawMode();
    }
};

window.volSurface2Points = [];
window.volSurface2Triangles = [];

window.renderVolTargetInputs = function() {
    let panel = document.getElementById('vol_target_panel');
    let container = document.getElementById('vol_target_inputs');
    let settingsPanel = document.getElementById('vol_settings_panel');
    let baseType = document.getElementById('vol_base_type').value;

    if (window.isVolDrawing || window.volBoundaryPts.length < 3) { 
        if (panel) panel.classList.add('hidden'); 
        if (settingsPanel) settingsPanel.classList.add('hidden');
    } else {
        if (panel) panel.classList.remove('hidden');
        if (settingsPanel) settingsPanel.classList.remove('hidden');
    }
    
    setTimeout(() => {
        let saveBox = document.getElementById('vol_multi_area_box');
        let calcBtn = document.querySelector('button[onclick*="calcVolume"]');
        
        let hasValidCurrentBdy = (window.volBoundaryPts.length >= 3 && !window.isVolDrawing);
        let hasSavedAreas = (window.savedVolAreas && window.savedVolAreas.length > 0);

        if (saveBox) {
            if (hasValidCurrentBdy) saveBox.classList.remove('hidden');
            else saveBox.classList.add('hidden');
        }

        if (calcBtn) {
            if (hasValidCurrentBdy || hasSavedAreas) calcBtn.style.display = 'block';
            else calcBtn.style.display = 'none';
        }
    }, 50);

    if (window.isVolDrawing || window.volBoundaryPts.length < 3) {
        container.innerHTML = '';
        return;
    }

    if (baseType === 'flat') {
        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; background:#fff; padding:8px; border-radius:6px; border:1px solid #bae6fd;">
                <label style="font-size:12px; font-weight:bold; color:#0369a1; flex:1;">Flat Base Level (Z):</label>
                <input type="number" id="vol_flat_z" class="v2-input" placeholder="e.g. 50.0" style="flex:1; margin:0;">
            </div>`;
    } 
    else if (baseType === 'variable') {
        let html = `
            <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:6px; padding:10px; text-align:center;">
                <span style="font-size:12px; font-weight:bold; color:#16a34a;">✅ Target Z levels are auto-filled with Ground Z.</span><br>
                <button class="top-btn" style="background:#e2e8f0; color:#1e293b; padding:6px 12px; font-size:11px; margin-top:8px; border-radius:4px; font-weight:bold; border: 1px solid #cbd5e1;" onclick="let c = document.getElementById('var_z_inputs_container'); if(c.style.display === 'none') { c.style.display = 'block'; } else { c.style.display = 'none'; }">
                    ✏️ Edit Individual Levels 🔽
                </button>
            </div>
            <div id="var_z_inputs_container" style="display: none; max-height: 210px; overflow-y: auto; margin-top: 10px; border: 1px solid #bae6fd; border-radius: 6px; padding: 5px; background: #f0f9ff;">
        `;

        window.volBoundaryPts.forEach((pt, index) => {
            html += `
            <div style="display:flex; align-items:center; gap:5px; background:#fff; padding:5px 8px; border-radius:6px; border:1px solid #bae6fd; margin-bottom:5px;">
                <div style="flex:1;">
                    <span style="font-size:12px; font-weight:bold; color:#0369a1;">BDY ${index + 1}</span><br>
                    <span style="font-size:10px; color:#64748b;">Ground: ${pt.groundZ.toFixed(3)}m</span>
                </div>
                <input type="number" id="vol_var_z_${index}" class="v2-input" value="${pt.groundZ.toFixed(3)}" placeholder="Target Z" style="flex:1.5; margin:0;">
            </div>`;
        });
        
        html += `</div>`; 
        container.innerHTML = html;
    }
    else if (baseType === 'surface2') {
        let isLoaded = (window.volSurface2Triangles && window.volSurface2Triangles.length > 0);
        let statusColor = isLoaded ? '#059669' : '#dc2626';
        let statusMsg = isLoaded ? '✅ Surface 2 is ready.' : '⚠️ No Surface 2 detected! Please Load Surface 2 at Step 1.';
        
        container.innerHTML = `
            <div style="background:#fff; padding:10px; border-radius:6px; border:1px solid #bae6fd; text-align:center;">
                <div style="font-size:13px; font-weight:bold; color:${statusColor};">${statusMsg}</div>
                <div style="font-size:11px; color:#64748b; margin-top:5px;">App will calculate volume between Surface 1 and Surface 2.</div>
            </div>`;
    }
};

window.loadVolSurface2CSV = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    let statBox = document.getElementById('vol_surf2_status');
    statBox.style.color = '#d97706';
    statBox.innerText = `⏳ Loading Surface 2...`;

    let formatSel = document.getElementById('topo_csv_format');
    let isPENZD = (formatSel && formatSel.value === 'PENZD');

    const reader = new FileReader();
    reader.onload = function(e) {
        window.volSurface2Points = [];
        let lines = e.target.result.split('\n');
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line || line.toUpperCase().includes("POINT") || line.toUpperCase().includes("NAME") || line.toUpperCase().includes("EAST")) continue;
            
            let cols = line.split(',');
            if (cols.length < 4) continue;

            let n, e_val, z;
            if (isPENZD) {
                e_val = parseFloat(cols[1]); n = parseFloat(cols[2]);
            } else {
                n = parseFloat(cols[1]); e_val = parseFloat(cols[2]);
            }
            z = parseFloat(cols[3]);

            if (!isNaN(n) && !isNaN(e_val) && !isNaN(z)) {
                window.volSurface2Points.push({ n: n, e: e_val, z: z });
            }
        }

        if (window.volSurface2Points.length < 3) {
            statBox.style.color = '#ef4444'; statBox.innerText = `❌ Error: Need at least 3 points!`;
            return;
        }

        window.volSurface2Triangles = generateDelaunayTriangulation(window.volSurface2Points);
        
        statBox.style.color = '#10b981';
        statBox.innerText = `✅ Surface 2 Ready! (${window.volSurface2Points.length} Pts)`;

        if (typeof volShowSurface2OnMap === 'function') {
            volShowSurface2OnMap();
        }
    };
    reader.readAsText(file);
    event.target.value = '';
};

window.volSurface2Layer = null;

window.volShowSurface2OnMap = function() {
    if (!window.leafletMap || !window.volSurface2Points || window.volSurface2Points.length === 0) return;
    
    if (window.volSurface2Layer) {
        window.volSurface2Layer.clearLayers();
        window.leafletMap.removeLayer(window.volSurface2Layer);
    }
    window.volSurface2Layer = L.layerGroup(); if (window.layerOn('tgl_surf2_pts')) window.volSurface2Layer.addTo(window.leafletMap);

    if (!window.masterTopoCanvas) window.masterTopoCanvas = L.canvas({ padding: 0.5, pane: 'topoPane' }); 
    
    let bounds = [];
    let datum = document.getElementById('topo_datum') ? document.getElementById('topo_datum').value : "WGS_LL";

    window.volSurface2Points.forEach(pt => {
        let lat = pt.n, lon = pt.e; 

        if (datum === 'LOCAL') {
            lat = (pt.n - (window.localOffsetN || 0)) / 100000;
            lon = (pt.e - (window.localOffsetE || 0)) / 100000;
        } else if (datum === "SVY21") { 
            let r = calc_v2_rev(pt.e, pt.n); lat = r.lat; lon = r.lon; 
        } else if (datum.startsWith("MM")) {
            let zone = parseInt(datum.slice(-2)); let r = m_inverse(pt.e, pt.n, zone, m_EVE); 
            let x = m_llh2xyz(r.lat, r.lon, 0, m_EVE); let w = m_xyz2llh(x.x-m_DX, x.y-m_DY, x.z-m_DZ, m_WGS);
            lat = w.lat; lon = w.lon;
        } else if (datum.startsWith("WGS_UTM")) { 
            let zone = parseInt(datum.slice(-2)); let i = m_inverse(pt.e, pt.n, zone, m_WGS); lat = i.lat; lon = i.lon; 
        } else if (datum === "GLOBAL_UTM") {
            let zInput = document.getElementById('topo_custom_zone'); let hInput = document.getElementById('topo_custom_hemi');
            let zone = (zInput && zInput.value) ? parseInt(zInput.value) : 47; let hemi = hInput ? hInput.value : 'N'; 
            let calcN = pt.n; if (hemi === 'S') calcN -= 10000000; let i_w = m_inverse(pt.e, calcN, zone, m_WGS); lat = i_w.lat; lon = i_w.lon;
        }

        if (!isNaN(lat) && !isNaN(lon)) {
            let marker = L.circleMarker([lat, lon], { 
                radius: 4, color: '#ea580c', weight: 2, fillColor: '#f97316', fillOpacity: 0.8,
                renderer: window.masterTopoCanvas 
            });
            
            marker.bindTooltip(`<b>S2</b> Z: ${pt.z.toFixed(3)}`, { direction: 'top', className: 'pt-tooltip', offset: [0, -5] });
            
            marker.on('click', function(e) {
                L.DomEvent.stopPropagation(e);
                
                if (window.isMeasuring) {
                    window.leafletMap.fireEvent('click', {latlng: e.latlng});
                    return;
                }

                let isActionTaken = false;
                
                let volTool = document.getElementById('cogo_vol_tool');
                if (volTool && !volTool.classList.contains('hidden')) {
                    if (window.isVolDrawing) {
                        window.volDraftPoint = { lat: lat, lon: lon, n: pt.n, e: pt.e, groundZ: pt.z };
                        if (typeof window.volUpdateBoundaryUI === 'function') window.volUpdateBoundaryUI();
                        isActionTaken = true;
                    }
                }

                if (!isActionTaken) {
                    let popupHtml = `<div style="text-align:center; line-height:1.4; padding:2px;">
                        <b style="color:#ea580c; font-size:13px;">[ Surface 2 Pt ]</b><hr style="margin:4px 0; border:0.5px solid #ccc;">
                        <b style="color:#b91c1c; font-size:13px;">N: ${pt.n.toFixed(3)}<br>E: ${pt.e.toFixed(3)}<br>Z: ${pt.z.toFixed(3)}</b>
                    </div>`;
                    L.popup().setLatLng(e.latlng).setContent(popupHtml).openOn(window.leafletMap);
                }
            });

            window.volSurface2Layer.addLayer(marker);
            bounds.push([lat, lon]);
        }
    });

    if (bounds.length > 0) window.leafletMap.fitBounds(L.latLngBounds(bounds), {padding: [30, 30], maxZoom: 22});
};

window.saveCurrentVolArea = function() {
    if (window.volBoundaryPts.length < 3) return alert("⚠️ Please draw at least 3 points.");
    let baseType = document.getElementById('vol_base_type').value;
    let targetLevels = [];

    if (baseType === 'flat') {
        let flatZ = parseFloat(document.getElementById('vol_flat_z').value);
        if (isNaN(flatZ)) return alert("⚠️ Please enter a Flat Base Level.");
        targetLevels.push({ z: flatZ });
    } 
    else if (baseType === 'variable') {
        for (let i = 0; i < window.volBoundaryPts.length; i++) {
            let varZ = parseFloat(document.getElementById(`vol_var_z_${i}`).value);
            if (isNaN(varZ)) return alert(`⚠️ Please enter Target Level for BDY ${i+1}.`);
            targetLevels.push({ n: window.volBoundaryPts[i].n, e: window.volBoundaryPts[i].e, z: varZ });
        }
    } 
    else if (baseType === 'surface2') {
        if (!window.volSurface2Triangles || window.volSurface2Triangles.length === 0) {
            return alert("⚠️ Please upload Surface 2 CSV first!");
        }
        targetLevels = window.volSurface2Triangles; 
    }

    let gInp = parseFloat(document.getElementById('vol_grid_size').value) || 0.5;
    let swInp = parseFloat(document.getElementById('vol_swell').value) || 0;
    let shInp = parseFloat(document.getElementById('vol_shrink').value) || 0;

    window.savedVolAreas.push({ 
        boundary: [...window.volBoundaryPts], baseType: baseType, targetLevels: targetLevels,
        gridSize: gInp, swellPct: swInp, shrinkPct: shInp 
    });
    
    window.clearVolBoundary(true); 
    updateSavedVolAreasUI();
};

function updateSavedVolAreasUI() {
    let container = document.getElementById('saved_vol_areas_list');
    if (!container) return;
    container.innerHTML = '';
    
    window.savedVolAreas.forEach((area, index) => {
        let html = `
        <div style="background:#f0f9ff; border:1px solid #7dd3fc; border-radius:6px; margin-bottom:5px;">
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px;">
                <div style="font-size:12px; color:#0369a1; font-weight:bold;">📍 Saved Vol BDY ${index + 1} <span style="font-size:10px; color:#64748b;">(${area.boundary.length} pts)</span></div>
                <div style="display:flex; gap:5px;">
                    <button class="top-btn" style="background:#10b981; color:white; padding:4px 8px; font-size:11px;" onclick="calcIndividualVolume(${index})">📊 Calc</button>
                    <button class="top-btn" style="background:#f59e0b; color:white; padding:4px 8px; font-size:11px;" onclick="editSavedVolArea(${index})">✏️ Edit</button>
                    <button class="top-btn" style="background:#ef4444; color:white; padding:4px 8px; font-size:11px;" onclick="deleteSavedVolArea(${index})">🗑️ Drop</button>
                </div>
            </div>
            <div id="indiv_vol_res_${index}" style="display:none; border-top:1px dashed #7dd3fc; padding:8px; background:#fff; border-bottom-left-radius:6px; border-bottom-right-radius:6px;">
            </div>
        </div>`;
        container.innerHTML += html;
    });
    
    if (typeof window.drawSavedVolBdys === 'function') window.drawSavedVolBdys();
}

window.editSavedVolArea = function(index) {
    let area = window.savedVolAreas[index];
    if (!area) return;
    if (!window.isVolDrawing && !window.canStartMapTool('vol')) return;

    if (window.volBoundaryPts && window.volBoundaryPts.length > 0) {
        if (!confirm("Current unsaved boundary will be replaced. Continue?")) return;
        window.clearVolBoundary(true);
    }

    window.volBoundaryPts = [...area.boundary];
    window.isVolDrawing = true;
    
    window.volUpdateBoundaryUI();

    document.getElementById('vol_base_type').value = area.baseType;
    document.getElementById('vol_grid_size').value = area.gridSize || 0.5;
    document.getElementById('vol_swell').value = area.swellPct || 0;
    document.getElementById('vol_shrink').value = area.shrinkPct || 0;

    window.renderVolTargetInputs();

    setTimeout(() => {
        if (area.baseType === 'flat' && area.targetLevels.length > 0) {
            let flatInp = document.getElementById('vol_flat_z');
            if (flatInp) flatInp.value = area.targetLevels[0].z;
        } else if (area.baseType === 'variable') {
            for (let i = 0; i < area.targetLevels.length; i++) {
                let varInp = document.getElementById(`vol_var_z_${i}`);
                if (varInp && area.targetLevels[i]) varInp.value = area.targetLevels[i].z;
            }
        }
    }, 50);

    window.savedVolAreas.splice(index, 1);
    updateSavedVolAreasUI();
    
    if (window.leafletMap) {
        window.leafletMap.on('click', window.volMapClickListener);
        window.leafletMap.on('mousemove', window.volMouseMoveListener);
    }
};

window.calcIndividualVolume = function(index) {
    let area = window.savedVolAreas[index];
    if (!area) return;

    let resDiv = document.getElementById(`indiv_vol_res_${index}`);
    if (resDiv.style.display === 'block' && resDiv.innerHTML.includes('Net:')) { resDiv.style.display = 'none'; return; }

    resDiv.style.display = 'block';
    resDiv.innerHTML = `<div style="text-align:center; font-size:11px; color:#d97706;">⏳ Calculating BDY ${index + 1}... <span id="indiv_prog_${index}" style="font-weight:bold; color:#1e40af;">0%</span></div>`;

    runVolumeWorker(window.volTriangles, area.boundary, area.targetLevels, area.baseType, area.gridSize, area.swellPct, area.shrinkPct,
        function(pct) {
            let progSpan = document.getElementById(`indiv_prog_${index}`);
            if(progSpan) progSpan.innerText = pct + '%';
        },
        function(res) {
            let netVol = res.cutVol - res.fillVol;
            resDiv.innerHTML = `
                <div style="font-size:10px; color:#64748b; margin-bottom:5px; text-align:center;">
                    Grid: ${res.gridSize}m | Swell: ${res.swellPct}% | Shrink: ${res.shrinkPct}%
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; font-size:11px; text-align:center;">
                    <div style="background:#f1f5f9; padding:4px; border-radius:4px; color:#475569;"><b>Area:</b><br>${res.totalArea.toFixed(2)} m²</div>
                    <div style="background:#fef2f2; padding:4px; border-radius:4px; color:#ef4444;"><b>Cut (Adj):</b><br>${res.cutVol.toFixed(3)} m³</div>
                    <div style="background:#ecfdf5; padding:4px; border-radius:4px; color:#059669;"><b>Fill (Adj):</b><br>${res.fillVol.toFixed(3)} m³</div>
                    <div style="background:${netVol >= 0 ? '#fef2f2' : '#ecfdf5'}; padding:4px; border-radius:4px; color:${netVol >= 0 ? '#ef4444' : '#059669'}; font-weight:bold; font-size:12px;"><b>Net:</b><br>${Math.abs(netVol).toFixed(3)} m³ ${netVol >= 0 ? '(Cut)' : '(Fill)'}</div>
                </div>
            `;
        }
    );
};

window.deleteSavedVolArea = function(index) {
    window.savedVolAreas.splice(index, 1);
    updateSavedVolAreasUI();
};

window.savedVolBdyLayer = null;

window.drawSavedVolBdys = function() {
    if (!window.leafletMap) return;
    
    if (window.savedVolBdyLayer) {
        window.leafletMap.removeLayer(window.savedVolBdyLayer);
        window.savedVolBdyLayer = null;
    }
    
    let layers = [];
    window.savedVolAreas.forEach((area, index) => {
        let sLatLngs = area.boundary.map(pt => [pt.lat, pt.lon]);
        sLatLngs.push(sLatLngs[0]); 
        layers.push(L.polygon(sLatLngs, { color: '#0ea5e9', weight: 2, fillColor: '#0ea5e9', fillOpacity: 0.15, dashArray: '4, 4' }));
        
        let centerLat = sLatLngs.reduce((sum, pt) => sum + pt[0], 0) / sLatLngs.length;
        let centerLon = sLatLngs.reduce((sum, pt) => sum + pt[1], 0) / sLatLngs.length;
        layers.push(L.marker([centerLat, centerLon], {
            icon: L.divIcon({ className: '', html: `<b style="color:#0369a1; font-size:12px; font-weight:bold; text-shadow: 1px 1px 2px white, -1px -1px 2px white;">Vol BDY ${index + 1}</b>`, iconSize: [80, 15] }), interactive: false
        }));
    });
    
    window.savedVolBdyLayer = L.layerGroup(layers);
    window.toggleVolBdyLayer(); 
};

window.toggleVolBdyLayer = function() {
    if (!window.leafletMap) return;
    
    if (!document.getElementById('vol-bdy-css')) {
        let style = document.createElement('style');
        style.id = 'vol-bdy-css';
        style.innerHTML = `.hide-vol-bdys .vol-bdy-tooltip { opacity: 0 !important; visibility: hidden !important; }`;
        document.head.appendChild(style);
    }

    let chk = document.getElementById('tgl_vol_bdys');
    let volTool = document.getElementById('cogo_vol_tool');
    let isVolActive = (window.activeApp === 4) && volTool && !volTool.classList.contains('hidden');
    let mapCont = document.getElementById('map_container');

    if (chk && chk.checked && isVolActive) {
        if (mapCont) mapCont.classList.remove('hide-vol-bdys'); 
        if (window.savedVolBdyLayer && !window.leafletMap.hasLayer(window.savedVolBdyLayer)) {
            window.leafletMap.addLayer(window.savedVolBdyLayer);
        }
        if (!window._prevChkVolBdy && typeof window.zoomToCustomLayer === 'function' && window.savedVolBdyLayer) {
            window.zoomToCustomLayer(window.savedVolBdyLayer);
        }
        window._prevChkVolBdy = true;
    } else {
        if (mapCont) mapCont.classList.add('hide-vol-bdys'); 
        if (window.savedVolBdyLayer && window.leafletMap.hasLayer(window.savedVolBdyLayer)) {
            window.leafletMap.removeLayer(window.savedVolBdyLayer);
        }
        if (chk && !chk.checked) window._prevChkVolBdy = false;
    }
};

let _oldOpenCogoToolVol = window.openCogoTool;
window.openCogoTool = function(toolName) {
    if(typeof _oldOpenCogoToolVol === 'function') _oldOpenCogoToolVol(toolName);
    setTimeout(window.toggleVolBdyLayer, 100);
};

let _oldCloseCogoToolVol = window.closeCogoTool;
window.closeCogoTool = function() {
    if(typeof _oldCloseCogoToolVol === 'function') _oldCloseCogoToolVol();
    setTimeout(window.toggleVolBdyLayer, 100);
};

let _oldSwitchAppVol = window.switchApp;
window.switchApp = function(n) {
    if(typeof _oldSwitchAppVol === 'function') _oldSwitchAppVol(n);
    setTimeout(window.toggleVolBdyLayer, 100);
};

