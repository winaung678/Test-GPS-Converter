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

// ==========================================
// CONTOUR CLIPPING (Surface Boundary / Exclude Area)
// Contour မျဉ်းများကို polygon နှင့် အတိအကျ ဖြတ်ညှပ်သည် (triangle တစ်ခုလုံးဖယ်ခြင်းကြောင့် ထွက်နေသော အစွန်းများ မကျန်စေရန်)
//   region = (Boundary အတွင်း) ၏ ပြင်ပ မဟုတ် AND (Exclude polygon တစ်ခုခု၏ အတွင်း မဟုတ်)
// ==========================================
window.segIntersectT = function(a, b, c, d) {
    // မျဉ်း a→b နှင့် c→d ဖြတ်လျှင် a→b ပေါ်က parameter t (0..1) ကိုပြန်ပေး၊ မဖြတ်လျှင် null
    let rx = b.e - a.e, ry = b.n - a.n, sx = d.e - c.e, sy = d.n - c.n;
    let denom = rx * sy - ry * sx;
    if (Math.abs(denom) < 1e-12) return null;
    let qx = c.e - a.e, qy = c.n - a.n;
    let t = (qx * sy - qy * sx) / denom;
    let u = (qx * ry - qy * rx) / denom;
    return (t > 1e-9 && t < 1 - 1e-9 && u >= 0 && u <= 1) ? t : null;
};

window.clipContoursToRegion = function(polylines, boundaryPoly, excludePolys) {
    let hasBdy = boundaryPoly && boundaryPoly.length > 2;
    let holes = (excludePolys || []).filter(h => h && h.length > 2);
    if (!hasBdy && holes.length === 0) return polylines;

    let rings = [];
    if (hasBdy) rings.push(boundaryPoly);
    holes.forEach(h => rings.push(h));

    const inRegion = (n, e) => (!hasBdy || window.isPointInBoundary(n, e, boundaryPoly)) && !holes.some(h => window.isPointInBoundary(n, e, h));
    const lerp = (a, b, t) => ({ e: a.e + (b.e - a.e) * t, n: a.n + (b.n - a.n) * t });

    let out = [];
    polylines.forEach(poly => {
        let cur = [];
        const flush = () => { if (cur.length > 1) out.push({ points: cur, z: poly.z, isMajor: poly.isMajor }); cur = []; };

        for (let i = 0; i < poly.points.length - 1; i++) {
            let a = poly.points[i], b = poly.points[i + 1];

            // ဤ segment ကို polygon အစွန်းများနှင့် ဖြတ်သည့် နေရာတိုင်းမှာ ခွဲသည်
            let ts = [0, 1];
            rings.forEach(ring => {
                for (let k = 0, m = ring.length - 1; k < ring.length; m = k++) {
                    let t = window.segIntersectT(a, b, ring[m], ring[k]);
                    if (t !== null) ts.push(t);
                }
            });
            ts.sort((x, y) => x - y);

            for (let j = 0; j < ts.length - 1; j++) {
                let t0 = ts[j], t1 = ts[j + 1];
                if (t1 - t0 < 1e-9) continue;
                let mid = lerp(a, b, (t0 + t1) / 2);
                if (!inRegion(mid.n, mid.e)) { flush(); continue; }
                let p0 = lerp(a, b, t0), p1 = lerp(a, b, t1);
                if (cur.length > 0) {
                    let last = cur[cur.length - 1];
                    if (Math.hypot(last.e - p0.e, last.n - p0.n) > 1e-6) { flush(); }
                }
                if (cur.length === 0) cur.push(p0);
                cur.push(p1);
            }
        }
        flush();
    });
    return out;
};

window.processTopoSurface = function() {
    if (window.topoPoints.length < 3) return alert("Please load CSV first!");
    let statBox = document.getElementById('topo_status');
    statBox.style.display = 'block'; statBox.style.color = '#d97706'; statBox.innerText = `⏳ Calculating Surface...`;

    window.topoTriangles = generateDelaunayTriangulation(window.topoPoints);
    let contourTriangles = window.topoTriangles;   // Contour ထုတ်ရန် triangle (Boundary/Exclude ကို polygon ဖြင့် အတိအကျ ဖြတ်မည်)
    let bdyMethod = document.getElementById('topo_bdy_method').value;

    if (bdyMethod === 'max_edge') {
        let maxEdge = parseFloat(document.getElementById('topo_max_edge').value) || 30;
        window.topoTriangles = window.topoTriangles.filter(t => {
            let d1 = Math.hypot(t.p1.e - t.p2.e, t.p1.n - t.p2.n); let d2 = Math.hypot(t.p2.e - t.p3.e, t.p2.n - t.p3.n); let d3 = Math.hypot(t.p3.e - t.p1.e, t.p3.n - t.p1.n);
            return (d1 <= maxEdge && d2 <= maxEdge && d3 <= maxEdge);
        });
        contourTriangles = window.topoTriangles;
    } else if (bdyMethod === 'manual' && window.topoBoundaryPolygon.length > 2) {
        window.topoTriangles = window.topoTriangles.filter(t => {
            let centerE = (t.p1.e + t.p2.e + t.p3.e) / 3; let centerN = (t.p1.n + t.p2.n + t.p3.n) / 3;
            return window.isPointInBoundary(centerN, centerE, window.topoBoundaryPolygon);
        });
    }

    if (window.topoExcludePolygons.length > 0) {
        window.topoTriangles = window.topoTriangles.filter(t => {
            let centerE = (t.p1.e + t.p2.e + t.p3.e) / 3; let centerN = (t.p1.n + t.p2.n + t.p3.n) / 3;
            let isInsideHole = false;
            for (let i = 0; i < window.topoExcludePolygons.length; i++) {
                if (window.isPointInBoundary(centerN, centerE, window.topoExcludePolygons[i])) { isInsideHole = true; break; }
            }
            return !isInsideHole; 
        });
    }

    let majorInt = parseFloat(document.getElementById('topo_major_int').value) || 1.0;
    let minorInt = parseFloat(document.getElementById('topo_minor_int').value) || 0.2;
    window.topoContours = generateContours(window.topoPoints, contourTriangles, minorInt, majorInt);
    // Surface Boundary (manual) နှင့် Exclude Area ကို Contour အပေါ် polygon နှင့် အတိအကျ ဖြတ်ညှပ်သည်
    window.topoContours = window.clipContoursToRegion(
        window.topoContours,
        (bdyMethod === 'manual') ? window.topoBoundaryPolygon : [],
        window.topoExcludePolygons
    );

    statBox.style.color = '#10b981'; statBox.innerText = `✅ Success! Surface Generated.`;
    document.getElementById('topo_export_box').classList.remove('hidden');
    if (typeof window.accCollapse === 'function') window.accCollapse(['topo:coord', 'topo:contour', 'topo:layout', 'topo:bdy']);   // Generate ပြီးလျှင် Setting များကို ခေါက်ထားသည် (ပြန်ဖြန့်၍ရ)

    window.showContoursOnMap();
    window.showTinOnMap(); 
};

window.topoContourTextLayer = null;

window.showContoursOnMap = function() {
    if (!window.leafletMap) return;
    if (window.topoLayerGroup) window.leafletMap.removeLayer(window.topoLayerGroup);
    window.topoLayerGroup = L.layerGroup(); if (window.layerOn('tgl_topo_contours')) window.topoLayerGroup.addTo(window.leafletMap);

    let datum = document.getElementById('topo_datum').value;
    let getLatLng = (n, e) => {
        let lat = n, lon = e; 
        if (datum === 'LOCAL') { lat = (n - window.localOffsetN) / 100000; lon = (e - window.localOffsetE) / 100000; }
        else if (datum === "SVY21") { let r = calc_v2_rev(e, n); lat = r.lat; lon = r.lon; }
        else if (datum.startsWith("MM")) { let zone = parseInt(datum.slice(-2)); let r = m_inverse(e, n, zone, m_EVE); let x = m_llh2xyz(r.lat, r.lon, 0, m_EVE); let w = m_xyz2llh(x.x-m_DX, x.y-m_DY, x.z-m_DZ, m_WGS); lat = w.lat; lon = w.lon; }
        else if (datum.startsWith("WGS_UTM")) { let zone = parseInt(datum.slice(-2)); let i = m_inverse(e, n, zone, m_WGS); lat = i.lat; lon = i.lon; }
        else if (datum === "GLOBAL_UTM") { let zInput = document.getElementById('topo_custom_zone'); let hInput = document.getElementById('topo_custom_hemi'); let zone = (zInput && zInput.value) ? parseInt(zInput.value) : 47; let hemi = hInput ? hInput.value : 'N'; let calcN = n; if (hemi === 'S') calcN -= 10000000; let i_w = m_inverse(e, calcN, zone, m_WGS); lat = i_w.lat; lon = i_w.lon; }
        return [lat, lon];
    };

    let majorColorInp = document.getElementById('topo_major_color'); let minorColorInp = document.getElementById('topo_minor_color'); let opacInp = document.getElementById('topo_opacity');
    let mColor = majorColorInp ? majorColorInp.value : '#f59e0b'; let minColor = minorColorInp ? minorColorInp.value : '#b45309'; let opac = opacInp ? parseFloat(opacInp.value) : 1.0;

    window.topoContours.forEach(poly => {
        if (poly.points.length < 2) return;
        let latlngs = [];
        poly.points.forEach(pt => { let ll = getLatLng(pt.n, pt.e); if (!isNaN(ll[0])) latlngs.push(ll); });

       if (latlngs.length > 1) {
            let mapPoly = L.polyline(latlngs, { color: poly.isMajor ? mColor : minColor, weight: poly.isMajor ? 3 : 1, opacity: opac, isMajorRef: poly.isMajor });
            if (poly.isMajor) mapPoly.bindTooltip(`Z: ${poly.z.toFixed(2)}`, { sticky: true });
            window.topoLayerGroup.addLayer(mapPoly);
        }
    });

    // Contour label များကို Label Line ဖြင့်သာ ပြသည် (Label Line မရှိလျှင် မပြ)
    window.refreshContourLabels();
};

window.updateContourStyle = function() {
    if (!window.topoLayerGroup || !window.leafletMap) return;
    let majorColorInp = document.getElementById('topo_major_color'); let minorColorInp = document.getElementById('topo_minor_color'); let opacInp = document.getElementById('topo_opacity');
    if (!majorColorInp || !minorColorInp || !opacInp) return;
    let mColor = majorColorInp.value; let minColor = minorColorInp.value; let opac = parseFloat(opacInp.value);

    window.topoLayerGroup.eachLayer(function(layer) {
        if (layer instanceof L.Polyline) {
            if (layer.options.isMajorRef !== undefined) { layer.setStyle({ color: layer.options.isMajorRef ? mColor : minColor, opacity: opac }); }
        } else if (layer instanceof L.CanvasTextLayer) {
            if (layer._texts) { layer._texts.forEach(t => t.color = (t.major === false) ? minColor : mColor); layer._reset(); }
        }
    });
};

window.showTinOnMap = function() {
    if (!window.leafletMap) return;
    if (window.topoTinLayer) window.leafletMap.removeLayer(window.topoTinLayer);
    window.topoTinLayer = L.layerGroup(); 
    let datum = document.getElementById('topo_datum').value;

    let getLatLng = (n, e) => {
        let lat = n, lon = e; 
        if (datum === 'LOCAL') { lat = (n - window.localOffsetN) / 100000; lon = (e - window.localOffsetE) / 100000; }
        else if (datum === "SVY21") { let r = calc_v2_rev(e, n); lat = r.lat; lon = r.lon; }
        else if (datum.startsWith("MM")) { let zone = parseInt(datum.slice(-2)); let r = m_inverse(e, n, zone, m_EVE); let x = m_llh2xyz(r.lat, r.lon, 0, m_EVE); let w = m_xyz2llh(x.x-m_DX, x.y-m_DY, x.z-m_DZ, m_WGS); lat = w.lat; lon = w.lon; }
        else if (datum.startsWith("WGS_UTM")) { let zone = parseInt(datum.slice(-2)); let i = m_inverse(e, n, zone, m_WGS); lat = i.lat; lon = i.lon; }
        else if (datum === "GLOBAL_UTM") { let zInput = document.getElementById('topo_custom_zone'); let hInput = document.getElementById('topo_custom_hemi'); let zone = (zInput && zInput.value) ? parseInt(zInput.value) : 47; let hemi = hInput ? hInput.value : 'N'; let calcN = n; if (hemi === 'S') calcN -= 10000000; let i_w = m_inverse(e, calcN, zone, m_WGS); lat = i_w.lat; lon = i_w.lon; }
        return [lat, lon];
    };

    window.topoTriangles.forEach(t => {
        let ll1 = getLatLng(t.p1.n, t.p1.e); let ll2 = getLatLng(t.p2.n, t.p2.e); let ll3 = getLatLng(t.p3.n, t.p3.e);
        if (!isNaN(ll1[0]) && !isNaN(ll2[0]) && !isNaN(ll3[0])) {
            let mapPoly = L.polygon([ll1, ll2, ll3], { color: '#64748b', weight: 1, fillColor: '#94a3b8', fillOpacity: 0.1, interactive: false });
            window.topoTinLayer.addLayer(mapPoly);
        }
    });

    let chkTin = document.getElementById('tgl_topo_tin');
    if (chkTin && chkTin.checked) { window.topoTinLayer.addTo(window.leafletMap); }
};

window.exportTopoDXF = function() {
    if (window.topoContours.length === 0 && window.topoPoints.length === 0) return alert("No Topo data generated!");

    let dxf = []; // Array အနေနဲ့ ပြောင်းသုံးထားပါတယ် (Performance အတွက်)
    dxf.push("0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n11"); 
    dxf.push("0\nLAYER\n2\nTOPO_POINTS\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nLAYER\n2\nTOPO_MAJOR_CONTOUR\n70\n0\n62\n2\n6\nCONTINUOUS\n0\nLAYER\n2\nTOPO_MINOR_CONTOUR\n70\n0\n62\n8\n6\nCONTINUOUS\n0\nLAYER\n2\nTOPO_LABELS\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nLAYER\n2\nTOPO_BOUNDARY\n70\n0\n62\n1\n6\nCONTINUOUS\n0\nLAYER\n2\nTOPO_POINT_NO\n70\n0\n62\n1\n6\nCONTINUOUS\n0\nLAYER\n2\nTOPO_POINT_CODES\n70\n0\n62\n3\n6\nCONTINUOUS\n0\nLAYER\n2\nGRID_LINES\n70\n0\n62\n8\n6\nCONTINUOUS\n0\nLAYER\n2\nGRID_TEXT\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nLAYER\n2\nMAP_TITLE\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nLAYER\n2\nNORTH_ARROW\n70\n0\n62\n7\n6\nCONTINUOUS");
    dxf.push("0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES");

    let txtH = parseFloat(document.getElementById('topo_text_height').value) || 0.5; 
    let yOffset = txtH * 0.7; 

    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
    window.topoPoints.forEach(pt => {
        if (pt.e < minE) minE = pt.e; if (pt.e > maxE) maxE = pt.e;
        if (pt.n < minN) minN = pt.n; if (pt.n > maxN) maxN = pt.n;

        let txtE = pt.e + (txtH * 0.3); let currentTxtH = txtH * 0.5; 
        dxf.push(`0\nPOINT\n8\nTOPO_POINTS\n10\n${pt.e.toFixed(3)}\n20\n${pt.n.toFixed(3)}\n30\n${pt.z.toFixed(3)}`);
        if (pt.p && pt.p.trim() !== "") { let ptY = pt.n + yOffset; dxf.push(`0\nTEXT\n8\nTOPO_POINT_NO\n10\n${txtE.toFixed(3)}\n20\n${ptY.toFixed(3)}\n30\n${pt.z.toFixed(3)}\n40\n${currentTxtH}\n1\n${pt.p}`); }
        dxf.push(`0\nTEXT\n8\nTOPO_POINTS\n10\n${txtE.toFixed(3)}\n20\n${pt.n.toFixed(3)}\n30\n${pt.z.toFixed(3)}\n40\n${currentTxtH}\n1\n${pt.z.toFixed(3)}`);
        if (pt.d && pt.d.trim() !== "") { let codeY = pt.n - yOffset; dxf.push(`0\nTEXT\n8\nTOPO_POINT_CODES\n10\n${txtE.toFixed(3)}\n20\n${codeY.toFixed(3)}\n30\n${pt.z.toFixed(3)}\n40\n${currentTxtH}\n1\n${pt.d}`); }
    });

    window.topoContours.forEach(poly => {
        let layer = poly.isMajor ? "TOPO_MAJOR_CONTOUR" : "TOPO_MINOR_CONTOUR";
        dxf.push(`0\nPOLYLINE\n8\n${layer}\n66\n1\n70\n8\n10\n0.0\n20\n0.0\n30\n${poly.z.toFixed(3)}`);
        poly.points.forEach(pt => { dxf.push(`0\nVERTEX\n8\n${layer}\n70\n32\n10\n${pt.e.toFixed(3)}\n20\n${pt.n.toFixed(3)}\n30\n${poly.z.toFixed(3)}`); });
        dxf.push(`0\nSEQEND\n8\n${layer}`);

    });

    // Contour label များ - Label Line နှင့် ဖြတ်သော contour တိုင်းမှာ (Label Line မရှိလျှင် မထည့်)
    window.computeContourLabels(txtH).forEach(l => {
        dxf.push(window.contourLabelDxfEntity(l, txtH, l.z.toFixed(3)));
    });

    if (window.topoBoundaryPolygon && window.topoBoundaryPolygon.length > 2) {
        dxf.push(`0\nPOLYLINE\n8\nTOPO_BOUNDARY\n66\n1\n70\n9\n10\n0.0\n20\n0.0\n30\n0.0`); 
        window.topoBoundaryPolygon.forEach(pt => { dxf.push(`0\nVERTEX\n8\nTOPO_BOUNDARY\n70\n32\n10\n${pt.e.toFixed(3)}\n20\n${pt.n.toFixed(3)}\n30\n0.0`); });
        dxf.push(`0\nSEQEND\n8\nTOPO_BOUNDARY`);
    }

    // Grid Lines & Titles (Keep the same math, just push to array)
    if (window.topoPoints.length > 0) {
        let gridIntervalInp = document.getElementById('topo_grid_interval'); let titleInp = document.getElementById('topo_map_title');
        let interval = gridIntervalInp ? (parseFloat(gridIntervalInp.value) || 50) : 50; let mapTitle = titleInp ? (titleInp.value.trim() || "TOPOGRAPHIC MAP") : "TOPOGRAPHIC MAP";

        let gridMinE = minE - interval; let gridMaxE = maxE + interval; let gridMinN = minN - interval; let gridMaxN = maxN + interval;
        let startE = Math.ceil(gridMinE / interval) * interval; let startN = Math.ceil(gridMinN / interval) * interval;
        // 🔴 [FIX] Grid စာသားနှင့် Title များ ကြီးစေရန် Interval ကို အခြေခံ၍ တွက်ချက်ခြင်း
let gridTxtH = Math.max(2.5, interval * 0.12); // Grid 50 ဆိုလျှင် Text Size 6 ရမည် 

        // 🔴 [FIX] E တန်ဖိုးများကို ထောင်လိုက်ထား၍ ဒသမ ဖြုတ်ခြင်း
        for (let e = startE; e <= gridMaxE; e += interval) {
            let txtE = e + (gridTxtH * 0.3); // မျဉ်းနဲ့ မထပ်အောင် ဘေးနည်းနည်းကပ်သည်
            dxf.push(`0\nLINE\n8\nGRID_LINES\n10\n${e}\n20\n${gridMinN}\n30\n0.0\n11\n${e}\n21\n${gridMaxN}\n31\n0.0`);
            
            // Top E Text (Rotated 90, Align 0=Left)
            dxf.push(`0\nTEXT\n8\nGRID_TEXT\n10\n${txtE}\n20\n${gridMaxN + gridTxtH}\n30\n0.0\n40\n${gridTxtH}\n1\nE ${e.toFixed(0)}\n50\n90.0\n72\n0\n11\n${txtE}\n21\n${gridMaxN + gridTxtH}\n31\n0.0\n73\n2`);
            
            // Bottom E Text (Rotated 90, Align 2=Right)
            dxf.push(`0\nTEXT\n8\nGRID_TEXT\n10\n${txtE}\n20\n${gridMinN - gridTxtH}\n30\n0.0\n40\n${gridTxtH}\n1\nE ${e.toFixed(0)}\n50\n90.0\n72\n2\n11\n${txtE}\n21\n${gridMinN - gridTxtH}\n31\n0.0\n73\n2`);
        }

        // 🔴 [FIX] N တန်ဖိုးများမှ ဒသမ ဖြုတ်ခြင်း
        for (let n = startN; n <= gridMaxN; n += interval) {
            dxf.push(`0\nLINE\n8\nGRID_LINES\n10\n${gridMinE}\n20\n${n}\n30\n0.0\n11\n${gridMaxE}\n21\n${n}\n31\n0.0`);
            
            // Left N Text
            dxf.push(`0\nTEXT\n8\nGRID_TEXT\n10\n${gridMinE - (gridTxtH)}\n20\n${n}\n30\n0.0\n40\n${gridTxtH}\n1\nN ${n.toFixed(0)}\n72\n2\n11\n${gridMinE - (gridTxtH)}\n21\n${n}\n31\n0.0\n73\n2`);
            
            // Right N Text
            dxf.push(`0\nTEXT\n8\nGRID_TEXT\n10\n${gridMaxE + (gridTxtH)}\n20\n${n}\n30\n0.0\n40\n${gridTxtH}\n1\nN ${n.toFixed(0)}\n72\n0\n11\n${gridMaxE + (gridTxtH)}\n21\n${n}\n31\n0.0\n73\n2`);
        }
        
        dxf.push(`0\nPOLYLINE\n8\nGRID_LINES\n66\n1\n70\n1\n10\n0.0\n20\n0.0\n30\n0.0`);
        dxf.push(`0\nVERTEX\n8\nGRID_LINES\n70\n32\n10\n${gridMinE}\n20\n${gridMinN}\n30\n0.0`);
        dxf.push(`0\nVERTEX\n8\nGRID_LINES\n70\n32\n10\n${gridMaxE}\n20\n${gridMinN}\n30\n0.0`);
        dxf.push(`0\nVERTEX\n8\nGRID_LINES\n70\n32\n10\n${gridMaxE}\n20\n${gridMaxN}\n30\n0.0`);
        dxf.push(`0\nVERTEX\n8\nGRID_LINES\n70\n32\n10\n${gridMinE}\n20\n${gridMaxN}\n30\n0.0\n0\nSEQEND\n8\nGRID_LINES`);

        // 🔴 [FIX] Title N ကို (gridTxtH * 10) သို့ မြှင့်တင်ခြင်း
        let titleE = (gridMinE + gridMaxE) / 2; 
        let titleN = gridMaxN + (gridTxtH * 10); 
        let titleTxtH = gridTxtH * 2.5; 
        dxf.push(`0\nTEXT\n8\nMAP_TITLE\n10\n${titleE}\n20\n${titleN}\n30\n0.0\n40\n${titleTxtH}\n1\n${mapTitle}\n72\n1\n11\n${titleE}\n21\n${titleN}\n31\n0.0\n73\n1`);
        
        // North Arrow
        let mapHeight = gridMaxN - gridMinN; let nSize = Math.min(Math.max(mapHeight * 0.08, interval * 0.4), 50); 
        // Arrow ကိုလည်း Title အတိုင်း နည်းနည်းမြှင့်တင်ခြင်း
        let arrBaseE = gridMaxE + (gridTxtH * 8), arrBaseN = gridMaxN - (nSize * 1.5) + (gridTxtH * 4);
        let arrTipE = arrBaseE, arrTipN = arrBaseN + nSize, arrWidth = nSize * 0.25; 
        let arrLeftE = arrBaseE - arrWidth, arrLeftN = arrBaseN + (nSize * 0.3);
        let arrRightE = arrBaseE + arrWidth, arrRightN = arrBaseN + (nSize * 0.3);
        let arrCenterN = arrBaseN + (nSize * 0.3); 

        dxf.push(`0\nLINE\n8\nNORTH_ARROW\n10\n${arrBaseE}\n20\n${arrBaseN}\n30\n0.0\n11\n${arrTipE}\n21\n${arrTipN}\n31\n0.0`);
        dxf.push(`0\nSOLID\n8\nNORTH_ARROW\n10\n${arrTipE}\n20\n${arrTipN}\n30\n0.0\n11\n${arrRightE}\n21\n${arrRightN}\n31\n0.0\n12\n${arrBaseE}\n22\n${arrCenterN}\n32\n0.0\n13\n${arrBaseE}\n23\n${arrCenterN}\n33\n0.0`);
        dxf.push(`0\nLINE\n8\nNORTH_ARROW\n10\n${arrTipE}\n20\n${arrTipN}\n30\n0.0\n11\n${arrLeftE}\n21\n${arrLeftN}\n31\n0.0`);
        dxf.push(`0\nLINE\n8\nNORTH_ARROW\n10\n${arrLeftE}\n20\n${arrLeftN}\n30\n0.0\n11\n${arrBaseE}\n21\n${arrCenterN}\n31\n0.0`);
        let circleRadius = nSize * 0.1;
        dxf.push(`0\nCIRCLE\n8\nNORTH_ARROW\n10\n${arrBaseE}\n20\n${arrBaseN}\n30\n0.0\n40\n${circleRadius}`);
        dxf.push(`0\nTEXT\n8\nNORTH_ARROW\n10\n${arrTipE}\n20\n${arrTipN + (gridTxtH * 0.8)}\n30\n0.0\n40\n${gridTxtH * 1.5}\n1\nN\n72\n1\n11\n${arrTipE}\n21\n${arrTipN + (gridTxtH * 0.8)}\n31\n0.0\n73\n1`);
    }
    dxf.push("0\nENDSEC\n0\nEOF");
    
    let dxfContent = window.dxfPostProcess(dxf.join("\n"), {});     // Extents + initial view + scale bar + north arrow

    let fileName = `3D_Topo_Map_With_Grid_${new Date().getTime()}.dxf`;
    let mimeType = 'application/dxf';
    if (typeof triggerDownloadWithAd === 'function') { triggerDownloadWithAd(dxfContent, fileName, mimeType); } 
    else {
        if (window.AndroidNative && window.AndroidNative.downloadConvertedCSV) { window.AndroidNative.downloadConvertedCSV(dxfContent, fileName); } 
        else { let blob = new Blob([dxfContent], { type: mimeType }); let url = URL.createObjectURL(blob); let a = document.createElement("a"); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
    }
};

window.toggleTopoLayers = function() {
    if (!window.leafletMap) return;

    if (window.topoPointsLayer) {
        let chkPts = document.getElementById('tgl_topo_pts');
        if (chkPts && chkPts.checked) {
            if (!window.leafletMap.hasLayer(window.topoPointsLayer)) { window.leafletMap.addLayer(window.topoPointsLayer); }
            if (!window._prevChkTopoPts && typeof window.zoomToCustomLayer === 'function') window.zoomToCustomLayer(window.topoPointsLayer);
            window._prevChkTopoPts = true;
        } else {
            window.leafletMap.removeLayer(window.topoPointsLayer);
            window._prevChkTopoPts = false;
        }
    }

    if (window.topoLayerGroup) {
        let chkContour = document.getElementById('tgl_topo_contours');
        if (chkContour && chkContour.checked) {
            if (!window.leafletMap.hasLayer(window.topoLayerGroup)) { window.leafletMap.addLayer(window.topoLayerGroup); }
            if (!window._prevChkContour && typeof window.zoomToCustomLayer === 'function') window.zoomToCustomLayer(window.topoLayerGroup);
            window._prevChkContour = true;
        } else {
            window.leafletMap.removeLayer(window.topoLayerGroup);
            window._prevChkContour = false;
        }
    }

    if (window.topoTinLayer) {
        let chkTin = document.getElementById('tgl_topo_tin');
        if (chkTin && chkTin.checked) {
            if (!window.leafletMap.hasLayer(window.topoTinLayer)) { window.leafletMap.addLayer(window.topoTinLayer); }
        } else { window.leafletMap.removeLayer(window.topoTinLayer); }
    }

    if (window.volSurface2Layer) {
        let chkSurf2 = document.getElementById('tgl_surf2_pts');
        if (chkSurf2 && chkSurf2.checked) {
            if (!window.leafletMap.hasLayer(window.volSurface2Layer)) { window.leafletMap.addLayer(window.volSurface2Layer); }
            if (!window._prevChkSurf2 && typeof window.zoomToCustomLayer === 'function') window.zoomToCustomLayer(window.volSurface2Layer);
            window._prevChkSurf2 = true;
        } else {
            window.leafletMap.removeLayer(window.volSurface2Layer);
            window._prevChkSurf2 = false;
        }
    }
};

window.clearTopoData = function() {
    if (!confirm("Are you sure you want to clear all Topo data and map?")) return;
    
    window.topoPoints = []; window.topoTriangles = []; window.topoContours = []; window.topoExcludePolygons = []; window.topoContourTextLayer = null; 
    window.volPoints = []; window.volTriangles = []; window.volBoundaryPts = []; window.volSurface2Points = []; window.volSurface2Triangles = [];
    
    if (window.topoPointsLayer) { window.topoPointsLayer.clearLayers(); window.leafletMap.removeLayer(window.topoPointsLayer); }
    if (window.topoLayerGroup) { window.topoLayerGroup.clearLayers(); window.leafletMap.removeLayer(window.topoLayerGroup); }
    if (window.topoTinLayer) { window.topoTinLayer.clearLayers(); window.leafletMap.removeLayer(window.topoTinLayer); } 
    if (window.volSurface2Layer) { window.volSurface2Layer.clearLayers(); window.leafletMap.removeLayer(window.volSurface2Layer); window.volSurface2Layer = null; }
    
    window.clearManualBoundary(true);
    if (typeof window.clearVolBoundary === 'function') window.clearVolBoundary(true);
    if (window.isLabelDrawing && typeof window.stopLabelLineDraw === 'function') window.stopLabelLineDraw(true);
    if (typeof window.clearLabelLines === 'function') window.clearLabelLines(true);
    
    document.getElementById('topo_export_box').classList.add('hidden');
    let statBox = document.getElementById('topo_status'); statBox.style.display = 'none'; statBox.innerText = '';
    
    let mapDiv = document.getElementById('shared_map_view'); if (mapDiv) mapDiv.classList.add('hidden');
};

// 🔴 Shared Map Undo (Profile အတွက်ပါ ပေါင်းထည့်ထားသည်)
window.handleSharedMapUndo = function() {
    if (window.isLabelDrawing) {
        if (typeof window.undoLabelLine === 'function') window.undoLabelLine();
    }
    else if (window.isProfDrawing) { 
        if (typeof window.undoProfCenterline === 'function') window.undoProfCenterline(); 
    } 
    else if (window.isVolDrawing) { 
        if (typeof window.undoVolBoundary === 'function') window.undoVolBoundary(); 
    } 
    else if (window.isDrawingBoundary) { 
        if (typeof window.undoManualBoundary === 'function') window.undoManualBoundary(); 
    } 
    else if (window.isDrawingExclude) { 
        if (typeof window.undoExcludeBoundary === 'function') window.undoExcludeBoundary(); 
    }
};

// ==========================================
// --- 3D TIN SURFACE VIEWER & 3D DXF EXPORT ---
// ==========================================

window.update3DScale = function(val) {
    let displayVal = document.getElementById('z_scale_val');
    if (displayVal) displayVal.innerText = parseFloat(val).toFixed(1) + 'x';
    if (document.getElementById('plotly_3d_div')) {
        Plotly.relayout('plotly_3d_div', { 'scene.aspectratio.z': parseFloat(val) });
    }
};

window.view3DSurface = function() {
    if (!window.topoPoints || window.topoPoints.length < 3 || !window.topoTriangles || window.topoTriangles.length === 0) {
        return alert("⚠️ Please generate Topo Surface first!");
    }

    let modal = document.getElementById('topo3dModal');
    modal.style.display = 'flex';
    
    // (၁) အပေါ်ယံ မျက်နှာပြင် (Top Surface) 
    let top_x = [], top_y = [], top_z = [];
    let top_i = [], top_j = [], top_k = [];
    let ptMap = new Map();
    let ptIndex = 0;
    let originalPts = [];

    function getPtIdx(pt) {
        let key = `${pt.e.toFixed(3)}_${pt.n.toFixed(3)}_${pt.z.toFixed(3)}`;
        if(!ptMap.has(key)) {
            ptMap.set(key, ptIndex);
            top_x.push(pt.e); top_y.push(pt.n); top_z.push(pt.z);
            originalPts.push(pt); ptIndex++;
        }
        return ptMap.get(key);
    }

    window.topoTriangles.forEach(t => {
        top_i.push(getPtIdx(t.p1)); 
        top_j.push(getPtIdx(t.p2)); 
        top_k.push(getPtIdx(t.p3));
    });

    let topSurfaceTrace = {
        type: 'mesh3d', x: top_x, y: top_y, z: top_z, i: top_i, j: top_j, k: top_k,
        intensity: top_z, colorscale: 'Jet', showscale: true,
        colorbar: { title: 'Elevation (m)', titleside: 'right', tickfont: {color: '#ffffff'}, titlefont: {color: '#ffffff'} },
        flatshading: true, contour: { show: true, color: '#ffffff', width: 2 }, name: 'Surface'
    };

    // (၂) ဘေးဘောင် နံရံများ (Skirt / Walls) 
    let minZ = Math.min(...top_z); 
    let maxZ = Math.max(...top_z);
    let zRange = maxZ - minZ; 
    let baseZ = minZ - (zRange * 0.15); 
    if (zRange === 0) baseZ = minZ - 5; 

    let edgeCount = new Map();
    function getEdgeKey(idx1, idx2) { return idx1 < idx2 ? `${idx1}_${idx2}` : `${idx2}_${idx1}`; }

    for (let t = 0; t < top_i.length; t++) {
        let edges = [[top_i[t], top_j[t]], [top_j[t], top_k[t]], [top_k[t], top_i[t]]];
        edges.forEach(edge => {
            let key = getEdgeKey(edge[0], edge[1]);
            edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
        });
    }

    let wall_x = [], wall_y = [], wall_z = [];
    let wall_i = [], wall_j = [], wall_k = [];
    let wallIdx = 0;

    edgeCount.forEach((count, key) => {
        if (count === 1) { 
            let indices = key.split('_');
            let ptA = originalPts[parseInt(indices[0])];
            let ptB = originalPts[parseInt(indices[1])];

            wall_x.push(ptA.e, ptB.e, ptB.e, ptA.e); 
            wall_y.push(ptA.n, ptB.n, ptB.n, ptA.n); 
            wall_z.push(ptA.z, ptB.z, baseZ, baseZ);
            
            wall_i.push(wallIdx, wallIdx); 
            wall_j.push(wallIdx + 1, wallIdx + 2); 
            wall_k.push(wallIdx + 2, wallIdx + 3);
            
            wallIdx += 4; 
        }
    });

    let wallTrace = {
        type: 'mesh3d', x: wall_x, y: wall_y, z: wall_z, i: wall_i, j: wall_j, k: wall_k,
        color: '#94a3b8', flatshading: true, hoverinfo: 'none', name: 'Base Wall'
    };

    // (၃) အမြဲတမ်းပေါ်နေမည့် Contours မျဉ်းများ
    let cx = [], cy = [], cz = [];
    if (window.topoContours && window.topoContours.length > 0) {
        window.topoContours.forEach(poly => {
            poly.points.forEach(pt => { cx.push(pt.e); cy.push(pt.n); cz.push(poly.z); });
            cx.push(null); cy.push(null); cz.push(null); 
        });
    }

    let contourTrace = { type: 'scatter3d', mode: 'lines', x: cx, y: cy, z: cz, line: { color: '#000000', width: 2 }, hoverinfo: 'none', showlegend: false };

    // (၄) 3D Plotly Render လုပ်ခြင်း
    let zScaleInput = document.getElementById('topo_z_scale');
    let initialZScale = zScaleInput ? parseFloat(zScaleInput.value) : 0.5;

    let layout = {
        paper_bgcolor: '#1e293b', margin: {l: 0, r: 0, b: 0, t: 0},
        scene: {
            xaxis: {title: 'Easting (X)', color: '#fff', gridcolor: '#475569', tickformat: '.0f'},
            yaxis: {title: 'Northing (Y)', color: '#fff', gridcolor: '#475569', tickformat: '.0f'},
            zaxis: {title: 'Elevation (Z)', color: '#fff', gridcolor: '#475569', tickformat: '.2f'},
            aspectratio: { x: 1, y: 1, z: initialZScale },
            camera: { eye: {x: -1.25, y: -1.25, z: 1.25} }
        }
    };

    let plotData = [topSurfaceTrace];
    if (wall_i.length > 0) plotData.push(wallTrace); 
    if (cx.length > 0) plotData.push(contourTrace); 

    let customCamIcon = {
        width: 1792, ascent: 1792, descent: 0,
        path: 'M896 672q119 0 203.5 84.5t84.5 203.5-84.5 203.5-203.5 84.5-203.5-84.5-84.5-203.5 84.5-203.5 203.5-84.5zm0 384q66 0 113-47t47-113-47-113-113-47-113 47-47 113 47 113 113 47zm416-288q0-13-10-23t-22-10h-160q-13 0-23 10t-10 23v64q0 13 10 23t23 10h160q13 0 23-10t10-23v-64zm416 160v448q0 106-75 181t-181 75h-1152q-106 0-181-75t-75-181v-448q0-106 75-181t181-75h224l51-136q19-49 69.5-84.5t103.5-35.5h256q53 0 103.5 35.5t69.5 84.5l51 136h224q106 0 181 75t75 181z'
    };

    Plotly.newPlot('plotly_3d_div', plotData, layout, {
        responsive: true,
        displayModeBar: true,
        modeBarButtonsToRemove: ['toImage'], 
        modeBarButtonsToAdd: [{
            name: 'Download Exact 3D View as PNG',
            icon: customCamIcon,
            click: function(gd) {
                let currentLayout = gd.layout;
                let currentScene = currentLayout.scene || {};
                let currentCamera = currentScene.camera || { eye: {x: -1.25, y: -1.25, z: 1.25} };
                let zInput = document.getElementById('topo_z_scale');
                let currentZScale = zInput ? parseFloat(zInput.value) : 0.5;

                let exportLayout = {
                    scene: { camera: currentCamera, aspectratio: { x: 1, y: 1, z: currentZScale }, xaxis: currentScene.xaxis, yaxis: currentScene.yaxis, zaxis: currentScene.zaxis },
                    paper_bgcolor: '#1e293b', margin: {l: 0, r: 0, b: 0, t: 0}
                };

                Plotly.toImage(gd, {format: 'png', width: 1200, height: 800, layout: exportLayout}).then(function(dataUrl) {
                    let fileName = `3D_Topo_Map_${new Date().getTime()}.png`;
                    if (window.AndroidNative && window.AndroidNative.downloadPlotlyImage) {
                        window.AndroidNative.downloadPlotlyImage(dataUrl, fileName);
                    } else {
                        let a = document.createElement('a'); 
                        a.href = dataUrl; 
                        a.download = fileName; 
                        document.body.appendChild(a); 
                        a.click(); 
                        document.body.removeChild(a);
                    }
                });
            }
        }]
    });
};

// ==========================================
// --- AutoCAD အတွက် 3D Surface (3DFACE) DXF Export ထုတ်ခြင်း ---
// ==========================================
window.export3DTinDXF = function() {
    if (!window.topoTriangles || window.topoTriangles.length === 0) {
        return alert("⚠️ No 3D Triangles generated. Please generate Topo first!");
    }

    let dxf = "0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n";
    dxf += "0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n2\n"; 
    dxf += "0\nLAYER\n2\nTOPO_3D_TIN_SURFACE\n70\n0\n62\n3\n6\nCONTINUOUS\n"; 
    dxf += "0\nENDTAB\n0\nENDSEC\n";
    dxf += "0\nSECTION\n2\nENTITIES\n";

    window.topoTriangles.forEach(t => {
        dxf += "0\n3DFACE\n";
        dxf += "8\nTOPO_3D_TIN_SURFACE\n";
        dxf += `10\n${t.p1.e.toFixed(3)}\n20\n${t.p1.n.toFixed(3)}\n30\n${t.p1.z.toFixed(3)}\n`;
        dxf += `11\n${t.p2.e.toFixed(3)}\n21\n${t.p2.n.toFixed(3)}\n31\n${t.p2.z.toFixed(3)}\n`;
        dxf += `12\n${t.p3.e.toFixed(3)}\n22\n${t.p3.n.toFixed(3)}\n32\n${t.p3.z.toFixed(3)}\n`;
        dxf += `13\n${t.p3.e.toFixed(3)}\n23\n${t.p3.n.toFixed(3)}\n33\n${t.p3.z.toFixed(3)}\n`;
    });

    dxf += "0\nENDSEC\n0\nEOF\n";
    dxf = window.dxfPostProcess(dxf, {});

    let fileName = `3D_TIN_Surface_${new Date().getTime()}.dxf`;
    let mimeType = 'application/dxf';

    if (window.AndroidNative && window.AndroidNative.downloadConvertedCSV) {
        window.AndroidNative.downloadConvertedCSV(dxf, fileName);
    } else {
        let blob = new Blob([dxf], { type: mimeType });
        let url = URL.createObjectURL(blob); 
        let a = document.createElement("a");
        a.href = url; a.download = fileName; 
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
};

// ==========================================
// --- GOOGLE EARTH 3D KML EXPORT (CONTOURS & POINTS) ---
// ==========================================
window.exportTopo3DKML = function() {
    if ((!window.topoContours || window.topoContours.length === 0) && (!window.topoPoints || window.topoPoints.length === 0)) {
        return alert("⚠️ No Topo data to export. Please generate surface first!");
    }

    let datum = document.getElementById('topo_datum') ? document.getElementById('topo_datum').value : "WGS_LL";
    
    if (datum === 'LOCAL') {
        let conf = confirm("⚠️ You are using Local Grid.\nGoogle Earth uses global Lat/Lon (WGS84).\nThe map will likely show up in the ocean (Null Island) or an offset location.\nDo you still want to export?");
        if (!conf) return;
    }

    let getLatLng = (n, e) => {
        let lat = n, lon = e; 
        if (datum === 'LOCAL') {
            lat = (n - window.localOffsetN) / 100000;
            lon = (e - window.localOffsetE) / 100000;
        } else if (datum === "SVY21") { 
            let r = calc_v2_rev(e, n); lat = r.lat; lon = r.lon; 
        } else if (datum.startsWith("MM")) {
            let zone = parseInt(datum.slice(-2)); let r = m_inverse(e, n, zone, m_EVE); 
            let x = m_llh2xyz(r.lat, r.lon, 0, m_EVE); let w = m_xyz2llh(x.x-m_DX, x.y-m_DY, x.z-m_DZ, m_WGS);
            lat = w.lat; lon = w.lon;
        } else if (datum.startsWith("WGS_UTM")) { 
            let zone = parseInt(datum.slice(-2)); let i = m_inverse(e, n, zone, m_WGS); lat = i.lat; lon = i.lon; 
        } else if (datum === "GLOBAL_UTM") {
            let zInput = document.getElementById('topo_custom_zone'); let hInput = document.getElementById('topo_custom_hemi');
            let zone = (zInput && zInput.value) ? parseInt(zInput.value) : 47; 
            let hemi = hInput ? hInput.value : 'N'; 
            let calcN = n; if (hemi === 'S') calcN -= 10000000; 
            let i_w = m_inverse(e, calcN, zone, m_WGS); lat = i_w.lat; lon = i_w.lon;
        }
        return { lat: lat, lon: lon };
    };

    let kmlString = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>3D Topo Surface (GPS Converter)</name>
    <description>3D Points and Contours exported from GPS Converter</description>
    <Style id="majorContour"><LineStyle><color>ff0b9ef5</color><width>2.5</width></LineStyle></Style>
    <Style id="minorContour"><LineStyle><color>ff0953b4</color><width>1.0</width></LineStyle></Style>
    <Style id="ptStyle"><IconStyle><scale>0.6</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle><LabelStyle><scale>0.7</scale></LabelStyle></Style>
    <Folder>
      <name>Survey Points</name>\n`;

    if (window.topoPoints && window.topoPoints.length > 0) {
        window.topoPoints.forEach(pt => {
            let ll = getLatLng(pt.n, pt.e);
            if (!isNaN(ll.lat) && !isNaN(ll.lon)) {
                let safeName = pt.p ? pt.p.replace(/&/g, "&amp;").replace(/</g, "&lt;") : "Pt";
                let safeDesc = pt.d ? pt.d.replace(/&/g, "&amp;").replace(/</g, "&lt;") : "";
                kmlString += `      <Placemark>
        <name>${safeName}</name>
        <description>Z: ${pt.z.toFixed(3)}\nCode: ${safeDesc}</description>
        <styleUrl>#ptStyle</styleUrl>
        <Point>
          <altitudeMode>clampToGround</altitudeMode>
          <coordinates>${ll.lon},${ll.lat},${pt.z}</coordinates>
        </Point>
      </Placemark>\n`;
            }
        });
    }

    kmlString += `    </Folder>\n    <Folder>\n      <name>3D Contours</name>\n`;

    if (window.topoContours && window.topoContours.length > 0) {
        window.topoContours.forEach(poly => {
            if (poly.points.length < 2) return;
            let styleId = poly.isMajor ? "#majorContour" : "#minorContour";
            let coordsStr = "";
            poly.points.forEach(pt => {
                let ll = getLatLng(pt.n, pt.e);
                if (!isNaN(ll.lat) && !isNaN(ll.lon)) coordsStr += `${ll.lon},${ll.lat},${poly.z} `;
            });
            if (coordsStr.trim().length > 0) {
                kmlString += `      <Placemark>
        <name>${poly.z.toFixed(2)} m</name>
        <styleUrl>${styleId}</styleUrl>
        <LineString>
          <altitudeMode>clampToGround</altitudeMode>
          <coordinates>${coordsStr.trim()}</coordinates>
        </LineString>
      </Placemark>\n`;
            }
        });
    }

    kmlString += `    </Folder>\n  </Document>\n</kml>`;

    let fileName = `3D_Topo_Surface_${new Date().getTime()}.kml`;
    if (window.AndroidNative && window.AndroidNative.downloadConvertedKML) { 
        window.AndroidNative.downloadConvertedKML(kmlString, fileName); 
    } else { 
        let blob = new Blob([kmlString], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8;' }); 
        let link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = fileName; 
        document.body.appendChild(link); link.click(); document.body.removeChild(link); 
    }
};
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

// ==========================================
// --- VOLUME CALCULATION (WEB WORKER + OPTIMIZED) ---
// ==========================================

const volumeWorkerScript = `
    function isPointInVolumeBoundary(n, e, boundaryPts) {
        let isInside = false;
        for (let i = 0, j = boundaryPts.length - 1; i < boundaryPts.length; j = i++) {
            let pi = boundaryPts[i]; let pj = boundaryPts[j];
            if (((pi.n > n) !== (pj.n > n)) && (e < (pj.e - pi.e) * (n - pi.n) / (pj.n - pi.n) + pi.e)) {
                isInside = !isInside;
            }
        }
        return isInside;
    }

    function getZFromTIN(n, e, triangles) {
        for (let i=0; i<triangles.length; i++) {
            let t = triangles[i];
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

    self.onmessage = function(e) {
        const data = e.data;
        let gridSize = data.gridSize;
        let gridArea = gridSize * gridSize;
        
        let rawMinN = Math.min(...data.boundaryPts.map(p => p.n));
        let rawMaxN = Math.max(...data.boundaryPts.map(p => p.n));
        let rawMinE = Math.min(...data.boundaryPts.map(p => p.e));
        let rawMaxE = Math.max(...data.boundaryPts.map(p => p.e));

        let startN = Math.floor(rawMinN / gridSize) * gridSize;
        let endN = Math.ceil(rawMaxN / gridSize) * gridSize;
        let startE = Math.floor(rawMinE / gridSize) * gridSize;
        let endE = Math.ceil(rawMaxE / gridSize) * gridSize;

        let rawCut = 0, rawFill = 0, cutArea = 0, fillArea = 0;
        let mapCells = []; 

        let prepTriangles = (tris) => {
            for(let i=0; i<tris.length; i++) {
                tris[i].minN = Math.min(tris[i].p1.n, tris[i].p2.n, tris[i].p3.n);
                tris[i].maxN = Math.max(tris[i].p1.n, tris[i].p2.n, tris[i].p3.n);
                tris[i].minE = Math.min(tris[i].p1.e, tris[i].p2.e, tris[i].p3.e);
                tris[i].maxE = Math.max(tris[i].p1.e, tris[i].p2.e, tris[i].p3.e);
            }
        };
        prepTriangles(data.triangles);
        if(data.targetTriangles && data.targetTriangles.length > 0) prepTriangles(data.targetTriangles);

        let numRows = Math.round((endN - startN) / gridSize) + 1;
        let numCols = Math.round((endE - startE) / gridSize) + 1;
        let totalSteps = numRows * numCols;
        let currentStep = 0;
        let lastPercent = 0;

        for (let r = 0; r < numRows; r++) {
            let n = startN + (r * gridSize);
            
            for (let c = 0; c < numCols; c++) {
                let e = startE + (c * gridSize);
                currentStep++;
                
                let percent = Math.floor((currentStep / totalSteps) * 100);
                if (percent > lastPercent && percent % 5 === 0) {
                    self.postMessage({ type: 'progress', percent: percent });
                    lastPercent = percent;
                }

                let cellN = n + (gridSize / 2);
                let cellE = e + (gridSize / 2);

                if (isPointInVolumeBoundary(cellN, cellE, data.boundaryPts)) {
                    let groundZ = getZFromTIN(cellN, cellE, data.triangles);
                    if (groundZ !== null) {
                        let targetZ = null;
                        if (data.baseType === 'flat') targetZ = data.targetLevels[0].z;
                        else if (data.baseType === 'variable') targetZ = getZFromTIN(cellN, cellE, data.targetTriangles);
                        else if (data.baseType === 'surface2') targetZ = getZFromTIN(cellN, cellE, data.targetLevels);

                        if (targetZ !== null) {
                            let diff = groundZ - targetZ; 
                            let vol = Math.abs(diff) * gridArea;

                            if (diff > 0.001) { 
                                rawCut += vol; cutArea += gridArea; 
                                mapCells.push({ e: cellE, n: cellN, type: 1 }); 
                            } 
                            else if (diff < -0.001) { 
                                rawFill += vol; fillArea += gridArea; 
                                mapCells.push({ e: cellE, n: cellN, type: 3 }); 
                            }
                        }
                    }
                }
            }
        }

        let adjCut = rawCut * (1 + (data.swellPct / 100));
        let adjFill = rawFill * (1 + (data.shrinkPct / 100));

        self.postMessage({
            type: 'done',
            result: {
                cutVol: adjCut, fillVol: adjFill, netVol: adjCut - adjFill, 
                rawCut: rawCut, rawFill: rawFill, 
                cutArea: cutArea, fillArea: fillArea, totalArea: cutArea + fillArea,
                gridSize: gridSize, swellPct: data.swellPct, shrinkPct: data.shrinkPct,
                mapCells: mapCells 
            }
        });
    };
`;

function runVolumeWorker(triangles, boundaryPts, targetLevels, baseType, customGrid, customSwell, customShrink, onProgress, onComplete) {
    let gridSize = customGrid > 0.01 ? customGrid : 0.5;
    let swellPct = customSwell || 0;
    let shrinkPct = customShrink || 0;

    let targetTriangles = [];
    if (baseType === 'variable' && typeof generateDelaunayTriangulation === 'function') {
        targetTriangles = generateDelaunayTriangulation(targetLevels);
    }

    const blob = new Blob([volumeWorkerScript], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));

    worker.onmessage = function(e) {
        if (e.data.type === 'progress') {
            if (onProgress) onProgress(e.data.percent);
        } else if (e.data.type === 'done') {
            worker.terminate(); 
            if (onComplete) onComplete(e.data.result);
        }
    };

    worker.postMessage({
        triangles: triangles, boundaryPts: boundaryPts, targetLevels: targetLevels, targetTriangles: targetTriangles,
        baseType: baseType, gridSize: gridSize, swellPct: swellPct, shrinkPct: shrinkPct
    });
}

window.calcVolume = function() {
    if (window.volBoundaryPts && window.volBoundaryPts.length >= 3) {
        let prevCount = window.savedVolAreas ? window.savedVolAreas.length : 0;
        
        if (typeof window.saveCurrentVolArea === 'function') {
            window.saveCurrentVolArea();
        }

        if (window.savedVolAreas && window.savedVolAreas.length === prevCount) {
            return; 
        }
    }

    if (typeof window.savedVolAreas === 'undefined') window.savedVolAreas = [];
    let areasToCalc = [...window.savedVolAreas];

    if (areasToCalc.length === 0) return alert("⚠️ No valid areas to calculate. Please draw a boundary and enter target levels.");

    document.getElementById('vol_result_box').classList.remove('hidden');
    let summaryBox = document.getElementById('vol_summary');
    
    summaryBox.innerHTML = `
        <div style="text-align:center; color:#d97706; padding:10px;">
            <b>⏳ Preparing Data...</b><br>
            <div style="width:100%; background:#e2e8f0; border-radius:10px; height:10px; margin-top:10px; overflow:hidden;">
                <div id="vol_progress_bar" style="width:0%; height:100%; background:#10b981; transition:width 0.2s;"></div>
            </div>
            <div id="vol_progress_text" style="font-size:12px; margin-top:5px; color:#1e40af; font-weight:bold;">0%</div>
        </div>`;

    let grandTotalArea = 0, grandCutVol = 0, grandFillVol = 0;
    let grandRawCut = 0, grandRawFill = 0;
    let grandCutArea = 0, grandFillArea = 0; 
    let reportDetails = "";
    window.latestVolResultsArray = []; 
    let currentIndex = 0;

    function processNextArea() {
        if (currentIndex >= areasToCalc.length) {
            let grandNetVol = grandCutVol - grandFillVol;
            let html = `
                <div style="font-weight:bold; font-size:15px; text-align:center; color:#1e40af; border-bottom:1px solid #10b981; padding-bottom:5px; margin-bottom:10px;">📊 Earthwork Volume Report</div>
                ${areasToCalc.length > 1 ? reportDetails : ''}
                <table style="width:100%; border-collapse: collapse; margin-top:5px; font-size:13px;">
                    <tr><td style="padding:4px 0;"><b>Total Area:</b></td><td style="padding:4px 0; text-align:right; font-weight:bold;">${grandTotalArea.toFixed(2)} m²</td></tr>
                    <tr><td style="padding:4px 0; color:#ef4444;"><b>Cut Area:</b></td><td style="padding:4px 0; text-align:right; color:#ef4444;">${grandCutArea.toFixed(2)} m²</td></tr>
                    <tr><td style="padding:4px 0; color:#059669; border-bottom:1px solid #cbd5e1;"><b>Fill Area:</b></td><td style="padding:4px 0; text-align:right; color:#059669; border-bottom:1px solid #cbd5e1;">${grandFillArea.toFixed(2)} m²</td></tr>
                    
                    <tr style="background:rgba(239,68,68,0.05);"><td style="padding:4px 0; color:#ef4444;"><b>Total Raw Cut:</b></td><td style="padding:4px 0; text-align:right; color:#ef4444;">${grandRawCut.toFixed(3)} m³</td></tr>
                    <tr style="background:rgba(239,68,68,0.1);"><td style="padding:4px 0; border-bottom:1px solid #fca5a5;"><b>Adjusted Cut:</b></td><td style="padding:4px 0; border-bottom:1px solid #fca5a5; text-align:right; color:#b91c1c; font-weight:bold; font-size:15px;">${grandCutVol.toFixed(3)} m³</td></tr>
                    <tr style="background:rgba(16,185,129,0.05);"><td style="padding:4px 0; color:#059669;"><b>Total Raw Fill:</b></td><td style="padding:4px 0; text-align:right; color:#059669;">${grandRawFill.toFixed(3)} m³</td></tr>
                    <tr style="background:rgba(16,185,129,0.1);"><td style="padding:4px 0; border-bottom:1px solid #6ee7b7;"><b>Adjusted Fill:</b></td><td style="padding:4px 0; border-bottom:1px solid #6ee7b7; text-align:right; color:#047857; font-weight:bold; font-size:15px;">${grandFillVol.toFixed(3)} m³</td></tr>
                    <tr><td style="padding-top:10px; font-size:14px;"><b>NET VOLUME:</b></td><td style="padding-top:10px; text-align:right; font-size:15px; font-weight:bold; color:${grandNetVol >= 0 ? '#ef4444' : '#059669'};">${Math.abs(grandNetVol).toFixed(3)} m³ <span style="font-size:11px;">(${grandNetVol >= 0 ? 'Cut' : 'Fill'})</span></td></tr>
                </table>
            `;
            summaryBox.innerHTML = html;
            return;
        }

        let area = areasToCalc[currentIndex];
        
        summaryBox.innerHTML = `
            <div style="text-align:center; color:#d97706; padding:10px;">
                <b>⏳ Calculating BDY ${currentIndex + 1} of ${areasToCalc.length}...</b><br>
                <div style="width:100%; background:#e2e8f0; border-radius:10px; height:10px; margin-top:10px; overflow:hidden;">
                    <div id="vol_progress_bar" style="width:0%; height:100%; background:#10b981; transition:width 0.2s;"></div>
                </div>
                <div id="vol_progress_text" style="font-size:12px; margin-top:5px; color:#1e40af; font-weight:bold;">0%</div>
            </div>`;

        runVolumeWorker(window.volTriangles, area.boundary, area.targetLevels, area.baseType, area.gridSize, area.swellPct, area.shrinkPct, 
            function(pct) {
                let pBar = document.getElementById('vol_progress_bar');
                let pTxt = document.getElementById('vol_progress_text');
                if(pBar) pBar.style.width = pct + '%';
                if(pTxt) pTxt.innerText = pct + '%';
            },
            function(res) {
                grandTotalArea += res.totalArea;
                grandCutArea += res.cutArea; 
                grandFillArea += res.fillArea; 
                grandCutVol += res.cutVol; grandFillVol += res.fillVol;
                grandRawCut += res.rawCut; grandRawFill += res.rawFill;

                res.areaIndex = currentIndex + 1;
                window.latestVolResultsArray.push({ areaDef: area, result: res });

                reportDetails += `
                <div style="font-size:11px; color:#475569; border-bottom:1px dashed #cbd5e1; margin-bottom:5px; padding-bottom:5px;">
                    <b>BDY ${currentIndex + 1} (Grid ${res.gridSize}m):</b> 
                    Cut = <span style="color:#ef4444;">${res.cutVol.toFixed(2)} m³</span> | 
                    Fill = <span style="color:#059669;">${res.fillVol.toFixed(2)} m³</span>
                </div>`;

                currentIndex++;
                processNextArea(); 
            }
        );
    }

    processNextArea();
};

window.exportVolDXF = function() {
    if (!window.latestVolResultsArray || window.latestVolResultsArray.length === 0) {
        return alert("Please Calculate Volume first!");
    }

    let dxf = "0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n";
    dxf += "0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n15\n"; 
    
    dxf += "0\nLAYER\n2\nTOPO_POINTS\n70\n0\n62\n7\n6\nCONTINUOUS\n"; 
    dxf += "0\nLAYER\n2\nTOPO_MAJOR_CONTOUR\n70\n0\n62\n2\n6\nCONTINUOUS\n"; 
    dxf += "0\nLAYER\n2\nTOPO_MINOR_CONTOUR\n70\n0\n62\n8\n6\nCONTINUOUS\n"; 
    dxf += "0\nLAYER\n2\nTOPO_LABELS\n70\n0\n62\n7\n6\nCONTINUOUS\n"; 
    dxf += "0\nLAYER\n2\nTOPO_BOUNDARY\n70\n0\n62\n1\n6\nCONTINUOUS\n"; 
    dxf += "0\nLAYER\n2\nTOPO_POINT_NO\n70\n0\n62\n1\n6\nCONTINUOUS\n"; 
    dxf += "0\nLAYER\n2\nTOPO_POINT_CODES\n70\n0\n62\n3\n6\nCONTINUOUS\n"; 
    dxf += "0\nLAYER\n2\nGRID_LINES\n70\n0\n62\n8\n6\nCONTINUOUS\n"; 
    dxf += "0\nLAYER\n2\nGRID_TEXT\n70\n0\n62\n7\n6\nCONTINUOUS\n"; 
    dxf += "0\nLAYER\n2\nMAP_TITLE\n70\n0\n62\n7\n6\nCONTINUOUS\n"; 
    dxf += "0\nLAYER\n2\nNORTH_ARROW\n70\n0\n62\n7\n6\nCONTINUOUS\n"; 
    
    dxf += "0\nLAYER\n2\nVOL_CUT_AREA\n70\n0\n62\n1\n6\nCONTINUOUS\n"; 
    dxf += "0\nLAYER\n2\nVOL_FILL_AREA\n70\n0\n62\n3\n6\nCONTINUOUS\n"; 
    dxf += "0\nLAYER\n2\nVOL_BOUNDARY\n70\n0\n62\n5\n6\nCONTINUOUS\n"; 
    dxf += "0\nLAYER\n2\nREPORT_TABLE\n70\n0\n62\n7\n6\nCONTINUOUS\n";
    dxf += "0\nENDTAB\n0\nENDSEC\n";
    
    dxf += "0\nSECTION\n2\nENTITIES\n";

    let txtH = parseFloat(document.getElementById('topo_text_height')?.value) || 0.5; 
    let interval = parseFloat(document.getElementById('topo_grid_interval')?.value) || 50;
    let mapTitle = document.getElementById('topo_map_title')?.value.trim() || "TOPOGRAPHIC MAP";
    let yOffset = txtH * 0.7; 

    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
    if (window.topoPoints) {
        window.topoPoints.forEach(pt => {
            if (pt.e < minE) minE = pt.e; if (pt.e > maxE) maxE = pt.e;
            if (pt.n < minN) minN = pt.n; if (pt.n > maxN) maxN = pt.n;
        });
    }
    window.latestVolResultsArray.forEach(item => {
        item.areaDef.boundary.forEach(pt => {
            if (pt.e < minE) minE = pt.e; if (pt.e > maxE) maxE = pt.e;
            if (pt.n < minN) minN = pt.n; if (pt.n > maxN) maxN = pt.n;
        });
    });
    if (minE === Infinity) { minE = 0; maxE = 100; minN = 0; maxN = 100; }

    let gridMinE = minE - interval, gridMaxE = maxE + interval;
    let gridMinN = minN - interval, gridMaxN = maxN + interval;
    let startE = Math.ceil(gridMinE / interval) * interval;
    let startN = Math.ceil(gridMinN / interval) * interval;

    if (window.topoPoints) {
        window.topoPoints.forEach(pt => {
            let ptxtE = pt.e + (txtH * 0.3); let currentTxtH = txtH * 0.5; 
            dxf += `0\nPOINT\n8\nTOPO_POINTS\n10\n${pt.e.toFixed(3)}\n20\n${pt.n.toFixed(3)}\n30\n${pt.z.toFixed(3)}\n`;
            if (pt.p && pt.p.trim() !== "") {
                dxf += `0\nTEXT\n8\nTOPO_POINT_NO\n10\n${ptxtE.toFixed(3)}\n20\n${(pt.n + yOffset).toFixed(3)}\n30\n${pt.z.toFixed(3)}\n40\n${currentTxtH}\n1\n${pt.p}\n`;
            }
            dxf += `0\nTEXT\n8\nTOPO_POINTS\n10\n${ptxtE.toFixed(3)}\n20\n${pt.n.toFixed(3)}\n30\n${pt.z.toFixed(3)}\n40\n${currentTxtH}\n1\n${pt.z.toFixed(3)}\n`;
            if (pt.d && pt.d.trim() !== "") {
                dxf += `0\nTEXT\n8\nTOPO_POINT_CODES\n10\n${ptxtE.toFixed(3)}\n20\n${(pt.n - yOffset).toFixed(3)}\n30\n${pt.z.toFixed(3)}\n40\n${currentTxtH}\n1\n${pt.d}\n`;
            }
        });
    }

    if (window.topoContours) {
        window.topoContours.forEach(poly => {
            let layer = poly.isMajor ? "TOPO_MAJOR_CONTOUR" : "TOPO_MINOR_CONTOUR";
            dxf += `0\nPOLYLINE\n8\n${layer}\n66\n1\n70\n8\n10\n0.0\n20\n0.0\n30\n${poly.z.toFixed(3)}\n`;
            poly.points.forEach(pt => { dxf += `0\nVERTEX\n8\n${layer}\n70\n32\n10\n${pt.e.toFixed(3)}\n20\n${pt.n.toFixed(3)}\n30\n${poly.z.toFixed(3)}\n`; });
            dxf += `0\nSEQEND\n8\n${layer}\n`;

        });
        window.computeContourLabels(txtH).forEach(l => {
            dxf += window.contourLabelDxfEntity(l, txtH, l.z.toFixed(3)) + "\n";
        });
    }

    // 🔴 [FIX] Grid စာသားနှင့် Title များ ကြီးစေရန် Interval ကို အခြေခံ၍ တွက်ချက်ခြင်း
let gridTxtH = Math.max(2.5, interval * 0.12);
    
    // 🔴 [FIX] E တန်ဖိုးများကို ထောင်လိုက်ထား၍ ဒသမ ဖြုတ်ခြင်း
    for (let e = startE; e <= gridMaxE; e += interval) {
        let txtE = e + (gridTxtH * 0.3);
        dxf += `0\nLINE\n8\nGRID_LINES\n10\n${e}\n20\n${gridMinN}\n30\n0.0\n11\n${e}\n21\n${gridMaxN}\n31\n0.0\n`;
        // Top E Text (Rotated 90, Align 0=Left)
        dxf += `0\nTEXT\n8\nGRID_TEXT\n10\n${txtE}\n20\n${gridMaxN + gridTxtH}\n30\n0.0\n40\n${gridTxtH}\n1\nE ${e.toFixed(0)}\n50\n90.0\n72\n0\n11\n${txtE}\n21\n${gridMaxN + gridTxtH}\n31\n0.0\n73\n2\n`;
        // Bottom E Text (Rotated 90, Align 2=Right)
        dxf += `0\nTEXT\n8\nGRID_TEXT\n10\n${txtE}\n20\n${gridMinN - gridTxtH}\n30\n0.0\n40\n${gridTxtH}\n1\nE ${e.toFixed(0)}\n50\n90.0\n72\n2\n11\n${txtE}\n21\n${gridMinN - gridTxtH}\n31\n0.0\n73\n2\n`;
    }
    
    // 🔴 [FIX] N တန်ဖိုးများမှ ဒသမ ဖြုတ်ခြင်း
    for (let n = startN; n <= gridMaxN; n += interval) {
        dxf += `0\nLINE\n8\nGRID_LINES\n10\n${gridMinE}\n20\n${n}\n30\n0.0\n11\n${gridMaxE}\n21\n${n}\n31\n0.0\n`;
        // Left N Text
        dxf += `0\nTEXT\n8\nGRID_TEXT\n10\n${gridMinE - gridTxtH}\n20\n${n}\n30\n0.0\n40\n${gridTxtH}\n1\nN ${n.toFixed(0)}\n72\n2\n11\n${gridMinE - gridTxtH}\n21\n${n}\n31\n0.0\n73\n2\n`;
        // Right N Text
        dxf += `0\nTEXT\n8\nGRID_TEXT\n10\n${gridMaxE + gridTxtH}\n20\n${n}\n30\n0.0\n40\n${gridTxtH}\n1\nN ${n.toFixed(0)}\n72\n0\n11\n${gridMaxE + gridTxtH}\n21\n${n}\n31\n0.0\n73\n2\n`;
    }
    
    dxf += `0\nPOLYLINE\n8\nGRID_LINES\n66\n1\n70\n1\n10\n0.0\n20\n0.0\n30\n0.0\n`; 
    dxf += `0\nVERTEX\n8\nGRID_LINES\n70\n32\n10\n${gridMinE}\n20\n${gridMinN}\n30\n0.0\n0\nVERTEX\n8\nGRID_LINES\n70\n32\n10\n${gridMaxE}\n20\n${gridMinN}\n30\n0.0\n0\nVERTEX\n8\nGRID_LINES\n70\n32\n10\n${gridMaxE}\n20\n${gridMaxN}\n30\n0.0\n0\nVERTEX\n8\nGRID_LINES\n70\n32\n10\n${gridMinE}\n20\n${gridMaxN}\n30\n0.0\n0\nSEQEND\n8\nGRID_LINES\n`;

    // 🔴 [FIX] Title ကို အပေါ်ပိုတင်ခြင်း
    let titleN = gridMaxN + (gridTxtH * 10);
    dxf += `0\nTEXT\n8\nMAP_TITLE\n10\n${(gridMinE + gridMaxE)/2}\n20\n${titleN}\n30\n0.0\n40\n${gridTxtH * 2.5}\n1\n${mapTitle}\n72\n1\n11\n${(gridMinE + gridMaxE)/2}\n21\n${titleN}\n31\n0.0\n73\n1\n`;

    let nSize = Math.min(Math.max((gridMaxN - gridMinN) * 0.08, interval * 0.4), 50); 
    let arrE = gridMaxE + (gridTxtH * 12), arrN = gridMaxN - (nSize * 1.5) + (gridTxtH * 4), tN = arrN + nSize, w = nSize * 0.25, cN = arrN + (nSize * 0.3);
    // 🔴 North arrow ကို နှစ်ခြမ်းလုံး ပြည့်စုံအောင် (Topo export နဲ့ တူ) ပြန်ဆွဲသည်
    dxf += `0\nLINE\n8\nNORTH_ARROW\n10\n${arrE}\n20\n${arrN}\n30\n0.0\n11\n${arrE}\n21\n${tN}\n31\n0.0\n`;
    dxf += `0\nSOLID\n8\nNORTH_ARROW\n10\n${arrE}\n20\n${tN}\n30\n0.0\n11\n${arrE + w}\n21\n${cN}\n31\n0.0\n12\n${arrE}\n22\n${cN}\n32\n0.0\n13\n${arrE}\n23\n${cN}\n33\n0.0\n`;
    dxf += `0\nLINE\n8\nNORTH_ARROW\n10\n${arrE}\n20\n${tN}\n30\n0.0\n11\n${arrE - w}\n21\n${cN}\n31\n0.0\n`;
    dxf += `0\nLINE\n8\nNORTH_ARROW\n10\n${arrE - w}\n20\n${cN}\n30\n0.0\n11\n${arrE}\n21\n${cN}\n31\n0.0\n`;
    dxf += `0\nCIRCLE\n8\nNORTH_ARROW\n10\n${arrE}\n20\n${arrN}\n30\n0.0\n40\n${nSize * 0.1}\n`;
    dxf += `0\nTEXT\n8\nNORTH_ARROW\n10\n${arrE}\n20\n${tN + (gridTxtH * 0.8)}\n30\n0.0\n40\n${gridTxtH * 1.5}\n1\nN\n72\n1\n11\n${arrE}\n21\n${tN + (gridTxtH * 0.8)}\n31\n0.0\n73\n1\n`;

    let grandCut = 0, grandFill = 0, grandArea = 0;

    window.latestVolResultsArray.forEach((item, index) => {
        let bdy = item.areaDef.boundary;
        let res = item.result;
        grandCut += res.cutVol; grandFill += res.fillVol; grandArea += res.totalArea;

        dxf += `0\nPOLYLINE\n8\nVOL_BOUNDARY\n66\n1\n70\n9\n10\n0.0\n20\n0.0\n30\n0.0\n`; 
        bdy.forEach(pt => { dxf += `0\nVERTEX\n8\nVOL_BOUNDARY\n70\n32\n10\n${pt.e.toFixed(3)}\n20\n${pt.n.toFixed(3)}\n30\n0.0\n`; });
        dxf += `0\nSEQEND\n8\nVOL_BOUNDARY\n`;

        let hs = res.gridSize / 2.0; 
        if (res.mapCells && res.mapCells.length > 0) {
            res.mapCells.forEach(cell => {
                let layer = cell.type === 1 ? "VOL_CUT_AREA" : "VOL_FILL_AREA";
                let x1 = cell.e - hs, y1 = cell.n - hs; 
                let x2 = cell.e + hs, y2 = cell.n - hs; 
                let x3 = cell.e - hs, y3 = cell.n + hs; 
                let x4 = cell.e + hs, y4 = cell.n + hs; 
                dxf += `0\nSOLID\n8\n${layer}\n10\n${x1.toFixed(3)}\n20\n${y1.toFixed(3)}\n30\n0.0\n11\n${x2.toFixed(3)}\n21\n${y2.toFixed(3)}\n31\n0.0\n12\n${x3.toFixed(3)}\n22\n${y3.toFixed(3)}\n32\n0.0\n13\n${x4.toFixed(3)}\n23\n${y4.toFixed(3)}\n33\n0.0\n`;
            });
        }
        
        let cE = bdy.reduce((s, p) => s + p.e, 0) / bdy.length;
        let cN = bdy.reduce((s, p) => s + p.n, 0) / bdy.length;
        dxf += `0\nTEXT\n8\nVOL_BOUNDARY\n10\n${cE}\n20\n${cN}\n30\n0.0\n40\n${gridTxtH}\n1\nVol BDY ${item.result.areaIndex}\n72\n1\n11\n${cE}\n21\n${cN}\n31\n0.0\n73\n2\n`;
    });

    // ===== Plan ၏ Plot scale / စာရွက်ဘောင် (Topo/PF DXF နှင့်တူ) - Report table ကို ဘောင်ထဲ မထည့်ဘဲ ဘောင်ဘေး (ညာဘက်) တွင်ထား =====
    // ဘောင်ထဲဝင်မည့် အရာ = grid + E/N စာ + title + north arrow ဖြစ်၍ ၎င်းတို့ကိုသာ plan bbox အဖြစ်တွက်
    const _volBBox = { minX: gridMinE - gridTxtH * 9, maxX: Math.max(gridMaxE + gridTxtH * 14, arrE + w + gridTxtH * 2), minY: gridMinN - gridTxtH * 9, maxY: gridMaxN + gridTxtH * 13 };
    const _volLayout = window.dxfPlanLayout(_volBBox);
    const _volFr = _volLayout.frame;
    const _volFrameOn = !!window.dxfOpts.frame;
    // Table ၏ စာအမြင့်ကို စာရွက်ပေါ် ~2mm ဖြစ်စေရန် plot scale အလိုက်တွက် (ဘောင်ကြီး/သေး scale ပြောင်းလည်း စာရွက်ပေါ် အရွယ်တူ)
    let tblTxtH = 2.0 * _volLayout.k;
    let _tblScale = tblTxtH / 1.5;                       // မူလ (စာအမြင့် 1.5) အတွက် ဒီဇိုင်းထားသော column အကျယ်ကို အချိုးကျ ချဲ့/ချုံ့
    let cols = [8.0, 16.0, 14.0, 16.0, 16.0, 18.0, 20.0, 20.0, 26.0].map(cw => cw * _tblScale);
    let tW = cols.reduce((a, b) => a + b, 0);
    let rowH = tblTxtH * 3.5;
    // ဘောင်နှင့် ကွာမည့် နေရာ = ဘောင်အကျယ်၏ ၃% သို့မဟုတ် စာရွက် ၂၀mm (ပိုကြီးတာ)
    let _volGap = _volFrameOn ? Math.max(_volLayout.scale * 0.02, (_volFr.maxX - _volFr.minX) * 0.03) : gridTxtH * 4;
    let tX = (_volFrameOn ? _volFr.maxX : _volBBox.maxX) + _volGap;
    let tY = (_volFrameOn ? _volFr.maxY : _volBBox.maxY) - rowH * 3;    // ခေါင်းစဉ် ၂ ကြောင်းအတွက် နေရာချန်ပြီး ဘောင်ထိပ်နှင့် တန်းစီ

    let numRows = window.latestVolResultsArray.length + 2; 

    dxf += `0\nTEXT\n8\nREPORT_TABLE\n62\n3\n10\n${tX + tW/2}\n20\n${tY + (rowH * 2)}\n30\n0.0\n40\n${tblTxtH * 1.5}\n1\nEARTHWORK VOLUME REPORT\n72\n1\n11\n${tX + tW/2}\n21\n${tY + (rowH * 2)}\n31\n0.0\n73\n2\n`;
    dxf += `0\nTEXT\n8\nREPORT_TABLE\n62\n8\n10\n${tX + tW/2}\n20\n${tY + (rowH * 0.8)}\n30\n0.0\n40\n${tblTxtH}\n1\nCalculation Method: Grid Method\n72\n1\n11\n${tX + tW/2}\n21\n${tY + (rowH * 0.8)}\n31\n0.0\n73\n2\n`;

    for (let r = 0; r <= numRows; r++) {
        let curY = tY - (r * rowH);
        dxf += `0\nLINE\n8\nREPORT_TABLE\n10\n${tX}\n20\n${curY}\n30\n0.0\n11\n${tX + tW}\n21\n${curY}\n31\n0.0\n`;
    }
    let curX = tX;
    dxf += `0\nLINE\n8\nREPORT_TABLE\n10\n${curX}\n20\n${tY}\n30\n0.0\n11\n${curX}\n21\n${tY - (numRows * rowH)}\n31\n0.0\n`;
    for (let c = 0; c < cols.length; c++) {
        curX += cols[c];
        dxf += `0\nLINE\n8\nREPORT_TABLE\n10\n${curX}\n20\n${tY}\n30\n0.0\n11\n${curX}\n21\n${tY - (numRows * rowH)}\n31\n0.0\n`;
    }

    function writeCell(rowIdx, colIdx, text, colorCode = 7) {
        let xPos = tX; 
        for(let i=0; i<colIdx; i++) xPos += cols[i];
        xPos += (cols[colIdx] / 2); 
        let yPos = tY - (rowIdx * rowH) - (rowH / 2);
        dxf += `0\nTEXT\n8\nREPORT_TABLE\n62\n${colorCode}\n10\n${xPos}\n20\n${yPos}\n30\n0.0\n40\n${tblTxtH}\n1\n${text}\n72\n1\n11\n${xPos}\n21\n${yPos}\n31\n0.0\n73\n2\n`;
    }

    writeCell(0, 0, "No", 7);
    writeCell(0, 1, "Boundary", 7);
    writeCell(0, 2, "Grid (m)", 7);
    writeCell(0, 3, "Cut Area", 1);  
    writeCell(0, 4, "Fill Area", 3); 
    writeCell(0, 5, "Total Area", 7); 
    writeCell(0, 6, "Cut (cu.m)", 1); 
    writeCell(0, 7, "Fill (cu.m)", 3); 
    writeCell(0, 8, "Net (cu.m)", 2); 

    let grandCutArea = 0, grandFillArea = 0;

    window.latestVolResultsArray.forEach((item, index) => {
        let rIdx = index + 1;
        let r = item.result;
        let net = r.cutVol - r.fillVol;
        
        grandCutArea += r.cutArea;
        grandFillArea += r.fillArea;

        writeCell(rIdx, 0, r.areaIndex.toString(), 7);
        writeCell(rIdx, 1, `BDY ${r.areaIndex}`, 5);
        writeCell(rIdx, 2, r.gridSize.toFixed(2), 8); 
        writeCell(rIdx, 3, r.cutArea.toFixed(2), 1);   
        writeCell(rIdx, 4, r.fillArea.toFixed(2), 3);  
        writeCell(rIdx, 5, r.totalArea.toFixed(2), 7);
        writeCell(rIdx, 6, r.cutVol.toFixed(3), 1);
        writeCell(rIdx, 7, r.fillVol.toFixed(3), 3);
        writeCell(rIdx, 8, Math.abs(net).toFixed(3) + (net >= 0 ? " (Cut)" : " (Fill)"), net >= 0 ? 1 : 3);
    });

    let lastRow = window.latestVolResultsArray.length + 1;
    let grandNet = grandCut - grandFill;
    writeCell(lastRow, 1, "GRAND TOTAL", 4); 
    writeCell(lastRow, 2, "-", 8); 
    writeCell(lastRow, 3, grandCutArea.toFixed(2), 1);  
    writeCell(lastRow, 4, grandFillArea.toFixed(2), 3); 
    writeCell(lastRow, 5, grandArea.toFixed(2), 7);
    writeCell(lastRow, 6, grandCut.toFixed(3), 1);
    writeCell(lastRow, 7, grandFill.toFixed(3), 3);
    writeCell(lastRow, 8, Math.abs(grandNet).toFixed(3) + (grandNet >= 0 ? " (Cut)" : " (Fill)"), 2);

    dxf += "0\nENDSEC\n0\nEOF\n";
    dxf = window.dxfPostProcess(dxf, { layout: _volLayout });   // ဘောင်ကို Plan (grid) အတွက်သာ ဆွဲ - Report table ကို မဝိုင်း

    let fileName = `Earthwork_Volume_Report_${new Date().getTime()}.dxf`;
    if (window.AndroidNative && window.AndroidNative.downloadConvertedCSV) { 
        window.AndroidNative.downloadConvertedCSV(dxf, fileName); 
    } else { 
        let blob = new Blob([dxf], { type: 'application/dxf' }); 
        let url = URL.createObjectURL(blob); 
        let a = document.createElement("a"); a.href = url; a.download = fileName; 
        document.body.appendChild(a); a.click(); document.body.removeChild(a); 
    }
};


// ==========================================
// 🔴 HIGH PERFORMANCE POINT TEXT RENDERING (COMBINED)
// ==========================================
window.pointTextCanvasLayer = null;

window.updateMapPointTexts = function() {
    if (!window.leafletMap) return;
    
    if (window.pointTextCanvasLayer) {
        window.leafletMap.removeLayer(window.pointTextCanvasLayer);
        window.pointTextCanvasLayer = null;
    }

    let chkName = document.getElementById('tgl_show_pt_name');
    let chkZ = document.getElementById('tgl_show_z_val');
    let chkSo = document.getElementById('tgl_so_texts'); 
    let chkGpsName = document.getElementById('tgl_gps_name'); // 🔴 GPS Name Checkbox
    
    let showTopo = (chkName && chkName.checked) || (chkZ && chkZ.checked);
    let showSo = (chkSo && chkSo.checked);
    let showGps = (chkGpsName && chkGpsName.checked); // 🔴 GPS စာသား ပြ/မပြ

    if (!showTopo && !showSo && !showGps) return; 

    let textsData = [];
    let datum = document.getElementById('topo_datum') ? document.getElementById('topo_datum').value : "WGS_LL";

    // 1. SO Points များကို ဆွဲမည်
    if (showSo && window.setOutPoints) {
        window.setOutPoints.forEach(pt => {
            if (!isNaN(pt.lat) && !isNaN(pt.lon) && pt.p) {
                textsData.push({ lat: pt.lat, lon: pt.lon, text: `[${pt.p}]`, color: '#1e3a8a', align: 'left', isContour: false });
            }
        });
    }

    // 2. GPS Recorded Points များကို ဆွဲမည် (အသစ်)
    if (showGps && window.recordedPointsBank) {
        window.recordedPointsBank.forEach(pt => {
            let pLat = pt.wLa !== undefined ? pt.wLa : pt.lat;
            let pLon = pt.wLo !== undefined ? pt.wLo : pt.lon;
            if (!isNaN(pLat) && !isNaN(pLon) && pt.p) {
                // အနီရောင်ရင့်ရင့်လေးနဲ့ ဆွဲပေးထားပါမယ်
                textsData.push({ lat: pLat, lon: pLon, text: `[${pt.p}]`, color: '#b91c1c', align: 'left', isContour: false });
            }
        });
    }

    // 3. Topo / Volume Points များကို ဆွဲမည်
    if (showTopo) {
        let pointsToProcess = [];
        if (window.topoPoints) pointsToProcess = pointsToProcess.concat(window.topoPoints);
        if (window.volPoints) pointsToProcess = pointsToProcess.concat(window.volPoints);
        if (window.volSurface2Points) pointsToProcess = pointsToProcess.concat(window.volSurface2Points);

        pointsToProcess.forEach(pt => {
            let lat = pt.n, lon = pt.e; 
            if (datum === 'LOCAL') {
                lat = (pt.n - (window.localOffsetN || 0)) / 100000; lon = (pt.e - (window.localOffsetE || 0)) / 100000;
            } else if (datum === "SVY21") { 
                let r = calc_v2_rev(pt.e, pt.n); lat = r.lat; lon = r.lon; 
            } else if (datum.startsWith("MM")) {
                let zone = parseInt(datum.slice(-2)); let r = m_inverse(pt.e, pt.n, zone, m_EVE); 
                let x = m_llh2xyz(r.lat, r.lon, 0, m_EVE); let w = m_xyz2llh(x.x-m_DX, x.y-m_DY, x.z-m_DZ, m_WGS); lat = w.lat; lon = w.lon;
            } else if (datum.startsWith("WGS_UTM")) { 
                let zone = parseInt(datum.slice(-2)); let i = m_inverse(pt.e, pt.n, zone, m_WGS); lat = i.lat; lon = i.lon; 
            } else if (datum === "GLOBAL_UTM") {
                let zInput = document.getElementById('topo_custom_zone'); let hInput = document.getElementById('topo_custom_hemi');
                let zone = (zInput && zInput.value) ? parseInt(zInput.value) : 47; let hemi = hInput ? hInput.value : 'N'; 
                let calcN = pt.n; if (hemi === 'S') calcN -= 10000000; let i_w = m_inverse(pt.e, calcN, zone, m_WGS); lat = i_w.lat; lon = i_w.lon;
            }

            if (!isNaN(lat) && !isNaN(lon)) {
                let txt = "";
                if (chkName && chkName.checked && pt.p) txt += `[${pt.p}]  `;
                if (chkZ && chkZ.checked && pt.z !== undefined) txt += pt.z.toFixed(3);

                if (txt.trim() !== "") {
                    textsData.push({ lat: lat, lon: lon, text: txt.trim(), color: '#1e3a8a', align: 'left', isContour: false });
                }
            }
        });
    }

    if (textsData.length > 0 && typeof L.CanvasTextLayer !== 'undefined') {
        window.pointTextCanvasLayer = new L.CanvasTextLayer(textsData);
        window.pointTextCanvasLayer.addTo(window.leafletMap);
    }
};

let _oldToggleTopoLayersHook = window.toggleTopoLayers;
window.toggleTopoLayers = function() {
    if (typeof _oldToggleTopoLayersHook === 'function') _oldToggleTopoLayersHook();
    window.updateMapPointTexts(); 
};

window.toggleTopoPanel = function() {
    let panel = document.getElementById('topo_controls_panel'); 
    let mapDiv = document.getElementById('map_view'); 
    let btn = document.getElementById('btn_toggle_topo_panel');
    
    if (panel.classList.contains('hidden')) { 
        panel.classList.remove('hidden'); 
        mapDiv.classList.remove('map-expanded'); 
        btn.innerText = "🔼 Hide Controls & Expand Map"; 
    } else { 
        panel.classList.add('hidden'); 
        mapDiv.classList.add('map-expanded'); 
        btn.innerText = "🔽 Show Controls"; 
    }
    setTimeout(() => { if(window.leafletMap) window.leafletMap.invalidateSize(); }, 350);
};

window.toggleVolPanel = function() {
    let panel = document.getElementById('vol_controls_panel'); 
    let mapDiv = document.getElementById('map_view'); 
    let btn = document.getElementById('btn_toggle_vol_panel');
    
    if (panel.classList.contains('hidden')) { 
        panel.classList.remove('hidden'); 
        mapDiv.classList.remove('map-expanded'); 
        btn.innerText = "🔼 Hide Controls & Expand Map"; 
    } else { 
        panel.classList.add('hidden'); 
        mapDiv.classList.add('map-expanded'); 
        btn.innerText = "🔽 Show Controls"; 
    }
    setTimeout(() => { if(window.leafletMap) window.leafletMap.invalidateSize(); }, 350);
};

// ==========================================
// --- PROFILE & CROSS SECTION ENGINE ---
// ==========================================

// [HELPER 1] မျဉ်းနှစ်ကြောင်း ဖြတ်/မဖြတ် တွက်ချက်သော သင်္ချာပုံသေနည်း (2D Line Intersection)
function getLineIntersection(p0_n, p0_e, p1_n, p1_e, p2_n, p2_e, p3_n, p3_e) {
    let s1_n = p1_n - p0_n, s1_e = p1_e - p0_e;
    let s2_n = p3_n - p2_n, s2_e = p3_e - p2_e;
    let s = (-s1_n * (p0_e - p2_e) + s1_e * (p0_n - p2_n)) / (-s2_e * s1_n + s1_e * s2_n);
    let t = ( s2_e * (p0_n - p2_n) - s2_n * (p0_e - p2_e)) / (-s2_e * s1_n + s1_e * s2_n);
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
        return { n: p0_n + (t * s1_n), e: p0_e + (t * s1_e) };
    }
    return null;
}

// [HELPER - ARC] အမှတ် ၂ ခုကြား မျဉ်းကွေး (Simple Arc) တိကျစွာ တွက်ချက်ခြင်း
function calcArcGeometry(p1, p2) {
    let R = p2.radius || 0;
    let dx = p2.e - p1.e;
    let dy = p2.n - p1.n;
    let chordLen = Math.hypot(dx, dy);

    // 🔴 1. Radius သည် အကွာအဝေး၏ ထက်ဝက်ထက် ငယ်နေလျှင် (စက်ဝိုင်းမမီလျှင်) မျဉ်းဖြောင့်သာ ဆွဲမည်
    if (R > 0 && R <= chordLen / 2) {
        console.warn(`Radius ${R}m is too small to connect a distance of ${chordLen.toFixed(1)}m. Defaulting to straight line.`);
        return null; 
    }

    // UI ရဲ့ Right/Left = မျဉ်းကွေးက chord ရဲ့ ညာ/ဘယ်ဘက်ကို ကော့ထွက်တာ။ ဒါကြောင့် center က ဆန့်ကျင်ဘက်မှာ ရှိရမယ်။
    // ဒီအောက်က dir ကတော့ 'ကားမောင်းသွားရင် ကွေ့တဲ့ဘက်' (Right turn = clockwise) ကို ဆိုလိုတယ်။
    let uiSide = p2.curveDir || 'Right';
    let dir = (uiSide === 'Right') ? 'Left' : 'Right';
    let chordBrg = Math.atan2(dx, dy); 

    let h = Math.sqrt((R * R) - Math.pow(chordLen / 2, 2));

    let midN = p1.n + (dy / 2);
    let midE = p1.e + (dx / 2);

    // 🔴 2. Center Point အတိအကျ ရှာဖွေခြင်း (Right ဆိုလျှင် +90 ဒီဂရီ၊ Left ဆိုလျှင် -90 ဒီဂရီ)
    let centerAngle = (dir === 'Right') ? chordBrg + (Math.PI / 2) : chordBrg - (Math.PI / 2);
    let centerN = midN + (h * Math.cos(centerAngle));
    let centerE = midE + (h * Math.sin(centerAngle));

    let startAngle = Math.atan2(p1.e - centerE, p1.n - centerN);

    // 🔴 3. လမ်းကြောင်းတို (Minor Arc) ၏ ထောင့်ကို အတိအကျ တွက်ချက်ခြင်း (Major Arc ကြီး မဖြစ်စေရန်)
    let delta = 2 * Math.asin((chordLen / 2) / R); 
    
    // Right ကွေ့လျှင် အပေါင်း (Clockwise)၊ Left ကွေ့လျှင် အနှုတ် (Counter-clockwise)
    let sweepAngle = (dir === 'Right') ? delta : -delta;

    let arcLength = R * delta;
    let bulge = Math.tan(sweepAngle / 4);

    let arcPoints = [];
    let numSegments = Math.max(Math.ceil(arcLength / 0.5), 2); // 0.5m ဖြင့်ပိုင်းမည်
    let angleStep = sweepAngle / numSegments;

    for (let i = 0; i <= numSegments; i++) {
        let curAngle = startAngle + (i * angleStep);
        arcPoints.push({
            n: centerN + R * Math.cos(curAngle),
            e: centerE + R * Math.sin(curAngle)
        });
    }

    return { center: { n: centerN, e: centerE }, radius: R, startAngle: startAngle, sweepAngle: sweepAngle, arcPoints: arcPoints, bulge: bulge, arcLength: arcLength, dir: dir };
}

// [HELPER 2] တြိဂံမျက်နှာပြင်များ (TIN) နှင့် ဖြတ်မှတ်များကိုရှာ၍ အတိအကျ မြေပြင် Profile တွက်ထုတ်ခြင်း
function extractExactTerrainProfile(startPt, endPt, triangles, interval, currentChainage) {
    let rawPoints = [];
    let dx = endPt.e - startPt.e;
    let dy = endPt.n - startPt.n;
    let totalLen = Math.hypot(dx, dy);
    let bearing = Math.atan2(dx, dy);

    let firstCh = Math.ceil(currentChainage / interval) * interval;
    if (Math.abs(firstCh - currentChainage) < 0.01) firstCh += interval; 

    for (let targetCh = firstCh; targetCh < currentChainage + totalLen - 0.01; targetCh += interval) {
        let dist = targetCh - currentChainage;
        let n = startPt.n + (dist * Math.cos(bearing));
        let e = startPt.e + (dist * Math.sin(bearing));
        rawPoints.push({ distFromStart: dist, n: n, e: e, isInterval: true });
    }

    rawPoints.push({ distFromStart: 0, n: startPt.n, e: startPt.e, isInterval: false });
    rawPoints.push({ distFromStart: totalLen, n: endPt.n, e: endPt.e, isInterval: false });

    triangles.forEach(t => {
        let edges = [[t.p1, t.p2], [t.p2, t.p3], [t.p3, t.p1]];
        edges.forEach(edge => {
            let intersect = getLineIntersection(startPt.n, startPt.e, endPt.n, endPt.e, edge[0].n, edge[0].e, edge[1].n, edge[1].e);
            if (intersect) {
                let dist = Math.hypot(intersect.e - startPt.e, intersect.n - startPt.n);
                rawPoints.push({ distFromStart: dist, n: intersect.n, e: intersect.e, isInterval: false });
            }
        });
    });

    let cleanPoints = [];
    rawPoints.sort((a, b) => a.distFromStart - b.distFromStart);
    let lastDist = -999;
    
    rawPoints.forEach(pt => {
        if (Math.abs(pt.distFromStart - lastDist) > 0.01) { 
            let z = typeof getZFromTIN === 'function' ? getZFromTIN(pt.n, pt.e, triangles) : null;
            // 🔴 [FIX] Z မရှိလည်း អမှတ်ကို မဖျက်ဘဲ (Gap အဖြစ်) ဆက်သိမ်းထားမည်။ သို့မှသာ Crash မဖြစ်မည်။
            let actualCh = currentChainage + pt.distFromStart;
            let isExactInterval = (Math.abs(actualCh % interval) < 0.05 || Math.abs((actualCh % interval) - interval) < 0.05);

            cleanPoints.push({
                ch: actualCh, offset: pt.distFromStart, n: pt.n, e: pt.e, z: z, brg: bearing, 
                isStartEnd: (pt.distFromStart === 0 || Math.abs(pt.distFromStart - totalLen) < 0.01),
                isInterval: pt.isInterval || isExactInterval
            });
            lastDist = pt.distFromStart;
        } else if (pt.isInterval && cleanPoints.length > 0) {
            cleanPoints[cleanPoints.length - 1].isInterval = true;
        }
    });

    return { points: cleanPoints, nextChainage: currentChainage + totalLen, bearing: bearing };
}


// ================= [OFFSET PATH - AutoCAD OFFSET (Mitre) စနစ်] =================
function _normPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; }
function _mod2pi(a) { let t = a % (2 * Math.PI); return t < 0 ? t + 2 * Math.PI : t; }
function _bearingFrom(c, p) { return Math.atan2(p.e - c.e, p.n - c.n); }
function _pOnCircle(c, r, ang) { return { n: c.n + r * Math.cos(ang), e: c.e + r * Math.sin(ang) }; }
function _segStart(sg) { return sg.type === 'arc' ? _pOnCircle(sg.center, sg.r, sg.a0) : { n: sg.a.n, e: sg.a.e }; }
function _segEnd(sg) { return sg.type === 'arc' ? _pOnCircle(sg.center, sg.r, sg.a0 + sg.sweep) : { n: sg.b.n, e: sg.b.e }; }

// CL ရဲ့ segment တစ်ခုကို offset လုပ် (ဖြောင့် => ပြိုင်ရွှေ့၊ arc => center တူ radius ပြောင်း)
function _offsetSegment(p1, p2, offsetDist, sign) {
    let curve = (p2.radius > 0) ? calcArcGeometry(p1, p2) : null;
    if (curve) {
        // Right turn: center ညာဘက် => Right offset က R-d | Left turn: ပြောင်းပြန်
        let r = curve.radius + offsetDist * (curve.dir === 'Right' ? -sign : sign);
        if (r < 0.01) { r = 0.01; console.warn('Offset distance is larger than curve radius.'); }
        return { type: 'arc', center: { n: curve.center.n, e: curve.center.e }, r: r, a0: curve.startAngle, sweep: curve.sweepAngle, dir: curve.dir, sg: curve.sweepAngle >= 0 ? 1 : -1, origSweep: Math.abs(curve.sweepAngle) };
    }
    let brg = Math.atan2(p2.e - p1.e, p2.n - p1.n);
    let pa = brg + (Math.PI / 2) * sign;
    let off = (pt) => ({ n: pt.n + offsetDist * Math.cos(pa), e: pt.e + offsetDist * Math.sin(pa) });
    return { type: 'line', a: off(p1), b: off(p2), dN: Math.cos(brg), dE: Math.sin(brg) };
}

function _lineLine(a1, a2, b1, b2) {
    let d1n = a2.n - a1.n, d1e = a2.e - a1.e, d2n = b2.n - b1.n, d2e = b2.e - b1.e;
    let den = d1n * d2e - d1e * d2n;
    if (Math.abs(den) < 1e-12) return [];
    let t = ((b1.n - a1.n) * d2e - (b1.e - a1.e) * d2n) / den;
    return [{ n: a1.n + t * d1n, e: a1.e + t * d1e }];
}
function _lineCircle(a, b, c, r) {
    let dn = b.n - a.n, de = b.e - a.e, fn = a.n - c.n, fe = a.e - c.e;
    let A = dn * dn + de * de; if (A < 1e-12) return [];
    let B = 2 * (fn * dn + fe * de), C = fn * fn + fe * fe - r * r;
    let disc = B * B - 4 * A * C; if (disc < 0) return [];
    let sq = Math.sqrt(disc);
    return [(-B + sq) / (2 * A), (-B - sq) / (2 * A)].map(t => ({ n: a.n + t * dn, e: a.e + t * de }));
}
function _circleCircle(c1, r1, c2, r2) {
    let dn = c2.n - c1.n, de = c2.e - c1.e, d = Math.hypot(dn, de);
    if (d < 1e-9 || d > r1 + r2 || d < Math.abs(r1 - r2)) return [];
    let a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    let h = Math.sqrt(Math.max(r1 * r1 - a * a, 0));
    let un = dn / d, ue = de / d, mn = c1.n + a * un, me = c1.e + a * ue;
    return [{ n: mn - h * ue, e: me + h * un }, { n: mn + h * ue, e: me - h * un }];
}
function _candidates(S, T) {
    if (S.type === 'line' && T.type === 'line') return _lineLine(S.a, S.b, T.a, T.b);
    if (S.type === 'line' && T.type === 'arc') return _lineCircle(S.a, S.b, T.center, T.r);
    if (S.type === 'arc' && T.type === 'line') return _lineCircle(T.a, T.b, S.center, S.r);
    return _circleCircle(S.center, S.r, T.center, T.r);
}
function _cloneSeg(sg) { return JSON.parse(JSON.stringify(sg)); }

// segment ရဲ့ အဆုံးကို X သို့ ရွှေ့ (တိုး/ဖြတ်)၊ မရရင် false
function _setEnd(sg, X) {
    if (sg.type === 'line') { sg.b = { n: X.n, e: X.e }; return true; }
    let d = _mod2pi((_bearingFrom(sg.center, X) - sg.a0) * sg.sg);
    if (d > sg.origSweep + Math.PI) return false;   // စမှတ်ထက် ကျော်ဖြတ်မိ = ပျက်
    sg.sweep = sg.sg * d; return true;
}
function _setStart(sg, X) {
    if (sg.type === 'line') { sg.a = { n: X.n, e: X.e }; return true; }
    let endAng = sg.a0 + sg.sweep;
    let aS = _bearingFrom(sg.center, X);
    let d = _mod2pi((endAng - aS) * sg.sg);
    if (d > sg.origSweep + Math.PI) return false;
    sg.a0 = aS; sg.sweep = sg.sg * d; return true;
}
function _segValid(sg) {
    if (sg.type === 'line') {
        let vn = sg.b.n - sg.a.n, ve = sg.b.e - sg.a.e;
        return (vn * sg.dN + ve * sg.dE) > 1e-6;
    }
    return (sg.sg * sg.sweep) > 1e-9;
}

// CL ရဲ့ segment အားလုံးကို offset လုပ်ပြီး ချိုးထောင့်တိုင်းကို Mitre (အပြင်ဘက်တိုး၊ အတွင်းဘက်ဖြတ်) နဲ့ ချိတ်
function buildOffsetPath(basePoints, offsetDist, sign) {
    let segs = [];
    for (let i = 0; i < basePoints.length - 1; i++) segs.push(_offsetSegment(basePoints[i], basePoints[i + 1], offsetDist, sign));
    if (offsetDist === 0 || segs.length < 2) return segs;

    const MITRE_LIMIT = 4;    // mitre အမှတ်က offset×4 ထက် ဝေးထွက်ရင် (ချိုးထောင့် ~၁၅၀° ကျော်၊ ချွန်လွန်း) ဆက်ကြိုးအတိုသုံး
    let out = [segs[0]];
    for (let i = 0; i < segs.length - 1; i++) {
        let S = out[out.length - 1], T = segs[i + 1];
        let sE = _segEnd(S), tS = _segStart(T);
        if (Math.hypot(sE.n - tS.n, sE.e - tS.e) < 1e-6) { out.push(T); continue; }   // tangent ဆက်နေပြီး

        let Q = { n: (sE.n + tS.n) / 2, e: (sE.e + tS.e) / 2 };
        let cands = _candidates(S, T).sort((p, q) => Math.hypot(p.n - Q.n, p.e - Q.e) - Math.hypot(q.n - Q.n, q.e - Q.e));
        let joined = false;
        if (cands.length > 0) {
            let X = cands[0];
            if (Math.hypot(X.n - Q.n, X.e - Q.e) <= MITRE_LIMIT * offsetDist) {
                let S2 = _cloneSeg(S), T2 = _cloneSeg(T);
                if (_setEnd(S2, X) && _setStart(T2, X) && _segValid(S2) && _segValid(T2)) {
                    out[out.length - 1] = S2; out.push(T2); joined = true;
                }
            }
        }
        if (!joined) {   // Mitre မရရင် ဆက်ကြိုးအတိုနဲ့ ချိတ်
            out.push({ type: 'line', a: sE, b: tS, dN: (tS.n - sE.n), dE: (tS.e - sE.e), bridge: true });
            out.push(T);
        }
    }
    return out;
}

// [MAIN PROCESS] မျဉ်းသုံးကြောင်း (CL, L, R) သီးခြားစီ Profile တွက်ချက်မည့် ပင်မ Function
window.processProfileSection = function(quiet) {
    // quiet = true: Alert / ရလဒ်ပြကွက်ကို မထိ (Calculate All မှ ခေါ်ရာတွင်သုံး)
    if (window.isProfDrawing) return quiet ? null : alert("⚠️ Please finish the centerline first (tap ✔ Done on the map toolbar).");
    if (!window.profCenterlinePts || window.profCenterlinePts.length < 2) return quiet ? null : alert("⚠️ Please draw a centerline with at least 2 points.");
    if (!window.topoTriangles || window.topoTriangles.length === 0) return quiet ? null : alert("⚠️ Topo Surface is missing. Please generate surface first.");

    let interval = parseFloat(document.getElementById('prof_interval').value) || 20;
    let csInterval = parseFloat(document.getElementById('prof_sampling').value) || 1; 
    let csLeft = parseFloat(document.getElementById('prof_cs_left').value) || 15;
    let csRight = parseFloat(document.getElementById('prof_cs_right').value) || 15;
    
    let drawOffsetsCheckbox = document.getElementById('prof_draw_offsets');
    let isDrawOffsets = drawOffsetsCheckbox ? drawOffsetsCheckbox.checked : false;
    let pfLeftOff = parseFloat(document.getElementById('prof_pf_left').value) || 5;
    let pfRightOff = parseFloat(document.getElementById('prof_pf_right').value) || 5;

    if (!quiet) {
        document.getElementById('prof_status_box').classList.remove('hidden');
        document.getElementById('prof_summary').innerHTML = `⏳ Calculating Independent Profiles and Sections... Please wait.`;
    }

    let allZValues = [];

    // [HELPER] Alignment တစ်ခုချင်းစီ (CL, Left, Right) တွက်ချက်သည့် အင်ဂျင်
    function calcAlignmentProfile(basePoints, offsetDist, isRight) {
        let alignStns = [];
        let alignDxf = [];
        let currentCh = 0;
        let sign = isRight ? 1 : -1;

        const offSegs = buildOffsetPath(basePoints, offsetDist, sign);
        offSegs.forEach(seg => {
            let sP = _segStart(seg), eP = _segEnd(seg);
            let lastV = alignDxf[alignDxf.length - 1];
            if (!lastV || Math.hypot(lastV.n - sP.n, lastV.e - sP.e) > 0.001) alignDxf.push({ n: sP.n, e: sP.e, bulge: 0 });
            let startVertex = alignDxf[alignDxf.length - 1];

            if (seg.type === 'arc') {
                startVertex.bulge = Math.tan(seg.sweep / 4);   // Export မှာ -bulge လုပ်ထား (Right turn=+ stored)
                alignDxf.push({ n: eP.n, e: eP.e, bulge: 0 });

                let numSegments = Math.max(Math.ceil(Math.abs(seg.sweep * seg.r) / 0.5), 2);
                let angleStep = seg.sweep / numSegments;
                let arcPts = [];
                for (let j = 0; j <= numSegments; j++) arcPts.push(_pOnCircle(seg.center, seg.r, seg.a0 + j * angleStep));

                for (let j = 0; j < arcPts.length - 1; j++) {
                    let arcRes = extractExactTerrainProfile(arcPts[j], arcPts[j + 1], window.topoTriangles, interval, currentCh);
                    let isFirstSeg = (j === 0), isLastSeg = (j === arcPts.length - 2);
                    arcRes.points.forEach(pt => {
                        if (pt.isStartEnd) {
                            let keep = (isFirstSeg && pt.offset === 0) || (isLastSeg && pt.offset !== 0);
                            if (!keep) pt.isStartEnd = false;
                        }
                        pt.isCurve = true; pt.curveCenter = seg.center; pt.curveDir = seg.dir; pt.tanBrg = undefined;
                        alignStns.push(pt); if (pt.z !== null) allZValues.push(pt.z);
                    });
                    currentCh = arcRes.nextChainage;
                }
            } else {
                if (Math.hypot(eP.n - sP.n, eP.e - sP.e) < 1e-6) return;
                startVertex.bulge = 0;
                alignDxf.push({ n: eP.n, e: eP.e, bulge: 0 });
                let tb = Math.atan2(eP.e - sP.e, eP.n - sP.n);
                let lineRes = extractExactTerrainProfile(sP, eP, window.topoTriangles, interval, currentCh);
                lineRes.points.forEach(pt => {
                    pt.isCurve = false; pt.tanBrg = tb;
                    alignStns.push(pt); if (pt.z !== null) allZValues.push(pt.z);
                });
                currentCh = lineRes.nextChainage;
            }
        });
        
        alignStns.sort((a, b) => a.ch - b.ch);
        let cleanStns = []; let lastCh = -999;
        alignStns.forEach(stn => {
            if (Math.abs(stn.ch - lastCh) < 0.05) { 
                let prev = cleanStns[cleanStns.length - 1];
                if (stn.isStartEnd || (stn.isInterval && !prev.isStartEnd)) {
                    prev.ch = stn.isInterval ? (Math.round(stn.ch / interval) * interval) : stn.ch; 
                    prev.n = stn.n; prev.e = stn.e; prev.z = stn.z;
                    if(stn.isCurve) { prev.isCurve = true; prev.curveCenter = stn.curveCenter; prev.curveDir = stn.curveDir; prev.tanBrg = undefined; }
                    else if(stn.tanBrg !== undefined) prev.tanBrg = stn.tanBrg;
                }
                if (stn.isStartEnd) prev.isStartEnd = true;
                if (stn.isInterval) prev.isInterval = true;
            } else {
                if (stn.isInterval && !stn.isStartEnd) stn.ch = Math.round(stn.ch / interval) * interval;
                if (!stn.isCurve && stn.tanBrg === undefined) stn.tanBrg = (cleanStns.length > 0) ? cleanStns[cleanStns.length - 1].tanBrg : 0; 
                cleanStns.push(stn); lastCh = stn.ch;
            }
        });
        
        if (alignStns.length > 0) {
            let actualLastPt = alignStns[alignStns.length - 1];
            let cleanedLastPt = cleanStns[cleanStns.length - 1];
            if (Math.abs(actualLastPt.ch - cleanedLastPt.ch) > 0.05) { actualLastPt.isStartEnd = true; cleanStns.push(actualLastPt); } 
            else { cleanedLastPt.isStartEnd = true; }
        }
        // [FIX] Interval station က Start/End (vertex၊ အဆုံး) station နဲ့ အရမ်းနီးနေရင် CS ၂ ခုထပ်နေမှာမို့
        // Start/End ကို ထားပြီး Interval station ကို major station အဖြစ်မှ ဖယ်မယ် (Z point ကတော့ ဆက်ရှိတယ်)
        // Cross Section အတွက်သာ: စ/အဆုံး/ချိုးထောင့်နဲ့ 0.5 m အတွင်းမှ interval CS ကို မထုတ် (CS ၂ ခု အကြား 0.5 m ဆိုတာ အဓိပ္ပါယ်မရှိ၊ ချိုးထောင့်ကိုပဲ ထား)
        // PF table / CH စာရင်းမှာတော့ ၂ ခုလုံး ဆက်ရှိ (csSkip flag သာ မှတ်သည်)
        const csMergeGap = 0.5;
        let seStns = cleanStns.filter(x => x.isStartEnd);
        cleanStns.forEach(st => {
            if (!st.isStartEnd && st.isInterval && seStns.some(e => Math.abs(e.ch - st.ch) < csMergeGap)) st.csSkip = true;
        });
        return { stations: cleanStns, dxf: alignDxf, totalLength: currentCh };
    }

    let clProfile = calcAlignmentProfile(window.profCenterlinePts, 0, true);
    let stations = clProfile.stations; 
    let finalAlignmentData = clProfile.dxf;

    let leftProfile = { stations: [], dxf: [], totalLength: 0 };
    let rightProfile = { stations: [], dxf: [], totalLength: 0 };
    if (isDrawOffsets) {
        leftProfile = calcAlignmentProfile(window.profCenterlinePts, pfLeftOff, false);
        rightProfile = calcAlignmentProfile(window.profCenterlinePts, pfRightOff, true);
    }

    stations.forEach(stn => {
        let isMajorStation = stn.isStartEnd || stn.isInterval; 
        if (!isMajorStation) return; 
        if (stn.csSkip) return;      // ချိုးထောင့် CS နဲ့ အရမ်းနီးသော interval CS

        let leftAngle, rightAngle;
        if (stn.isCurve && stn.curveCenter) {
            let brgToCenter = Math.atan2(stn.curveCenter.e - stn.e, stn.curveCenter.n - stn.n);
            if (stn.curveDir === 'Right') { rightAngle = brgToCenter; leftAngle = brgToCenter + Math.PI; } 
            else { leftAngle = brgToCenter; rightAngle = brgToCenter + Math.PI; }
        } else {
            leftAngle = stn.tanBrg - (Math.PI / 2); rightAngle = stn.tanBrg + (Math.PI / 2);
        }
        
        let l_EndPt = { n: stn.n + (csLeft * Math.cos(leftAngle)), e: stn.e + (csLeft * Math.sin(leftAngle)) };
        let l_Res = extractExactTerrainProfile(stn, l_EndPt, window.topoTriangles, csInterval, 0);
        let r_EndPt = { n: stn.n + (csRight * Math.cos(rightAngle)), e: stn.e + (csRight * Math.sin(rightAngle)) };
        let r_Res = extractExactTerrainProfile(stn, r_EndPt, window.topoTriangles, csInterval, 0);

        let mergedCsPoints = [];
        l_Res.points.forEach(p => { if (p.offset > 0) mergedCsPoints.push({ offset: -p.offset, n: p.n, e: p.e, z: p.z, isInterval: p.isInterval }); if(p.z !== null) allZValues.push(p.z); });
        mergedCsPoints.reverse(); 
        mergedCsPoints.push({ offset: 0, n: stn.n, e: stn.e, z: stn.z, isInterval: true });
        r_Res.points.forEach(p => { if (p.offset > 0) mergedCsPoints.push({ offset: p.offset, n: p.n, e: p.e, z: p.z, isInterval: p.isInterval }); if(p.z !== null) allZValues.push(p.z); });

        stn.csPoints = mergedCsPoints;
    });

    // Z Data မရှိပါက Default Datum တစ်ခု ဖန်တီးမည်
    let validZs = allZValues.filter(z => z !== null && !isNaN(z));
    let minZ = validZs.length > 0 ? Math.min(...validZs) : 0;
    let autoDatum = Math.floor(minZ - 2); 
    let datumInput = document.getElementById('prof_datum_z');
    // Datum: Auto ဆိုလျှင် Center + Left + Right profile နှင့် Cross Section အားလုံးရဲ့ အနိမ့်ဆုံး Z - 2 m ကနေစ၊
    // user ကိုယ်တိုင်ရိုက်ထည့်ထားလျှင် ရိုက်တဲ့အတိုင်းထား
    let datumTyped = (datumInput && datumInput.value !== "") ? parseFloat(datumInput.value) : NaN;
    let datumIsAuto = !datumInput || datumInput.value === "" || datumInput.dataset.auto === '1' || isNaN(datumTyped);
    let datumZ = datumIsAuto ? autoDatum : datumTyped;
    if (datumInput && datumIsAuto) { datumInput.value = autoDatum; datumInput.dataset.auto = '1'; }

    window.profSectionData = {
        stations: stations.filter(s => s.isStartEnd || s.isInterval), 
        exactProfilePoints: stations, 
        leftProfilePoints: leftProfile.stations, 
        rightProfilePoints: rightProfile.stations,
        isDrawOffsets: isDrawOffsets,         
        pfLeftOff: pfLeftOff, pfRightOff: pfRightOff, interval: interval, csInterval: csInterval,
        alignmentDxfData: finalAlignmentData,
        leftAlignmentData: leftProfile.dxf, 
        rightAlignmentData: rightProfile.dxf,
        minZ: minZ, datumZ: datumZ, 
        totalLength: clProfile.totalLength
    };

    if (!quiet) {
        document.getElementById('prof_summary').innerHTML = `
            <div class="pf-sum-title">✅ Independent Profiles Calculated!</div>
            Center Length: <b>${clProfile.totalLength.toFixed(2)} m</b><br>
            Cross Sections: <b>${window.profSectionData.stations.filter(s => s.csPoints && s.csPoints.length > 1).length}</b> generated.<br>
        `;
    }
    return window.profSectionData;
};

window.exportProfileCSV = function() {
    let aligns = (typeof window.profCollectExportAlignments === 'function') ? window.profCollectExportAlignments() : [];
    if (aligns.length === 0) return alert("⚠️ Please calculate sections first.");
    let multi = aligns.length > 1;
    let csv = (multi ? "Alignment," : "") + "Station,Offset,Northing,Easting,Elevation\n";
    aligns.forEach(al => {
        al.sectionData.stations.forEach(stn => {
            if(stn.csPoints) {
                stn.csPoints.forEach(pt => {
                    let zVal = pt.z !== null ? pt.z.toFixed(3) : "NULL";
                    csv += `${multi ? al.name + ',' : ''}${stn.ch.toFixed(2)},${pt.offset.toFixed(2)},${pt.n.toFixed(3)},${pt.e.toFixed(3)},${zVal}\n`;
                });
            }
        });
    });
    let fileName = `Profile_Sections_${new Date().getTime()}.csv`;
    if (window.AndroidNative && window.AndroidNative.downloadConvertedCSV) { window.AndroidNative.downloadConvertedCSV(csv, fileName);
    } else {
        let blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        let url = URL.createObjectURL(blob); let a = document.createElement("a"); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
};


// ==========================================
// PF / CS DXF SETTINGS
// စာအရွယ်အစား၊ scale၊ အကွာအဝေး ကိန်းသေအားလုံးကို ဒီနေရာတစ်ခုတည်းမှာ စုထားသည်။
// နောက်ပိုင်း ပြင်လိုလျှင် PFCS_DEFAULTS (သို့) getPfCsSettings() ကိုသာ ပြင်ပါ။
// ==========================================
window.PFCS_DEFAULTS = {
    chTxtH: 1.6,          // Plan ပေါ်က CH label စာအမြင့် (m) - UI: prof_ch_text_h
    csScale: 200,         // CS Horiz Scale 1:N (စာအရွယ်ကိုပါ ဆုံးဖြတ်)  - UI: prof_cs_h_scale
    paperTxtMM: 2.5,      // စက္ကူပေါ် စာအမြင့် (mm)  => CS စာအမြင့် = csScale × mm / 1000
    pfLabelGap: 1.5,      // PF label (Z grid / Station) နှစ်ခုကြား အနည်းဆုံးခြား = စာအမြင့် × ဤတန်ဖိုး
    csMinGapFactor: 1.5,  // Label နှစ်ခု အနည်းဆုံးခြားရမည့်အကွာ = စာအမြင့် × ဤတန်ဖိုး
    csMinGridFactor: 2.0, // Elevation grid မျဉ်းနှစ်ကြောင်း အနည်းဆုံးခြား = စာအမြင့် × ဤတန်ဖိုး
    csHdrW: 12,           // ဇယားဘယ်ဘက် header ကျယ်ဝန်း   (× စာအမြင့်)
    csRowE: 7,            // "Existing Elevation" အတန်းအမြင့် (× စာအမြင့်)
    csRowO: 6.5           // "Offset" အတန်းအမြင့်            (× စာအမြင့်)
};

window.getPfCsSettings = function() {
    const D = window.PFCS_DEFAULTS;
    const num = (id, def) => {
        let el = document.getElementById(id);
        let v = el ? parseFloat(el.value) : NaN;
        return (isNaN(v) || v <= 0) ? def : v;
    };
    let hScale = num('prof_h_scale', 1000), vScale = num('prof_v_scale', 100);
    let topoGrid = num('topo_grid_interval', 50);
    let csH = num('prof_cs_h_scale', D.csScale);
    let csV = num('prof_cs_v_scale', csH);          // ဗလာ = H နှင့်တူ (×1 / true scale)
    let csTxtH = csH * D.paperTxtMM / 1000;

    return {
        // Profile (PF) - အရင်အတိုင်း Horizontal Scale ပေါ်မူတည်
        pf:   { hScale: hScale, vScale: vScale, exag: hScale / vScale, txtH: hScale / 500, gridZ: num('prof_grid_z_int', 10) },
        // Plan view
        plan: { txtH: num('topo_text_height', 0.5), gridInt: topoGrid, gridTxtH: Math.max(2.5, topoGrid * 0.12),
                chTxtH: num('prof_ch_text_h', D.chTxtH) },
        // Cross Section table
        cs:   { hScale: csH, vScale: csV, exag: csH / csV, txtH: csTxtH,
                gridZManual: num('prof_cs_grid_z', 0),   // 0 = Auto၊ >0 = ကိုယ်တိုင်ချိန် (m)
                hdrW: csTxtH * D.csHdrW, rowE: csTxtH * D.csRowE, rowO: csTxtH * D.csRowO,
                minGap: csTxtH * D.csMinGapFactor, minGrid: csTxtH * D.csMinGridFactor,
                left: num('prof_cs_left', 15), right: num('prof_cs_right', 15) }
    };
};

// Elevation grid အကြား (m) - စာမထပ်အောင် စာအမြင့်ပေါ်မူတည်ရွေးသည်
window.pickCsGridStep = function(exag, minGrid) {
    let steps = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 50];
    for (let i = 0; i < steps.length; i++) { if (steps[i] * exag >= minGrid - 1e-9) return steps[i]; }
    return steps[steps.length - 1];
};

// Settings panel အောက်က ရလဒ်စာကြောင်း (PF / CS) - တန်ဖိုးပြောင်းတိုင်း update လုပ်သည်
window.updatePfCsSummary = function() {
    const ST = window.getPfCsSettings();
    const D = window.PFCS_DEFAULTS;
    const fx = (v) => String(+v.toFixed(2));
    const pfEl = document.getElementById('prof_pf_summary');
    const csEl = document.getElementById('prof_cs_summary');

    if (pfEl) {
        let hLab = ST.pf.txtH * 0.9;
        let every = Math.max(1, Math.ceil(hLab * D.pfLabelGap / (ST.pf.gridZ * ST.pf.exag) - 1e-9));
        let t = `Text ${fx(ST.pf.txtH)} m · V-Exag x${fx(ST.pf.exag)}`;
        if (every > 1) t += ` · Elev labels every ${every} grid lines`;
        pfEl.innerText = t;
    }
    if (csEl) {
        let cs = ST.cs;
        let step = cs.gridZManual > 0 ? cs.gridZManual : window.pickCsGridStep(cs.exag, cs.minGrid);
        let every = Math.max(1, Math.ceil(cs.minGrid / (step * cs.exag) - 1e-9));
        let t = `Text ${fx(cs.txtH)} m · H 1:${fx(cs.hScale)} · V 1:${fx(cs.vScale)} (x${fx(cs.exag)}) · Grid ${fx(step)} m${cs.gridZManual > 0 ? '' : ' (auto)'}`;
        if (every > 1) t += ` · labels every ${every} lines`;
        csEl.innerText = t;
    }
    if (typeof window.profRefreshSummaries === 'function') window.profRefreshSummaries();
};
setTimeout(function() { if (window.updatePfCsSummary) window.updatePfCsSummary(); }, 0);

// CS table: Label ပြမည့် point များကို ရွေးပေးသည် => Map(pointIndex -> ပြမည့် offset တန်ဖိုး)
// step = CS Sampling ၏ ဆတိုး (စာမထပ်သည့် အနည်းဆုံးအကွာအတိုင်း)၊ Center(0) နှင့် အစွန်းနှစ်ဖက်ကို ဦးစားပေး
// TIN ဖြတ်မှတ်နှင့် ၀.၀၁ အတွင်း ပေါင်းသွားသော point များအတွက် tolerance ထားသည်
window.pickCsLabelIdx = function(csPoints, csInterval, minGap) {
    let result = new Map();
    if (!csPoints || csPoints.length === 0) return result;
    const TOL = 0.02;
    let interval = (csInterval && csInterval > 0) ? csInterval : 1;
    let step = Math.max(1, Math.ceil(minGap / interval - 1e-9)) * interval;

    let valid = [];
    csPoints.forEach((p, i) => { if (p.z !== null && p.z !== undefined) valid.push({ i: i, off: p.offset }); });
    if (valid.length === 0) return result;

    let center = valid.find(o => Math.abs(o.off) <= TOL);
    if (center) result.set(center.i, 0);

    [-1, 1].forEach(sign => {
        let side = valid.filter(o => sign * o.off > TOL).sort((a, b) => Math.abs(a.off) - Math.abs(b.off));
        if (side.length === 0) return;
        let maxAbs = Math.abs(side[side.length - 1].off);
        let labelled = [];   // { o: point, shown: ပြမည့် offset (အပေါင်း) }

        for (let k = 1; k * step <= maxAbs + TOL; k++) {
            let target = k * step, best = null;
            side.forEach(o => { let d = Math.abs(Math.abs(o.off) - target); if (d <= TOL && (!best || d < best.d)) best = { o: o, d: d }; });
            if (best) labelled.push({ o: best.o, shown: target });
        }

        // အစွန်းဆုံး point ကို ထည့်မည် (နီးလွန်းလျှင် နောက်ဆုံး label ကို အစားထိုး)
        let end = side[side.length - 1];
        if (!labelled.some(l => l.o === end)) {
            let lastShown = labelled.length ? labelled[labelled.length - 1].shown : 0;
            if (Math.abs(end.off) - lastShown >= minGap - 1e-9) labelled.push({ o: end, shown: Math.abs(end.off) });
            else if (labelled.length) labelled[labelled.length - 1] = { o: end, shown: Math.abs(end.off) };
            else labelled.push({ o: end, shown: Math.abs(end.off) });
        }
        labelled.forEach(l => result.set(l.o.i, sign * l.shown));
    });
    return result;
};

window.exportProfileDXF = function() {
    // Alignment တစ်ခု (သို့) တစ်ခုထက်ပိုသော စာရင်း - တစ်ခုချင်း setting နှင့်၊ တစ်ဖိုင်တည်းထဲ အပေါ်အောက်စီပြီး ထုတ်သည်
    let aligns = (typeof window.profCollectExportAlignments === 'function') ? window.profCollectExportAlignments() : [];
    if (aligns.length === 0) { return alert("⚠️ Please calculate sections first."); }
    const _editorSnap = window.profSnapshotSettings();
    window.profApplySettings(aligns[0].settings);    // Plan-level အပိုင်း (ပထမ alignment ၏ setting)

    let data = aligns[0].sectionData;
    let hScale = parseFloat(document.getElementById('prof_h_scale').value) || 1000;
    let vScale = parseFloat(document.getElementById('prof_v_scale').value) || 100;
    let zGridInt = parseFloat(document.getElementById('prof_grid_z_int').value) || 10;
    let topoGridInt = parseFloat(document.getElementById('topo_grid_interval')?.value) || 50;
    let mapTitle = document.getElementById('topo_map_title')?.value.trim() || "TOPOGRAPHIC MAP";
    
    let exag = hScale / vScale; 
    let datumZ = data.datumZ;
    let txtH = hScale / 500; 
    // 🔴 Plan view (point / contour label / grid / CH label) စာအရွယ်ကို Topo export နဲ့ တူအောင် topo_text_height / grid interval ကနေ ယူသည်
    let ST = window.getPfCsSettings();          // PF / Plan / CS စာအရွယ်အားလုံး ဒီမှာတစ်နေရာတည်းကနေ ယူသည်
    let planTxtH = ST.plan.txtH;
    let planGridTxtH = ST.plan.gridTxtH;

    // 🔴 [FIX] Helper ကို ပြန်ထည့်ပေးထားပါသည် (DXF အလုပ်လုပ်စေရန်)
    let getStationLabel = (ch) => { return "CH "; };

    let dxf = []; 
    const addLine = (layer, x1, y1, x2, y2) => { dxf.push(`0\nLINE\n8\n${layer}\n10\n${x1.toFixed(3)}\n20\n${y1.toFixed(3)}\n30\n0.0\n11\n${x2.toFixed(3)}\n21\n${y2.toFixed(3)}\n31\n0.0`); };
    const addText = (layer, text, x, y, height, align = 1, rotation = 0, color = null) => {
        let colStr = color ? `62\n${color}\n` : "";
        dxf.push(`0\nTEXT\n8\n${layer}\n${colStr}10\n${x.toFixed(3)}\n20\n${y.toFixed(3)}\n30\n0.0\n40\n${height.toFixed(3)}\n1\n${text}\n50\n${rotation.toFixed(3)}\n72\n${align}\n11\n${x.toFixed(3)}\n21\n${y.toFixed(3)}\n31\n0.0\n73\n2`);
    };
    const addPolyline = (layer, ptsObjArray, isClosed = false) => {
        dxf.push(`0\nPOLYLINE\n8\n${layer}\n66\n1\n70\n${isClosed ? 1 : 0}\n10\n0.0\n20\n0.0\n30\n0.0`);
        ptsObjArray.forEach(p => { let z = p.z !== undefined && p.z !== null ? p.z : 0.0; dxf.push(`0\nVERTEX\n8\n${layer}\n70\n32\n10\n${p.e !== undefined ? p.e.toFixed(3) : p.x.toFixed(3)}\n20\n${p.n !== undefined ? p.n.toFixed(3) : p.y.toFixed(3)}\n30\n${z.toFixed(3)}`); });
        dxf.push(`0\nSEQEND\n8\n${layer}`);
    };
    // Contour: elevation က မျဉ်းတစ်ကြောင်းလုံးရဲ့ poly.z မှာရှိ (point တစ်ခုချင်းမှာ မရှိ) - Topo DXF လို 3D polyline (flag 8) ဖြင့် Z ပါအောင်ရေး
    const addContour3D = (layer, poly) => {
        let zc = poly.z.toFixed(3);
        dxf.push(`0\nPOLYLINE\n8\n${layer}\n66\n1\n70\n8\n10\n0.0\n20\n0.0\n30\n${zc}`);
        poly.points.forEach(p => dxf.push(`0\nVERTEX\n8\n${layer}\n70\n32\n10\n${p.e.toFixed(3)}\n20\n${p.n.toFixed(3)}\n30\n${zc}`));
        dxf.push(`0\nSEQEND\n8\n${layer}`);
    };
    const addPoint = (layer, x, y, z) => { dxf.push(`0\nPOINT\n8\n${layer}\n10\n${x.toFixed(3)}\n20\n${y.toFixed(3)}\n30\n${z.toFixed(3)}`); };
    const addSolid = (layer, x1, y1, x2, y2, x3, y3, x4, y4) => { dxf.push(`0\nSOLID\n8\n${layer}\n10\n${x1.toFixed(3)}\n20\n${y1.toFixed(3)}\n30\n0.0\n11\n${x2.toFixed(3)}\n21\n${y2.toFixed(3)}\n31\n0.0\n12\n${x3.toFixed(3)}\n22\n${y3.toFixed(3)}\n32\n0.0\n13\n${x4.toFixed(3)}\n23\n${y4.toFixed(3)}\n33\n0.0`); };
    const addCircle = (layer, x, y, r) => { dxf.push(`0\nCIRCLE\n8\n${layer}\n10\n${x.toFixed(3)}\n20\n${y.toFixed(3)}\n30\n0.0\n40\n${r.toFixed(3)}`); };

    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
    if (window.topoPoints && window.topoPoints.length > 0) {
        window.topoPoints.forEach(pt => { if (pt.e < minE) minE = pt.e; if (pt.e > maxE) maxE = pt.e; if (pt.n < minN) minN = pt.n; if (pt.n > maxN) maxN = pt.n; });
    } else {
        aligns.forEach(al => al.pts.forEach(pt => { if (pt.e < minE) minE = pt.e; if (pt.e > maxE) maxE = pt.e; if (pt.n < minN) minN = pt.n; if (pt.n > maxN) maxN = pt.n; }));
    }

    let pOriginX = maxE + topoGridInt + (planGridTxtH * 16);
    let pOriginY = maxN + (topoGridInt * 2);
    // Plan ၏ Plot scale / စာရွက်ဘောင်ကို အစကတည်းက တွက် (Topo DXF နှင့်တူ) - ဘောင်က Profile/CS တွေနှင့် မထပ်အောင် Profile/CS များကို ဘောင်၏ ညာဘက်သို့ ရွှေ့
    // Grid label (လှည့်ထားသော E/N စာ)၊ Title၊ North arrow တို့ ဘောင်မကျော်စေရန် ၎င်းတို့၏ နေရာကိုပါ ထည့်တွက်
    const _planBBox = { minX: minE - topoGridInt - planGridTxtH * 9, maxX: maxE + topoGridInt + planGridTxtH * 14, minY: minN - topoGridInt - planGridTxtH * 9, maxY: maxN + topoGridInt + planGridTxtH * 13 };
    const _layout = window.dxfPlanLayout(_planBBox);
    // PF table ၏ ဘယ်ဘက် header column (hdrW = txtH*12) က origin ၏ ဘယ်ဘက်သို့ ထွက်နေသဖြင့် ၎င်းကိုပါ ထည့်တွက်
    // ဘောင်နှင့်ကွာမည့် နေရာ = ဘောင်အကျယ်ပေါ်မူတည် (စာရွက် ၂၀mm နှင့် ဘောင်အကျယ် ၃% ထဲက ပိုကြီးတာ) → ဘောင်ကြီး/သေး သင့်တော်
    const _pfLeftExt = txtH * 14;
    const _fr = _layout.frame;
    const _planRight = window.dxfOpts.frame ? _fr.maxX : _planBBox.maxX;
    const _planGap = window.dxfOpts.frame ? Math.max(_layout.scale * 0.02, (_fr.maxX - _fr.minX) * 0.03) : planGridTxtH * 2;
    pOriginX = Math.max(pOriginX, _planRight + _planGap + _pfLeftExt);

    dxf.push("0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n24");
    dxf.push("0\nLAYER\n2\nTOPO_POINTS\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nLAYER\n2\nTOPO_POINT_NO\n70\n0\n62\n1\n6\nCONTINUOUS\n0\nLAYER\n2\nTOPO_POINT_CODES\n70\n0\n62\n3\n6\nCONTINUOUS\n0\nLAYER\n2\nTOPO_MAJOR_CONTOUR\n70\n0\n62\n2\n6\nCONTINUOUS\n0\nLAYER\n2\nTOPO_MINOR_CONTOUR\n70\n0\n62\n8\n6\nCONTINUOUS\n0\nLAYER\n2\nTOPO_LABELS\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nLAYER\n2\nTOPO_BOUNDARY\n70\n0\n62\n1\n6\nCONTINUOUS\n0\nLAYER\n2\nMAP_GRID\n70\n0\n62\n8\n6\nCONTINUOUS\n0\nLAYER\n2\nMAP_TEXT\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nLAYER\n2\nNORTH_ARROW\n70\n0\n62\n7\n6\nCONTINUOUS");
    dxf.push("0\nLAYER\n2\nALIGN_CENTERLINE\n70\n0\n62\n1\n6\nCONTINUOUS\n0\nLAYER\n2\nALIGN_LEFT_OFFSET\n70\n0\n62\n3\n6\nCONTINUOUS\n0\nLAYER\n2\nALIGN_RIGHT_OFFSET\n70\n0\n62\n5\n6\nCONTINUOUS\n0\nLAYER\n2\nALIGN_CS_LINES\n70\n0\n62\n8\n6\nCONTINUOUS\n0\nLAYER\n2\nALIGN_TEXT\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nLAYER\n2\nALIGN_TEXT_CL\n70\n0\n62\n1\n6\nCONTINUOUS\n0\nLAYER\n2\nALIGN_TEXT_L\n70\n0\n62\n3\n6\nCONTINUOUS\n0\nLAYER\n2\nALIGN_TEXT_R\n70\n0\n62\n5\n6\nCONTINUOUS");      
    dxf.push("0\nLAYER\n2\nPROF_GRID\n70\n0\n62\n8\n6\nCONTINUOUS\n0\nLAYER\n2\nPROF_LINE_CL\n70\n0\n62\n1\n6\nCONTINUOUS\n0\nLAYER\n2\nPROF_LINE_LEFT\n70\n0\n62\n3\n6\nCONTINUOUS\n0\nLAYER\n2\nPROF_LINE_RIGHT\n70\n0\n62\n5\n6\nCONTINUOUS\n0\nLAYER\n2\nPROF_TEXT\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nLAYER\n2\nCS_GRID\n70\n0\n62\n8\n6\nCONTINUOUS\n0\nLAYER\n2\nCS_BREAK_LINE\n70\n0\n62\n9\n6\nCONTINUOUS\n0\nLAYER\n2\nCS_LINE\n70\n0\n62\n3\n6\nCONTINUOUS\n0\nLAYER\n2\nPROF_TABLE\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nLAYER\n2\nPROF_STATION\n70\n0\n62\n7\n6\nCONTINUOUS");
    dxf.push("0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES");

    if (window.topoPoints && window.topoPoints.length > 0) {
        window.topoPoints.forEach(pt => {
            let txtE = pt.e + (planTxtH * 0.3); let ptTxtH = planTxtH * 0.5; let yOff = planTxtH * 0.7;
            addPoint("TOPO_POINTS", pt.e, pt.n, pt.z);
            if (pt.p && pt.p.trim() !== "") addText("TOPO_POINT_NO", pt.p, txtE, pt.n + yOff, ptTxtH, 0); 
            addText("TOPO_POINTS", pt.z.toFixed(3), txtE, pt.n, ptTxtH, 0);
            if (pt.d && pt.d.trim() !== "") addText("TOPO_POINT_CODES", pt.d, txtE, pt.n - yOff, ptTxtH, 0);
        });
    }

    if (window.topoBoundaryPolygon && window.topoBoundaryPolygon.length > 2) addPolyline("TOPO_BOUNDARY", window.topoBoundaryPolygon, true);

    if (window.topoContours && window.topoContours.length > 0) {
        window.topoContours.forEach(poly => {
            let layer = poly.isMajor ? "TOPO_MAJOR_CONTOUR" : "TOPO_MINOR_CONTOUR";
            addContour3D(layer, poly);
        });
        window.computeContourLabels(planTxtH).forEach(l => {
            addText("TOPO_LABELS", l.z.toFixed(3), l.e, l.n, planTxtH, 1, l.angleDeg);
        });
    }

    let gridMinE = minE - topoGridInt, gridMaxE = maxE + topoGridInt;
    let gridMinN = minN - topoGridInt, gridMaxN = maxN + topoGridInt;
    let startE = Math.ceil(gridMinE / topoGridInt) * topoGridInt;
    let startN = Math.ceil(gridMinN / topoGridInt) * topoGridInt;
    let gridTxtH = planGridTxtH;
    
    for (let e = startE; e <= gridMaxE; e += topoGridInt) {
        addLine("MAP_GRID", e, gridMinN, e, gridMaxN);
        addText("MAP_TEXT", `E ${e.toFixed(0)}`, e + (gridTxtH * 0.3), gridMaxN + gridTxtH, gridTxtH, 0, 90); 
        addText("MAP_TEXT", `E ${e.toFixed(0)}`, e + (gridTxtH * 0.3), gridMinN - gridTxtH, gridTxtH, 2, 90); 
    }
    for (let n = startN; n <= gridMaxN; n += topoGridInt) {
        addLine("MAP_GRID", gridMinE, n, gridMaxE, n);
        addText("MAP_TEXT", `N ${n.toFixed(0)}`, gridMinE - gridTxtH, n, gridTxtH, 2, 0); 
        addText("MAP_TEXT", `N ${n.toFixed(0)}`, gridMaxE + gridTxtH, n, gridTxtH, 0, 0); 
    }
    
    addPolyline("MAP_GRID", [{e: gridMinE, n: gridMinN}, {e: gridMaxE, n: gridMinN}, {e: gridMaxE, n: gridMaxN}, {e: gridMinE, n: gridMaxN}], true);
    addText("MAP_TEXT", mapTitle, (gridMinE + gridMaxE) / 2, gridMaxN + (gridTxtH * 10), gridTxtH * 2.5, 1, 0);

    let nSize = Math.min(Math.max((gridMaxN - gridMinN) * 0.08, topoGridInt * 0.4), 50);
    let arrE = gridMaxE + (gridTxtH * 12), arrN = gridMaxN - (nSize * 1.5) + (gridTxtH * 4), tN = arrN + nSize, w = nSize * 0.25, cN = arrN + (nSize * 0.3);
    addLine("NORTH_ARROW", arrE, arrN, arrE, tN); 
    addSolid("NORTH_ARROW", arrE, tN, arrE + w, cN, arrE, cN, arrE, cN); 
    addLine("NORTH_ARROW", arrE, tN, arrE - w, cN); addLine("NORTH_ARROW", arrE - w, cN, arrE, cN); 
    addCircle("NORTH_ARROW", arrE, arrN, nSize * 0.1); 
    addText("NORTH_ARROW", "N", arrE, tN + (gridTxtH * 0.8), gridTxtH * 1.5, 1, 0);

    let _stackY = pOriginY;
    try {
    for (let _ai = 0; _ai < aligns.length; _ai++) {
        const _al = aligns[_ai];
        const _nm = aligns.length > 1 ? (_al.name + ' - ') : '';
        window.profApplySettings(_al.settings);           // getPfCsSettings() / DOM ကို ဤ alignment ၏ setting ဖြင့် ဖတ်စေသည်
        data = _al.sectionData;
        hScale = parseFloat(document.getElementById('prof_h_scale').value) || 1000;
        vScale = parseFloat(document.getElementById('prof_v_scale').value) || 100;
        zGridInt = parseFloat(document.getElementById('prof_grid_z_int').value) || 10;
        exag = hScale / vScale;
        datumZ = data.datumZ;
        txtH = hScale / 500;
        ST = window.getPfCsSettings();
        pOriginY = _stackY;

    if (data.alignmentDxfData && data.alignmentDxfData.length > 1) {
        dxf.push(`0\nPOLYLINE\n8\nALIGN_CENTERLINE\n66\n1\n70\n0\n10\n0.0\n20\n0.0\n30\n0.0`);
        data.alignmentDxfData.forEach(p => {
            dxf.push(`0\nVERTEX\n8\nALIGN_CENTERLINE\n70\n32\n10\n${p.e.toFixed(3)}\n20\n${p.n.toFixed(3)}\n30\n0.0`);
            if (p.bulge && !isNaN(p.bulge) && Math.abs(p.bulge) > 0.0001) dxf.push(`42\n${(-p.bulge).toFixed(6)}`);
        });
        dxf.push(`0\nSEQEND\n8\nALIGN_CENTERLINE`);
        if (aligns.length > 1) addText("ALIGN_CENTERLINE", _al.name, data.alignmentDxfData[0].e + ST.plan.chTxtH, data.alignmentDxfData[0].n + ST.plan.chTxtH, ST.plan.chTxtH * 1.5, 0, 0);

        if (data.isDrawOffsets) {
            if (data.leftAlignmentData && data.leftAlignmentData.length > 1) {
                dxf.push(`0\nPOLYLINE\n8\nALIGN_LEFT_OFFSET\n66\n1\n70\n0\n10\n0.0\n20\n0.0\n30\n0.0`);
                data.leftAlignmentData.forEach(p => {
                    dxf.push(`0\nVERTEX\n8\nALIGN_LEFT_OFFSET\n70\n32\n10\n${p.e.toFixed(3)}\n20\n${p.n.toFixed(3)}\n30\n0.0`);
                    if (p.bulge && !isNaN(p.bulge) && Math.abs(p.bulge) > 0.0001) dxf.push(`42\n${(-p.bulge).toFixed(6)}`);
                });
                dxf.push(`0\nSEQEND\n8\nALIGN_LEFT_OFFSET`);
            }
            if (data.rightAlignmentData && data.rightAlignmentData.length > 1) {
                dxf.push(`0\nPOLYLINE\n8\nALIGN_RIGHT_OFFSET\n66\n1\n70\n0\n10\n0.0\n20\n0.0\n30\n0.0`);
                data.rightAlignmentData.forEach(p => {
                    dxf.push(`0\nVERTEX\n8\nALIGN_RIGHT_OFFSET\n70\n32\n10\n${p.e.toFixed(3)}\n20\n${p.n.toFixed(3)}\n30\n0.0`);
                    if (p.bulge && !isNaN(p.bulge) && Math.abs(p.bulge) > 0.0001) dxf.push(`42\n${(-p.bulge).toFixed(6)}`);
                });
                dxf.push(`0\nSEQEND\n8\nALIGN_RIGHT_OFFSET`);
            }
        }
        
        // ===== Plan view CH labels =====
        // CL: CS line ပေါ်မှာ CL နဲ့ Left PF ကြား၊ Left/Right PF: ကိုယ်ပိုင် chainage နဲ့ အပြင်ဘက် tick အတို
        // စာအရွယ်အစား (CL / L / R) အားလုံး တူညီစေမယ်
        const pfL = data.isDrawOffsets ? (data.pfLeftOff || 0) : 0;
        const pfR = data.isDrawOffsets ? (data.pfRightOff || 0) : 0;
        const CHAR_W = 0.75;
        const MIN_H = ST.plan.chTxtH * 0.5;
        const fmtCH = (st) => `CH ${st.ch.toFixed(2)}`;   // profile / section / CSV နဲ့ decimal ၂ နေရာ တူ

        let maxLen = 0;
        [data.stations, data.leftProfilePoints, data.rightProfilePoints].forEach(arr => {
            (arr || []).forEach(st => { if (st.isStartEnd || st.isInterval) maxLen = Math.max(maxLen, fmtCH(st).length); });
        });
        if (maxLen === 0) maxLen = 8;

        // CL label က Left PF ကြားမှာ ဆန့်ရမယ့်အတွက် offset ကြောင့် အရွယ်ကန့်သတ်၊ ပြီးရင် L/R လည်း အရွယ်တူသုံး
        let hAll = ST.plan.chTxtH;      // Plan CH label (PF offset ကျဉ်းလျှင် အောက်မှာ ကန့်သတ်သည်)
        if (pfL > 0) hAll = Math.max(MIN_H, Math.min(hAll, (pfL * 1.6) / (maxLen * CHAR_W)));   // CL ပေါ်အလယ်ထား => ဘယ်ညာ ၂ ဘက်စလုံး PF မထိအောင်

        // CS line ပေါ်က CL label
        let lastLabelPt = null;
        data.stations.forEach(stn => {
            if (!(stn.csPoints && stn.csPoints.length > 1)) return;
            let lPt = stn.csPoints[0]; let rPt = stn.csPoints[stn.csPoints.length - 1];
            let vE = rPt.e - lPt.e, vN = rPt.n - lPt.n; let vLen = Math.hypot(vE, vN) || 1;
            let dE = vE / vLen, dN = vN / vLen;
            let csAngleDeg = Math.atan2(dN, dE) * (180 / Math.PI);
            if (csAngleDeg > 90 || csAngleDeg <= -90) csAngleDeg += 180;
            let angRad = csAngleDeg * Math.PI / 180;

            // CS line အပြည့် (မပြတ်)
            addLine("ALIGN_CS_LINES", lPt.e, lPt.n, rPt.e, rPt.n);

            // CL label: CS line ရဲ့ အလယ်၊ line အပေါ်ဘက် (စာရဲ့ အောက်ကိုယ်က line နဲ့ မထိ)
            let label = fmtCH(stn);
            let mE = (lPt.e + rPt.e) / 2, mN = (lPt.n + rPt.n) / 2;
            let upE = -Math.sin(angRad), upN = Math.cos(angRad);
            addText("ALIGN_TEXT_CL", label, mE + upE * (hAll * 0.8), mN + upN * (hAll * 0.8), hAll, 1, csAngleDeg, null);
        });

        // Left / Right PF: ကိုယ်ပိုင် CH tick
        if (data.isDrawOffsets) {
            const stnDirs = (st) => {
                if (st.isCurve && st.curveCenter) {
                    let b = Math.atan2(st.curveCenter.e - st.e, st.curveCenter.n - st.n);   // center ဘက်ကို ညွှန်တဲ့ bearing
                    return (st.curveDir === 'Right') ? { left: b + Math.PI, right: b } : { left: b, right: b + Math.PI };
                }
                let t = (st.tanBrg !== undefined && st.tanBrg !== null) ? st.tanBrg : 0;
                return { left: t - Math.PI / 2, right: t + Math.PI / 2 };
            };
            const drawPfTicks = (pts, side, layer) => {
                let last = null;
                (pts || []).forEach(st => {
                    if (!(st.isStartEnd || st.isInterval)) return;

                    let a = stnDirs(st)[side];                 // PF ရဲ့ အပြင်ဘက်ကို ညွှန်တဲ့ bearing
                    let ux = Math.sin(a), uy = Math.cos(a);
                    let tickLen = hAll * 1.5;
                    addLine(layer, st.e, st.n, st.e + ux * tickLen, st.n + uy * tickLen);

                    let ang = Math.atan2(uy, ux) * (180 / Math.PI);
                    if (ang > 90 || ang <= -90) ang += 180;
                    let label = fmtCH(st);
                    let w = label.length * CHAR_W * hAll;
                    let dist = tickLen + hAll * 0.4 + w / 2;
                    addText(layer, label, st.e + ux * dist, st.n + uy * dist, hAll, 1, ang, null);
                });
            };
            drawPfTicks(data.leftProfilePoints, 'left', "ALIGN_TEXT_L");
            drawPfTicks(data.rightProfilePoints, 'right', "ALIGN_TEXT_R");
        }
    }

    // ================== PROFILE / SECTION (Civil 3D style - table band) ==================
    const stationStr = (ch) => { let r = Math.round(ch * 100) / 100; let km = Math.floor(r / 1000); return `${km}+${(r - km * 1000).toFixed(2).padStart(6, '0')}`; };
    const CW = 0.8;                         // TEXT တစ်လုံး အကျယ် ≈ 0.8 × အမြင့် (ချိန်ဆဖို့)
    const hLab = txtH * 0.9;                // table စာအမြင့်
    const hdrW = txtH * 12;                 // table ဘယ်ဘက် header column အကျယ်
    // Existing Elevation စာ (၉၀° လှည့်) ဒသမ ၃ လုံး ပါလာသဖြင့် အမြင့်ဆုံး Z စာလုံးရေအလိုက် row အမြင့်ကို လိုအပ်လျှင် တိုး
    let _pfElevChars = 0;
    [data.stations, data.leftProfilePoints, data.rightProfilePoints].forEach(arr => (arr || []).forEach(p => { if (p.z !== null && p.z !== undefined) _pfElevChars = Math.max(_pfElevChars, p.z.toFixed(3).length); }));
    const rowH_E = Math.max(txtH * 7, _pfElevChars * CW * hLab + hLab * 1.6);     // Existing Elevation row
    const rowH_S = txtH * 9;                // Station row
    const rowH_C = txtH * 6;                // Curve Elements row
    const tableH = rowH_E + rowH_S + rowH_C;
    const gridInterval = data.interval || 20;
    const PF_LABEL_GAP = window.PFCS_DEFAULTS.pfLabelGap;

    // Scale symbol (triangle): PF နှင့် CS နှစ်ခုလုံး သုံးသည်။
    // ဘယ်ဘက် header နေရာထဲ၊ Z grid label တွေရဲ့ ဘယ်ဘက်၊ datum အတန်းအနီးမှာ ထားသည်။
    // H စာ = အောက်၊ V စာ = ဘယ်ဘက် (ဒေါင်လိုက်)၊ V-Exag ≠ 1 ဖြစ်လျှင် xN ထပ်ပြ
    const addScaleSymbol = (xRef, yRef, hdrWidth, h, labelGap, labelChars, hScaleV, vScaleV) => {
        let sx = xRef - hdrWidth + h * 2;
        let rightLimit = xRef - labelGap - labelChars * CW * h - h * 0.8;
        let size = Math.max(rightLimit - sx, h * 2.5);
        let baseY = yRef + h * 3.2;
        addLine("PROF_TABLE", sx, baseY, sx + size, baseY);
        addLine("PROF_TABLE", sx, baseY, sx, baseY + size);
        addLine("PROF_TABLE", sx + size, baseY, sx, baseY + size);
        addText("PROF_TEXT", `H 1:${hScaleV}`, sx + size / 2, baseY - h, h, 1, 0);
        addText("PROF_TEXT", `V 1:${vScaleV}`, sx - h * 0.9, baseY + size / 2 + h * 1.2, h, 1, 90);
        let ex = hScaleV / vScaleV;
        if (Math.abs(ex - 1) > 0.001) addText("PROF_TEXT", `x${+ex.toFixed(2)}`, sx + size / 2, baseY - h * 2.2, h, 1, 0);
        return { topY: baseY + size };
    };

    function drawProfileGrid(profilePts, originY, title, lineColorLayer) {
        let validPts = [];
        profilePts.forEach(stn => { if (stn.z !== null) validPts.push({ x: pOriginX + stn.ch, y: originY + ((stn.z - datumZ) * exag) }); });
        if (validPts.length > 1) addPolyline(lineColorLayer, validPts, false);

        let maxZ = profilePts.length > 0 ? Math.max(...profilePts.map(s => s.z === null ? datumZ : s.z)) : datumZ + zGridInt;
        let startGridZ = Math.ceil(datumZ / zGridInt) * zGridInt;
        let topZ = startGridZ + Math.max(1, Math.ceil((maxZ - startGridZ) / zGridInt)) * zGridInt;
        let maxY = originY + ((topZ - datumZ) * exag);
        let L = profilePts.length > 0 ? profilePts[profilePts.length - 1].ch : 0;
        let x0 = pOriginX, x1 = pOriginX + L;

        // --- grid: အလျား (Z) အတန်း ---
        // Grid မျဉ်းအားလုံးဆွဲ၊ Label ကို စာအမြင့်ရဲ့ PF_LABEL_GAP ဆ ထက် မနီးအောင် ရွေးပြ
        const zLabelEvery = Math.max(1, Math.ceil(hLab * PF_LABEL_GAP / (zGridInt * exag) - 1e-9));
        addLine("PROF_GRID", x0, originY, x1, originY);
        let firstGridGap = (startGridZ - datumZ) * exag;
        if (firstGridGap > 1e-6 && firstGridGap >= hLab * PF_LABEL_GAP) addText("PROF_TEXT", datumZ.toFixed(2), x0 - txtH, originY, hLab, 2, 0);
        for (let gi = 0; startGridZ + gi * zGridInt <= topZ + 1e-9; gi++) {
            let gz = startGridZ + gi * zGridInt;
            let gy = originY + ((gz - datumZ) * exag);
            addLine("PROF_GRID", x0, gy, x1, gy);
            if (gi % zLabelEvery === 0) addText("PROF_TEXT", gz.toFixed(2), x0 - txtH, gy, hLab, 2, 0);
        }
        // grid: chainage အတန်း (interval အတိုင်း)
        for (let gx = gridInterval; gx < L - 0.01; gx += gridInterval) addLine("PROF_GRID", x0 + gx, originY, x0 + gx, maxY);
        addLine("PROF_GRID", x0, originY, x0, maxY);
        addLine("PROF_GRID", x1, originY, x1, maxY);
        // Scale symbol ကို ဘယ်ဘက် header နေရာမှာ ထား၊ "Elevation (m)" စာကို symbol အပေါ်မှာ နေရာရှိမှသာ ရေး
        let pfSym = addScaleSymbol(x0, originY, hdrW, hLab, txtH, topZ.toFixed(2).length, hScale, vScale);
        let elevH = hLab * 1.1, elevLen = 13 * CW * elevH;
        let elevY = Math.max((originY + maxY) / 2, pfSym.topY + elevLen / 2 + hLab);
        if (elevY + elevLen / 2 <= maxY) addText("PROF_TEXT", "Elevation (m)", x0 - txtH * 7, elevY, elevH, 1, 90);

        // --- table band ---
        let yE = originY - rowH_E, yS = yE - rowH_S, yC = yS - rowH_C;
        [originY, yE, yS, yC].forEach(yy => addLine("PROF_TABLE", x0 - hdrW, yy, x1, yy));
        [x0 - hdrW, x0, x1].forEach(xx => addLine("PROF_TABLE", xx, originY, xx, yC));
        addText("PROF_TEXT", "Existing", x0 - hdrW / 2, originY - rowH_E / 2 + hLab * 0.7, hLab, 1, 0);
        addText("PROF_TEXT", "Elevation", x0 - hdrW / 2, originY - rowH_E / 2 - hLab * 0.7, hLab, 1, 0);
        addText("PROF_TEXT", "Station", x0 - hdrW / 2, yE - rowH_S / 2, hLab, 1, 0);
        addText("PROF_TEXT", "Curve", x0 - hdrW / 2, yS - rowH_C / 2 + hLab * 0.7, hLab, 1, 0);
        addText("PROF_TEXT", "Elements", x0 - hdrW / 2, yS - rowH_C / 2 - hLab * 0.7, hLab, 1, 0);

        // --- station lines (အနီ) + Elevation / Station စာ ---
        // Station မျဉ်းအားလုံးဆွဲ၊ စာ (rotated) ကို မထပ်အောင် အကွာအလိုက် ရွေးပြ
        let stPts = profilePts.filter(st => st.isStartEnd || st.isInterval);
        // ချိုးထောင့် CH နဲ့ Interval CH နီးနေလျှင် (စာထပ်မည့်အနေအထား) တစ်ခုမှ မဖျက်ဘဲ
        // အုပ်စု၏ ရှေ့ဆုံးကို မျဉ်း၏ ဘယ်ဘက်၊ နောက်ဆုံးကို ညာဘက်သို့ ခွဲရေးသည် (၂ ခုပါလျှင် နှစ်ခုလုံးပေါ်)။
        // ၃ ခုနှင့်အထက် အုပ်စုတွင် အလယ်ကဟာတွေ မျဉ်းသာကျန် (အလွန်ရှားသည်)။
        let labelSide = new Map();      // station -> -1 (ဘယ်) | +1 (ညာ) | 0 (စာမရေး)
        {
            const clusterGap = hLab * PF_LABEL_GAP;
            let i = 0;
            while (i < stPts.length) {
                let j = i;
                while (j + 1 < stPts.length && stPts[j + 1].ch - stPts[j].ch < clusterGap - 1e-9) j++;
                if (j === i) labelSide.set(stPts[i], 1);
                else {
                    labelSide.set(stPts[i], -1); labelSide.set(stPts[j], 1);
                    for (let q = i + 1; q < j; q++) labelSide.set(stPts[q], 0);
                }
                i = j + 1;
            }
        }
        stPts.forEach(stn => {
            let x = x0 + stn.ch;
            addLine("PROF_STATION", x, maxY, x, yS);
            let side = labelSide.get(stn);
            if (!side) return;
            let sideX = side * txtH * 0.75;
            if (stn.z !== null) addText("PROF_TEXT", stn.z.toFixed(3), x + sideX, originY - rowH_E / 2, hLab, 1, 90);
            addText("PROF_TEXT", stationStr(stn.ch), x + sideX, yE - rowH_S / 2, hLab, 1, 90);
        });

        // --- Curve Elements row: ဖြောင့် / curve အပိုင်းအလိုက် ---
        let runs = [];
        let _prevSt = null;
        profilePts.forEach((st, si) => {
            let key = st.isCurve && st.curveCenter ? `C${st.curveCenter.n.toFixed(3)},${st.curveCenter.e.toFixed(3)}` : 'S';
            let last = runs[runs.length - 1];
            // ဖြောင့်နှစ်ခုကြား ချိုးထောင့် (alignment node) မှာလည်း အပိုင်းခွဲ - Station row ရှိ CH မျဉ်းနှင့် တည့်စေရန်
            let bendSplit = !!(last && last.key === 'S' && key === 'S' && st.isStartEnd && si < profilePts.length - 1 && st.ch - last.start > 0.01);
            if (last && last.key === key && !bendSplit) last.end = st.ch;
            else {
                // ကူးပြောင်းရာ CH = အမှန်တကယ် PC/PT/ချိုးထောင့် vertex ၏ CH
                //  - ဖြောင့် → curve : curve ၏ ပထမဆုံး point (PC vertex) = st.ch
                //  - curve → ဖြောင့်/curve : curve ၏ နောက်ဆုံး point (PT vertex) = _prevSt.ch
                // (vertex point များကို station merge လုပ်ချိန် curve အဖြစ် flag ပေးထားပြီးသားမို့ ဖြောင့်ဘက် sample ကို မယူရ)
                let bch = st.ch;
                if (last && !bendSplit && last.key !== 'S') bch = _prevSt.ch;
                if (last) last.end = bch;
                runs.push({ key: key, start: bch, end: st.ch, st: st });
            }
            _prevSt = st;
        });
        runs.forEach((r, idx) => {
            let len = r.end - r.start; if (len < 0.01) return;
            let cx1 = x0 + r.start, cx2 = x0 + r.end;
            if (idx > 0) addLine("PROF_TABLE", cx1, yS, cx1, yC);
            let cands;
            if (r.key === 'S') cands = [`STRAIGHT  L=${len.toFixed(2)}`, `L=${len.toFixed(2)}`];
            else {
                let R = Math.hypot(r.st.n - r.st.curveCenter.n, r.st.e - r.st.curveCenter.e);
                let dirTxt = r.st.curveDir === 'Right' ? 'LT' : 'RT';   // UI ရဲ့ Right/Left (chord ရဲ့ ကော့ထွက်ဘက်) နဲ့ တူအောင်
                cands = [`R=${R.toFixed(2)} ${dirTxt}  L=${len.toFixed(2)}`, `R=${R.toFixed(1)} ${dirTxt}`, `R=${R.toFixed(0)}`];
            }
            let midX = (cx1 + cx2) / 2, midY = yS - rowH_C / 2;
            let fit = cands.find(t => t.length * CW * hLab <= len * 0.95);
            if (fit) addText("PROF_TEXT", fit, midX, midY, hLab, 1, 0);
            else {
                let shortT = cands[cands.length - 1];
                if (shortT.length * CW * hLab <= rowH_C * 0.95 && len >= hLab * 1.4) addText("PROF_TEXT", shortT, midX, midY, hLab, 1, 90);
            }
        });

        // --- title ---
        addText("PROF_TEXT", title, x0, maxY + txtH * 5, txtH * 2.5, 0, 0);

        return (maxY - originY) + tableH + txtH * 16;
    }

    let nextOriginY = pOriginY + tableH + txtH * 10;
    let lastOffset = drawProfileGrid(data.exactProfilePoints, nextOriginY, `${_nm}CENTERLINE PROFILE (H 1:${hScale} / V 1:${vScale})`, "PROF_LINE_CL");
    if (data.isDrawOffsets) {
        nextOriginY += lastOffset;
        lastOffset = drawProfileGrid(data.rightProfilePoints, nextOriginY, `${_nm}RIGHT OFFSET PROFILE`, "PROF_LINE_RIGHT");
        nextOriginY += lastOffset;
        lastOffset = drawProfileGrid(data.leftProfilePoints, nextOriginY, `${_nm}LEFT OFFSET PROFILE`, "PROF_LINE_LEFT");
    }

    // ================== CROSS SECTIONS (grid + table band) ==================
    // CS သည် PF နှင့် သီးခြား scale/စာအရွယ် သုံးသည် (ST.cs)။ တွက်ချက်ပုံများကို getPfCsSettings() နှင့် pickCs* helpers တွင် ပြင်ပါ။
    const CS = ST.cs;
    const cT = CS.txtH;
    {   // CS Existing Elevation စာ ဒသမ ၃ လုံး - row အမြင့် မလုံလောက်လျှင် တိုး
        let ch = 0; data.stations.forEach(stn => (stn.csPoints || []).forEach(p => { if (p.z !== null && p.z !== undefined) ch = Math.max(ch, p.z.toFixed(3).length); }));
        CS.rowE = Math.max(CS.rowE, ch * CW * cT + cT * 1.6);
    }
    const csTableH = CS.rowE + CS.rowO;
    const csWidth = CS.left + CS.right;
    const csCols = 4;

    // (၁) Station တစ်ခုချင်း Z အကွာအဝေး
    let csInfos = [];
    data.stations.forEach(stn => {
        if (!stn.csPoints || stn.csPoints.length === 0) return;
        let valid = stn.csPoints.filter(p => p.z !== null);
        let minZ = valid.length > 0 ? Math.min(...valid.map(p => p.z)) : datumZ;
        let maxZ = valid.length > 0 ? Math.max(...valid.map(p => p.z)) : minZ + 1;
        csInfos.push({ stn: stn, minZ: minZ, maxZ: maxZ });
    });

    // (၂) Vertical exaggeration (= CS H Scale ÷ CS V Scale) နှင့် Elevation grid အကြား
    const csExag  = CS.exag;
    // Elevation grid: ကိုယ်တိုင်ထည့်ထားလျှင် ထိုတန်ဖိုး (Scale ပြောင်းလည်း မပြောင်း)၊ မဟုတ်လျှင် Auto
    const csStepZ = (CS.gridZManual > 0) ? CS.gridZManual : window.pickCsGridStep(csExag, CS.minGrid);
    // grid မျဉ်းနှစ်ကြောင်း စာမထပ်လောက်အောင် နီးလွန်းလျှင် label ကို n ကြောင်းတစ်ခါ ပြမည်
    const csLabelEvery = Math.max(1, Math.ceil(CS.minGrid / (csStepZ * csExag) - 1e-9));
    let maxTopH = 0;
    csInfos.forEach(c => {
        // Datum ကို grid ၏ ဆတိုး (80, 81 …) ပေါ်ထားသည်၊ မြေအနိမ့်ဆုံးနှင့် အရမ်းမကပ်စေရန် နည်းနည်းချထားသည်
        c.datum = Math.floor(c.minZ / csStepZ + 1e-9) * csStepZ;
        if (c.minZ - c.datum < csStepZ * 0.25) c.datum -= csStepZ;
        c.topH  = Math.max(1, Math.ceil((c.maxZ - c.datum) / csStepZ - 1e-9)) * csStepZ;
        maxTopH = Math.max(maxTopH, c.topH);
    });

    // (၃) Layout
    let csStartX = pOriginX;
    let csStartY = nextOriginY + lastOffset + csTableH + txtH * 10;
    let colSpacing = csWidth + CS.hdrW + cT * 8;
    let rowSpacing = maxTopH * csExag + csTableH + cT * 10;

    // (၄) ဆွဲမည်
    csInfos.forEach((c, csIndex) => {
        let stn = c.stn;
        let row = Math.floor(csIndex / csCols), col = csIndex % csCols;
        let cx = csStartX + (col * colSpacing) + CS.hdrW + CS.left + cT * 3;
        let cy = csStartY + (row * rowSpacing);
        let csLocalDatum = c.datum;
        let topY = cy + c.topH * csExag;
        let offs = stn.csPoints.map(p => p.offset);
        let xL = cx + Math.min(...offs), xR = cx + Math.max(...offs);
        let labelMap = window.pickCsLabelIdx(stn.csPoints, data.csInterval || 1, CS.minGap);

        // grid + elevation labels
        for (let gi = 0; gi * csStepZ <= c.topH + 1e-9; gi++) {
            let k = gi * csStepZ;
            addLine("CS_GRID", xL, cy + k * csExag, xR, cy + k * csExag);
            if (gi % csLabelEvery === 0) addText("PROF_TEXT", (csLocalDatum + k).toFixed(2), xL - cT * 0.8, cy + k * csExag, cT, 2, 0);
        }
        addLine("CS_GRID", xL, cy, xL, topY); addLine("CS_GRID", xR, cy, xR, topY);
        addLine("CS_GRID", cx, cy, cx, topY);
        addScaleSymbol(xL, cy, CS.hdrW, cT, cT * 0.8, (csLocalDatum + c.topH).toFixed(2).length, CS.hScale, CS.vScale);

        // table band
        let yE = cy - CS.rowE, yO = yE - CS.rowO;
        [cy, yE, yO].forEach(yy => addLine("PROF_TABLE", xL - CS.hdrW, yy, xR, yy));
        [xL - CS.hdrW, xL, xR].forEach(xx => addLine("PROF_TABLE", xx, cy, xx, yO));
        addText("PROF_TEXT", "Existing", xL - CS.hdrW / 2, cy - CS.rowE / 2 + cT * 0.7, cT, 1, 0);
        addText("PROF_TEXT", "Elevation", xL - CS.hdrW / 2, cy - CS.rowE / 2 - cT * 0.7, cT, 1, 0);
        addText("PROF_TEXT", "Offset", xL - CS.hdrW / 2, yE - CS.rowO / 2, cT, 1, 0);

        // title
        addText("PROF_TEXT", `${_nm}CH ${stationStr(stn.ch)}`, cx, topY + cT * 5.2, cT * 1.8, 1, 0, "7");
        addText("PROF_TEXT", `Datum: ${csLocalDatum.toFixed(2)}m`, cx, topY + cT * 2.2, cT * 1.2, 1, 0);

        let validCsPts = stn.csPoints.filter(p => p.z !== null);
        if (validCsPts.length > 1) addPolyline("CS_LINE", validCsPts.map(p => ({ x: cx + p.offset, y: cy + ((p.z - csLocalDatum) * csExag) })), false);

        stn.csPoints.forEach((p, pi) => {
            if (p.z === null) return;
            let pX = cx + p.offset; let pY = cy + ((p.z - csLocalDatum) * csExag);
            if (labelMap.has(pi)) {
                addLine("CS_GRID", pX, cy, pX, pY);
                addLine("PROF_STATION", pX, cy, pX, yO);
                addText("PROF_TEXT", p.z.toFixed(3), pX + cT * 0.75, cy - CS.rowE / 2, cT, 1, 90);
                addText("PROF_TEXT", labelMap.get(pi).toFixed(2), pX + cT * 0.75, yE - CS.rowO / 2, cT, 1, 90);
            } else if (!p.isInterval) {
                addLine("CS_BREAK_LINE", pX, cy, pX, pY);
            }
        });
    });

        // နောက် alignment ကို ဤ alignment ၏ အပေါ်ဘက်မှာ ဆက်ထားရန် Y ကို မှတ်သည်
        _stackY = csStartY + Math.max(1, Math.ceil(csInfos.length / csCols)) * rowSpacing + txtH * 20;
    }
    } finally {
        window.profApplySettings(_editorSnap);            // Editor ၏ setting ကို မူလအတိုင်း ပြန်ထားသည်
    }

    dxf.push("0\nENDSEC\n0\nEOF");
    let dxfContent = window.dxfPostProcess(dxf.join("\n"), { layout: _layout });   // Plan ၏ Plot scale/ဘောင် = Topo DXF နှင့်တူ (Profile/CS များကို ၎င်းတို့၏ H/V scale ဖြင့် ထုတ်)
    let fileName = `Plan_Profile_Sections_${new Date().getTime()}.dxf`;
    if (window.AndroidNative && window.AndroidNative.downloadConvertedCSV) { window.AndroidNative.downloadConvertedCSV(dxfContent, fileName);
    } else {
        let blob = new Blob([dxfContent], { type: 'application/dxf' }); let url = URL.createObjectURL(blob); let a = document.createElement("a"); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
};



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
