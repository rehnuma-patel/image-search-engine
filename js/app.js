// ===== State =====
const state = {
  query: "",
  page: 1,
  totalPages: 0,
  photos: [], // every photo rendered for the current search
  loading: false,
  controller: null, // AbortController for the request in progress
  lightboxIndex: -1,
};

// ===== Elements =====
const $ = (id) => document.getElementById(id);
const searchForm = $("searchForm");
const searchInput = $("searchInput");
const clearBtn = $("clearBtn");
const grid = $("grid");
const loader = $("loader");
const message = $("message");
const resultInfo = $("resultInfo");
const loadMoreBtn = $("loadMore");
const filters = { orientation: $("orientation"), color: $("color"), orderBy: $("orderBy") };

const KEY_STORAGE = "pq_access_key";
const RECENT_STORAGE = "pq_recent";

const getAccessKey = () => CONFIG.ACCESS_KEY || localStorage.getItem(KEY_STORAGE) || "";

// Unsplash asks apps to link back with these UTM parameters
const utm = (url) => `${url}${url.includes("?") ? "&" : "?"}utm_source=${CONFIG.APP_NAME}&utm_medium=referral`;

// ===== Helpers =====
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const formatNumber = (n) => new Intl.NumberFormat().format(n);

// ===== API =====
class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function apiGet(path, params = {}, signal) {
  const url = new URL(CONFIG.API_URL + path);
  Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));

  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Client-ID ${getAccessKey()}`, "Accept-Version": "v1" },
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError(navigator.onLine ? "Could not reach Unsplash. Please try again." : "You appear to be offline. Check your connection.", 0);
  }

  if (!response.ok) {
    const messages = {
      401: "The Unsplash Access Key is missing or invalid.",
      403: "Hourly request limit reached. Please wait a while and try again.",
      404: "Nothing was found for this request.",
      429: "Too many requests. Please slow down and try again.",
    };
    throw new ApiError(messages[response.status] || `Unsplash returned an error (${response.status}).`, response.status);
  }

  return response.json();
}

function searchPhotos(query, page, signal) {
  return apiGet(
    "/search/photos",
    {
      query,
      page,
      per_page: CONFIG.PER_PAGE,
      orientation: filters.orientation.value,
      color: filters.color.value,
      order_by: filters.orderBy.value,
    },
    signal
  );
}

// ===== Search flow =====
async function runSearch(query, { newSearch = true, remember = true } = {}) {
  query = query.trim();
  if (!query) return;

  if (!getAccessKey()) return showKeySetup();

  // Cancel the previous request so an old, slow response can't overwrite new results
  if (state.controller) state.controller.abort();
  state.controller = new AbortController();

  if (newSearch) {
    state.query = query;
    state.page = 1;
    state.photos = [];
    grid.innerHTML = "";
    renderSkeletons();
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (remember) updateUrl(query);
    if (remember) saveRecent(query);
  }

  setLoading(true);
  hideMessage();

  try {
    const data = await searchPhotos(state.query, state.page, state.controller.signal);
    state.totalPages = data.total_pages;
    removeSkeletons();

    if (newSearch && data.results.length === 0) {
      resultInfo.textContent = "";
      showMessage("empty", `No images found for “${state.query}”`, "Try a different keyword or remove the filters.");
      return;
    }

    resultInfo.innerHTML = `<strong>${formatNumber(data.total)}</strong> images for “<span></span>”`;
    resultInfo.querySelector("span").textContent = state.query;
    renderPhotos(data.results);
  } catch (err) {
    if (err.name === "AbortError") return;
    if (!newSearch) state.page--; // retry the same page next time
    removeSkeletons();
    if (err.status === 401) return showKeySetup(true);
    showMessage("error", "Something went wrong", err.message, true);
  } finally {
    setLoading(false);
  }
}

function loadNextPage() {
  if (state.loading || state.page >= state.totalPages) return;
  state.page++;
  runSearch(state.query, { newSearch: false });
}

function setLoading(loading) {
  state.loading = loading;
  grid.setAttribute("aria-busy", loading);
  loader.hidden = !loading || state.page === 1;
  loadMoreBtn.hidden = loading || state.page >= state.totalPages || !state.photos.length;
}

// ===== Rendering =====
function renderSkeletons() {
  const heights = [260, 340, 220, 300, 380, 240, 320, 280];
  heights.forEach((h) => {
    const s = document.createElement("div");
    s.className = "card skeleton";
    s.style.height = `${h}px`;
    grid.appendChild(s);
  });
}

const removeSkeletons = () => grid.querySelectorAll(".skeleton").forEach((s) => s.remove());

function renderPhotos(photos) {
  const fragment = document.createDocumentFragment();

  photos.forEach((photo) => {
    // The API can return the same photo on two pages; skip duplicates
    if (state.photos.some((p) => p.id === photo.id)) return;
    const index = state.photos.push(photo) - 1;

    const card = document.createElement("article");
    card.className = "card";
    card.style.backgroundColor = photo.color; // dominant colour while loading
    card.style.aspectRatio = `${photo.width} / ${photo.height}`;

    const alt = photo.alt_description || photo.description || `Photo by ${photo.user.name}`;
    card.innerHTML = `
      <button class="card-open" aria-label="Open image: ${escapeHtml(alt)}">
        <img src="${photo.urls.small}" alt="${escapeHtml(alt)}" loading="lazy" />
      </button>
      <div class="card-overlay">
        <a class="card-author" href="${utm(photo.user.links.html)}" target="_blank" rel="noopener">
          <img src="${photo.user.profile_image.small}" alt="" loading="lazy" />
          <span>${escapeHtml(photo.user.name)}</span>
        </a>
        <span class="card-likes"><i class="fa-solid fa-heart"></i> ${formatNumber(photo.likes)}</span>
      </div>`;

    const img = card.querySelector(".card-open img");
    img.addEventListener("load", () => card.classList.add("loaded"));
    card.querySelector(".card-open").addEventListener("click", () => openLightbox(index));

    fragment.appendChild(card);
  });

  grid.appendChild(fragment);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML.replace(/"/g, "&quot;");
}

// ===== Messages =====
function showMessage(type, title, text, retry = false) {
  const icons = { empty: "fa-image", error: "fa-triangle-exclamation", key: "fa-key" };
  message.className = `message ${type}`;
  message.innerHTML = `
    <i class="fa-solid ${icons[type]}"></i>
    <h2></h2>
    <p></p>
    ${retry ? '<button class="btn" id="retryBtn"><i class="fa-solid fa-rotate-right"></i> Try again</button>' : ""}`;
  message.querySelector("h2").textContent = title;
  message.querySelector("p").textContent = text;
  message.hidden = false;
  loadMoreBtn.hidden = true;

  if (retry) $("retryBtn").addEventListener("click", () => runSearch(state.query || searchInput.value, { newSearch: !state.photos.length }));
}

const hideMessage = () => (message.hidden = true);

// Lets the app run even before an Access Key is added to config.js
function showKeySetup(invalid = false) {
  grid.innerHTML = "";
  resultInfo.textContent = "";
  message.className = "message key";
  message.innerHTML = `
    <i class="fa-solid fa-key"></i>
    <h2>${invalid ? "Your Access Key was rejected" : "Connect to Unsplash"}</h2>
    <p>Paste a free Unsplash <strong>Access Key</strong> to start searching.
       Create one at <a href="https://unsplash.com/oauth/applications" target="_blank" rel="noopener">unsplash.com/developers</a>.</p>
    <form class="key-form" id="keyForm">
      <label for="keyInput" class="sr-only">Unsplash Access Key</label>
      <input id="keyInput" type="text" placeholder="Your Unsplash Access Key" required minlength="20" autocomplete="off" spellcheck="false" />
      <button class="btn" type="submit">Save key</button>
    </form>
    <p class="small">The key is saved only in this browser.</p>`;
  message.hidden = false;

  $("keyForm").addEventListener("submit", (e) => {
    e.preventDefault();
    localStorage.setItem(KEY_STORAGE, $("keyInput").value.trim());
    runSearch(searchInput.value || CONFIG.DEFAULT_QUERY);
  });
}

// ===== Recent searches & URL =====
function getRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_STORAGE)) || [];
  } catch {
    return [];
  }
}

function saveRecent(query) {
  const list = [query, ...getRecent().filter((q) => q.toLowerCase() !== query.toLowerCase())].slice(0, 6);
  localStorage.setItem(RECENT_STORAGE, JSON.stringify(list));
  renderRecent();
}

function renderRecent() {
  const list = getRecent();
  $("recentWrap").hidden = !list.length;
  const container = $("recentList");
  container.innerHTML = "";
  list.forEach((q) => {
    const btn = document.createElement("button");
    btn.className = "chip small";
    btn.textContent = q;
    btn.addEventListener("click", () => setQuery(q));
    container.appendChild(btn);
  });
}

function updateUrl(query) {
  const url = new URL(location);
  url.searchParams.set("q", query);
  history.replaceState(null, "", url);
}

function setQuery(q) {
  searchInput.value = q;
  clearBtn.hidden = false;
  runSearch(q);
}

// ===== Search events =====
const debouncedSearch = debounce((q) => {
  if (q.trim().length >= 2) runSearch(q);
}, CONFIG.DEBOUNCE_MS);

searchInput.addEventListener("input", () => {
  clearBtn.hidden = !searchInput.value;
  debouncedSearch(searchInput.value);
});

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!searchInput.value.trim()) {
    searchInput.focus();
    return;
  }
  runSearch(searchInput.value);
});

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  clearBtn.hidden = true;
  searchInput.focus();
});

document.querySelectorAll("#suggestions .chip").forEach((chip) => {
  chip.addEventListener("click", () => setQuery(chip.dataset.q));
});

$("clearRecent").addEventListener("click", () => {
  localStorage.removeItem(RECENT_STORAGE);
  renderRecent();
});

Object.values(filters).forEach((select) => {
  select.addEventListener("change", () => state.query && runSearch(state.query));
});

// Press "/" to jump to the search box
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== searchInput && !$("lightbox").open) {
    e.preventDefault();
    searchInput.focus();
  }
});

// ===== Infinite scroll =====
new IntersectionObserver(
  (entries) => {
    if (entries[0].isIntersecting && state.photos.length) loadNextPage();
  },
  { rootMargin: "600px" }
).observe($("sentinel"));

loadMoreBtn.addEventListener("click", loadNextPage);

// ===== Lightbox =====
const lightbox = $("lightbox");
const lbImage = $("lbImage");

function openLightbox(index) {
  state.lightboxIndex = index;
  showLightboxPhoto();
  if (!lightbox.open) lightbox.showModal();
  document.body.classList.add("no-scroll");
}

function showLightboxPhoto() {
  const photo = state.photos[state.lightboxIndex];
  const wrap = $("lbImageWrap");
  wrap.classList.add("loading");
  wrap.style.backgroundColor = photo.color;
  lbImage.onload = () => wrap.classList.remove("loading");
  lbImage.src = photo.urls.regular;
  lbImage.alt = photo.alt_description || photo.description || `Photo by ${photo.user.name}`;

  $("lbAvatar").src = photo.user.profile_image.medium;
  $("lbAuthor").textContent = photo.user.name;
  $("lbAuthor").href = utm(photo.user.links.html);
  $("lbUsername").textContent = `@${photo.user.username}`;
  $("lbTitle").textContent = photo.description || photo.alt_description || "Untitled";
  $("lbLikes").textContent = formatNumber(photo.likes);
  $("lbSize").textContent = `${photo.width} × ${photo.height}`;
  $("lbCounter").textContent = `${state.lightboxIndex + 1} / ${state.photos.length}`;
  $("lbUnsplash").href = utm(photo.links.html);

  $("lbPrev").disabled = state.lightboxIndex === 0;
  $("lbNext").disabled = state.lightboxIndex === state.photos.length - 1;

  // Load more results in the background when nearing the end
  if (state.lightboxIndex >= state.photos.length - 3) loadNextPage();
}

function stepLightbox(dir) {
  const next = state.lightboxIndex + dir;
  if (next < 0 || next >= state.photos.length) return;
  state.lightboxIndex = next;
  showLightboxPhoto();
}

function closeLightbox() {
  lightbox.close();
}

lightbox.addEventListener("close", () => {
  document.body.classList.remove("no-scroll");
  lbImage.removeAttribute("src");
  // Return focus to the card that opened the lightbox
  grid.querySelectorAll(".card-open")[state.lightboxIndex]?.focus();
});

$("lbClose").addEventListener("click", closeLightbox);
$("lbPrev").addEventListener("click", () => stepLightbox(-1));
$("lbNext").addEventListener("click", () => stepLightbox(1));

// Click on the dark backdrop closes the lightbox
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});

lightbox.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") stepLightbox(-1);
  if (e.key === "ArrowRight") stepLightbox(1);
});

// Swipe on touch screens
let touchX = null;
lightbox.addEventListener("touchstart", (e) => (touchX = e.touches[0].clientX), { passive: true });
lightbox.addEventListener("touchend", (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) stepLightbox(dx < 0 ? 1 : -1);
  touchX = null;
});

// Download: Unsplash requires calling the download_location endpoint first
$("lbDownload").addEventListener("click", async () => {
  const photo = state.photos[state.lightboxIndex];
  const btn = $("lbDownload");
  btn.disabled = true;
  try {
    const { url } = await apiGet(new URL(photo.links.download_location).pathname, { ixid: new URL(photo.links.download_location).searchParams.get("ixid") });
    const blob = await (await fetch(url)).blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${photo.user.username}-${photo.id}.jpg`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch {
    window.open(utm(photo.links.html), "_blank", "noopener");
  } finally {
    btn.disabled = false;
  }
});

// ===== Theme & back to top =====
const themeToggle = $("themeToggle");

function updateThemeIcon() {
  const dark = document.documentElement.dataset.theme === "dark";
  themeToggle.innerHTML = `<i class="fa-solid ${dark ? "fa-sun" : "fa-moon"}"></i>`;
  themeToggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
}

themeToggle.addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "";
  localStorage.setItem("pq_theme", dark ? "dark" : "light");
  updateThemeIcon();
});

window.addEventListener("scroll", () => {
  $("backToTop").classList.toggle("show", scrollY > 700);
  $("topbar").classList.toggle("scrolled", scrollY > 10);
});
$("backToTop").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

// ===== Start =====
updateThemeIcon();
renderRecent();

const urlQuery = new URLSearchParams(location.search).get("q");
searchInput.value = urlQuery || "";
clearBtn.hidden = !searchInput.value;
runSearch(urlQuery || CONFIG.DEFAULT_QUERY, { remember: !!urlQuery });
