// canvas.js — owns the <canvas>, draws background + filters, exposes the
// render loop. Lyrics are drawn by animations.js.

window.LL_Canvas = (function () {
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const bgImageEl = document.getElementById("bgImage");
  const bgVideoEl = document.getElementById("bgVideo");

  function setSize(wxh) {
    const [w, h] = wxh.split("x").map(Number);
    canvas.width = w;
    canvas.height = h;
  }

  function loadMediaFromFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("No file"));
      const s = LL_STATE.media;
      if (s.url) URL.revokeObjectURL(s.url);
      const url = URL.createObjectURL(file);
      s.url = url;

      if (file.type.startsWith("image/")) {
        const img = new Image();
        img.onload = () => {
          s.type = "image";
          s.el = img;
          resolve();
        };
        img.onerror = reject;
        img.src = url;
        bgImageEl.src = url;
      } else if (file.type.startsWith("video/")) {
        const v = bgVideoEl;
        v.src = url;
        v.onloadeddata = () => {
          s.type = "video";
          s.el = v;
          v.muted = true;
          v.loop = true;
          v.play().catch(() => {});
          resolve();
        };
        v.onerror = reject;
      } else {
        reject(new Error("Unsupported file type"));
      }
    });
  }

  function clear() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawBackground() {
    const s = LL_STATE.media;
    const set = LL_STATE.settings;

    clear();

    if (!s.el) {
      // No media yet — soft gradient placeholder
      const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      g.addColorStop(0, "#1c1c28");
      g.addColorStop(1, "#0b0b10");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "500 28px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Upload a photo or video to begin", canvas.width / 2, canvas.height / 2);
      return;
    }

    // Object-fit: cover behavior
    const src = s.el;
    const sw = src.videoWidth || src.naturalWidth || src.width;
    const sh = src.videoHeight || src.naturalHeight || src.height;
    const cw = canvas.width, ch = canvas.height;
    const srcRatio = sw / sh, dstRatio = cw / ch;
    let dw, dh, dx, dy;
    if (srcRatio > dstRatio) {
      dh = ch;
      dw = dh * srcRatio;
      dx = (cw - dw) / 2;
      dy = 0;
    } else {
      dw = cw;
      dh = dw / srcRatio;
      dx = 0;
      dy = (ch - dh) / 2;
    }

    // CSS-style filter on canvas
    const filterParts = [];
    if (set.blur > 0) filterParts.push(`blur(${set.blur}px)`);
    if (set.brightness !== 100) filterParts.push(`brightness(${set.brightness}%)`);
    ctx.filter = filterParts.length ? filterParts.join(" ") : "none";
    ctx.drawImage(src, dx, dy, dw, dh);
    ctx.filter = "none";

    // Color overlay tint
    if (set.overlayOpacity > 0) {
      ctx.fillStyle = hexWithAlpha(set.overlayColor, set.overlayOpacity / 100);
      ctx.fillRect(0, 0, cw, ch);
    }

    // Darken for readability
    if (set.darken > 0) {
      ctx.fillStyle = `rgba(0,0,0,${set.darken / 100})`;
      ctx.fillRect(0, 0, cw, ch);
    }

    // Vignette
    if (set.vignette > 0) {
      const intensity = set.vignette / 100;
      const r = Math.hypot(cw, ch) * 0.6;
      const grad = ctx.createRadialGradient(cw / 2, ch / 2, r * 0.3, cw / 2, ch / 2, r);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, `rgba(0,0,0,${0.85 * intensity})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cw, ch);
    }
  }

  function drawAttribution() {
    if (!LL_STATE.settings.showAttribution) return;
    const { artist, title } = LL_STATE.lyricsMeta;
    if (!artist && !title) return;

    const cw = canvas.width, ch = canvas.height;
    ctx.save();
    const text = title && artist ? `“${title}” — ${artist}` : artist || title;
    ctx.font = `500 ${Math.round(cw * 0.02)}px Inter, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const pad = Math.round(cw * 0.03);
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 8;
    ctx.fillText(text, pad, ch - pad);
    ctx.restore();
  }

  function hexWithAlpha(hex, a) {
    const m = hex.replace("#", "");
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  return {
    canvas,
    ctx,
    setSize,
    loadMediaFromFile,
    drawBackground,
    drawAttribution,
    hexWithAlpha,
  };
})();
