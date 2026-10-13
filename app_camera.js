// ==========================================
// --- 📷 CAMERA & PHOTO WATERMARK LOGIC ---
// ==========================================

// --- Helper Function: Canvas ပေါ်တွင် စာကြောင်းရှည်လျှင် အောက်တစ်ကြောင်းဆင်းရန် (Word Wrap) ---
function wrapTextMaxLines(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    let words = text.split(' ');
    let line = '';
    let currentY = y;
    let lineCount = 1;

    for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        let testWidth = metrics.width;

        if (testWidth > maxWidth && n > 0) {
            if (lineCount >= maxLines) {
                ctx.fillText(line.trim() + '...', x, currentY);
                return currentY + lineHeight;
            } else {
                ctx.fillText(line, x, currentY);
                line = words[n] + ' ';
                currentY += lineHeight;
                lineCount++;
            }
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, currentY);
    return currentY + lineHeight;
}

window.triggerCamera = function() {
    if (!window.isNativeGPSActive || window.currentLat === 0) {
        alert("⚠️ Please start GPS tracking and wait for location before taking a photo.");
        return;
    }
    document.getElementById('cam_hidden_input').click();
};

window.processCameraPhoto = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    let statusBox = document.getElementById('cam_status');
    statusBox.style.display = 'block';
    statusBox.innerText = "⏳ Processing photo... Stitching Map & Fetching Address";

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = async function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width; canvas.height = img.height;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            let lat = window.currentLat; let lon = window.currentLon;
            let datumVal = document.getElementById('cam_datum').value;
            let autoZone = Math.floor((lon + 180) / 6) + 1;
            let calcN = 0, calcE = 0, datumName = "";
            let isOutOfBounds = false;

            if (datumVal === "SVY21") {
                if (lat >= 1.0 && lat <= 2.0 && lon >= 103.0 && lon <= 104.5) { let p = calc_v2_fwd(lat, lon); calcN = p.N; calcE = p.E; datumName = "SVY21"; } else { isOutOfBounds = true; datumName = "SVY21"; }
            } else if (datumVal === "MM2000") {
                if (lat >= 9.0 && lat <= 29.0 && lon >= 92.0 && lon <= 102.0) { let x = m_llh2xyz(lat, lon, 0, m_WGS); let mL = m_xyz2llh(x.x+m_DX, x.y+m_DY, x.z+m_DZ, m_EVE); let p = m_project(mL.lat, mL.lon, autoZone, m_EVE); calcN = p.n; calcE = p.e; datumName = `MM2000 Z${autoZone}`; } else { isOutOfBounds = true; datumName = "MM2000"; }
            } else {
                let hemi = lat >= 0 ? 'N' : 'S'; let p = m_project(lat, lon, autoZone, m_WGS); calcN = p.n; calcE = p.e; if(hemi === 'S') calcN += 10000000; datumName = `UTM Z${autoZone}${hemi}`;
            }

            // 1. Fetch Address
            let addressText = "Address not available (Offline or No Data)";
            try {
                let res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
                let data = await res.json();
                if (data && data.display_name) addressText = data.display_name;
            } catch(err) { console.log("Address fetch failed."); }

            // 2. Fetch 9 Map Tiles (3x3 Grid)
            let mapLoaded = false;
            let z = 16;
            let exactX = ((lon + 180) / 360 * Math.pow(2, z)) * 256;
            let exactY = ((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z)) * 256;
            let centerX = Math.floor(exactX / 256);
            let centerY = Math.floor(exactY / 256);
            let offsetX = exactX % 256;
            let offsetY = exactY % 256;

            // Off-screen canvas (768x768)
            const mapCnv = document.createElement('canvas');
            mapCnv.width = 768; mapCnv.height = 768;
            const mCtx = mapCnv.getContext('2d');

            let tiles = [];
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    tiles.push({ x: centerX + dx, y: centerY + dy, px: (dx + 1) * 256, py: (dy + 1) * 256 });
                }
            }

            try {
                await Promise.all(tiles.map(t => {
                    return new Promise((resolve) => {
                        let img = new Image();
                        img.crossOrigin = "Anonymous";
                        let url = `https://mt1.google.com/vt/lyrs=y&x=${t.x}&y=${t.y}&z=${z}`;
                        let timeout = setTimeout(resolve, 3500);
                        img.onload = () => {
                            clearTimeout(timeout);
                            mCtx.drawImage(img, t.px, t.py, 256, 256);
                            mapLoaded = true;
                            resolve();
                        };
                        img.onerror = () => { clearTimeout(timeout); resolve(); };
                        img.src = url;
                    });
                }));
            } catch(e) {}

            let az = window.compassAzimuth || 0;
            let dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
            let compassText = `🧭 ${Math.round(az)}° ${dirs[Math.round((az % 360) / 45)]}`;

            let pName = document.getElementById('cam_point_name').value || "Survey Point";
            let now = new Date();
            let days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            let gmtOffset = now.getTimezoneOffset() / -60;
            let gmtString = `GMT${gmtOffset >= 0 ? '+' : ''}${gmtOffset}:00`;
            let dateStr = `${days[now.getDay()]}, ` + now.toLocaleDateString('en-GB') + " " + now.toLocaleTimeString('en-US') + " " + gmtString;
            let coordStr = `N: ${calcN.toFixed(3)}, E: ${calcE.toFixed(3)} [${datumName}]`;
            let wgsStr = `Lat: ${lat.toFixed(6)}, Lon: ${lon.toFixed(6)}, Z: ${window.latest_Z.toFixed(3)}m`;
            if (isOutOfBounds) coordStr = `⚠️ Out of Local Bounds for [${datumName}]`;

            // --- CANVAS DRAWING (UI Layout) ---
            let fontSize = Math.max(Math.floor(canvas.width * 0.025), 20);
            let padding = fontSize * 1.5;
            let boxWidth = canvas.width * 0.95;
            let boxHeight = fontSize * 13.5;
            let boxX = (canvas.width - boxWidth) / 2;
            let boxY = canvas.height - boxHeight - padding;

            function drawRoundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }

            ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
            drawRoundRect(ctx, boxX, boxY, boxWidth, boxHeight, 20);
            ctx.fill();

            let mapSize = fontSize * 10.5;
            let textX = boxX + padding;
            let availableTextWidth = boxWidth - (padding * 2);

            if (mapLoaded) {
                textX += mapSize + padding;
                availableTextWidth -= (mapSize + padding);

                let drawBoxX = boxX + padding;
                let drawBoxY = boxY + padding;

                ctx.save();
                drawRoundRect(ctx, drawBoxX, drawBoxY, mapSize, mapSize, 12);
                ctx.clip();

                let srcCenterX = 256 + offsetX;
                let srcCenterY = 256 + offsetY;
                let cropSize = 512;
                let srcX = srcCenterX - (cropSize / 2);
                let srcY = srcCenterY - (cropSize / 2);

                ctx.drawImage(mapCnv, srcX, srcY, cropSize, cropSize, drawBoxX, drawBoxY, mapSize, mapSize);

                let pinX = drawBoxX + (mapSize / 2);
                let pinY = drawBoxY + (mapSize / 2);

                ctx.beginPath();
                ctx.arc(pinX, pinY, 20, 0, 2*Math.PI);
                ctx.fillStyle = "rgba(239, 68, 68, 0.4)";
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(pinX, pinY);
                ctx.bezierCurveTo(pinX - 45, pinY - 45, pinX - 45, pinY - 110, pinX, pinY - 110);
                ctx.bezierCurveTo(pinX + 45, pinY - 110, pinX + 45, pinY - 45, pinX, pinY);
                ctx.fillStyle = "#ef4444";
                ctx.fill();

                ctx.lineWidth = 4; ctx.strokeStyle = "#ffffff"; ctx.stroke();

                ctx.beginPath();
                ctx.arc(pinX, pinY - 75, 12, 0, 2*Math.PI);
                ctx.fillStyle = "#ffffff";
                ctx.fill();

                ctx.restore();

                drawRoundRect(ctx, drawBoxX, drawBoxY, mapSize, mapSize, 12);
                ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.stroke();
            } else {
                textX += mapSize + padding;
                availableTextWidth -= (mapSize + padding);
            }

            ctx.shadowColor = "rgba(0,0,0,0.9)";
            ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;

            let currentY = boxY + padding + (fontSize * 1.0);

            ctx.font = `bold ${fontSize * 1.2}px sans-serif`;
            ctx.fillStyle = "#4ade80";
            ctx.fillText(`📌 ${pName}`, textX, currentY);

            ctx.fillStyle = "#60a5fa";
            ctx.textAlign = "right";
            ctx.fillText(compassText, boxX + boxWidth - padding, currentY);
            ctx.textAlign = "left";

            currentY += fontSize * 1.6;
            ctx.font = `bold ${fontSize * 0.9}px sans-serif`;
            ctx.fillStyle = "#ffffff";
            currentY = wrapTextMaxLines(ctx, addressText, textX, currentY, availableTextWidth, fontSize * 1.3, 2);

            currentY += fontSize * 0.5;
            ctx.font = `normal ${fontSize}px sans-serif`;
            if (isOutOfBounds) ctx.fillStyle = "#fca5a5"; else ctx.fillStyle = "#ffffff";
            ctx.fillText(coordStr, textX, currentY);

            currentY += fontSize * 1.4;
            ctx.fillStyle = "#e2e8f0";
            ctx.fillText(wgsStr, textX, currentY);

            currentY += fontSize * 1.5;
            ctx.font = `normal ${fontSize * 0.85}px sans-serif`;
            ctx.fillStyle = "#fcd34d";
            ctx.fillText(`📅 ${dateStr}`, textX, currentY);

            currentY += fontSize * 1.3;
            ctx.fillStyle = "#94a3b8";
            if (currentY > boxY + boxHeight - padding) { currentY = boxY + boxHeight - padding; }
            ctx.fillText(`📝 Note: Captured by SVY21/MM2000 GPS CONVERTER`, textX, currentY);

            // --- SAVE IMAGE (WEB FALLBACK) ---
                        let base64Image = canvas.toDataURL("image/jpeg", 0.9);
                        document.getElementById('cam_placeholder').style.display = 'none';
                        let previewImg = document.getElementById('cam_preview_img');
                        previewImg.src = base64Image;
                        previewImg.style.display = 'block';

                        if (window.AndroidNative && window.AndroidNative.saveImageToGallery) {
                            let fileName = `Survey_${pName}_${new Date().getTime()}.jpg`;
                            window.AndroidNative.saveImageToGallery(base64Image.split(',')[1], fileName);
                            statusBox.style.color = "#16a34a"; statusBox.innerText = `✅ Photo saved to Gallery!`;
                        } else {
                            statusBox.style.color = "#2563eb";

                            // 🔴 Download Button အသစ် ဖန်တီးခြင်း
                            let fileName = `Survey_${pName}_${new Date().getTime()}.jpg`;
                            statusBox.innerHTML = `✅ Photo generated successfully!<br>
                            <button onclick="downloadWebImage('${base64Image}', '${fileName}')" style="margin-top:10px; width:100%; background:#2563eb; color:white; padding:12px; border:none; border-radius:8px; font-size:14px; font-weight:bold; cursor:pointer;">📥 Download Photo</button>`;
                        }
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
                event.target.value = '';
            };

            // 🔴 Web ကနေ ပုံကို တိုက်ရိုက် Download ချပေးမည့် Function
            window.downloadWebImage = function(dataUrl, fileName) {
                let link = document.createElement('a');
                link.href = dataUrl;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            };