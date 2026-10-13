// ==========================================
// --- CONVERSIONS (SVY21 & MM2000 & GLOBAL) ---
// ==========================================

window.v2_sync = function(p, t) { let v = document.getElementById('v2_'+p+'_dd'); if(t === 'dd') { let n = parseFloat(v.value); if(isNaN(n)) return; let a = Math.abs(n), d = Math.floor(a), m = Math.floor((a-d)*60), s = ((a-d-m/60)*3600).toFixed(4); document.getElementById('v2_'+p+'_d').value = n < 0 ? -d : d; document.getElementById('v2_'+p+'_m').value = m; document.getElementById('v2_'+p+'_s').value = s; } else { let d = parseFloat(document.getElementById('v2_'+p+'_d').value) || 0; let m = parseFloat(document.getElementById('v2_'+p+'_m').value) || 0; let s = parseFloat(document.getElementById('v2_'+p+'_s').value) || 0; let sn = (d < 0 || document.getElementById('v2_'+p+'_d').value.includes('-')) ? -1 : 1; v.value = (sn * (Math.abs(d) + Math.abs(m)/60 + Math.abs(s)/3600)).toFixed(9); } };

window.v2_toggleUI = function() { let m = document.getElementById('v2_mode').value; document.getElementById('v2_ll_div').className = (m === 'LL2SVY') ? '' : 'hidden'; document.getElementById('v2_ne_div').className = (m === 'SVY2LL') ? '' : 'hidden'; };

window.v2_run = function() {
    let m = document.getElementById('v2_mode').value, wLa, wLo, sE, sN;
    if(m === 'LL2SVY') { wLa = parseFloat(document.getElementById('v2_lat_dd').value); wLo = parseFloat(document.getElementById('v2_lon_dd').value); if(isNaN(wLa) || isNaN(wLo)) return; let r = calc_v2_fwd(wLa, wLo); sN = r.N; sE = r.E; }
    else { sE = parseFloat(document.getElementById('v2_inp_e').value); sN = parseFloat(document.getElementById('v2_inp_n').value); if(isNaN(sE) || isNaN(sN)) return; let r = calc_v2_rev(sE, sN); wLa = r.lat; wLo = r.lon; }
    window.v2_map_lat = wLa; window.v2_map_lon = wLo;
    if (window.isNativeGPSActive && !(wLa >= 1.0 && wLa <= 2.0 && wLo >= 103.0 && wLo <= 104.5)) return document.getElementById('v2_out').innerHTML = `<div style="background:#fef2f2;border:2px solid #ef4444;color:#991b1b;padding:15px;border-radius:10px;text-align:center;margin-top:10px;"><b>⚠️ Out of Bounds</b></div>`;
    let utmZone = Math.floor((wLo + 180) / 6) + 1; let pW = m_project(wLa, wLo, utmZone, m_WGS); let wN = pW.n; let wE = pW.e;
    window.latest_local_N = sN; window.latest_local_E = sE; window.latest_wgs_N = wN; window.latest_wgs_E = wE; window.latest_lat = wLa; window.latest_lon = wLo;
    if(!window.isNativeGPSActive) { window.latest_Z = 0; fetchGeoidDataFromNative(wLa, wLo); }
    let geoidLabel = window.currentGeoidN ? `Geoid (N): ${window.currentGeoidN.toFixed(3)} m (${window.currentGeoidModel})` : `Geoid (N): N/A`;
    let out = `<div style="margin-bottom:10px;border-bottom:1px solid #ccc;padding-bottom:5px;"><b>SVY21 Datum</b><br>N: <span style="color:red">${sN.toFixed(3)} m</span>, E: <span style="color:red">${sE.toFixed(3)} m</span><br>Lat: ${wLa.toFixed(8)}° (DD)<br>Lon: ${wLo.toFixed(8)}° (DD)<br><span class="dms-span">${m_toDMS(wLa,1)} | ${m_toDMS(wLo,0)}</span><div class="badge-container"><span class="badge-local">🇸🇬 SVY21 Projection</span></div></div>`;
    out += `<div style="margin-bottom:10px;border-bottom:1px solid #ccc;padding-bottom:5px;"><b>WGS84 UTM</b><br>N: <span style="color:red">${wN.toFixed(3)} m</span>, E: <span style="color:red">${wE.toFixed(3)} m</span><br>Lat: ${wLa.toFixed(8)}° (DD)<br>Lon: ${wLo.toFixed(8)}° (DD)<br><span class="dms-span">${m_toDMS(wLa,1)} | ${m_toDMS(wLo,0)}</span><div class="badge-container"><span class="badge-global">🌍 UTM: ${getUTMZoneString(wLa,wLo)}</span></div></div>`;
    out += `<div class="meta-info-box" style="color:#1e40af;">${geoidLabel}</div>${window.isNativeGPSActive?`<div class="meta-info-box">${window.globalZText}</div>`:""}`;
    if (!window.isNativeGPSActive) out += getManualSaveBoxUI('SVY21', 'v2');
    document.getElementById('v2_out').innerHTML = out;
};

window.m_toggleUI = function() { let m = document.getElementById('m_mode').value; let n = (m === 'W_NE2LL' || m === 'W2M_NE' || m === 'M2W_NE'); document.getElementById('m_ll_div').className = n ? 'hidden' : ''; document.getElementById('m_ne_div').className = n ? '' : 'hidden'; };

window.m_sync = function(p, t) { let v = document.getElementById('m_'+p+'_dd'); if(t === 'dd') { let n = parseFloat(v.value); if(isNaN(n)) return; let a = Math.abs(n), d = Math.floor(a), m = Math.floor((a-d)*60), s = ((a-d-m/60)*3600).toFixed(4); document.getElementById('m_'+p+'_d').value = n < 0 ? -d : d; document.getElementById('m_'+p+'_m').value = m; document.getElementById('m_'+p+'_s').value = s; } else { let d = parseFloat(document.getElementById('m_'+p+'_d').value) || 0; let m = parseFloat(document.getElementById('m_'+p+'_m').value) || 0; let s = parseFloat(document.getElementById('m_'+p+'_s').value) || 0; let sn = (d < 0 || document.getElementById('m_'+p+'_d').value.includes('-')) ? -1 : 1; v.value = (sn * (Math.abs(d) + Math.abs(m)/60 + Math.abs(s)/3600)).toFixed(9); } if(!window.isNativeGPSActive && p === 'lon') window.autoDetectZone(parseFloat(v.value)); };

window.autoDetectZone = function(lon) { let m = document.getElementById('m_mode').value; if(m === 'W_LL2NE' || m === 'W2M_LL' || m === 'M2W_LL') { let z = Math.floor((lon+180)/6) + 1; if(z === 46 || z === 47) document.getElementById('m_zone').value = z.toString(); } };

window.m_run = function() {
    let m = document.getElementById('m_mode').value; let z = parseInt(document.getElementById('m_zone').value); let wLa, wLo, wE, wN, mLa, mLo, mE, mN;
    if(m === 'W_LL2NE') { wLa = parseFloat(document.getElementById('m_lat_dd').value); wLo = parseFloat(document.getElementById('m_lon_dd').value); if(isNaN(wLa)) return; let p = m_project(wLa, wLo, z, m_WGS); wE = p.e; wN = p.n; }
    else if(m === 'W_NE2LL') { wE = parseFloat(document.getElementById('m_inp_e').value); wN = parseFloat(document.getElementById('m_inp_n').value); if(isNaN(wE)) return; let i = m_inverse(wE, wN, z, m_WGS); wLa = i.lat; wLo = i.lon; }
    else if(m.startsWith('W2M')) {
        if(m === 'W2M_LL') { wLa = parseFloat(document.getElementById('m_lat_dd').value); wLo = parseFloat(document.getElementById('m_lon_dd').value); }
        else { wE = parseFloat(document.getElementById('m_inp_e').value); wN = parseFloat(document.getElementById('m_inp_n').value); let i = m_inverse(wE, wN, z, m_WGS); wLa = i.lat; wLo = i.lon; }
        let pW = m_project(wLa, wLo, z, m_WGS); wE = pW.e; wN = pW.n; let x = m_llh2xyz(wLa, wLo, 0, m_WGS); let mL = m_xyz2llh(x.x+m_DX, x.y+m_DY, x.z+m_DZ, m_EVE); mLa = mL.lat; mLo = mL.lon; let pM = m_project(mLa, mLo, z, m_EVE); mE = pM.e; mN = pM.n;
    } else {
        if(m === 'M2W_LL') { mLa = parseFloat(document.getElementById('m_lat_dd').value); mLo = parseFloat(document.getElementById('m_lon_dd').value); }
        else { mE = parseFloat(document.getElementById('m_inp_e').value); mN = parseFloat(document.getElementById('m_inp_n').value); let i = m_inverse(mE, mN, z, m_EVE); mLa = i.lat; mLo = i.lon; }
        let pM = m_project(mLa, mLo, z, m_EVE); mE = pM.e; mN = pM.n; let x = m_llh2xyz(mLa, mLo, 0, m_EVE); let wL = m_xyz2llh(x.x-m_DX, x.y-m_DY, x.z-m_DZ, m_WGS); wLa = wL.lat; wLo = wL.lon; let pW = m_project(wLa, wLo, z, m_WGS); wE = pW.e; wN = pW.n;
    }
    window.m_map_lat = wLa; window.m_map_lon = wLo;
    if (window.isNativeGPSActive && !(wLa >= 9.0 && wLa <= 29.0 && wLo >= 92.0 && wLo <= 102.0)) return document.getElementById('m_out').innerHTML = `<div style="background:#fef2f2;border:2px solid #ef4444;color:#991b1b;padding:15px;border-radius:10px;text-align:center;margin-top:10px;"><b>⚠️ Out of Bounds</b></div>`;
    if(m.includes('W2M') || m.includes('M2W')) { window.latest_local_N = mN; window.latest_local_E = mE; } else { window.latest_local_N = wN; window.latest_local_E = wE; }
    window.latest_wgs_N = wN; window.latest_wgs_E = wE; window.latest_lat = wLa; window.latest_lon = wLo;
    if(!window.isNativeGPSActive) { window.latest_Z = 0; fetchGeoidDataFromNative(wLa, wLo); }
    let geoidLabel = window.currentGeoidN ? `Geoid (N): ${window.currentGeoidN.toFixed(3)} m (${window.currentGeoidModel})` : `Geoid (N): N/A`;
    let out = "";
    if(m.includes('W2M')) out += m_fmt("MM2000", mLa, mLo, mE, mN, geoidLabel) + m_fmt("WGS84", wLa, wLo, wE, wN, geoidLabel);
    else if(m.includes('M2W')) out += m_fmt("WGS84", wLa, wLo, wE, wN, geoidLabel) + m_fmt("MM2000", mLa, mLo, mE, mN, geoidLabel);
    else out += m_fmt("WGS84", wLa, wLo, wE, wN, geoidLabel);
    if (!window.isNativeGPSActive) out += getManualSaveBoxUI('MM2000', 'm');
    document.getElementById('m_out').innerHTML = out;
};

window.g_toggleUI = function() { 
    let m = document.getElementById('g_mode').value; 
    let n = (m === 'UTM2LL'); 
    document.getElementById('g_ll_div').className = n ? 'hidden' : ''; 
    document.getElementById('g_ne_div').className = n ? '' : 'hidden'; 
};

window.g_sync = function(p, t) { 
    let v = document.getElementById('g_'+p+'_dd'); 
    if(t === 'dd') { 
        let n = parseFloat(v.value); if(isNaN(n)) return; 
        let a = Math.abs(n), d = Math.floor(a), m = Math.floor((a-d)*60), s = ((a-d-m/60)*3600).toFixed(4); 
        document.getElementById('g_'+p+'_d').value = n < 0 ? -d : d; 
        document.getElementById('g_'+p+'_m').value = m; document.getElementById('g_'+p+'_s').value = s; 
    } else { 
        let d = parseFloat(document.getElementById('g_'+p+'_d').value) || 0; 
        let m = parseFloat(document.getElementById('g_'+p+'_m').value) || 0; 
        let s = parseFloat(document.getElementById('g_'+p+'_s').value) || 0; 
        let sn = (d < 0 || document.getElementById('g_'+p+'_d').value.includes('-')) ? -1 : 1; 
        v.value = (sn * (Math.abs(d) + Math.abs(m)/60 + Math.abs(s)/3600)).toFixed(9); 
    } 
    if (p === 'lon') {
        let lonVal = parseFloat(v.value);
        if (!isNaN(lonVal)) document.getElementById('g_zone').value = Math.floor((lonVal + 180) / 6) + 1;
    }
    if (p === 'lat') {
        let latVal = parseFloat(v.value);
        if (!isNaN(latVal)) document.getElementById('g_hemi').value = latVal >= 0 ? 'N' : 'S';
    }
};

window.g_run = function() {
    let m = document.getElementById('g_mode').value, lat, lon, n, e, zone, hemi;
    
    zone = parseInt(document.getElementById('g_zone').value);
    hemi = document.getElementById('g_hemi').value;
    
    if(m === 'LL2UTM') {
        lat = parseFloat(document.getElementById('g_lat_dd').value); 
        lon = parseFloat(document.getElementById('g_lon_dd').value);
        if(isNaN(lat) || isNaN(lon)) return;
        
        if (isNaN(zone)) {
            zone = Math.floor((lon + 180) / 6) + 1;
            document.getElementById('g_zone').value = zone;
        }
        
        let pW = m_project(lat, lon, zone, m_WGS); e = pW.e; n = pW.n;
        if (hemi === 'S') n += 10000000;
    } else {
        e = parseFloat(document.getElementById('g_inp_e').value); 
        n = parseFloat(document.getElementById('g_inp_n').value);
        if(isNaN(e) || isNaN(n) || isNaN(zone)) return;
        
        let calcN = n; if (hemi === 'S') calcN -= 10000000;
        let iW = m_inverse(e, calcN, zone, m_WGS); lat = iW.lat; lon = iW.lon;
    }
    
    window.g_map_lat = lat; window.g_map_lon = lon; window.latest_lat = lat; window.latest_lon = lon; window.latest_wgs_N = n; window.latest_wgs_E = e; window.latest_local_N = n; window.latest_local_E = e;
    if(!window.isNativeGPSActive) { window.latest_Z = 0; fetchGeoidDataFromNative(lat, lon); }
    let geoidLabel = window.currentGeoidN ? `Geoid (N): ${window.currentGeoidN.toFixed(3)} m (${window.currentGeoidModel})` : `Geoid (N): N/A`;
    let currentZText = window.isNativeGPSActive ? `MSL (Geoid): ${window.latest_Z.toFixed(3)} m` : `Z (Manual): --.--- m`;
    let out = `<div style="margin-bottom:10px;border-bottom:1px solid #ccc;padding-bottom:5px;"><b>Global UTM (WGS84)</b><br>N: <span style="color:red">${n.toFixed(3)} m</span>, E: <span style="color:red">${e.toFixed(3)} m</span><br>Lat: ${lat.toFixed(8)}° (DD)<br>Lon: ${lon.toFixed(8)}° (DD)<br><span class="dms-span">${m_toDMS(lat,1)} | ${m_toDMS(lon,0)}</span><div class="badge-container"><span class="badge-global">🌍 Zone ${zone} ${hemi}</span></div><div class="meta-info-box">${geoidLabel}<br>${currentZText}</div></div>`;
    if (!window.isNativeGPSActive) out += getManualSaveBoxUI(`UTM Zone ${zone}${hemi}`, 'g');
    document.getElementById('g_out').innerHTML = out;
};

function getManualSaveBoxUI(datumLabel, prefix) { return `<div style="margin-top:15px; border-top:1px dashed var(--input-border); padding-top:12px;"><div style="font-size:13px;font-weight:bold;color:var(--primary);margin-bottom:10px;text-align:center;">💾 Save Converted Point</div><div style="display:flex; gap:8px; margin-bottom:10px;"><input type="text" id="${prefix}_man_pt" class="v2-input" placeholder="Point (P)" style="flex:1; padding:10px; margin:0;"><input type="text" id="${prefix}_man_desc" class="v2-input" placeholder="Code (D)" style="flex:2; padding:10px; margin:0;"></div><div style="display:flex; gap:8px; margin-bottom:8px;"><button class="btn-action" style="flex:1; background:#1e40af; padding:12px; font-size:12px;" onclick="saveManualPoint('${datumLabel}', '${prefix}')">💾 Save Point</button></div><div style="display:flex; gap:8px;"><button class="btn-action" style="flex:1; background:#f59e0b; padding:12px; font-size:12px;" onclick="triggerExport()">📁 Export CSV</button><button class="btn-action" style="flex:1; background:#ef4444; padding:12px; font-size:12px;" onclick="triggerClearRecords()">🗑️ Clear Records</button></div><div id="${prefix}_man_stat" style="margin-top:10px; font-size:13px; font-weight:bold; color:#059669; text-align:center;"></div></div>`; }

function m_fmt(t, la, lo, e, n, gLabel) { return `<div style="margin-bottom:10px;border-bottom:1px solid #ccc;padding-bottom:5px;"><b>${t}</b><br>N: <span style="color:red">${n.toFixed(3)} m</span>, E: <span style="color:red">${e.toFixed(3)} m</span><br>Lat: ${la.toFixed(8)}° (DD)<br>Lon: ${lo.toFixed(8)}° (DD)<br><span class="dms-span">${m_toDMS(la,1)} | ${m_toDMS(lo,0)}</span><div class="badge-container"><span class="badge-local">${t==="MM2000"?"🇲🇲 MM2000 Datum":"🌐 WGS84 System"}</span><span class="badge-global">🌍 UTM: ${getUTMZoneString(la,lo)}</span></div><div class="meta-info-box" style="color:#1e40af;">${gLabel}</div>${window.isNativeGPSActive?`<div class="meta-info-box">${window.globalZText}</div>`:""}</div>`; }

window.v2_reset = function() { if(!window.isNativeGPSActive) { document.querySelectorAll('#app1_view input').forEach(i => i.value=''); window.latest_local_N=0; window.latest_local_E=0; window.latest_wgs_N=0; window.latest_wgs_E=0; window.latest_Z=0; } document.getElementById('v2_out').innerHTML='<p style="text-align:center;opacity:0.5;margin-top:30px;">Results will appear here</p>'; window.v2_map_lat = window.v2_map_lon = null; };
window.m_reset = function() { if(!window.isNativeGPSActive) { document.querySelectorAll('#app2_view input').forEach(i => i.value=''); window.latest_local_N=0; window.latest_local_E=0; window.latest_wgs_N=0; window.latest_wgs_E=0; window.latest_Z=0; } document.getElementById('m_out').innerHTML='<p style="text-align:center;opacity:0.5;margin-top:30px;">Results will appear here</p>'; window.m_map_lat = window.m_map_lon = null; };
window.g_reset = function() { if(!window.isNativeGPSActive) { document.querySelectorAll('#app5_view input').forEach(i => i.value=''); window.latest_local_N=0; window.latest_local_E=0; window.latest_wgs_N=0; window.latest_wgs_E=0; window.latest_Z=0; } document.getElementById('g_out').innerHTML='<p style="text-align:center;opacity:0.5;margin-top:30px;">Results will appear here</p>'; window.g_map_lat = window.g_map_lon = null; };

window.v2_map = function() { 
    if(window.v2_map_lat) {
        window.open(`https://www.google.com/maps/search/?api=1&query=${window.v2_map_lat},${window.v2_map_lon}`, '_blank');
    } else { alert("Calculate first!"); } 
};
window.m_map = function() { 
    if(window.m_map_lat) {
        window.open(`https://www.google.com/maps/search/?api=1&query=${window.m_map_lat},${window.m_map_lon}`, '_blank');
    } else { alert("Calculate first!"); } 
};
window.g_map = function() { 
    if(window.g_map_lat) {
        window.open(`https://www.google.com/maps/search/?api=1&query=${window.g_map_lat},${window.g_map_lon}`, '_blank');
    } else { alert("Calculate first!"); } 
};
