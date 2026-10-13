// ==========================================
// --- GLOBALS & STATE VARIABLES ---
// ==========================================

// GPS & App State
window.geoidMode = 0;
window.isNativeGPSActive = false;
window.isTopoMode = true; 
window.activeApp = 0;
window.currentRawAlt = 0;
window.zOffset = 0;
window.isBMMode = false;
window.currentGeoidN = 0;
window.currentGeoidModel = "Unknown";
window.appliedPoleH = 0;
window.globalZText = "MSL: --.--- m";
window.webGPSWatchId = null;

// Map Coordinates (For Maps Navigation)
window.v2_map_lat = null; window.v2_map_lon = null;
window.m_map_lat = null; window.m_map_lon = null;
window.g_map_lat = null; window.g_map_lon = null;

// Buffers & Last Known Data
window.altBuffer = [];
window.BUFFER_SIZE = 5;
window.latest_local_N = 0; window.latest_local_E = 0;
window.latest_wgs_N = 0; window.latest_wgs_E = 0;
window.latest_Z = 0; window.latest_lat = 0; window.latest_lon = 0;
window.finalCSVOutput = "";

// Points Bank & COGO
window.setOutPoints = [];
window.targetPoint = null;
window.recordedPointsBank = [];
window.orderedAreaPoints = [];

// Map Leaflet Objects
window.leafletMap = null;
window.markerCurrent = null;
window.markerTarget = null;
window.pointsLayerGroup = null;
window.distanceLine = null;
window.areaPolygonLayer = null;
window.recordedLayerGroup = null; 
window.topoTinLayer = null; 

// User Location & Status
window.currentLat = 0; window.currentLon = 0;
window.compassAzimuth = 0;
window.isSoundOn = true;
window.isAutoCenter = true;
window.lastBeepTime = 0;

// DXF Map Variables
window.dxfLineLayer = null;
window.dxfTextLayer = null;
window.rawDxfEntities = [];
window.dxfLayerTable = {};
window.currentDxfTextSize = 14;
window.dxfCancelFlag = false;

// Measure Tool Variables
window.isMeasuring = false;
window.measureLatLngs = [];
window.measureLineLayer = null;
window.measureMarkersLayer = null;
window.measureSessions = [];
window.activeMeasureSession = null;
window.measurePreviewLine = null;
window.measurePreviewLabel = null;
window.nextMeasureSessionId = 1;

// Tracking & Database Variables
window.mapDB = null;
window.trackDB = null;
window.tilesToDownload = [];
window.isDownloadingMap = false;
window.mapTileUrl = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';

// Point Averaging
window.isAveraging = false;
window.avgDataBuffer = [];
window.avgInterval = null;

// DB Initialization (Map & DXF)
const requestDB = indexedDB.open("SurveyProMapDB", 2);
requestDB.onupgradeneeded = function(e) {
    window.mapDB = e.target.result;
    if(!window.mapDB.objectStoreNames.contains("tiles")) window.mapDB.createObjectStore("tiles");
    if(!window.mapDB.objectStoreNames.contains("dxf_data")) window.mapDB.createObjectStore("dxf_data");
};
requestDB.onsuccess = function(e) {
    window.mapDB = e.target.result;
    if (typeof window.loadSavedDXF === "function") {
        window.loadSavedDXF();
    }
};
requestDB.onerror = function(e) {
    console.error("IndexedDB Error:", e);
};