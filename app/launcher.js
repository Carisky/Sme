const root = document.getElementById("launcher-root");
const tiles = document.getElementById("launcher-tiles");
const status = document.getElementById("launcher-status");
const appUpdatePanel = document.getElementById("launcher-update");
const appUpdateTitle = document.getElementById("launcher-update-title");
const appUpdateMessage = document.getElementById("launcher-update-message");
const appUpdateDetail = document.getElementById("launcher-update-detail");
const appUpdateVersions = document.getElementById("launcher-update-versions");
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
  const syncMessage = String(result.syncSummary?.message || "").trim();
  if (syncMessage) {
    return syncMessage;
  }

  const miniApps = Array.isArray(result.miniApps) ? result.miniApps : [];
  if (result.registryError) {
    return `Dostepne moduly: ${miniApps.length}. Rejestr GitHub chwilowo niedostepny.`;
  }

  return `Dostepne moduly: ${miniApps.length}.`;
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

function shouldShowAppUpdate(updateGate = {}) {
  return Boolean(
    updateGate.locked ||
      updateGate.allowInstall ||
      updateGate.allowRetry ||
      updateGate.status === "offline-verified" ||
      updateGate.status === "server-unavailable"
  );
}

function renderAppUpdate(updateGate = {}) {
  currentUpdateGate = updateGate;

  if (!shouldShowAppUpdate(updateGate)) {
    appUpdatePanel.hidden = true;
    appUpdateDetail.textContent = "";
    return;
  }

  const localVersion = String(updateGate.localVersion || "").trim();
  const remoteVersion = String(updateGate.remoteVersion || "").trim();
  const versions = [localVersion ? `lokalnie v${localVersion}` : "", remoteVersion ? `serwer v${remoteVersion}` : ""]
    .filter(Boolean)
    .join(" | ");

  appUpdatePanel.hidden = false;
  appUpdateTitle.textContent =
    updateGate.locked || updateGate.allowInstall ? "Wymagana uwaga dla aplikacji" : "Stan aplikacji";
  appUpdateMessage.textContent =
    updateGate.message || "Sprawdzanie stanu aktualizacji aplikacji.";
  appUpdateDetail.textContent = updateGate.detail || "";
  appUpdateVersions.textContent = versions || "Brak danych o wersji.";
  appUpdateInstall.hidden = !updateGate.allowInstall;
  appUpdateRetry.hidden = !updateGate.allowRetry;
  setAppUpdateButtonsDisabled(isAppUpdateBusy);
}

function handleUpdateStatusEvent(payload = {}) {
  if (appUpdatePanel.hidden) {
    appUpdatePanel.hidden = false;
  }

  switch (payload.phase) {
    case "checking":
      setAppUpdateButtonsDisabled(true);
      appUpdateTitle.textContent = "Sprawdzanie aktualizacji";
      appUpdateMessage.textContent = payload.message || "Sprawdzanie wersji aplikacji.";
      return;
    case "downloading":
      setAppUpdateButtonsDisabled(true);
      appUpdateTitle.textContent = "Pobieranie aktualizacji";
      appUpdateMessage.textContent = payload.message || "Trwa pobieranie instalatora.";
      return;
    case "verifying":
      setAppUpdateButtonsDisabled(true);
      appUpdateTitle.textContent = "Weryfikacja instalatora";
      appUpdateMessage.textContent = payload.message || "Sprawdzanie integralnosci instalatora.";
      return;
    case "launching":
      setAppUpdateButtonsDisabled(true);
      appUpdateTitle.textContent = "Uruchamianie instalatora";
      appUpdateMessage.textContent = payload.message || "Instalator zostanie uruchomiony za chwile.";
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
    setStatus(updateGate.message || "Sprawdzono stan aplikacji.");
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
