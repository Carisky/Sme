const bridge = window.bridge;
const MODULE_STORAGE_KEY = "rej-cont.settings";
const PAGE_SIZE = 500;
const FALLBACK_TERMINALS = ["BCT", "DCT", "GCT"];

const elements = {
  gridSummary: document.getElementById("grid-summary"),
  gridTitle: document.getElementById("grid-title"),
  recordsMeta: document.getElementById("records-meta"),
  statusText: document.getElementById("status-text"),
  tableBody: document.getElementById("table-body"),
  refreshButton: document.getElementById("refresh-button"),
  viewAll: document.getElementById("view-all"),
  viewObserved: document.getElementById("view-observed"),
  observedCount: document.getElementById("observed-count"),
  filterNumber: document.getElementById("filter-number"),
  filterStatus: document.getElementById("filter-status"),
  filterTerminal: document.getElementById("filter-terminal"),
  filterCreatedFrom: document.getElementById("filter-created-from"),
  filterCreatedTo: document.getElementById("filter-created-to"),
  filterRefreshFrom: document.getElementById("filter-refresh-from"),
  filterRefreshTo: document.getElementById("filter-refresh-to"),
  loadMoreButton: document.getElementById("load-more-button"),
  modalRoot: document.getElementById("modal-root"),
  modalTitle: document.getElementById("modal-title"),
  modeCreate: document.getElementById("mode-create"),
  modeImport: document.getElementById("mode-import"),
  createPanel: document.getElementById("create-panel"),
  importPanel: document.getElementById("import-panel"),
  modalStatus: document.getElementById("modal-status"),
  submitButton: document.getElementById("submit-button"),
  draftNumber: document.getElementById("draft-number"),
  draftMrn: document.getElementById("draft-mrn"),
  draftStop: document.getElementById("draft-stop"),
  draftStatus: document.getElementById("draft-status"),
  draftTerminal: document.getElementById("draft-terminal"),
};

const stateRef = {
  activeView: "all",
  observedIds: [],
  rows: [],
  totalCount: 0,
  nextOffset: 0,
  hasMore: false,
  isLoading: false,
  isRefreshing: false,
  isSubmitting: false,
  filters: createEmptyFilters(),
  statusOptions: [],
  terminalOptions: [...FALLBACK_TERMINALS],
  modalOpen: false,
  modalMode: "create",
  draft: createEmptyDraft(),
};

function asText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function asPositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 0;
  }

  return parsed;
}

function normalizeObservedIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.map((entry) => asPositiveInteger(entry)).filter(Boolean))
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatGridDate(value) {
  const rawValue = asText(value);
  if (!rawValue) {
    return "-";
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return rawValue;
  }

  return new Intl.DateTimeFormat("pl-PL", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function displayValue(value) {
  return asText(value) || "-";
}

function createEmptyFilters() {
  return {
    number: "",
    status: "",
    terminalName: "",
    createdAtFrom: "",
    createdAtTo: "",
    lastRefreshTimeFrom: "",
    lastRefreshTimeTo: "",
  };
}

function createEmptyDraft() {
  return {
    number: "",
    mrn: "",
    stop: "",
    status: "",
    terminalName: "",
  };
}

function setStatus(message) {
  elements.statusText.textContent = message;
}

function isObserved(containerId) {
  return stateRef.observedIds.includes(asPositiveInteger(containerId));
}

function getViewLabel() {
  return stateRef.activeView === "observed" ? "obserwowanych" : "rekordow";
}

function updateSelectOptions(select, values, options = {}) {
  const includeAny = options.includeAny !== false;
  const anyLabel = asText(options.anyLabel) || "Wszystkie";
  const selectedValue = asText(options.value);
  const normalizedValues = Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => asText(value))
        .filter(Boolean)
    )
  );

  if (selectedValue && !normalizedValues.includes(selectedValue)) {
    normalizedValues.push(selectedValue);
  }

  const optionsMarkup = [];
  if (includeAny) {
    optionsMarkup.push(`<option value="">${escapeHtml(anyLabel)}</option>`);
  }

  for (const value of normalizedValues) {
    optionsMarkup.push(
      `<option value="${escapeHtml(value)}"${value === selectedValue ? " selected" : ""}>${escapeHtml(value)}</option>`
    );
  }

  select.innerHTML = optionsMarkup.join("");
  select.value = selectedValue;
}

function writeFiltersToDom() {
  elements.filterNumber.value = asText(stateRef.filters.number);
  updateSelectOptions(elements.filterStatus, stateRef.statusOptions, {
    value: stateRef.filters.status,
    anyLabel: "Wszystkie statusy",
  });
  updateSelectOptions(elements.filterTerminal, stateRef.terminalOptions, {
    value: stateRef.filters.terminalName,
    anyLabel: "Wszystkie terminale",
  });
  elements.filterCreatedFrom.value = asText(stateRef.filters.createdAtFrom);
  elements.filterCreatedTo.value = asText(stateRef.filters.createdAtTo);
  elements.filterRefreshFrom.value = asText(stateRef.filters.lastRefreshTimeFrom);
  elements.filterRefreshTo.value = asText(stateRef.filters.lastRefreshTimeTo);
}

function readFiltersFromDom() {
  return {
    number: asText(elements.filterNumber.value),
    status: asText(elements.filterStatus.value),
    terminalName: asText(elements.filterTerminal.value),
    createdAtFrom: asText(elements.filterCreatedFrom.value),
    createdAtTo: asText(elements.filterCreatedTo.value),
    lastRefreshTimeFrom: asText(elements.filterRefreshFrom.value),
    lastRefreshTimeTo: asText(elements.filterRefreshTo.value),
  };
}

function writeDraftToDom() {
  elements.draftNumber.value = asText(stateRef.draft.number);
  elements.draftMrn.value = asText(stateRef.draft.mrn);
  elements.draftStop.value = asText(stateRef.draft.stop);
  elements.draftStatus.value = asText(stateRef.draft.status);
  updateSelectOptions(elements.draftTerminal, stateRef.terminalOptions, {
    value: stateRef.draft.terminalName,
    includeAny: true,
    anyLabel: "Nie wybrano",
  });
}

function readDraftFromDom() {
  return {
    number: asText(elements.draftNumber.value),
    mrn: asText(elements.draftMrn.value),
    stop: asText(elements.draftStop.value),
    status: asText(elements.draftStatus.value),
    terminalName: asText(elements.draftTerminal.value),
  };
}

function renderViewSwitch() {
  elements.viewAll.classList.toggle("is-active", stateRef.activeView === "all");
  elements.viewObserved.classList.toggle("is-active", stateRef.activeView === "observed");
  elements.observedCount.textContent = String(stateRef.observedIds.length);
  elements.gridTitle.textContent =
    stateRef.activeView === "observed" ? "Obserwowane kontenery" : "Container";
  if (stateRef.isRefreshing) {
    elements.refreshButton.textContent = "Aktualizuje...";
  } else {
    elements.refreshButton.textContent =
      stateRef.activeView === "observed" ? "Odswiez obserwowane" : "Odswiez";
  }
  elements.refreshButton.disabled = stateRef.isLoading || stateRef.isRefreshing;
}

function renderSummary() {
  const observedCount = stateRef.observedIds.length;

  if (stateRef.isLoading) {
    elements.gridSummary.textContent =
      stateRef.activeView === "observed"
        ? "Ladowanie obserwowanych kontenerow..."
        : "Ladowanie kontenerow z bazy...";
  } else if (stateRef.activeView === "observed" && observedCount === 0) {
    elements.gridSummary.textContent = "Nie masz jeszcze zadnych obserwowanych kontenerow.";
  } else if (!stateRef.rows.length) {
    elements.gridSummary.textContent =
      stateRef.activeView === "observed"
        ? "Brak obserwowanych kontenerow dla aktualnych filtrow."
        : "Brak rekordow dla aktualnych filtrow.";
  } else if (stateRef.activeView === "observed") {
    elements.gridSummary.textContent = `Obserwowane: ${stateRef.rows.length} z ${stateRef.totalCount}.`;
  } else {
    elements.gridSummary.textContent = `Pokazano ${stateRef.rows.length} z ${stateRef.totalCount} rekordow.`;
  }

  if (stateRef.totalCount > 0) {
    elements.recordsMeta.textContent = stateRef.hasMore
      ? `Widocznych ${stateRef.rows.length} / ${stateRef.totalCount} ${getViewLabel()}. Kolejna paczka zacznie sie od offset ${stateRef.nextOffset}.`
      : `Widocznych ${stateRef.rows.length} / ${stateRef.totalCount} ${getViewLabel()}.`;
  } else if (stateRef.activeView === "observed" && observedCount === 0) {
    elements.recordsMeta.textContent = "Przypnij kontener z glownej listy, zeby pojawil sie tutaj.";
  } else {
    elements.recordsMeta.textContent = "Brak danych.";
  }

  if (stateRef.isLoading || stateRef.isRefreshing) {
    elements.loadMoreButton.textContent = "Ladowanie...";
  } else if (stateRef.hasMore) {
    elements.loadMoreButton.textContent = "Dociagnij kolejne 500";
  } else if (stateRef.activeView === "observed" && observedCount === 0) {
    elements.loadMoreButton.textContent = "Brak obserwowanych";
  } else {
    elements.loadMoreButton.textContent = "Wczytano wszystko";
  }

  elements.loadMoreButton.disabled =
    stateRef.isLoading || stateRef.isRefreshing || !stateRef.hasMore;
}

function renderRows() {
  if (stateRef.isLoading && stateRef.rows.length === 0) {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="9">Trwa pobieranie pierwszej paczki 500 rekordow...</td>
      </tr>
    `;
    return;
  }

  if (stateRef.activeView === "observed" && stateRef.observedIds.length === 0) {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="9">Brak przypietych kontenerow. Uzyj przycisku "Przypnij" w glownej tabeli.</td>
      </tr>
    `;
    return;
  }

  if (stateRef.rows.length === 0) {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="9">Brak kontenerow dla wybranego zestawu filtrow.</td>
      </tr>
    `;
    return;
  }

  elements.tableBody.innerHTML = stateRef.rows
    .map((row) => {
      const observed = isObserved(row.id);
      const actionLabel = observed ? "Odepnij" : "Przypnij";

      return `
        <tr>
          <td>${escapeHtml(row.id)}</td>
          <td>${escapeHtml(row.number)}</td>
          <td>${escapeHtml(displayValue(row.mrn))}</td>
          <td>${escapeHtml(displayValue(row.stop))}</td>
          <td>${escapeHtml(formatGridDate(row.lastRefreshTime))}</td>
          <td><span class="cell-status">${escapeHtml(displayValue(row.status))}</span></td>
          <td><span class="cell-terminal">${escapeHtml(displayValue(row.terminalName))}</span></td>
          <td>${escapeHtml(formatGridDate(row.createdAt))}</td>
          <td class="cell-actions">
            <button
              type="button"
              class="pin-button${observed ? " is-active" : ""}"
              data-action="toggle-observed"
              data-container-id="${escapeHtml(row.id)}"
            >
              ${escapeHtml(actionLabel)}
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderModal() {
  const isImport = stateRef.modalMode === "import";
  elements.modalRoot.hidden = !stateRef.modalOpen;
  document.body.classList.toggle("modal-open", stateRef.modalOpen);

  elements.modeCreate.classList.toggle("is-active", !isImport);
  elements.modeImport.classList.toggle("is-active", isImport);
  elements.createPanel.hidden = isImport;
  elements.importPanel.hidden = !isImport;

  elements.modalTitle.textContent = isImport
    ? "Import kontenerow"
    : "Dodawanie kontenera";
  elements.modalStatus.textContent = stateRef.isSubmitting
    ? "Zapisywanie rekordu do bazy..."
    : isImport
      ? "Import ma juz wygodna rozpiske, ale logika jeszcze nie jest podpieta."
      : "Wypelnij numer kontenera. Reszta pol jest opcjonalna, a daty ustawia backend.";
  elements.submitButton.disabled = isImport || stateRef.isSubmitting;
  elements.submitButton.textContent = stateRef.isSubmitting
    ? "Zapisywanie..."
    : "Dodaj kontener";

  writeDraftToDom();
}

function renderAll() {
  writeFiltersToDom();
  renderViewSwitch();
  renderSummary();
  renderRows();
  renderModal();
}

async function persistSettings() {
  await bridge.saveModuleStorage(MODULE_STORAGE_KEY, {
    observedIds: [...stateRef.observedIds],
  });
}

async function loadSettings() {
  const settings = (await bridge.loadModuleStorage(MODULE_STORAGE_KEY)) || {};
  stateRef.observedIds = normalizeObservedIds(settings.observedIds);
}

function buildRequestFilters() {
  const filters = {
    ...stateRef.filters,
  };

  if (stateRef.activeView === "observed") {
    filters.containerIds = [...stateRef.observedIds];
  }

  return filters;
}

function applyEmptyListState() {
  stateRef.rows = [];
  stateRef.totalCount = 0;
  stateRef.nextOffset = null;
  stateRef.hasMore = false;
  stateRef.statusOptions = [];
  stateRef.terminalOptions = [...FALLBACK_TERMINALS];
}

async function loadContainers(options = {}) {
  const append = Boolean(options.append);
  if (stateRef.isLoading) {
    return null;
  }

  if (!append) {
    stateRef.filters = readFiltersFromDom();
  }

  if (stateRef.activeView === "observed" && stateRef.observedIds.length === 0) {
    applyEmptyListState();
    renderAll();
    setStatus("Brak obserwowanych kontenerow.");
    return null;
  }

  stateRef.isLoading = true;
  renderAll();

  try {
    const result = await bridge.listRejContContainers({
      limit: PAGE_SIZE,
      offset: append ? stateRef.nextOffset || stateRef.rows.length : 0,
      filters: buildRequestFilters(),
    });

    const nextItems = Array.isArray(result?.items) ? result.items : [];
    stateRef.rows = append ? [...stateRef.rows, ...nextItems] : nextItems;
    stateRef.totalCount = Number(result?.totalCount) || 0;
    stateRef.nextOffset = Number.isFinite(Number(result?.nextOffset))
      ? Number(result.nextOffset)
      : null;
    stateRef.hasMore = Boolean(result?.hasMore) && stateRef.nextOffset !== null;
    stateRef.statusOptions = Array.isArray(result?.statusOptions)
      ? result.statusOptions.map((value) => asText(value)).filter(Boolean)
      : [];
    stateRef.terminalOptions =
      Array.isArray(result?.terminalOptions) && result.terminalOptions.length > 0
        ? result.terminalOptions.map((value) => asText(value)).filter(Boolean)
        : [...FALLBACK_TERMINALS];

    setStatus(
      append
        ? `Dociagnieto ${nextItems.length} rekordow. Widocznych ${stateRef.rows.length} z ${stateRef.totalCount}.`
        : stateRef.activeView === "observed"
          ? `Wczytano ${stateRef.rows.length} z ${stateRef.totalCount} obserwowanych kontenerow.`
          : `Wczytano ${stateRef.rows.length} z ${stateRef.totalCount} rekordow.`
    );

    return result;
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
    return null;
  } finally {
    stateRef.isLoading = false;
    renderAll();
  }
}

function openModal(mode = "create") {
  stateRef.modalOpen = true;
  stateRef.modalMode = mode === "import" ? "import" : "create";
  stateRef.draft = createEmptyDraft();
  renderModal();
}

function closeModal() {
  if (stateRef.isSubmitting) {
    return;
  }

  stateRef.modalOpen = false;
  stateRef.modalMode = "create";
  stateRef.isSubmitting = false;
  renderModal();
}

function resetFilters() {
  stateRef.filters = createEmptyFilters();
  renderAll();
  return loadContainers();
}

async function submitCreate() {
  if (stateRef.modalMode !== "create" || stateRef.isSubmitting) {
    return null;
  }

  stateRef.draft = readDraftFromDom();
  stateRef.isSubmitting = true;
  renderModal();

  try {
    const result = await bridge.createRejContContainer(stateRef.draft);
    const createdNumber = result?.container?.number || stateRef.draft.number;
    stateRef.isSubmitting = false;
    stateRef.modalOpen = false;
    stateRef.modalMode = "create";
    stateRef.draft = createEmptyDraft();
    renderModal();
    await loadContainers();
    setStatus(`Dodano kontener ${createdNumber}.`);
    return result;
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
    return null;
  } finally {
    stateRef.isSubmitting = false;
    renderModal();
  }
}

async function updateCurrentContainers() {
  if (stateRef.isLoading || stateRef.isRefreshing) {
    return null;
  }

  const containerIds = stateRef.rows
    .map((row) => asPositiveInteger(row.id))
    .filter(Boolean);

  if (containerIds.length === 0) {
    setStatus("Brak kontenerow do aktualizacji.");
    return null;
  }

  stateRef.isRefreshing = true;
  renderViewSwitch();
  renderSummary();

  try {
    const result = await bridge.updateRejContContainers({
      containerIds,
    });
    await loadContainers();

    const errorSummary =
      Array.isArray(result?.errors) && result.errors.length > 0
        ? ` Bledy: ${result.errors.map((entry) => `${entry.terminalName}: ${entry.message}`).join(" | ")}`
        : "";

    setStatus(
      `Aktualizacja: odswiezono ${Number(result?.touchedCount) || 0}, z danymi ${Number(result?.updatedCount) || 0}, pominieto swieze ${Number(result?.skippedFreshCount) || 0}.${errorSummary}`
    );

    return result;
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
    return null;
  } finally {
    stateRef.isRefreshing = false;
    renderAll();
  }
}

async function toggleObserved(containerId) {
  const normalizedId = asPositiveInteger(containerId);
  if (!normalizedId) {
    return null;
  }

  const alreadyObserved = isObserved(normalizedId);
  stateRef.observedIds = alreadyObserved
    ? stateRef.observedIds.filter((entry) => entry !== normalizedId)
    : [...stateRef.observedIds, normalizedId].sort((left, right) => left - right);

  await persistSettings();

  if (stateRef.activeView === "observed") {
    await loadContainers();
  } else {
    renderViewSwitch();
    renderSummary();
    renderRows();
  }

  setStatus(
    alreadyObserved
      ? `Usunieto kontener ${normalizedId} z obserwowanych.`
      : `Dodano kontener ${normalizedId} do obserwowanych.`
  );

  return true;
}

async function switchView(nextView) {
  const normalizedView = nextView === "observed" ? "observed" : "all";
  if (stateRef.activeView === normalizedView) {
    return null;
  }

  stateRef.activeView = normalizedView;
  await loadContainers();
  return true;
}

async function handleAction(action, payload = {}) {
  switch (action) {
    case "home":
      return bridge.openHome();
    case "refresh":
      return updateCurrentContainers();
    case "apply-filters":
      return loadContainers();
    case "reset-filters":
      return resetFilters();
    case "load-more":
      return loadContainers({ append: true });
    case "switch-view-all":
      return switchView("all");
    case "switch-view-observed":
      return switchView("observed");
    case "toggle-observed":
      return toggleObserved(payload.containerId);
    case "open-modal":
      return openModal("create");
    case "close-modal":
      return closeModal();
    case "switch-create":
      stateRef.modalMode = "create";
      return renderModal();
    case "switch-import":
      stateRef.modalMode = "import";
      return renderModal();
    case "submit-container":
      return submitCreate();
    default:
      return null;
  }
}

document.addEventListener("click", async (event) => {
  const actionNode = event.target.closest("[data-action]");
  if (!actionNode) {
    return;
  }

  try {
    await handleAction(actionNode.dataset.action, {
      containerId: actionNode.dataset.containerId,
    });
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && stateRef.modalOpen) {
    closeModal();
  }
});

async function bootstrap() {
  bridge.setWindowTitle("REJ CONT");
  await loadSettings();
  renderAll();
  await loadContainers();
}

bootstrap().catch((error) => {
  console.error(error);
  window.alert(error.message);
  setStatus(error.message);
});
