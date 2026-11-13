// [split from module_surface_volume.js] lines 1800-2430 | part 5/8 | ထပ်ခွဲထားသည် - load order မပြောင်းရ (app.html ၏ script tag အစီအစဉ်အတိုင်း)
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

