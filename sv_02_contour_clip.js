// [split from module_surface_volume.js] lines 226-627 | part 2/8 | ထပ်ခွဲထားသည် - load order မပြောင်းရ (app.html ၏ script tag အစီအစဉ်အတိုင်း)
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

