// [split from module_surface_volume.js] lines 628-937 | part 3/8 | ထပ်ခွဲထားသည် - load order မပြောင်းရ (app.html ၏ script tag အစီအစဉ်အတိုင်း)
// ==========================================
// --- 3D TIN SURFACE VIEWER & 3D DXF EXPORT ---
// ==========================================

window.update3DScale = function(val) {
    let displayVal = document.getElementById('z_scale_val');
    if (displayVal) displayVal.innerText = parseFloat(val).toFixed(1) + 'x';
    let div = document.getElementById('plotly_3d_div');
    if (div && div.data) {
        let upd = { 'scene.aspectratio.z': parseFloat(val) };
        // လှည့်ထားတဲ့ view ကို မပျက်စေရန် လက်ရှိ camera ကိုပါ တစ်ပါတည်း ပို့ (မပို့ရင် view ပြန် reset ဖြစ်နိုင်)
        let cam = window._topo3dGetCamera(div);
        if (cam) upd['scene.camera'] = cam;
        Plotly.relayout(div, upd);
    }
};

// ==========================================
// 3D view - လက်ရှိ camera ယူခြင်း / Zoom (+ − ခလုတ်, ဖုန်း Pinch)
// Plotly 3D (gl3d) က ဖုန်းမှာ လက်တစ်ချောင်း rotate ပဲ ရပြီး pinch-zoom မပါလို့ ကိုယ်တိုင် ထည့်ထားသည်။
// ==========================================
window._topo3dCam = null;   // plotly_relayout ကနေ မှတ်ထားသော နောက်ဆုံး camera (အရန်)
window._topo3dClone = function(o) { return JSON.parse(JSON.stringify(o)); };

// လက်ရှိ (လှည့်ထားပြီးသား) camera ကို ယူ - မရလျှင် null
window._topo3dGetCamera = function(gd) {
    gd = gd || document.getElementById('plotly_3d_div');
    if (!gd) return null;
    try {   // (၁) live scene ကနေ တိုက်ရိုက်
        let sc = gd._fullLayout && gd._fullLayout.scene && gd._fullLayout.scene._scene;
        if (sc && typeof sc.getCamera === 'function') {
            let c = sc.getCamera();
            if (c && c.eye) return window._topo3dClone(c);
        }
    } catch (e) {}
    if (window._topo3dCam && window._topo3dCam.eye) return window._topo3dClone(window._topo3dCam);   // (၂) event ကနေ မှတ်ထားတာ
    try {   // (၃) fullLayout
        let c = gd._fullLayout.scene.camera;
        if (c && c.eye) return window._topo3dClone(c);
    } catch (e) {}
    return null;
};

// eye ကို center ဆီ k ဆ နီး/ဝေး ရွှေ့ (k<1 = zoom in, k>1 = zoom out)
window._topo3dScaleCamera = function(cam, k) {
    let c = cam.center || { x: 0, y: 0, z: 0 };
    let dx = cam.eye.x - c.x, dy = cam.eye.y - c.y, dz = cam.eye.z - c.z;
    let d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    let nd = Math.min(10, Math.max(0.3, d * k));
    let f = nd / d;
    cam.eye = { x: c.x + dx * f, y: c.y + dy * f, z: c.z + dz * f };
    return cam;
};

window.zoom3D = function(k) {
    let div = document.getElementById('plotly_3d_div');
    if (!div || !div.data) return;
    let cam = window._topo3dGetCamera(div) || { eye: { x: -1.25, y: -1.25, z: 1.25 }, center: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } };
    cam = window._topo3dScaleCamera(cam, k);
    window._topo3dCam = window._topo3dClone(cam);
    Plotly.relayout(div, { 'scene.camera': cam });
};

// လက်နှစ်ချောင်း Pinch-zoom (div တစ်ခုကို တစ်ကြိမ်ပဲ bind)
window._topo3dBindPinch = function(div) {
    if (!div || div._pinchBound) return;
    div._pinchBound = true;
    div.style.touchAction = 'none';
    let pinching = false, startDist = 1, startCam = null, rafId = 0, pending = null, busy = false;
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;
    const opt = { capture: true, passive: false };

    function push(cam) {   // rAF နဲ့ စုပေါင်းပြီး၊ ရှေ့ relayout မပြီးသေးရင် စောင့် (ကြီးတဲ့ mesh မှာ မတွန့်အောင်)
        pending = cam;
        if (rafId) return;
        rafId = requestAnimationFrame(function() {
            rafId = 0;
            if (busy || !pending) return;
            let c = pending; pending = null; busy = true;
            window._topo3dCam = window._topo3dClone(c);
            Promise.resolve(Plotly.relayout(div, { 'scene.camera': c })).then(
                function() { busy = false; if (pending) push(pending); },
                function() { busy = false; });
        });
    }

    div.addEventListener('touchstart', function(e) {
        if (e.touches.length >= 2) {
            pinching = true;
            startDist = dist(e.touches);
            startCam = window._topo3dGetCamera(div);
            e.preventDefault(); e.stopImmediatePropagation();   // Plotly က ဒုတိယလက်ချောင်းကို rotate အဖြစ် မယူရန်
        } else if (pinching) {
            e.stopImmediatePropagation();
        }
    }, opt);
    div.addEventListener('touchmove', function(e) {
        if (!pinching) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.touches.length >= 2 && startCam) {
            push(window._topo3dScaleCamera(window._topo3dClone(startCam), startDist / dist(e.touches)));
        }
    }, opt);
    const end = function(e) {
        if (!pinching) return;
        if (e.touches.length === 0) { pinching = false; startCam = null; }   // လက်အားလုံးမြှောက်မှ ပြီးဆုံး (နောက်ဆုံး touchend ကို Plotly ကို ပေးခဲ့)
        else e.stopImmediatePropagation();
    };
    div.addEventListener('touchend', end, opt);
    div.addEventListener('touchcancel', end, opt);
};

window.view3DSurface = function() {
    if (!window.topoPoints || window.topoPoints.length < 3 || !window.topoTriangles || window.topoTriangles.length === 0) {
        return alert("⚠️ Please generate Topo Surface first!");
    }

    let modal = document.getElementById('topo3dModal');
    modal.style.display = 'flex';
    window._topo3dCam = null;   // ပြန်ဖွင့်တိုင်း camera အဟောင်း မကျန်စေရန်
    
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
                let currentCamera = window._topo3dGetCamera(gd) || currentScene.camera || { eye: {x: -1.25, y: -1.25, z: 1.25} };   // လက်ရှိလှည့်ထားတဲ့ view
                let zInput = document.getElementById('topo_z_scale');
                let currentZScale = zInput ? parseFloat(zInput.value) : 0.5;

                let exportLayout = {
                    scene: { camera: currentCamera, aspectratio: { x: 1, y: 1, z: currentZScale }, xaxis: currentScene.xaxis, yaxis: currentScene.yaxis, zaxis: currentScene.zaxis },
                    paper_bgcolor: '#1e293b', margin: {l: 0, r: 0, b: 0, t: 0}
                };

                // toImage က gd.layout ကို clone လုပ်တာမို့ camera / z-scale ကို layout ထဲ အရင်ထည့်ပြီးမှ ရိုက်
                Plotly.relayout(gd, { 'scene.camera': currentCamera, 'scene.aspectratio.z': currentZScale }).then(function() {
                    return Plotly.toImage(gd, {format: 'png', width: 1200, height: 800, layout: exportLayout});
                }).then(function(dataUrl) {
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
                }).catch(function(err) { console.warn('3D PNG export failed:', err); });
            }
        }]
    }).then(function() {
        let div = document.getElementById('plotly_3d_div');
        window._topo3dBindPinch(div);
        if (div && typeof div.on === 'function') {
            div.on('plotly_relayout', function(ev) { if (ev && ev['scene.camera']) window._topo3dCam = window._topo3dClone(ev['scene.camera']); });
        }
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
