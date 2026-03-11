import {
  escapeHtml,
  flattenRows,
  formatTimestamp,
  getActiveSheet,
  normalizeContainerNumber,
} from "./renderer-model.js";

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

  elements.summaryProjectTitle.textContent = getActiveProjectTitle();
  elements.summaryProjectSync.textContent = stateRef.dirty
    ? "Oczekuje na zapis"
    : stateRef.currentProjectSummary?.updatedAt
      ? formatTimestamp(stateRef.currentProjectSummary.updatedAt)
      : "Nowy projekt";
  elements.summarySourceFile.textContent = stateRef.state.sourceFileName || "-";
  elements.summaryActiveMonth.textContent = activeSheet?.name || "-";
  elements.summaryMonthCount.textContent = String(stateRef.state.sheets.length);
  elements.summaryRowCount.textContent = String(rows.length);
  elements.summaryFilledCount.textContent = String(filledCount);
  elements.summaryPendingCount.textContent = String(pendingCount);
  elements.summaryManualCount.textContent = String(manualCount);
  elements.summaryDbPath.textContent = stateRef.state.dbPath || "-";
  elements.summaryDbStatus.textContent = stateRef.state.dbPath ? "Aktywna" : "Domyslna";
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

export function renderRows(elements, stateRef) {
  const activeSheet = getActiveSheet(stateRef.state);
  const search = normalizeContainerNumber(stateRef.projectSearchTerm);
  if (!activeSheet) {
    elements.projectRows.innerHTML = `
      <tr>
        <td colspan="13">Brak miesiecy. Zaimportuj rejestr IMTREKS lub dodaj wiersz recznie.</td>
      </tr>
    `;
    return;
  }

  if (activeSheet.rows.length === 0) {
    elements.projectRows.innerHTML = `
      <tr>
        <td colspan="13">Brak wierszy w miesiacu ${escapeHtml(activeSheet.name)}.</td>
      </tr>
    `;
    return;
  }

  const rows = search
    ? activeSheet.rows.filter((row) =>
        normalizeContainerNumber(row.containerNumber).includes(search)
      )
    : activeSheet.rows;

  if (rows.length === 0) {
    elements.projectRows.innerHTML = `
      <tr>
        <td colspan="13">Brak wynikow dla kontenera ${escapeHtml(stateRef.projectSearchTerm)}.</td>
      </tr>
    `;
    return;
  }

  elements.projectRows.innerHTML = rows
    .map(
      (row) => `
        <tr data-row-id="${escapeHtml(row.id)}">
          <td class="row-index"><input type="text" data-field="sequenceNumber" value="${escapeHtml(row.sequenceNumber)}" /></td>
          <td><input type="text" data-field="orderDate" value="${escapeHtml(row.orderDate)}" /></td>
          <td><input type="text" data-field="folderName" value="${escapeHtml(row.folderName)}" /></td>
          <td><input type="text" data-field="containerNumber" value="${escapeHtml(row.containerNumber)}" /></td>
          <td><input type="text" data-field="blNumber" value="${escapeHtml(row.blNumber)}" /></td>
          <td><input type="text" data-field="customsOffice" value="${escapeHtml(row.customsOffice)}" /></td>
          <td><input type="text" data-field="status" value="${escapeHtml(row.status)}" /></td>
          <td><input type="text" data-field="stop" value="${escapeHtml(row.stop)}" /></td>
          <td><input type="text" data-field="t1" value="${escapeHtml(row.t1)}" /></td>
          <td><input type="text" data-field="invoiceInfo" value="${escapeHtml(row.invoiceInfo)}" /></td>
          <td><input type="text" data-field="remarks" value="${escapeHtml(row.remarks)}" /></td>
          <td>${escapeHtml(row.sourceRowNumber || row.origin || "-")}</td>
          <td class="cell-actions">
            <button type="button" data-action="delete-row" data-row-id="${escapeHtml(row.id)}">Usun</button>
          </td>
        </tr>
      `
    )
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
  renderRows(elements, stateRef);
  renderLookupRows(elements, stateRef);
  renderRecordDraft(elements, stateRef);
}
