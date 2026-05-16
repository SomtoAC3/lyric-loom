// export.js — PNG snapshot + MP4 (or WebM fallback) recording.

window.LL_Export = (function () {
  function snapshotPNG(canvas, filename = "lyric-loom-frame.png") {
    canvas.toBlob((blob) => {
      if (!blob) return;
      triggerDownload(blob, filename);
    }, "image/png");
  }

  // Pick the best video MIME the browser can write to. We prefer MP4 (H.264)
  // because it's broadly compatible; Chrome 126+ and Safari support it. Fall
  // back to WebM (VP9 / VP8) on older Chrome/Firefox.
  function pickMimeType() {
    const candidates = [
      "video/mp4;codecs=h264,aac",
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    for (const m of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) {
        return m;
      }
    }
    return "";
  }

  async function startRecording(canvas, audioEl, onTick) {
    const rec = LL_STATE.recording;
    if (rec.active) return;

    const mime = pickMimeType();
    if (!mime) throw new Error("This browser cannot record video.");

    // Canvas capture
    const fps = 30;
    const canvasStream = canvas.captureStream(fps);

    // Audio track — capture from the playing HTMLAudioElement, if any
    if (audioEl && audioEl.src) {
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        // If we already created one, reuse
        if (!LL_Export._audioCtx) {
          LL_Export._audioCtx = audioCtx;
          LL_Export._srcNode = audioCtx.createMediaElementSource(audioEl);
          LL_Export._destNode = audioCtx.createMediaStreamDestination();
          // Keep audible
          LL_Export._srcNode.connect(audioCtx.destination);
          LL_Export._srcNode.connect(LL_Export._destNode);
        }
        const audioStream = LL_Export._destNode.stream;
        audioStream.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
      } catch (e) {
        console.warn("Audio capture failed:", e.message);
      }
    }

    rec.chunks = [];
    rec.recorder = new MediaRecorder(canvasStream, {
      mimeType: mime,
      videoBitsPerSecond: 6_000_000,
    });
    rec.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) rec.chunks.push(e.data);
    };
    rec.recorder.onstop = () => {
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(rec.chunks, { type: mime });
      triggerDownload(blob, `lyric-loom-${Date.now()}.${ext}`);
      rec.chunks = [];
      rec.active = false;
    };
    rec.recorder.start(100);
    rec.startedAt = performance.now();
    rec.active = true;

    if (onTick) {
      const id = setInterval(() => {
        if (!rec.active) {
          clearInterval(id);
          return;
        }
        onTick((performance.now() - rec.startedAt) / 1000);
      }, 100);
    }
    return mime;
  }

  function stopRecording() {
    const rec = LL_STATE.recording;
    if (!rec.active || !rec.recorder) return;
    try {
      rec.recorder.stop();
    } catch (e) {
      console.warn("Stop error:", e.message);
    }
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return { snapshotPNG, startRecording, stopRecording, pickMimeType };
})();
