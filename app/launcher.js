import {
  countVisibleMiniApps,
  filterVisibleMiniApps,
  normalizeLauncherVisibility,
} from "./launcher-preferences.mjs";

const MODULE_VISIBILITY_STORAGE_KEY = "launcher.module-visibility";

const root = document.getElementById("launcher-root");
const tiles = document.getElementById("launcher-tiles");
const status = document.getElementById("launcher-status");
const appUpdatePanel = document.getElementById("launcher-update");
const appUpdateSummary = document.getElementById("launcher-update-summary");
const appUpdateInstall = document.getElementById("launcher-update-install");
const appUpdateRetry = document.getElementById("launcher-update-retry");
const visibilityButton = document.getElementById("launcher-visibility-button");
const visibilityHint = document.getElementById("launcher-visibility-hint");
const visibilityDialog = document.getElementById("launcher-visibility-dialog");
const visibilityList = document.getElementById("launcher-visibility-list");
const visibilitySummary = document.getElementById("launcher-visibility-summary");
const visibilityReset = document.getElementById("launcher-visibility-reset");
const visibilityCancel = document.getElementById("launcher-visibility-cancel");
const visibilitySave = document.getElementById("launcher-visibility-save");

let currentCatalogResult = {
  miniApps: [],
};
let currentUpdateGate = null;
let isAppUpdateBusy = false;
let isVisibilityBusy = false;
let launcherVisibility = normalizeLauncherVisibility();

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

function getCatalogMiniApps(result = currentCatalogResult) {
  return Array.isArray(result?.miniApps) ? result.miniApps : [];
}

function getVisibleMiniApps(result = currentCatalogResult, visibility = launcherVisibility) {
  return filterVisibleMiniApps(getCatalogMiniApps(result), visibility);
}

function getVisibilityHintText(result = currentCatalogResult, visibility = launcherVisibility) {
  const miniApps = getCatalogMiniApps(result);
  const totalCount = miniApps.length;
  const visibleCount = countVisibleMiniApps(miniApps, visibility);

  if (!totalCount) {
    return "Brak modułów do ustawienia.";
  }

  if (visibleCount === totalCount) {
    return "Pokazujesz wszystkie moduły.";
  }

  if (!visibleCount) {
    return "Wszystkie moduły są ukryte.";
  }

  return `Pokazujesz ${visibleCount} z ${totalCount} modułów.`;
}

function updateVisibilityHint() {
  visibilityHint.textContent = getVisibilityHintText();
}

function getPrimaryAction(miniApp) {
  if (miniApp.canUpdate) {
    return {
      action: "install",
      label: "Aktualizuj",
    };
  }

  if (miniApp.canInstall) {
    return {
      action: "install",
      label: "Zainstaluj",
    };
  }

  if (miniApp.canLaunch) {
    return {
      action: "open",
      label: "Otwórz",
    };
  }

  return null;
}

function getSecondaryAction(miniApp) {
  if (miniApp.canUpdate && miniApp.canLaunch) {
    return {
      action: "open",
      label: "Otwórz obecną",
    };
  }

  return null;
}

function getVersionLabel(miniApp) {
  const localVersion = String(miniApp.localVersion || "").trim();
  const availableVersion = String(miniApp.availableVersion || "").trim();

  if (miniApp.canUpdate && localVersion && availableVersion) {
    return `v${localVersion} -> v${availableVersion}`;
  }

  if (availableVersion) {
    return `v${availableVersion}`;
  }

  return "";
}

function renderVersionSummary(miniApp) {
  const versionLabel = getVersionLabel(miniApp);
  if (versionLabel) {
    return `<span class="launcher-tile__version">${escapeHtml(versionLabel)}</span>`;
  }

  return "";
}

function buildLauncherStatus(result = {}, visibility = launcherVisibility) {
  const parts = [];
  const updateGate =
    currentUpdateGate && Object.keys(currentUpdateGate).length
      ? currentUpdateGate
      : result.updateGate || {};
  const hasUpdateGate = Boolean(updateGate && Object.keys(updateGate).length);
  const updateSummary = hasUpdateGate ? getUpdateSummary(updateGate) : "";
  if (updateSummary) {
    parts.push(updateSummary);
  }

  const miniApps = getCatalogMiniApps(result);
  const totalCount = miniApps.length;
  const visibleCount = countVisibleMiniApps(miniApps, visibility);

  if (totalCount) {
    parts.push(
      visibleCount === totalCount
        ? `Na ekranie: ${visibleCount} modułów.`
        : `Na ekranie: ${visibleCount} z ${totalCount} modułów.`
    );
  }

  const syncMessage = String(result.syncSummary?.message || "").trim();
  if (syncMessage) {
    parts.push(syncMessage);
    return parts.join(" | ");
  }

  if (result.registryError) {
    parts.push(`Dostępne moduły: ${totalCount}. Rejestr GitHub jest chwilowo niedostępny.`);
    return parts.join(" | ");
  }

  if (totalCount) {
    parts.push(`Dostępne moduły: ${totalCount}.`);
  } else {
    parts.push("Brak dostępnych modułów.");
  }

  return parts.join(" | ");
}

function renderMiniApps(result = {}) {
  const miniApps = getCatalogMiniApps(result);
  const visibleMiniApps = getVisibleMiniApps(result);

  if (!miniApps.length) {
    tiles.innerHTML = `
      <article class="launcher-empty">
        <h2>Brak dostępnych modułów</h2>
        <p>Dodaj moduł do <code>mini_apps/</code> lub do rejestru GitHub.</p>
      </article>
    `;
    return;
  }

  if (!visibleMiniApps.length) {
    tiles.innerHTML = `
      <article class="launcher-empty">
        <h2>Wszystkie moduły są ukryte</h2>
        <p>Otwórz ustawienia widoczności, aby ponownie włączyć wybrane kafelki.</p>
        <div class="launcher-empty__actions">
          <button
            class="launcher-button launcher-button--secondary"
            type="button"
            data-launcher-action="open-visibility-settings"
          >
            Ustaw widoczność modułów
          </button>
        </div>
      </article>
    `;
    return;
  }

  tiles.innerHTML = visibleMiniApps
    .map((miniApp) => {
      const primaryAction = getPrimaryAction(miniApp);
      const secondaryAction = getSecondaryAction(miniApp);

      return `
        <article class="launcher-tile launcher-tile--${escapeHtml(miniApp.status || "default")}">
          <div class="launcher-tile__header">
            <span class="launcher-tile__icon-wrap">
              ${miniApp.iconUrl
                ? `<img class="launcher-tile__icon" src="${escapeHtml(miniApp.iconUrl)}" alt="${escapeHtml(miniApp.name)}" />`
                : `<span class="launcher-tile__fallback">${escapeHtml(miniApp.name.slice(0, 1).toUpperCase())}</span>`}
            </span>
            <div class="launcher-tile__meta">
              <span class="launcher-tile__badge">${escapeHtml(miniApp.statusLabel || "Moduł")}</span>
              ${renderVersionSummary(miniApp)}
            </div>
          </div>
          <div class="launcher-tile__copy">
            <strong>${escapeHtml(miniApp.name)}</strong>
            <span>${escapeHtml(miniApp.description || "Modul aplikacji SilesDoc")}</span>
          </div>
          <div class="launcher-tile__actions">
            ${
              primaryAction
                ? `<button class="launcher-button launcher-button--primary" type="button" data-mini-app-id="${escapeHtml(miniApp.id)}" data-mini-app-action="${escapeHtml(primaryAction.action)}">${escapeHtml(primaryAction.label)}</button>`
                : ""
            }
            ${
              secondaryAction
                ? `<button class="launcher-button launcher-button--secondary" type="button" data-mini-app-id="${escapeHtml(miniApp.id)}" data-mini-app-action="${escapeHtml(secondaryAction.action)}">${escapeHtml(secondaryAction.label)}</button>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function setModuleButtonsDisabled(value) {
  document.querySelectorAll("[data-mini-app-action]").forEach((node) => {
    node.disabled = value;
  });
}

function setAppUpdateButtonsDisabled(value) {
  isAppUpdateBusy = value;
  appUpdateInstall.disabled = value;
  appUpdateRetry.disabled = value;
}

function setVisibilityControlsDisabled(value) {
  isVisibilityBusy = value;
  visibilityButton.disabled = value;
  visibilityReset.disabled = value;
  visibilityCancel.disabled = value;
  visibilitySave.disabled = value;

  visibilityList.querySelectorAll("input[data-mini-app-visibility]").forEach((node) => {
    node.disabled = value;
  });
}

function openVisibilityDialog() {
  renderVisibilityDialog();

  if (typeof visibilityDialog.showModal === "function" && !visibilityDialog.open) {
    visibilityDialog.showModal();
    return;
  }

  visibilityDialog.setAttribute("open", "open");
}

function closeVisibilityDialog() {
  if (typeof visibilityDialog.close === "function" && visibilityDialog.open) {
    visibilityDialog.close();
    return;
  }

  visibilityDialog.removeAttribute("open");
}

function updateVisibilityDialogSummary() {
  const inputs = Array.from(
    visibilityList.querySelectorAll("input[data-mini-app-visibility]")
  );

  if (!inputs.length) {
    visibilitySummary.textContent = "Brak modułów do skonfigurowania.";
    visibilitySave.disabled = true;
    return;
  }

  const visibleCount = inputs.filter((node) => node.checked).length;
  const totalCount = inputs.length;

  if (visibleCount === totalCount) {
    visibilitySummary.textContent = "Wszystkie moduły będą widoczne po zapisaniu.";
  } else if (!visibleCount) {
    visibilitySummary.textContent = "Po zapisaniu wszystkie moduły będą ukryte.";
  } else {
    visibilitySummary.textContent = `Po zapisaniu będzie widoczne ${visibleCount} z ${totalCount} modułów.`;
  }

  visibilitySave.disabled = isVisibilityBusy;
}

function renderVisibilityDialog() {
  const miniApps = getCatalogMiniApps();
  const hiddenIds = new Set(normalizeLauncherVisibility(launcherVisibility).hiddenMiniAppIds);

  if (!miniApps.length) {
    visibilityList.innerHTML = `
      <p class="launcher-visibility-empty">
        Lista modułów jest pusta. Dodaj moduł lokalnie albo pobierz go z rejestru.
      </p>
    `;
    updateVisibilityDialogSummary();
    return;
  }

  visibilityList.innerHTML = miniApps
    .map((miniApp) => {
      const isVisible = !hiddenIds.has(String(miniApp.id || "").trim());
      const versionLabel = getVersionLabel(miniApp);

      return `
        <label class="launcher-visibility-item">
          <input
            type="checkbox"
            data-mini-app-visibility="true"
            data-mini-app-id="${escapeHtml(miniApp.id)}"
            ${isVisible ? "checked" : ""}
          />
          <span class="launcher-visibility-item__copy">
            <strong>${escapeHtml(miniApp.name || miniApp.id)}</strong>
            <span>${escapeHtml(miniApp.description || "Modul aplikacji SilesDoc")}</span>
          </span>
          <span class="launcher-visibility-item__meta">
            <span class="launcher-tile__badge">${escapeHtml(miniApp.statusLabel || "Moduł")}</span>
            ${versionLabel ? `<span class="launcher-tile__version">${escapeHtml(versionLabel)}</span>` : ""}
          </span>
        </label>
      `;
    })
    .join("");

  updateVisibilityDialogSummary();
}

function readVisibilityFromDialog() {
  const hiddenMiniAppIds = Array.from(
    visibilityList.querySelectorAll("input[data-mini-app-visibility]")
  )
    .filter((node) => !node.checked)
    .map((node) => String(node.dataset.miniAppId || "").trim())
    .filter(Boolean);

  return normalizeLauncherVisibility({
    hiddenMiniAppIds,
  });
}

function renderLauncherState() {
  renderMiniApps(currentCatalogResult);
  updateVisibilityHint();
  setStatus(buildLauncherStatus(currentCatalogResult, launcherVisibility));
}

function getUpdateSummary(updateGate = {}) {
  const localVersion = String(updateGate.localVersion || "").trim();
  const remoteVersion = String(updateGate.remoteVersion || "").trim();

  switch (updateGate.status) {
    case "up-to-date":
      return "Brak nowych aktualizacji";
    case "update-required":
      return remoteVersion
        ? `Dostępna jest aktualizacja do v${remoteVersion}`
        : "Dostępna jest aktualizacja aplikacji";
    case "integrity-mismatch":
      return "Wymagana jest ponowna instalacja aplikacji";
    case "verification-persist-failed":
      return "Nie udało się potwierdzić lokalnej wersji";
    case "server-unavailable":
      return "Nie udało się sprawdzić aktualizacji";
    case "offline-verified":
      return "Brak połączenia, używam ostatniej potwierdzonej wersji";
    case "local-newer-than-remote":
      return remoteVersion
        ? `Lokalna wersja v${localVersion} jest nowsza niż wersja na serwerze v${remoteVersion}`
        : `Lokalna wersja v${localVersion} jest nowsza od wydania`;
    case "development":
      return "Tryb deweloperski, aktualizacje są wyłączone";
    default:
      return String(updateGate.message || "Sprawdzanie wersji aplikacji.").trim();
  }
}

function getUpdateVersions(updateGate = {}) {
  const localVersion = String(updateGate.localVersion || "").trim();
  const remoteVersion = String(updateGate.remoteVersion || "").trim();
  const versions = [];

  if (localVersion) {
    versions.push(`lokalnie v${localVersion}`);
  }

  if (remoteVersion) {
    versions.push(
      localVersion && remoteVersion !== localVersion
        ? `dostępna v${remoteVersion}`
        : `serwer v${remoteVersion}`
    );
  }

  return versions.join(" | ");
}

function getUpdateDetail(updateGate = {}) {
  const statusCode = String(updateGate.status || "").trim();

  if (
    statusCode === "server-unavailable" ||
    statusCode === "offline-verified" ||
    statusCode === "integrity-mismatch" ||
    statusCode === "verification-persist-failed"
  ) {
    return String(updateGate.detail || "").trim();
  }

  return "";
}

function shouldAllowManualRetry(updateGate = {}) {
  return updateGate.status !== "development";
}

function buildUpdateLine({
  summary,
  versions = "",
  detail = "",
}) {
  return [summary, versions, detail]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" | ");
}

function setAppUpdateDisplay({
  summary,
  detail = "",
  versions = "",
  state = "default",
  showInstall = false,
  showRetry = true,
}) {
  const normalizedSummary = String(summary || "Sprawdzanie wersji aplikacji.").trim();
  const normalizedDetail = String(detail || "").trim();
  const normalizedVersions = String(versions || "").trim();
  const summaryLine = buildUpdateLine({
    summary: normalizedSummary,
    detail: normalizedDetail,
    versions: normalizedVersions,
  });

  appUpdatePanel.dataset.updateState = state || "default";
  appUpdateSummary.textContent = summaryLine;
  appUpdateSummary.title = summaryLine;

  appUpdateInstall.hidden = !showInstall;
  appUpdateRetry.hidden = !showRetry;
  setAppUpdateButtonsDisabled(isAppUpdateBusy);
}

function renderAppUpdate(updateGate = {}) {
  currentUpdateGate = updateGate;
  setAppUpdateDisplay({
    summary: getUpdateSummary(updateGate),
    detail: getUpdateDetail(updateGate),
    versions: getUpdateVersions(updateGate),
    state: updateGate.status || "default",
    showInstall: Boolean(updateGate.allowInstall),
    showRetry: shouldAllowManualRetry(updateGate),
  });
}

function handleUpdateStatusEvent(payload = {}) {
  switch (payload.phase) {
    case "checking":
      setAppUpdateButtonsDisabled(true);
      setAppUpdateDisplay({
        summary: payload.message || "Sprawdzanie aktualizacji.",
        versions: getUpdateVersions(currentUpdateGate || {}),
        state: "checking",
        showInstall: false,
        showRetry: false,
      });
      return;
    case "downloading":
      setAppUpdateButtonsDisabled(true);
      setAppUpdateDisplay({
        summary: "Pobieranie aktualizacji",
        detail: payload.message || "Trwa pobieranie instalatora.",
        versions: getUpdateVersions(currentUpdateGate || {}),
        state: "downloading",
        showInstall: false,
        showRetry: false,
      });
      return;
    case "verifying":
      setAppUpdateButtonsDisabled(true);
      setAppUpdateDisplay({
        summary: "Weryfikacja instalatora",
        detail: payload.message || "Sprawdzanie integralności instalatora.",
        versions: getUpdateVersions(currentUpdateGate || {}),
        state: "verifying",
        showInstall: false,
        showRetry: false,
      });
      return;
    case "launching":
      setAppUpdateButtonsDisabled(true);
      setAppUpdateDisplay({
        summary: "Uruchamianie instalatora",
        detail: payload.message || "Instalator zostanie uruchomiony za chwilę.",
        versions: getUpdateVersions(currentUpdateGate || {}),
        state: "launching",
        showInstall: false,
        showRetry: false,
      });
      return;
    default:
      break;
  }
}

async function refreshAppUpdateState() {
  setAppUpdateButtonsDisabled(true);

  try {
    const updateGate = await window.bridge.checkForUpdates();
    renderAppUpdate(updateGate);
    setStatus(buildLauncherStatus(currentCatalogResult, launcherVisibility));
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
  } finally {
    setAppUpdateButtonsDisabled(false);
  }
}

async function loadLauncherVisibility() {
  try {
    const storedValue = await window.bridge.loadModuleStorage(MODULE_VISIBILITY_STORAGE_KEY);
    return normalizeLauncherVisibility(storedValue);
  } catch (error) {
    console.error(error);
    return normalizeLauncherVisibility();
  }
}

async function saveLauncherVisibility(nextVisibility) {
  return window.bridge.saveModuleStorage(
    MODULE_VISIBILITY_STORAGE_KEY,
    normalizeLauncherVisibility(nextVisibility)
  );
}

async function persistVisibilityFromDialog() {
  const nextVisibility = readVisibilityFromDialog();
  setVisibilityControlsDisabled(true);

  try {
    await saveLauncherVisibility(nextVisibility);
    launcherVisibility = nextVisibility;
    closeVisibilityDialog();
    renderLauncherState();
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
  } finally {
    setVisibilityControlsDisabled(false);
  }
}

async function startAppUpdateInstall() {
  setAppUpdateButtonsDisabled(true);
  setModuleButtonsDisabled(true);

  try {
    await window.bridge.downloadAndInstallUpdate();
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
    renderAppUpdate(currentUpdateGate || {});
    setAppUpdateButtonsDisabled(false);
    setModuleButtonsDisabled(false);
  }
}

async function bootstrapLauncher() {
  window.bridge.setWindowTitle("SilesDoc - Moduly");
  window.bridge.onUpdateStatus(handleUpdateStatusEvent);
  setStatus("Sprawdzanie aplikacji i synchronizacja modułów.");

  try {
    const [result, storedVisibility] = await Promise.all([
      window.bridge.bootstrapShell(),
      loadLauncherVisibility(),
    ]);

    launcherVisibility = storedVisibility;
    currentCatalogResult = {
      ...currentCatalogResult,
      ...result,
      miniApps: getCatalogMiniApps(result),
    };

    renderAppUpdate(result.updateGate || {});
    renderLauncherState();
    root.classList.remove("is-loading");
  } catch (error) {
    console.error(error);
    tiles.innerHTML = `
      <article class="launcher-empty launcher-empty--error">
        <h2>Nie udało się wczytać launchera</h2>
        <p>${escapeHtml(error.message)}</p>
      </article>
    `;
    setStatus(error.message);
  }
}

document.addEventListener("click", async (event) => {
  if (
    event.target === visibilityButton ||
    event.target.closest("[data-launcher-action='open-visibility-settings']")
  ) {
    openVisibilityDialog();
    return;
  }

  if (event.target === visibilityCancel) {
    closeVisibilityDialog();
    return;
  }

  if (event.target === visibilityReset) {
    visibilityList.querySelectorAll("input[data-mini-app-visibility]").forEach((node) => {
      node.checked = true;
    });
    updateVisibilityDialogSummary();
    return;
  }

  if (event.target === visibilitySave) {
    await persistVisibilityFromDialog();
    return;
  }

  if (event.target === appUpdateInstall) {
    await startAppUpdateInstall();
    return;
  }

  if (event.target === appUpdateRetry) {
    await refreshAppUpdateState();
    return;
  }

  const actionButton = event.target.closest("[data-mini-app-action]");
  if (!actionButton) {
    return;
  }

  const miniAppId = actionButton.dataset.miniAppId;
  const action = actionButton.dataset.miniAppAction;
  if (!miniAppId || !action) {
    return;
  }

  setModuleButtonsDisabled(true);

  try {
    if (action === "open") {
      setStatus(`Otwieranie modułu ${miniAppId}.`);
      await window.bridge.openMiniApp(miniAppId);
      return;
    }

    if (action === "install") {
      setStatus(`Instalowanie modułu ${miniAppId}.`);
      const result = await window.bridge.installMiniApp(miniAppId);
      currentCatalogResult = {
        ...currentCatalogResult,
        ...result,
        miniApps: getCatalogMiniApps(result),
      };
      renderLauncherState();
      setStatus(`Moduł ${miniAppId} jest gotowy.`);
      return;
    }
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
  } finally {
    setModuleButtonsDisabled(false);
  }
});

visibilityList.addEventListener("change", (event) => {
  if (!event.target.matches("input[data-mini-app-visibility]")) {
    return;
  }

  updateVisibilityDialogSummary();
});

bootstrapLauncher();
