// animations.js — kinetic typography. Lays out lyric lines and animates
// each word with a configurable entrance per style.

window.LL_Anim = (function () {
  // ---------- easings
  const ease = {
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    outBack:  (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outElastic: (t) => {
      const c4 = (2 * Math.PI) / 3;
      return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    inOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  };

  // ---------- timeline construction
  // Build a per-line schedule with explicit start/end based on either
  // provided times or auto-computed timings.
  function buildSchedule(lyrics, settings) {
    if (!lyrics || !lyrics.length) return { lines: [], total: 0 };

    const hasTimes = lyrics.every((l) => typeof l.start === "number");
    let total = 0;

    if (hasTimes) {
      const sorted = lyrics.slice().sort((a, b) => a.start - b.start);
      sorted.forEach((l, i) => {
        const next = sorted[i + 1];
        l._end = l.end != null ? l.end : next ? next.start : l.start + 3;
      });
      total = sorted[sorted.length - 1]._end + 1;
      return {
        lines: sorted.map((l) => ({ text: l.text, start: l.start, end: l._end })),
        total,
      };
    }

    // Auto-time: char-based pacing modulated by `speed` slider (20..200)
    // speed 20  => slow (~10 chars/s),  speed 200 => fast (~30 chars/s)
    const charsPerSec = 8 + (settings.speed / 200) * 22;
    const minDur = LYRIC_LOOM_CONFIG.TIMING.minLineDuration;
    const maxDur = LYRIC_LOOM_CONFIG.TIMING.maxLineDuration;
    const holdSec = settings.hold / 10; // 5..60 -> 0.5..6s

    let cursor = 0.2;
    const out = [];
    for (const l of lyrics) {
      const dur = clamp((l.text.length || 4) / charsPerSec + holdSec * 0.4, minDur, maxDur);
      out.push({ text: l.text, start: cursor, end: cursor + dur });
      cursor += dur;
    }
    total = cursor + 1;
    return { lines: out, total };
  }

  // ---------- text layout
  // Returns a list of visual rows (arrays of {text, x, y, w}) for a given
  // logical line, wrapped to canvas width.
  function layoutLine(ctx, text, maxWidth, lineHeight) {
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return { rows: [], width: 0, height: 0 };

    const rows = [];
    let row = [];
    let rowWidth = 0;
    const spaceW = ctx.measureText(" ").width;

    for (const w of words) {
      const m = ctx.measureText(w);
      const wWidth = m.width;
      const newRowWidth = rowWidth + (row.length ? spaceW : 0) + wWidth;
      if (newRowWidth > maxWidth && row.length > 0) {
        rows.push({ words: row, width: rowWidth });
        row = [];
        rowWidth = 0;
      }
      row.push({ text: w, w: wWidth });
      rowWidth += (row.length > 1 ? spaceW : 0) + wWidth;
    }
    if (row.length) rows.push({ words: row, width: rowWidth });

    // Assign x for each word (rows centered horizontally)
    let y = 0;
    for (const r of rows) {
      let x = -r.width / 2;
      for (const word of r.words) {
        word.x = x + word.w / 2;
        word.y = y;
        x += word.w + spaceW;
      }
      y += lineHeight;
    }

    return { rows, width: maxWidth, height: rows.length * lineHeight };
  }

  // ---------- core draw
  // Draws the currently-active line(s) at time t.
  function draw(ctx, t, settings) {
    const sched = LL_Anim._schedule;
    if (!sched || !sched.lines.length) {
      drawIdleHint(ctx);
      return;
    }

    // Find active line
    const idx = findActiveLineIndex(sched.lines, t);
    const cw = ctx.canvas.width, ch = ctx.canvas.height;

    ctx.save();
    ctx.translate(cw / 2, ch / 2);

    // Style setup
    const px = settings.fontSize * (cw / 1080); // scale font with canvas width
    ctx.font = `${settings.fontWeight} ${px}px ${settings.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (idx === -1) {
      // Before first or after last — show nothing
      ctx.restore();
      return;
    }

    const line = sched.lines[idx];
    const lineDur = line.end - line.start;
    const localT = (t - line.start) / lineDur; // 0..1 over this line

    // Layout the line
    const maxWidth = cw * 0.85;
    const lineHeight = px * 1.18;
    const layout = layoutLine(ctx, line.text, maxWidth, lineHeight);
    const totalH = layout.height;

    // Animate each word
    const intensity = settings.intensity / 100;        // 0..1
    const stagger = (settings.stagger / 100) * 0.5;    // 0..0.5 (fraction of lineDur)
    const wordCount = layout.rows.reduce((a, r) => a + r.words.length, 0);
    const perWordIn = 0.35;    // each word's entrance duration fraction
    const outBegin = 0.85;      // when line begins to fade out

    // Y offset so multi-row lines are vertically centered
    const yOffset = -totalH / 2 + lineHeight / 2;

    let wordIdx = 0;
    for (const row of layout.rows) {
      for (const word of row.words) {
        const wordStart = stagger * (wordIdx / Math.max(1, wordCount - 1));
        const wT = clamp((localT - wordStart) / perWordIn, 0, 1);
        const eased = ease.outBack(wT);

        // Compute fade-out for the whole line
        const fadeOut = localT < outBegin ? 1 : 1 - (localT - outBegin) / (1 - outBegin);

        drawWord(
          ctx,
          word.text,
          word.x,
          word.y + yOffset,
          eased,
          fadeOut,
          intensity,
          wordIdx,
          settings,
          t,
        );
        wordIdx++;
      }
    }

    ctx.restore();
  }

  function drawWord(ctx, text, x, y, anim, fade, intensity, idx, settings, t) {
    // anim: 0..1 (0 = pre-entrance, 1 = settled)
    // fade: line-level fade out 0..1

    const style = settings.animStyle;
    const accent = settings.accentColor;
    const base = settings.textColor;
    const px = parseFloat(ctx.font);

    let dx = 0, dy = 0, scale = 1, rotate = 0, alpha = 1;
    let color = base;

    // Per-style transforms during entrance
    if (style === "kinetic-mix") {
      // Each word gets a deterministic variant based on its index
      const v = idx % 5;
      if (v === 0) { dy = (1 - anim) * 80 * intensity; alpha = anim; }
      else if (v === 1) { scale = lerp(0.4, 1, ease.outElastic(anim)); alpha = anim; }
      else if (v === 2) { dx = (1 - anim) * (idx % 2 ? 120 : -120) * intensity; alpha = anim; }
      else if (v === 3) { rotate = (1 - anim) * 0.6 * intensity; scale = lerp(0.7, 1, anim); alpha = anim; }
      else { dy = -(1 - anim) * 80 * intensity; alpha = anim; color = idx % 3 === 0 ? accent : base; }
    } else if (style === "pop-scale") {
      scale = lerp(0.3, 1, ease.outBack(anim));
      alpha = anim;
    } else if (style === "slide-rise") {
      dy = (1 - anim) * 90 * intensity;
      alpha = anim;
    } else if (style === "spin-in") {
      rotate = (1 - anim) * Math.PI * 0.5 * intensity;
      scale = lerp(0.5, 1, anim);
      alpha = anim;
    } else if (style === "glitch") {
      const settled = anim > 0.95;
      const wiggle = settled ? Math.sin(t * 40 + idx) * 1.2 * intensity : (1 - anim) * 30 * intensity;
      dx = wiggle * (idx % 2 ? 1 : -1);
      dy = settled ? Math.cos(t * 35 + idx) * 1.2 * intensity : 0;
      alpha = anim;
      color = idx % 4 === 0 ? accent : base;
    } else if (style === "typewriter") {
      // Reveal letters one-by-one inside the word
      const chars = Math.round(text.length * anim);
      const sliced = text.slice(0, chars);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.fillStyle = base;
      drawTextWithShadow(ctx, sliced, x, y);
      // caret
      if (anim < 1) {
        const w = ctx.measureText(sliced).width;
        ctx.fillStyle = accent;
        ctx.fillRect(x + w / 2, y - px * 0.45, Math.max(2, px * 0.04), px * 0.9);
      }
      ctx.restore();
      return;
    } else if (style === "bounce") {
      const a = ease.outElastic(anim);
      dy = (1 - a) * -120 * intensity;
      alpha = anim;
    }

    ctx.save();
    ctx.globalAlpha = alpha * fade;
    ctx.translate(x + dx, y + dy);
    if (rotate) ctx.rotate(rotate);
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.fillStyle = color;
    drawTextWithShadow(ctx, text, 0, 0);
    ctx.restore();
  }

  function drawTextWithShadow(ctx, text, x, y) {
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 2;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  function drawIdleHint(ctx) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "500 32px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Add lyrics, then press play", cw / 2, ch / 2 + 40);
    ctx.restore();
  }

  function findActiveLineIndex(lines, t) {
    if (!lines.length) return -1;
    if (t < lines[0].start) return -1;
    for (let i = 0; i < lines.length; i++) {
      if (t >= lines[i].start && t < lines[i].end) return i;
    }
    if (t >= lines[lines.length - 1].end) return lines.length - 1; // hold last
    return -1;
  }

  // helpers
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  return {
    buildSchedule(lyrics, settings) {
      this._schedule = buildSchedule(lyrics, settings);
      return this._schedule;
    },
    getTotalDuration() {
      return this._schedule ? this._schedule.total : 0;
    },
    draw,
  };
})();
