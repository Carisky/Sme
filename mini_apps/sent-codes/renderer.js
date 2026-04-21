const bridge = window.bridge;
const PAGE_SIZE = 200;

const elements = {
  subtitle: document.getElementById("subtitle"),
  refreshButton: document.getElementById("refresh-button"),
  totalCount: document.getElementById("total-count"),
  syncStateLabel: document.getElementById("sync-state-label"),
  syncTime: document.getElementById("sync-time"),
  syncProgressLabel: document.getElementById("sync-progress-label"),
  syncProgressCopy: document.getElementById("sync-progress-copy"),
  recordsMeta: document.getElementById("records-meta"),
  tableBody: document.getElementById("table-body"),
  pagePrevButton: document.getElementById("page-prev-button"),
  pageNextButton: document.getElementById("page-next-button"),
  paginationPages: document.getElementById("pagination-pages"),

  checkChooseFileButton: document.getElementById("check-choose-file-button"),
  checkFileSummary: document.getElementById("check-file-summary"),
  checkSheetSelect: document.getElementById("check-sheet-select"),
  checkColumnSelect: document.getElementById("check-column-select"),
  checkImportButton: document.getElementById("check-import-button"),
  checkTotalCount: document.getElementById("check-total-count"),
  checkMatchedCount: document.getElementById("check-matched-count"),
  checkMissingCount: document.getElementById("check-missing-count"),
  checkRecordsMeta: document.getElementById("check-records-meta"),
  checkTableBody: document.getElementById("check-table-body"),
  checkPagePrevButton: document.getElementById("check-page-prev-button"),
  checkPageNextButton: document.getElementById("check-page-next-button"),
  checkPaginationPages: document.getElementById("check-pagination-pages"),

  statusText: document.getElementById("status-text"),
};

const stateRef = {
  activeTab: "codes",
  isRefreshingRegistry: false,
  syncState: {
    status: "idle",
    startedAt: "",
    finishedAt: "",
    progress: 0,
    fetchedCount: 0,
    savedCount: 0,
    error: "",
    page: 0,
    trigger: "",
  },
  codes: {
    rows: [],
    totalCount: 0,
    currentPage: 1,
    isLoading: false,
  },
  check: {
    workbook: null,
    selectedSheetName: "",
    selectedColumnIndex: null,
    rows: [],
    totalCount: 0,
    matchedCount: 0,
    missingCount: 0,
    currentPage: 1,
    isLoading: false,
    isImporting: false,
    importMeta: null,
  },
};

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asPositiveInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePageNumber(value) {
  return asPositiveInteger(value, 1);
}

function setStatus(message) {
  elements.statusText.textContent = asText(message) || "Gotowe.";
}

function formatDateTime(value) {
  const normalizedValue = asText(value);
  if (!normalizedValue) {
    return "";
  }

  const parsed = new Date(normalizedValue);
  if (Number.isNaN(parsed.getTime())) {
    return normalizedValue;
  }

  return new Intl.DateTimeFormat("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(parsed);
}

function getTotalPages(totalCount) {
  return Math.max(1, Math.ceil(Math.max(0, Number(totalCount) || 0) / PAGE_SIZE));
}

function getVisibleRange(currentPage, rowsLength, totalCount) {
  if (totalCount === 0 || rowsLength === 0) {
    return { start: 0, end: 0 };
  }

  const start = (normalizePageNumber(currentPage) - 1) * PAGE_SIZE + 1;
  return {
    start,
    end: Math.min(totalCount, start + rowsLength - 1),
  };
}

function buildPaginationModel(totalPages, currentPage) {
  if (totalPages <= 1) {
    return totalPages === 1 ? [1] : [];
  }

  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }

  const orderedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
  const items = [];
  let previousPage = 0;

  orderedPages.forEach((page) => {
    if (previousPage > 0 && page - previousPage > 1) {
      items.push("ellipsis");
    }
    items.push(page);
    previousPage = page;
  });

  return items;
}

function renderTabs() {
  document.querySelectorAll("[data-tab-button]").forEach((buttonNode) => {
    buttonNode.classList.toggle("is-active", buttonNode.dataset.tabButton === stateRef.activeTab);
  });
  document.querySelectorAll("[data-tab-panel]").forEach((panelNode) => {
    panelNode.classList.toggle("is-active", panelNode.dataset.tabPanel === stateRef.activeTab);
  });
}

function renderSyncState() {
  const syncState = stateRef.syncState || {};
  const status = asText(syncState.status) || "idle";
  const progress = Math.max(0, Math.min(Number(syncState.progress) || 0, 100));
  const startedAt = formatDateTime(syncState.startedAt);
  const finishedAt = formatDateTime(syncState.finishedAt);
  const trigger = asText(syncState.trigger);

  elements.totalCount.textContent = `${stateRef.codes.totalCount}`;
  elements.syncStateLabel.textContent = status;
  elements.syncProgressLabel.textContent = `${progress}%`;

  if (status === "running") {
    elements.syncTime.textContent = startedAt
      ? `Start: ${startedAt}`
      : "Trwa odswiezanie rejestru";
    elements.syncProgressCopy.textContent = `Wczytano ${Number(syncState.fetchedCount) || 0} kodow z data-set.json.`;
    return;
  }

  if (status === "success") {
    elements.syncTime.textContent = finishedAt
      ? `Koniec: ${finishedAt}`
      : "Odswiezenie zakonczone";
    elements.syncProgressCopy.textContent = `Zapisano ${Number(syncState.savedCount) || 0} kodow${trigger ? ` (${trigger})` : ""}.`;
    return;
  }

  if (status === "failed") {
    elements.syncTime.textContent = finishedAt
      ? `Blad: ${finishedAt}`
      : "Odswiezenie nieudane";
    elements.syncProgressCopy.textContent =
      asText(syncState.error) || "Odswiezenie nieudane.";
    return;
  }

  elements.syncTime.textContent = "Brak historii";
  elements.syncProgressCopy.textContent = "Oczekiwanie na odswiezenie";
}

function renderCodesRows() {
  if (stateRef.codes.rows.length === 0) {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="2">Brak kodow w lokalnej bazie.</td>
      </tr>
    `;
    return;
  }

  const offset = (normalizePageNumber(stateRef.codes.currentPage) - 1) * PAGE_SIZE;
  elements.tableBody.innerHTML = stateRef.codes.rows
    .map((row, index) => {
      const ordinal = offset + index + 1;
      return `
        <tr>
          <td>${ordinal}</td>
          <td>${asText(row.code)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderCodesPagination() {
  const totalPages = getTotalPages(stateRef.codes.totalCount);
  const currentPage = normalizePageNumber(stateRef.codes.currentPage);
  const visibleRange = getVisibleRange(
    currentPage,
    stateRef.codes.rows.length,
    stateRef.codes.totalCount
  );
  const isEmpty = stateRef.codes.totalCount === 0;
  const isBusy = stateRef.codes.isLoading || stateRef.isRefreshingRegistry;

  elements.recordsMeta.textContent = isEmpty
    ? "Brak rekordow"
    : `Widoczne ${visibleRange.start}-${visibleRange.end} z ${stateRef.codes.totalCount}`;

  elements.pagePrevButton.disabled = isBusy || currentPage <= 1 || isEmpty;
  elements.pageNextButton.disabled = isBusy || currentPage >= totalPages || isEmpty;

  const model = buildPaginationModel(totalPages, currentPage);
  elements.paginationPages.innerHTML = model
    .map((item) => {
      if (item === "ellipsis") {
        return `<span class="pagination__ellipsis">...</span>`;
      }

      return `
        <button
          type="button"
          class="pagination__button ${item === currentPage ? "is-active" : ""}"
          data-action="codes-page-go"
          data-page="${item}"
          ${isBusy || item === currentPage ? "disabled" : ""}
        >
          ${item}
        </button>
      `;
    })
    .join("");
}

function getCurrentCheckSheet() {
  const workbook = stateRef.check.workbook;
  if (!workbook || !Array.isArray(workbook.sheets) || workbook.sheets.length === 0) {
    return null;
  }

  return (
    workbook.sheets.find((sheet) => sheet.name === stateRef.check.selectedSheetName) ||
    workbook.sheets[0]
  );
}

function renderCheckControls() {
  const workbook = stateRef.check.workbook;
  const hasWorkbook = Boolean(workbook && Array.isArray(workbook.sheets) && workbook.sheets.length > 0);
  const currentSheet = getCurrentCheckSheet();
  const isBusy = stateRef.check.isImporting;

  if (!hasWorkbook) {
    elements.checkFileSummary.textContent = "Wybierz plik, potem arkusz i kolumne z kodami HS.";
    elements.checkSheetSelect.innerHTML = `<option value="">Najpierw wybierz plik</option>`;
    elements.checkColumnSelect.innerHTML = `<option value="">Najpierw wybierz plik</option>`;
    elements.checkSheetSelect.disabled = true;
    elements.checkColumnSelect.disabled = true;
    elements.checkImportButton.disabled = true;
    return;
  }

  const importMeta = stateRef.check.importMeta;
  const importedInfo = importMeta?.importedAt
    ? ` | Ostatni import: ${formatDateTime(importMeta.importedAt)}`
    : "";
  elements.checkFileSummary.textContent = `${asText(workbook.fileName)}${importedInfo}`;

  elements.checkSheetSelect.innerHTML = workbook.sheets
    .map(
      (sheet) =>
        `<option value="${sheet.name}" ${sheet.name === currentSheet?.name ? "selected" : ""}>${sheet.name}</option>`
    )
    .join("");
  elements.checkSheetSelect.disabled = isBusy;

  const columns = Array.isArray(currentSheet?.columns) ? currentSheet.columns : [];
  const selectedColumnIndex =
    Number.isInteger(Number(stateRef.check.selectedColumnIndex))
      ? Number(stateRef.check.selectedColumnIndex)
      : Number(currentSheet?.defaultColumnIndex) || 0;

  elements.checkColumnSelect.innerHTML = columns
    .map((column) => {
      const suffix =
        Number(column.codeLikeCount) > 0
          ? ` | code-like: ${column.codeLikeCount}`
          : ` | non-empty: ${column.nonEmptyCount}`;
      return `
        <option
          value="${column.index}"
          ${Number(column.index) === selectedColumnIndex ? "selected" : ""}
        >
          ${column.label}${suffix}
        </option>
      `;
    })
    .join("");
  elements.checkColumnSelect.disabled = isBusy || columns.length === 0;
  elements.checkImportButton.disabled = isBusy || columns.length === 0;
}

function renderCheckStats() {
  elements.checkTotalCount.textContent = `${stateRef.check.totalCount}`;
  elements.checkMatchedCount.textContent = `${stateRef.check.matchedCount}`;
  elements.checkMissingCount.textContent = `${stateRef.check.missingCount}`;
}

function renderCheckRows() {
  if (stateRef.check.rows.length === 0) {
    elements.checkTableBody.innerHTML = `
      <tr>
        <td colspan="4">Brak danych po imporcie.</td>
      </tr>
    `;
    return;
  }

  const offset = (normalizePageNumber(stateRef.check.currentPage) - 1) * PAGE_SIZE;
  elements.checkTableBody.innerHTML = stateRef.check.rows
    .map((row, index) => {
      const ordinal = offset + index + 1;
      const existsInRegistry = Boolean(row.existsInRegistry ?? row.existsInApi);
      return `
        <tr class="${existsInRegistry ? "check-row--match" : "check-row--missing"}">
          <td>${ordinal}</td>
          <td>${asText(row.code)}</td>
          <td>${Math.max(0, Number(row.occurrenceCount) || 0)}</td>
          <td>
            <span class="check-status ${existsInRegistry ? "check-status--match" : "check-status--missing"}">
              ${existsInRegistry ? "Jest w rejestrze" : "Brak w rejestrze"}
            </span>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderCheckPagination() {
  const totalPages = getTotalPages(stateRef.check.totalCount);
  const currentPage = normalizePageNumber(stateRef.check.currentPage);
  const visibleRange = getVisibleRange(
    currentPage,
    stateRef.check.rows.length,
    stateRef.check.totalCount
  );
  const isEmpty = stateRef.check.totalCount === 0;
  const isBusy = stateRef.check.isLoading || stateRef.check.isImporting;

  elements.checkRecordsMeta.textContent = isEmpty
    ? "Brak rekordow"
    : `Widoczne ${visibleRange.start}-${visibleRange.end} z ${stateRef.check.totalCount}`;

  elements.checkPagePrevButton.disabled = isBusy || currentPage <= 1 || isEmpty;
  elements.checkPageNextButton.disabled = isBusy || currentPage >= totalPages || isEmpty;

  const model = buildPaginationModel(totalPages, currentPage);
  elements.checkPaginationPages.innerHTML = model
    .map((item) => {
      if (item === "ellipsis") {
        return `<span class="pagination__ellipsis">...</span>`;
      }

      return `
        <button
          type="button"
          class="pagination__button ${item === currentPage ? "is-active" : ""}"
          data-action="check-page-go"
          data-page="${item}"
          ${isBusy || item === currentPage ? "disabled" : ""}
        >
          ${item}
        </button>
      `;
    })
    .join("");
}

function renderAll() {
  renderTabs();
  renderSyncState();
  renderCodesRows();
  renderCodesPagination();
  renderCheckControls();
  renderCheckStats();
  renderCheckRows();
  renderCheckPagination();

  elements.refreshButton.disabled = stateRef.isRefreshingRegistry;
  elements.checkChooseFileButton.disabled = stateRef.check.isImporting;

  if (stateRef.isRefreshingRegistry) {
    elements.subtitle.textContent = "Trwa odswiezanie rejestru z data-set.json.";
  } else if (stateRef.codes.isLoading) {
    elements.subtitle.textContent = "Wczytywanie kodow rejestru.";
  } else {
    elements.subtitle.textContent = "Kody rejestru SENT z data-set.json.";
  }
}

function applySyncState(nextSyncState = {}) {
  stateRef.syncState = {
    ...stateRef.syncState,
    ...nextSyncState,
  };
  renderSyncState();
}

function normalizeWorkbook(value = {}) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const sheets = Array.isArray(value.sheets)
    ? value.sheets
        .map((sheet) => {
          const columns = Array.isArray(sheet.columns)
            ? sheet.columns.map((column) => ({
                index: Number(column.index) || 0,
                letter: asText(column.letter),
                name: asText(column.name) || asText(column.label),
                label: asText(column.label) || asText(column.name),
                nonEmptyCount: Math.max(0, Number(column.nonEmptyCount) || 0),
                codeLikeCount: Math.max(0, Number(column.codeLikeCount) || 0),
              }))
            : [];
          if (!asText(sheet.name) || columns.length === 0) {
            return null;
          }

          return {
            name: asText(sheet.name),
            defaultColumnIndex: Number(sheet.defaultColumnIndex) || columns[0].index || 0,
            columns,
          };
        })
        .filter(Boolean)
    : [];

  if (sheets.length === 0) {
    return null;
  }

  return {
    filePath: asText(value.filePath),
    fileName: asText(value.fileName),
    sheets,
  };
}

function applyWorkbook(workbook, preferred = {}) {
  const normalizedWorkbook = normalizeWorkbook(workbook);
  stateRef.check.workbook = normalizedWorkbook;

  if (!normalizedWorkbook) {
    stateRef.check.selectedSheetName = "";
    stateRef.check.selectedColumnIndex = null;
    renderCheckControls();
    return;
  }

  const preferredSheetName = asText(preferred.sheetName);
  const selectedSheet =
    normalizedWorkbook.sheets.find((sheet) => sheet.name === preferredSheetName) ||
    normalizedWorkbook.sheets[0];
  stateRef.check.selectedSheetName = selectedSheet.name;

  const preferredColumnIndex = Number.isInteger(Number(preferred.columnIndex))
    ? Number(preferred.columnIndex)
    : selectedSheet.defaultColumnIndex;
  const selectedColumn =
    selectedSheet.columns.find((column) => column.index === preferredColumnIndex) ||
    selectedSheet.columns[0];
  stateRef.check.selectedColumnIndex = selectedColumn?.index ?? null;

  renderCheckControls();
}

async function loadSyncState() {
  if (typeof bridge.getSentCodesSyncState !== "function") {
    return;
  }

  const syncState = await bridge.getSentCodesSyncState();
  applySyncState(syncState || {});
}

async function loadCodesPage(page, options = {}) {
  const requestedPage = normalizePageNumber(page);
  const keepPage = Boolean(options.keepPage);

  if (stateRef.codes.isLoading) {
    return null;
  }

  stateRef.codes.isLoading = true;
  renderAll();

  try {
    let targetPage = keepPage ? requestedPage : normalizePageNumber(page);
    let response = await bridge.listSentCodes({
      limit: PAGE_SIZE,
      offset: (targetPage - 1) * PAGE_SIZE,
    });

    let totalCount = Math.max(0, Number(response.totalCount) || 0);
    let totalPages = getTotalPages(totalCount);

    if (totalCount > 0 && targetPage > totalPages) {
      targetPage = totalPages;
      response = await bridge.listSentCodes({
        limit: PAGE_SIZE,
        offset: (targetPage - 1) * PAGE_SIZE,
      });
      totalCount = Math.max(0, Number(response.totalCount) || 0);
      totalPages = getTotalPages(totalCount);
    }

    stateRef.codes.rows = Array.isArray(response.items) ? response.items : [];
    stateRef.codes.totalCount = totalCount;
    stateRef.codes.currentPage = totalCount > 0 ? targetPage : 1;
    if (response.syncState && typeof response.syncState === "object") {
      applySyncState(response.syncState);
    }

    if (totalCount === 0) {
      setStatus("Brak kodow w lokalnej bazie.");
    } else {
      const visibleRange = getVisibleRange(
        stateRef.codes.currentPage,
        stateRef.codes.rows.length,
        stateRef.codes.totalCount
      );
      setStatus(
        `Wczytano strone ${stateRef.codes.currentPage}/${totalPages}. Widoczne ${visibleRange.start}-${visibleRange.end} z ${stateRef.codes.totalCount} kodow.`
      );
    }

    return response;
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
    return null;
  } finally {
    stateRef.codes.isLoading = false;
    renderAll();
  }
}

async function loadCheckPage(page, options = {}) {
  const requestedPage = normalizePageNumber(page);
  const keepPage = Boolean(options.keepPage);

  if (stateRef.check.isLoading) {
    return null;
  }

  stateRef.check.isLoading = true;
  renderAll();

  try {
    let targetPage = keepPage ? requestedPage : normalizePageNumber(page);
    let response = await bridge.listSentCodesCheck({
      limit: PAGE_SIZE,
      offset: (targetPage - 1) * PAGE_SIZE,
    });

    let totalCount = Math.max(0, Number(response.totalCount) || 0);
    let totalPages = getTotalPages(totalCount);

    if (totalCount > 0 && targetPage > totalPages) {
      targetPage = totalPages;
      response = await bridge.listSentCodesCheck({
        limit: PAGE_SIZE,
        offset: (targetPage - 1) * PAGE_SIZE,
      });
      totalCount = Math.max(0, Number(response.totalCount) || 0);
      totalPages = getTotalPages(totalCount);
    }

    stateRef.check.rows = Array.isArray(response.items) ? response.items : [];
    stateRef.check.totalCount = totalCount;
    stateRef.check.matchedCount = Math.max(0, Number(response.matchedCount) || 0);
    stateRef.check.missingCount = Math.max(0, Number(response.missingCount) || 0);
    stateRef.check.currentPage = totalCount > 0 ? targetPage : 1;
    stateRef.check.importMeta =
      response.importMeta && typeof response.importMeta === "object" ? response.importMeta : null;
    if (response.syncState && typeof response.syncState === "object") {
      applySyncState(response.syncState);
    }

    if (stateRef.activeTab === "check") {
      if (totalCount === 0) {
        setStatus("Brak danych check. Wykonaj import pliku.");
      } else {
        const visibleRange = getVisibleRange(
          stateRef.check.currentPage,
          stateRef.check.rows.length,
          stateRef.check.totalCount
        );
        setStatus(
          `Check: strona ${stateRef.check.currentPage}/${totalPages}. Widoczne ${visibleRange.start}-${visibleRange.end} z ${stateRef.check.totalCount}.`
        );
      }
    }

    return response;
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
    return null;
  } finally {
    stateRef.check.isLoading = false;
    renderAll();
  }
}

async function refreshCodes() {
  if (stateRef.isRefreshingRegistry) {
    return null;
  }

  stateRef.isRefreshingRegistry = true;
  renderAll();

  try {
    const syncResult = await bridge.refreshSentCodes();
    applySyncState(syncResult || {});
    await loadCodesPage(stateRef.codes.currentPage, { keepPage: true });
    if (stateRef.check.totalCount > 0) {
      await loadCheckPage(stateRef.check.currentPage, { keepPage: true });
    }
    setStatus(
      `Odswiezenie rejestru zakonczone. Zapisano ${Number(syncResult?.savedCount) || 0} kodow.`
    );
    return syncResult;
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
    return null;
  } finally {
    stateRef.isRefreshingRegistry = false;
    renderAll();
  }
}

async function chooseImportFile() {
  if (stateRef.check.isImporting) {
    return null;
  }

  try {
    const response = await bridge.inspectSentCodesImportWorkbook();
    if (response?.canceled) {
      setStatus("Anulowano wybor pliku importu.");
      return null;
    }

    applyWorkbook(response?.workbook || response, {
      sheetName: response?.selected?.sheetName,
      columnIndex: response?.selected?.columnIndex,
    });
    setStatus(`Wybrano plik ${asText(response?.workbook?.fileName || response?.fileName)}.`);
    return response;
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
    return null;
  } finally {
    renderAll();
  }
}

async function importCheck() {
  if (stateRef.check.isImporting) {
    return null;
  }

  const workbook = stateRef.check.workbook;
  const currentSheet = getCurrentCheckSheet();
  const columnIndex = Number(stateRef.check.selectedColumnIndex);
  const selectedColumn = currentSheet?.columns?.find(
    (column) => Number(column.index) === columnIndex
  );

  if (!workbook || !currentSheet || !selectedColumn) {
    window.alert("Wybierz plik, arkusz i kolumne z kodami HS.");
    setStatus("Brak kompletnej konfiguracji importu.");
    return null;
  }

  stateRef.check.isImporting = true;
  renderAll();

  try {
    const result = await bridge.importSentCodesCheck({
      filePath: workbook.filePath,
      sheetName: currentSheet.name,
      columnIndex,
    });

    applyWorkbook(result?.workbook || workbook, result?.selected || {});
    stateRef.check.importMeta =
      result?.importMeta && typeof result.importMeta === "object" ? result.importMeta : null;
    await loadCheckPage(1);

    setStatus(
      `Import zakonczony. Unikalnych: ${Number(result?.uniqueCount) || 0}, wyciagnietych: ${Number(result?.totalExtracted) || 0}, niepoprawnych komorek: ${Number(result?.invalidCellCount) || 0}.`
    );
    return result;
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
    return null;
  } finally {
    stateRef.check.isImporting = false;
    renderAll();
  }
}

function handleSentCodesStatus(payload = {}) {
  applySyncState(payload);

  if (payload.type === "running") {
    setStatus("Odswiezanie rejestru SENT uruchomione.");
    return;
  }

  if (payload.type === "progress") {
    setStatus(
      `Odswiezanie SENT: wczytano ${Number(payload.fetchedCount) || 0} kodow z data-set.json.`
    );
    return;
  }

  if (payload.type === "completed") {
    setStatus(
      `Odswiezanie SENT zakonczone. Zapisano ${Number(payload.savedCount) || 0} kodow.`
    );
    loadCodesPage(stateRef.codes.currentPage, { keepPage: true }).catch(() => {});
    if (stateRef.check.totalCount > 0) {
      loadCheckPage(stateRef.check.currentPage, { keepPage: true }).catch(() => {});
    }
    return;
  }

  if (payload.type === "failed") {
    setStatus(asText(payload.error) || "Odswiezanie SENT nieudane.");
  }
}

async function handleAction(action, payload = {}) {
  switch (action) {
    case "home":
      return bridge.openHome();
    case "refresh":
      return refreshCodes();

    case "codes-page-prev":
      return loadCodesPage(normalizePageNumber(stateRef.codes.currentPage) - 1, { keepPage: true });
    case "codes-page-next":
      return loadCodesPage(normalizePageNumber(stateRef.codes.currentPage) + 1, { keepPage: true });
    case "codes-page-go":
      return loadCodesPage(payload.page, { keepPage: true });

    case "check-choose-file":
      return chooseImportFile();
    case "check-import":
      return importCheck();
    case "check-page-prev":
      return loadCheckPage(normalizePageNumber(stateRef.check.currentPage) - 1, { keepPage: true });
    case "check-page-next":
      return loadCheckPage(normalizePageNumber(stateRef.check.currentPage) + 1, { keepPage: true });
    case "check-page-go":
      return loadCheckPage(payload.page, { keepPage: true });
    default:
      return null;
  }
}

document.addEventListener("click", async (event) => {
  const tabButton = event.target.closest("[data-tab-button]");
  if (tabButton) {
    stateRef.activeTab = asText(tabButton.dataset.tabButton) || "codes";
    renderTabs();
    return;
  }

  const actionNode = event.target.closest("[data-action]");
  if (!actionNode) {
    return;
  }

  try {
    await handleAction(actionNode.dataset.action, {
      page: actionNode.dataset.page,
    });
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    setStatus(error.message);
  }
});

elements.checkSheetSelect.addEventListener("change", () => {
  const nextSheetName = asText(elements.checkSheetSelect.value);
  stateRef.check.selectedSheetName = nextSheetName;
  const currentSheet = getCurrentCheckSheet();
  if (!currentSheet) {
    stateRef.check.selectedColumnIndex = null;
    renderAll();
    return;
  }

  const firstColumn = currentSheet.columns.find(
    (column) => column.index === Number(currentSheet.defaultColumnIndex)
  ) || currentSheet.columns[0];
  stateRef.check.selectedColumnIndex = firstColumn ? firstColumn.index : null;
  renderAll();
});

elements.checkColumnSelect.addEventListener("change", () => {
  const nextColumnIndex = Number(elements.checkColumnSelect.value);
  stateRef.check.selectedColumnIndex = Number.isInteger(nextColumnIndex) ? nextColumnIndex : null;
  renderAll();
});

async function bootstrap() {
  bridge.setWindowTitle("SENT Codes");
  if (typeof bridge.onSentCodesStatus === "function") {
    bridge.onSentCodesStatus(handleSentCodesStatus);
  }

  renderAll();
  await loadSyncState();
  await loadCodesPage(1);
  await loadCheckPage(1);
}

bootstrap().catch((error) => {
  console.error(error);
  window.alert(error.message);
  setStatus(error.message);
});
