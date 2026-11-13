// [split from module_surface_volume.js] lines 2881-3518 | part 7/8 | ထပ်ခွဲထားသည် - load order မပြောင်းရ (app.html ၏ script tag အစီအစဉ်အတိုင်း)
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



