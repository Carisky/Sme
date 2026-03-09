import { bridge } from "./bridge.js";
import { elements } from "./dom.js";
import { paginatePrintLayout } from "./print-layout.js";
import {
  basename,
  escapeHtml,
  formatDateForControlValue,
  getValueAtPath,
  nextFrame,
  waitForImages,
} from "./utils.js";

export function createRenderers({ store, extensions }) {
  const stateRef = store.state;

  function schedulePrintPreviewLayout() {
    const layoutVersion = (stateRef.printLayoutVersion || 0) + 1;
    stateRef.printLayoutVersion = layoutVersion;

    stateRef.pendingPrintLayout = (async () => {
      paginatePrintLayout(elements.printRoot);
      await nextFrame();
      await waitForImages(elements.printRoot);
      await nextFrame();

      if (stateRef.printLayoutVersion !== layoutVersion) {
        return;
      }

      paginatePrintLayout(elements.printRoot);
      await nextFrame();
      await waitForImages(elements.printRoot);
      await nextFrame();

      if (stateRef.printLayoutVersion !== layoutVersion) {
        return;
      }

      paginatePrintLayout(elements.printRoot);
    })().catch((error) => {
      if (stateRef.printLayoutVersion === layoutVersion) {
        console.error("Print preview pagination failed:", error);
      }
    });
  }

  function getPrintPageCount() {
    return elements.printRoot.querySelectorAll(".document__page").length;
  }

  function setActiveTab(tabName) {
    stateRef.activeTab = tabName;
    if (tabName !== "wydruk") {
      stateRef.lastWorkTab = tabName;
    }

    document.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tab === tabName);
    });

    document.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.panel === tabName);
    });
  }

  function showStatus(message) {
    elements.statusText.textContent = message;
  }

  function renderProjectIndicator() {
    const suffix = stateRef.dirty ? " * niezapisane zmiany" : "";

    if (stateRef.currentProjectPath) {
      elements.projectIndicator.textContent = `${stateRef.currentProjectPath}${suffix}`;
    } else {
      elements.projectIndicator.textContent = `Projekt w pamieci${suffix}`;
    }

    const titleBase = stateRef.currentProjectPath
      ? basename(stateRef.currentProjectPath)
      : "SME";
    bridge.setWindowTitle(`${titleBase}${stateRef.dirty ? " *" : ""}`);
  }

  function setPrintStatusModalBusy(isBusy) {
    elements.printStatusClose.disabled = isBusy;
  }

  function setPrintProgress(printedPages, totalPages) {
    const normalizedTotal = Math.max(Number(totalPages) || 0, 0);
    const normalizedPrinted = Math.max(Number(printedPages) || 0, 0);
    const cappedPrinted =
      normalizedTotal > 0 ? Math.min(normalizedPrinted, normalizedTotal) : normalizedPrinted;

    elements.printStatusPages.textContent =
      normalizedTotal > 0 ? `${cappedPrinted} / ${normalizedTotal}` : `${cappedPrinted}`;
    elements.printStatusProgressFill.style.width =
      normalizedTotal > 0
        ? `${Math.max(6, Math.round((cappedPrinted / normalizedTotal) * 100))}%`
        : "8%";
  }

  function isUpdateLocked() {
    return Boolean(stateRef.updateGate?.locked);
  }

  function setUpdateProgress(percent = 0, text = "Oczekiwanie") {
    const normalizedPercent = Math.max(0, Math.min(Number(percent) || 0, 100));
    elements.updateProgressFill.style.width = `${Math.max(8, normalizedPercent)}%`;
    elements.updateProgressText.textContent = text;
  }

  function setUpdateGateBusy(isBusy) {
    stateRef.updateGate.busy = Boolean(isBusy);
    elements.updateRetry.disabled = stateRef.updateGate.busy;
    elements.updateInstall.disabled = stateRef.updateGate.busy;
  }

  function applyUpdateGate(updateGate = {}) {
    stateRef.updateGate = {
      locked: Boolean(updateGate.locked),
      busy: false,
      status: updateGate.status || "idle",
      localVersion: updateGate.localVersion || "",
      remoteVersion: updateGate.remoteVersion || "",
      message: updateGate.message || "",
      detail: updateGate.detail || "",
      allowInstall: Boolean(updateGate.allowInstall),
      allowRetry: Boolean(updateGate.allowRetry),
      manifest: updateGate.manifest || null,
    };

    document.body.classList.toggle("is-update-locked", stateRef.updateGate.locked);
    elements.updateModal.hidden = !stateRef.updateGate.locked;

    if (!stateRef.updateGate.locked) {
      setUpdateGateBusy(false);
      setUpdateProgress(0, "Brak aktywnej aktualizacji.");
      return;
    }

    const isIntegrityProblem =
      stateRef.updateGate.status === "integrity-mismatch" ||
      stateRef.updateGate.status === "verification-persist-failed";
    const isConnectivityProblem = stateRef.updateGate.status === "server-unavailable";

    elements.updateTitle.textContent = isConnectivityProblem
      ? "Brak potwierdzenia wersji"
      : isIntegrityProblem
        ? "Wymagana ponowna instalacja"
        : "Wymagana aktualizacja";
    elements.updateSummary.textContent =
      stateRef.updateGate.message || "Ta wersja aplikacji wymaga aktualizacji.";
    elements.updateCurrentVersion.textContent = stateRef.updateGate.localVersion || "-";
    elements.updateRemoteVersion.textContent = stateRef.updateGate.remoteVersion || "-";
    elements.updateDetail.textContent =
      stateRef.updateGate.detail ||
      (stateRef.updateGate.allowInstall
        ? "Kliknij Zaktualizuj, aby pobrac nowy instalator."
        : "Kliknij Sprobuj ponownie, aby odswiezyc stan release.");
    elements.updateRetry.hidden = !stateRef.updateGate.allowRetry;
    elements.updateInstall.hidden = !stateRef.updateGate.allowInstall;
    elements.updateInstall.textContent = isIntegrityProblem
      ? "Zainstaluj ponownie"
      : "Zaktualizuj";
    setUpdateGateBusy(false);
    setUpdateProgress(
      0,
      stateRef.updateGate.allowInstall
        ? "Gotowe do pobrania aktualizacji."
        : "Oczekiwanie na ponowna probe."
    );
  }

  function handleUpdateStatusEvent(payload = {}) {
    if (elements.updateModal.hidden) {
      return;
    }

    if (payload.phase === "checking") {
      setUpdateGateBusy(true);
      elements.updateSummary.textContent = "Sprawdzanie release";
      elements.updateDetail.textContent =
        payload.message || "Trwa pobieranie manifestu aktualizacji.";
      setUpdateProgress(8, "Sprawdzanie...");
      return;
    }

    if (payload.phase === "downloading") {
      setUpdateGateBusy(true);
      elements.updateSummary.textContent = "Pobieranie aktualizacji";
      elements.updateDetail.textContent = payload.message || "Trwa pobieranie instalatora.";
      const percent = Number(payload.percent) || 0;
      setUpdateProgress(
        percent,
        payload.totalBytes ? `${percent}%` : `Pobrano ${Number(payload.receivedBytes) || 0} B`
      );
      return;
    }

    if (payload.phase === "verifying") {
      setUpdateGateBusy(true);
      elements.updateSummary.textContent = "Weryfikacja instalatora";
      elements.updateDetail.textContent =
        payload.message || "Trwa sprawdzanie hash pobranego pliku.";
      setUpdateProgress(100, "Weryfikacja...");
      return;
    }

    if (payload.phase === "launching") {
      setUpdateGateBusy(true);
      elements.updateSummary.textContent = "Uruchamianie instalatora";
      elements.updateDetail.textContent =
        payload.message || "Aplikacja uruchamia nowy instalator.";
      setUpdateProgress(100, "Uruchamianie...");
    }
  }

  function openPrintStatusModal(pageCount) {
    stateRef.isPrinting = true;
    elements.printStatusModal.hidden = false;
    elements.printStatusPrinter.textContent = "domyslna systemowa";
    elements.printStatusSummary.textContent = "Przygotowywanie dokumentu do druku";
    elements.printStatusDetail.textContent = "Budowanie podgladu i przygotowanie zadania.";
    setPrintProgress(0, pageCount);
    setPrintStatusModalBusy(true);
  }

  function closePrintStatusModal() {
    if (!stateRef.isPrinting && !elements.printStatusClose.disabled) {
      elements.printStatusModal.hidden = true;
    }
  }

  function updatePrintStatusModalAfterPrepare(pageCount) {
    elements.printStatusSummary.textContent = "Dokument gotowy, rozpoczynam drukowanie";
    elements.printStatusDetail.textContent =
      `Przygotowano ${pageCount} stron i rozpoczeto wysylanie do drukarki.`;
    setPrintProgress(0, pageCount);
  }

  function updatePrintStatusModalSuccess(result, pageCount) {
    const modeLabel = result.colorMode === "grayscale" ? "czarno-bialy" : "kolor";
    const printedPages = Number(result.printedPages) || pageCount;
    const totalPages = Number(result.totalPages) || pageCount;
    elements.printStatusPrinter.textContent = result.printerName || "domyslna systemowa";
    elements.printStatusSummary.textContent = "Gotowe";
    elements.printStatusDetail.textContent = `Wydrukowano ${printedPages} z ${totalPages} stron na ${result.printerName || "drukarce domyslnej"} (${modeLabel}).`;
    setPrintProgress(printedPages, totalPages);

    if (result.pdfError) {
      elements.printStatusSummary.textContent =
        "Wydruk wyslany, ale zapis PDF zakonczyl sie bledem.";
      elements.printStatusDetail.textContent = result.pdfError;
    } else if (result.pdfPath) {
      elements.printStatusDetail.textContent = `Wydrukowano ${printedPages} z ${totalPages} stron, PDF zapisano jako ${basename(
        result.pdfPath
      )}.`;
    }

    stateRef.isPrinting = false;
    setPrintStatusModalBusy(false);
  }

  function updatePrintStatusModalError(error) {
    elements.printStatusSummary.textContent = "Nie udalo sie uruchomic drukowania.";
    elements.printStatusDetail.textContent = error.message;
    stateRef.isPrinting = false;
    setPrintStatusModalBusy(false);
  }

  function handlePrintStatusEvent(payload = {}) {
    if (elements.printStatusModal.hidden) {
      return;
    }

    if (payload.printerName) {
      elements.printStatusPrinter.textContent = payload.printerName;
    }

    const totalPages = Number(payload.totalPages) || getPrintPageCount() || 0;
    const printedPages = Number(payload.printedPages) || 0;

    if (payload.phase === "spooling") {
      elements.printStatusSummary.textContent = "Wysylanie dokumentu do drukarki";
      elements.printStatusDetail.textContent =
        payload.message || "Trwa przekazywanie zadania do kolejki drukarki.";
      setPrintProgress(printedPages, totalPages);
      return;
    }

    if (payload.phase === "printing") {
      elements.printStatusSummary.textContent = "Dokument jest drukowany";
      elements.printStatusDetail.textContent =
        payload.message || `Wydrukowano ${printedPages} z ${totalPages} stron.`;
      setPrintProgress(printedPages, totalPages);
      return;
    }

    if (payload.phase === "pdf") {
      elements.printStatusSummary.textContent = "Zapis PDF po wydruku";
      elements.printStatusDetail.textContent =
        payload.message || "Trwa zapisywanie kopii PDF.";
      setPrintProgress(totalPages || printedPages, totalPages || printedPages);
    }
  }

  async function waitForPrintPreviewReady() {
    if (stateRef.pendingPrintLayout) {
      await stateRef.pendingPrintLayout;
      return;
    }

    await nextFrame();
    await waitForImages(elements.printRoot);
    await nextFrame();
  }

  function ensureCustomsOfficeSelection() {
    if (!stateRef.customsOffices.length || !stateRef.state) {
      return;
    }

    const hasSelectedCode = stateRef.customsOffices.some(
      (office) => office.code === stateRef.state.customsOfficeCode
    );
    if (!hasSelectedCode) {
      stateRef.state.customsOfficeCode = stateRef.customsOffices[0].code;
    }

    const hasDraft = stateRef.customsOffices.some(
      (office) => office.id === stateRef.officeDraftId
    );
    if (!hasDraft) {
      stateRef.officeDraftId = stateRef.customsOffices[0].id;
    }
  }

  function ensureOreKindSelection() {
    if (!stateRef.oreKinds.length || !stateRef.state) {
      return;
    }

    const selectedOreKind =
      stateRef.oreKinds.find((item) => item.name === stateRef.state.oreKind) ||
      stateRef.oreKinds[0];

    if (!stateRef.state.oreKind) {
      stateRef.state.oreKind = selectedOreKind.name;
      if (selectedOreKind?.defaultOreType) {
        stateRef.state.oreType = selectedOreKind.defaultOreType;
      }
    }

    if (
      (!stateRef.state.oreType || !bridge.meta.oreTypes.includes(stateRef.state.oreType)) &&
      selectedOreKind?.defaultOreType
    ) {
      stateRef.state.oreType = selectedOreKind.defaultOreType;
    }
  }

  function ensureOriginCountrySelection() {
    if (!stateRef.originCountries.length || !stateRef.state) {
      return;
    }

    const hasSelectedCountry = stateRef.originCountries.some(
      (country) => country.name === stateRef.state.originCountry
    );
    if (!hasSelectedCountry && !stateRef.state.originCountry) {
      stateRef.state.originCountry = stateRef.originCountries[0].name;
    }

    const hasDraft = stateRef.originCountries.some(
      (country) => country.id === stateRef.originCountryDraftId
    );
    if (!hasDraft) {
      stateRef.originCountryDraftId = stateRef.originCountries[0].id;
    }
  }

  function buildSelectOptions() {
    elements.documentType.innerHTML = bridge.meta.documentTypes
      .map(
        (value) =>
          `<option value="${escapeHtml(value)}">${escapeHtml(value || "-")}</option>`
      )
      .join("");

    elements.oreType.innerHTML = bridge.meta.oreTypes
      .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
      .join("");

    renderOreKindOptions();
    renderCustomsOfficeOptions();
    renderOriginCountryOptions();
  }

  function getOreKindOptions(currentValue = "") {
    const options = stateRef.oreKinds.map((item) => item.name);
    if (currentValue && !options.includes(currentValue)) {
      options.push(currentValue);
    }

    return options;
  }

  function renderOreKindOptions(currentValue = stateRef.state?.oreKind || "") {
    const options = getOreKindOptions(currentValue);
    const fallbackValue = options[0] || "";
    const normalizedValue = options.includes(currentValue) ? currentValue : fallbackValue;

    elements.oreKind.innerHTML = options
      .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
      .join("");
    elements.oreKind.value = normalizedValue;
  }

  function renderCustomsOfficeOptions() {
    const currentCode = stateRef.state?.customsOfficeCode || "";

    elements.customsOffice.innerHTML = stateRef.customsOffices
      .map(
        (office) =>
          `<option value="${escapeHtml(office.code)}">${escapeHtml(
            `${office.code} - ${office.name}`
          )}</option>`
      )
      .join("");

    elements.settingsCustomsOffice.innerHTML = [
      '<option value="">Nowy urzad...</option>',
      ...stateRef.customsOffices.map(
        (office) =>
          `<option value="${office.id}">${escapeHtml(`${office.code} - ${office.name}`)}</option>`
      ),
    ].join("");

    if (elements.customsOffice.options.length > 0) {
      const normalizedCode =
        currentCode && stateRef.customsOffices.some((office) => office.code === currentCode)
          ? currentCode
          : stateRef.customsOffices[0].code;

      if (stateRef.state) {
        stateRef.state.customsOfficeCode = normalizedCode;
      }

      elements.customsOffice.value = normalizedCode;
    } else {
      elements.customsOffice.innerHTML = '<option value=""></option>';
      elements.customsOffice.value = "";
    }

    renderCustomsOfficeEditor();
  }

  function renderCustomsOfficeEditor(targetId = stateRef.officeDraftId) {
    const office =
      stateRef.customsOffices.find((item) => item.id === Number(targetId)) || null;

    stateRef.officeDraftId = office?.id ?? null;
    elements.settingsCustomsOffice.value = office ? String(office.id) : "";
    elements.settingsOfficeCode.value = office?.code || "";
    elements.settingsOfficeName.value = office?.name || "";
    elements.settingsOfficeAddress1.value = office?.addressLine1 || "";
    elements.settingsOfficeAddress2.value = office?.addressLine2 || "";
  }

  function getOriginCountryOptions(currentValue = "") {
    const options = stateRef.originCountries.map((item) => item.name);
    if (currentValue && !options.includes(currentValue)) {
      options.push(currentValue);
    }

    return options;
  }

  function renderOriginCountryOptions(currentValue = stateRef.state?.originCountry || "") {
    const options = getOriginCountryOptions(currentValue);
    const fallbackValue = options[0] || "";
    const normalizedValue = options.includes(currentValue) ? currentValue : fallbackValue;

    elements.originCountry.innerHTML = options
      .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
      .join("");
    elements.originCountry.value = normalizedValue;

    elements.settingsOriginCountry.innerHTML = [
      '<option value="">Nowy kraj...</option>',
      ...stateRef.originCountries.map(
        (country) => `<option value="${country.id}">${escapeHtml(country.name)}</option>`
      ),
    ].join("");

    if (stateRef.state) {
      stateRef.state.originCountry = normalizedValue;
    }

    renderOriginCountryEditor();
  }

  function renderOriginCountryEditor(targetId = stateRef.originCountryDraftId) {
    const country =
      stateRef.originCountries.find((item) => item.id === Number(targetId)) || null;

    stateRef.originCountryDraftId = country?.id ?? null;
    elements.settingsOriginCountry.value = country ? String(country.id) : "";
    elements.settingsOriginCountryName.value = country?.name || "";
  }

  function renderPrintSettingsControls() {
    const isEnabled = Boolean(stateRef.state?.print?.savePdfAfterPrint);
    elements.settingsPdfOutputDir.disabled = !isEnabled;
    elements.settingsPdfOutputDirButton.disabled = !isEnabled;
  }

  function buildTables() {
    elements.originalTableBody.innerHTML = Array.from(
      { length: bridge.meta.maxLines },
      (_, index) => `
        <tr data-row="${index}">
          <td>${index + 1}</td>
          <td><input type="text" data-path="originalRows.${index}.invoiceNumber" /></td>
          <td><input type="text" inputmode="decimal" data-path="originalRows.${index}.weightTons" /></td>
          <td><input type="text" inputmode="decimal" data-path="originalRows.${index}.priceEur" /></td>
          <td><input type="text" inputmode="decimal" data-path="originalRows.${index}.valueEur" /></td>
        </tr>
      `
    ).join("");

    elements.correctionTableBody.innerHTML = Array.from(
      { length: bridge.meta.maxLines },
      (_, index) => `
        <tr data-row="${index}">
          <td>${index + 1}</td>
          <td><input type="text" data-path="correctionRows.${index}.invoiceNumber" /></td>
          <td><input type="text" inputmode="decimal" data-path="correctionRows.${index}.weightTons" /></td>
          <td><input type="text" inputmode="decimal" data-path="correctionRows.${index}.priceEur" /></td>
          <td class="cell--computed" data-output="row.${index}.correction.valueDisplay"></td>
          <td><input type="text" data-path="correctionRows.${index}.noteNumber" /></td>
          <td><input type="date" data-path="correctionRows.${index}.noteDate" /></td>
        </tr>
      `
    ).join("");
  }

  function populateInputs() {
    document.querySelectorAll("[data-path]").forEach((input) => {
      const value = getValueAtPath(stateRef.state, input.dataset.path);
      if (input instanceof HTMLInputElement && input.type === "checkbox") {
        input.checked = Boolean(value);
        return;
      }

      if (input instanceof HTMLInputElement && input.type === "date") {
        input.value = formatDateForControlValue(input.dataset.path, value);
        return;
      }

      input.value = value ?? "";
    });
    renderPrintSettingsControls();
  }

  function applyCorrectionPlaceholders() {
    stateRef.snapshot.rows.forEach((row, index) => {
      const invoiceInput = document.querySelector(
        `[data-path="correctionRows.${index}.invoiceNumber"]`
      );
      const weightInput = document.querySelector(
        `[data-path="correctionRows.${index}.weightTons"]`
      );
      const priceInput = document.querySelector(
        `[data-path="correctionRows.${index}.priceEur"]`
      );

      invoiceInput.placeholder = row.original.invoiceNumber || "";
      weightInput.placeholder = row.original.weightTons || "";
      priceInput.placeholder = row.original.priceEur || "";
    });
  }

  function renderOutputs() {
    const snapshot = stateRef.snapshot;
    elements.documentNumberLabel.textContent = snapshot.meta.documentNumberLabel;

    const outputMap = {
      "meta.sourceFileName": snapshot.meta.sourceFileName,
      "meta.noteCount": `${snapshot.meta.noteCount} korekt`,
      "meta.cnCode": snapshot.meta.cnCode,
      "totals.originalEur": snapshot.totals.formatted.originalEur,
      "totals.correctedEurExact": snapshot.totals.formatted.correctedEurExact,
      "totals.eurRate": snapshot.totals.formatted.eurRate,
      "totals.originalPlnExact": snapshot.totals.formatted.originalPlnExact,
      "totals.correctedPlnExact": snapshot.totals.formatted.correctedPlnExact,
      "totals.transportRoundedOne": snapshot.totals.formatted.transportRoundedOne,
      "totals.transportRoundedZero": snapshot.totals.formatted.transportRoundedZero,
    };

    document.querySelectorAll("[data-output]").forEach((node) => {
      const key = node.dataset.output;

      if (key.startsWith("row.")) {
        const [, rowIndex, , field] = key.split(".");
        node.textContent = snapshot.rows[Number(rowIndex)].correction[field] || "";
        return;
      }

      node.textContent = outputMap[key] ?? "";
    });

    elements.hintList.innerHTML = snapshot.hints
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");

    elements.validationList.innerHTML =
      snapshot.validation.errors.length > 0
        ? snapshot.validation.errors.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
        : "<li>Brak bledow walidacji.</li>";

    document.querySelectorAll("#correction-table-body tr").forEach((rowNode, index) => {
      const correction = snapshot.rows[index].correction;
      rowNode.classList.toggle("row--active", correction.isActive);
      rowNode.classList.toggle("row--invalid", correction.isIncomplete);
    });

    applyCorrectionPlaceholders();

    try {
      const printRenderer = extensions.getPrintRenderer();
      if (!printRenderer) {
        throw new Error("No print renderer registered.");
      }

      elements.printRoot.innerHTML = printRenderer(snapshot, {
        customsOffices: stateRef.customsOffices,
      });
      schedulePrintPreviewLayout();
    } catch (error) {
      console.error("Print preview render failed:", error);
      stateRef.pendingPrintLayout = null;
      elements.printRoot.innerHTML = `
        <div class="document document--error">
          <p class="document__paragraph">Nie udalo sie zbudowac podgladu wydruku.</p>
          <p class="document__paragraph">${escapeHtml(error.message)}</p>
        </div>
      `;
      showStatus(`Blad podgladu wydruku: ${error.message}`);
    }

    renderProjectIndicator();
  }

  return {
    elements,
    applyUpdateGate,
    buildSelectOptions,
    buildTables,
    closePrintStatusModal,
    ensureCustomsOfficeSelection,
    ensureOreKindSelection,
    ensureOriginCountrySelection,
    getPrintPageCount,
    handlePrintStatusEvent,
    handleUpdateStatusEvent,
    isUpdateLocked,
    openPrintStatusModal,
    populateInputs,
    renderCustomsOfficeEditor,
    renderCustomsOfficeOptions,
    renderOreKindOptions,
    renderOriginCountryEditor,
    renderOriginCountryOptions,
    renderOutputs,
    renderPrintSettingsControls,
    renderProjectIndicator,
    setActiveTab,
    setUpdateGateBusy,
    showStatus,
    updatePrintStatusModalAfterPrepare,
    updatePrintStatusModalError,
    updatePrintStatusModalSuccess,
    waitForPrintPreviewReady,
  };
}
