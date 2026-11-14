// ==========================================================================
// JOB MANAGER - Topo / Volume / PF-CS အလုပ်များကို Job နာမည်ပေး၍ Auto-save လုပ်ပြီး နောက်နေ့ ပြန်ဖွင့်နိုင်စေရန်
//
//  - Input data ကိုသာ သိမ်းသည် (Topo points, boundary, exclude, label line, Volume area/Surface 2, PF/CS alignment, panel setting)
//    TIN / Contour / Volume ရလဒ် / Section တို့ကို မသိမ်းဘဲ ပြန်ဖွင့်လျှင် ရှိပြီးသား function များဖြင့် ပြန်တွက်သည်
//  - IndexedDB 'SurveyProJobsDB' (localStorage ၅ MB limit မရှိ)
//  - ပြောင်းလဲမှုကို ၃ စက္ကန့်တစ်ခါ စစ်ပြီး ပြောင်းလျှင် Auto-save၊ App နောက်ခံသို့ ရောက်/ပိတ်ချိန်လည်း သိမ်း
//  - Job ကို ဖျက် (Delete) / နာမည်ပြောင်း (Rename) / .json Export / Import လုပ်နိုင်
//  - Native dialog (alert/confirm/prompt) မသုံးပါ - APK WebView တွင် မပေါ်နိုင်သဖြင့် ကိုယ်ပိုင် dialog သုံးသည်
//  - ဤဖိုင်ကို sv_08_contour_labels.js နောက်၊ app_logic.js ရှေ့တွင် load ရမည်
// ==========================================================================
(function () {
    'use strict';
    var W = window;
    var DB_NAME = 'SurveyProJobsDB', DB_VER = 1, S_JOBS = 'jobs', S_META = 'meta';
    var LAST_KEY = 'surveyProLastJob';
    var db = null;
    var active = null;          // { id, name, created } - လက်ရှိ Job
    var lastSig = '';           // နောက်ဆုံး သိမ်းပြီး/ပြန်ဖွင့်ပြီး state ၏ signature
    var restoring = false, saving = false, suppressAuto = false;
    var statusText = '';

    // ---------------------------------------------------------------- helpers
    function $(id) { return document.getElementById(id); }
    function esc(s) { return (typeof W.escHtml === 'function') ? W.escHtml(String(s)) : String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function toast(msg) { if (typeof W.mapToast === 'function') { try { W.mapToast(msg); return; } catch (e) { } } console.info('[job]', msg); }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function fmtTime(t) { var d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    function newId() { return 'job' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }

    // ------------------------------------------------------------ IndexedDB
    function openDB() {
        return new Promise(function (res, rej) {
            if (db) return res(db);
            if (!W.indexedDB) return rej(new Error('IndexedDB not supported'));
            var r = indexedDB.open(DB_NAME, DB_VER);
            r.onupgradeneeded = function (e) {   // ထပ်ထည့်ရုံသာ - ရှိပြီးသား store ကို မဖျက်ပါ
                var d = e.target.result;
                if (!d.objectStoreNames.contains(S_JOBS)) d.createObjectStore(S_JOBS, { keyPath: 'id' });
                if (!d.objectStoreNames.contains(S_META)) d.createObjectStore(S_META, { keyPath: 'id' });
            };
            r.onsuccess = function (e) { db = e.target.result; db.onversionchange = function () { db.close(); db = null; }; res(db); };
            r.onerror = function () { rej(r.error || new Error('IndexedDB open failed')); };
        });
    }
    function tx(stores, mode, fn) {
        return openDB().then(function (d) {
            return new Promise(function (res, rej) {
                var t = d.transaction(stores, mode), out;
                try { out = fn(t); } catch (e) { rej(e); return; }
                t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
                t.onerror = t.onabort = function () { rej(t.error || new Error('IndexedDB transaction failed')); };
            });
        });
    }
    function dbPutJob(meta, data) {
        return tx([S_JOBS, S_META], 'readwrite', function (t) {
            t.objectStore(S_JOBS).put({ id: meta.id, data: data });
            t.objectStore(S_META).put(meta);
        });
    }
    function dbGetJob(id) { return tx([S_JOBS], 'readonly', function (t) { return t.objectStore(S_JOBS).get(id); }); }
    function dbGetMeta(id) { return tx([S_META], 'readonly', function (t) { return t.objectStore(S_META).get(id); }); }
    function dbAllMeta() { return tx([S_META], 'readonly', function (t) { return t.objectStore(S_META).getAll(); }); }
    function dbDelJob(id) { return tx([S_JOBS, S_META], 'readwrite', function (t) { t.objectStore(S_JOBS).delete(id); t.objectStore(S_META).delete(id); }); }
    function dbPutMetaOnly(meta) { return tx([S_META], 'readwrite', function (t) { t.objectStore(S_META).put(meta); }); }

    // -------------------------------------------------- state ⇄ plain object
    // Panel ထဲက input/select များကို id အလိုက် စုသည် (file/button ကျော်၊ dynamic ထွက်သော vol_var_z_* / vol_flat_z ကို သီးသန့်ကိုင်)
    function uiElements() {
        var out = [];
        ['cogo_topo_tool', 'cogo_vol_tool'].forEach(function (rid) {
            var r = $(rid); if (!r) return;
            r.querySelectorAll('input[id],select[id],textarea[id]').forEach(function (e) {
                if (e.type === 'file' || e.type === 'button' || e.type === 'submit') return;
                if (/^vol_var_z_/.test(e.id) || e.id === 'vol_flat_z') return;
                out.push(e);
            });
        });
        document.querySelectorAll('input[id^="tgl_"]').forEach(function (e) { out.push(e); });   // Map layer on/off
        return out;
    }
    function collectUI() {
        var ui = {};
        uiElements().forEach(function (e) { ui[e.id] = (e.type === 'checkbox' || e.type === 'radio') ? !!e.checked : e.value; });
        return ui;
    }
    function applyUI(ui) {
        if (!ui) return;
        Object.keys(ui).forEach(function (id) {
            var e = $(id); if (!e) return;
            if (e.type === 'checkbox' || e.type === 'radio') e.checked = !!ui[id]; else e.value = ui[id];
        });
    }
    function volDraftZ() {
        var z = { flat: null, vars: [] };
        var f = $('vol_flat_z'); if (f) z.flat = f.value;
        for (var i = 0; i < 2000; i++) { var v = $('vol_var_z_' + i); if (!v) break; z.vars.push(v.value); }
        return z;
    }

    function collect() {
        var topoOn = !!(W.topoTriangles && W.topoTriangles.length);
        var csvName = W._lastTopoCsvName || (active && active.csvName) || '';
        return {
            v: 1,
            ui: collectUI(),
            topo: { points: W.topoPoints || [], boundary: W.topoBoundaryPolygon || [], excludes: W.topoExcludePolygons || [], generated: topoOn, csvName: csvName },
            labels: (W.topoLabelLines || []).map(function (l) { return { pts: l.pts }; }),
            vol: {
                fromTopo: !!(W.volPoints && W.volPoints.length),
                surface2: W.volSurface2Points || [],
                areas: (W.savedVolAreas || []).map(function (a) {   // Surface 2 triangle ကြီးကို ထပ်မသိမ်းဘဲ marker ထား
                    var c = Object.assign({}, a); if (a.baseType === 'surface2') c.targetLevels = '__surface2__'; return c;
                }),
                draft: W.volBoundaryPts || [], draftZ: volDraftZ()
            },
            prof: {
                alignments: (W.profAlignments || []).map(function (a) { return { id: a.id, name: a.name, color: a.color, pts: a.pts, settings: a.settings }; }),   // sectionData မသိမ်း (ပြန်တွက်)
                centerline: W.profActiveId ? [] : (W.profCenterlinePts || []),
                settings: (typeof W.profSnapshotSettings === 'function') ? W.profSnapshotSettings() : null
            }
        };
    }
    function hasData() {
        return !!((W.topoPoints && W.topoPoints.length) || (W.volSurface2Points && W.volSurface2Points.length) ||
            (W.profAlignments && W.profAlignments.length) || (W.savedVolAreas && W.savedVolAreas.length));
    }
    function hasTopo() { return !!(W.topoPoints && W.topoPoints.length); }
    function summaryOf(d) {
        return { pts: d.topo.points.length, generated: d.topo.generated, areas: d.vol.areas.length, aligns: d.prof.alignments.length, labels: d.labels.length };
    }
    // ပြောင်းလဲမှု စစ်ရန် ပေါ့ပါးသော signature (point အကြီးများကို length + ခေါင်း/အလယ်/အဆုံးသာ)
    function sig() {
        function big(a) { return (a && a.length) ? (a.length + ':' + JSON.stringify([a[0], a[a.length >> 1], a[a.length - 1]])) : '0'; }
        try {
            return JSON.stringify([
                big(W.topoPoints), W.topoBoundaryPolygon, W.topoExcludePolygons, !!(W.topoTriangles && W.topoTriangles.length),
                W.topoLabelLines, big(W.volSurface2Points), !!(W.volPoints && W.volPoints.length),
                (W.savedVolAreas || []).map(function (a) { return [a.boundary, a.baseType, a.baseType === 'surface2' ? 0 : a.targetLevels, a.gridSize, a.swellPct, a.shrinkPct]; }),
                W.volBoundaryPts, volDraftZ(),
                (W.profAlignments || []).map(function (a) { return [a.id, a.name, a.pts, a.settings]; }),
                W.profActiveId ? null : W.profCenterlinePts,
                (typeof W.profSnapshotSettings === 'function') ? W.profSnapshotSettings() : null,
                collectUI()
            ]);
        } catch (e) { return String(Date.now()); }
    }

    // ------------------------------------------------------------ reset / restore
    function resetAll() {
        try { if (typeof W.resetAllDrawModes === 'function') W.resetAllDrawModes(); } catch (e) { }
        var oc = W.confirm; W.confirm = function () { return true; };      // clearTopoData ၏ confirm ကို ကျော်
        try { if (typeof W.clearTopoData === 'function') W.clearTopoData(); } catch (e) { console.warn('[job] clearTopoData', e); }
        finally { W.confirm = oc; }
        try {
            W.savedVolAreas = [];
            if (typeof W.updateSavedVolAreasUI === 'function') W.updateSavedVolAreasUI();
            W.profAlignments = []; W.profCenterlinePts = []; W.profSectionData = null; W.profActiveId = null; W.profHistory = [];
            if (typeof W.profRenderSavedAlignments === 'function') W.profRenderSavedAlignments();
            if (typeof W.profUpdateBoundaryUI === 'function') W.profUpdateBoundaryUI();
            W.topoLabelLines = [];
            var st = $('topo_status'); if (st) { st.style.display = 'none'; st.innerText = ''; }
            var vs = $('vol_status'); if (vs) { vs.style.display = 'none'; vs.innerText = ''; }
        } catch (e) { console.warn('[job] reset', e); }
        W._lastTopoCsvName = '';
    }
    function step(name, fn) { try { fn(); } catch (e) { console.warn('[job] restore step failed:', name, e); } }

    function restoreData(d) {
        resetAll();
        var t = d.topo || {}, v = d.vol || {}, p = d.prof || {};
        step('ui', function () { applyUI(d.ui); if (typeof W.toggleTopoUI === 'function') W.toggleTopoUI(); if (typeof W.toggleTopoBoundary === 'function') W.toggleTopoBoundary(); });

        // ---- Topo
        W.topoPoints = t.points || [];
        W.topoBoundaryPolygon = t.boundary || [];
        W.topoExcludePolygons = t.excludes || [];
        W.topoLabelLines = (d.labels || []).map(function (l) { return { pts: l.pts }; });
        W._lastTopoCsvName = t.csvName || '';
        if (W.topoPoints.length >= 3) {
            step('topo points', function () { W.showTopoPointsOnMapOnly(); });
            step('topo boundary', function () { W.updateBoundaryDrawUI(true); });
            var st = $('topo_status');
            if (st) { st.style.display = 'block'; st.style.color = '#10b981'; st.innerText = '\u2705 Job restored: ' + W.topoPoints.length + ' points.'; }
            if (t.generated) step('topo surface', function () { W.processTopoSurface(); });
            step('labels', function () { if (typeof W.renderLabelLines === 'function') W.renderLabelLines(); if (typeof W.refreshContourLabels === 'function') W.refreshContourLabels(); });
        }

        // ---- Volume
        var prevBounds = null; try { prevBounds = W.leafletMap && W.leafletMap.getBounds(); } catch (e) { }
        if (v.surface2 && v.surface2.length >= 3) {
            step('vol surface2', function () {
                W.volSurface2Points = v.surface2;
                W.volSurface2Triangles = generateDelaunayTriangulation(W.volSurface2Points);
                var s2 = $('vol_surf2_status'); if (s2) { s2.style.color = '#10b981'; s2.innerText = '\u2705 Surface 2 Ready! (' + W.volSurface2Points.length + ' Pts)'; }
                if (typeof W.volShowSurface2OnMap === 'function') W.volShowSurface2OnMap();
            });
        }
        if (v.fromTopo && W.topoTriangles && W.topoTriangles.length) step('vol from topo', function () { W.volLoadFromTopo(); });
        step('vol areas', function () {
            W.savedVolAreas = (v.areas || []).map(function (a) {
                var c = Object.assign({}, a);
                if (a.targetLevels === '__surface2__') c.targetLevels = W.volSurface2Triangles || [];
                return c;
            });
            if (typeof W.updateSavedVolAreasUI === 'function') W.updateSavedVolAreasUI();
        });
        step('vol draft', function () {
            W.volBoundaryPts = v.draft || [];
            if (W.volBoundaryPts.length && typeof W.volUpdateBoundaryUI === 'function') W.volUpdateBoundaryUI(false);
            if (typeof W.renderVolTargetInputs === 'function') W.renderVolTargetInputs();
            var dz = v.draftZ || {};
            var f = $('vol_flat_z'); if (f && dz.flat !== null && dz.flat !== undefined) f.value = dz.flat;
            (dz.vars || []).forEach(function (val, i) { var e = $('vol_var_z_' + i); if (e) e.value = val; });
        });
        if (prevBounds) step('map view', function () { W.leafletMap.fitBounds(prevBounds, { animate: false }); });   // Surface 2 က zoom မဆွဲသွားစေရန်

        // ---- Profile (PF/CS)
        step('profile', function () {
            W.profAlignments = (p.alignments || []).map(function (a) { return Object.assign({}, a, { sectionData: null }); });
            W.profActiveId = null;
            W.profCenterlinePts = (p.centerline && p.centerline.length) ? p.centerline : [];
            if (p.settings && typeof W.profApplySettings === 'function') W.profApplySettings(p.settings);
            if (typeof W.profRenderSavedAlignments === 'function') W.profRenderSavedAlignments();
            if (typeof W.profUpdateBoundaryUI === 'function') W.profUpdateBoundaryUI();
            if (typeof W.profRefreshControls === 'function') W.profRefreshControls();
        });
        step('profile recalc', function () {   // Export အတွက် sectionData လိုသဖြင့် ပြန်တွက်
            if (W.profAlignments.length && W.topoTriangles && W.topoTriangles.length && typeof W.profCalcAll === 'function') W.profCalcAll();
        });
        step('layers', function () { if (typeof W.toggleTopoLayers === 'function') W.toggleTopoLayers(); });
    }

    // ------------------------------------------------------------ save / open
    function metaFor(data) {
        return { id: active.id, name: active.name, created: active.created, updated: Date.now(), summary: summaryOf(data) };
    }
    function saveNow(force) {
        if (!active || restoring || saving) return Promise.resolve(false);
        var s = sig();
        if (!force && s === lastSig) return Promise.resolve(false);
        saving = true;
        function fail(e) {
            saving = false; console.warn('[job] save failed', e);
            setStatus('\u26A0 Save failed');
            toast('\u26A0 Job auto-save failed (storage full?). Use Export to back up.');
            return false;
        }
        function doSave() {
            var data = collect(), meta = metaFor(data);
            return dbPutJob(meta, data).then(function () {
                lastSig = s; active.name = meta.name; active.pts = data.topo.points.length; saving = false;
                try { localStorage.setItem(LAST_KEY, active.id); } catch (e) { }
                setStatus('\u2713 Saved ' + fmtTime(meta.updated).slice(11));
                return true;
            }).catch(fail);
        }
        // Safety: Clear Data စသည်ဖြင့် Topo point များ ပျောက်သွားလျှင် (Volume area/Alignment တို့ ကျန်နေသော်လည်း) ရှိပြီးသား Job ကို မထပ်ရေး
        //         Job ကို ပိတ်လိုက်သည်ဟု သဘောထားပြီး screen ကိုလည်း ရှင်း (Job က DB ထဲမှာ ဆက်ရှိ - 📁 မှ ပြန်ဖွင့်နိုင်)
        if (!hasTopo() && active.pts > 0) {
            saving = false; var nm = active.name;
            detach();
            restoring = true; try { resetAll(); } finally { restoring = false; }
            updateBars(); toast('\uD83D\uDCC1 Job "' + nm + '" closed (data cleared). It is kept - open it from the Jobs list.');
            return Promise.resolve(false);
        }
        return doSave();
    }
    function detach() {
        active = null; lastSig = ''; suppressAuto = false;
        try { localStorage.removeItem(LAST_KEY); } catch (e) { }
        setStatus('');
    }
    function uniqueName(base, excludeId) {
        return dbAllMeta().then(function (list) {
            var names = {}; list.forEach(function (m) { if (m.id !== excludeId) names[m.name] = 1; });
            var n = base, k = 2; while (names[n]) { n = base + ' (' + (k++) + ')'; }
            return n;
        });
    }
    function createJob(name) {
        return uniqueName(name).then(function (n) {
            active = { id: newId(), name: n, created: Date.now(), pts: 0 };
            suppressAuto = false; lastSig = '';
            return saveNow(true).then(function () { setStatus('\u2713 Job created'); updateBars(); return active; });
        });
    }
    function openJob(id) {
        return dbGetJob(id).then(function (rec) {
            if (!rec) { toast('Job not found'); return false; }
            return dbGetMeta(id).then(function (meta) {
                restoring = true;
                try { restoreData(rec.data); } catch (e) { console.warn('[job] restore', e); }
                active = { id: id, name: meta ? meta.name : 'Job', created: meta ? meta.created : Date.now(), pts: W.topoPoints ? W.topoPoints.length : 0 };
                restoring = false; suppressAuto = false;
                lastSig = sig();
                try { localStorage.setItem(LAST_KEY, id); } catch (e) { }
                setStatus('\u2713 Opened'); updateBars();
                toast('\uD83D\uDCC1 Opened: ' + active.name);
                return true;
            });
        }).catch(function (e) { restoring = false; console.warn('[job] open failed', e); toast('\u26A0 Could not open job'); return false; });
    }
    function deleteJob(id) {
        return dbDelJob(id).then(function () {
            if (active && active.id === id) { detach(); suppressAuto = true; updateBars(); }   // ဖျက်ပြီး စကရင်ပေါ် data က ကျန်နေသေး - ထပ်မဖန်တီးစေရန် suppress
            try { if (localStorage.getItem(LAST_KEY) === id) localStorage.removeItem(LAST_KEY); } catch (e) { }
        });
    }
    function renameJob(id, name) {
        name = (name || '').trim(); if (!name) return Promise.resolve(false);
        return dbGetMeta(id).then(function (m) {
            if (!m) return false;
            return uniqueName(name, id).then(function (n) {
                m.name = n;
                return dbPutMetaOnly(m).then(function () { if (active && active.id === id) { active.name = n; updateBars(); } return true; });
            });
        });
    }

    // ------------------------------------------------------------ export / import
    function triggerDownload(fileName, text) {
        if (W.AndroidNative && W.AndroidNative.downloadConvertedCSV) { W.AndroidNative.downloadConvertedCSV(text, fileName); return; }
        var blob = new Blob([text], { type: 'application/json' }), url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click();
        setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
    }
    function exportJob(id) {
        return Promise.all([dbGetJob(id), dbGetMeta(id)]).then(function (r) {
            if (!r[0] || !r[1]) return toast('Job not found');
            var pack = { app: 'SurveyPro', type: 'job', v: 1, name: r[1].name, created: r[1].created, updated: r[1].updated, data: r[0].data };
            triggerDownload(r[1].name.replace(/[^\w\-. ]+/g, '_') + '.job.json', JSON.stringify(pack));
        });
    }
    function importFile(file) {
        var rd = new FileReader();
        rd.onload = function () {
            try {
                var pack = JSON.parse(rd.result);
                if (!pack || pack.type !== 'job' || !pack.data || !pack.data.topo) throw new Error('not a job file');
                uniqueName(pack.name || 'Imported job').then(function (n) {
                    var meta = { id: newId(), name: n, created: pack.created || Date.now(), updated: Date.now(), summary: summaryOf(pack.data) };
                    return dbPutJob(meta, pack.data).then(function () { toast('\uD83D\uDCC1 Imported: ' + n); renderList(); });
                }).catch(function () { toast('\u26A0 Import failed'); });
            } catch (e) { toast('\u26A0 Not a valid job file'); }
        };
        rd.readAsText(file);
    }
    function pickImport() {
        var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = function () { if (inp.files && inp.files[0]) importFile(inp.files[0]); };
        inp.click();
    }

    // ------------------------------------------------------------ UI
    function injectStyle() {
        if ($('job-style')) return;
        var s = document.createElement('style'); s.id = 'job-style';
        s.textContent =
            '.job-bar{display:flex;gap:6px;align-items:center;margin:0 0 8px;padding:6px 8px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;}' +
            '.job-bar .job-name{flex:1;min-width:0;text-align:left;background:#fff;border:1px solid #c7d2fe;border-radius:6px;padding:7px 8px;font-size:13px;font-weight:bold;color:#1e3a8a;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
            '.job-bar .job-st{font-size:11px;color:#059669;white-space:nowrap;}' +
            '.job-bar .job-btn{background:#4f46e5;color:#fff;border:none;border-radius:6px;padding:7px 10px;font-size:13px;cursor:pointer;}' +
            '#job_modal{position:fixed;left:0;top:0;right:0;bottom:0;z-index:100000;background:rgba(15,23,42,.55);display:none;align-items:center;justify-content:center;}' +
            '#job_modal .job-card{background:#fff;border-radius:12px;width:92%;max-width:440px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 10px 30px rgba(0,0,0,.35);}' +
            '#job_modal .job-head{padding:12px 14px;font-weight:bold;color:#1e3a8a;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;}' +
            '#job_modal .job-body{padding:10px 12px;overflow:auto;}' +
            '#job_modal .job-foot{padding:10px 12px;border-top:1px solid #e2e8f0;display:flex;gap:6px;flex-wrap:wrap;}' +
            '#job_modal .job-item{border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:8px;}' +
            '#job_modal .job-item.cur{border-color:#4f46e5;background:#eef2ff;}' +
            '#job_modal .job-title{font-weight:bold;color:#0f172a;word-break:break-word;}' +
            '#job_modal .job-sub{font-size:11px;color:#64748b;margin:2px 0 6px;}' +
            '#job_modal .job-row{display:flex;gap:5px;flex-wrap:wrap;}' +
            '#job_modal button{border:none;border-radius:6px;padding:7px 10px;font-size:12px;cursor:pointer;color:#fff;background:#475569;}' +
            '#job_modal button.go{background:#4f46e5;} #job_modal button.ok{background:#059669;} #job_modal button.del{background:#dc2626;} #job_modal button.gray{background:#94a3b8;}' +
            '#job_modal input[type=text]{width:100%;box-sizing:border-box;padding:10px;font-size:15px;border:1px solid #cbd5e1;border-radius:8px;}' +
            '#job_resume{position:fixed;left:8px;right:8px;top:8px;z-index:99999;background:#1e3a8a;color:#fff;border-radius:10px;padding:10px 12px;display:none;box-shadow:0 6px 20px rgba(0,0,0,.35);font-size:13px;}' +
            '#job_resume button{border:none;border-radius:6px;padding:7px 12px;font-size:13px;margin:6px 6px 0 0;cursor:pointer;}';
        document.head.appendChild(s);
    }
    function barHtml() {
        return '<button type="button" class="job-name" onclick="jobOpenDialog()" data-job-name>\uD83D\uDCC1 No job</button>' +
            '<span class="job-st" data-job-st></span>' +
            '<button type="button" class="job-btn" title="New job" onclick="jobNewDialog()">\u2795</button>';
    }
    function injectBars() {
        ['topo_controls_panel', 'vol_controls_panel', 'prof_controls_panel'].forEach(function (pid) {
            var p = $(pid); if (!p || p.querySelector('.job-bar')) return;
            var bar = document.createElement('div'); bar.className = 'job-bar'; bar.innerHTML = barHtml();
            p.insertBefore(bar, p.firstChild);
        });
        updateBars();
    }
    function updateBars() {
        document.querySelectorAll('.job-bar [data-job-name]').forEach(function (b) {
            b.textContent = '\uD83D\uDCC1 ' + (active ? active.name : 'No job \u2013 tap to open / name') + ' \u25BE';
        });
        document.querySelectorAll('.job-bar [data-job-st]').forEach(function (s) { s.textContent = statusText; });
    }
    function setStatus(t) { statusText = t || ''; updateBars(); }

    function modal() {
        var m = $('job_modal');
        if (!m) { m = document.createElement('div'); m.id = 'job_modal'; m.onclick = function (e) { if (e.target === m) closeModal(); }; document.body.appendChild(m); }
        return m;
    }
    function closeModal() { var m = $('job_modal'); if (m) { m.style.display = 'none'; m.innerHTML = ''; } }
    function showModal(html) { var m = modal(); m.innerHTML = html; m.style.display = 'flex'; return m; }

    // နာမည်ထည့်ရန် dialog (New / Rename)
    function askName(title, def, okLabel, cb) {
        var m = showModal('<div class="job-card"><div class="job-head"><span>' + esc(title) + '</span></div><div class="job-body"><input type="text" id="job_name_inp" maxlength="60" value="' + esc(def || '') + '" placeholder="Job name"></div>' +
            '<div class="job-foot"><button class="go" id="job_name_ok">' + esc(okLabel) + '</button><button class="gray" id="job_name_cancel">Cancel</button></div></div>');
        var inp = $('job_name_inp'); setTimeout(function () { inp.focus(); inp.select(); }, 50);
        function done() { var v = inp.value.trim(); if (!v) { inp.focus(); return; } closeModal(); cb(v); }
        $('job_name_ok').onclick = done; $('job_name_cancel').onclick = closeModal;
        inp.onkeydown = function (e) { if (e.key === 'Enter') done(); };
    }

    var pendingDelete = null;
    function renderList() {
        var m = $('job_modal'); if (!m || m.style.display === 'none' || !m.querySelector('#job_list')) return;
        dbAllMeta().then(function (list) {
            list.sort(function (a, b) { return b.updated - a.updated; });
            var html = list.length ? '' : '<div style="color:#64748b;font-size:13px;padding:10px 4px;">No saved jobs yet. Load a Topo CSV and a job is created automatically (auto-save).</div>';
            list.forEach(function (j) {
                var s = j.summary || {}, cur = active && active.id === j.id;
                var bits = [];
                if (s.pts) bits.push(s.pts + ' pts'); if (s.generated) bits.push('surface'); if (s.areas) bits.push(s.areas + ' vol area'); if (s.aligns) bits.push(s.aligns + ' PF/CS'); if (s.labels) bits.push(s.labels + ' label line');
                var confirmDel = pendingDelete === j.id;
                html += '<div class="job-item' + (cur ? ' cur' : '') + '"><div class="job-title">' + (cur ? '\u25B6 ' : '') + esc(j.name) + '</div>' +
                    '<div class="job-sub">' + esc(fmtTime(j.updated)) + (bits.length ? ' \u00B7 ' + esc(bits.join(' \u00B7 ')) : '') + '</div><div class="job-row">' +
                    (cur ? '' : '<button class="go" data-a="open" data-id="' + j.id + '">Open</button>') +
                    '<button data-a="rename" data-id="' + j.id + '">Rename</button>' +
                    '<button class="ok" data-a="export" data-id="' + j.id + '">Export</button>' +
                    '<button class="del" data-a="del" data-id="' + j.id + '">' + (confirmDel ? 'Tap again to delete' : 'Delete') + '</button></div></div>';
            });
            var box = m.querySelector('#job_list'); if (box) box.innerHTML = html;
        }).catch(function () { var box = m.querySelector('#job_list'); if (box) box.innerHTML = '<div style="color:#dc2626">Cannot read jobs (storage unavailable).</div>'; });
    }
    function listClick(e) {
        var b = e.target.closest('button[data-a]'); if (!b) return;
        var a = b.getAttribute('data-a'), id = b.getAttribute('data-id');
        if (a !== 'del') pendingDelete = null;
        if (a === 'open') { closeModal(); openJob(id); }
        else if (a === 'export') exportJob(id);
        else if (a === 'rename') { dbGetMeta(id).then(function (mt) { askName('Rename job', mt ? mt.name : '', 'Rename', function (n) { renameJob(id, n).then(function () { openDialog(); }); }); }); }
        else if (a === 'del') {
            if (pendingDelete !== id) { pendingDelete = id; renderList(); return; }
            pendingDelete = null; deleteJob(id).then(function () { renderList(); toast('\uD83D\uDDD1\uFE0F Job deleted'); });
        }
    }
    function openDialog() {
        pendingDelete = null;
        var m = showModal('<div class="job-card"><div class="job-head"><span>\uD83D\uDCC1 Jobs (auto-saved)</span><button class="gray" id="job_close">\u2715</button></div>' +
            '<div class="job-body" id="job_list"></div>' +
            '<div class="job-foot"><button class="go" id="job_new">\u2795 New job</button>' +
            (active ? '<button class="ok" id="job_savenow">\uD83D\uDCBE Save now</button>' : '') +
            '<button id="job_import">Import .json</button></div></div>');
        $('job_close').onclick = closeModal;
        $('job_new').onclick = function () { newDialog(); };
        $('job_import').onclick = pickImport;
        var sn = $('job_savenow'); if (sn) sn.onclick = function () { saveNow(true).then(function () { toast('\uD83D\uDCBE Saved'); renderList(); }); };
        m.querySelector('#job_list').onclick = listClick;
        renderList();
    }
    function newDialog() {
        function stamp() { var d = new Date(); return 'Job ' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
        askName('New job name', W._lastTopoCsvName ? W._lastTopoCsvName.replace(/\.[^.]+$/, '') : stamp(), 'Create', function (name) {
            var go = function () {
                restoring = true; try { resetAll(); } finally { restoring = false; }
                active = null; lastSig = ''; createJob(name);
            };
            if (hasData() && active) { saveNow(true).then(go); }   // လက်ရှိ Job ကို အရင်သိမ်းပြီးမှ အသစ်စ
            else if (hasData() && !active) { createJob(name).then(function () { toast('\uD83D\uDCC1 Job created from current data'); }); }   // Job မရှိသေးဘဲ data ရှိနေလျှင် အဲဒီ data ကို Job အသစ်အဖြစ် သိမ်း
            else go();
        });
    }

    // ------------------------------------------------------------ auto-save loop & resume
    var askedAuto = false;
    function autoName() {
        var n = W._lastTopoCsvName ? String(W._lastTopoCsvName).replace(/\.[^.]+$/, '') : '';
        if (n) return n;
        var d = new Date(); return 'Job ' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    function tick() {
        if (!db || restoring || saving || document.hidden) return;
        if (!hasTopo()) suppressAuto = false;
        if (!active) {
            if (hasTopo() && !suppressAuto && !askedAuto) {   // Topo point စဝင်လာပြီး Job မရှိ -> CSV နာမည်ဖြင့် Job အလိုအလျောက်ဖန်တီး
                askedAuto = true;
                createJob(autoName()).then(function () { askedAuto = false; toast('\uD83D\uDCC1 Auto-save on: ' + (active ? active.name : '')); }).catch(function () { askedAuto = false; });
            }
            return;
        }
        saveNow(false);
    }
    function showResume(meta) {
        var r = $('job_resume');
        if (!r) { r = document.createElement('div'); r.id = 'job_resume'; document.body.appendChild(r); }
        r.innerHTML = '\uD83D\uDCC1 Resume job <b>' + esc(meta.name) + '</b>?<br><span style="opacity:.8;font-size:11px;">Last saved ' + esc(fmtTime(meta.updated)) + '</span><br>' +
            '<button id="job_res_go" style="background:#22c55e;color:#fff;">Resume</button><button id="job_res_list" style="background:#e2e8f0;">Other jobs</button><button id="job_res_no" style="background:transparent;color:#cbd5e1;">Not now</button>';
        r.style.display = 'block';
        $('job_res_go').onclick = function () { r.style.display = 'none'; openJob(meta.id); };
        $('job_res_list').onclick = function () { r.style.display = 'none'; openDialog(); };
        $('job_res_no').onclick = function () { r.style.display = 'none'; };
    }
    function init() {
        injectStyle(); injectBars();
        try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }   // Browser က data မရှင်းစေရန် တောင်း (web)
        // CSV file နာမည်ကို မှတ်ထား (Job နာမည်အလိုအလျောက်ပေးရန်)
        if (typeof W.loadTopoCSV === 'function' && !W.loadTopoCSV._jobWrapped) {
            var orig = W.loadTopoCSV;
            W.loadTopoCSV = function (ev) { try { var f = ev && ev.target && ev.target.files && ev.target.files[0]; if (f) W._lastTopoCsvName = f.name; } catch (e) { } return orig.apply(this, arguments); };
            W.loadTopoCSV._jobWrapped = true;
        }
        openDB().then(function () {
            var id = null; try { id = localStorage.getItem(LAST_KEY); } catch (e) { }
            if (id && !hasData()) { dbGetMeta(id).then(function (m) { if (m) showResume(m); }); }
            setInterval(tick, 3000);
        }).catch(function (e) { console.warn('[job] storage unavailable', e); setStatus('\u26A0 No storage'); });
        // App နောက်ခံသို့ ရောက်/ပိတ်ချိန် ချက်ချင်းသိမ်း
        document.addEventListener('visibilitychange', function () { if (document.hidden) saveNow(false); });
        W.addEventListener('pagehide', function () { saveNow(false); });
    }

    // ------------------------------------------------------------ public API
    W.jobOpenDialog = openDialog;
    W.jobNewDialog = newDialog;
    W.jobSaveNow = function () { return saveNow(true); };
    W.jobOpen = openJob;
    W.jobDelete = deleteJob;
    W.jobRename = renameJob;
    W.jobExport = exportJob;
    W.jobState = function () { return { active: active, hasData: hasData() }; };
    W._jobInternals = { collect: collect, restoreData: restoreData, sig: sig, tick: tick, dbAllMeta: dbAllMeta, dbGetJob: dbGetJob, resetAll: resetAll };   // test / debug

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
