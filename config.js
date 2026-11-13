// Public by design: the publishable key only works through row-level security (invite list + own rows).
// KING_TEST: the same file serves both sites. Anything under /Kairos-test/ talks to the separate TEST database.
(function () {
  const test = /^\/kairos-test(\/|$)/i.test(location.pathname);
  window.REWIND = test ? {
    test: true,
    url: "https://cqetawiuvnwkmmcrluxj.supabase.co",
    key: "sb_publishable_lpyZu3BGBfMRHRzEqLmqXw_VbxFAN5U",
    spotify: "", google: "",
  } : {
    url: "https://ojmjhqzmkombxrqlknuw.supabase.co",
    key: "sb_publishable_Omp2Vf0fZPRPlVxVz27O-Q_IXtx-38j",
    spotify: "",   // Spotify app Client ID (public). Each person signs into their own Spotify.
    google: "",    // Google OAuth Client ID (public). Each person signs into their own YouTube.
  };
  if (test) document.addEventListener("DOMContentLoaded", () => { const b = document.createElement("div"); b.className = "testbadge"; b.textContent = "TEST"; b.title = "Test build: separate database, not the real app"; document.body.appendChild(b); document.title = "TEST · " + document.title; });
})();
