const root = document.getElementById("launcher-root");
const tiles = document.getElementById("launcher-tiles");
const status = document.getElementById("launcher-status");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(message) {
  status.textContent = message;
}

function renderMiniApps(miniApps = []) {
  if (!miniApps.length) {
    tiles.innerHTML = `
      <article class="launcher-empty">
        <h2>Brak dostepnych modulow</h2>
        <p>Dodaj katalog do <code>mini_apps/</code>, aby pojawil sie na ekranie startowym.</p>
      </article>
    `;
    setStatus("Nie znaleziono zadnych mini-app.");
    return;
  }

  tiles.innerHTML = miniApps
    .map(
      (miniApp) => `
        <button class="launcher-tile" type="button" data-mini-app-id="${escapeHtml(miniApp.id)}">
          <span class="launcher-tile__icon-wrap">
            ${miniApp.iconUrl
              ? `<img class="launcher-tile__icon" src="${escapeHtml(miniApp.iconUrl)}" alt="${escapeHtml(miniApp.name)}" />`
              : `<span class="launcher-tile__fallback">${escapeHtml(miniApp.name.slice(0, 1).toUpperCase())}</span>`}
          </span>
          <span class="launcher-tile__copy">
            <strong>${escapeHtml(miniApp.name)}</strong>
            <span>${escapeHtml(miniApp.description || "Lokalny modul aplikacji")}</span>
          </span>
        </button>
      `
    )
    .join("");

  setStatus(`Dostepne moduly: ${miniApps.length}.`);
}

async function bootstrapLauncher() {
  window.bridge.setWindowTitle("SME - Moduly");
  setStatus("Wczytywanie listy modulow.");

  try {
    const result = await window.bridge.bootstrapShell();
    renderMiniApps(result.miniApps || []);
    root.classList.remove("is-loading");
  } catch (error) {
    console.error(error);
    tiles.innerHTML = `
      <article class="launcher-empty launcher-empty--error">
        <h2>Nie udalo sie wczytac launchera</h2>
        <p>${escapeHtml(error.message)}</p>
      </article>
    `;
    setStatus(error.message);
  }
}

document.addEventListener("click", async (event) => {
  const tile = event.target.closest("[data-mini-app-id]");
  if (!tile) {
    return;
  }

  const miniAppId = tile.dataset.miniAppId;
  if (!miniAppId) {
    return;
  }

  document.querySelectorAll("[data-mini-app-id]").forEach((node) => {
    node.disabled = true;
  });
  setStatus(`Otwieranie modulu ${miniAppId}.`);

  try {
    await window.bridge.openMiniApp(miniAppId);
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    document.querySelectorAll("[data-mini-app-id]").forEach((node) => {
      node.disabled = false;
    });
    setStatus(error.message);
  }
});

bootstrapLauncher();
