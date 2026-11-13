// [split from module_surface_volume.js] lines 2431-2880 | part 6/8 | ထပ်ခွဲထားသည် - load order မပြောင်းရ (app.html ၏ script tag အစီအစဉ်အတိုင်း)
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


