// Central state. Plain object; mutated by app.js and read by everything.
window.LL_STATE = {
  // Background media
  media: {
    type: null,        // 'image' | 'video' | null
    el: null,          // HTMLImageElement | HTMLVideoElement
    url: null,         // ObjectURL (for cleanup)
  },

  // Audio
  audio: {
    el: null,          // HTMLAudioElement
    url: null,
    duration: 0,
  },

  // Lyrics — array of { text, start, end } in seconds. start/end may be null
  // (no sync) — animation will then run on a hold timer.
  lyrics: [],
  lyricsMeta: { artist: "", title: "" },

  // Playback
  playback: {
    playing: false,
    t: 0,              // seconds since press play
    startWallClock: 0, // performance.now() at last play press
    rafId: null,
  },

  // Settings (mirrors UI; updated by app.js bind* helpers)
  settings: {
    // Background filters
    darken: 35,
    blur: 0,
    brightness: 100,
    vignette: 0,
    overlayColor: "#000000",
    overlayOpacity: 0,

    // Type
    fontFamily: "Inter, sans-serif",
    fontSize: 72,
    fontWeight: 700,
    textColor: "#ffffff",
    accentColor: "#ff3d7f",

    // Motion
    animStyle: "kinetic-mix",
    speed: 55,
    intensity: 60,
    stagger: 35,
    hold: 20,           // 0..60 -> 0..6 sec

    // Attribution
    showAttribution: true,

    // Output
    aspect: "1080x1350",
  },

  // Recording
  recording: {
    active: false,
    recorder: null,
    chunks: [],
    startedAt: 0,
  },
};
