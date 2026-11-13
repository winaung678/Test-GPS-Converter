// [split from map_engine.js] lines 2027-2292 | part 6/7 | ထပ်ခွဲထားသည် - load order မပြောင်းရ (app.html ၏ script tag အစီအစဉ်အတိုင်း)
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

