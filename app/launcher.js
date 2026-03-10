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

function renderMiniApps(result = {}) {
  const miniApps = Array.isArray(result.miniApps) ? result.miniApps : [];
  const registryError = String(result.registryError || "").trim();

  if (!miniApps.length) {
    tiles.innerHTML = `
      <article class="launcher-empty">
        <h2>Brak dostepnych modulow</h2>
        <p>Dodaj modul do <code>mini_apps/</code> lub do rejestru GitHub.</p>
      </article>
    `;
    setStatus("Nie znaleziono zadnych modulow.");
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

  setStatus(
    registryError
      ? `Dostepne moduly: ${miniApps.length}. Rejestr GitHub chwilowo niedostepny.`
      : `Dostepne moduly: ${miniApps.length}.`
  );
}

function setButtonsDisabled(value) {
  document.querySelectorAll("[data-mini-app-action]").forEach((node) => {
    node.disabled = value;
  });
}

async function bootstrapLauncher() {
  window.bridge.setWindowTitle("SME - Moduly");
  setStatus("Wczytywanie katalogu modulow.");

  try {
    const result = await window.bridge.bootstrapShell();
    renderMiniApps(result);
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
  const actionButton = event.target.closest("[data-mini-app-action]");
  if (!actionButton) {
    return;
  }

  const miniAppId = actionButton.dataset.miniAppId;
  const action = actionButton.dataset.miniAppAction;
  if (!miniAppId || !action) {
    return;
  }

  setButtonsDisabled(true);

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
    setButtonsDisabled(false);
  }
});

bootstrapLauncher();
