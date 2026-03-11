const root = document.getElementById("launcher-root");
const tiles = document.getElementById("launcher-tiles");
const status = document.getElementById("launcher-status");
const appUpdatePanel = document.getElementById("launcher-update");
const appUpdateSummary = document.getElementById("launcher-update-summary");
const appUpdateInstall = document.getElementById("launcher-update-install");
const appUpdateRetry = document.getElementById("launcher-update-retry");

let currentUpdateGate = null;
let isAppUpdateBusy = false;

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
      label: "Otworz",
    };
  }

  return null;
}

function getSecondaryAction(miniApp) {
  if (miniApp.canUpdate && miniApp.canLaunch) {
    return {
      action: "open",
      label: "Otworz obecna",
    };
  }

  return null;
}

function renderVersionSummary(miniApp) {
  const localVersion = String(miniApp.localVersion || "").trim();
  const availableVersion = String(miniApp.availableVersion || "").trim();

  if (miniApp.canUpdate && localVersion && availableVersion) {
    return `<span class="launcher-tile__version">v${escapeHtml(localVersion)} -> v${escapeHtml(availableVersion)}</span>`;
  }

  if (availableVersion) {
    return `<span class="launcher-tile__version">v${escapeHtml(availableVersion)}</span>`;
  }

  return "";
}

function buildLauncherStatus(result = {}) {
  const parts = [];
  const hasUpdateGate = Boolean(result.updateGate && Object.keys(result.updateGate).length);
  const updateSummary = hasUpdateGate ? getUpdateSummary(result.updateGate) : "";
  if (updateSummary) {
    parts.push(updateSummary);
  }

  const syncMessage = String(result.syncSummary?.message || "").trim();
  if (syncMessage) {
    parts.push(syncMessage);
    return parts.join(" | ");
  }

  const miniApps = Array.isArray(result.miniApps) ? result.miniApps : [];
  if (result.registryError) {
    parts.push(`Dostepne moduly: ${miniApps.length}. Rejestr GitHub chwilowo niedostepny.`);
    return parts.join(" | ");
  }

  parts.push(`Dostepne moduly: ${miniApps.length}.`);
  return parts.join(" | ");
}

function renderMiniApps(result = {}) {
  const miniApps = Array.isArray(result.miniApps) ? result.miniApps : [];

  if (!miniApps.length) {
    tiles.innerHTML = `
      <article class="launcher-empty">
        <h2>Brak dostepnych modulow</h2>
        <p>Dodaj modul do <code>mini_apps/</code> lub do rejestru GitHub.</p>
      </article>
    `;
    return;
  }

  tiles.innerHTML = miniApps
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
              <span class="launcher-tile__badge">${escapeHtml(miniApp.statusLabel || "Modul")}</span>
              ${renderVersionSummary(miniApp)}
            </div>
          </div>
          <div class="launcher-tile__copy">
            <strong>${escapeHtml(miniApp.name)}</strong>
            <span>${escapeHtml(miniApp.description || "Modul aplikacji SME")}</span>
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

function getUpdateSummary(updateGate = {}) {
  const localVersion = String(updateGate.localVersion || "").trim();
  const remoteVersion = String(updateGate.remoteVersion || "").trim();

  switch (updateGate.status) {
    case "up-to-date":
      return "Brak nowych aktualizacji";
    case "update-required":
      return remoteVersion
        ? `Dostepna aktualizacja do v${remoteVersion}`
        : "Dostepna aktualizacja aplikacji";
    case "integrity-mismatch":
      return "Wymagana ponowna instalacja aplikacji";
    case "verification-persist-failed":
      return "Nie udalo sie potwierdzic lokalnej wersji";
    case "server-unavailable":
      return "Nie udalo sie sprawdzic aktualizacji";
    case "offline-verified":
      return "Brak polaczenia, uzywam ostatniej potwierdzonej wersji";
    case "local-newer-than-remote":
      return remoteVersion
        ? `Lokalna wersja v${localVersion} jest nowsza niz serwer v${remoteVersion}`
        : `Lokalna wersja v${localVersion} jest nowsza od wydania`;
    case "development":
      return "Tryb developerski, aktualizacje sa wylaczone";
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
        ? `dostepna v${remoteVersion}`
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
        detail: payload.message || "Sprawdzanie integralnosci instalatora.",
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
        detail: payload.message || "Instalator zostanie uruchomiony za chwile.",
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
    setStatus(getUpdateSummary(updateGate) || "Sprawdzono stan aplikacji.");
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
  } finally {
    setAppUpdateButtonsDisabled(false);
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
  window.bridge.setWindowTitle("SME - Moduly");
  window.bridge.onUpdateStatus(handleUpdateStatusEvent);
  setStatus("Sprawdzanie aplikacji i synchronizacja modulow.");

  try {
    const result = await window.bridge.bootstrapShell();
    renderAppUpdate(result.updateGate || {});
    renderMiniApps(result);
    setStatus(buildLauncherStatus(result));
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
      setStatus(`Otwieranie modulu ${miniAppId}.`);
      await window.bridge.openMiniApp(miniAppId);
      return;
    }

    if (action === "install") {
      setStatus(`Instalowanie modulu ${miniAppId}.`);
      const result = await window.bridge.installMiniApp(miniAppId);
      renderMiniApps(result);
      setStatus(`Modul ${miniAppId} jest gotowy.`);
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

bootstrapLauncher();
