// app.js — main controller. Binds UI events to state, runs the render
// loop, kicks off lyrics fetch, exports.

(function () {
  const $ = (id) => document.getElementById(id);

  // ----- UI element refs
  const ui = {
    dropZone: $("dropZone"),
    pickMediaBtn: $("pickMediaBtn"),
    mediaInput: $("mediaInput"),
    audioInput: $("audioInput"),
    audioEl: $("audio"),

    titleInput: $("titleInput"),
    songSuggestions: $("songSuggestions"),
    lyricsStatus: $("lyricsStatus"),
    lyricsInput: $("lyricsInput"),

    // background filters
    darken: $("darken"),
    blur: $("blur"),
    brightness: $("brightness"),
    vignette: $("vignette"),
    overlayColor: $("overlayColor"),
    overlayOpacity: $("overlayOpacity"),

    // type
    fontFamily: $("fontFamily"),
    fontSize: $("fontSize"),
    fontWeight: $("fontWeight"),
    textColor: $("textColor"),
    accentColor: $("accentColor"),

    // motion
    animStyle: $("animStyle"),
    speed: $("speed"),
    intensity: $("intensity"),
    stagger: $("stagger"),
    hold: $("hold"),

    showAttribution: $("showAttribution"),

    // stage
    playBtn: $("playBtn"),
    playIcon: $("playIcon"),
    restartBtn: $("restartBtn"),
    timecode: $("timecode"),
    aspect: $("aspect"),
    snapshotBtn: $("snapshotBtn"),
    recordBtn: $("recordBtn"),
    recPill: $("recPill"),
    recTime: $("recTime"),

    toast: $("toast"),
  };

  const S = LL_STATE;

  // ----- bind settings (every input writes back to state)
  function bindSetting(el, key, cast = (v) => v) {
    if (!el) return;
    const apply = () => {
      S.settings[key] = cast(el.value);
      // The render loop reads from state on every frame, no need to redraw here
      // — but if not playing, we should redraw the static frame.
      if (!S.playback.playing) requestFrame();
    };
    el.addEventListener("input", apply);
    el.addEventListener("change", apply);
    apply();
  }

  bindSetting(ui.darken, "darken", Number);
  bindSetting(ui.blur, "blur", Number);
  bindSetting(ui.brightness, "brightness", Number);
  bindSetting(ui.vignette, "vignette", Number);
  bindSetting(ui.overlayColor, "overlayColor");
  bindSetting(ui.overlayOpacity, "overlayOpacity", Number);

  bindSetting(ui.fontFamily, "fontFamily");
  bindSetting(ui.fontSize, "fontSize", Number);
  bindSetting(ui.fontWeight, "fontWeight", Number);
  bindSetting(ui.textColor, "textColor");
  bindSetting(ui.accentColor, "accentColor");

  bindSetting(ui.animStyle, "animStyle");
  bindSetting(ui.speed, "speed", Number);
  bindSetting(ui.intensity, "intensity", Number);
  bindSetting(ui.stagger, "stagger", Number);
  bindSetting(ui.hold, "hold", Number);

  ui.showAttribution.addEventListener("change", () => {
    S.settings.showAttribution = ui.showAttribution.checked;
    if (!S.playback.playing) requestFrame();
  });

  ui.aspect.addEventListener("change", () => {
    S.settings.aspect = ui.aspect.value;
    LL_Canvas.setSize(ui.aspect.value);
    rebuildSchedule();
    requestFrame();
  });

  // ----- media (photo / video) upload
  function setupMediaUpload() {
    ui.pickMediaBtn.addEventListener("click", () => ui.mediaInput.click());
    ui.mediaInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (file) await loadMedia(file);
    });

    // Drag-and-drop
    ui.dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      ui.dropZone.classList.add("drag");
    });
    ui.dropZone.addEventListener("dragleave", () => {
      ui.dropZone.classList.remove("drag");
    });
    ui.dropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      ui.dropZone.classList.remove("drag");
      const file = e.dataTransfer?.files?.[0];
      if (file) await loadMedia(file);
    });
  }

  async function loadMedia(file) {
    try {
      await LL_Canvas.loadMediaFromFile(file);
      toast(`Loaded ${file.name}`);
      requestFrame();
    } catch (e) {
      toast(`Couldn't load file: ${e.message}`, true);
    }
  }

  // ----- audio upload
  ui.audioInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (S.audio.url) URL.revokeObjectURL(S.audio.url);
    S.audio.url = URL.createObjectURL(file);
    ui.audioEl.src = S.audio.url;
    ui.audioEl.onloadedmetadata = () => {
      S.audio.duration = ui.audioEl.duration || 0;
      toast(`Audio attached (${Math.round(S.audio.duration)}s)`);
    };
  });

  // ----- song search autocomplete
  let searchDebounce;

  ui.titleInput.addEventListener("input", () => {
    const q = ui.titleInput.value.trim();
    S.lyricsMeta.title = q;
    if (!S.playback.playing) requestFrame();

    clearTimeout(searchDebounce);
    if (q.length < 2) { hideSuggestions(); return; }
    searchDebounce = setTimeout(() => doSearch(q), 350);
  });

  ui.titleInput.addEventListener("blur", () => {
    setTimeout(hideSuggestions, 150);
  });

  async function doSearch(q) {
    try {
      const results = await LL_Lyrics.searchSongs(q);
      showSuggestions(results);
    } catch (_) {
      hideSuggestions();
    }
  }

  function showSuggestions(results) {
    if (!results.length) { hideSuggestions(); return; }
    ui.songSuggestions.innerHTML = "";
    results.forEach((r) => {
      const li = document.createElement("li");
      const titleEl = document.createElement("span");
      titleEl.textContent = r.title;
      const artistEl = document.createElement("span");
      artistEl.className = "sg-artist";
      artistEl.textContent = r.artist;
      li.appendChild(titleEl);
      li.appendChild(artistEl);
      li.addEventListener("mousedown", (e) => { e.preventDefault(); selectSong(r); });
      ui.songSuggestions.appendChild(li);
    });
    ui.songSuggestions.hidden = false;
  }

  function hideSuggestions() {
    ui.songSuggestions.hidden = true;
    ui.songSuggestions.innerHTML = "";
  }

  async function selectSong(song) {
    ui.titleInput.value = song.title;
    S.lyricsMeta.artist = song.artist;
    S.lyricsMeta.title = song.title;
    hideSuggestions();

    const proxy = (window.LYRIC_LOOM_CONFIG || {}).LYRICS_PROXY_URL;
    if (!proxy) {
      setLyricsStatus("No lyrics proxy configured — paste lyrics manually.", "err");
      return;
    }
    setLyricsStatus("Fetching lyrics…", "");
    try {
      const data = await LL_Lyrics.fetchLyrics(song.artist, song.title);
      ui.lyricsInput.value = data.lyrics;
      S.lyricsMeta.artist = data.artist || song.artist;
      S.lyricsMeta.title = data.title || song.title;
      setLyricsStatus(`Loaded from ${data.source}.`, "ok");
      onLyricsChanged();
    } catch (e) {
      setLyricsStatus(e.message, "err");
    }
  }

  // ----- lyrics
  ui.lyricsInput.addEventListener("input", onLyricsChanged);

  function onLyricsChanged() {
    S.lyrics = LL_Lyrics.parseLyrics(ui.lyricsInput.value);
    S.lyricsMeta.title = ui.titleInput.value.trim();
    rebuildSchedule();
    if (!S.playback.playing) requestFrame();
  }

  function setLyricsStatus(msg, cls = "") {
    ui.lyricsStatus.textContent = msg;
    ui.lyricsStatus.className = "lyrics-status " + cls;
  }

  function rebuildSchedule() {
    LL_Anim.buildSchedule(S.lyrics, S.settings);
  }

  // ----- playback
  ui.playBtn.addEventListener("click", () => {
    if (S.playback.playing) pause();
    else play();
  });

  ui.restartBtn.addEventListener("click", () => {
    S.playback.t = 0;
    if (ui.audioEl.src) {
      ui.audioEl.currentTime = 0;
    }
    if (S.playback.playing) {
      S.playback.startWallClock = performance.now();
    }
    requestFrame();
  });

  function play() {
    if (!S.lyrics.length) {
      toast("Add some lyrics first.", true);
      return;
    }
    S.playback.playing = true;
    S.playback.startWallClock = performance.now() - S.playback.t * 1000;
    ui.playIcon.textContent = "❚❚";

    if (ui.audioEl.src) {
      ui.audioEl.currentTime = S.playback.t;
      ui.audioEl.play().catch(() => {});
    }
    loop();
  }

  function pause() {
    S.playback.playing = false;
    ui.playIcon.textContent = "▶";
    if (ui.audioEl.src) ui.audioEl.pause();
  }

  function loop() {
    if (!S.playback.playing) return;
    S.playback.t = (performance.now() - S.playback.startWallClock) / 1000;
    drawFrame();
    const total = computeTotalDuration();
    if (S.playback.t >= total) {
      pause();
      S.playback.t = total;
    }
    S.playback.rafId = requestAnimationFrame(loop);
  }

  function computeTotalDuration() {
    const fromAnim = LL_Anim.getTotalDuration() || 0;
    const fromAudio = S.audio.duration || 0;
    return Math.max(fromAnim, fromAudio, 1);
  }

  function requestFrame() {
    // single static frame
    cancelAnimationFrame(S.playback.rafId);
    drawFrame();
  }

  function drawFrame() {
    LL_Canvas.drawBackground();
    LL_Anim.draw(LL_Canvas.ctx, S.playback.t, S.settings);
    LL_Canvas.drawAttribution();
    updateTimecode();
  }

  function updateTimecode() {
    const total = computeTotalDuration();
    ui.timecode.textContent = `${S.playback.t.toFixed(1)}s / ${total.toFixed(1)}s`;
  }

  // ----- export
  ui.snapshotBtn.addEventListener("click", () => {
    drawFrame();
    LL_Export.snapshotPNG(LL_Canvas.canvas);
    toast("PNG saved.");
  });

  ui.recordBtn.addEventListener("click", async () => {
    const rec = S.recording;
    if (rec.active) {
      LL_Export.stopRecording();
      ui.recordBtn.textContent = "● Record MP4";
      ui.recPill.hidden = true;
      return;
    }
    if (!S.lyrics.length) {
      toast("Add lyrics first.", true);
      return;
    }
    try {
      // Reset playback and start fresh so the recording starts at t=0
      S.playback.t = 0;
      if (ui.audioEl.src) ui.audioEl.currentTime = 0;
      play();

      const mime = await LL_Export.startRecording(LL_Canvas.canvas, ui.audioEl, (t) => {
        ui.recTime.textContent = `${t.toFixed(1)}s`;
      });
      ui.recordBtn.textContent = "■ Stop";
      ui.recPill.hidden = false;
      toast(`Recording (${mime.includes("mp4") ? "MP4" : "WebM"}). Click Stop when done.`);

      // Auto-stop when timeline ends
      const total = computeTotalDuration();
      setTimeout(() => {
        if (S.recording.active) {
          LL_Export.stopRecording();
          ui.recordBtn.textContent = "● Record MP4";
          ui.recPill.hidden = true;
          pause();
          toast("Recording finished — file downloading.");
        }
      }, (total + 0.5) * 1000);
    } catch (e) {
      toast(e.message, true);
    }
  });

  // ----- toast
  let toastTimer;
  function toast(msg, error = false) {
    ui.toast.hidden = false;
    ui.toast.textContent = msg;
    ui.toast.style.borderColor = error ? "var(--warn)" : "var(--line)";
    ui.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      ui.toast.hidden = true;
      ui.toast.classList.remove("show");
    }, 3000);
  }

  // ----- bootstrap
  function init() {
    LL_Canvas.setSize(S.settings.aspect);
    setupMediaUpload();

    // Seed with a friendly demo so the user sees motion immediately
    ui.lyricsInput.value =
      "Welcome to Lyric Loom\nUpload a photo or video\nPick a font, pick a color\nWatch your words come alive";
    S.lyricsMeta.artist = "Lyric Loom";
    S.lyricsMeta.title = "Hello, world";
    onLyricsChanged();
    drawFrame();
  }

  init();
})();
