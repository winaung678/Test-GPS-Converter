// ==========================================
// --- WEB GEOID READER (JS BINARY READER) ---
// ==========================================
class WebGeoidReader {
    constructor(url, startLat, endLat, minLon, maxLon, step, isLittleEndian) {
        this.url = url; 
        this.startLat = startLat; 
        this.endLat = endLat;
        this.minLon = minLon; 
        this.maxLon = maxLon; 
        this.step = step;
        this.isLittleEndian = isLittleEndian;
        this.gridData = null;
        this.rows = Math.round(Math.abs(endLat - startLat) / step) + 1;
        this.cols = Math.round((maxLon - minLon) / step) + 1;
        this.isGlobal = (startLat === 90.0 && endLat === -90.0);
        this.loadData();
    }
    
    async loadData() {
        try {
            let response = await fetch(this.url);
            let buffer = await response.arrayBuffer();
            let dataView = new DataView(buffer);
            this.gridData = new Float32Array(buffer.byteLength / 4);
            for (let i = 0; i < this.gridData.length; i++) {
                this.gridData[i] = dataView.getFloat32(i * 4, this.isLittleEndian);
            }
        } catch (e) { 
            console.error("Failed to load Geoid:", this.url); 
        }
    }
    
    getUndulation(lat, lon) {
        if (!this.gridData) return null;
        let adjustedLon = lon; 
        if (this.isGlobal && adjustedLon < 0) adjustedLon += 360.0;
        
        let minLat = Math.min(this.startLat, this.endLat); 
        let maxLat = Math.max(this.startLat, this.endLat);
        
        if (lat < minLat || lat > maxLat || adjustedLon < this.minLon || adjustedLon > this.maxLon) return null;
        
        let r = (this.startLat > this.endLat) ? (this.startLat - lat) / this.step : (lat - this.startLat) / this.step;
        let c = (adjustedLon - this.minLon) / this.step;
        
        let r0 = Math.floor(r); 
        let c0 = Math.floor(c);
        let r1 = (r0 + 1 < this.rows) ? r0 + 1 : r0; 
        let c1 = (c0 + 1 < this.cols) ? c0 + 1 : (this.isGlobal ? 0 : c0);
        
        let n00 = this.gridData[r0 * this.cols + c0]; 
        let n01 = this.gridData[r0 * this.cols + c1];
        let n10 = this.gridData[r1 * this.cols + c0]; 
        let n11 = this.gridData[r1 * this.cols + c1];
        
        if (n00 === undefined || n01 === undefined || n10 === undefined || n11 === undefined) return null;
        
        let dr = r - r0; 
        let dc = c - c0;
        return (n00 * (1 - dc) + n01 * dc) * (1 - dr) + (n10 * (1 - dc) + n11 * dc) * dr;
    }
}

window.webEgm2008 = new WebGeoidReader("egm2008_1min.bin", 1.0, 29.0, 92.0, 104.0, 1.0/60.0, false);
window.webEgm96 = new WebGeoidReader("egm96_global.bin", 90.0, -90.0, 0.0, 360.0, 0.25, true);

// ==========================================
// --- CORE APP LOGIC & UI EVENTS ---
// ==========================================

window.onload = function() {
    loadPointsFromStorage();
    let storedRecords = localStorage.getItem('surveyProRecords');
    if (storedRecords) window.recordedPointsBank = JSON.parse(storedRecords);
    attachPasteFilterToInputs();

    let sSoDatum = localStorage.getItem('pref_so_datum');
    if (sSoDatum) { document.getElementById('so_datum').value = sSoDatum; window.toggleSoDatum(); }
    
    let sDxfDatum = localStorage.getItem('pref_dxf_datum');
    if (sDxfDatum) { document.getElementById('dxf_datum').value = sDxfDatum; window.toggleDxfDatum(); }
    
    if (typeof window.syncTrackColorInputs === 'function') {
        window.syncTrackColorInputs(localStorage.getItem('pref_track_color') || '#3b82f6');
    }

    window.switchApp(0);

    if (window.DeviceOrientationEvent) {
        window.addEventListener("deviceorientationabsolute", (event) => {
            if (event.alpha !== null) window.onCompassUpdate(360 - event.alpha);
        }, true);
        window.addEventListener("deviceorientation", (event) => {
            if (event.webkitCompassHeading) window.onCompassUpdate(event.webkitCompassHeading);
        }, true);
    }
    history.replaceState({page: 0}, "Dashboard", "");
};

function attachPasteFilterToInputs() {
    let inputs = document.querySelectorAll('.v2-input, .dms-grid input');
    inputs.forEach(input => {
        if (input.id.includes('_lat_') || input.id.includes('_lon_') || input.id.includes('_inp_') || input.id.includes('so_m_')) {
            input.addEventListener('paste', function(e) { 
                e.preventDefault(); 
                let pasteData = (e.clipboardData || window.clipboardData).getData('text'); 
                let cleanNumber = pasteData.replace(/[^\d.-]/g, ''); 
                document.execCommand('insertText', false, cleanNumber); 
            });
        }
    });
}

window.openAbout = function() { let lu = document.getElementById('about_last_update'); if (lu && window.APP_LAST_UPDATE) lu.innerText = window.APP_LAST_UPDATE; document.getElementById('aboutModal').style.display='flex'; history.pushState({modal: true}, "Modal", ""); };
window.closeAbout = function() {
    if(document.getElementById('aboutModal').style.display === 'flex') {
        history.back(); 
    }
};

window.openPlayStore = function() {
    if (window.AndroidNative && window.AndroidNative.openPlayStore) {
        window.AndroidNative.openPlayStore();
    } else {
        window.open("https://play.google.com/store/apps/details?id=com.winaung.svy21converter", "_blank");
    }
};

window.toggleSound = function() { 
    window.isSoundOn = !window.isSoundOn; 
    let btn = document.getElementById('soundBtn'); 
    if (btn) {
        btn.innerText = window.isSoundOn ? "🔊 Sound: ON" : "🔇 Sound: OFF"; 
        btn.style.background = window.isSoundOn ? "#10b981" : "#ef4444"; 
    }
};

window.toggleInputLock = function(lock) { 
    document.querySelectorAll('.v2-input, .dms-grid input').forEach(i => { 
        if (i.id !== 'pt_id' && i.id !== 'pt_desc' && i.id !== 'csv_mode' && !i.id.startsWith('so_') && !i.id.startsWith('dxf_') && !i.id.startsWith('cam_') && !i.id.endsWith('_man_pt') && !i.id.endsWith('_man_desc')) { 
            if (lock) { i.classList.add('input-locked'); i.readOnly = true; } 
            else { i.classList.remove('input-locked'); i.readOnly = false; } 
        } 
    }); 
};

window.toggleSoDatum = function() { 
    let v = document.getElementById('so_datum').value; 
    let customDiv = document.getElementById('so_custom_utm'); 
    if (customDiv) customDiv.style.display = (v === "GLOBAL_UTM") ? "flex" : "none"; 
    localStorage.setItem('pref_so_datum', v); 
};

window.toggleDxfDatum = function() { 
    let v = document.getElementById('dxf_datum').value; 
    let customDiv = document.getElementById('dxf_custom_utm'); 
    if (customDiv) customDiv.style.display = (v === "GLOBAL_UTM") ? "flex" : "none"; 
    localStorage.setItem('pref_dxf_datum', v); 
};

window.toggleCogoDatum = function() { 
    let v = document.getElementById('cogo_datum').value; 
    let customDiv = document.getElementById('cogo_custom_utm'); 
    if (customDiv) customDiv.style.display = (v === "GLOBAL_UTM") ? "flex" : "none"; 
};

window.handleTopMenuClick = function() { 
    window.isTopoMode = !window.isTopoMode; 
    window.updateTopoUI(); 
};

window.updateTopoUI = function() {
    let btn = document.getElementById('topMenuBtn'); 
    let n = window.activeApp;
    
    if (window.isNativeGPSActive && (n === 1 || n === 2 || n === 5)) {
        btn.classList.remove('hidden');
        if (window.isTopoMode) {
            btn.innerHTML = "🧮 Data View"; 
            btn.classList.add('topo-active'); 
            document.getElementById('shared_map_view').classList.remove('hidden');
            document.getElementById('v2_calc_ui').classList.add('hidden'); 
            document.getElementById('m_calc_ui').classList.add('hidden'); 
            document.getElementById('g_calc_ui').classList.add('hidden');
            if (!window.leafletMap) window.initMap();
            setTimeout(() => {
                window.leafletMap.invalidateSize({ animate: false });
                if (typeof window.refreshMapPointLayers === 'function') {
                    window.refreshMapPointLayers(window.activeApp);
                }
            }, 350);
        } else {
            btn.innerHTML = "🗺️ Map View"; 
            btn.classList.remove('topo-active'); 
            document.getElementById('shared_map_view').classList.add('hidden');
            if (n === 1) document.getElementById('v2_calc_ui').classList.remove('hidden'); 
            if (n === 2) document.getElementById('m_calc_ui').classList.remove('hidden'); 
            if (n === 5) document.getElementById('g_calc_ui').classList.remove('hidden');
        }
    } else {
        btn.classList.add('hidden');
        if (!window.isNativeGPSActive && (n === 1 || n === 2 || n === 5)) { 
            document.getElementById('shared_map_view').classList.add('hidden'); 
            if (n === 1) document.getElementById('v2_calc_ui').classList.remove('hidden'); 
            if (n === 2) document.getElementById('m_calc_ui').classList.remove('hidden'); 
            if (n === 5) document.getElementById('g_calc_ui').classList.remove('hidden'); 
        }
    }
};

window.switchApp = function(n) {
    if (window.isMeasuring) { window.toggleMeasureMode(); }
    if (window.activeApp === 0 && n !== 0) { history.pushState({page: n}, "App " + n, ""); }
    if (window.isNativeGPSActive && window.activeApp !== n) { window.toggleGlobalGPS(); }
    if (window.activeApp === 3 && n !== 3) { window.stopNavigation(); }
    if (window.activeApp === 4 && n !== 4) { window.clearAreaResultOnly(); }

    window.activeApp = n;
    localStorage.setItem('surveyProLastApp', n);

    document.getElementById('dashboard_view').classList.toggle('hidden', n !== 0);
    document.getElementById('app1_view').classList.toggle('hidden', n !== 1);
    document.getElementById('app2_view').classList.toggle('hidden', n !== 2);
    document.getElementById('app3_view').classList.toggle('hidden', n !== 3);
    document.getElementById('app4_view').classList.toggle('hidden', n !== 4);
    document.getElementById('app5_view').classList.toggle('hidden', n !== 5);
    document.getElementById('app6_view').classList.toggle('hidden', n !== 6);
    document.getElementById('app7_view').classList.toggle('hidden', n !== 7);

    let showSharedTools = (n === 1 || n === 2 || n === 5) && !window.isNativeGPSActive;
    let showRecordPanel = (n === 1 || n === 2 || n === 5) && window.isNativeGPSActive;

    if (n === 0 || n === 3 || n === 4 || n === 6 || n === 7) { 
        document.getElementById('shared_tools_view').classList.add('hidden'); 
    } else { 
        document.getElementById('shared_tools_view').classList.remove('hidden'); 
        document.getElementById('record_panel').style.display = showRecordPanel ? 'block' : 'none'; 
        document.getElementById('csv_panel').style.display = showSharedTools ? 'block' : 'none'; 
    }

    let gpsBtn = document.getElementById('globalGpsBtn'); 
    let menuBtn = document.getElementById('topMenuBtn');
    if (n === 0 || n === 4) { 
        gpsBtn.classList.add('hidden'); 
        menuBtn.classList.add('hidden'); 
        document.getElementById('shared_map_view').classList.add('hidden'); 
    } else { 
        gpsBtn.classList.remove('hidden'); 
    }

    if (n === 3 || n === 6) { 
        window.isTopoMode = false; menuBtn.classList.add('hidden'); 
        document.getElementById('shared_map_view').classList.remove('hidden'); 
        let mapDiv = document.getElementById('map_view'); 
        if (n === 6) { mapDiv.classList.add('map-full-height'); } else { mapDiv.classList.remove('map-full-height'); } 
    } else if (n === 4) { 
        window.isTopoMode = false; menuBtn.classList.add('hidden'); 
        document.getElementById('shared_map_view').classList.add('hidden'); 
        document.getElementById('map_view').classList.remove('map-full-height'); 
        if (typeof window.closeCogoTool === "function") window.closeCogoTool(); 
    } else if (n === 7) { 
        document.getElementById('shared_map_view').classList.add('hidden'); 
        window.isTopoMode = false; menuBtn.classList.add('hidden'); 
    }

    let csvZoneSet = document.getElementById('csv_zone_settings');
    let csvHemiInp = document.getElementById('csv_hemi_inp');
    if (csvZoneSet) {
        if (n === 2) { 
            csvZoneSet.style.display = 'flex';
            csvHemiInp.style.display = 'none'; 
        } else if (n === 5) { 
            csvZoneSet.style.display = 'flex';
            csvHemiInp.style.display = 'block'; 
        } else { 
            csvZoneSet.style.display = 'none'; 
        }
    }

    let csvSelect = document.getElementById('csv_mode');
    if (csvSelect) { 
        if (n === 5) { 
            csvSelect.options[0].text = `UTM (PNEZD) → WGS84 (Lat, Lon)`; 
            csvSelect.options[1].text = `WGS84 (Lat, Lon) → UTM (PNEZD)`; 
            csvSelect.options[2].style.display = 'none'; 
            if (csvSelect.value === "3") csvSelect.value = "1"; 
        } else { 
            let dName = (n === 1) ? "SVY21" : "MM2000"; 
            csvSelect.options[0].text = `${dName} (Local NE) → WGS84 LL & NE`; 
            csvSelect.options[1].text = `WGS84 LL (Lat, Lon) → ${dName} NE`; 
            csvSelect.options[2].text = `WGS84 NE → ${dName} Local NE`; 
            csvSelect.options[2].style.display = 'block'; 
        } 
    }

    if ((n === 3 || n === 7) && !window.isNativeGPSActive) window.toggleGlobalGPS();

    if (n !== 0 && n !== 7) {
        if (!window.leafletMap) window.initMap();
        if (n === 6) {
            if ((!window.rawDxfEntities || window.rawDxfEntities.length === 0) && typeof window.loadSavedDXF === 'function') {
                window.loadSavedDXF();
            }
        }
        setTimeout(() => {
            if (window.leafletMap) window.leafletMap.invalidateSize({ animate: false });
            if (window.rawDxfEntities && window.rawDxfEntities.length > 0) {
                if (window.dxfLineLayer === null) { window.renderDXF(); }
                else if (typeof window.toggleDxfLayers === 'function') { window.toggleDxfLayers(); }
            }
            if (n === 1 || n === 2 || n === 5) { window.updateTopoUI(); }
            let refreshPoints = () => { if (typeof window.refreshMapPointLayers === 'function') window.refreshMapPointLayers(n); if (typeof window.applyLayerVisibility === 'function') window.applyLayerVisibility(); };
            refreshPoints(); setTimeout(refreshPoints, 200);
        }, 350);
    }
    if (n === 4) { window.populateAreaPoints(); window.updateAreaOrderUI(); }
};

window.toggleGlobalGPS = function() {
    window.isNativeGPSActive = !window.isNativeGPSActive; 
    let btn = document.getElementById('globalGpsBtn');
    let subV2 = document.getElementById('v2_subtitle'); 
    let subM = document.getElementById('m_subtitle'); 
    let subG = document.getElementById('g_subtitle');

    if (window.isNativeGPSActive) {
        window.isTopoMode = true; 
        btn.innerHTML = "🛑 Stop GPS"; 
        btn.classList.add('active');
        if (subV2) subV2.innerHTML = "Singapore Datum (Topo Mode)"; 
        if (subM) subM.innerHTML = "Myanmar Datum (Topo Mode)"; 
        if (subG) subG.innerHTML = "Universal Transverse Mercator (Topo Mode)";
        
        document.getElementById('v2_gps_box').classList.remove('hidden'); 
        document.getElementById('m_gps_box').classList.remove('hidden'); 
        document.getElementById('g_gps_box').classList.remove('hidden');
        
        document.getElementById('v2_mode').value = 'LL2SVY'; 
        document.getElementById('m_mode').value = 'W2M_LL'; 
        document.getElementById('g_mode').value = 'LL2UTM';
        
        document.getElementById('v2_mode').disabled = true; 
        document.getElementById('m_mode').disabled = true; 
        document.getElementById('m_zone').disabled = true; 
        document.getElementById('g_mode').disabled = true;
        
        window.v2_toggleUI(); window.m_toggleUI(); window.g_toggleUI(); window.toggleInputLock(true);
        if (window.activeApp === 1 || window.activeApp === 2 || window.activeApp === 5) { 
            document.getElementById('record_panel').style.display = 'block'; 
            document.getElementById('csv_panel').style.display = 'none'; 
            window.updateTopoUI(); 
        }

        if (typeof window.AndroidNative === 'undefined' && navigator.geolocation) {
            window.webGPSWatchId = navigator.geolocation.watchPosition((pos) => {
                window.onNativeGPSUpdate({
                    lat: pos.coords.latitude, lon: pos.coords.longitude,
                    alt: pos.coords.altitude||0, acc: pos.coords.accuracy||0, hAcc: pos.coords.accuracy||0,
                    vAcc: "Web", satCount: "Web"
                });
            }, (err) => { alert("GPS Error: " + err.message); }, { enableHighAccuracy: true, maximumAge: 0 });
        }
    } else {
        window.isTopoMode = false; 
        btn.innerHTML = "🛰️ GPS: OFF"; 
        btn.classList.remove('active');
        if (subV2) subV2.innerHTML = "Singapore Datum (Converter Mode)"; 
        if (subM) subM.innerHTML = "Myanmar Datum (Converter Mode)"; 
        if (subG) subG.innerHTML = "Universal Transverse Mercator (Converter Mode)";
        
        document.getElementById('v2_gps_box').classList.add('hidden'); 
        document.getElementById('m_gps_box').classList.add('hidden'); 
        document.getElementById('g_gps_box').classList.add('hidden');
        
        document.getElementById('v2_mode').disabled = false; 
        document.getElementById('m_mode').disabled = false; 
        document.getElementById('m_zone').disabled = false; 
        document.getElementById('g_mode').disabled = false;
        
        window.toggleInputLock(false); window.resetBM('v2'); window.resetBM('m'); window.resetBM('g');
        window.currentRawAlt = 0; window.appliedPoleH = 0; window.latest_local_N = 0; window.latest_local_E = 0; window.latest_wgs_N = 0; window.latest_wgs_E = 0; window.latest_Z = 0; window.latest_lat = 0; window.latest_lon = 0; window.currentGeoidN = 0; window.currentGeoidModel = "Unknown";
        
        document.getElementById('v2_gps_stat').innerText = "H.Acc: --"; document.getElementById('m_gps_stat').innerText = "H.Acc: --"; document.getElementById('g_gps_stat').innerText = "H.Acc: --"; document.getElementById('so_gps_stat').innerText = "H.Acc: --";
        document.getElementById('v2_v_acc').innerText = "V.Acc: --"; document.getElementById('m_v_acc').innerText = "V.Acc: --"; document.getElementById('g_v_acc').innerText = "V.Acc: --"; document.getElementById('so_v_acc').innerText = "V.Acc: --";
        document.getElementById('v2_sat').innerText = "🛰️ Sat: --"; document.getElementById('m_sat').innerText = "🛰️ Sat: --"; document.getElementById('g_sat').innerText = "🛰️ Sat: --"; document.getElementById('so_sat').innerText = "🛰️ Sat: --";
        document.getElementById('v2_geoid_val').innerText = "Geoid (N): --.--- m"; document.getElementById('m_geoid_val').innerText = "Geoid (N): --.--- m"; document.getElementById('g_geoid_val').innerText = "Geoid (N): --.--- m";
        document.getElementById('v2_raw_alt').innerText = "Raw GPS Alt: --.--- m"; document.getElementById('m_raw_alt').innerText = "Raw GPS Alt: --.--- m"; document.getElementById('g_raw_alt').innerText = "Raw GPS Alt: --.--- m";
        
        if (window.activeApp === 1 || window.activeApp === 2 || window.activeApp === 5) { 
            document.getElementById('record_panel').style.display = 'none'; 
            document.getElementById('csv_panel').style.display = 'block'; 
            window.updateTopoUI(); 
        }
        if (window.webGPSWatchId !== null) { navigator.geolocation.clearWatch(window.webGPSWatchId); window.webGPSWatchId = null; }
    }
};

// Geoid N ကို ဖတ်ပေးသည် (ဘာ global မှ မပြောင်း) - Android native / web EGM2008 → EGM96။ မရလျှင် null
window.getGeoidN = function(lat, lon) {
    if (window.AndroidNative && window.AndroidNative.getGeoidData) {
        try {
            let data = JSON.parse(window.AndroidNative.getGeoidData(lat, lon));
            if (data && data.geoid_n !== null && data.geoid_n !== undefined) return { n: data.geoid_n, model: data.geoid_model || "Unknown" };
        } catch (e) {}
        return null;
    }
    let n = window.webEgm2008 ? window.webEgm2008.getUndulation(lat, lon) : null;
    if (n !== null && n !== undefined) return { n: n, model: "EGM2008" };
    let glon = lon < 0 ? lon + 360 : lon;
    let n96 = window.webEgm96 ? window.webEgm96.getUndulation(lat, glon) : null;
    if (n96 !== null && n96 !== undefined) return { n: n96, model: "EGM96" };
    return null;
};

// GPS panel အတွက် global (currentGeoidN / currentGeoidModel) ကို ပြင်သည် - အရင်အပြုအမူအတိုင်း
function fetchGeoidDataFromNative(lat, lon) {
    let g = window.getGeoidN(lat, lon);
    if (g) { window.currentGeoidN = g.n; window.currentGeoidModel = g.model; }
    else { window.currentGeoidN = 0; window.currentGeoidModel = "Unknown"; }
}

window.onNativeGPSUpdate = function(d) {
    if(!window.isNativeGPSActive) return;
    let t = (window.activeApp === 1) ? 'v2' : (window.activeApp === 2) ? 'm' : 'g';
    let lat = d.lat, lon = d.lon; window.currentLat = lat; window.currentLon = lon; window.latest_lat = lat; window.latest_lon = lon;

    let rawIncomingAlt = d.alt || 0; 
    window.altBuffer.push(rawIncomingAlt); 
    if(window.altBuffer.length > window.BUFFER_SIZE) window.altBuffer.shift(); 
    window.currentRawAlt = window.altBuffer.reduce((a,b) => a + b, 0) / window.altBuffer.length;

    if(d.geoid_n !== undefined && d.geoid_n !== null) { window.currentGeoidN = d.geoid_n; window.currentGeoidModel = d.geoid_model || "Unknown"; }
    else { fetchGeoidDataFromNative(lat, lon); }

    let hA = d.hAcc || d.acc || 0;
    
    // Web ကနေဆိုရင် "Web" လာမယ်၊ APK ကနေဆိုရင် ဂဏန်းအစစ် လာပါမယ်
    let vA = d.vAcc !== undefined ? d.vAcc : "--"; 
    let sats = d.satCount !== undefined ? d.satCount : "--";

    // V.Acc ကို UI ပေါ်ပြရန် Format ပြင်ဆင်ခြင်း
    let vAccDisplay;
    if (vA === "Web") {
        vAccDisplay = "Web";
    } else if (typeof vA === 'number' && vA > 0) {
        vAccDisplay = vA.toFixed(1) + "m";
    } else {
        vAccDisplay = "--";
    }

    if(window.activeApp === 1 || window.activeApp === 2 || window.activeApp === 5) {
        document.getElementById(t+'_gps_stat').innerText = `H.Acc: ${hA.toFixed(1)}m`;
        document.getElementById(t+'_v_acc').innerText = `V.Acc: ${vAccDisplay}`;
        document.getElementById(t+'_sat').innerText = `🛰️ Sat: ${sats}`;
        
        let rawAltUI = document.getElementById(t+'_raw_alt'); let geoidUI = document.getElementById(t+'_geoid_val');
        if (rawAltUI) rawAltUI.innerText = `Raw GPS Alt: ${window.currentRawAlt.toFixed(3)} m`;
        if (geoidUI) geoidUI.innerText = `Geoid (N): ${window.currentGeoidN.toFixed(3)} m`;
    } 
    // 🔴 Set Out Tab အတွက်
    else if (window.activeApp === 3) {
        let soH = document.getElementById('so_gps_stat');
        let soV = document.getElementById('so_v_acc');
        let soS = document.getElementById('so_sat');
        if (soH) soH.innerText = `H.Acc: ${hA.toFixed(1)}m`;
        if (soV) soV.innerText = `V.Acc: ${vAccDisplay}`;
        if (soS) soS.innerText = `🛰️ Sat: ${sats}`;
    }
    updateZDisplay(t);

    if (window.activeApp === 1) { document.getElementById('v2_lat_dd').value = lat.toFixed(9); document.getElementById('v2_lon_dd').value = lon.toFixed(9); window.v2_sync('lat','dd'); window.v2_sync('lon','dd'); window.v2_run(); }
    if (window.activeApp === 2) { window.autoDetectZone(lon); document.getElementById('m_lat_dd').value = lat.toFixed(9); document.getElementById('m_lon_dd').value = lon.toFixed(9); window.m_sync('lat','dd'); window.m_sync('lon','dd'); window.m_run(); }
    if (window.activeApp === 5) { document.getElementById('g_lat_dd').value = lat.toFixed(9); document.getElementById('g_lon_dd').value = lon.toFixed(9); window.g_sync('lat','dd'); window.g_sync('lon','dd'); window.g_run(); }

    if (window.activeApp !== 0 && window.activeApp !== 7 && window.leafletMap) {
        if (!window.markerCurrent) {
            let currIcon = L.divIcon({
                className: '', iconSize: [50, 50], iconAnchor: [25, 25],
                html: `<div id="gps-heading-cone" style="width: 50px; height: 50px; transform: rotate(${window.compassAzimuth||0}deg); transform-origin: center center; transition: transform 0.1s ease-out;"><svg width="50" height="50" viewBox="0 0 50 50"><path d="M25,25 L10,0 A25,25 0 0,1 40,0 Z" fill="url(#gradCone)" opacity="0.5" /><circle cx="25" cy="25" r="6" fill="#2563eb" stroke="white" stroke-width="2.5" /><defs><linearGradient id="gradCone" x1="0%" y1="100%" x2="0%" y2="0%"><stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" /><stop offset="100%" style="stop-color:#60a5fa;stop-opacity:0" /></linearGradient></defs></svg></div>`
            });
            window.markerCurrent = L.marker([window.currentLat, window.currentLon], {icon: currIcon, zIndexOffset: 1000}).addTo(window.leafletMap);
        } else {
            window.markerCurrent.setLatLng([window.currentLat, window.currentLon]);
        }
        if (window.isAutoCenter) {
            if (!window.targetPoint || window.activeApp !== 3) { window.leafletMap.panTo([window.currentLat, window.currentLon]); }
            else { let bounds = L.latLngBounds([window.currentLat, window.currentLon], [window.targetPoint.lat, window.targetPoint.lon]); window.leafletMap.fitBounds(bounds, {padding: [50, 50], maxZoom: 24}); }
        }
        if (window.targetPoint && window.activeApp === 3) { window.updateSetOut(); }
    }
};

window.onCompassUpdate = function(azimuth) {
    window.compassAzimuth = azimuth;
    if (window.activeApp === 3 && window.targetPoint) window.updateSetOut();
    let headingElement = document.getElementById('gps-heading-cone');
    if (headingElement) { headingElement.style.transform = `rotate(${azimuth}deg)`; }
};

// ==========================================
// --- Z (MSL) & POLE/BM LOGIC ---
// ==========================================
function updateZDisplay(t) { 
    if (!window.currentRawAlt) return; 
    let finalZ = window.currentRawAlt - window.currentGeoidN - window.appliedPoleH; 
    if (window.isBMMode) { finalZ += window.zOffset; } 
    window.latest_Z = finalZ; 
    
    if (window.activeApp === 1 || window.activeApp === 2 || window.activeApp === 5) { 
        let zb = document.getElementById(t+'_z_val'); 
        let modeText = window.isBMMode ? "Z (BM Mode)" : window.appliedPoleH > 0 ? `MSL (Pole -${window.appliedPoleH}m)` : `MSL (${window.currentGeoidModel})`; 
        window.globalZText = `${modeText}: ${finalZ.toFixed(3)} m`; 
        if (zb) { zb.innerText = window.globalZText; zb.style.color = window.isBMMode ? "#dc2626" : (window.activeApp === 5 ? "#0f766e" : "#059669"); } 
    } 
}

window.applyPole = function(val) { 
    window.appliedPoleH = parseFloat(val) || 0; 
    document.getElementById('v2_pole_val').value = document.getElementById('m_pole_val').value = document.getElementById('g_pole_val').value = val; 
    updateZDisplay('v2'); updateZDisplay('m'); updateZDisplay('g'); 
};

window.setBM = function(t) { 
    let p_val = document.getElementById(t+'_pole_val').value; 
    let b_val = document.getElementById(t+'_bm_val').value; 
    if (b_val === '') return alert("Please enter a Benchmark (BM) value to SET!"); 
    if (!window.isNativeGPSActive) return alert("Start GPS first!"); 
    if (!window.currentRawAlt) return alert("Waiting for GPS Altitude..."); 
    
    document.getElementById('v2_pole_val').value = document.getElementById('m_pole_val').value = document.getElementById('g_pole_val').value = p_val; 
    document.getElementById('v2_bm_val').value = document.getElementById('m_bm_val').value = document.getElementById('g_bm_val').value = b_val; 
    
    window.appliedPoleH = parseFloat(p_val) || 0; 
    let bmValue = parseFloat(b_val); 
    if (isNaN(bmValue)) return alert("Invalid BM value!"); 
    
    window.zOffset = bmValue - (window.currentRawAlt - window.currentGeoidN - window.appliedPoleH); 
    window.isBMMode = true; 
    updateZDisplay(t); alert("Benchmark Calibration Successful!"); 
};

window.resetBM = function(t) { 
    window.appliedPoleH = 0; window.zOffset = 0; window.isBMMode = false; 
    document.getElementById('v2_pole_val').value = ''; document.getElementById('m_pole_val').value = ''; document.getElementById('g_pole_val').value = ''; 
    document.getElementById('v2_bm_val').value = ''; document.getElementById('m_bm_val').value = ''; document.getElementById('g_bm_val').value = ''; 
    updateZDisplay(t); 
};

window.addEventListener("popstate", function(e) {
    if (!e.state) return; 
    let modals = document.querySelectorAll('.modal');
    let modalClosed = false;
    modals.forEach(m => {
        if (m.style.display === 'flex') {
            m.style.display = 'none';
            modalClosed = true;
        }
    });
    if (modalClosed) return;

    if (window.activeApp === 4) {
        if (!document.getElementById('cogo_tool_container').classList.contains('hidden')) {
            window.closeCogoTool();
        } else {
            window.switchApp(0);
        }
    }
    else if (window.activeApp !== 0) {
        window.switchApp(0);
    }
});

// ==========================================
// --- GPS TRACKING & ROUTE MANAGER (IndexedDB) ---
// ==========================================

// 🔴 ဒီစာကြောင်းလေးကို အသစ်ထည့်ပေးလိုက်ပါ
window.renderedSavedTracks = {}; 
window.getTrackColor = function() {
    let inp = document.getElementById('track_color_input') || document.getElementById('track_save_color_input');
    return (inp && inp.value) ? inp.value : (localStorage.getItem('pref_track_color') || '#3b82f6');
};

window.syncTrackColorInputs = function(color) {
    let panelInp = document.getElementById('track_color_input');
    let modalInp = document.getElementById('track_save_color_input');
    if (panelInp) panelInp.value = color;
    if (modalInp) modalInp.value = color;
    localStorage.setItem('pref_track_color', color);
    if (window.activeTrackLine) window.activeTrackLine.setStyle({ color: color });
};

window.onTrackColorChange = function(color) {
    window.syncTrackColorInputs(color);
};

// ၁။ Database တည်ဆောက်ခြင်း (ပိုမို ခိုင်မာသော စနစ်)
const initTrackDB = () => {
    let request = indexedDB.open("GPSConverterTrackDB", 1);
    
    request.onupgradeneeded = (e) => {
        let db = e.target.result;
        if (!db.objectStoreNames.contains("tracks")) {
            db.createObjectStore("tracks", { keyPath: "id" });
        }
    };
    
    request.onsuccess = (e) => {
        window.trackDB = e.target.result;
        // DB ရပြီဆိုတာနဲ့ ရှိပြီးသား Track တွေကို အရင်ဆုံး လှမ်းခေါ်ပြမယ်
        if (typeof window.loadTracksFromDB === 'function') {
            window.loadTracksFromDB();
        }
    };
    
    request.onerror = (e) => {
        console.error("Track Database Error:", e.target.error);
    };
};
// Page Load ဖြစ်တာနဲ့ DB ကို စတင်ခေါ်မည်
initTrackDB();

window.toggleTracking = function() {
    if (!window.isNativeGPSActive) return alert("⚠️ Please start GPS tracking first!");
    
    let btn = document.getElementById('trackBtn');
    window.isTrackingGPS = !window.isTrackingGPS;
    
    if (window.isTrackingGPS) {
        alert("✅ Route Tracking Started!"); 
        btn.innerHTML = "⏹️"; 
        btn.style.background = "#ef4444";
        btn.style.borderColor = "#b91c1c";
        
        window.currentTrackCoords = [];
        if (window.activeTrackLine && window.leafletMap) window.leafletMap.removeLayer(window.activeTrackLine);
        let trackColor = window.getTrackColor();
        window.activeTrackLine = L.polyline([], {color: trackColor, weight: 4, opacity: 0.8}).addTo(window.leafletMap);
    } else {
        btn.innerHTML = "👣"; 
        btn.style.background = "#3b82f6";
        btn.style.borderColor = "#2563eb";
        
        if (window.currentTrackCoords.length > 1) {
           document.getElementById('track_info_text').innerText = `Points recorded: ${window.currentTrackCoords.length}`;
            let nameInput = document.getElementById('track_name_input');
            nameInput.readOnly = false;
            nameInput.classList.remove('input-locked');
            window.syncTrackColorInputs(window.getTrackColor());
            document.getElementById('saveTrackModal').style.display = 'flex';
        } else {
            alert("⚠️ Not enough movement recorded. Walk at least a few meters before stopping.");
            if(window.activeTrackLine) window.leafletMap.removeLayer(window.activeTrackLine);
        }
    }
};

let originalGPSUpdateHook = window.onNativeGPSUpdate;
window.onNativeGPSUpdate = function(d) {
    if(typeof originalGPSUpdateHook === 'function') originalGPSUpdateHook(d);
    
    if (window.isTrackingGPS && window.currentLat && window.currentLon) {
        let pts = window.currentTrackCoords;
        let shouldAdd = true;
        
        if (pts.length > 0) {
            let lastPt = pts[pts.length - 1];
            let dist = calcDistance(lastPt[0], lastPt[1], window.currentLat, window.currentLon);
            if (dist < 2.0) shouldAdd = false; 
        }
        
        if (shouldAdd) {
            pts.push([window.currentLat, window.currentLon]);
            if (window.activeTrackLine) window.activeTrackLine.setLatLngs(pts);
        }
    }
};

window.cancelSaveTrack = function() {
    document.getElementById('saveTrackModal').style.display = 'none';
    if(window.activeTrackLine && window.leafletMap) window.leafletMap.removeLayer(window.activeTrackLine);
    window.currentTrackCoords = [];
};

window.confirmSaveTrack = function() {
    let nameInp = document.getElementById('track_name_input').value.trim();
    let name = nameInp ? nameInp : `Track_${new Date().getHours()}${new Date().getMinutes()}`;
    let trackId = new Date().getTime().toString();
    
    let trackObj = {
        id: trackId,
        name: name,
        date: new Date().toLocaleString(),
        color: window.getTrackColor(),
        coords: [...window.currentTrackCoords] 
    };
    
    // ချက်ချင်း Modal ပိတ်ပြီး ယာယီမျဉ်းကို ဖျောက်မည်
    document.getElementById('saveTrackModal').style.display = 'none';
    if (window.activeTrackLine && window.leafletMap) window.leafletMap.removeLayer(window.activeTrackLine);
    window.currentTrackCoords = [];

    if (!window.trackDB) {
        alert("⚠️ Database is not ready. Please try again.");
        return;
    }

    try {
        let tx = window.trackDB.transaction(["tracks"], "readwrite");
        let store = tx.objectStore("tracks");
        store.add(trackObj);
        
        tx.oncomplete = () => {
            document.getElementById('track_name_input').value = "";
            window.loadTracksFromDB(); // ဇယားကို အသစ်ပြန်ခေါ်မည်
            
            // 🔴 ဖြည့်စွက်ချက်: Save ပြီးတာနဲ့ မြေပုံပေါ်မှာ ချက်ချင်း အလိုအလျောက် ပြန်ပေါ်လာအောင် လုပ်ပေးမည်
            setTimeout(() => {
                let trackPanel = document.getElementById('track_manager_panel');
                if (trackPanel) trackPanel.style.display = 'block'; // Panel ကို အတင်းဖော်မည်
                
                // မြေပုံပေါ် Auto ဆွဲတင်မည်
                if (typeof window.toggleTrackOnMap === 'function') {
                    window.toggleTrackOnMap(trackId);
                }
            }, 300);

            alert("✅ Track saved successfully!");
        };
    } catch (e) {
        alert("⚠️ Error saving track: " + e.message);
    }
};

window.loadTracksFromDB = function() {
    if (!window.trackDB) return;
    let tx = window.trackDB.transaction(["tracks"], "readonly");
    let store = tx.objectStore("tracks");
    let req = store.getAll();
    
    req.onsuccess = (e) => {
        window.allSavedTracks = e.target.result;
        window.renderTrackListUI();
    };
};

window.renderTrackListUI = function() {
    let listDiv = document.getElementById('track_list_container');
    if (!listDiv) return;
    
    if (!window.allSavedTracks || window.allSavedTracks.length === 0) {
        listDiv.innerHTML = '<div style="text-align:center; color:var(--label-text); font-size: 12px; margin-top: 10px;">No tracks saved yet.</div>';
        return;
    }
    
    let html = '';
    window.allSavedTracks.forEach(t => {
        // Track လေးတွေက Map ပေါ်မှာ ပြနေသလား စစ်မယ်
        let isShowing = window.renderedSavedTracks && window.renderedSavedTracks[t.id] !== undefined;
        let btnColor = isShowing ? "#f59e0b" : "#10b981";
        let btnText = isShowing ? "🚫 Hide" : "👁️ Show";
        let trackColor = t.color || '#8b5cf6';
        
        // 🔴 ဖုန်း Screen အသေးတွေမှာပါ သပ်သပ်ရပ်ရပ် ပေါ်အောင် Style ကို သေချာပြင်ထားပါတယ်
        html += `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--input-border); padding:8px 5px;">
            <div style="flex:1; display:flex; align-items:center; gap:8px;">
                <span style="display:inline-block; width:14px; height:14px; border-radius:50%; background:${trackColor}; border:1.5px solid rgba(0,0,0,0.3); flex-shrink:0;"></span>
                <div style="line-height:1.3;">
                    <b style="color:var(--primary); font-size:13px;">${t.name}</b><br>
                    <span style="font-size:10px; color:var(--label-text);">${t.date} | Pts: ${t.coords ? t.coords.length : 0}</span>
                </div>
            </div>
            <div style="display:flex; gap:6px;">
                <button class="top-btn" style="background:${btnColor}; color:white; padding:5px 10px; font-size:11px;" onclick="toggleTrackOnMap('${t.id}')">${btnText}</button>
                <button class="top-btn" style="background:#ef4444; color:white; padding:5px 10px; font-size:11px;" onclick="deleteTrack('${t.id}')">🗑️</button>
            </div>
        </div>`;
    });
    listDiv.innerHTML = html;
};

window.toggleTrackOnMap = function(id) {
    // 🔴 ပြင်ဆင်ချက်: Number နဲ့ String ပြဿနာမတက်အောင် String() ခံပြီး ရှာမည်
    let track = window.allSavedTracks.find(t => String(t.id) === String(id));
    if (!track) return;

    if (window.renderedSavedTracks[id]) {
        // Hide
        window.leafletMap.removeLayer(window.renderedSavedTracks[id]);
        delete window.renderedSavedTracks[id];
    } else {
        // Show
        let trackColor = track.color || '#8b5cf6';
        let layer = L.polyline(track.coords, {color: trackColor, weight: 4, opacity: 0.8}).addTo(window.leafletMap);
        layer.bindTooltip(track.name, {sticky: true, direction: 'top'});
        window.renderedSavedTracks[id] = layer;
        window.leafletMap.fitBounds(layer.getBounds(), {padding: [30, 30]});
    }
    window.renderTrackListUI();
};

window.deleteTrack = function(id) {
    if(!confirm("Delete this track?")) return;
    
    if (window.renderedSavedTracks[id]) {
        window.leafletMap.removeLayer(window.renderedSavedTracks[id]);
        delete window.renderedSavedTracks[id];
    }
    
    // 🔴 ပြင်ဆင်ချက်: Database ထဲက မူရင်း ID Type အမှန် (Number လား String လား) ကို ပြန်ရှာပြီးမှ ဖျက်မည်
    let exactTrack = window.allSavedTracks.find(t => String(t.id) === String(id));
    if (!exactTrack) return;

    let tx = window.trackDB.transaction(["tracks"], "readwrite");
    tx.objectStore("tracks").delete(exactTrack.id);
    tx.oncomplete = () => window.loadTracksFromDB();
};

window.clearAllTracks = function() {
    if(!confirm("Are you sure you want to delete ALL saved tracks?")) return;
    for (let id in window.renderedSavedTracks) { window.leafletMap.removeLayer(window.renderedSavedTracks[id]); }
    window.renderedSavedTracks = {};
    let tx = window.trackDB.transaction(["tracks"], "readwrite");
    tx.objectStore("tracks").clear();
    tx.oncomplete = () => window.loadTracksFromDB();
};

window.exportTrackToKML = function() {
    if (!window.allSavedTracks || window.allSavedTracks.length === 0) return alert("No tracks to export!");
    
    let kmlString = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n<name>GPS_Converter_Tracks</name>\n<description>Exported GPS Tracks</description>`;

    window.allSavedTracks.forEach(t => {
        let coordsStr = t.coords.map(c => `${c[1]},${c[0]},0`).join(" ");
        kmlString += `\n<Placemark>\n  <name>${t.name}</name>\n  <description>Recorded: ${t.date}</description>\n  <LineString>\n    <coordinates>${coordsStr}</coordinates>\n  </LineString>\n</Placemark>`;
    });
    kmlString += `\n</Document>\n</kml>`;
    
    let fileName = `GPS_Converter_Tracks_${new Date().getTime()}.kml`;
    if (window.AndroidNative && window.AndroidNative.downloadConvertedKML) {
        window.AndroidNative.downloadConvertedKML(kmlString, fileName);
    } else {
        let blob = new Blob([kmlString], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8;' });
        let link = document.createElement("a"); link.href = URL.createObjectURL(blob);
        link.download = fileName; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
};

window.updateTrackUIVisibility = function() {
    let n = window.activeApp;
    let trackPanel = document.getElementById('track_manager_panel');
    let trackBtn = document.getElementById('trackBtn');
    
    let mapContainer = document.getElementById('shared_map_view');
    let isMapView = mapContainer && !mapContainer.classList.contains('hidden');

    if(trackPanel) {
        trackPanel.style.display = ((n === 1 || n === 2 || n === 5) && isMapView) ? 'block' : 'none';
    }
    if(trackBtn) {
        trackBtn.style.display = ((n === 1 || n === 2 || n === 5) && window.isNativeGPSActive && isMapView) ? 'block' : 'none';
    }
};

let hookSwitchAppForTrack = window.switchApp;
window.switchApp = function(n) {
    if(typeof hookSwitchAppForTrack === 'function') hookSwitchAppForTrack(n);
    setTimeout(window.updateTrackUIVisibility, 100);
};

let hookGpsToggleForTrack = window.toggleGlobalGPS;
window.toggleGlobalGPS = function() {
    if(typeof hookGpsToggleForTrack === 'function') hookGpsToggleForTrack();
    setTimeout(window.updateTrackUIVisibility, 100);
};

let hookUpdateTopoUI = window.updateTopoUI;
window.updateTopoUI = function() {
    if(typeof hookUpdateTopoUI === 'function') hookUpdateTopoUI();
    setTimeout(window.updateTrackUIVisibility, 100);
};

let hookCogoTool = window.openCogoTool;
window.openCogoTool = function(toolName) {
    if(typeof hookCogoTool === 'function') hookCogoTool(toolName);
    setTimeout(window.updateTrackUIVisibility, 100);
};

// ==========================================
// --- PROFILE & SECTION TOOL HOOKS ---
// ==========================================
let _oldOpenCogoToolProf = window.openCogoTool;
window.openCogoTool = function(toolName) {
    if(typeof _oldOpenCogoToolProf === 'function') _oldOpenCogoToolProf(toolName);
    
    if (toolName === 'prof') {
        // အခြား Tool တွေကို ဖျောက်ပြီး Profile Tool ကို ဖော်မည်
        ['cogo_area_tool', 'cogo_inv_tool', 'cogo_grad_tool', 'cogo_trv_tool', 'cogo_ecc_tool', 'cogo_topo_tool', 'cogo_vol_tool'].forEach(id => {
            let el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        
        document.getElementById('cogo_prof_tool').classList.remove('hidden');
        
        let titleEl = document.getElementById('cogo_tool_title');
        if(titleEl) {
            titleEl.innerText = '🛣️ Profile & Cross Section'; 
            titleEl.style.color = '#0284c7';
        }
        
        let mapContainer = document.getElementById('shared_map_view');
        if(mapContainer) mapContainer.classList.remove('hidden');
        
        let gpsBtn = document.getElementById('globalGpsBtn');
        if(gpsBtn) gpsBtn.classList.add('hidden');
        
        setTimeout(() => { 
            if(window.leafletMap) window.leafletMap.invalidateSize(); 
            if (typeof window.profUpdateBoundaryUI === 'function') window.profUpdateBoundaryUI();
        }, 300);
    }
};

window.toggleProfPanel = function() {
    let panel = document.getElementById('prof_controls_panel'); 
    let mapDiv = document.getElementById('map_view'); 
    let btn = document.getElementById('btn_toggle_prof_panel');
    
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
// 🔴 Profile Tool မပိတ်တဲ့ ပြဿနာကို ဖြေရှင်းပေးမည့် ကုဒ် (Fix)
// ==========================================
let _masterFixOpenCogoTool = window.openCogoTool;
window.openCogoTool = function(toolName) {
    // ၁။ မူလရှိပြီးသား Function တွေကို အရင်အလုပ်လုပ်ခိုင်းမည်
    if (typeof _masterFixOpenCogoTool === 'function') {
        _masterFixOpenCogoTool(toolName);
    }
    
    // ၂။ 'Profile Tool' ကလွဲပြီး တခြား Tool ကို နှိပ်လိုက်တာနဲ့ Profile Tool ကြီးကို အတင်း ဖျောက်(Hide) ပစ်မည်
    if (toolName !== 'prof') {
        let profTool = document.getElementById('cogo_prof_tool');
        if (profTool) {
            profTool.classList.add('hidden');
        }
    }
};


// ==========================================
// 🗂️ COLLAPSIBLE SECTIONS (Setting box များ ခေါက်/ဖြန့်)
// HTML မှာ section container တစ်ခုချင်းစီကို data-acc="panel:key" ဖြင့် မှတ်ထားသည်။
// ပထမဆုံး .v2-label က ခေါင်းစဉ် (နှိပ်ရင် ခေါက်/ဖြန့်)၊ ကျန်အရာအားလုံး body ဖြစ်သည်။
// ခေါက်ထားစဉ် ခေါင်းစဉ်အောက်မှာ အကျဉ်းတစ်ကြောင်း (accSetSummary) ပြနိုင်သည်။
// Style များကို style.css (.acc-*) ထဲမှာ။ ခေါက်ထားသော အခြေအနေကို Tab ပြောင်းလည်း မှတ်ထားသည်။
// ==========================================
window.accState = window.accState || {};      // key -> true (ခေါက်ထား)
window.ACC_DEFAULT_COLLAPSED = ['prof:common', 'prof:pf', 'prof:cs', 'map:layers'];   // အစမှာ ခေါက်ထားမည့်အရာများ

window.accSections = function(key) { return Array.prototype.slice.call(document.querySelectorAll('[data-acc="' + key + '"]')); };

window.accApply = function(sec) {
    let key = sec.getAttribute('data-acc'), collapsed = !!window.accState[key];
    if (collapsed) sec.classList.add('acc-collapsed'); else sec.classList.remove('acc-collapsed');
    let arrow = sec.querySelector('.acc-arrow');
    if (arrow) arrow.textContent = collapsed ? '\u25B8' : '\u25BE';
};

window.accInit = function() {
    window.ACC_DEFAULT_COLLAPSED.forEach(function(k) { if (window.accState[k] === undefined) window.accState[k] = true; });
    Array.prototype.slice.call(document.querySelectorAll('[data-acc]')).forEach(function(sec) {
        if (sec.getAttribute('data-acc-ready')) return;
        let head = null;
        for (let i = 0; i < sec.children.length; i++) { if (sec.children[i].classList.contains('v2-label')) { head = sec.children[i]; break; } }
        if (!head) return;
        let body = document.createElement('div');
        body.className = 'acc-body';
        let n = head.nextSibling;
        while (n) { let nx = n.nextSibling; body.appendChild(n); n = nx; }
        sec.appendChild(body);
        head.classList.add('acc-head');
        let arrow = document.createElement('span');
        arrow.className = 'acc-arrow';
        head.appendChild(arrow);
        let sum = document.createElement('span');
        sum.className = 'acc-sum';
        head.appendChild(sum);
        head.addEventListener('click', function() { window.accToggle(sec.getAttribute('data-acc')); });
        sec.setAttribute('data-acc-ready', '1');
        window.accApply(sec);
    });
};

window.accSet = function(keys, collapsed) {
    (Array.isArray(keys) ? keys : [keys]).forEach(function(k) {
        window.accState[k] = !!collapsed;
        window.accSections(k).forEach(window.accApply);
    });
};
window.accToggle = function(key) { window.accSet(key, !window.accState[key]); };
window.accCollapse = function(keys) { window.accSet(keys, true); };
window.accExpand = function(keys) { window.accSet(keys, false); };

// ခေါက်ထားစဉ် ခေါင်းစဉ်အောက်မှာပြမည့် အကျဉ်းစာသား
window.accSetSummary = function(key, text) {
    window.accSections(key).forEach(function(sec) {
        let s = sec.querySelector('.acc-sum');
        if (s) s.textContent = text || '';
    });
};

// prefix ("topo" / "vol" / "prof") ရှိသော section အားလုံးကို ခေါက်/ဖြန့်
window.accAll = function(prefix, expand) {
    let keys = [];
    Array.prototype.slice.call(document.querySelectorAll('[data-acc^="' + prefix + ':"]')).forEach(function(s) {
        let k = s.getAttribute('data-acc');
        if (keys.indexOf(k) < 0) keys.push(k);
    });
    window.accSet(keys, !expand);
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.accInit);
else window.accInit();

// ==========================================
// 🗺️ LAYERS BOX (Map layer on/off)
//  - အုပ်စုခွဲထား (DXF / Topo / Volume / Points / Map) - data ရှိမှ ထို အုပ်စုပေါ်
//  - ရွေးထားတာကို localStorage မှာ မှတ်ထား (refresh / tab ပြောင်းလည်း မပျောက်)
//  - applyLayerVisibility(): layer အားလုံးကို checkbox အတိုင်း ပြန်ညှိ (Tab ဖွင့်တိုင်း ခေါ်သည်)
// ==========================================
window.LAYER_STORE_KEY = 'svy_layer_states_v1';

window.layersLoadState = function() {
    try {
        let o = JSON.parse(localStorage.getItem(window.LAYER_STORE_KEY) || '{}');
        Object.keys(o).forEach(function(id) {
            let el = document.getElementById(id);
            if (el && el.type === 'checkbox') el.checked = !!o[id];
        });
    } catch (e) {}
};

window.layersSaveState = function() {
    let o = {};
    Array.prototype.slice.call(document.querySelectorAll('#layers_box input[type="checkbox"]')).forEach(function(el) { o[el.id] = el.checked; });
    try { localStorage.setItem(window.LAYER_STORE_KEY, JSON.stringify(o)); } catch (e) {}
};

// Data ရှိမှ အုပ်စုပြ၊ အဖွင့်အရေအတွက်ကို ခေါင်းစဉ်မှာပြ
window.refreshLayerBox = function() {
    let box = document.getElementById('layers_box');
    if (!box) return;
    let len = function(a) { return Array.isArray(a) ? a.length : 0; };
    let has = {
        dxf: len(window.rawDxfEntities) > 0,
        topo: len(window.topoPoints) > 0 || len(window.volPoints) > 0,
        volume: len(window.volSurface2Points) > 0 || len(window.savedVolAreas) > 0,
        pf: len(window.profAlignments) > 0,
        points: true, map: true
    };
    let on = 0, total = 0;
    Array.prototype.slice.call(box.querySelectorAll('.layer-group')).forEach(function(g) {
        let show = has[g.getAttribute('data-lg')] !== false;
        if (show) g.classList.remove('hidden'); else g.classList.add('hidden');
        if (!show) return;
        Array.prototype.slice.call(g.querySelectorAll('input[type="checkbox"]')).forEach(function(c) { total++; if (c.checked) on++; });
    });
    let cnt = document.getElementById('layers_count');
    if (cnt) cnt.textContent = '(' + on + '/' + total + ' on)';
};

// Layer အားလုံးကို checkbox အခြေအနေအတိုင်း ပြန်ညှိ (idempotent function များသာ ခေါ်သည်)
window.applyLayerVisibility = function() {
    // toggleTopoLayers() သည် checkbox အသစ်ဖြစ်လာမှ zoom ဖြစ်စေသည် - ပြန်ညှိရာတွင် မြေပုံမခုန်စေရန် အခြေအနေကို အရင်တူအောင်ထား
    if (typeof window.layerOn === 'function') {
        window._prevChkTopoPts = window.layerOn('tgl_topo_pts');
        window._prevChkContour = window.layerOn('tgl_topo_contours');
        window._prevChkSurf2 = window.layerOn('tgl_surf2_pts');
    }
    ['toggleTopoLayers', 'toggleVolBdyLayer', 'toggleDxfLayers', 'updateMapPointTexts', 'renderLabelLines', 'refreshContourLabels', 'profRenderSavedAlignments'].forEach(function(fn) {
        try { if (typeof window[fn] === 'function') window[fn](); } catch (e) { console.error('applyLayerVisibility', fn, e); }
    });
    window.refreshLayerBox();
};

window.layersInit = function() {
    window.layersLoadState();
    let box = document.getElementById('layers_box');
    if (box) box.addEventListener('change', function() { window.layersSaveState(); window.refreshLayerBox(); });
    window.refreshLayerBox();
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.layersInit);
else window.layersInit();
if (typeof setInterval === 'function') setInterval(function() { try { window.refreshLayerBox(); } catch (e) {} }, 1000);
