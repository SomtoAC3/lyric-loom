// =====================================================================
// Lyric Loom — runtime config
// ---------------------------------------------------------------------
// LYRICS_PROXY_URL is the URL of YOUR deployed serverless function that
// proxies Genius / Musixmatch (api/lyrics.js in this repo, deployable to
// Vercel or Netlify). Leave it empty to disable auto-fetch — the manual
// paste textarea always works as a fallback.
//
// Example after deploying to Vercel:
//   const LYRICS_PROXY_URL = "https://your-project.vercel.app/api/lyrics";
// =====================================================================

window.LYRIC_LOOM_CONFIG = {
  // Replace with your deployed proxy URL, or leave blank for paste-only mode.
  LYRICS_PROXY_URL: "",

  // Default scene size — gets overridden by the aspect picker.
  DEFAULT_W: 1080,
  DEFAULT_H: 1350,

  // Animation feels per-style. Tunable from the UI too.
  TIMING: {
    minLineDuration: 1.4,   // seconds — used as a floor
    maxLineDuration: 6.0,   // seconds — used as a ceiling
  },
};
