// [split from module_surface_volume.js] lines 1-225 | part 1/8 | ထပ်ခွဲထားသည် - load order မပြောင်းရ (app.html ၏ script tag အစီအစဉ်အတိုင်း)
console.info('[build] module_surface_volume: PF-curve-row fix 2026-11-12');
// ==========================================
// --- TOPO SURFACE & CONTOURS LOGIC ---
// ==========================================

window.topoPoints = []; window.topoTriangles = []; window.topoContours = []; 
window.topoBoundaryPolygon = []; window.topoExcludePolygons = []; window.currentExcludePolygon = []; 
window.isDrawingExclude = false; window.isDrawingBoundary = false;
window.topoPointsLayer = null; window.topoBdyLayer = null; 

window.toggleTopoUI = function() {
    let datum = document.getElementById('topo_datum').value;
    let warnText = document.getElementById('topo_local_warn');
    let customUtmDiv = document.getElementById('topo_custom_utm');
    if (warnText) warnText.style.display = (datum === 'LOCAL') ? 'block' : 'none';
    if (customUtmDiv) customUtmDiv.style.display = (datum === 'GLOBAL_UTM') ? 'flex' : 'none';
};

window.toggleTopoBoundary = function() {
    let method = document.getElementById('topo_bdy_method').value;
    document.getElementById('bdy_max_edge_div').classList.add('hidden');
    document.getElementById('bdy_manual_div').classList.add('hidden');
    if (method === 'max_edge') document.getElementById('bdy_max_edge_div').classList.remove('hidden');
    else if (method === 'manual') document.getElementById('bdy_manual_div').classList.remove('hidden');
    if (window.isDrawingBoundary && method !== 'manual') window.toggleBoundaryDrawMode(); 
    if (window.isDrawingExclude && method !== 'manual') window.toggleExcludeDrawMode(); 
    if (typeof window.syncDrawBar === 'function') window.syncDrawBar();
};

window.loadTopoCSV = function(event) {
    const file = event.target.files[0]; if (!file) return;
    let statBox = document.getElementById('topo_status');
    statBox.style.display = 'block'; statBox.style.color = '#d97706'; statBox.innerText = `⏳ Loading Data...`;
    let formatSel = document.getElementById('topo_csv_format');
    let isPENZD = (formatSel && formatSel.value === 'PENZD');
    const reader = new FileReader();
    reader.onload = function(e) {
        window.topoPoints = []; window.clearManualBoundary(true);
        let lines = e.target.result.split('\n');
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line || line.toUpperCase().includes("POINT") || line.toUpperCase().includes("NAME") || line.toUpperCase().includes("EAST")) continue;
            let cols = line.split(','); if (cols.length < 4) continue;
            let pName = cols[0].trim(); let n, e_val;
            if (isPENZD) { e_val = parseFloat(cols[1]); n = parseFloat(cols[2]); } else { n = parseFloat(cols[1]); e_val = parseFloat(cols[2]); }
            let z = parseFloat(cols[3]) || 0.0; let code_val = cols.length > 4 ? cols[4].trim() : "";
            if (!isNaN(n) && !isNaN(e_val)) { window.topoPoints.push({ p: pName, n: n, e: e_val, z: z, d: code_val }); }
        }
        if (window.topoPoints.length < 3) { statBox.style.color = '#ef4444'; statBox.innerText = `❌ Not enough points! Minimum 3 required.`; return; }
        statBox.style.color = '#10b981'; statBox.innerText = `✅ Loaded ${window.topoPoints.length} points (${isPENZD ? 'PENZD' : 'PNEZD'}).`;
        window.showTopoPointsOnMapOnly(); 
    };
    reader.readAsText(file); event.target.value = '';
};

window.showTopoPointsOnMapOnly = function() {
    let mapDiv = document.getElementById('shared_map_view');
    if(mapDiv) mapDiv.classList.remove('hidden');
    if (!window.leafletMap) window.initMap();
    setTimeout(() => { window.leafletMap.invalidateSize(); }, 300);

    let datum = document.getElementById('topo_datum').value;
    if (datum === 'LOCAL' && window.topoPoints.length > 0) {
        window.localOffsetN = window.topoPoints[0].n; window.localOffsetE = window.topoPoints[0].e;
    }

    if (datum === 'LOCAL') {
        document.getElementById('map_view').style.background = '#0f172a'; 
        let layerCtrl = document.querySelector('.leaflet-control-layers'); if (layerCtrl) layerCtrl.style.display = 'none'; 
        window.leafletMap.eachLayer(function (layer) { if (layer instanceof L.TileLayer) { layer.setOpacity(0); } });
    } else {
        document.getElementById('map_view').style.background = '#ddd'; 
        let layerCtrl = document.querySelector('.leaflet-control-layers'); if (layerCtrl) layerCtrl.style.display = 'block';
        window.leafletMap.eachLayer(function (layer) { if (layer instanceof L.TileLayer) { layer.setOpacity(1); } });
    }

    if (window.topoPointsLayer) { window.topoPointsLayer.clearLayers(); window.leafletMap.removeLayer(window.topoPointsLayer); }
    if (window.topoLayerGroup) { window.topoLayerGroup.clearLayers(); window.leafletMap.removeLayer(window.topoLayerGroup); }
    
    window.topoPointsLayer = L.layerGroup(); if (window.layerOn('tgl_topo_pts')) window.topoPointsLayer.addTo(window.leafletMap);
    if (!window.masterTopoCanvas) window.masterTopoCanvas = L.canvas({ padding: 0.5, pane: 'topoPane' });

    let bounds = [];
    window.topoPoints.forEach(pt => {
        let lat = pt.n, lon = pt.e; 
        if (datum === 'LOCAL') { lat = (pt.n - window.localOffsetN) / 100000; lon = (pt.e - window.localOffsetE) / 100000; }
        else if (datum === "SVY21") { let r = calc_v2_rev(pt.e, pt.n); lat = r.lat; lon = r.lon; }
        else if (datum.startsWith("MM")) { let zone = parseInt(datum.slice(-2)); let r = m_inverse(pt.e, pt.n, zone, m_EVE); let x = m_llh2xyz(r.lat, r.lon, 0, m_EVE); let w = m_xyz2llh(x.x-m_DX, x.y-m_DY, x.z-m_DZ, m_WGS); lat = w.lat; lon = w.lon; }
        else if (datum.startsWith("WGS_UTM")) { let zone = parseInt(datum.slice(-2)); let i = m_inverse(pt.e, pt.n, zone, m_WGS); lat = i.lat; lon = i.lon; }
        else if (datum === "GLOBAL_UTM") { let zInput = document.getElementById('topo_custom_zone'); let hInput = document.getElementById('topo_custom_hemi'); let zone = (zInput && zInput.value) ? parseInt(zInput.value) : 47; let hemi = hInput ? hInput.value : 'N'; let calcN = pt.n; if (hemi === 'S') calcN -= 10000000; let i_w = m_inverse(pt.e, calcN, zone, m_WGS); lat = i_w.lat; lon = i_w.lon; }

        if (!isNaN(lat) && !isNaN(lon)) {
            let marker = L.circleMarker([lat, lon], { radius: 4, color: 'transparent', weight: 20, fillColor: '#3b82f6', fillOpacity: 1, renderer: window.masterTopoCanvas });
            marker.bindTooltip(`${window.escHtml(pt.p)}<br>Z: ${pt.z.toFixed(3)}`, { direction: 'top', className: 'pt-tooltip' });
            
           marker.on('click', function(e) {
                L.DomEvent.stopPropagation(e);
                if (window.isMeasuring) { window.leafletMap.fireEvent('click', {latlng: e.latlng}); return; }
                if (window.isLabelDrawing) { window.labelMapClickListener({ latlng: e.latlng }); return; }

                let isActionTaken = false;
                let topoTool = document.getElementById('cogo_topo_tool');
                if (topoTool && !topoTool.classList.contains('hidden')) {
                    if (window.isDrawingBoundary) { window.topoBoundaryPolygon.push({ n: pt.n, e: pt.e, lat: lat, lon: lon }); window.updateBoundaryDrawUI(); isActionTaken = true; } 
                    else if (window.isDrawingExclude) { window.currentExcludePolygon.push({ n: pt.n, e: pt.e, lat: lat, lon: lon }); window.updateBoundaryDrawUI(); isActionTaken = true; }
                }
                
               let volTool = document.getElementById('cogo_vol_tool');
                if (volTool && !volTool.classList.contains('hidden')) {
                    if (window.isVolDrawing) { window.volBoundaryPts.push({ lat: lat, lon: lon, n: pt.n, e: pt.e, groundZ: pt.z }); if (typeof window.volUpdateBoundaryUI === 'function') window.volUpdateBoundaryUI(); isActionTaken = true; }
                }

                // 🔴 Profile Tool ဖွင့်ထားချိန် Point ပေါ် ထောက်ခဲ့လျှင် (အသစ်ထည့်ရန်)
                let profTool = document.getElementById('cogo_prof_tool');
                if (profTool && !profTool.classList.contains('hidden')) {
                    if (window.isProfDrawing) {
                        window.profDraftPoint = { lat: lat, lon: lon, n: pt.n, e: pt.e, groundZ: pt.z };
                        if (typeof window.profUpdateBoundaryUI === 'function') window.profUpdateBoundaryUI();
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
            window.topoPointsLayer.addLayer(marker); bounds.push([lat, lon]);
        }
    });
    if (bounds.length > 0) window.leafletMap.fitBounds(L.latLngBounds(bounds), {padding: [30, 30], maxZoom: 22});
};

window.toggleExcludeDrawMode = function() {
    if (window.topoPoints.length === 0) return alert("Please Load CSV Points first!");
    if (!window.isDrawingExclude && !window.canStartMapTool('boundary')) return;
    if (window.isDrawingBoundary) window.toggleBoundaryDrawMode();

    window.isDrawingExclude = !window.isDrawingExclude;
    window.drawBarMenuOwner = null;
    if (window.isDrawingExclude) {
        window.currentExcludePolygon = [];
    } else {
        if (window.currentExcludePolygon.length > 2) { window.topoExcludePolygons.push([...window.currentExcludePolygon]); }
        window.currentExcludePolygon = []; window.updateBoundaryDrawUI(true);
    }
    window.syncDrawBar();
};

// Exclude: ယခု area ကို သိမ်းပြီး Mode မထွက်ဘဲ နောက် area ဆက်ဆွဲ
window.excludeNextArea = function() {
    if (!window.isDrawingExclude) return;
    if (window.currentExcludePolygon.length < 3) return alert("An exclude area needs at least 3 points.");
    window.topoExcludePolygons.push([...window.currentExcludePolygon]);
    window.currentExcludePolygon = [];
    window.updateBoundaryDrawUI(true);
};

// Clear (which = 'outer' | 'exclude' | 'both') - Draw mode ဖွင့်ထားလျှင် ဆက်ဖွင့်ထားမည်
window.bdyClear = function(which) {
    window.drawBarMenuOwner = null;
    if (which === 'outer' || which === 'both') window.topoBoundaryPolygon = [];
    if (which === 'exclude' || which === 'both') { window.topoExcludePolygons = []; window.currentExcludePolygon = []; }
    window.updateBoundaryDrawUI(!window.isDrawingBoundary);
};

window.clearExcludeBoundaries = function() { window.topoExcludePolygons = []; window.currentExcludePolygon = []; if (window.isDrawingExclude) window.toggleExcludeDrawMode(); window.updateBoundaryDrawUI(true); };
window.undoExcludeBoundary = function() {
    if (window.currentExcludePolygon && window.currentExcludePolygon.length > 0) { window.currentExcludePolygon.pop(); window.updateBoundaryDrawUI(); }
    else if (window.topoExcludePolygons && window.topoExcludePolygons.length > 0) { window.topoExcludePolygons.pop(); window.updateBoundaryDrawUI(); }   // သိမ်းပြီးသား နောက်ဆုံး area ကို ပြန်ဖျက်
    else { alert("No points to undo."); }
};

window.toggleBoundaryDrawMode = function() {
    if (window.topoPoints.length === 0) return alert("Please Load CSV Points first!");
    if (!window.isDrawingBoundary && !window.canStartMapTool('boundary')) return;
    if (window.isDrawingExclude) window.toggleExcludeDrawMode();

    window.isDrawingBoundary = !window.isDrawingBoundary;
    window.drawBarMenuOwner = null;
    if (!window.isDrawingBoundary) window.updateBoundaryDrawUI(true);
    window.syncDrawBar();
};

window.undoManualBoundary = function() { if (window.topoBoundaryPolygon && window.topoBoundaryPolygon.length > 0) { window.topoBoundaryPolygon.pop(); window.updateBoundaryDrawUI(); } else { alert("No points to undo."); } };
window.clearManualBoundary = function(skipAlert) { window.topoBoundaryPolygon = []; if (window.topoBdyLayer) { window.leafletMap.removeLayer(window.topoBdyLayer); window.topoBdyLayer = null; } if (!skipAlert && window.isDrawingBoundary) window.toggleBoundaryDrawMode(); };

window.updateBoundaryDrawUI = function(isClosed = false) {
    if (!window.leafletMap) return;
    if (window.topoBdyLayer) window.leafletMap.removeLayer(window.topoBdyLayer);

    let layers = [];
    if (window.topoBoundaryPolygon.length > 0) {
        let latlngs = window.topoBoundaryPolygon.map(pt => [pt.lat, pt.lon]);
        if (isClosed && latlngs.length > 2) latlngs.push(latlngs[0]); 
        layers.push(L.polyline(latlngs, { color: '#ef4444', weight: 3, dashArray: '5, 5' }));
        window.topoBoundaryPolygon.forEach(pt => { layers.push(L.circleMarker([pt.lat, pt.lon], {radius: 5, color: '#eab308', fillColor: '#ef4444', fillOpacity: 1, weight: 3, interactive: false})); });
    }

    let allExcludes = [...window.topoExcludePolygons];
    if (window.currentExcludePolygon.length > 0) allExcludes.push(window.currentExcludePolygon);

    allExcludes.forEach(hole => {
        let h_latlngs = hole.map(pt => [pt.lat, pt.lon]);
        if (h_latlngs.length > 2) h_latlngs.push(h_latlngs[0]); 
        layers.push(L.polygon(h_latlngs, { color: '#0284c7', weight: 2, fillColor: '#0ea5e9', fillOpacity: 0.2, dashArray: '4, 4' }));
        hole.forEach(pt => { layers.push(L.circleMarker([pt.lat, pt.lon], {radius: 5, color: '#eab308', fillColor: '#0284c7', fillOpacity: 1, weight: 3, interactive: false})); });
    });

    if (layers.length > 0) window.topoBdyLayer = L.layerGroup(layers).addTo(window.leafletMap);
    if (typeof window.syncDrawBar === 'function') window.syncDrawBar();
};

window.isPointInBoundary = function(n, e, bdyPoints) {
    if (bdyPoints.length < 3) return true; 
    let isInside = false;
    for (let i = 0, j = bdyPoints.length - 1; i < bdyPoints.length; j = i++) {
        let pi = bdyPoints[i]; let pj = bdyPoints[j];
        if (((pi.n > n) !== (pj.n > n)) && (e < (pj.e - pi.e) * (n - pi.n) / (pj.n - pi.n) + pi.e)) { isInside = !isInside; }
    }
    return isInside;
};

