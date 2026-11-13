// [split from map_engine.js] lines 352-531 | part 2/7 | ထပ်ခွဲထားသည် - load order မပြောင်းရ (app.html ၏ script tag အစီအစဉ်အတိုင်း)
// ==========================================
// 🔒 MAP TOOL GATE - Map ပေါ်တွင် tool တစ်ခုချင်းသာ အလုပ်လုပ်ခွင့်ပြုသည်
// လက်ရှိ flag များ (isMeasuring, isLabelDrawing, isDrawingBoundary/Exclude, isVolDrawing, isProfDrawing)
// ကိုပဲ ကြည့်ပြီး ဆုံးဖြတ်သဖြင့် သီးခြား state မရှိ (flag နှင့် မကိုက်ညီတာ မဖြစ်နိုင်)။
// Tab အားလုံး (SVY21 / MM2000 / Topo / Volume / PF ...) တွင် map_engine.js ကို မျှသုံးသည်။
// ==========================================
// checkbox ရှိလျှင် ၎င်း၏ အခြေအနေ၊ မရှိလျှင် true (layer ဆွဲရာတွင် ပိတ်ထားသော checkbox ကို လေးစား)
window.layerOn = function(id) { let e = document.getElementById(id); return e ? !!e.checked : true; };

// window.escHtml ကို globals.js ထဲ ရွှေ့ထားသည်

window.MAP_TOOL_NAMES = {
    measure: '📏 Measure', label: '🏷️ Label Line', boundary: '✏️ Boundary',
    vol: '✏️ Volume boundary', prof: '✏️ Centerline'
};

window.getActiveMapTool = function() {
    if (window.isMeasuring) return 'measure';
    if (window.isLabelDrawing) return 'label';
    if (window.isDrawingBoundary || window.isDrawingExclude) return 'boundary';
    if (window.isVolDrawing) return 'vol';
    if (window.isProfDrawing) return 'prof';
    return null;
};

// tool အသစ်စခွင့်ရှိလား (တခြား tool အလုပ်လုပ်နေလျှင် စာတန်းပြပြီး false)
window.canStartMapTool = function(name) {
    let cur = window.getActiveMapTool();
    if (!cur || cur === name) return true;
    window.mapToast("Finish " + (window.MAP_TOOL_NAMES[cur] || cur) + " first (tap ✔ Done)");
    return false;
};

// Map အပေါ်ဘက်မှာ မှိန်သွားသော စာတန်း (Map မမြင်ရလျှင် alert သုံး)
window.mapToast = function(msg) {
    let c = document.getElementById('map_container');
    if (!c || c.offsetParent === null) { alert(msg); return; }
    let t = document.getElementById('map_toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'map_toast';
        t.className = 'map-toast';
        c.appendChild(t);
    }
    t.innerText = msg;
    t.style.opacity = '1';
    clearTimeout(window._mapToastTimer);
    window._mapToastTimer = setTimeout(function() { t.style.opacity = '0'; }, 2600);
};

// Element က အမှန်တကယ် မျက်နှာပြင်ပေါ်မြင်နေသလား (ကိုယ်တိုင် hidden class မပါလည်း အပေါ်က tab container ပိတ်ထားလျှင် မမြင်)
// offsetParent === null = ကိုယ်တိုင် သို့မဟုတ် parent တစ်ခုခု display:none
window.isElVisible = function(el) {
    return !!el && !el.classList.contains('hidden') && el.offsetParent !== null;
};

window.isToolPanelVisible = function(toolId) {
    return window.isElVisible(document.getElementById(toolId)) && window.isElVisible(document.getElementById('shared_map_view'));
};

// ==========================================
// 🎛️ ဘုံ DRAW TOOLBAR (Map အောက်ပိုင်းမှာ မျောနေသော ခလုတ်တန်း - tab အားလုံး မျှသုံး)
//   registerDrawBar({ name, tool, persistent, fn }) - fn() က { hint, buttons:[{text,bg,hidden,active,fn}] } (သို့) null ပြန်သည်
//   - tool = ထို tool အလုပ်လုပ်နေချိန် ဦးစားပေးပြမည့် provider
//   - persistent = tool မစသေးလည်း (ထို panel ဖွင့်ထားချိန်) ပြနေမည့် provider
// ==========================================
window.drawBarProviders = window.drawBarProviders || [];
window.drawBarMenuOwner = null;     // Clear မီနူး ဖွင့်ထားသော provider name
window.drawBarLastSig = '';
window.drawBarCollapsed = false;   // ဘာမှမဆွဲနေချိန် toolbar ကို ခေါက်ထားလိုလျှင် true

window.registerDrawBar = function(p) {
    let i = window.drawBarProviders.findIndex(x => x.name === p.name);
    if (i >= 0) window.drawBarProviders[i] = p; else window.drawBarProviders.push(p);
};

window.openDrawBarMenu = function(owner) { window.drawBarMenuOwner = owner; window.syncDrawBar(); };

// "Clear what?" စသည့် ရွေးချယ်ရန်မီနူး (ခလုတ်တန်းထဲမှာပဲ ပြ)
window.drawBarMenuCfg = function(title, items) {
    let close = function() { window.drawBarMenuOwner = null; window.syncDrawBar(); };
    let btns = items.map(it => ({ text: it.text, tone: it.tone, fn: function() { window.drawBarMenuOwner = null; it.fn(); window.syncDrawBar(); } }));
    btns.push({ text: "Cancel", tone: "slate", fn: close });
    return { hint: title, buttons: btns };
};

window.drawBarUndo = function() {
    let cur = window.getActiveMapTool();
    if (cur && cur !== 'measure' && typeof window.handleSharedMapUndo === 'function') window.handleSharedMapUndo();
    else window.mapToast("Start drawing first, then use Undo");
};

window.syncDrawBar = function() {
    let bar = document.getElementById('draw_bar');
    if (!bar) return;
    let cfg = null, owner = '', active = window.getActiveMapTool();
    let run = function(p) { try { return p.fn(); } catch (e) { console.error('drawBar provider', p.name, e); return null; } };

    if (active) {
        let p = window.drawBarProviders.find(x => x.tool === active);
        if (p) { cfg = run(p); if (cfg) owner = p.name; }
    }
    if (!cfg) {
        for (let i = 0; i < window.drawBarProviders.length && !cfg; i++) {
            let p = window.drawBarProviders[i];
            if (p.persistent) { cfg = run(p); if (cfg) owner = p.name; }
        }
    }
    if (!cfg) { bar.classList.remove('show'); window.drawBarLastSig = ''; return; }

    // Tool တစ်ခု အလုပ်လုပ်နေလျှင် toolbar ကို အပြည့်ပြ (ခေါက်ထားလည်း ပြန်ဖြန့်) - Undo/Done မရောက်တာ မဖြစ်စေရန်
    if (active) window.drawBarCollapsed = false;
    let collapsed = !!window.drawBarCollapsed && !active;

    // ခလုတ်များ အပြောင်းအလဲရှိမှသာ ပြန်ဆွဲသည် (နှိပ်နေစဉ် ခလုတ်ပျက်မသွားစေရန်)
    // owner (provider) ကိုပါ ထည့်စစ်သည် - မဟုတ်လျှင် စာသားတူသော bar နှစ်ခု (ဥပမာ PF / Volume) ကြားပြောင်းရာတွင် ခလုတ်အဟောင်း (tool မှား) ကျန်နေမည်
    let sig = JSON.stringify([owner, collapsed, cfg.hint, cfg.buttons.map(b => [b.text, !!b.hidden, !!b.active])]);
    if (sig === window.drawBarLastSig && bar.classList.contains('show')) return;
    window.drawBarLastSig = sig;

    if (collapsed) {
        bar.classList.add('collapsed'); bar.classList.add('show');
        let open = document.createElement('button');
        open.className = 'draw-open';
        open.innerText = "🎛 Tools ▸";
        open.onclick = function(ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); window.drawBarCollapsed = false; window.syncDrawBar(); };
        bar.replaceChildren(open);
        return;
    }
    bar.classList.remove('collapsed');

    let nodes = [];
    let row = document.createElement('div');
    row.className = 'draw-row';
    let h = document.createElement('div');
    h.className = 'draw-hint';
    h.innerText = cfg.hint;
    row.appendChild(h);
    if (!active) {      // ဘာမှမဆွဲနေချိန်သာ ခေါက်ခွင့်ပေး
        let hide = document.createElement('button');
        hide.className = 'draw-hide';
        hide.innerText = "▾ Hide";
        hide.onclick = function(ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); window.drawBarCollapsed = true; window.syncDrawBar(); };
        row.appendChild(hide);
    }
    nodes.push(row);
    cfg.buttons.forEach(b => {
        if (b.hidden) return;
        let btn = document.createElement('button');
        btn.className = 'draw-btn tone-' + (b.tone || 'slate') + (b.active ? ' active' : '');
        btn.innerText = b.text;
        btn.onclick = function(ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); b.fn(); };
        nodes.push(btn);
    });
    bar.replaceChildren(...nodes);
    bar.classList.add('show');
};
if (typeof setInterval === 'function') setInterval(function() { try { window.syncDrawBar(); } catch (e) {} }, 500);

// ---- Measure provider ----
window.registerDrawBar({ name: 'measure', tool: 'measure', fn: function() {
    if (window.drawBarMenuOwner === 'measure') {
        return window.drawBarMenuCfg("Clear what?", [
            { text: "This line", tone: "amber", fn: () => window.measureClear('current') },
            { text: "All", tone: "red", fn: () => window.measureClear('all') }
        ]);
    }
    let a = window.activeMeasureSession, n = a ? a.latlngs.length : 0, tot = 0;
    for (let i = 0; i < n - 1; i++) tot += calcSegmentDistance(a.latlngs[i][0], a.latlngs[i][1], a.latlngs[i + 1][0], a.latlngs[i + 1][1]);
    return {
        hint: n === 0 ? "📏 Tap points to measure" : ("📏 " + n + " pts · " + tot.toFixed(3) + " m"),
        buttons: [
            { text: "➕ New Line", tone: "blue", hidden: n < 2, fn: () => window.measureNewLine() },
            { text: "↩ Undo", tone: "violet", fn: () => window.undoMeasurePoint() },
            { text: "🗑️ Clear", tone: "slate", fn: () => window.openDrawBarMenu('measure') },
            { text: "✔ Done", tone: "red", fn: () => window.toggleMeasureMode() }
        ]
    };
}});

