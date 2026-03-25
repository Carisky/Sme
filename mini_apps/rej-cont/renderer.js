const bridge = window.bridge;
const PAGE_SIZE = 500;
const FALLBACK_TERMINALS = ["BCT", "DCT", "GCT"];

const elements = {
  gridSummary: document.getElementById("grid-summary"),
  recordsMeta: document.getElementById("records-meta"),
  statusText: document.getElementById("status-text"),
  tableBody: document.getElementById("table-body"),
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
  rows: [],
  totalCount: 0,
  nextOffset: 0,
  hasMore: false,
  isLoading: false,
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

function renderSummary() {
  if (stateRef.isLoading) {
    elements.gridSummary.textContent = "Ladowanie kontenerow z bazy...";
  } else if (!stateRef.rows.length) {
    elements.gridSummary.textContent = "Brak rekordow dla aktualnych filtrow.";
  } else {
    elements.gridSummary.textContent = `Pokazano ${stateRef.rows.length} z ${stateRef.totalCount} rekordow.`;
  }

  if (stateRef.totalCount > 0) {
    elements.recordsMeta.textContent = stateRef.hasMore
      ? `Widocznych ${stateRef.rows.length} / ${stateRef.totalCount}. Kolejna paczka zacznie sie od offset ${stateRef.nextOffset}.`
      : `Widocznych ${stateRef.rows.length} / ${stateRef.totalCount}.`;
  } else {
    elements.recordsMeta.textContent = "Brak danych.";
  }

  if (stateRef.isLoading) {
    elements.loadMoreButton.textContent = "Ladowanie...";
  } else if (stateRef.hasMore) {
    elements.loadMoreButton.textContent = "Dociagnij kolejne 500";
  } else {
    elements.loadMoreButton.textContent = "Wczytano wszystko";
  }

  elements.loadMoreButton.disabled = stateRef.isLoading || !stateRef.hasMore;
}

function renderRows() {
  if (stateRef.isLoading && stateRef.rows.length === 0) {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="8">Trwa pobieranie pierwszej paczki 500 rekordow...</td>
      </tr>
    `;
    return;
  }

  if (stateRef.rows.length === 0) {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="8">Brak kontenerow dla wybranego zestawu filtrow.</td>
      </tr>
    `;
    return;
  }

  elements.tableBody.innerHTML = stateRef.rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.id)}</td>
          <td>${escapeHtml(row.number)}</td>
          <td>${escapeHtml(displayValue(row.mrn))}</td>
          <td>${escapeHtml(displayValue(row.stop))}</td>
          <td>${escapeHtml(formatGridDate(row.lastRefreshTime))}</td>
          <td><span class="cell-status">${escapeHtml(displayValue(row.status))}</span></td>
          <td><span class="cell-terminal">${escapeHtml(displayValue(row.terminalName))}</span></td>
          <td>${escapeHtml(formatGridDate(row.createdAt))}</td>
        </tr>
      `
    )
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
  renderSummary();
  renderRows();
  renderModal();
}

async function loadContainers(options = {}) {
  const append = Boolean(options.append);
  if (stateRef.isLoading) {
    return null;
  }

  if (!append) {
    stateRef.filters = readFiltersFromDom();
  }

  stateRef.isLoading = true;
  renderAll();

  try {
    const result = await bridge.listRejContContainers({
      limit: PAGE_SIZE,
      offset: append ? stateRef.nextOffset || stateRef.rows.length : 0,
      filters: stateRef.filters,
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

async function handleAction(action) {
  switch (action) {
    case "home":
      return bridge.openHome();
    case "refresh":
      return loadContainers();
    case "apply-filters":
      return loadContainers();
    case "reset-filters":
      return resetFilters();
    case "load-more":
      return loadContainers({ append: true });
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
    await handleAction(actionNode.dataset.action);
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
  renderAll();
  await loadContainers();
}

bootstrap().catch((error) => {
  console.error(error);
  window.alert(error.message);
  setStatus(error.message);
});
