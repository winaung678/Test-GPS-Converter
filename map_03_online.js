// [split from map_engine.js] lines 532-859 | part 3/7 | ထပ်ခွဲထားသည် - load order မပြောင်းရ (app.html ၏ script tag အစီအစဉ်အတိုင်း)
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
        html += `<div style="font-weight:bold; font-size:12px; color:${nameColor}; margin-bottom:2px;">${icon} [ ${window.escHtml(opts.pointName)} ]</div>`;
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
        if (chkLines && chkLines.checked) {
            let _dl = window.dxfLineLayer;
            if (_dl && _dl.isDxfCanvas) {
                // DXF object ကို နှိပ်လျှင် အနီးဆုံး vertex/point/center (screen ၁၄px အတွင်း) သို့မဟုတ် မျဉ်းပေါ်အမှတ်ကို ယူ
                let dp = _dl.pick(e.latlng, 14);
                // Measure mode တွင် node/point/center သို့သာ snap (မျဉ်းပေါ်သို့ မဆွဲ)
                if (dp && (!window.isMeasuring || dp.kind !== 'line')) snapResult = { lat: dp.lat, lon: dp.lon, snapped: true, dxf: dp };
            } else {
                snapResult = getSnapPoint(tapLat, tapLon, currentZoom);
            }
        }
        let finalLat = snapResult.lat; let finalLon = snapResult.lon;

        if (window.isMeasuring) {
            addMeasurePoint(finalLat, finalLon, snapResult);
            return;
        }
        if (window.isLabelDrawing) return;      // Label Line ဆွဲနေချိန် ပုံမှန် coordinate popup မပေါ်စေ

        let coords = window.getDatumCoordsForLatLon(finalLat, finalLon);

        let popupContent = `<div style="text-align:center; padding: 0;">`;
        if (snapResult.dxf) {
            popupContent += window.dxfPickPopupHtml(snapResult.dxf, finalLat, finalLon);
        } else {
        if (snapResult.snapped) {
            let _d = snapResult.dxf;
            let _lbl = !_d ? 'Snapped to DXF Node' : (_d.kind === 'line' ? 'On DXF Line' : (_d.kind === 'center' ? 'DXF Center' : (_d.kind === 'point' ? 'DXF Point' : 'DXF Vertex')));
            popupContent += `<div style="background:#10b981; color:white; font-size:10px; font-weight:bold; padding:1px 3px; border-radius:4px; margin-bottom:3px;">🧲 ${_lbl}</div>`;
            if (_d) popupContent += `<div style="font-size:10px; color:#475569; margin-bottom:3px; white-space:nowrap;">${window.escHtml(_d.type)} · ${window.escHtml(_d.layer)}</div>`;
        }

        if (coords.showLocal) { 
            popupContent += `<b style="font-size:11px; color:#d97706;">[${coords.datumLabel}]</b><br><b style="font-size:12.5px; color:#b91c1c; white-space:nowrap;">N: ${coords.localN.toFixed(3)}<br>E: ${coords.localE.toFixed(3)}</b><hr style="margin:3px 0; border:0.5px solid #ccc;">`; 
        }
        else { popupContent += `<b style="font-size:11px; color:#ef4444; background:#fee2e2; padding:3px; border-radius:4px; display:block; margin-bottom:5px;">⚠️ Out of Local Bounds</b>`; }

        popupContent += `<b style="font-size:11px; color:#1e3a8a; white-space:nowrap;">Lat: ${finalLat.toFixed(7)}<br>Lon: ${finalLon.toFixed(7)}</b>`;
        if (snapResult.dxf && isFinite(snapResult.dxf.z)) { popupContent += `<div style="margin-top:2px; font-size:11px; font-weight:bold; color:#7c3aed; white-space:nowrap;">Z (DXF): ${snapResult.dxf.z.toFixed(3)}</div>`; }
        }
        {   // Geoid N (EGM2008) - map ကို နှိပ်သည့်နေရာအတွက်၊ GPS panel ၏ တန်ဖိုးကို မထိ
            let g = (typeof window.getGeoidN === 'function') ? window.getGeoidN(finalLat, finalLon) : null;
            popupContent += `<div style="margin-top:2px; font-size:11px; font-weight:bold; color:#047857; white-space:nowrap;">${g ? `Geoid N: ${g.n >= 0 ? '+' : ''}${g.n.toFixed(3)} m <span style="font-size:10px; color:#64748b;">(${g.model})</span>` : 'Geoid N: n/a'}</div>`;
        }

        if (window.activeApp === 3 && typeof window.setOutFromMapClick === 'function') {
            popupContent += `<div style="margin-top:3px; display:flex; justify-content:center;">`;
            popupContent += `<button class="so-popup-btn" style="background:#dc2626; padding:4px 10px; font-size:11px;" onclick="setOutFromMapClick(${finalLat}, ${finalLon})">🎯 Set Out Here</button>`;
            popupContent += `</div>`;
        } 

        // 🔴 Profile မျဉ်းဆွဲနေချိန်မှာ Default Popup ထွက်မလာအောင် တားထားမည်
        if (window.activeApp === 4 && (window.isVolDrawing || window.isProfDrawing)) {
            return; 
        }

        else if (window.activeApp === 4 && typeof window.addMapPointToArea === 'function' && !document.getElementById('cogo_area_tool').classList.contains('hidden')) {
            popupContent += `<div style="margin-top:3px; display:flex; justify-content:center;">`;
            popupContent += `<button class="so-popup-btn" style="background:#10b981; padding:4px 10px; font-size:11px;" onclick="addMapPointToArea(${finalLat}, ${finalLon})">➕ Add to Area</button>`;
            popupContent += `</div>`;
        }

        popupContent += `</div>`;
        L.popup(snapResult.dxf ? { maxWidth: 250, minWidth: 150 } : undefined).setLatLng([finalLat, finalLon]).setContent(popupContent).openOn(window.leafletMap);
    });
};
// "Waiting for GPS Location..." + အခြေအနေအလိုက် အကြောင်းရင်း/ဖြေရှင်းနည်း
window.showGpsWaitingAlert = function() {
    let base = "Waiting for GPS Location...";
    let show = function(extra) { alert(base + (extra ? "\n\n" + extra : "")); };
    // (၁) GPS ခလုတ် မဖွင့်ရသေး
    if (!window.isNativeGPSActive) {
        return show("⚠️ GPS is OFF. Tap the \"🛰️ GPS: OFF\" button to turn it on, and make sure Location is enabled on your device.");
    }
    // (၂) GPS ခလုတ် ON ဖြစ်နေပြီး location မရသေး
    let hint = "⚠️ GPS is ON but no location has been received yet. Make sure Location/GPS is enabled on your device, allow the Location permission for this page, and move to an open-sky area.";
    if (typeof window.AndroidNative === 'undefined' && navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(function(r) {
            if (r.state === 'denied') hint = "⚠️ Location permission is BLOCKED for this page. Click the icon beside the address bar \u2192 Location \u2192 Allow, then reload and try again.";
            else if (r.state === 'prompt') hint = "⚠️ Location permission has not been granted yet. Press Allow when the browser asks for Location.";
            show(hint);
        }).catch(function() { show(hint); });
    } else { show(hint); }
};
window.toggleAutoCenter = function() {
    window.isAutoCenter = !window.isAutoCenter;
    let btn = document.getElementById('autoCenterBtn');
    if(window.isAutoCenter) {
        btn.classList.add('active');
        if (window.currentLat !== 0) {
            window.leafletMap.setView([window.currentLat, window.currentLon], 21);
        } else { window.showGpsWaitingAlert(); }
    } else {
        btn.classList.remove('active');
    }
};

