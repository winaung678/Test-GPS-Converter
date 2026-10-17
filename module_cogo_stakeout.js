// ==========================================
// --- RECORDING, CSV, STAKEOUT & COGO LOGIC ---
// ==========================================

function incrementPointName(p) {
    let match = p.match(/^(.*?)(\d+)$/);
    if (match) {
        let prefix = match[1];
        let numStr = match[2];
        let newNum = parseInt(numStr, 10) + 1;
        let paddedNum = newNum.toString().padStart(numStr.length, '0');
        return prefix + paddedNum;
    } else {
        if (!isNaN(parseInt(p, 10))) return (parseInt(p, 10) + 1).toString();
        return p + "1";
    }
}

window.saveManualPoint = function(datumLabel, prefix) {
    let pInp = document.getElementById(prefix + '_man_pt');
    let dInp = document.getElementById(prefix + '_man_desc');
    let p = pInp ? pInp.value || "1" : "1";
    let d = dInp ? dInp.value || "" : "";
    
    window.recordedPointsBank.push({
        p: p, lN: window.latest_local_N, lE: window.latest_local_E,
        wLa: window.latest_lat, wLo: window.latest_lon,
        wN: window.latest_wgs_N, wE: window.latest_wgs_E,
        z: window.latest_Z, d: d, datum: datumLabel
    });
    
    localStorage.setItem('surveyProRecords', JSON.stringify(window.recordedPointsBank));
    let statBox = document.getElementById(prefix + '_man_stat');
    if (statBox) statBox.innerHTML = `✅ Point [${p}] Saved!`;
    
    if (window.AndroidNative && window.AndroidNative.savePoint) {
        window.AndroidNative.savePoint(p, window.latest_local_N.toFixed(3), window.latest_local_E.toFixed(3), window.latest_Z.toFixed(3), d);
    }
    
    if (pInp) pInp.value = incrementPointName(p);
    window.plotRecordedPointsOnMap();
    window.refreshPointsAfterDataChange();
};

window.triggerRecord = function(isPrecise) {
    if (!window.isNativeGPSActive) return alert("⚠️ Please start GPS tracking first!");
    if ((window.activeApp === 1 || window.activeApp === 2 || window.activeApp === 5) && (window.latest_local_N === 0 && window.latest_wgs_N === 0)) {
        return alert("⚠️ Please wait for valid GPS data!");
    }

    let lat = window.latest_lat;
    let lon = window.latest_lon;
    if (window.activeApp === 1) {
        if (!(lat >= 1.0 && lat <= 2.0 && lon >= 103.0 && lon <= 104.5)) return alert("⚠️ Out of Bounds! You are not in Singapore Datum limit.");
    } else if (window.activeApp === 2) {
        if (!(lat >= 9.0 && lat <= 29.0 && lon >= 92.0 && lon <= 102.0)) return alert("⚠️ Out of Bounds! You are not in Myanmar Datum limit.");
    }

    if (isPrecise) {
        if (window.isAveraging) return;
        window.isAveraging = true;
        window.avgDataBuffer = [];
        let secondsLeft = 10;
        document.getElementById('avg_timer_display').style.display = 'block';
        document.getElementById('record_status').style.display = 'none';
        document.getElementById('avg_sec_left').innerText = secondsLeft;
        
        window.avgInterval = setInterval(() => {
            secondsLeft--;
            document.getElementById('avg_sec_left').innerText = secondsLeft;
            window.avgDataBuffer.push({ lN: window.latest_local_N, lE: window.latest_local_E, wLa: window.latest_lat, wLo: window.latest_lon, wN: window.latest_wgs_N, wE: window.latest_wgs_E, Z: window.latest_Z });
            if (secondsLeft <= 0) {
                clearInterval(window.avgInterval);
                window.isAveraging = false;
                document.getElementById('avg_timer_display').style.display = 'none';
                let sum_lN = 0, sum_lE = 0, sum_wLa = 0, sum_wLo = 0, sum_wN = 0, sum_wE = 0, sum_Z = 0;
                let count = window.avgDataBuffer.length;
                window.avgDataBuffer.forEach(d => { sum_lN += d.lN; sum_lE += d.lE; sum_wLa += d.wLa; sum_wLo += d.wLo; sum_wN += d.wN; sum_wE += d.wE; sum_Z += d.Z; });
                savePointToDevice(sum_lN / count, sum_lE / count, sum_wLa / count, sum_wLo / count, sum_wN / count, sum_wE / count, sum_Z / count, true);
            }
        }, 1000);
    } else {
        savePointToDevice(window.latest_local_N, window.latest_local_E, window.latest_lat, window.latest_lon, window.latest_wgs_N, window.latest_wgs_E, window.latest_Z, false);
    }
};

function savePointToDevice(lN, lE, la, lo, wN, wE, Z, isAveraged) {
    let pInput = document.getElementById('pt_id');
    let p = pInput ? pInput.value || "1" : "1";
    let d = document.getElementById('pt_desc').value || "";
    let zStr = Z.toFixed(3);
    let typeLabel = (window.activeApp === 1) ? "SVY21" : (window.activeApp === 2) ? "MM2000" : `UTM Z${Math.floor((lo + 180) / 6) + 1}`;
    
    window.recordedPointsBank.push({ p: p, lN: lN, lE: lE, wLa: la, wLo: lo, wN: wN, wE: wE, z: Z, d: d, datum: typeLabel });
    localStorage.setItem('surveyProRecords', JSON.stringify(window.recordedPointsBank));
    
    let statBox = document.getElementById('record_status');
    statBox.style.display = 'block';
    statBox.innerHTML = `✅ Point [${p}] Saved! ${isAveraged ? "<span style='color:#8b5cf6;'>[10s Avg]</span>" : ""}<br><span style="color:#0f172a;font-weight:normal;">N: ${lN.toFixed(3)} | E: ${lE.toFixed(3)} | Z: ${zStr}</span>`;
    
    if (window.AndroidNative && window.AndroidNative.savePoint) window.AndroidNative.savePoint(p, lN.toFixed(3), lE.toFixed(3), zStr, d);
    
    if (pInput) pInput.value = incrementPointName(p);
    window.plotRecordedPointsOnMap();
    window.refreshPointsAfterDataChange();
}

window.deleteRecordedPoint = function(index) {
    if (!confirm("Delete this point permanently?")) return;
    window.recordedPointsBank.splice(index, 1);
    localStorage.setItem('surveyProRecords', JSON.stringify(window.recordedPointsBank));
    if (window.leafletMap) window.leafletMap.closePopup();
    window.plotRecordedPointsOnMap();
    window.refreshPointsAfterDataChange();
};

window.triggerExport = function() {
    if (window.recordedPointsBank.length === 0) return alert("No points recorded yet!");
    let csvContent = "Point,Local_N,Local_E,WGS_Lat,WGS_Lon,WGS_UTM_N,WGS_UTM_E,Z_MSL,Description,Datum\n";
    window.recordedPointsBank.forEach(pt => { csvContent += `${pt.p},${pt.lN.toFixed(3)},${pt.lE.toFixed(3)},${pt.wLa.toFixed(8)},${pt.wLo.toFixed(8)},${pt.wN.toFixed(3)},${pt.wE.toFixed(3)},${pt.z.toFixed(3)},${pt.d},${pt.datum}\n`; });
    let fileName = `GPS_Converter_Records_${new Date().getTime()}.csv`;
    
    if (window.AndroidNative && window.AndroidNative.downloadConvertedCSV) {
        window.AndroidNative.downloadConvertedCSV(csvContent, fileName);
    } else {
        let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        let link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

window.triggerClearRecords = function() {
    if (confirm("Are you sure you want to clear ALL saved points?")) {
        window.recordedPointsBank = [];
        localStorage.removeItem('surveyProRecords');
        if (window.AndroidNative && window.AndroidNative.clearRecordedPoints) window.AndroidNative.clearRecordedPoints();
        ['pt_id', 'v2_man_pt', 'm_man_pt', 'g_man_pt'].forEach(id => { let e = document.getElementById(id); if (e) e.value = '1'; });
        ['pt_desc', 'v2_man_desc', 'm_man_desc', 'g_man_desc'].forEach(id => { let e = document.getElementById(id); if (e) e.value = ''; });
        let statBox = document.getElementById('record_status');
        if (statBox) { statBox.style.display = 'none'; statBox.innerHTML = ''; }
        ['v2_man_stat', 'm_man_stat', 'g_man_stat'].forEach(id => { let e = document.getElementById(id); if (e) e.innerHTML = ''; });
        if (window.recordedLayerGroup) window.recordedLayerGroup.clearLayers();
        
        // 🔴 ဒီနေရာလေးမှာ အောက်က တစ်ကြောင်းကို အသစ် ဝင်ထည့်ပေးလိုက်ပါ
        if (typeof window.updateMapPointTexts === 'function') window.updateMapPointTexts();

        alert("All saved points have been cleared!");
    }
};

window.handleCSVFile = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    let statBox = document.getElementById('csv_status');
    let dlBtn = document.getElementById('csv_download_btn');
    if (statBox) { statBox.style.display = 'block'; statBox.innerHTML = `⏳ Processing <b>${file.name}</b>...`; }
    if (dlBtn) { dlBtn.style.display = 'none'; }
    const reader = new FileReader();
    reader.onload = function(e) { processCSVText(e.target.result, file.name, parseInt(document.getElementById('csv_mode').value)); };
    reader.onerror = function() { if (statBox) statBox.innerHTML = "❌ Failed to read CSV file."; };
    reader.readAsText(file);
};

function processCSVText(csvText, originalFileName, mode) {
    let lines = csvText.split('\n');
    let outCSV = "Point,Local_N,Local_E,WGS_Lat,WGS_Lon,WGS_UTM_N,WGS_UTM_E,Z,Description\n";
    let successCount = 0;
    let dName = (window.activeApp === 1) ? "SVY21" : (window.activeApp === 2) ? "MM2000" : "Global UTM";
    let csvUserZone = parseInt(document.getElementById('csv_zone_inp')?.value) || 47;
    let csvUserHemi = document.getElementById('csv_hemi_inp')?.value || 'N';

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        let cols = line.split(',');
        let p = cols[0].trim();
        let val1 = parseFloat(cols[1]);
        let val2 = parseFloat(cols[2]);
        if (isNaN(val1) || isNaN(val2)) continue;
        let z = parseFloat(cols[3]) || 0.000;
        let d = cols.length > 4 ? cols.slice(4).join(',').trim() : "";
        let lN = 0, lE = 0, wLa = 0, wLo = 0, wN = 0, wE = 0;

        if (window.activeApp === 1) {
            if (mode === 1) {
                lN = val1; lE = val2; let r = calc_v2_rev(lE, lN); wLa = r.lat; wLo = r.lon;
                let pW = m_project(wLa, wLo, 48, m_WGS); wE = pW.e; wN = pW.n;
            } else if (mode === 2) {
                wLa = val1; wLo = val2; let r = calc_v2_fwd(wLa, wLo); lN = r.N; lE = r.E;
                let pW = m_project(wLa, wLo, Math.floor((wLo + 180) / 6) + 1, m_WGS); wE = pW.e; wN = pW.n;
            } else if (mode === 3) {
                wN = val1; wE = val2; let i = m_inverse(wE, wN, 48, m_WGS); wLa = i.lat; wLo = i.lon;
                let r = calc_v2_fwd(wLa, wLo); lN = r.N; lE = r.E;
            }
        } else if (window.activeApp === 2) {
            let z_utm = csvUserZone;
            if (mode === 1) {
                lE = val2; lN = val1; let i_m = m_inverse(lE, lN, z_utm, m_EVE); let mLa = i_m.lat; let mLo = i_m.lon;
                let x = m_llh2xyz(mLa, mLo, 0, m_EVE); let wL = m_xyz2llh(x.x - m_DX, x.y - m_DY, x.z - m_DZ, m_WGS); wLa = wL.lat; wLo = wL.lon;
                let pW = m_project(wLa, wLo, z_utm, m_WGS); wE = pW.e; wN = pW.n;
            } else if (mode === 2) {
                wLa = val1; wLo = val2; let pW = m_project(wLa, wLo, z_utm, m_WGS); wE = pW.e; wN = pW.n;
                let x = m_llh2xyz(wLa, wLo, 0, m_WGS); let mL = m_xyz2llh(x.x + m_DX, x.y + m_DY, x.z + m_DZ, m_EVE);
                let pM = m_project(mL.lat, mL.lon, z_utm, m_EVE); lE = pM.e; lN = pM.n;
            } else if (mode === 3) {
                wN = val1; wE = val2; let i_w = m_inverse(wE, wN, z_utm, m_WGS); wLa = i_w.lat; wLo = i_w.lon;
                let x = m_llh2xyz(wLa, wLo, 0, m_WGS); let mL = m_xyz2llh(x.x + m_DX, x.y + m_DY, x.z + m_DZ, m_EVE);
                let pM = m_project(mL.lat, mL.lon, z_utm, m_EVE); lE = pM.e; lN = pM.n;
            }
        } else if (window.activeApp === 5) {
            if (mode === 1 || mode === 3) {
                lE = val2; lN = val1; wE = lE; wN = lN; let calcN = wN;
                if (csvUserHemi === 'S') calcN -= 10000000;
                let i_w = m_inverse(wE, calcN, csvUserZone, m_WGS); wLa = i_w.lat; wLo = i_w.lon;
            } else if (mode === 2) {
                wLa = val1; wLo = val2; let autoZone = Math.floor((wLo + 180) / 6) + 1;
                let autoHemi = wLa >= 0 ? 'N' : 'S'; let pW = m_project(wLa, wLo, autoZone, m_WGS);
                wE = pW.e; wN = pW.n; if (autoHemi === 'S') wN += 10000000; lE = wE; lN = wN;
            }
        }
        outCSV += `${p},${lN.toFixed(3)},${lE.toFixed(3)},${wLa.toFixed(8)},${wLo.toFixed(8)},${wN.toFixed(3)},${wE.toFixed(3)},${z.toFixed(3)},${d}\n`;
        successCount++;
    }
    
    let statBox = document.getElementById('csv_status');
    if (successCount > 0) {
        window.finalCSVOutput = outCSV;
        if (statBox) statBox.innerHTML = `✅ Successfully converted <b>${successCount}</b> points! (${dName})`;
        let dlBtn = document.getElementById('csv_download_btn');
        if (dlBtn) dlBtn.style.display = 'block';
    } else {
        if (statBox) statBox.innerHTML = `⚠️ No valid points found. Check your PNEZD format.`;
    }
    document.getElementById('csv_file').value = "";
}

window.downloadCSV = function() {
    if (!window.finalCSVOutput) return;
    let dName = (window.activeApp === 1) ? "SVY21" : (window.activeApp === 2) ? "MM2000" : "Global_UTM";
    let fileName = `Converted_${dName}_Points.csv`;
    if (window.AndroidNative && window.AndroidNative.downloadConvertedCSV) {
        window.AndroidNative.downloadConvertedCSV(window.finalCSVOutput, fileName);
    } else {
        let blob = new Blob([window.finalCSVOutput], { type: 'text/csv;charset=utf-8;' });
        let url = URL.createObjectURL(blob);
        let link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

window.clearCSVFile = function() {
    let csvFileInput = document.getElementById('csv_file');
    if (csvFileInput) csvFileInput.value = "";
    let statusBox = document.getElementById('csv_status');
    if (statusBox) statusBox.style.display = 'none';
    let dlBtn = document.getElementById('csv_download_btn');
    if (dlBtn) dlBtn.style.display = 'none';
    window.finalCSVOutput = "";
};

window.importTopoToSetOut = function() {
    let gpsPts = window.recordedPointsBank || [];
    let topoCsvPts = window.topoPoints || [];

    if (gpsPts.length === 0 && topoCsvPts.length === 0) return alert("No GPS Points or Topo CSV Points available!");

    let addedCount = 0;
    
    gpsPts.forEach(pt => {
        let exists = window.setOutPoints.some(s => s.p === pt.p && Math.abs(s.lat - pt.wLa) < 0.00001 && Math.abs(s.lon - pt.wLo) < 0.00001);
        if (!exists) { 
            window.setOutPoints.push({p: pt.p, lat: pt.wLa, lon: pt.wLo, z: pt.z, d: pt.d}); 
            addedCount++; 
        }
    });

    let datum = document.getElementById('topo_datum') ? document.getElementById('topo_datum').value : "WGS_LL";

    topoCsvPts.forEach(pt => {
        let tLat = 0, tLon = 0;
        
        if (datum === 'LOCAL') {
            tLat = (pt.n - (window.localOffsetN || 0)) / 100000;
            tLon = (pt.e - (window.localOffsetE || 0)) / 100000;
        } else if (datum === "SVY21") {
            let r = calc_v2_rev(pt.e, pt.n); tLat = r.lat; tLon = r.lon;
        } else if (datum.startsWith("MM")) {
            let zone = parseInt(datum.slice(-2)); let r = m_inverse(pt.e, pt.n, zone, m_EVE);
            let x = m_llh2xyz(r.lat, r.lon, 0, m_EVE); let w = m_xyz2llh(x.x-m_DX, x.y-m_DY, x.z-m_DZ, m_WGS);
            tLat = w.lat; tLon = w.lon;
        } else if (datum.startsWith("WGS_UTM")) {
            let zone = parseInt(datum.slice(-2)); let i = m_inverse(pt.e, pt.n, zone, m_WGS); tLat = i.lat; tLon = i.lon;
        } else if (datum === "GLOBAL_UTM") {
            let zInput = document.getElementById('topo_custom_zone'); let hInput = document.getElementById('topo_custom_hemi');
            let zone = (zInput && zInput.value) ? parseInt(zInput.value) : 47; let hemi = hInput ? hInput.value : 'N';
            let calcN = pt.n; if (hemi === 'S') calcN -= 10000000; let i_w = m_inverse(pt.e, calcN, zone, m_WGS); tLat = i_w.lat; tLon = i_w.lon;
        }

        if (tLat !== 0 && tLon !== 0 && !isNaN(tLat)) {
             let exists = window.setOutPoints.some(s => s.p === pt.p && Math.abs(s.lat - tLat) < 0.00001 && Math.abs(s.lon - tLon) < 0.00001);
             if (!exists) { 
                 window.setOutPoints.push({p: pt.p, lat: tLat, lon: tLon, z: pt.z, d: pt.d}); 
                 addedCount++; 
             }
        }
    });

    if (addedCount > 0) {
        savePointsToStorage(); 
        updateTargetDropdown(); 
        window.plotPointsOnMap(); 
        window.refreshPointsAfterDataChange(); 
        window.populateAreaPoints();
        alert(`Successfully imported ${addedCount} points from GPS & Topo CSV!`);
    } else { 
        alert("All points are already in the list. No new points found."); 
    }
};

function savePointsToStorage() { localStorage.setItem('surveyProSetOutPoints', JSON.stringify(window.setOutPoints)); }

function loadPointsFromStorage() {
    let stored = localStorage.getItem('surveyProSetOutPoints');
    if (stored) {
        window.setOutPoints = JSON.parse(stored);
        updateTargetDropdown();
        if (window.leafletMap) window.plotPointsOnMap();
    }
}

window.setOutFromMapClick = function(lat, lon) {
    window.leafletMap.closePopup();
    document.getElementById('so_target_list').value = "";
    activateTarget({p: "Map Tap", lat: parseFloat(lat), lon: parseFloat(lon), z: 0, d: "Manual Map Tap"});
};
function activateTarget(pt) {
    window.targetPoint = pt;
    document.getElementById('map_container').classList.add('hide-names');
    
    if (window.markerTarget) window.leafletMap.removeLayer(window.markerTarget);
    
    window.markerTarget = L.circleMarker([window.targetPoint.lat, window.targetPoint.lon], {radius: 7, color: '#1e3a8a', weight: 2, fillColor: '#f59e0b', fillOpacity: 1}).addTo(window.leafletMap);
    window.markerTarget.bindTooltip(`${window.targetPoint.p}`, {permanent: true, direction: 'top', className: 'pt-tooltip target-tooltip', offset: [0, -5]}).openTooltip();
    
    window.isAutoCenter = true;
    document.getElementById('autoCenterBtn').classList.add('active');
    
    if (window.currentLat !== 0) {
        let bounds = L.latLngBounds([window.currentLat, window.currentLon], [window.targetPoint.lat, window.targetPoint.lon]);
        window.leafletMap.flyToBounds(bounds, {padding: [50, 50], maxZoom: 24});
    } else {
        window.leafletMap.flyTo([window.targetPoint.lat, window.targetPoint.lon], 22);
    }
    
    if (window.distanceLine) {
        window.leafletMap.removeLayer(window.distanceLine);
        window.distanceLine = null;
    }
    
    window.updateSetOut();
}

window.startMapSetOut = function(idx) {
    if (window.activeApp !== 3) window.switchApp(3);
    document.getElementById('so_target_list').value = idx;
    window.selectTarget();
    if (window.leafletMap) window.leafletMap.closePopup();
};

window.stopNavigation = function() {
    window.targetPoint = null;
    let sel = document.getElementById('so_target_list');
    if (sel) sel.value = "";
    let soDist = document.getElementById('so_dist');
    if (soDist) { soDist.innerText = "0.000 m"; soDist.classList.remove('success'); }
    let soGuide = document.getElementById('so_guidance_text');
    if (soGuide) soGuide.innerText = "Waiting for Target...";
    let soArrow = document.getElementById('so_arrow');
    if (soArrow) soArrow.style.transform = `rotate(0deg)`;
    if (window.markerTarget && window.leafletMap) window.leafletMap.removeLayer(window.markerTarget);
    if (window.distanceLine && window.leafletMap) { window.leafletMap.removeLayer(window.distanceLine); window.distanceLine = null; }
    let mapCont = document.getElementById('map_container');
    if (mapCont) mapCont.classList.remove('hide-names');
    
    window.isAutoCenter = true;
    let btnAuto = document.getElementById('autoCenterBtn');
    if (btnAuto) btnAuto.classList.add('active');
    if (window.currentLat !== 0 && window.leafletMap) window.leafletMap.flyTo([window.currentLat, window.currentLon], 20);
};

window.clearSetOutPoints = function() {
    if (!confirm("Are you sure you want to delete ALL Points?")) return;
    window.setOutPoints = [];
    window.orderedAreaPoints = [];
    savePointsToStorage();
    updateTargetDropdown();
    window.stopNavigation();
    if (window.pointsLayerGroup) window.pointsLayerGroup.clearLayers();
    window.populateAreaPoints();
    window.updateAreaOrderUI();
    window.clearAreaCalc();
    alert("Points Cleared!");
};

window.loadSetOutCSV = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) { parseSetOutCSV(e.target.result); };
    reader.readAsText(file);
    event.target.value = '';
};

function parseSetOutCSV(text) { 
    window.stopNavigation(); 
    let lines = text.split('\n'); 
    let successCount = 0; 
    let errorCount = 0; 
    let i = 0; 
    let chunkSize = 500; 
    let totalLines = lines.length;

    let btn = document.querySelector('button[onclick="document.getElementById(\'cogo_csv\').click()"]') || document.querySelector('button[onclick="document.getElementById(\'so_csv\').click()"]');
    let originalBtnText = btn ? btn.innerText : "📂 CSV";
    if (btn) btn.innerText = "⏳ Loading...";

    function processChunk() {
        let end = Math.min(i + chunkSize, totalLines);
        for (; i < end; i++) { 
            let line = lines[i].trim(); 
            if (!line) continue; 
            let cols = line.split(','); 
            if (cols.length < 3) { errorCount++; continue; } 
            let p = cols[0].trim(); 
            let val1 = parseFloat(cols[1]); 
            let val2 = parseFloat(cols[2]); 
            if (isNaN(val1) || isNaN(val2)) { errorCount++; continue; } 
            let z = parseFloat(cols[3]) || 0.000; 
            processRawPointToTarget(p, val1, val2, z, "", true); 
            successCount++; 
        }

        if (i < totalLines) {
            setTimeout(processChunk, 10); 
        } else {
            savePointsToStorage(); 
            updateTargetDropdown(); 
            window.plotPointsOnMap(); 
            window.refreshPointsAfterDataChange(); 
            window.populateAreaPoints(); 
            
            if (btn) btn.innerText = originalBtnText; 

            if (errorCount > 0) alert(`Loaded ${successCount} points.\nSkipped ${errorCount} points.`); 
            else alert(`Loaded ${successCount} points successfully!`); 
        }
    }
    processChunk(); 
}

window.addManualSetOut = function() {
    let p = document.getElementById('so_m_p').value || "M1";
    let n = parseFloat(document.getElementById('so_m_n').value);
    let e = parseFloat(document.getElementById('so_m_e').value);
    if (isNaN(n) || isNaN(e)) return alert("Invalid Coordinates");
    processRawPointToTarget(p, n, e, 0, "Manual", false);
    savePointsToStorage();
    window.populateAreaPoints();
    alert("Point Added!");
};

function processRawPointToTarget(p, val1, val2, z, desc, skipUI) {
    let datum = document.getElementById('so_datum') ? document.getElementById('so_datum').value : "WGS_LL";
    let tLat = 0, tLon = 0;
    
    if (datum === "SVY21") {
        let r = calc_v2_rev(val2, val1); tLat = r.lat; tLon = r.lon;
    } else if (datum === "WGS_LL") {
        tLat = val1; tLon = val2;
    } else if (datum === "GLOBAL_UTM") {
        let zInput = document.getElementById('so_custom_zone');
        let hInput = document.getElementById('so_custom_hemi');
        let zone = (zInput && zInput.value) ? parseInt(zInput.value) : 47;
        let hemi = hInput ? hInput.value : 'N';
        let calcN = val1; if (hemi === 'S') calcN -= 10000000;
        let iW = m_inverse(val2, calcN, zone, m_WGS); tLat = iW.lat; tLon = iW.lon;
    } else {
        let isMM = datum.startsWith("MM");
        let zone = parseInt(datum.slice(-2));
        let r = m_inverse(val2, val1, zone, isMM ? m_EVE : m_WGS);
        if (isMM) {
            let x = m_llh2xyz(r.lat, r.lon, 0, m_EVE);
            let w = m_xyz2llh(x.x - m_DX, x.y - m_DY, x.z - m_DZ, m_WGS);
            tLat = w.lat; tLon = w.lon;
        } else {
            tLat = r.lat; tLon = r.lon;
        }
    }
    
    window.setOutPoints.push({p: p, lat: tLat, lon: tLon, z: z, d: desc});
    if (!skipUI) { updateTargetDropdown(); window.plotPointsOnMap(); }
}

function updateTargetDropdown() { 
    let sel = document.getElementById('so_target_list'); 
    if(!sel) return;
    
    let htmlArr = ['<option value="">-- Select Point --</option>']; 
    window.setOutPoints.forEach((pt, idx) => { 
        htmlArr.push(`<option value="${idx}">${pt.p}</option>`); 
    }); 
    sel.innerHTML = htmlArr.join('');
}

window.selectTarget = function() { 
    let idx = document.getElementById('so_target_list').value; 
    if (idx === "") { window.stopNavigation(); return; } 
    activateTarget(window.setOutPoints[idx]); 
};

window.addPointToArea = function(idx) {
    let indexPos = window.orderedAreaPoints.indexOf(idx);
    
    if (indexPos === -1) window.orderedAreaPoints.push(idx);
    else window.orderedAreaPoints.splice(indexPos, 1);

    if (typeof window.populateAreaPoints === "function") window.populateAreaPoints();
    if (typeof window.updateAreaOrderUI === "function") window.updateAreaOrderUI();
    if (window.leafletMap) window.leafletMap.closePopup();
    if (typeof window.plotPointsOnMap === "function") window.plotPointsOnMap();

    if (window.orderedAreaPoints.length >= 3) {
        window.calculateAreaFromSelection();
    } else {
        window.clearAreaResultOnly(); 
    }
};

window.toggleCheckboxArea = function(idx, isChecked) { 
    let indexPos = window.orderedAreaPoints.indexOf(idx); 
    if (isChecked && indexPos === -1) window.orderedAreaPoints.push(idx); 
    else if (!isChecked && indexPos !== -1) window.orderedAreaPoints.splice(indexPos, 1); 
    
    window.updateAreaOrderUI(); 
    window.plotPointsOnMap(); 

    if (window.orderedAreaPoints.length >= 3) {
        window.calculateAreaFromSelection();
    } else {
        window.clearAreaResultOnly();
    }
};

window.updateSetOut = function() {
    if (!window.targetPoint || window.currentLat === 0) return;
    let dist = calcDistance(window.currentLat, window.currentLon, window.targetPoint.lat, window.targetPoint.lon);
    let bearing = calcBearing(window.currentLat, window.currentLon, window.targetPoint.lat, window.targetPoint.lon);
    let arrowRotation = bearing - window.compassAzimuth;
    let soArrow = document.getElementById('so_arrow');
    if (soArrow) soArrow.style.transform = `rotate(${arrowRotation}deg)`;
    let distBox = document.getElementById('so_dist');
    if (distBox) distBox.innerText = dist.toFixed(3) + " m";
    
    let dLat = (window.targetPoint.lat - window.currentLat) * 111320;
    let dLon = (window.targetPoint.lon - window.currentLon) * (111320 * Math.cos(toRad(window.currentLat)));
    let dirN = dLat >= 0 ? "North" : "South";
    let dirE = dLon >= 0 ? "East" : "West";
    let soGuide = document.getElementById('so_guidance_text');
    if (soGuide) soGuide.innerHTML = `Go ${dirN}: <b>${Math.abs(dLat).toFixed(2)}m</b> | Go ${dirE}: <b>${Math.abs(dLon).toFixed(2)}m</b>`;

    let latlngs = [ [window.currentLat, window.currentLon], [window.targetPoint.lat, window.targetPoint.lon] ];
    if (!window.distanceLine) {
        window.distanceLine = L.polyline(latlngs, {color: '#ef4444', dashArray: '5, 5', weight: 3}).addTo(window.leafletMap);
    } else {
        window.distanceLine.setLatLngs(latlngs);
    }

    if (dist <= 2.0) {
        if (distBox) distBox.classList.add('success');
        if (window.distanceLine) window.distanceLine.setStyle({opacity: 0});
        if (window.markerTarget) window.markerTarget.setStyle({fillOpacity: 0.2, color: 'rgba(0,0,0,0.2)'});
    } else {
        if (distBox) distBox.classList.remove('success');
        if (window.distanceLine) window.distanceLine.setStyle({opacity: 1});
        if (window.markerTarget) window.markerTarget.setStyle({fillOpacity: 1, color: '#1e3a8a'});
    }
};

window.updateAreaOrderUI = function() {
    let orderTextSpan = document.getElementById('area_order_text');
    if (!orderTextSpan) return;
    if (window.orderedAreaPoints.length === 0) {
        orderTextSpan.innerHTML = "None";
        orderTextSpan.style.color = "#ef4444";
    } else {
        let textArray = window.orderedAreaPoints.map((idx, step) => `<b>${step+1}.</b> ${window.setOutPoints[idx].p}`);
        orderTextSpan.innerHTML = textArray.join(" ➔ ");
        orderTextSpan.style.color = "#059669";
    }
};

window.populateAreaPoints = function() {
    let listDiv = document.getElementById('area_point_list');
    if (!listDiv) return;
    
    if (window.setOutPoints.length === 0) {
        listDiv.innerHTML = '<p style="text-align:center; opacity:0.5; font-size:12px; margin: 10px 0;">No points available.</p>';
        return;
    }
    
    let i = 0;
    let total = window.setOutPoints.length;
    let chunkSize = 200; 
    let htmlArray = [];

    listDiv.innerHTML = '<p style="text-align:center; color:#f59e0b; font-size:12px;">⏳ Rendering list... please wait</p>';

    function renderListChunk() {
        let end = Math.min(i + chunkSize, total);
        for (; i < end; i++) {
            let pt = window.setOutPoints[i];
            let isChecked = window.orderedAreaPoints.includes(i) ? 'checked' : '';
            htmlArray.push(`
                <div class="area-pt-item" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; background:var(--res-bg); padding:5px 8px; border-radius:5px; border:1px solid var(--input-border);">
                    <div style="flex:1; display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" id="chk_pt_${i}" value="${i}" ${isChecked} onchange="window.toggleCheckboxArea(${i}, this.checked)">
                        <label for="chk_pt_${i}" style="cursor:pointer; font-size:12px; font-weight:bold; color:var(--primary);">[${pt.p}]</label>
                    </div>
                    <button class="top-btn" style="background:#ef4444; color:white; padding:4px 10px; font-size:11px; border-radius:4px;" onclick="deleteSinglePoint(${i})">🗑️ Delete</button>
                </div>
            `);
        }
        
        if (i < total) {
            setTimeout(renderListChunk, 5); 
        } else {
            listDiv.innerHTML = htmlArray.join('');
        }
    }
    renderListChunk();
};

window.deleteSinglePoint = function(idx) {
    if (!confirm(`Delete point [${window.setOutPoints[idx].p}]?`)) return;
    
    window.setOutPoints.splice(idx, 1);
    if (typeof savePointsToStorage === 'function') savePointsToStorage();
    if (typeof updateTargetDropdown === 'function') updateTargetDropdown();
    
    window.orderedAreaPoints = []; 
    window.clearAreaResultOnly();
    window.populateAreaPoints();
    window.updateAreaOrderUI();
    window.plotPointsOnMap();
};

window.calculateAreaFromSelection = function() {
    if (window.orderedAreaPoints.length < 3) return alert("⚠️ Please select at least 3 points in order!");
    let selectedPointsForCalc = [];
    let latlngsForMap = [];
    let datum = document.getElementById('cogo_datum') ? document.getElementById('cogo_datum').value : "WGS_LL";
    
    window.orderedAreaPoints.forEach(idx => {
        let pt = window.setOutPoints[idx];
        let targetN = 0, targetE = 0;
        let autoZone = Math.floor((pt.lon + 180) / 6) + 1;

        if (datum === "SVY21") {
            let pW = calc_v2_fwd(pt.lat, pt.lon); targetN = pW.N; targetE = pW.E;
        } else if (datum.startsWith("WGS_UTM")) {
            let pW = m_project(pt.lat, pt.lon, autoZone, m_WGS); targetN = pW.n; targetE = pW.e;
        } else if (datum.startsWith("MM")) {
            let x = m_llh2xyz(pt.lat, pt.lon, 0, m_WGS); let mL = m_xyz2llh(x.x + m_DX, x.y + m_DY, x.z + m_DZ, m_EVE);
            let pM = m_project(mL.lat, mL.lon, autoZone, m_EVE); targetN = pM.n; targetE = pM.e;
        } else if (datum === "GLOBAL_UTM") {
            let zInput = document.getElementById('cogo_custom_zone'); let hInput = document.getElementById('cogo_custom_hemi');
            let zone = (zInput && zInput.value) ? parseInt(zInput.value) : autoZone;
            let hemi = hInput ? hInput.value : 'N';
            let pW = m_project(pt.lat, pt.lon, zone, m_WGS); targetN = pW.n; targetE = pW.e;
            if (hemi === 'S') targetN += 10000000;
        } else {
            let pW = m_project(pt.lat, pt.lon, autoZone, m_WGS); targetN = pW.n; targetE = pW.e;
        }
        
        selectedPointsForCalc.push({ n: targetN, e: targetE });
        latlngsForMap.push([pt.lat, pt.lon]);
    });
    
    let areaSqMeters = calcPolygonArea(selectedPointsForCalc);
    let areaSqFeet = areaSqMeters * 10.7639104;
    let areaAcres = areaSqMeters / 4046.85642;
    let areaHectares = areaSqMeters / 10000.0;
    
    document.getElementById('res_sqm').innerText = areaSqMeters.toFixed(3);
    document.getElementById('res_sqft').innerText = areaSqFeet.toFixed(3);
    document.getElementById('res_acre').innerText = areaAcres.toFixed(4);
    document.getElementById('res_hectare').innerText = areaHectares.toFixed(4);
    document.getElementById('area_result_box').classList.remove('hidden');
    
    if (window.leafletMap) {
        if (window.areaPolygonLayer) window.leafletMap.removeLayer(window.areaPolygonLayer);
        window.areaPolygonLayer = L.polygon(latlngsForMap, { color: '#3b82f6', weight: 3, fillColor: '#60a5fa', fillOpacity: 0.4 }).addTo(window.leafletMap);
        window.leafletMap.fitBounds(window.areaPolygonLayer.getBounds(), { padding: [30, 30] });
        window.isAutoCenter = false;
        let btn = document.getElementById('autoCenterBtn');
        if (btn) btn.classList.remove('active');
    }
};

window.clearAreaResultOnly = function() {
    let resBox = document.getElementById('area_result_box');
    if (resBox) resBox.classList.add('hidden');
    if (window.leafletMap && window.areaPolygonLayer) {
        window.leafletMap.removeLayer(window.areaPolygonLayer);
        window.areaPolygonLayer = null;
    }
};

window.clearAreaCalc = function() {
    window.orderedAreaPoints = [];
    window.updateAreaOrderUI();
    let checkboxes = document.querySelectorAll('#area_point_list input[type="checkbox"]');
    checkboxes.forEach(chk => chk.checked = false);
    window.clearAreaResultOnly();
    window.plotPointsOnMap();
};

window.startMapSetOutFromTopo = function(topoIndex) {
    let tPt = window.recordedPointsBank[topoIndex];
    let exists = window.setOutPoints.findIndex(s => s.p === tPt.p && s.lat === tPt.wLa && s.lon === tPt.wLo);
    if (exists === -1) {
        window.setOutPoints.push({p: tPt.p, lat: tPt.wLa, lon: tPt.wLo, z: tPt.z, d: tPt.d});
        savePointsToStorage(); updateTargetDropdown(); window.plotPointsOnMap();
        exists = window.setOutPoints.length - 1;
    }
    window.startMapSetOut(exists);
};

window.addTopoPointToArea = function(topoIndex) {
    let tPt = window.recordedPointsBank[topoIndex];
    let exists = window.setOutPoints.findIndex(s => s.p === tPt.p && s.lat === tPt.wLa && s.lon === tPt.wLo);
    if (exists === -1) {
        window.setOutPoints.push({p: tPt.p, lat: tPt.wLa, lon: tPt.wLo, z: tPt.z, d: tPt.d});
        savePointsToStorage(); updateTargetDropdown(); window.plotPointsOnMap(); window.populateAreaPoints();
        exists = window.setOutPoints.length - 1;
    }
    window.addPointToArea(exists);
};

// ==========================================
// --- KML EXPORTS ---
// ==========================================
window.exportDxfToKml = function() {
    if (!window.rawDxfEntities || window.rawDxfEntities.length === 0) return alert("Please load a DXF file first!");
    let kmlString = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>Exported_DXF.kml</name>\n    <description>Generated by GPS Converter</description>`;
    document.getElementById('dxf_status').innerHTML = `⏳ Converting to KML...`;
    
    window.rawDxfEntities.forEach(ent => {
        try {
            if (ent.type === 'LINE') {
                let s = window.dxfToLatLon(ent.vertices[0].x, ent.vertices[0].y); let e = window.dxfToLatLon(ent.vertices[1].x, ent.vertices[1].y);
                if (!isNaN(s.lat) && !isNaN(e.lat)) { kmlString += `\n    <Placemark><LineString><coordinates>${s.lon},${s.lat},0 ${e.lon},${e.lat},0</coordinates></LineString></Placemark>`; }
            } else if (ent.type === 'POLYLINE' || ent.type === 'LWPOLYLINE') {
                let coords = "";
                ent.vertices.forEach(v => { let p = window.dxfToLatLon(v.x, v.y); if (!isNaN(p.lat)) coords += `${p.lon},${p.lat},0 `; });
                if (ent.shape === true && ent.vertices.length > 0) { let p0 = window.dxfToLatLon(ent.vertices[0].x, ent.vertices[0].y); coords += `${p0.lon},${p0.lat},0 `; }
                if (coords.trim().length > 0) { kmlString += `\n    <Placemark><LineString><coordinates>${coords.trim()}</coordinates></LineString></Placemark>`; }
            } else if (ent.type === 'POINT') {
                let px = ent.position ? ent.position.x : ent.x; let py = ent.position ? ent.position.y : ent.y;
                let pt = window.dxfToLatLon(px, py);
                if (!isNaN(pt.lat)) { kmlString += `\n    <Placemark><Point><coordinates>${pt.lon},${pt.lat},0</coordinates></Point></Placemark>`; }
            } else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
                let p = window.dxfToLatLon(ent.startPoint.x, ent.startPoint.y);
                if (!isNaN(p.lat)) {
                    let cleanText = ent.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    kmlString += `\n    <Placemark><name>${cleanText}</name><Point><coordinates>${p.lon},${p.lat},0</coordinates></Point></Placemark>`;
                }
            }
        } catch(err) {}
    });
    kmlString += `\n  </Document>\n</kml>`;
    
    document.getElementById('dxf_status').innerHTML = `✅ KML Export Ready!`;
    let fileName = `GPS_Converter_DXF_${new Date().getTime()}.kml`;
    
    if (window.AndroidNative && window.AndroidNative.downloadConvertedKML) { window.AndroidNative.downloadConvertedKML(kmlString, fileName); }
    else { let blob = new Blob([kmlString], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8;' }); let link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = fileName; document.body.appendChild(link); link.click(); document.body.removeChild(link); }
};

window.exportPointsToKml = function() {
    if (window.setOutPoints.length === 0) return alert("No points to export!");
    let kmlString = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>Exported_Points.kml</name>\n    <description>Generated by GPS Converter</description>`;
    window.setOutPoints.forEach(pt => {
        let cleanDesc = pt.d ? pt.d.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
        kmlString += `\n    <Placemark>\n      <name>${pt.p}</name>\n      <description>${cleanDesc}</description>\n      <Point>\n        <coordinates>${pt.lon},${pt.lat},${pt.z}</coordinates>\n      </Point>\n    </Placemark>`;
    });
    kmlString += `\n  </Document>\n</kml>`;
    let fileName = `GPS_Converter_Points_${new Date().getTime()}.kml`;
    
    if (window.AndroidNative && window.AndroidNative.downloadConvertedKML) { window.AndroidNative.downloadConvertedKML(kmlString, fileName); }
    else { let blob = new Blob([kmlString], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8;' }); let link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = fileName; document.body.appendChild(link); link.click(); document.body.removeChild(link); }
};

// ==========================================
// --- COGO TOOL SELECTOR LOGIC (Main Menu & Back) ---
// ==========================================

let _oldOpenCogoToolForArea = window.openCogoTool;
window.openCogoTool = function(toolName) {
    document.getElementById('cogo_main_menu').classList.add('hidden');
    document.getElementById('cogo_tool_container').classList.remove('hidden');

    ['cogo_area_tool', 'cogo_inv_tool', 'cogo_grad_tool', 'cogo_trv_tool', 'cogo_ecc_tool', 'cogo_topo_tool', 'cogo_vol_tool'].forEach(id => {
        let el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    let titleEl = document.getElementById('cogo_tool_title');
    let mapContainer = document.getElementById('shared_map_view');
    let gpsBtn = document.getElementById('globalGpsBtn');

    if (window.isNativeGPSActive && toolName !== 'area') window.toggleGlobalGPS();

    if (toolName === 'area') {
        document.getElementById('cogo_area_tool').classList.remove('hidden');
        titleEl.innerText = '📐 Area Calculator'; titleEl.style.color = '#10b981';
        mapContainer.classList.remove('hidden'); gpsBtn.classList.remove('hidden');
        setTimeout(() => { 
            if(window.leafletMap) window.leafletMap.invalidateSize(); 
            if (typeof window.plotPointsOnMap === 'function') window.plotPointsOnMap();
        }, 300);
    } else if (toolName === 'inv') {
        document.getElementById('cogo_inv_tool').classList.remove('hidden');
        titleEl.innerText = '🧭 Bearing & Distance'; titleEl.style.color = '#8b5cf6';
        mapContainer.classList.add('hidden'); gpsBtn.classList.add('hidden');
    } else if (toolName === 'grad') {
        document.getElementById('cogo_grad_tool').classList.remove('hidden');
        titleEl.innerText = '📈 Gradient / Elevation'; titleEl.style.color = '#b91c1c';
        mapContainer.classList.add('hidden'); gpsBtn.classList.add('hidden');
    } else if (toolName === 'trv') {
        document.getElementById('cogo_trv_tool').classList.remove('hidden');
        titleEl.innerText = '🔗 Traverse Adjustment'; titleEl.style.color = '#0ea5e9';
        mapContainer.classList.add('hidden'); gpsBtn.classList.add('hidden');
    } else if (toolName === 'ecc') {
        document.getElementById('cogo_ecc_tool').classList.remove('hidden');
        titleEl.innerText = '🏗️ Pile Eccentricity'; titleEl.style.color = '#f59e0b';
        mapContainer.classList.add('hidden'); gpsBtn.classList.add('hidden');
    } else if (toolName === 'topo') {
        document.getElementById('cogo_topo_tool').classList.remove('hidden');
        titleEl.innerText = '⛰️ Topo Surface & Contour'; titleEl.style.color = '#2563eb';
        gpsBtn.classList.add('hidden');
        if (typeof toggleTopoUI === 'function') toggleTopoUI();
        if (window.topoPoints && window.topoPoints.length > 0) {
            mapContainer.classList.remove('hidden');
            setTimeout(() => { 
                if (window.leafletMap) window.leafletMap.invalidateSize(); 
                if (typeof showTopoPointsOnMapOnly === 'function') showTopoPointsOnMapOnly();
                if (window.topoContours && window.topoContours.length > 0 && typeof showContoursOnMap === 'function') showContoursOnMap();
                if (window.topoTriangles && window.topoTriangles.length > 0 && typeof showTinOnMap === 'function') showTinOnMap();
            }, 300);
        } else { mapContainer.classList.add('hidden'); }
    } else if (toolName === 'vol') { 
        document.getElementById('cogo_vol_tool').classList.remove('hidden');
        titleEl.innerText = '📦 Earthwork / Volume Calculator'; titleEl.style.color = '#059669';
        mapContainer.classList.remove('hidden'); gpsBtn.classList.add('hidden');
        setTimeout(() => { 
            if(window.leafletMap) window.leafletMap.invalidateSize(); 
            if (window.volPoints && window.volPoints.length > 0 && typeof volShowPointsOnMap === 'function') volShowPointsOnMap();
            if (window.volSurface2Points && window.volSurface2Points.length > 0 && typeof volShowSurface2OnMap === 'function') window.volShowSurface2OnMap();
            if (typeof window.toggleVolBdyLayer === 'function') window.toggleVolBdyLayer(); 
        }, 300);
    }
    history.pushState({page: 4, subTool: toolName}, "Cogo Tool", "");
};

window.closeCogoTool = function() {
    document.getElementById('cogo_tool_container').classList.add('hidden');
    document.getElementById('cogo_main_menu').classList.remove('hidden');
    document.getElementById('shared_map_view').classList.add('hidden');
    document.getElementById('globalGpsBtn').classList.add('hidden');

    if (window.isNativeGPSActive) window.toggleGlobalGPS();

    let mapView = document.getElementById('map_view');
    if (mapView) mapView.style.background = '#ddd'; 
    let layerCtrl = document.querySelector('.leaflet-control-layers');
    if (layerCtrl) layerCtrl.style.display = 'block';
    if (window.leafletMap) {
        window.leafletMap.eachLayer(function (layer) { if (layer instanceof L.TileLayer) { layer.setOpacity(1); } });
    }
    setTimeout(() => { if (typeof window.toggleVolBdyLayer === 'function') window.toggleVolBdyLayer(); }, 100);
};

// ==========================================
// --- BEARING & DISTANCE UI LOGIC ---
// ==========================================
window.swapInversePoints = function() {
    let aN = document.getElementById('inv_a_n').value; let aE = document.getElementById('inv_a_e').value;
    let bN = document.getElementById('inv_b_n').value; let bE = document.getElementById('inv_b_e').value;
    document.getElementById('inv_a_n').value = bN; document.getElementById('inv_a_e').value = bE;
    document.getElementById('inv_b_n').value = aN; document.getElementById('inv_b_e').value = aE;
    if (bN !== "" && bE !== "" && aN !== "" && aE !== "") window.calcInverse();
};

window.isBrgDmsMode = false;
window.toggleBearingMode = function() {
    window.isBrgDmsMode = !window.isBrgDmsMode;
    let btn = document.getElementById('btn_brg_mode');
    let decDiv = document.getElementById('inv_brg_dec_div');
    let dmsDiv = document.getElementById('inv_brg_dms_div');
    if (window.isBrgDmsMode) { btn.innerText = "Mode: DMS"; btn.style.background = "#dbeafe"; decDiv.style.display = 'none'; dmsDiv.style.display = 'flex'; }
    else { btn.innerText = "Mode: Decimal"; btn.style.background = "#e2e8f0"; decDiv.style.display = 'block'; dmsDiv.style.display = 'none'; }
};

window.calcInverse = function() {
    let n1 = parseFloat(document.getElementById('inv_a_n').value); let e1 = parseFloat(document.getElementById('inv_a_e').value);
    let n2 = parseFloat(document.getElementById('inv_b_n').value); let e2 = parseFloat(document.getElementById('inv_b_e').value);
    if (isNaN(n1) || isNaN(e1) || isNaN(n2) || isNaN(e2)) return alert("Please enter valid coordinates for both Point A and B.");

    let result = calcGridInverse(n1, e1, n2, e2);
    document.getElementById('inv_dist').value = result.dist.toFixed(4);
    document.getElementById('inv_brg_dec').value = result.bearing.toFixed(4);

    let d = Math.floor(result.bearing); let minFloat = (result.bearing - d) * 60; let m = Math.floor(minFloat); let s = ((minFloat - m) * 60).toFixed(2);
    document.getElementById('inv_brg_d').value = d; document.getElementById('inv_brg_m').value = m; document.getElementById('inv_brg_s').value = s;

    let resBox = document.getElementById('inv_result_dms');
    resBox.style.display = "block";
    resBox.innerText = `Brg: ${d}° ${m}' ${s}" | Dist: ${result.dist.toFixed(3)}m`;
    resBox.style.background = "rgba(16, 185, 129, 0.1)"; resBox.style.borderColor = "rgba(16, 185, 129, 0.3)"; resBox.style.color = "#059669";
};

window.calcTraverse = function() {
    let n1 = parseFloat(document.getElementById('inv_a_n').value); let e1 = parseFloat(document.getElementById('inv_a_e').value);
    let dist = parseFloat(document.getElementById('inv_dist').value);
    let brgDec = 0;
    if (window.isBrgDmsMode) {
        let d = parseFloat(document.getElementById('inv_brg_d').value) || 0; let m = parseFloat(document.getElementById('inv_brg_m').value) || 0; let s = parseFloat(document.getElementById('inv_brg_s').value) || 0;
        brgDec = d + (m / 60) + (s / 3600);
    } else { brgDec = parseFloat(document.getElementById('inv_brg_dec').value); }

    if (isNaN(n1) || isNaN(e1) || isNaN(dist) || isNaN(brgDec)) return alert("Please enter Point A, Distance, and Bearing.");
    let result = calcGridTraverse(n1, e1, dist, brgDec);
    document.getElementById('inv_b_n').value = result.n.toFixed(4); document.getElementById('inv_b_e').value = result.e.toFixed(4);

    let resBox = document.getElementById('inv_result_dms');
    resBox.style.display = "block";
    resBox.innerText = `✅ Target Point B Calculated!`;
    resBox.style.background = "rgba(59, 130, 246, 0.1)"; resBox.style.borderColor = "rgba(59, 130, 246, 0.3)"; resBox.style.color = "#1e40af";
};

// ==========================================
// --- GRADIENT UI LOGIC ---
// ==========================================
window.clearGradient = function() {
    document.getElementById('grad_dist').value = ""; document.getElementById('grad_z1').value = ""; document.getElementById('grad_z2').value = ""; document.getElementById('grad_pct').value = ""; document.getElementById('grad_result').style.display = "none";
};

window.calcGradientFromZ = function() {
    let dist = parseFloat(document.getElementById('grad_dist').value); let z1 = parseFloat(document.getElementById('grad_z1').value); let z2 = parseFloat(document.getElementById('grad_z2').value);
    if (isNaN(dist) || isNaN(z1) || isNaN(z2)) return alert("Please enter Distance, Z1, and Z2.");
    if (dist <= 0) return alert("Distance must be greater than zero.");
    let pct = calcGradientPercentage(dist, z1, z2);
    document.getElementById('grad_pct').value = pct.toFixed(3);
    let resBox = document.getElementById('grad_result'); resBox.style.display = "block";
    let direction = (pct >= 0) ? "UP (Rise) 📈" : "DOWN (Fall) 📉"; let ratio = Math.abs(100 / pct);
    resBox.innerHTML = `Direction: ${direction}<br>Gradient: <b>${pct.toFixed(3)} %</b><br>Ratio (1 : N) = <b>1 : ${ratio.toFixed(2)}</b>`;
};

window.calcZ2FromGradient = function() {
    let dist = parseFloat(document.getElementById('grad_dist').value); let z1 = parseFloat(document.getElementById('grad_z1').value); let gradInput = document.getElementById('grad_pct').value.trim();
    if (isNaN(dist) || isNaN(z1) || gradInput === "") return alert("Please enter Distance, Z1, and Gradient (% or 1:N).");
    let pct = 0;
    if (gradInput.includes(":")) {
        let parts = gradInput.split(":");
        if (parts.length === 2) { let nVal = parseFloat(parts[1]); if (!isNaN(nVal) && nVal !== 0) pct = (1 / nVal) * 100; else return alert("Invalid Ratio format. Example: 1:40 or 1:-50"); }
    } else { pct = parseFloat(gradInput); if (isNaN(pct)) return alert("Invalid Gradient value."); }
    let z2 = calcZ2FromPercentage(dist, z1, pct);
    document.getElementById('grad_z2').value = z2.toFixed(3);
    let resBox = document.getElementById('grad_result'); resBox.style.display = "block";
    resBox.innerHTML = `✅ End Elevation (Z2) Calculated:<br><span style="font-size:16px;"><b>${z2.toFixed(3)} m</b></span><br><span style="font-size:12px; color:#1e40af;">(Using Gradient: ${pct.toFixed(3)}%)</span>`;
};

// ==========================================
// --- TRAVERSE ADJUSTMENT EVENT HANDLERS ---
// ==========================================
window.trvObsPoints = []; 
window.trvLastResult = null; 

const svgClosed = `<svg width="30" height="30" viewBox="0 0 100 100"><polygon points="50,20 80,80 20,80" fill="none" stroke="#ef4444" stroke-width="4"/><circle cx="50" cy="20" r="6" fill="#2563eb"/></svg>`;
const svgOpen = `<svg width="30" height="30" viewBox="0 0 100 100"><polyline points="20,80 50,20 80,80" fill="none" stroke="#ef4444" stroke-width="4"/><circle cx="20" cy="80" r="6" fill="#2563eb"/><circle cx="80" cy="80" r="6" fill="#10b981"/></svg>`;

window.toggleTrvType = function() {
    let type = document.getElementById('trv_type').value;
    document.getElementById('trv_end_ctrl').style.display = (type === 'O') ? 'block' : 'none';
    document.getElementById('trv_diagram').innerHTML = (type === 'C') ? svgClosed : svgOpen;
};
setTimeout(() => { if(document.getElementById('trv_diagram')) window.toggleTrvType(); }, 500);

window.addManualTrvPoint = function() {
    let p = document.getElementById('trv_m_p').value || `P${window.trvObsPoints.length + 1}`;
    let n = parseFloat(document.getElementById('trv_m_n').value); let e = parseFloat(document.getElementById('trv_m_e').value);
    let z = parseFloat(document.getElementById('trv_m_z').value) || 0.0;
    if (isNaN(n) || isNaN(e)) return alert("Please enter valid N and E.");
    window.trvObsPoints.push({ p: p, n: n, e: e, z: z, d: "" }); window.updateTrvPointListUI();
    document.getElementById('trv_m_p').value = `P${window.trvObsPoints.length + 1}`; document.getElementById('trv_m_n').value = ""; document.getElementById('trv_m_e').value = ""; document.getElementById('trv_m_z').value = "";
};

window.updateTrvPointListUI = function() {
    let listDiv = document.getElementById('trv_point_list'); let statusDiv = document.getElementById('trv_data_status');
    if(window.trvObsPoints.length === 0) { listDiv.innerHTML = '<div style="text-align:center; color:#94a3b8; margin-top:10px;">No points added yet.</div>'; statusDiv.innerText = "Total: 0 points"; return; }
    let html = '<table style="width:100%; text-align:left; border-collapse:collapse;"><tr><th>Pt</th><th>N</th><th>E</th><th>Z</th></tr>';
    window.trvObsPoints.forEach(pt => { html += `<tr style="border-bottom:1px solid #f1f5f9;"><td>${pt.p}</td><td>${pt.n.toFixed(3)}</td><td>${pt.e.toFixed(3)}</td><td>${pt.z.toFixed(3)}</td></tr>`; });
    html += '</table>'; listDiv.innerHTML = html; statusDiv.innerText = `✅ Total: ${window.trvObsPoints.length} observed points`; listDiv.scrollTop = listDiv.scrollHeight;
};

window.loadTrvCSV = function(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        let lines = e.target.result.split('\n'); let successCount = 0;
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim(); if (!line) continue;
            let cols = line.split(','); let p = cols[0].trim(); let n = parseFloat(cols[1]); let e_val = parseFloat(cols[2]);
            if (isNaN(n) || isNaN(e_val)) continue;
            let z = parseFloat(cols[3]) || 0.0; let d = cols[4] ? cols[4].trim() : "";
            window.trvObsPoints.push({ p: p, n: n, e: e_val, z: z, d: d }); successCount++;
        }
        window.updateTrvPointListUI();
        if(successCount > 0) alert(`Added ${successCount} points from CSV!`);
    };
    reader.readAsText(file); event.target.value = '';
};

window.clearTrvData = function() {
    window.trvObsPoints = []; window.trvLastResult = null; window.updateTrvPointListUI();
    document.getElementById('trv_result_box').classList.add('hidden'); document.getElementById('trv_csv').value = ""; document.getElementById('trv_m_p').value = "P1";
};

window.calculateTraverse = function() {
    let type = document.getElementById('trv_type').value;
    let p0 = document.getElementById('trv_p0').value || (type === 'C' ? "St/End" : "Start");
    let n0 = parseFloat(document.getElementById('trv_n0').value); let e0 = parseFloat(document.getElementById('trv_e0').value); let z0 = parseFloat(document.getElementById('trv_z0').value) || 0;
    if (isNaN(n0) || isNaN(e0)) return alert("⚠️ Enter valid Start Control Point (N, E)!");
    if (window.trvObsPoints.length === 0) return alert("⚠️ No observed points data!");

    let startCtrl = { p: p0, n: n0, e: e0, z: z0 }; let endCtrl = { p: p0, n: n0, e: e0, z: z0 };
    if (type === 'O') {
        let p_last = document.getElementById('trv_p_last').value || "End";
        let n_last = parseFloat(document.getElementById('trv_n_last').value); let e_last = parseFloat(document.getElementById('trv_e_last').value); let z_last = parseFloat(document.getElementById('trv_z_last').value) || 0;
        if (isNaN(n_last) || isNaN(e_last)) return alert("⚠️ Enter valid End Control Point (N, E)!");
        endCtrl = { p: p_last, n: n_last, e: e_last, z: z_last };
    }

    let res = adjust3dTraverse(type, startCtrl, endCtrl, window.trvObsPoints);
    window.trvLastResult = res; window.trvLastResult.startCtrl = startCtrl; window.trvLastResult.endCtrl = endCtrl;

    let summaryHTML = `
        <div style="font-weight:bold; font-size:14px; text-align:center; color:#1e40af; border-bottom:1px solid #cbd5e1; padding-bottom:5px; margin-bottom:8px;">📊 Traverse Adjustment Summary</div>
        <table style="width:100%; border-collapse: collapse;">
            <tr><td style="padding:2px 0;"><b>Method:</b></td><td style="padding:2px 0;">Bowditch (Coordinate Base)</td></tr>
            <tr><td style="padding:2px 0;"><b>Type:</b></td><td style="padding:2px 0;">${type === 'C' ? 'Closed Loop' : 'Open Link'}</td></tr>
            <tr><td style="padding:2px 0;"><b>Stations (n):</b></td><td style="padding:2px 0;">${res.num_stations} points</td></tr>
            <tr><td style="padding:2px 0;"><b>Total Length (L):</b></td><td style="padding:2px 0;">${res.D_sum.toFixed(4)} m</td></tr>
            <tr><td style="padding:2px 0;"><b>Misclosure (ΔN):</b></td><td style="padding:2px 0; color:#ef4444;">${res.NF.toFixed(4)} m</td></tr>
            <tr><td style="padding:2px 0;"><b>Misclosure (ΔE):</b></td><td style="padding:2px 0; color:#ef4444;">${res.EF.toFixed(4)} m</td></tr>
            <tr><td style="padding:2px 0;"><b>Linear Misclosure:</b></td><td style="padding:2px 0; color:#ef4444; font-weight:bold;">${res.LCE.toFixed(4)} m</td></tr>
            <tr><td style="padding:2px 0;"><b>Precision (1:R):</b></td><td style="padding:2px 0; color:#059669; font-weight:bold;">1:${Math.round(res.R_val).toLocaleString()}</td></tr>
            <tr><td style="padding:2px 0;"><b>Horiz. Class:</b></td><td style="padding:2px 0;">${res.class_text}</td></tr>
            <tr><td style="border-bottom:1px dashed #ccc; padding-bottom:5px;"><b>Horiz. Status:</b></td><td style="border-bottom:1px dashed #ccc; padding-bottom:5px; color:${res.status_text.includes('Required') ? '#ef4444' : '#059669'}; font-weight:bold;">${res.status_text}</td></tr>
            <tr><td style="padding-top:5px;"><b>Vert. Misclosure:</b></td><td style="padding-top:5px; color:#ef4444; font-weight:bold;">${res.ZF.toFixed(4)} m</td></tr>
            <tr><td style="padding:2px 0;"><b>Vert. Class:</b></td><td style="padding:2px 0;">${res.vert_class}</td></tr>
            <tr><td style="padding:2px 0;"><b>Vert. Status:</b></td><td style="padding:2px 0; color:${res.vert_status.includes('Required') ? '#ef4444' : '#059669'}; font-weight:bold;">${res.vert_status}</td></tr>
        </table>
    `;
    document.getElementById('trv_summary').innerHTML = summaryHTML;
    document.getElementById('trv_result_box').classList.remove('hidden');
    window.drawTraverseCanvas(startCtrl, endCtrl, res.adjusted_points, type);
};

window.drawTraverseCanvas = function(startPt, endPt, adjPoints, type) {
    let canvas = document.getElementById('trv_canvas'); if (!canvas) return; let ctx = canvas.getContext('2d'); let w = canvas.width; let h = canvas.height; ctx.clearRect(0, 0, w, h);
    let extractCoords = (pt) => { let n = pt.n !== undefined ? pt.n : pt.n_adj; let e = pt.e !== undefined ? pt.e : pt.e_adj; return { n: parseFloat(n), e: parseFloat(e), p: pt.p || "Pt" }; };
    let sPt = extractCoords(startPt); let pts = adjPoints.map(extractCoords); let ePt = type === 'O' ? extractCoords(endPt) : sPt;
    let allPts = [sPt, ...pts]; if (type === 'O') allPts.push(ePt); allPts = allPts.filter(pt => !isNaN(pt.n) && !isNaN(pt.e)); if (allPts.length === 0) return;
    let minN = Math.min(...allPts.map(pt => pt.n)); let maxN = Math.max(...allPts.map(pt => pt.n)); let minE = Math.min(...allPts.map(pt => pt.e)); let maxE = Math.max(...allPts.map(pt => pt.e));
    let padding = 40; let rangeN = maxN - minN; if(rangeN === 0) rangeN = 10; let rangeE = maxE - minE; if(rangeE === 0) rangeE = 10;
    let scaleX = (w - padding * 2) / rangeE; let scaleY = (h - padding * 2) / rangeN; let scale = Math.min(scaleX, scaleY);
    let offsetX = (w - (rangeE * scale)) / 2; let offsetY = (h - (rangeN * scale)) / 2;
    let toScreen = (n, e) => { return { x: offsetX + (e - minE) * scale, y: h - (offsetY + (n - minN) * scale) }; };
    ctx.beginPath(); let sPos = toScreen(sPt.n, sPt.e); ctx.moveTo(sPos.x, sPos.y);
    pts.forEach(pt => { let pos = toScreen(pt.n, pt.e); ctx.lineTo(pos.x, pos.y); });
    if (type === 'O') { let ePos = toScreen(ePt.n, ePt.e); ctx.lineTo(ePos.x, ePos.y); } else { ctx.lineTo(sPos.x, sPos.y); }
    ctx.strokeStyle = "#475569"; ctx.lineWidth = 1.5; ctx.stroke();
    let screenPts = [];
    let addOrMerge = (n, e, name, pType) => {
        let pos = toScreen(n, e); let merged = false;
        for(let sp of screenPts) {
            let dist = Math.sqrt((sp.x - pos.x)**2 + (sp.y - pos.y)**2);
            if(dist < 10) { if(!sp.names.includes(name)) sp.names.push(name); if(pType === 'start') sp.type = 'start'; if(pType === 'end' && sp.type !== 'start') sp.type = 'end'; merged = true; break; }
        }
        if(!merged) screenPts.push({ x: pos.x, y: pos.y, names: [name], type: pType });
    };
    addOrMerge(sPt.n, sPt.e, sPt.p, 'start'); pts.forEach(pt => addOrMerge(pt.n, pt.e, pt.p, 'adj')); if(type === 'O') addOrMerge(ePt.n, ePt.e, ePt.p, 'end');
    screenPts.forEach(sp => {
        if(sp.type === 'start' || sp.type === 'end') { ctx.beginPath(); ctx.moveTo(sp.x, sp.y - 8); ctx.lineTo(sp.x + 8, sp.y + 6); ctx.lineTo(sp.x - 8, sp.y + 6); ctx.closePath(); ctx.fillStyle = sp.type === 'start' ? "#dc2626" : "#16a34a"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(sp.x, sp.y, 4, 0, 2 * Math.PI); ctx.fillStyle = "#3b82f6"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke(); }
        ctx.fillStyle = (sp.type === 'start') ? "#dc2626" : (sp.type === 'end') ? "#059669" : "#1e40af"; ctx.font = (sp.type === 'start' || sp.type === 'end') ? "bold 11px Arial" : "11px Arial";
        let text = sp.names.join(' / '); ctx.shadowColor = "white"; ctx.shadowBlur = 4; ctx.fillText(text, sp.x + 10, sp.y + 3); ctx.shadowBlur = 0;
    });
};

window.exportTrvCSV = function(exportType) {
    let res = window.trvLastResult; if (!res) return alert("Calculate first!");
    let csvContent = ""; let fileName = "";
    if (exportType === 'PNEZD') {
        csvContent = "Point,Adjusted_N,Adjusted_E,Adjusted_Z,Description\n";
        csvContent += `${res.startCtrl.p},${res.startCtrl.n.toFixed(4)},${res.startCtrl.e.toFixed(4)},${res.startCtrl.z.toFixed(4)},Start_Ctrl\n`;
        res.adjusted_points.forEach(pt => { csvContent += `${pt.p},${pt.n_adj.toFixed(4)},${pt.e_adj.toFixed(4)},${pt.z_adj.toFixed(4)},${pt.d}\n`; });
        if (document.getElementById('trv_type').value === 'O') { csvContent += `${res.endCtrl.p},${res.endCtrl.n.toFixed(4)},${res.endCtrl.e.toFixed(4)},${res.endCtrl.z.toFixed(4)},End_Ctrl\n`; }
        fileName = `Traverse_Adjusted_${new Date().getTime()}.csv`;
    } else {
        csvContent = "Point_No,N_Observed,E_Observed,Z_Observed,N_Adjusted,E_Adjusted,Z_Adjusted,Total_Corr_N,Total_Corr_E,Total_Corr_Z\n";
        res.adjusted_points.forEach(pt => { csvContent += `${pt.p},${pt.n_obs.toFixed(4)},${pt.e_obs.toFixed(4)},${pt.z_obs.toFixed(4)},${pt.n_adj.toFixed(4)},${pt.e_adj.toFixed(4)},${pt.z_adj.toFixed(4)},${pt.dn_corr.toFixed(4)},${pt.de_corr.toFixed(4)},${pt.dz_corr.toFixed(4)}\n`; });
        csvContent += "\n--- Traverse Information ---\n";
        csvContent += `Adjustment Method,Bowditch (Coordinate Base)\n`;
        csvContent += `Traverse Type,${document.getElementById('trv_type').value === 'C' ? 'Closed Loop' : 'Open Link'}\n`;
        csvContent += `Number of Stations (n),${res.num_stations}\n`;
        csvContent += `Start Control,${res.startCtrl.p} (N:${res.startCtrl.n.toFixed(3)} E:${res.startCtrl.e.toFixed(3)})\n`;
        if (document.getElementById('trv_type').value === 'O') { csvContent += `End Control,${res.endCtrl.p} (N:${res.endCtrl.n.toFixed(3)} E:${res.endCtrl.e.toFixed(3)})\n`; }
        csvContent += `Total Length (L),${res.D_sum.toFixed(4)},m\n`;
        csvContent += `Misclosure dN,${res.NF.toFixed(4)},m\n`;
        csvContent += `Misclosure dE,${res.EF.toFixed(4)},m\n`;
        csvContent += `Linear Misclosure,${res.LCE.toFixed(4)},m\n`;
        csvContent += `Relative Precision,1:${Math.round(res.R_val)}\n`;
        csvContent += `Horizontal Class,${res.class_text}\n`;
        csvContent += `Horizontal Status,${res.status_text}\n`;
        csvContent += `Vert Misclosure,${res.ZF.toFixed(4)},m\n`;
        csvContent += `Vertical Class,${res.vert_class}\n`;
        csvContent += `Vertical Status,${res.vert_status}\n`;
        fileName = `Traverse_FullReport_${new Date().getTime()}.csv`;
    }
    if (window.AndroidNative && window.AndroidNative.downloadConvertedCSV) { window.AndroidNative.downloadConvertedCSV(csvContent, fileName); }
    else { let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); let url = URL.createObjectURL(blob); let link = document.createElement("a"); link.setAttribute("href", url); link.setAttribute("download", fileName); document.body.appendChild(link); link.click(); document.body.removeChild(link); }
};

// ==========================================
// --- PILE ECCENTRICITY LOGIC ---
// ==========================================
window.eccRecords = []; window.editingEccIndex = -1; 
window.toggleEccMethod = function() {
    let m = document.getElementById('ecc_method').value;
    if (m === 'direct') { document.getElementById('ecc_direct_div').classList.remove('hidden'); document.getElementById('ecc_3points_div').classList.add('hidden'); }
    else { document.getElementById('ecc_direct_div').classList.add('hidden'); document.getElementById('ecc_3points_div').classList.remove('hidden'); }
};

window.calcPileEccentricity = function() {
    let dN = parseFloat(document.getElementById('ecc_d_n').value); let dE = parseFloat(document.getElementById('ecc_d_e').value); let dDia = parseFloat(document.getElementById('ecc_d_dia').value) || 0; let pNo = document.getElementById('ecc_pile_no').value || "Unknown";
    if (isNaN(dN) || isNaN(dE)) return alert("Please enter valid Design Center N and E.");
    let aN = 0, aE = 0, aDiaText = "", aRad = 0, is3Point = false; let method = document.getElementById('ecc_method').value; let n1=0, e1=0, n2=0, e2=0, n3=0, e3=0;
    if (method === 'direct') {
        aN = parseFloat(document.getElementById('ecc_a_n').value); aE = parseFloat(document.getElementById('ecc_a_e').value);
        if (isNaN(aN) || isNaN(aE)) return alert("Please enter valid Actual N and E.");
        aRad = dDia / 2000; document.getElementById('ecc_calc_center_res').innerText = ""; 
    } else {
        is3Point = true; n1 = parseFloat(document.getElementById('ecc_p1_n').value); e1 = parseFloat(document.getElementById('ecc_p1_e').value); n2 = parseFloat(document.getElementById('ecc_p2_n').value); e2 = parseFloat(document.getElementById('ecc_p2_e').value); n3 = parseFloat(document.getElementById('ecc_p3_n').value); e3 = parseFloat(document.getElementById('ecc_p3_e').value);
        if (isNaN(n1) || isNaN(n2) || isNaN(n3) || isNaN(e1) || isNaN(e2) || isNaN(e3)) return alert("Please enter all 3 valid Points.");
        let center = calcCircleCenterFrom3Points(n1, e1, n2, e2, n3, e3); if (!center) return alert("Points are invalid (straight line).");
        aN = center.n; aE = center.e; aRad = center.r; let actualDiaMM = (aRad * 2000).toFixed(0); 
        document.getElementById('ecc_calc_center_res').innerText = `Calculated Center N: ${aN.toFixed(3)}, E: ${aE.toFixed(3)} | Dia: ${actualDiaMM} mm`; aDiaText = `<br>Computed Diameter: ${actualDiaMM} mm`;
    }
    let diffN = aN - dN; let diffE = aE - dE; let eccMM = Math.sqrt((diffN * diffN) + (diffE * diffE)) * 1000;
    let dirN = diffN >= 0 ? "North" : "South"; let dirE = diffE >= 0 ? "East" : "West";
    let html = `<b>Pile No:</b> <span style="color:#1e40af;">${pNo}</span><br><b>Design:</b> N: ${dN.toFixed(3)}, E: ${dE.toFixed(3)} (Dia: ${dDia}mm)<br><b>Actual:</b> N: ${aN.toFixed(3)}, E: ${aE.toFixed(3)}${aDiaText}<hr style="margin:5px 0;"><b>Δ N:</b> ${(diffN * 1000).toFixed(0)} mm (${dirN})<br><b>Δ E:</b> ${(diffE * 1000).toFixed(0)} mm (${dirE})<br><b style="font-size:16px; color:#b91c1c;">Total Deviation: ${eccMM.toFixed(0)} mm</b>`;
    document.getElementById('ecc_summary').innerHTML = html; document.getElementById('ecc_result_box').classList.remove('hidden');
    window.tempEccResult = { pNo, dN, dE, dDia, aN, aE, aRad, diffN: diffN*1000, diffE: diffE*1000, eccMM, method, n1, e1, n2, e2, n3, e3 };
};

window.addEccToRecord = function() {
    if (!window.tempEccResult) return;
    if (window.editingEccIndex !== -1) { window.eccRecords[window.editingEccIndex] = window.tempEccResult; window.editingEccIndex = -1; } else { window.eccRecords.push(window.tempEccResult); }
    window.tempEccResult = null; document.getElementById('ecc_result_box').classList.add('hidden'); document.getElementById('ecc_pile_no').value = ''; updateEccRecordUI();
};

function updateEccRecordUI() {
    let panel = document.getElementById('ecc_records_panel'); let listDiv = document.getElementById('ecc_record_list');
    if (window.eccRecords.length === 0) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden'); document.getElementById('ecc_record_count').innerText = window.eccRecords.length;
    let html = '';
    window.eccRecords.forEach((r, idx) => {
        html += `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #ccc; padding:5px 0;">
            <div style="font-size:13px; color:var(--text);"><b>${idx+1}. [${r.pNo}]</b> &rarr; Dev: <b style="color:#b91c1c;">${r.eccMM.toFixed(0)}mm</b></div>
            <div style="display:flex; gap:5px;">
                <button class="top-btn" style="background:#3b82f6; color:white; padding:4px 8px;" onclick="editEccRecord(${idx})">✏️</button>
                <button class="top-btn" style="background:#ef4444; color:white; padding:4px 8px;" onclick="deleteEccRecord(${idx})">🗑️</button>
            </div>
        </div>`;
    });
    listDiv.innerHTML = html;
}

window.editEccRecord = function(idx) {
    let r = window.eccRecords[idx]; window.editingEccIndex = idx;
    document.getElementById('ecc_pile_no').value = r.pNo; document.getElementById('ecc_d_dia').value = r.dDia || ""; document.getElementById('ecc_d_n').value = r.dN; document.getElementById('ecc_d_e').value = r.dE;
    document.getElementById('ecc_method').value = r.method; window.toggleEccMethod();
    if (r.method === 'direct') { document.getElementById('ecc_a_n').value = r.aN; document.getElementById('ecc_a_e').value = r.aE; } else { document.getElementById('ecc_p1_n').value = r.n1; document.getElementById('ecc_p1_e').value = r.e1; document.getElementById('ecc_p2_n').value = r.n2; document.getElementById('ecc_p2_e').value = r.e2; document.getElementById('ecc_p3_n').value = r.n3; document.getElementById('ecc_p3_e').value = r.e3; }
    document.getElementById('ecc_result_box').classList.add('hidden'); alert(`Editing Point: ${r.pNo}. Modify data and click Calculate -> Add to Report.`);
};

window.deleteEccRecord = function(idx) { if (!confirm("Remove this point from the report?")) return; window.eccRecords.splice(idx, 1); updateEccRecordUI(); };
window.clearAllEccData = function() { if (!confirm("Clear ALL data and start a new report?")) return; window.eccRecords = []; window.editingEccIndex = -1; updateEccRecordUI(); document.getElementById('ecc_result_box').classList.add('hidden'); document.querySelectorAll('#cogo_ecc_tool input').forEach(inp => inp.value = ''); document.getElementById('ecc_calc_center_res').innerText = ''; };

window.exportEccExcel = function() {
    if (window.eccRecords.length === 0) return alert("No points added to the report yet!");
    let now = new Date(); let formattedDate = `${("0"+now.getDate()).slice(-2)}/${("0"+(now.getMonth()+1)).slice(-2)}/${now.getFullYear()}, ${now.toLocaleTimeString('en-US')}`;
    let excelContent = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><h2 style="text-align:center; color:#1e40af;">Pile Eccentricity Report</h2><p><b>Generated Date:</b> ${formattedDate}</p><table border="1" style="border-collapse:collapse; text-align:center; font-family: sans-serif;"><tr style="font-weight:bold;"><th style="background-color:#f1f5f9; color:#334155; padding:5px;">No.</th><th style="background-color:#f1f5f9; color:#334155; padding:5px;">Pile No</th><th style="background-color:#e0f2fe; color:#0284c7; padding:5px;">Design N</th><th style="background-color:#e0f2fe; color:#0284c7; padding:5px;">Design E</th><th style="background-color:#dcfce7; color:#16a34a; padding:5px;">Actual N</th><th style="background-color:#dcfce7; color:#16a34a; padding:5px;">Actual E</th><th style="background-color:#fef3c7; color:#d97706; padding:5px;">&Delta; N (mm)</th><th style="background-color:#fef3c7; color:#d97706; padding:5px;">&Delta; E (mm)</th><th style="background-color:#fee2e2; color:#b91c1c; padding:5px;">Total Deviation (mm)</th></tr>`;
    window.eccRecords.forEach((r, index) => { excelContent += `<tr><td>${index + 1}</td><td><b>${r.pNo}</b></td><td style="background-color:#f0f9ff;">${r.dN.toFixed(3)}</td><td style="background-color:#f0f9ff;">${r.dE.toFixed(3)}</td><td style="background-color:#f0fdf4;">${r.aN.toFixed(3)}</td><td style="background-color:#f0fdf4;">${r.aE.toFixed(3)}</td><td style="background-color:#fffbeb;">${(r.diffN).toFixed(0)}</td><td style="background-color:#fffbeb;">${(r.diffE).toFixed(0)}</td><td style="font-weight:bold; color:#b91c1c; background-color:#fef2f2;">${r.eccMM.toFixed(0)}</td></tr>`; });
    excelContent += `</table></body></html>`;
    let fileName = `Eccentricity_Report_${new Date().getTime()}.xls`;
    if (window.AndroidNative && window.AndroidNative.downloadConvertedCSV) { window.AndroidNative.downloadConvertedCSV(excelContent, fileName); } 
    else { let blob = new Blob([excelContent], { type: 'application/vnd.ms-excel' }); let url = URL.createObjectURL(blob); let a = document.createElement("a"); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
};

window.exportEccDXF = function() {
    if (window.eccRecords.length === 0) return alert("No points added to the report yet!");
    let dxfContent = "0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n3\n0\nLAYER\n2\nDESIGN_PILE\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nLAYER\n2\nASBUILT_PILE\n70\n0\n62\n1\n6\nCONTINUOUS\n0\nLAYER\n2\nREPORT_TABLE\n70\n0\n62\n3\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n";
    window.eccRecords.forEach(r => {
        let dRad = r.dDia > 0 ? (r.dDia / 2000) : 0.3; let aRad = r.aRad > 0 ? r.aRad : dRad; let txtH = dRad * 0.4; 
        dxfContent += `0\nCIRCLE\n8\nDESIGN_PILE\n10\n${r.dE.toFixed(3)}\n20\n${r.dN.toFixed(3)}\n30\n0.0\n40\n${dRad.toFixed(3)}\n0\nTEXT\n8\nDESIGN_PILE\n10\n${(r.dE + dRad + (dRad*0.2)).toFixed(3)}\n20\n${(r.dN + dRad + (dRad*0.2)).toFixed(3)}\n30\n0.0\n40\n${txtH * 1.5}\n1\n${r.pNo}\n0\nCIRCLE\n8\nASBUILT_PILE\n10\n${r.aE.toFixed(3)}\n20\n${r.aN.toFixed(3)}\n30\n0.0\n40\n${aRad.toFixed(3)}\n`;
        let fixedLineLength = aRad * 0.6; let arrowSize = aRad * 0.15; let diffE_m = r.aE - r.dE; let diffN_m = r.aN - r.dN;
        if (Math.abs(diffE_m) > 0.001) { 
            let directionE = diffE_m > 0 ? 1 : -1; let endE = r.aE + (fixedLineLength * directionE);
            dxfContent += `0\nLINE\n8\nASBUILT_PILE\n10\n${r.aE.toFixed(3)}\n20\n${r.aN.toFixed(3)}\n30\n0.0\n11\n${endE.toFixed(3)}\n21\n${r.aN.toFixed(3)}\n31\n0.0\n`;
            let p2E = endE - (arrowSize * directionE), p2N = r.aN + (arrowSize * 0.4), p3E = endE - (arrowSize * directionE), p3N = r.aN - (arrowSize * 0.4);
            dxfContent += `0\nSOLID\n8\nASBUILT_PILE\n10\n${endE.toFixed(3)}\n20\n${r.aN.toFixed(3)}\n30\n0.0\n11\n${p2E.toFixed(3)}\n21\n${p2N.toFixed(3)}\n31\n0.0\n12\n${p3E.toFixed(3)}\n22\n${p3N.toFixed(3)}\n32\n0.0\n13\n${p3E.toFixed(3)}\n23\n${p3N.toFixed(3)}\n33\n0.0\n`;
            let textPosE = endE + (txtH * 0.5 * directionE); let txtAlignH = directionE > 0 ? 0 : 2; 
            dxfContent += `0\nTEXT\n8\nASBUILT_PILE\n10\n${textPosE.toFixed(3)}\n20\n${r.aN.toFixed(3)}\n30\n0.0\n40\n${txtH}\n1\n${Math.abs(diffE_m * 1000).toFixed(0)}\n72\n${txtAlignH}\n11\n${textPosE.toFixed(3)}\n21\n${r.aN.toFixed(3)}\n31\n0.0\n73\n2\n`;
        }
        if (Math.abs(diffN_m) > 0.001) { 
            let directionN = diffN_m > 0 ? 1 : -1; let endN = r.aN + (fixedLineLength * directionN);
            dxfContent += `0\nLINE\n8\nASBUILT_PILE\n10\n${r.aE.toFixed(3)}\n20\n${r.aN.toFixed(3)}\n30\n0.0\n11\n${r.aE.toFixed(3)}\n21\n${endN.toFixed(3)}\n31\n0.0\n`;
            let p2E = r.aE + (arrowSize * 0.4), p2N = endN - (arrowSize * directionN), p3E = r.aE - (arrowSize * 0.4), p3N = endN - (arrowSize * directionN);
            dxfContent += `0\nSOLID\n8\nASBUILT_PILE\n10\n${r.aE.toFixed(3)}\n20\n${endN.toFixed(3)}\n30\n0.0\n11\n${p2E.toFixed(3)}\n21\n${p2N.toFixed(3)}\n31\n0.0\n12\n${p3E.toFixed(3)}\n22\n${p3N.toFixed(3)}\n32\n0.0\n13\n${p3E.toFixed(3)}\n23\n${p3N.toFixed(3)}\n33\n0.0\n`;
            let textPosN = endN + (txtH * 0.5 * directionN); let txtAlignV = directionN > 0 ? 1 : 3; 
            dxfContent += `0\nTEXT\n8\nASBUILT_PILE\n10\n${r.aE.toFixed(3)}\n20\n${textPosN.toFixed(3)}\n30\n0.0\n40\n${txtH}\n1\n${Math.abs(diffN_m * 1000).toFixed(0)}\n72\n1\n11\n${r.aE.toFixed(3)}\n21\n${textPosN.toFixed(3)}\n31\n0.0\n73\n${txtAlignV}\n`;
        }
    });

    let maxE = Math.max(...window.eccRecords.map(r => r.dE)); let maxN = Math.max(...window.eccRecords.map(r => r.dN));
    let tableX = maxE + 5.0; let tableY = maxN; let rowH = 0.5; let tblTxtH = 0.2;
    let colWidths = [1.0, 1.5, 2.5, 2.5, 2.5, 2.5, 1.5, 1.5, 2.0]; let headers = ["No", "Pile", "Design N", "Design E", "Actual N", "Actual E", "dN(mm)", "dE(mm)", "Ecc(mm)"];
    let totalCols = colWidths.length; let tableWidth = colWidths.reduce((a, b) => a + b, 0); let totalRows = window.eccRecords.length + 1;
    dxfContent += `0\nTEXT\n8\nREPORT_TABLE\n10\n${tableX + (tableWidth/2)}\n20\n${tableY + 0.8}\n30\n0.0\n40\n0.4\n1\nPILE ECCENTRICITY SUMMARY REPORT\n72\n1\n11\n${tableX + (tableWidth/2)}\n21\n${tableY + 0.8}\n31\n0.0\n73\n2\n`;
    for (let i = 0; i <= totalRows; i++) { let y = tableY - (i * rowH); dxfContent += `0\nLINE\n8\nREPORT_TABLE\n10\n${tableX}\n20\n${y}\n30\n0.0\n11\n${tableX + tableWidth}\n21\n${y}\n31\n0.0\n`; }
    let curX = tableX; dxfContent += `0\nLINE\n8\nREPORT_TABLE\n10\n${curX}\n20\n${tableY}\n30\n0.0\n11\n${curX}\n21\n${tableY - (totalRows * rowH)}\n31\n0.0\n`;
    for (let c = 0; c < totalCols; c++) { curX += colWidths[c]; dxfContent += `0\nLINE\n8\nREPORT_TABLE\n10\n${curX}\n20\n${tableY}\n30\n0.0\n11\n${curX}\n21\n${tableY - (totalRows * rowH)}\n31\n0.0\n`; }
    function writeTableText(row, col, text) { let xPos = tableX; for(let i=0; i<col; i++) xPos += colWidths[i]; xPos += (colWidths[col] / 2); let yPos = tableY - (row * rowH) - (rowH / 2); dxfContent += `0\nTEXT\n8\nREPORT_TABLE\n10\n${xPos}\n20\n${yPos}\n30\n0.0\n40\n${tblTxtH}\n1\n${text}\n72\n1\n11\n${xPos}\n21\n${yPos}\n31\n0.0\n73\n2\n`; }
    for (let c = 0; c < totalCols; c++) { writeTableText(0, c, headers[c]); }
    window.eccRecords.forEach((r, idx) => { let row = idx + 1; writeTableText(row, 0, (idx + 1).toString()); writeTableText(row, 1, r.pNo); writeTableText(row, 2, r.dN.toFixed(3)); writeTableText(row, 3, r.dE.toFixed(3)); writeTableText(row, 4, r.aN.toFixed(3)); writeTableText(row, 5, r.aE.toFixed(3)); writeTableText(row, 6, r.diffN.toFixed(0)); writeTableText(row, 7, r.diffE.toFixed(0)); writeTableText(row, 8, r.eccMM.toFixed(0)); });
    dxfContent += "0\nENDSEC\n0\nEOF\n";
    let fileName = `Eccentricity_Drawing_${new Date().getTime()}.dxf`;
    if (window.AndroidNative && window.AndroidNative.downloadConvertedCSV) { window.AndroidNative.downloadConvertedCSV(dxfContent, fileName); } else { let blob = new Blob([dxfContent], { type: 'application/dxf' }); let url = URL.createObjectURL(blob); let a = document.createElement("a"); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
};

window.loadEccCSV = function(event) {
    const file = event.target.files[0]; if (!file) return; const reader = new FileReader();
    reader.onload = function(e) {
        let lines = e.target.result.split('\n'); let successCount = 0; let errorCount = 0;
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim(); if (!line || line.toUpperCase().includes("PILE") || line.toUpperCase().includes("DESIGN")) continue;
            let cols = line.split(','); if (cols.length < 6) { errorCount++; continue; }
            let pNo = cols[0].trim(); let dN = parseFloat(cols[1]); let dE = parseFloat(cols[2]); let dDia = parseFloat(cols[3]) || 600; 
            if (isNaN(dN) || isNaN(dE)) { errorCount++; continue; }
            let aN = 0, aE = 0, aRad = 0, method = "direct", diffN = 0, diffE = 0, eccMM = 0, n1 = 0, e1 = 0, n2 = 0, e2 = 0, n3 = 0, e3 = 0;
            if (cols.length >= 10 && !isNaN(parseFloat(cols[8]))) {
                method = "3points"; n1 = parseFloat(cols[4]); e1 = parseFloat(cols[5]); n2 = parseFloat(cols[6]); e2 = parseFloat(cols[7]); n3 = parseFloat(cols[8]); e3 = parseFloat(cols[9]);
                if (isNaN(n1) || isNaN(n2) || isNaN(n3)) { errorCount++; continue; }
                let center = calcCircleCenterFrom3Points(n1, e1, n2, e2, n3, e3); if (!center) { errorCount++; continue; }
                aN = center.n; aE = center.e; aRad = center.r;
            } else { method = "direct"; aN = parseFloat(cols[4]); aE = parseFloat(cols[5]); aRad = dDia / 2000; if (isNaN(aN) || isNaN(aE)) { errorCount++; continue; } }
            diffN = aN - dN; diffE = aE - dE; eccMM = Math.sqrt((diffN * diffN) + (diffE * diffE)) * 1000;
            window.eccRecords.push({ pNo: pNo, dN: dN, dE: dE, dDia: dDia, aN: aN, aE: aE, aRad: aRad, diffN: diffN * 1000, diffE: diffE * 1000, eccMM: eccMM, method: method, n1: n1, e1: e1, n2: n2, e2: e2, n3: n3, e3: e3 }); successCount++;
        }
        updateEccRecordUI();
        if (successCount > 0) { alert(`✅ Successfully loaded and calculated ${successCount} piles from CSV!\n(Skipped/Errors: ${errorCount})`); document.getElementById('ecc_records_panel').classList.remove('hidden'); } else { alert(`❌ No valid pile data found in CSV.`); }
    };
    reader.readAsText(file); event.target.value = ''; 
};

// ==========================================
// --- RECORDED POINTS (GPS) ON MAP ---
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
                // 🔴 ပြင်ဆင်ချက်: window.activeApp === 4 ဟု သေချာအောင် စစ်ဆေးခြင်း
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
    if (typeof window.updateMapPointTexts === 'function') window.updateMapPointTexts();
};

// ==========================================
// 🔴 MAP TAP TO AREA FUNCTION (RESTORED)
// ==========================================
window.addMapPointToArea = function(lat, lon) {
    let newName = `Map-${window.setOutPoints.length + 1}`;
    
    // Set Out Points Array ထဲသို့ အမှတ်အသစ်အဖြစ် အရင်သွင်းမည် (Area တွက်ရာတွင် လိုအပ်သောကြောင့်)
    window.setOutPoints.push({
        p: newName, 
        lat: parseFloat(lat), 
        lon: parseFloat(lon), 
        z: 0, 
        d: "From Map Tap"
    });
    
    if (typeof savePointsToStorage === 'function') savePointsToStorage(); 
    if (typeof window.populateAreaPoints === 'function') window.populateAreaPoints(); 
    
    // နောက်ဆုံး ဝင်လာသည့် အမှတ်၏ Index ကို ယူ၍ Area အစီအစဉ်ထဲသို့ ထည့်မည်
    let latestIndex = window.setOutPoints.length - 1;
    if (typeof window.addPointToArea === 'function') window.addPointToArea(latestIndex);
    
    // အမှတ် ၃ မှတ် ပြည့်သွားပါက Area ကို အလိုအလျောက် တွက်ချက်ပေးမည်
    if (window.orderedAreaPoints.length >= 3) {
        if (typeof window.calculateAreaFromSelection === 'function') window.calculateAreaFromSelection();
    }
};
