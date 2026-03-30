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
  settingsButton: document.getElementById("settings-button"),
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
  modeSettings: document.getElementById("mode-settings"),
  createPanel: document.getElementById("create-panel"),
  importPanel: document.getElementById("import-panel"),
  settingsPanel: document.getElementById("settings-panel"),
  modalStatus: document.getElementById("modal-status"),
  submitButton: document.getElementById("submit-button"),
  draftNumber: document.getElementById("draft-number"),
  draftMrn: document.getElementById("draft-mrn"),
  draftStop: document.getElementById("draft-stop"),
  draftStatus: document.getElementById("draft-status"),
  draftTerminal: document.getElementById("draft-terminal"),
  userFullName: document.getElementById("user-full-name"),
  userDepartment: document.getElementById("user-department"),
  importFileSummary: document.getElementById("import-file-summary"),
  importSheet: document.getElementById("import-sheet"),
  importColumn: document.getElementById("import-column"),
  importTerminalColumn: document.getElementById("import-terminal-column"),
  importPreview: document.getElementById("import-preview"),
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
  isInspectingImport: false,
  filters: createEmptyFilters(),
  statusOptions: [],
  terminalOptions: [...FALLBACK_TERMINALS],
  modalOpen: false,
  modalMode: "create",
  draft: createEmptyDraft(),
  userProfile: createEmptyUserProfile(),
  importState: createEmptyImportState(),
  importProgress: createEmptyImportProgress(),
};

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}
function basename(filePath) {
  const normalized = asText(filePath);
  if (!normalized) {
    return "";
  }
  const parts = normalized.split(/[\\/]+/);
  return parts[parts.length - 1] || normalized;
}
function asPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}
function normalizeObservedIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.map((entry) => asPositiveInteger(entry)).filter(Boolean)));
}
function normalizeUserProfile(value) {
  return { fullName: asText(value?.fullName), department: asText(value?.department) };
}
function hasCompleteUserProfile(profile = stateRef.userProfile) {
  return Boolean(asText(profile.fullName) && asText(profile.department));
}
function normalizeImportWorkbook(value = {}) {
  const sheets = Array.isArray(value?.sheets)
    ? value.sheets
        .map((sheet) => {
          const columns = Array.isArray(sheet?.columns)
            ? sheet.columns
                .map((column) => {
                  const index = Number(column?.index);
                  if (!Number.isInteger(index) || index < 0) {
                    return null;
                  }
                  return {
                    index,
                    letter: asText(column?.letter),
                    header: asText(column?.header),
                    label: asText(column?.label) || `Kolumna ${asText(column?.letter) || index + 1}`,
                    nonEmptyCount: Math.max(0, Number(column?.nonEmptyCount) || 0),
                    containerLikeCount: Math.max(0, Number(column?.containerLikeCount) || 0),
                    uniqueContainerCount: Math.max(0, Number(column?.uniqueContainerCount) || 0),
                    duplicateContainerCount: Math.max(0, Number(column?.duplicateContainerCount) || 0),
                    terminalLikeCount: Math.max(0, Number(column?.terminalLikeCount) || 0),
                    sampleValues: Array.isArray(column?.sampleValues)
                      ? column.sampleValues.map((entry) => asText(entry)).filter(Boolean)
                      : [],
                  };
                })
                .filter(Boolean)
            : [];
          if (columns.length === 0 || !asText(sheet?.name)) {
            return null;
          }
          const defaultColumnIndex = Number(sheet?.defaultColumnIndex);
          return {
            name: asText(sheet?.name),
            rowCount: Math.max(0, Number(sheet?.rowCount) || 0),
            columnCount: columns.length,
            defaultColumnIndex:
              Number.isInteger(defaultColumnIndex) && defaultColumnIndex >= 0
                ? defaultColumnIndex
                : columns[0].index,
            defaultTerminalColumnIndex:
              Number.isInteger(Number(sheet?.defaultTerminalColumnIndex)) &&
              Number(sheet?.defaultTerminalColumnIndex) >= 0
                ? Number(sheet?.defaultTerminalColumnIndex)
                : null,
            columns,
          };
        })
        .filter(Boolean)
    : [];
  return {
    filePath: asText(value?.filePath),
    fileName: asText(value?.fileName) || basename(value?.filePath),
    sheets,
    selectedSheetName: asText(value?.selectedSheetName),
    selectedColumnIndex: null,
    selectedTerminalColumnIndex: null,
  };
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
function formatAddedBy(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "-";
  }
  return (
    entries
      .map((entry) => {
        const fullName = asText(entry?.fullName);
        const department = asText(entry?.department);
        return fullName ? (department ? `${fullName} (${department})` : fullName) : "";
      })
      .filter(Boolean)
      .join(", ") || "-"
  );
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
  return { number: "", mrn: "", stop: "", status: "", terminalName: "" };
}
function createEmptyUserProfile() {
  return { fullName: "", department: "" };
}
function createEmptyImportState() {
  return {
    filePath: "",
    fileName: "",
    sheets: [],
    selectedSheetName: "",
    selectedColumnIndex: null,
    selectedTerminalColumnIndex: null,
  };
}
function createEmptyImportProgress() {
  return {
    active: false,
    progress: 0,
    processedCount: 0,
    totalCount: 0,
    chunkIndex: 0,
    chunkCount: 0,
    createdCount: 0,
    existingCount: 0,
    message: "",
  };
}
function setStatus(message) {
  elements.statusText.textContent = message;
}
function handleRejContStatus(payload = {}) {
  if (asText(payload?.action) !== "import") {
    return;
  }

  if (payload.type === "failed") {
    stateRef.importProgress = {
      ...createEmptyImportProgress(),
      active: false,
      message: asText(payload.message),
    };
    if (stateRef.importProgress.message) {
      setStatus(stateRef.importProgress.message);
    }
    if (stateRef.modalMode === "import" || stateRef.isSubmitting) {
      renderModal();
    }
    return;
  }

  stateRef.importProgress = {
    active: payload.type !== "completed",
    progress: Math.max(0, Number(payload.progress) || 0),
    processedCount: Math.max(0, Number(payload.processedCount) || 0),
    totalCount: Math.max(0, Number(payload.totalCount) || 0),
    chunkIndex: Math.max(0, Number(payload.chunkIndex) || 0),
    chunkCount: Math.max(0, Number(payload.chunkCount) || 0),
    createdCount: Math.max(0, Number(payload.createdCount) || 0),
    existingCount: Math.max(0, Number(payload.existingCount) || 0),
    message: asText(payload.message),
  };

  if (stateRef.importProgress.message) {
    setStatus(stateRef.importProgress.message);
  }

  if (stateRef.modalMode === "import" || stateRef.isSubmitting) {
    renderModal();
  }
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
    new Set((Array.isArray(values) ? values : []).map((value) => asText(value)).filter(Boolean))
  );
  if (selectedValue && !normalizedValues.includes(selectedValue)) {
    normalizedValues.push(selectedValue);
  }
  const optionsMarkup = [];
  if (includeAny) {
    optionsMarkup.push(`<option value="">${escapeHtml(anyLabel)}</option>`);
  }
  normalizedValues.forEach((value) => {
    optionsMarkup.push(
      `<option value="${escapeHtml(value)}"${value === selectedValue ? " selected" : ""}>${escapeHtml(value)}</option>`
    );
  });
  select.innerHTML = optionsMarkup.join("");
  select.value = selectedValue;
}
function updateMappedSelectOptions(select, items, options = {}) {
  const includePlaceholder = options.includePlaceholder !== false;
  const placeholderLabel = asText(options.placeholderLabel) || "Wybierz";
  const selectedValue = asText(options.value);
  const normalizedItems = Array.isArray(items)
    ? items
        .map((item) => ({ value: asText(item?.value), label: asText(item?.label) || asText(item?.value) }))
        .filter((item) => item.value)
    : [];
  if (selectedValue && !normalizedItems.some((item) => item.value === selectedValue)) {
    normalizedItems.push({ value: selectedValue, label: selectedValue });
  }
  const optionsMarkup = [];
  if (includePlaceholder) {
    optionsMarkup.push(`<option value="">${escapeHtml(placeholderLabel)}</option>`);
  }
  normalizedItems.forEach((item) => {
    optionsMarkup.push(
      `<option value="${escapeHtml(item.value)}"${item.value === selectedValue ? " selected" : ""}>${escapeHtml(item.label)}</option>`
    );
  });
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
function writeUserProfileToDom() {
  elements.userFullName.value = asText(stateRef.userProfile.fullName);
  elements.userDepartment.value = asText(stateRef.userProfile.department);
}
function readUserProfileFromDom() {
  return { fullName: asText(elements.userFullName.value), department: asText(elements.userDepartment.value) };
}
function getSelectedImportSheet() {
  const sheets = Array.isArray(stateRef.importState.sheets) ? stateRef.importState.sheets : [];
  return sheets.find((sheet) => sheet.name === stateRef.importState.selectedSheetName) || sheets[0] || null;
}
function getSelectedImportColumn() {
  const sheet = getSelectedImportSheet();
  if (!sheet) {
    return null;
  }
  return (
    sheet.columns.find((column) => column.index === stateRef.importState.selectedColumnIndex) ||
    sheet.columns.find((column) => column.index === sheet.defaultColumnIndex) ||
    sheet.columns[0] ||
    null
  );
}
function getSelectedImportTerminalColumn() {
  const sheet = getSelectedImportSheet();
  if (!sheet) {
    return null;
  }
  if (
    !Number.isInteger(stateRef.importState.selectedTerminalColumnIndex) ||
    stateRef.importState.selectedTerminalColumnIndex < 0
  ) {
    return null;
  }
  return (
    sheet.columns.find(
      (column) => column.index === stateRef.importState.selectedTerminalColumnIndex
    ) || null
  );
}
function ensureImportSelection() {
  const sheet = getSelectedImportSheet();
  if (!sheet) {
    stateRef.importState.selectedSheetName = "";
    stateRef.importState.selectedColumnIndex = null;
    stateRef.importState.selectedTerminalColumnIndex = null;
    return;
  }
  stateRef.importState.selectedSheetName = sheet.name;
  const column = getSelectedImportColumn();
  stateRef.importState.selectedColumnIndex = column ? column.index : null;
  const terminalColumn =
    sheet.columns.find(
      (entry) => entry.index === stateRef.importState.selectedTerminalColumnIndex
    ) ||
    sheet.columns.find((entry) => entry.index === sheet.defaultTerminalColumnIndex) ||
    null;
  stateRef.importState.selectedTerminalColumnIndex = terminalColumn
    ? terminalColumn.index
    : null;
}
function renderImportPreview() {
  ensureImportSelection();
  const sheet = getSelectedImportSheet();
  const column = getSelectedImportColumn();
  const terminalColumn = getSelectedImportTerminalColumn();
  if (!stateRef.importState.filePath) {
    elements.importFileSummary.textContent =
      "Wybierz plik Excel, a aplikacja odczyta arkusze i kolumny do mapowania.";
    elements.importPreview.innerHTML =
      "<li>Po wyborze pliku tutaj pojawi sie podsumowanie importu.</li>";
    updateMappedSelectOptions(elements.importSheet, [], {
      value: "",
      placeholderLabel: "Najpierw wybierz plik",
    });
    updateMappedSelectOptions(elements.importColumn, [], {
      value: "",
      placeholderLabel: "Najpierw wybierz arkusz",
    });
    updateMappedSelectOptions(elements.importTerminalColumn, [], {
      value: "",
      placeholderLabel: "Nie importuj terminala",
    });
    return;
  }
  elements.importFileSummary.textContent = `Plik: ${stateRef.importState.fileName || basename(stateRef.importState.filePath)}.`;
  updateMappedSelectOptions(
    elements.importSheet,
    stateRef.importState.sheets.map((entry) => ({
      value: entry.name,
      label: `${entry.name} (${entry.rowCount} wierszy)`,
    })),
    { value: stateRef.importState.selectedSheetName, placeholderLabel: "Wybierz arkusz" }
  );
  updateMappedSelectOptions(
    elements.importColumn,
    sheet
      ? sheet.columns.map((entry) => ({
          value: String(entry.index),
          label: `${entry.label} | unikalne: ${entry.uniqueContainerCount}`,
        }))
      : [],
    {
      value: stateRef.importState.selectedColumnIndex === null ? "" : String(stateRef.importState.selectedColumnIndex),
      placeholderLabel: "Wybierz kolumne",
    }
  );
  updateMappedSelectOptions(
    elements.importTerminalColumn,
    sheet
      ? sheet.columns.map((entry) => ({
          value: String(entry.index),
          label: `${entry.label} | terminale: ${entry.terminalLikeCount || 0}`,
        }))
      : [],
    {
      value:
        stateRef.importState.selectedTerminalColumnIndex === null
          ? ""
          : String(stateRef.importState.selectedTerminalColumnIndex),
      placeholderLabel: "Nie importuj terminala",
    }
  );
  if (!sheet || !column) {
    elements.importPreview.innerHTML =
      "<li>Wybierz arkusz i kolumne z numerami kontenerow.</li>";
    return;
  }
  const previewLines = [
    `Arkusz: ${sheet.name}. Wiersze: ${sheet.rowCount}.`,
    `Kolumna: ${column.label}. Niepuste wartosci: ${column.nonEmptyCount}.`,
    `Wykryte numery kontenerow: ${column.uniqueContainerCount}. Duplikaty w kolumnie: ${column.duplicateContainerCount}.`,
    terminalColumn
      ? `Terminal: ${terminalColumn.label}. Rozpoznawalne wartosci terminala: ${terminalColumn.terminalLikeCount || 0}.`
      : "Terminal: nie bedzie importowany z Excela.",
    `Przyklady: ${column.sampleValues.length > 0 ? column.sampleValues.join(", ") : "brak podgladu"}.`,
    stateRef.importProgress.active
      ? `Postep importu: ${stateRef.importProgress.processedCount}/${stateRef.importProgress.totalCount}, chunk ${stateRef.importProgress.chunkIndex}/${stateRef.importProgress.chunkCount}.`
      : "Import bedzie wysylany partiami po 25 kontenerow.",
    hasCompleteUserProfile()
      ? `Autor importu: ${stateRef.userProfile.fullName} (${stateRef.userProfile.department}).`
      : "Przed importem uzupelnij Dane uzytkownika.",
  ];
  elements.importPreview.innerHTML = previewLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
}
function renderViewSwitch() {
  elements.viewAll.classList.toggle("is-active", stateRef.activeView === "all");
  elements.viewObserved.classList.toggle("is-active", stateRef.activeView === "observed");
  elements.observedCount.textContent = String(stateRef.observedIds.length);
  elements.gridTitle.textContent =
    stateRef.activeView === "observed" ? "Obserwowane kontenery" : "Kontenery";
  elements.refreshButton.textContent = stateRef.isRefreshing
    ? "Aktualizuje..."
    : stateRef.activeView === "observed"
      ? "Odswiez obserwowane"
      : "Odswiez";
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
  elements.loadMoreButton.textContent =
    stateRef.isLoading || stateRef.isRefreshing
      ? "Ladowanie..."
      : stateRef.hasMore
        ? "Dociagnij kolejne 500"
        : stateRef.activeView === "observed" && observedCount === 0
          ? "Brak obserwowanych"
          : "Wczytano wszystko";
  elements.loadMoreButton.disabled =
    stateRef.isLoading || stateRef.isRefreshing || !stateRef.hasMore;
}
function renderRows() {
  if (stateRef.isLoading && stateRef.rows.length === 0) {
    elements.tableBody.innerHTML =
      '<tr><td colspan="10">Trwa pobieranie pierwszej paczki 500 rekordow...</td></tr>';
    return;
  }
  if (stateRef.activeView === "observed" && stateRef.observedIds.length === 0) {
    elements.tableBody.innerHTML =
      '<tr><td colspan="10">Brak przypietych kontenerow. Uzyj przycisku "Przypnij" w glownej tabeli.</td></tr>';
    return;
  }
  if (stateRef.rows.length === 0) {
    elements.tableBody.innerHTML =
      '<tr><td colspan="10">Brak kontenerow dla wybranego zestawu filtrow.</td></tr>';
    return;
  }
  elements.tableBody.innerHTML = stateRef.rows
    .map((row) => {
      const observed = isObserved(row.id);
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
          <td class="cell-added-by">${escapeHtml(formatAddedBy(row.addedBy))}</td>
          <td class="cell-actions">
            <button
              type="button"
              class="pin-button${observed ? " is-active" : ""}"
              data-action="toggle-observed"
              data-container-id="${escapeHtml(row.id)}"
            >
              ${escapeHtml(observed ? "Odepnij" : "Przypnij")}
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}
function getModalStatusText() {
  if (stateRef.isSubmitting) {
    if (stateRef.modalMode === "import") {
      return "Importowanie kontenerow do bazy...";
    }
    if (stateRef.modalMode === "settings") {
      return "Zapisywanie danych uzytkownika...";
    }
    return "Zapisywanie rekordu do bazy...";
  }
  if (stateRef.isInspectingImport) {
    return "Czytam wybrany plik Excel i wykrywam kolumny...";
  }
  if (stateRef.importProgress.active && stateRef.importProgress.message) {
    return stateRef.importProgress.message;
  }
  if (stateRef.modalMode === "settings") {
    return "Te dane beda zapisywane przy recznym dodaniu i imporcie kontenerow.";
  }
  if (stateRef.modalMode === "import") {
    const sheet = getSelectedImportSheet();
    const column = getSelectedImportColumn();
    if (!stateRef.importState.filePath) {
      return "Wybierz plik Excel, a potem kolumne z numerami kontenerow.";
    }
    if (!sheet || !column) {
      return "Wybierz arkusz i kolumne z numerami kontenerow.";
    }
    if (!hasCompleteUserProfile()) {
      return "Przed importem uzupelnij Dane uzytkownika.";
    }
    return `Gotowe do importu z arkusza ${sheet.name}, kolumna ${column.letter}. Wykryto ${column.uniqueContainerCount} unikalnych numerow.`;
  }
  return hasCompleteUserProfile()
    ? "Wypelnij numer kontenera. Reszta pol jest opcjonalna, a daty ustawia backend."
    : "Przed zapisaniem kontenera uzupelnij Dane uzytkownika.";
}
function renderModal() {
  const isCreate = stateRef.modalMode === "create";
  const isImport = stateRef.modalMode === "import";
  const isSettings = stateRef.modalMode === "settings";
  elements.modalRoot.hidden = !stateRef.modalOpen;
  document.body.classList.toggle("modal-open", stateRef.modalOpen);
  elements.modeCreate.classList.toggle("is-active", isCreate);
  elements.modeImport.classList.toggle("is-active", isImport);
  elements.modeSettings.classList.toggle("is-active", isSettings);
  elements.createPanel.hidden = !isCreate;
  elements.importPanel.hidden = !isImport;
  elements.settingsPanel.hidden = !isSettings;
  elements.modalTitle.textContent = isImport
    ? "Import kontenerow"
    : isSettings
      ? "Dane użytkownika"
      : "Dodawanie kontenera";
  elements.modalStatus.textContent = getModalStatusText();
  if (isImport) {
    elements.submitButton.disabled =
      stateRef.isSubmitting ||
      stateRef.isInspectingImport ||
      !stateRef.importState.filePath ||
      getSelectedImportColumn() === null;
    elements.submitButton.textContent = stateRef.isSubmitting
      ? "Importowanie..."
      : "Importuj kontenery";
  } else if (isSettings) {
    elements.submitButton.disabled = stateRef.isSubmitting;
    elements.submitButton.textContent = stateRef.isSubmitting
      ? "Zapisywanie..."
      : "Zapisz dane";
  } else {
    elements.submitButton.disabled = stateRef.isSubmitting;
    elements.submitButton.textContent = stateRef.isSubmitting
      ? "Zapisywanie..."
      : "Dodaj kontener";
  }
  writeDraftToDom();
  writeUserProfileToDom();
  renderImportPreview();
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
    userProfile: {
      fullName: asText(stateRef.userProfile.fullName),
      department: asText(stateRef.userProfile.department),
    },
  });
}
async function loadSettings() {
  const settings = (await bridge.loadModuleStorage(MODULE_STORAGE_KEY)) || {};
  stateRef.observedIds = normalizeObservedIds(settings.observedIds);
  stateRef.userProfile = normalizeUserProfile(settings.userProfile);
}
function buildRequestFilters() {
  const filters = { ...stateRef.filters };
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
function openUserSettingsWithMessage(message) {
  stateRef.modalOpen = true;
  stateRef.modalMode = "settings";
  renderModal();
  window.alert(message);
  setStatus(message);
}
function requireUserProfile() {
  if (hasCompleteUserProfile()) {
    return true;
  }
  openUserSettingsWithMessage(
    "Najpierw uzupelnij Dane uzytkownika: imie i nazwisko oraz dzial."
  );
  return false;
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
  stateRef.modalMode = mode === "import" || mode === "settings" ? mode : "create";
  if (stateRef.modalMode === "create") {
    stateRef.draft = createEmptyDraft();
  }
  renderModal();
}
function closeModal() {
  if (stateRef.isSubmitting || stateRef.isInspectingImport) {
    return;
  }
  stateRef.modalOpen = false;
  stateRef.modalMode = "create";
  renderModal();
}
function resetFilters() {
  stateRef.filters = createEmptyFilters();
  renderAll();
  return loadContainers();
}
async function saveUserProfile() {
  if (stateRef.isSubmitting) {
    return null;
  }
  stateRef.userProfile = readUserProfileFromDom();
  if (!hasCompleteUserProfile()) {
    window.alert("Uzupelnij oba pola: imie i nazwisko oraz dzial.");
    setStatus("Nie zapisano danych uzytkownika.");
    return null;
  }
  stateRef.isSubmitting = true;
  renderModal();
  try {
    await persistSettings();
    stateRef.modalOpen = false;
    stateRef.modalMode = "create";
    setStatus(
      `Zapisano dane uzytkownika ${stateRef.userProfile.fullName} (${stateRef.userProfile.department}).`
    );
    return true;
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
async function submitCreate() {
  if (stateRef.modalMode !== "create" || stateRef.isSubmitting) {
    return null;
  }
  stateRef.draft = readDraftFromDom();
  if (!requireUserProfile()) {
    return null;
  }
  stateRef.importProgress = createEmptyImportProgress();
  stateRef.isSubmitting = true;
  renderModal();
  try {
    const result = await bridge.createRejContContainer({
      ...stateRef.draft,
      userProfile: stateRef.userProfile,
    });
    const createdNumber = result?.container?.number || stateRef.draft.number;
    stateRef.modalOpen = false;
    stateRef.modalMode = "create";
    stateRef.draft = createEmptyDraft();
    await loadContainers();
    setStatus(
      result?.created
        ? `Dodano kontener ${createdNumber}.`
        : `Kontener ${createdNumber} juz byl w bazie. Dopisano autora dodania.`
    );
    return result;
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
    return null;
  } finally {
    if (!stateRef.importProgress.active) {
      stateRef.importProgress = createEmptyImportProgress();
    }
    stateRef.isSubmitting = false;
    renderModal();
  }
}
async function chooseImportFile() {
  if (stateRef.isInspectingImport || stateRef.isSubmitting) {
    return null;
  }
  stateRef.isInspectingImport = true;
  renderModal();
  try {
    const result = await bridge.inspectRejContImportWorkbook();
    if (result?.canceled) {
      setStatus("Anulowano wybor pliku importu.");
      return null;
    }
    stateRef.importProgress = createEmptyImportProgress();
    stateRef.importState = normalizeImportWorkbook(result?.workbook || result);
    ensureImportSelection();
    stateRef.modalOpen = true;
    stateRef.modalMode = "import";
    renderModal();
    setStatus(
      `Wybrano plik ${stateRef.importState.fileName || basename(stateRef.importState.filePath)}.`
    );
    return result;
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
    return null;
  } finally {
    stateRef.isInspectingImport = false;
    renderModal();
  }
}
async function submitImport() {
  if (stateRef.modalMode !== "import" || stateRef.isSubmitting) {
    return null;
  }
  ensureImportSelection();
  const sheet = getSelectedImportSheet();
  const column = getSelectedImportColumn();
  const terminalColumn = getSelectedImportTerminalColumn();
  if (!sheet || !column || !stateRef.importState.filePath) {
    window.alert("Najpierw wybierz plik, arkusz i kolumne z numerami kontenerow.");
    setStatus("Brak kompletnej konfiguracji importu.");
    return null;
  }
  if (!requireUserProfile()) {
    return null;
  }
  stateRef.isSubmitting = true;
  renderModal();
  try {
    const result = await bridge.importRejContContainersFromWorkbook({
      filePath: stateRef.importState.filePath,
      sheetName: sheet.name,
      columnIndex: column.index,
      terminalColumnIndex: terminalColumn ? terminalColumn.index : null,
      userProfile: stateRef.userProfile,
    });
    stateRef.modalOpen = false;
    stateRef.modalMode = "create";
    await loadContainers();
    setStatus(
      (Number(result?.importedCount) || 0) === 0
        ? `Nie znaleziono poprawnych numerow kontenerow w kolumnie ${result?.columnLetter || column.letter}.`
        : `Import ${result?.fileName || stateRef.importState.fileName}: zapisano ${Number(result?.importedCount) || 0} numerow. Nowe: ${Number(result?.createdCount) || 0}, istniejace: ${Number(result?.existingCount) || 0}, terminal rozpoznano dla ${Number(result?.terminalResolvedCount) || 0}.`
    );
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
    const result = await bridge.updateRejContContainers({ containerIds });
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
    case "open-settings":
      return openModal("settings");
    case "close-modal":
      return closeModal();
    case "switch-create":
      stateRef.modalMode = "create";
      return renderModal();
    case "switch-import":
      stateRef.modalMode = "import";
      return renderModal();
    case "switch-settings":
      stateRef.modalMode = "settings";
      return renderModal();
    case "choose-import-file":
      return chooseImportFile();
    case "submit-container":
      if (stateRef.modalMode === "settings") {
        return saveUserProfile();
      }
      if (stateRef.modalMode === "import") {
        return submitImport();
      }
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

document.addEventListener("input", (event) => {
  if (
    event.target === elements.draftNumber ||
    event.target === elements.draftMrn ||
    event.target === elements.draftStop ||
    event.target === elements.draftStatus
  ) {
    stateRef.draft = readDraftFromDom();
    return;
  }
  if (event.target === elements.userFullName || event.target === elements.userDepartment) {
    stateRef.userProfile = readUserProfileFromDom();
  }
});

document.addEventListener("change", (event) => {
  if (event.target === elements.draftTerminal) {
    stateRef.draft = readDraftFromDom();
    return;
  }
  if (event.target === elements.importSheet) {
    stateRef.importState.selectedSheetName = asText(elements.importSheet.value);
    stateRef.importState.selectedColumnIndex = null;
    stateRef.importState.selectedTerminalColumnIndex = null;
    renderModal();
    return;
  }
  if (event.target === elements.importColumn) {
    const selectedRawValue = asText(elements.importColumn.value);
    const selectedIndex = selectedRawValue ? Number(selectedRawValue) : null;
    stateRef.importState.selectedColumnIndex =
      Number.isInteger(selectedIndex) && selectedIndex >= 0 ? selectedIndex : null;
    renderModal();
    return;
  }
  if (event.target === elements.importTerminalColumn) {
    const selectedRawValue = asText(elements.importTerminalColumn.value);
    const selectedIndex = selectedRawValue ? Number(selectedRawValue) : null;
    stateRef.importState.selectedTerminalColumnIndex =
      Number.isInteger(selectedIndex) && selectedIndex >= 0 ? selectedIndex : null;
    renderModal();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && stateRef.modalOpen) {
    closeModal();
  }
});

async function bootstrap() {
  bridge.setWindowTitle("REJ CONT");
  if (typeof bridge.onRejContStatus === "function") {
    bridge.onRejContStatus(handleRejContStatus);
  }
  await loadSettings();
  renderAll();
  await loadContainers();
}

bootstrap().catch((error) => {
  console.error(error);
  window.alert(error.message);
  setStatus(error.message);
});
