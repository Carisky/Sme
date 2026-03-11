import {
  escapeHtml,
  flattenRows,
  formatTimestamp,
  getActiveSheet,
  getActiveSheetFilterOptions,
  getFilteredRows,
  matchesRowFilters,
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

function renderEditableCell(field, value, updatedFields, extraClass = "") {
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
  )}" class="${classes.join(" ")}"${isUpdated ? ' title="Uzupelnione podczas ostatniej aktualizacji"' : ""} />`;
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
  const rows = flattenRows(stateRef.state);
  const activeSheet = getActiveSheet(stateRef.state);
  const filledCount = rows.filter((row) => row.t1).length;
  const pendingCount = rows.filter((row) => row.containerNumber && !row.t1).length;
  const manualCount = rows.filter((row) => row.origin === "manual").length;
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
  elements.summaryRowCountInline.textContent = `${rows.length} wierszy`;
  elements.summarySourceFile.textContent = stateRef.state.sourceFileName || "-";
  elements.summaryActiveMonth.textContent = activeSheet?.name || "-";
  elements.summaryMonthCount.textContent = String(stateRef.state.sheets.length);
  elements.summaryRowCount.textContent = String(rows.length);
  elements.summaryFilledCount.textContent = String(filledCount);
  elements.summaryPendingCount.textContent = String(pendingCount);
  elements.summaryManualCount.textContent = String(manualCount);
  elements.summaryDbPath.textContent = stateRef.state.dbPath || "-";
  elements.summaryDbStatus.textContent = dbStatusLabel;
  elements.summaryDbStatusInline.textContent = dbStatusLabel;
  elements.summaryManualCountInline.textContent = `${manualCount} recznych`;
  elements.activeMonthLabel.textContent = activeSheet?.name || "Brak miesiecy";
  elements.dbPath.value = stateRef.state.dbPath;

  if (document.activeElement !== elements.projectName) {
    elements.projectName.value = stateRef.projectNameDraft;
  }
}

export function renderMonthTabs(elements, stateRef) {
  if (!stateRef.state.sheets.length) {
    elements.monthTabs.innerHTML = `<div class="month-tabs__empty">Zaimportuj Excel, aby utworzyc miesiace projektu.</div>`;
    return;
  }

  elements.monthTabs.innerHTML = stateRef.state.sheets
    .map(
      (sheet) => `
        <button
          type="button"
          class="month-tab${sheet.id === stateRef.state.activeSheetId ? " is-active" : ""}"
          data-month-id="${escapeHtml(sheet.id)}"
        >
          ${escapeHtml(sheet.name)} (${sheet.rows.length})
        </button>
      `
    )
    .join("");
}

export function renderFilters(elements, stateRef) {
  const filterOptions = getActiveSheetFilterOptions(stateRef.state);
  const vesselDateOptionValues = new Set(
    filterOptions.vesselDateOptions.map((option) => option.value)
  );
  const selectedVesselDates = stateRef.vesselDateSelectedFilter.filter((value) =>
    vesselDateOptionValues.has(value)
  );
  const statusOptions = filterOptions.statuses
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}"${value === stateRef.statusFilter ? " selected" : ""}>${escapeHtml(value)}</option>`
    )
    .join("");
  const vesselDateCheckboxes = filterOptions.vesselDateOptions.length
    ? filterOptions.vesselDateOptions
        .map(
          (option) => `
            <label class="filter-checkbox">
              <input
                type="checkbox"
                data-vessel-date-value="${escapeHtml(option.value)}"
                ${selectedVesselDates.includes(option.value) ? "checked" : ""}
              />
              <span>${escapeHtml(option.label)}</span>
            </label>
          `
        )
        .join("")
    : `<div class="filter-multiselect__empty">Brak dat statku na aktywnej zakladce.</div>`;

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
  elements.filterVesselDateOptions.innerHTML = `
    <div class="filter-multiselect__actions">
      <button type="button" class="button--minimal filter-multiselect__button" data-date-selection="all">
        Wszystkie
      </button>
      <button type="button" class="button--minimal filter-multiselect__button" data-date-selection="clear">
        Wyczysc
      </button>
    </div>
    <div class="filter-multiselect__list">${vesselDateCheckboxes}</div>
  `;
  elements.filterHasT1.innerHTML = `
    <option value="all">T1: wszystko</option>
    <option value="with"${stateRef.hasT1Filter === "with" ? " selected" : ""}>Tylko z T1</option>
    <option value="without"${stateRef.hasT1Filter === "without" ? " selected" : ""}>Tylko bez T1</option>
  `;
  elements.filterStatus.innerHTML = `
    <option value="">Status: wszystkie</option>
    ${statusOptions}
  `;
}

export function renderRows(elements, stateRef) {
  const activeSheet = getActiveSheet(stateRef.state);
  if (!activeSheet) {
    elements.projectRows.innerHTML = `
      <tr>
        <td colspan="14">Brak miesiecy. Zaimportuj rejestr IMTREKS lub dodaj wiersz recznie.</td>
      </tr>
    `;
    return;
  }

  if (activeSheet.rows.length === 0) {
    elements.projectRows.innerHTML = `
      <tr>
        <td colspan="14">Brak wierszy w miesiacu ${escapeHtml(activeSheet.name)}.</td>
      </tr>
    `;
    return;
  }

  const rows = getFilteredRows(stateRef.state, {
    searchTerm: stateRef.projectSearchTerm,
    vesselDateMode: stateRef.vesselDateModeFilter,
    vesselDateFrom: stateRef.vesselDateFromFilter,
    vesselDateTo: stateRef.vesselDateToFilter,
    vesselDateSelected: stateRef.vesselDateSelectedFilter,
    hasT1: stateRef.hasT1Filter,
    status: stateRef.statusFilter,
    includeRowIds: Array.from(stateRef.stickyVisibleRowIds || []),
  });
  const baseFilters = {
    searchTerm: stateRef.projectSearchTerm,
    vesselDateMode: stateRef.vesselDateModeFilter,
    vesselDateFrom: stateRef.vesselDateFromFilter,
    vesselDateTo: stateRef.vesselDateToFilter,
    vesselDateSelected: stateRef.vesselDateSelectedFilter,
    hasT1: stateRef.hasT1Filter,
    status: stateRef.statusFilter,
  };

  if (rows.length === 0) {
    elements.projectRows.innerHTML = `
      <tr>
        <td colspan="14">Brak wynikow dla aktywnej zakladki i ustawionych filtrow.</td>
      </tr>
    `;
    return;
  }

  elements.projectRows.innerHTML = rows
    .map((row) => {
      const updatedFields = stateRef.rowHighlights.get(row.id) || new Set();
      const isStickyRow =
        stateRef.stickyVisibleRowIds?.has(row.id) && !matchesRowFilters(row, baseFilters);
      const rowClasses = [
        updatedFields.size ? "row--updated" : "",
        isStickyRow ? "row--sticky-visible" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const sourceText = row.sourceRowNumber || row.origin || "-";

      return `
        <tr data-row-id="${escapeHtml(row.id)}" class="${escapeHtml(rowClasses)}">
          <td class="row-index">${renderEditableCell("sequenceNumber", row.sequenceNumber, updatedFields)}</td>
          <td>${renderEditableCell("orderDate", row.orderDate, updatedFields)}</td>
          <td>${renderEditableCell("vesselDate", row.vesselDate, updatedFields)}</td>
          <td>${renderEditableCell("folderName", row.folderName, updatedFields)}</td>
          <td>${renderEditableCell("containerNumber", row.containerNumber, updatedFields)}</td>
          <td>${renderEditableCell("blNumber", row.blNumber, updatedFields)}</td>
          <td>${renderEditableCell("customsOffice", row.customsOffice, updatedFields)}</td>
          <td>${renderEditableCell("status", row.status, updatedFields)}</td>
          <td>${renderEditableCell("stop", row.stop, updatedFields)}</td>
          <td>${renderEditableCell("t1", row.t1, updatedFields)}</td>
          <td>${renderEditableCell("invoiceInfo", row.invoiceInfo, updatedFields)}</td>
          <td>${renderEditableCell("remarks", row.remarks, updatedFields)}</td>
          <td>
            ${escapeHtml(sourceText)}
            ${isStickyRow ? '<span class="row-tag" title="Wiersz zostal pokazany po aktualizacji mimo filtra.">po aktualizacji</span>' : ""}
          </td>
          <td class="cell-actions">
            <button type="button" data-action="delete-row" data-row-id="${escapeHtml(row.id)}">Usun</button>
          </td>
        </tr>
      `;
    })
    .join("");
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

export function renderAll(elements, stateRef, bridge, getActiveProjectTitle) {
  renderProjectIndicator(elements, stateRef, bridge, getActiveProjectTitle);
  renderProjectOptions(elements, stateRef);
  renderSummary(elements, stateRef, getActiveProjectTitle);
  renderMonthTabs(elements, stateRef);
  renderFilters(elements, stateRef);
  renderRows(elements, stateRef);
  renderLookupRows(elements, stateRef);
  renderRecordDraft(elements, stateRef);
}
