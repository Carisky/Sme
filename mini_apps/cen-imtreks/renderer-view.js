import {
  collectInvoiceComparisonRows,
  collectInvoiceComparisonStats,
  collectProjectStats,
  escapeHtml,
  formatTimestamp,
  getActiveSheet,
  getActiveSheetDuplicateContainers,
  getActiveSheetFilterOptions,
  getInvoiceComparisonSheetOptions,
  getFilteredRows,
  matchesRowFilters,
  normalizeComparisonContainers,
  shouldUseCompactStopValue,
} from "./renderer-model.js";

function renderSelectedDateSummary(filterOptions, selectedValues = [], stateRef) {
  const options = Array.isArray(filterOptions?.vesselDateOptions)
    ? filterOptions.vesselDateOptions
    : [];
  if (!options.length) {
    return "Daty statku: brak";
  }

  if (stateRef?.vesselDateModeFilter === "range") {
    const from = stateRef.vesselDateFromFilter;
    const to = stateRef.vesselDateToFilter;
    if (from && to) {
      return from === to ? `Data statku: ${to}` : `Data statku: ${from} - ${to}`;
    }
    if (from) {
      return `Data statku od: ${from}`;
    }
    if (to) {
      return `Data statku do: ${to}`;
    }

    return `Daty statku: wszystkie (${options.length})`;
  }

  const selectedSet = new Set(selectedValues);
  const selectedOptions = options.filter((option) => selectedSet.has(option.value));

  if (!selectedOptions.length || selectedOptions.length === options.length) {
    return `Daty statku: wszystkie (${options.length})`;
  }

  if (selectedOptions.length === 1) {
    return `Data statku: ${selectedOptions[0].label}`;
  }

  if (selectedOptions.length <= 3) {
    return `Daty statku: ${selectedOptions.map((option) => option.label).join(", ")}`;
  }

  return `Daty statku: ${selectedOptions.length} z ${options.length}`;
}

function renderComparisonSheetSummary(sheetOptions = [], selectedSheets = []) {
  if (!sheetOptions.length) {
    return "Arkusze: brak";
  }

  const selected = sheetOptions.filter((sheetName) => selectedSheets.includes(sheetName));
  if (!selected.length || selected.length === sheetOptions.length) {
    return `Arkusze: wszystkie (${sheetOptions.length})`;
  }

  if (selected.length <= 3) {
    return `Arkusze: ${selected.join(", ")}`;
  }

  return `Arkusze: ${selected.length} z ${sheetOptions.length}`;
}

function renderSelectedOptionSummary(label, options = [], selectedValues = []) {
  if (!options.length) {
    return `${label}: brak`;
  }

  const selectedSet = new Set(selectedValues);
  const selectedOptions = options.filter((option) => selectedSet.has(option.value));
  if (!selectedOptions.length || selectedOptions.length === options.length) {
    return `${label}: wszystkie (${options.length})`;
  }

  if (selectedOptions.length === 1) {
    return `${label}: ${selectedOptions[0].label}`;
  }

  if (selectedOptions.length <= 3) {
    return `${label}: ${selectedOptions.map((option) => option.label).join(", ")}`;
  }

  return `${label}: ${selectedOptions.length} z ${options.length}`;
}

function renderEditableCell(field, value, updatedFields, extraClass = "", extraAttributes = "") {
  const isUpdated = updatedFields.has(field);
  const classes = ["row-input"];
  if (extraClass) {
    classes.push(extraClass);
  }
  if (isUpdated) {
    classes.push("row-input--updated");
  }

  return `<input type="text" data-field="${escapeHtml(field)}" value="${escapeHtml(
    value
  )}" class="${classes.join(" ")}"${isUpdated ? ' title="Uzupelnione podczas ostatniej aktualizacji"' : ""}${extraAttributes ? ` ${extraAttributes}` : ""} />`;
}

function renderMultiSelectOptions(
  options = [],
  selectedValues = [],
  valueAttribute,
  selectionAttribute,
  emptyMessage
) {
  if (!options.length) {
    return `<div class="filter-multiselect__empty">${escapeHtml(emptyMessage)}</div>`;
  }

  return `
    <div class="filter-multiselect__actions">
      <button type="button" class="button--minimal filter-multiselect__button" ${selectionAttribute}="all">
        Wszystkie
      </button>
      <button type="button" class="button--minimal filter-multiselect__button" ${selectionAttribute}="clear">
        Wyczysc
      </button>
    </div>
    <div class="filter-multiselect__list">
      ${options
        .map(
          (option) => `
            <label class="filter-checkbox">
              <input
                type="checkbox"
                ${valueAttribute}="${escapeHtml(option.value)}"
                ${selectedValues.includes(option.value) ? "checked" : ""}
              />
              <span>${escapeHtml(option.label)}</span>
            </label>
          `
        )
        .join("")}
    </div>
  `;
}

const MANUAL_DRAFT_PLACEHOLDERS = {
  sequenceNumber: "Lp.",
  orderDate: "dd.mm.rrrr",
  vesselDate: "dd.mm.rrrr",
  folderName: "Folder / sprawa",
  containerNumber: "1 lub wiele kontenerow (MSBU..., MSDU...)",
  blNumber: "BL",
  customsOffice: "UC / kod",
  status: "Status",
  stop: "Stop",
  t1: "T1",
  invoiceInfo: "Faktura",
  remarks: "Uwagi",
};

function renderRowsMessageRow(message) {
  return `
    <tr class="row--message">
      <td colspan="14">${escapeHtml(message)}</td>
    </tr>
  `;
}

function renderComparisonStatusBadge(row) {
  const statusClass = row.hasComparisonMatch
    ? "comparison-badge comparison-badge--matched"
    : "comparison-badge comparison-badge--missing";
  return `<span class="${statusClass}">${escapeHtml(row.statusLabel)}</span>`;
}

function renderManualDraftCell(field, value, extraClass = "") {
  const classes = ["row-input", "row-input--draft"];
  if (extraClass) {
    classes.push(extraClass);
  }

  return `<input
    type="text"
    data-draft-field="${escapeHtml(field)}"
    value="${escapeHtml(value)}"
    placeholder="${escapeHtml(MANUAL_DRAFT_PLACEHOLDERS[field] || "")}"
    class="${classes.join(" ")}"
  />`;
}

function renderManualDraftRow(draft = {}) {
  const stopExtraClass = shouldUseCompactStopValue(draft.stop) ? "row-input--compact" : "";

  return `
    <tr data-manual-draft="true" class="row--draft">
      <td class="row-index">${renderManualDraftCell("sequenceNumber", draft.sequenceNumber)}</td>
      <td>${renderManualDraftCell("orderDate", draft.orderDate)}</td>
      <td>${renderManualDraftCell("vesselDate", draft.vesselDate)}</td>
      <td>${renderManualDraftCell("folderName", draft.folderName)}</td>
      <td>${renderManualDraftCell("containerNumber", draft.containerNumber)}</td>
      <td>${renderManualDraftCell("blNumber", draft.blNumber)}</td>
      <td>${renderManualDraftCell("customsOffice", draft.customsOffice)}</td>
      <td>${renderManualDraftCell("status", draft.status)}</td>
      <td>${renderManualDraftCell("stop", draft.stop, stopExtraClass)}</td>
      <td>${renderManualDraftCell("t1", draft.t1)}</td>
      <td>${renderManualDraftCell("invoiceInfo", draft.invoiceInfo)}</td>
      <td>${renderManualDraftCell("remarks", draft.remarks)}</td>
      <td class="row-source--draft">Nowy</td>
      <td class="cell-actions">
        <button type="button" data-action="add-draft-row" title="Dodaj wiersze z dolnego placeholdera">
          Dodaj
        </button>
      </td>
    </tr>
  `;
}

function renderDuplicateMarker(hasDuplicate) {
  return `
    <span
      class="row-flag${hasDuplicate ? " row-flag--duplicate" : ""}"
      ${hasDuplicate ? 'title="Duplikat kontenera w aktywnej zakladce"' : 'aria-hidden="true"'}
    >
      !
    </span>
  `;
}

export function renderProjectIndicator(elements, stateRef, bridge, getActiveProjectTitle) {
  const currentTitle = getActiveProjectTitle();
  const syncLabel = stateRef.currentProjectId ? "projekt w bazie" : "nowy projekt";
  const suffix = stateRef.dirty ? " * synchronizacja w toku" : "";
  elements.projectIndicator.textContent = `${currentTitle} - ${syncLabel}${suffix}`;
  bridge.setWindowTitle(`${currentTitle}${stateRef.dirty ? " *" : ""}`);
}

export function renderProjectOptions(elements, stateRef) {
  elements.projectNameOptions.innerHTML = stateRef.projectOptions
    .map((project) => {
      const details = [
        project.rowCount ? `${project.rowCount} wierszy` : "0 wierszy",
        project.updatedAt ? formatTimestamp(project.updatedAt) : "",
      ]
        .filter(Boolean)
        .join(" | ");

      return `<option value="${escapeHtml(project.projectName)}" label="${escapeHtml(details)}"></option>`;
    })
    .join("");
}

export function renderSummary(elements, stateRef, getActiveProjectTitle) {
  const activeSheet = getActiveSheet(stateRef.state);
  const stats = stateRef.projectStats || collectProjectStats(stateRef.state);
  const syncLabel = stateRef.dirty
    ? "Oczekuje na zapis"
    : stateRef.currentProjectSummary?.updatedAt
      ? formatTimestamp(stateRef.currentProjectSummary.updatedAt)
      : "Nowy projekt";
  const dbStatusLabel = stateRef.state.dbPath ? "Aktywna" : "Domyslna";

  elements.summaryProjectTitle.textContent = getActiveProjectTitle();
  elements.summaryProjectSync.textContent = syncLabel;
  elements.summaryProjectSyncInline.textContent = syncLabel;
  elements.summaryActiveMonthInline.textContent = `Arkusz: ${activeSheet?.name || "-"}`;
  elements.summaryRowCountInline.textContent = `${stats.rowCount} wierszy`;
  elements.summarySourceFile.textContent = stateRef.state.sourceFileName || "-";
  elements.summaryActiveMonth.textContent = activeSheet?.name || "-";
  elements.summaryMonthCount.textContent = String(stateRef.state.sheets.length);
  elements.summaryRowCount.textContent = String(stats.rowCount);
  elements.summaryFilledCount.textContent = String(stats.filledCount);
  elements.summaryPendingCount.textContent = String(stats.pendingCount);
  elements.summaryManualCount.textContent = String(stats.manualCount);
  elements.summaryDbPath.textContent = stateRef.state.dbPath || "-";
  elements.summaryDbStatus.textContent = dbStatusLabel;
  elements.summaryDbStatusInline.textContent = dbStatusLabel;
  elements.summaryManualCountInline.textContent = `${stats.manualCount} recznych`;
  elements.activeMonthLabel.textContent = activeSheet?.name || "Brak miesiecy";
  elements.dbPath.value = stateRef.state.dbPath;

  if (document.activeElement !== elements.projectName) {
    elements.projectName.value = stateRef.projectNameDraft;
  }
}

export function renderMonthTabs(elements, stateRef) {
  if (!stateRef.state.sheets.length) {
    elements.monthTabs.innerHTML = `<div class="month-tabs__empty">Zaimportuj Excel lub dodaj zakladke projektu.</div>`;
    return;
  }

  elements.monthTabs.innerHTML = stateRef.state.sheets
    .map(
      (sheet) => `
        <button
          type="button"
          class="month-tab${sheet.id === stateRef.state.activeSheetId ? " is-active" : ""}"
          data-month-id="${escapeHtml(sheet.id)}"
          title="Kliknij prawym przyciskiem, aby otworzyc menu zakladki"
        >
          ${escapeHtml(sheet.name)} (${sheet.rows.length})
        </button>
      `
    )
    .join("");
}

export function renderFilters(elements, stateRef) {
  const filterOptions =
    stateRef.activeSheetShadow?.filterOptions || getActiveSheetFilterOptions(stateRef.state);
  const vesselDateOptionValues = new Set(
    filterOptions.vesselDateOptions.map((option) => option.value)
  );
  const selectedVesselDates = stateRef.vesselDateSelectedFilter.filter((value) =>
    vesselDateOptionValues.has(value)
  );
  const statusOptionValues = new Set(filterOptions.statuses.map((option) => option.value));
  const selectedStatuses = stateRef.statusFilters.filter((value) => statusOptionValues.has(value));
  const remarkOptionValues = new Set(filterOptions.remarks.map((option) => option.value));
  const selectedRemarks = stateRef.remarksFilters.filter((value) => remarkOptionValues.has(value));

  elements.filterVesselDateMode.value = stateRef.vesselDateModeFilter;
  elements.filterVesselDateRange.hidden = stateRef.vesselDateModeFilter !== "range";
  elements.filterVesselDateListPanel.hidden = stateRef.vesselDateModeFilter !== "list";
  elements.filterVesselDateFrom.min = filterOptions.vesselDateFrom;
  elements.filterVesselDateFrom.max = filterOptions.vesselDateTo;
  elements.filterVesselDateFrom.value = stateRef.vesselDateFromFilter;
  elements.filterVesselDateFrom.placeholder = "Data statku od";
  elements.filterVesselDateTo.min = filterOptions.vesselDateFrom;
  elements.filterVesselDateTo.max = filterOptions.vesselDateTo;
  elements.filterVesselDateTo.value = stateRef.vesselDateToFilter;
  elements.filterVesselDateTo.placeholder = "Data statku do";
  elements.filterVesselDateFrom.title = filterOptions.vesselDateFrom
    ? `Data statku od (${filterOptions.vesselDateFrom} - ${filterOptions.vesselDateTo})`
    : "Data statku od";
  elements.filterVesselDateTo.title = filterOptions.vesselDateTo
    ? `Data statku do (${filterOptions.vesselDateFrom} - ${filterOptions.vesselDateTo})`
    : "Data statku do";
  elements.filterVesselDateSummary.textContent = renderSelectedDateSummary(
    filterOptions,
    selectedVesselDates,
    stateRef
  );
  elements.filterVesselDateOptions.innerHTML = renderMultiSelectOptions(
    filterOptions.vesselDateOptions,
    selectedVesselDates,
    "data-vessel-date-value",
    "data-date-selection",
    "Brak dat statku na aktywnej zakladce."
  );
  elements.filterHasT1.innerHTML = `
    <option value="all">T1: wszystko</option>
    <option value="with"${stateRef.hasT1Filter === "with" ? " selected" : ""}>Tylko z T1</option>
    <option value="without"${stateRef.hasT1Filter === "without" ? " selected" : ""}>Tylko bez T1</option>
  `;
  elements.filterStatusSummary.textContent = renderSelectedOptionSummary(
    "Status",
    filterOptions.statuses,
    selectedStatuses
  );
  elements.filterStatusOptions.innerHTML = renderMultiSelectOptions(
    filterOptions.statuses,
    selectedStatuses,
    "data-status-value",
    "data-status-selection",
    "Brak statusow na aktywnej zakladce."
  );
  elements.filterRemarksSummary.textContent = renderSelectedOptionSummary(
    "Uwagi",
    filterOptions.remarks,
    selectedRemarks
  );
  elements.filterRemarksOptions.innerHTML = renderMultiSelectOptions(
    filterOptions.remarks,
    selectedRemarks,
    "data-remark-value",
    "data-remark-selection",
    "Brak uwag na aktywnej zakladce."
  );
  elements.filterComparison.innerHTML = `
    <option value="all">Porownanie: wszystko</option>
    <option value="matched"${stateRef.comparisonFilter === "matched" ? " selected" : ""}>Tylko w bazie</option>
    <option value="missing"${stateRef.comparisonFilter === "missing" ? " selected" : ""}>Tylko do faktur</option>
  `;
}

export function renderRows(elements, stateRef) {
  const activeSheet = getActiveSheet(stateRef.state);
  const comparisonSet = new Set(
    normalizeComparisonContainers(stateRef.state.invoiceComparison?.containers)
  );
  const duplicateContainerSet =
    stateRef.activeSheetShadow?.duplicateContainers ||
    getActiveSheetDuplicateContainers(stateRef.state);
  const invoicePreviewMap = new Map(
    Array.isArray(stateRef.invoicePreview?.entries)
      ? stateRef.invoicePreview.entries.map((entry) => [entry.rowId, entry.nextValue])
      : []
  );
  const rows = activeSheet
    ? getFilteredRows(stateRef.state, {
        searchTerm: stateRef.projectSearchTerm,
        vesselDateMode: stateRef.vesselDateModeFilter,
        vesselDateFrom: stateRef.vesselDateFromFilter,
        vesselDateTo: stateRef.vesselDateToFilter,
        vesselDateSelected: stateRef.vesselDateSelectedFilter,
        hasT1: stateRef.hasT1Filter,
        statuses: stateRef.statusFilters,
        remarks: stateRef.remarksFilters,
        comparisonStatus: stateRef.comparisonFilter,
        comparisonContainers: stateRef.state.invoiceComparison?.containers || [],
        includeRowIds: Array.from(stateRef.stickyVisibleRowIds || []),
      })
    : [];
  const baseFilters = {
    searchTerm: stateRef.projectSearchTerm,
    vesselDateMode: stateRef.vesselDateModeFilter,
    vesselDateFrom: stateRef.vesselDateFromFilter,
    vesselDateTo: stateRef.vesselDateToFilter,
    vesselDateSelected: stateRef.vesselDateSelectedFilter,
    hasT1: stateRef.hasT1Filter,
    statuses: stateRef.statusFilters,
    remarks: stateRef.remarksFilters,
    comparisonStatus: stateRef.comparisonFilter,
    comparisonContainers: stateRef.state.invoiceComparison?.containers || [],
  };
  const renderedRows = rows
    .map((row) => {
      const updatedFields = stateRef.rowHighlights.get(row.id) || new Set();
      const isStickyRow =
        stateRef.stickyVisibleRowIds?.has(row.id) && !matchesRowFilters(row, baseFilters);
      const hasComparisonMatch = comparisonSet.has(row.containerNumber);
      const hasDuplicateContainer = duplicateContainerSet.has(row.containerNumber);
      const shouldHighlightComparison =
        stateRef.comparisonHighlightEnabled && hasComparisonMatch;
      const shouldHighlightDuplicate =
        stateRef.duplicateHighlightEnabled && hasDuplicateContainer;
      const previewInvoiceValue = invoicePreviewMap.get(row.id);
      const hasInvoicePreview = previewInvoiceValue !== undefined;
      const rowClasses = [
        updatedFields.size ? "row--updated" : "",
        isStickyRow ? "row--sticky-visible" : "",
        shouldHighlightComparison ? "row--comparison-highlight" : "",
        shouldHighlightDuplicate ? "row--duplicate-highlight" : "",
        hasInvoicePreview ? "row--invoice-preview" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const sourceText = row.sourceRowNumber || row.origin || "-";
      const stopExtraClass = shouldUseCompactStopValue(row.stop) ? "row-input--compact" : "";
      const containerExtraClass = shouldHighlightComparison ? "row-input--comparison-match" : "";
      const invoiceExtraClass = hasInvoicePreview ? "row-input--invoice-preview" : "";
      const invoiceAttributes = hasInvoicePreview
        ? 'disabled title="Podglad faktury. Uzyj Akceptuj fakture, aby zapisac zmiany."'
        : "";

      return `
        <tr data-row-id="${escapeHtml(row.id)}" class="${escapeHtml(rowClasses)}">
          <td class="row-index">
            <div class="row-index__content">
              ${renderDuplicateMarker(hasDuplicateContainer)}
              ${renderEditableCell("sequenceNumber", row.sequenceNumber, updatedFields)}
            </div>
          </td>
          <td>${renderEditableCell("orderDate", row.orderDate, updatedFields)}</td>
          <td>${renderEditableCell("vesselDate", row.vesselDate, updatedFields)}</td>
          <td>${renderEditableCell("folderName", row.folderName, updatedFields)}</td>
          <td>${renderEditableCell("containerNumber", row.containerNumber, updatedFields, containerExtraClass)}</td>
          <td>${renderEditableCell("blNumber", row.blNumber, updatedFields)}</td>
          <td>${renderEditableCell("customsOffice", row.customsOffice, updatedFields)}</td>
          <td>${renderEditableCell("status", row.status, updatedFields)}</td>
          <td>${renderEditableCell("stop", row.stop, updatedFields, stopExtraClass)}</td>
          <td>${renderEditableCell("t1", row.t1, updatedFields)}</td>
          <td>${renderEditableCell("invoiceInfo", hasInvoicePreview ? previewInvoiceValue : row.invoiceInfo, updatedFields, invoiceExtraClass, invoiceAttributes)}</td>
          <td>${renderEditableCell("remarks", row.remarks, updatedFields)}</td>
          <td>
            ${escapeHtml(sourceText)}
          </td>
          <td class="cell-actions">
            <button type="button" data-action="delete-row" data-row-id="${escapeHtml(row.id)}">Usun</button>
          </td>
        </tr>
      `;
    })
    .join("");

  const rowBlocks = [];
  if (!activeSheet) {
    rowBlocks.push(
      renderRowsMessageRow("Brak miesiecy. Zaimportuj rejestr IMTREKS lub dodaj wiersz recznie.")
    );
  } else if (activeSheet.rows.length === 0) {
    rowBlocks.push(renderRowsMessageRow(`Brak wierszy w miesiacu ${activeSheet.name}.`));
  } else if (!rows.length) {
    rowBlocks.push(renderRowsMessageRow("Brak wynikow dla aktywnej zakladki i ustawionych filtrow."));
  }

  if (renderedRows) {
    rowBlocks.push(renderedRows);
  }

  rowBlocks.push(renderManualDraftRow(stateRef.manualRowDraft || {}));
  elements.projectRows.innerHTML = rowBlocks.join("");
}

export function renderLookupRows(elements, stateRef) {
  if (!stateRef.lookupRecords.length) {
    elements.lookupRows.innerHTML = `
      <tr>
        <td colspan="6">Brak rekordow w bazie.</td>
      </tr>
    `;
    return;
  }

  elements.lookupRows.innerHTML = stateRef.lookupRecords
    .map(
      (record) => `
        <tr data-record-container="${escapeHtml(record.containerNumber)}">
          <td>${escapeHtml(record.containerNumber)}</td>
          <td>${escapeHtml(record.cen)}</td>
          <td>${escapeHtml(record.tState)}</td>
          <td>${escapeHtml(record.stop)}</td>
          <td>${escapeHtml(record.source)}</td>
          <td>${escapeHtml(record.updatedAt || record.createdAt || "-")}</td>
        </tr>
      `
    )
    .join("");
}

export function renderRecordDraft(elements, stateRef) {
  elements.recordContainer.value = stateRef.recordDraft.containerNumber;
  elements.recordCen.value = stateRef.recordDraft.cen;
  elements.recordTState.value = stateRef.recordDraft.tState;
  elements.recordStop.value = stateRef.recordDraft.stop;
}

export function renderInvoiceComparison(elements, stateRef) {
  const sheetOptions = getInvoiceComparisonSheetOptions(stateRef.state);
  const selectedSheets = (Array.isArray(stateRef.comparisonSelectedSheets)
    ? stateRef.comparisonSelectedSheets
    : []
  ).filter((sheetName) => sheetOptions.includes(sheetName));
  const comparisonOptions = {
    sheetNames: selectedSheets,
    statusSort: stateRef.comparisonStatusSort,
  };
  const stats = collectInvoiceComparisonStats(stateRef.state, comparisonOptions);
  const rows = collectInvoiceComparisonRows(stateRef.state, comparisonOptions).filter((row) => {
    const matchesSearch = !stateRef.comparisonSearchTerm
      ? true
      : row.containerNumber.includes(stateRef.comparisonSearchTerm);
    const matchesStatus =
      stateRef.comparisonStatusFilter === "matched"
        ? row.hasComparisonMatch
        : stateRef.comparisonStatusFilter === "missing"
          ? !row.hasComparisonMatch
          : true;
    return matchesSearch && matchesStatus;
  });
  const comparison = stateRef.state.invoiceComparison || {};
  const workbook = stateRef.comparisonWorkbook || null;
  const requestedSheetName = comparison.sheetName || workbook?.selectedSheetName || "";
  const workbookSheets = Array.isArray(workbook?.sheets) ? workbook.sheets : [];
  const selectedSheet =
    workbookSheets.find((sheet) => sheet.name === requestedSheetName) || workbookSheets[0] || null;
  const selectedSheetName = selectedSheet?.name || requestedSheetName;
  const requestedColumnKey = comparison.columnKey || workbook?.selectedColumnKey || "";
  const selectedColumn =
    selectedSheet?.columns?.find((column) => column.key === requestedColumnKey) ||
    selectedSheet?.columns?.[0] ||
    null;

  elements.comparisonProjectCount.textContent = String(stats.projectContainers);
  elements.comparisonMatchedCount.textContent = String(stats.matchedContainers);
  elements.comparisonMissingCount.textContent = String(stats.missingContainers);
  elements.comparisonBaseCount.textContent = String(stats.comparisonContainers);
  elements.comparisonFilePath.value = comparison.filePath || "";
  elements.comparisonSearch.value = stateRef.comparisonSearchTerm || "";
  elements.comparisonStatusFilter.value = stateRef.comparisonStatusFilter || "all";
  elements.comparisonStatusSort.value = stateRef.comparisonStatusSort || "missing-first";
  elements.comparisonSheetSummary.textContent = renderComparisonSheetSummary(
    sheetOptions,
    selectedSheets
  );
  elements.comparisonSourceMeta.textContent = comparison.fileName
    ? `Plik: ${comparison.fileName} | Arkusz: ${comparison.sheetName || "-"} | Kolumna: ${
        comparison.columnKey || "-"
      }${comparison.columnHeader ? ` - ${comparison.columnHeader}` : ""}`
    : "Lista jest budowana automatycznie z kontenerow zapisanych w tym projekcie.";

  elements.comparisonSheetOptions.innerHTML = sheetOptions.length
    ? `
      <div class="filter-multiselect__actions">
        <button type="button" class="button--minimal filter-multiselect__button" data-comparison-sheet-selection="all">
          Wszystkie
        </button>
        <button type="button" class="button--minimal filter-multiselect__button" data-comparison-sheet-selection="clear">
          Wyczysc
        </button>
      </div>
      <div class="filter-multiselect__list">
        ${sheetOptions
          .map(
            (sheetName) => `
              <label class="filter-checkbox">
                <input
                  type="checkbox"
                  data-comparison-sheet-value="${escapeHtml(sheetName)}"
                  ${selectedSheets.includes(sheetName) ? "checked" : ""}
                />
                <span>${escapeHtml(sheetName)}</span>
              </label>
            `
          )
          .join("")}
      </div>
    `
    : `<div class="filter-multiselect__empty">Brak arkuszy w projekcie.</div>`;

  if (workbookSheets.length > 0) {
    elements.comparisonSheet.innerHTML = workbookSheets
      .map(
        (sheet) =>
          `<option value="${escapeHtml(sheet.name)}"${sheet.name === selectedSheetName ? " selected" : ""}>${escapeHtml(sheet.name)}</option>`
      )
      .join("");
    elements.comparisonSheet.disabled = false;
  } else {
    elements.comparisonSheet.innerHTML = `<option value="">Brak arkuszy</option>`;
    elements.comparisonSheet.disabled = true;
  }

  if (selectedSheet?.columns?.length) {
    elements.comparisonColumn.innerHTML = selectedSheet.columns
      .map(
        (column) =>
          `<option value="${escapeHtml(column.key)}"${column.key === selectedColumn?.key ? " selected" : ""}>${escapeHtml(column.key)} - ${escapeHtml(column.header)}</option>`
      )
      .join("");
    elements.comparisonColumn.disabled = false;
  } else {
    const fallbackLabel = comparison.columnKey
      ? `${comparison.columnKey} - ${comparison.columnHeader || "wybrana kolumna"}`
      : "Brak kolumn";
    elements.comparisonColumn.innerHTML = `<option value="${escapeHtml(comparison.columnKey || "")}">${escapeHtml(fallbackLabel)}</option>`;
    elements.comparisonColumn.disabled = true;
  }

  if (!rows.length) {
    elements.comparisonRows.innerHTML = `
      <tr class="row--message">
        <td colspan="4">${
          stats.projectContainers
            ? "Brak kontenerow dla aktywnego filtra porownania."
            : "Brak kontenerow w projekcie do porownania."
        }</td>
      </tr>
    `;
    return;
  }

  elements.comparisonRows.innerHTML = rows
    .map(
      (row) => `
        <tr class="${row.hasComparisonMatch ? "comparison-row comparison-row--matched" : "comparison-row comparison-row--missing"}">
          <td>${escapeHtml(row.containerNumber)}</td>
          <td>${renderComparisonStatusBadge(row)}</td>
          <td>${escapeHtml(String(row.rowCount))}</td>
          <td>${escapeHtml(row.sheetLabel || "-")}</td>
        </tr>
      `
    )
    .join("");
}

export function renderAll(elements, stateRef, bridge, getActiveProjectTitle) {
  renderProjectIndicator(elements, stateRef, bridge, getActiveProjectTitle);
  renderProjectOptions(elements, stateRef);
  renderSummary(elements, stateRef, getActiveProjectTitle);
  renderMonthTabs(elements, stateRef);
  renderFilters(elements, stateRef);
  renderRows(elements, stateRef);
  renderInvoiceComparison(elements, stateRef);
  renderLookupRows(elements, stateRef);
  renderRecordDraft(elements, stateRef);
}
