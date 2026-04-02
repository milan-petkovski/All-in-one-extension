let ytEnabled = false;
let ytInitialized = false;
let ytReqId = 0;
let ytDebounceTimer = null;
let ytLastUrl = location.href;
let ytLastVideoId = "";
let ytLastDislikes = null;
let ytRetryTimer = null;
let ytRetryEndAt = 0;
let ytApplyDebounce = null;
let ytUrlWatcher = null;
let ytObserver = null;

function getVideoId() {
  let url;
  try {
    url = new URL(window.location.href);
  } catch {
    return "";
  }

  const queryId = url.searchParams.get("v");
  if (queryId) return queryId;

  const shorts = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{6,})/);
  if (shorts?.[1]) return shorts[1];

  const live = url.pathname.match(/^\/live\/([a-zA-Z0-9_-]{6,})/);
  if (live?.[1]) return live[1];

  return "";
}

function isDislikeLabel(label) {
  const l = String(label || "").toLowerCase();
  return l.includes("dislike") || l.includes("ne sviđa") || l.includes("ne svidja") || l.includes("didn't like");
}

function formatDislikes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";

  try {
    return new Intl.NumberFormat(navigator.language || "sr-RS", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return n.toLocaleString();
  }
}

function setWatchDislikes(dislikes) {
  const text = formatDislikes(dislikes);
  if (!text) return false;

  let written = 0;

  // Primary watch/live targets.
  document.querySelectorAll(
    "#segmented-dislike-button #text, " +
    "#segmented-dislike-button .yt-core-attributed-string, " +
    "#segmented-dislike-button .yt-spec-button-shape-next__button-text-content, " +
    "ytd-toggle-button-renderer#dislike-button #text, " +
    "ytd-toggle-button-renderer#dislike-button .yt-core-attributed-string"
  ).forEach((el) => {
    if (el.textContent !== text) el.textContent = text;
    written++;
  });

  // Fallback by aria-label when structural selectors miss.
  if (written === 0) {
    document.querySelectorAll("button[aria-label]").forEach((btn) => {
      if (!isDislikeLabel(btn.getAttribute("aria-label") || "")) return;
      const textEl = btn.querySelector("#text, .yt-core-attributed-string, .yt-spec-button-shape-next__button-text-content");
      if (textEl) {
        if (textEl.textContent !== text) textEl.textContent = text;
      } else {
        btn.textContent = text;
      }
      written++;
    });
  }

  return written > 0;
}

function setShortsDislikes(dislikes) {
  const text = formatDislikes(dislikes);
  if (!text) return;

  const buttons = document.querySelectorAll(
    "ytd-reel-video-renderer[is-active] #dislike-button button, " +
    "ytd-reel-video-renderer #dislike-button button, " +
    "ytd-reel-video-renderer button[aria-label]"
  );

  buttons.forEach((btn) => {
    const label = btn.getAttribute("aria-label") || "";
    const inDislikeSlot = !!btn.closest("#dislike-button");
    if (!inDislikeSlot && !isDislikeLabel(label)) return;

    let badge = btn.querySelector(".aio-ryd-short-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "aio-ryd-short-badge";
      badge.style.display = "block";
      badge.style.fontSize = "12px";
      badge.style.lineHeight = "14px";
      badge.style.fontWeight = "600";
      badge.style.marginTop = "4px";
      badge.style.color = "var(--yt-spec-text-secondary, #aaa)";
      btn.appendChild(badge);
    }

    badge.textContent = text;
  });
}

function applyDislikes(dislikes) {
  if (!ytEnabled) return;

  const isShorts = location.pathname.startsWith("/shorts/");
  if (isShorts) {
    setShortsDislikes(dislikes);
    return;
  }

  const ok = setWatchDislikes(dislikes);
  if (!ok) {
    // Safety fallback for unexpected watch layouts.
    setShortsDislikes(dislikes);
  }
}

function stopRetry() {
  if (ytRetryTimer) {
    clearInterval(ytRetryTimer);
    ytRetryTimer = null;
  }
}

function retryApplyTick() {
  if (!ytEnabled) {
    stopRetry();
    return;
  }
  if (!ytLastVideoId || !Number.isFinite(Number(ytLastDislikes))) return;

  applyDislikes(ytLastDislikes);

  if (Date.now() >= ytRetryEndAt) {
    stopRetry();
  }
}

function startRetryWindow() {
  ytRetryEndAt = Date.now() + 4500;
  if (ytRetryTimer) return;
  ytRetryTimer = setInterval(retryApplyTick, 350);
}

function scheduleApplyFromDomChange() {
  if (!ytEnabled) return;
  if (!ytLastVideoId || !Number.isFinite(Number(ytLastDislikes))) return;
  if (ytApplyDebounce) clearTimeout(ytApplyDebounce);

  ytApplyDebounce = setTimeout(() => {
    applyDislikes(ytLastDislikes);
  }, 120);
}

async function fetchAndApplyDislikes() {
  if (!ytEnabled) return;

  const videoId = getVideoId();
  if (!videoId) return;

  const reqId = ++ytReqId;

  try {
    const res = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${encodeURIComponent(videoId)}`);
    if (!res.ok) return;

    const data = await res.json();
    if (reqId !== ytReqId) return;

    const dislikes = Number(data?.dislikes);
    if (!Number.isFinite(dislikes)) return;

    ytLastVideoId = videoId;
    ytLastDislikes = dislikes;
    applyDislikes(dislikes);
    startRetryWindow();
  } catch {
    // Silent fail.
  }
}

function scheduleFetch() {
  if (!ytEnabled) return;
  if (ytDebounceTimer) clearTimeout(ytDebounceTimer);
  ytDebounceTimer = setTimeout(() => {
    fetchAndApplyDislikes();
  }, 180);
}

function initYtRyd() {
  if (ytInitialized) return;
  ytInitialized = true;

  document.addEventListener("yt-navigate-finish", scheduleFetch);
  document.addEventListener("yt-page-data-updated", scheduleFetch);

  startYtWatchers();
}

function startYtWatchers() {
  if (ytObserver) return;

  ytObserver = new MutationObserver(() => {
    if (!ytEnabled) return;
    scheduleApplyFromDomChange();
  });
  ytObserver.observe(document.documentElement, { childList: true, subtree: true });

  ytUrlWatcher = setInterval(() => {
    if (!ytEnabled) return;
    if (location.href !== ytLastUrl) {
      ytLastUrl = location.href;
      scheduleFetch();
    }
  }, 700);
}

function stopYtWatchers() {
  if (ytObserver) {
    ytObserver.disconnect();
    ytObserver = null;
  }

  if (ytUrlWatcher) {
    clearInterval(ytUrlWatcher);
    ytUrlWatcher = null;
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.ytToggle) return;
  ytEnabled = changes.ytToggle.newValue === true;

  if (ytEnabled) {
    initYtRyd();
    startYtWatchers();
    scheduleFetch();
  } else {
    stopRetry();
    stopYtWatchers();
    if (ytApplyDebounce) {
      clearTimeout(ytApplyDebounce);
      ytApplyDebounce = null;
    }
    if (ytDebounceTimer) {
      clearTimeout(ytDebounceTimer);
      ytDebounceTimer = null;
    }
  }
});

chrome.storage.local.get(["ytToggle"], (data) => {
  ytEnabled = data.ytToggle === true;
  initYtRyd();
  if (ytEnabled) {
    startYtWatchers();
    scheduleFetch();
  } else {
    stopYtWatchers();
  }
});