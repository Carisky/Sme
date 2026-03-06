const { bridge } = window;

const stateRef = {
  state: null,
  snapshot: null,
  currentProjectPath: null,
  dirty: false,
  activeTab: "dane",
  lastWorkTab: "dane",
  oreKinds: [],
  customsOffices: [],
  officeDraftId: null,
  isPrinting: false,
};

const elements = {
  projectIndicator: document.getElementById("project-indicator"),
  statusText: document.getElementById("status-text"),
  originalTableBody: document.getElementById("original-table-body"),
  correctionTableBody: document.getElementById("correction-table-body"),
  documentType: document.getElementById("document-type"),
  documentNumberLabel: document.getElementById("document-number-label"),
  oreKind: document.getElementById("ore-kind"),
  oreType: document.getElementById("ore-type"),
  customsOffice: document.getElementById("customs-office"),
  hintList: document.getElementById("hint-list"),
  validationList: document.getElementById("validation-list"),
  printRoot: document.getElementById("print-root"),
  settingsCustomsOffice: document.getElementById("settings-customs-office"),
  settingsOfficeCode: document.getElementById("settings-office-code"),
  settingsOfficeName: document.getElementById("settings-office-name"),
  settingsOfficeAddress1: document.getElementById("settings-office-address-1"),
  settingsOfficeAddress2: document.getElementById("settings-office-address-2"),
  settingsSavePdfAfterPrint: document.getElementById("settings-save-pdf-after-print"),
  settingsPdfOutputDir: document.getElementById("settings-pdf-output-dir"),
  settingsPdfOutputDirButton: document.getElementById("settings-pdf-output-dir-button"),
  printStatusModal: document.getElementById("print-status-modal"),
  printStatusClose: document.getElementById("print-status-close"),
  printStatusSummary: document.getElementById("print-status-summary"),
  printStatusPages: document.getElementById("print-status-pages"),
  printStatusPrinter: document.getElementById("print-status-printer"),
  printStatusDetail: document.getElementById("print-status-detail"),
  printStatusProgressFill: document.getElementById("print-status-progress-fill"),
};

function resolveAssetUrl(relativePath) {
  return new URL(relativePath, window.location.href).href;
}

const PRINT_ASSETS = {
  header: resolveAssetUrl("../samples/files/doc_header.png"),
  footer: resolveAssetUrl("../samples/files/doc_footer.png"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function basename(filePath) {
  if (!filePath) {
    return "";
  }

  return filePath.split(/[\\/]/).pop();
}

function getValueAtPath(object, path) {
  return path.split(".").reduce((current, key) => current?.[key], object);
}

function setValueAtPath(object, path, value) {
  const parts = path.split(".");
  const lastKey = parts.pop();
  let current = object;

  for (const key of parts) {
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }

  current[lastKey] = value;
}

function readControlValue(input) {
  if (input instanceof HTMLInputElement && input.type === "checkbox") {
    return input.checked;
  }

  return input.value;
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

function markDirty(value = true) {
  stateRef.dirty = value;
  renderProjectIndicator();
}

function showStatus(message) {
  elements.statusText.textContent = message;
}

function getPrintPageCount() {
  return elements.printRoot.querySelectorAll(".document__page").length;
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
    normalizedTotal > 0
      ? `${cappedPrinted} / ${normalizedTotal}`
      : `${cappedPrinted}`;
  elements.printStatusProgressFill.style.width =
    normalizedTotal > 0
      ? `${Math.max(6, Math.round((cappedPrinted / normalizedTotal) * 100))}%`
      : "8%";
}

function openPrintStatusModal(pageCount) {
  stateRef.isPrinting = true;
  elements.printStatusModal.hidden = false;
  elements.printStatusPrinter.textContent = "domyślna systemowa";
  elements.printStatusSummary.textContent = "Przygotowywanie dokumentu do druku";
  elements.printStatusDetail.textContent = "Budowanie podglądu i przygotowanie zadania.";
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
  elements.printStatusDetail.textContent = `Przygotowano ${pageCount} stron i rozpoczęto wysyłanie do drukarki.`;
  setPrintProgress(0, pageCount);
}

function updatePrintStatusModalSuccess(result, pageCount) {
  const modeLabel = result.colorMode === "grayscale" ? "czarno-biały" : "kolor";
  const printedPages = Number(result.printedPages) || pageCount;
  const totalPages = Number(result.totalPages) || pageCount;
  elements.printStatusPrinter.textContent = result.printerName || "domyślna systemowa";
  elements.printStatusSummary.textContent = "Gotowe";
  elements.printStatusDetail.textContent = `Wydrukowano ${printedPages} z ${totalPages} stron na ${result.printerName || "drukarce domyślnej"} (${modeLabel}).`;
  setPrintProgress(printedPages, totalPages);

  if (result.pdfError) {
    elements.printStatusSummary.textContent =
      "Wydruk wysłany, ale zapis PDF zakończył się błędem.";
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
  elements.printStatusSummary.textContent = "Nie udało się uruchomić drukowania.";
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
    elements.printStatusSummary.textContent = "Wysyłanie dokumentu do drukarki";
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
    return;
  }
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function waitForImages(container) {
  const images = Array.from(container.querySelectorAll("img"));
  if (images.length === 0) {
    return Promise.resolve();
  }

  return Promise.all(
    images.map(
      (image) =>
        new Promise((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }

          function settle() {
            image.removeEventListener("load", settle);
            image.removeEventListener("error", settle);
            resolve();
          }

          image.addEventListener("load", settle, { once: true });
          image.addEventListener("error", settle, { once: true });
        })
    )
  );
}

async function waitForPrintPreviewReady() {
  await nextFrame();
  await waitForImages(elements.printRoot);
  await nextFrame();
}

function renderProjectIndicator() {
  const suffix = stateRef.dirty ? " * niezapisane zmiany" : "";

  if (stateRef.currentProjectPath) {
    elements.projectIndicator.textContent = `${stateRef.currentProjectPath}${suffix}`;
  } else {
    elements.projectIndicator.textContent = `Projekt w pamięci${suffix}`;
  }

  const titleBase = stateRef.currentProjectPath
    ? basename(stateRef.currentProjectPath)
    : "SME Portable";
  bridge.setWindowTitle(`${titleBase}${stateRef.dirty ? " *" : ""}`);
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

function resolveCustomsOffice(state = stateRef.state) {
  const selectedOffice = stateRef.customsOffices.find(
    (office) => office.code === state?.customsOfficeCode
  );
  if (selectedOffice) {
    return selectedOffice;
  }

  return {
    code: state?.customsOfficeCode || "",
    name: state?.letter?.recipientOffice || "",
    addressLine1: state?.letter?.recipientAddressLine1 || "",
    addressLine2: state?.letter?.recipientAddressLine2 || "",
  };
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
  const normalizedValue = options.includes(currentValue) ? currentValue : "";

  elements.oreKind.innerHTML = [
    '<option value=""></option>',
    ...options.map(
      (value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
    ),
  ].join("");
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
    '<option value="">Nowy urząd...</option>',
    ...stateRef.customsOffices.map(
      (office) =>
        `<option value="${office.id}">${escapeHtml(
          `${office.code} - ${office.name}`
        )}</option>`
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
        <td><input type="text" data-path="correctionRows.${index}.noteDate" placeholder="dd-mm-rrrr" /></td>
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
      ? snapshot.validation.errors
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("")
      : "<li>Brak błędów walidacji.</li>";

  document.querySelectorAll("#correction-table-body tr").forEach((rowNode, index) => {
    const correction = snapshot.rows[index].correction;
    rowNode.classList.toggle("row--active", correction.isActive);
    rowNode.classList.toggle("row--invalid", correction.isIncomplete);
  });

  applyCorrectionPlaceholders();
  try {
    elements.printRoot.innerHTML = renderPrint(snapshot);
  } catch (error) {
    console.error("Print preview render failed:", error);
    elements.printRoot.innerHTML = `
      <div class="document document--error">
        <p class="document__paragraph">
          Nie udało się zbudować podglądu wydruku.
        </p>
        <p class="document__paragraph">
          ${escapeHtml(error.message)}
        </p>
      </div>
    `;
    showStatus(`Błąd podglądu wydruku: ${error.message}`);
  }
  renderProjectIndicator();
}

function renderPrint(snapshot) {
  const office = resolveCustomsOffice(snapshot.state);
  const paragraphs =
    snapshot.printParagraphs.length > 0
      ? snapshot.printParagraphs
          .map(
            (paragraph) => `
              <p class="document__paragraph">${escapeHtml(paragraph.noteLine)}</p>
              <p class="document__paragraph">${escapeHtml(paragraph.correctionLine)}</p>
            `
          )
          .join("")
      : `<p class="document__paragraph document__empty">Brak pozycji korekty z kompletem numeru i daty noty.</p>`;

  const attachmentItems = [
    snapshot.attachments.noteAttachmentLine,
    snapshot.attachments.invoiceLine,
    snapshot.attachments.copySadLine,
    snapshot.attachments.uniqueDocumentLine,
    snapshot.attachments.paymentConfirmationLine,
    snapshot.attachments.paymentDocumentsLine,
  ]
    .filter(Boolean)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");

  const firstPageContent = `
    <div class="document__header">
      <div class="document__case">${escapeHtml(snapshot.meta.caseNumber)}</div>
      <div class="document__place">
        <strong>${escapeHtml(snapshot.state.letter.printCity)}</strong><br />
        ${escapeHtml(snapshot.state.letter.printDate)}
      </div>
    </div>

    <div class="document__office-block">
      <strong>${escapeHtml(String(office.name || "").toUpperCase())}</strong>
      <div>${escapeHtml(office.addressLine1)}</div>
      <div>${escapeHtml(office.addressLine2)}</div>
    </div>

    <p class="document__subject">Sprawa: ${escapeHtml(snapshot.state.documentNumber)}</p>

    <p class="document__paragraph">
      Działając w imieniu i z upoważnienia ArcelorMittal Poland S.A. w dniu
      ${escapeHtml(snapshot.state.entryDate)} ${escapeHtml(snapshot.state.letter.senderCompany)}
    </p>
    <p class="document__paragraph">
      Działając jako przedstawiciel bezpośredni dokonała zgłoszenia w procedurze
      standardowej MRN
    </p>
    <p class="document__paragraph">
      ${escapeHtml(snapshot.state.documentNumber)} dla towaru - ruda żelaza
      ${escapeHtml(snapshot.state.oreType)} ${escapeHtml(snapshot.state.oreKind)}
    </p>
    <p class="document__paragraph">
      pochodzącego i przywiezionego z ${escapeHtml(
        snapshot.state.originCountry
      )} oraz zaklasyfikowanego do kodu CN${escapeHtml(snapshot.meta.cnCode)}.
    </p>

    ${paragraphs}

    <p class="document__paragraph">
      Na podstawie art. 173 ust. 3 Rozporządzenia Parlamentu Europejskiego i
      Rady (UE) nr 952/2013 z dn. 09.10.2013 r. ustanawiającego UKC z
      późniejszymi zmianami, proszę o dokonanie zmian w polach SAD na:
    </p>
  `;

  const secondPageContent = `
    <div class="document__table-block">
      <table class="document__summary">
        <colgroup>
          <col class="document__summary-col document__summary-col--label" />
          <col class="document__summary-col document__summary-col--type" />
          <col class="document__summary-col document__summary-col--base" />
          <col class="document__summary-col document__summary-col--rate" />
          <col class="document__summary-col document__summary-col--amount" />
          <col class="document__summary-col document__summary-col--type" />
          <col class="document__summary-col document__summary-col--base" />
          <col class="document__summary-col document__summary-col--rate" />
          <col class="document__summary-col document__summary-col--amount" />
        </colgroup>
        <thead>
          <tr>
            <th></th>
            <th colspan="4">JEST:</th>
            <th colspan="4">WINNO BYĆ:</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Całkowita zafakt. kwota 1406</td>
            <td colspan="4" class="document__summary-value">EUR ${snapshot.totals.formatted.originalEur}</td>
            <td colspan="4" class="document__summary-value">EUR ${snapshot.totals.formatted.correctedEurRounded}</td>
          </tr>
          <tr>
            <td>Wartość fakt. pozycji 1408</td>
            <td colspan="4" class="document__summary-value">${snapshot.totals.formatted.originalEur}</td>
            <td colspan="4" class="document__summary-value">${snapshot.totals.formatted.correctedEurRounded}</td>
          </tr>
          <tr>
            <td>Dokumenty załączone 1203</td>
            <td colspan="4">${escapeHtml(snapshot.meta.invoiceNumbersList)}</td>
            <td colspan="4">${escapeHtml(snapshot.meta.paymentDocumentsList)}</td>
          </tr>
          <tr>
            <td>Wartość statystyczna 9906</td>
            <td colspan="4" class="document__summary-value">${snapshot.totals.formatted.originalStatValue}</td>
            <td colspan="4" class="document__summary-value">${snapshot.totals.formatted.correctedStatValue}</td>
          </tr>
          <tr class="document__summary-tax-head">
            <td rowspan="3">Kalkulacje podatkowe 1403</td>
            <th>Typ</th>
            <th>Podstawa opłaty</th>
            <th>Stawka</th>
            <th>Kwota</th>
            <th>Typ</th>
            <th>Podstawa opłaty</th>
            <th>Stawka</th>
            <th>Kwota</th>
          </tr>
          <tr class="document__summary-tax-row">
            <td class="document__summary-code">A00</td>
            <td class="document__summary-value">${snapshot.totals.formatted.originalStatValue}</td>
            <td class="document__summary-value">0</td>
            <td class="document__summary-value">0</td>
            <td class="document__summary-code">A00</td>
            <td class="document__summary-value">${snapshot.totals.formatted.correctedStatValue}</td>
            <td class="document__summary-value">0</td>
            <td class="document__summary-value">0</td>
          </tr>
          <tr class="document__summary-tax-row">
            <td class="document__summary-code">B00</td>
            <td class="document__summary-value">${snapshot.totals.formatted.vatBaseOriginal}</td>
            <td class="document__summary-value">23</td>
            <td class="document__summary-value">${snapshot.totals.formatted.vatAmountOriginal}</td>
            <td class="document__summary-code">B00</td>
            <td class="document__summary-value">${snapshot.totals.formatted.vatBaseCorrected}</td>
            <td class="document__summary-value">23</td>
            <td class="document__summary-value">${snapshot.totals.formatted.vatAmountCorrected}</td>
          </tr>
        </tbody>
      </table>

      <p class="document__paragraph document__paragraph--after-table">
        Kwota ${escapeHtml(snapshot.totals.vatDescriptor)} podatku VAT wynosi:
        ${snapshot.totals.formatted.vatDifference} zł
      </p>
    </div>

    <div class="document__closing-block">
      <div class="document__attachments">
        <strong>Załączniki:</strong>
        <ul>${attachmentItems}</ul>
      </div>

      <p class="document__signature">
        Z poważaniem<br />${escapeHtml(snapshot.state.letter.signatory)}
      </p>
    </div>
  `;

  function renderPage(pageContent, extraClass = "") {
    return `
      <section class="document__page ${extraClass}">
        <div class="document__page-header">
          <img src="${escapeHtml(PRINT_ASSETS.header)}" alt="Header" />
        </div>
        <div class="document__content">
          ${pageContent}
        </div>
        <div class="document__page-footer">
          <img src="${escapeHtml(PRINT_ASSETS.footer)}" alt="Footer" />
        </div>
      </section>
    `;
  }

  return `
    <div class="document">
      ${renderPage(firstPageContent, "document__page--first")}
      ${renderPage(secondPageContent, "document__page--second")}
    </div>
  `;
}

function recompute() {
  stateRef.snapshot = bridge.computeSnapshot(stateRef.state);
  renderOutputs();
}

function handlePathInput(target) {
  const previousType = stateRef.state.documentType;
  const previousPreset = bridge.getDocumentPreset(previousType);
  setValueAtPath(stateRef.state, target.dataset.path, readControlValue(target));

  if (target.dataset.path === "documentType") {
    const nextPreset = bridge.getDocumentPreset(target.value);
    if (
      !stateRef.state.documentNumber ||
      stateRef.state.documentNumber === previousPreset.suggestedNumber
    ) {
      stateRef.state.documentNumber = nextPreset.suggestedNumber;
      document.querySelector('[data-path="documentNumber"]').value =
        nextPreset.suggestedNumber || "";
    }
  }

  if (target.dataset.path === "oreKind") {
    renderOreKindOptions(target.value);

    const oreKind = stateRef.oreKinds.find((item) => item.name === target.value);
    if (oreKind?.defaultOreType) {
      stateRef.state.oreType = oreKind.defaultOreType;
      elements.oreType.value = oreKind.defaultOreType;
    }
  }

  if (target.dataset.path === "customsOfficeCode") {
    const selectedOffice = stateRef.customsOffices.find(
      (office) => office.code === target.value
    );
    if (selectedOffice) {
      stateRef.officeDraftId = selectedOffice.id;
      renderCustomsOfficeEditor(selectedOffice.id);
    }
  }

  if (target.dataset.path === "print.savePdfAfterPrint") {
    renderPrintSettingsControls();
  }

  markDirty();
  recompute();
}

async function confirmDiscardIfNeeded() {
  if (!stateRef.dirty) {
    return true;
  }

  return window.confirm("Są niezapisane zmiany. Kontynuować?");
}

function applyCatalogs(result) {
  stateRef.oreKinds = result.oreKinds || stateRef.oreKinds;
  stateRef.customsOffices = result.customsOffices || stateRef.customsOffices;
}

function setState(nextState, options = {}) {
  stateRef.state = bridge.normalizeState(nextState);
  stateRef.currentProjectPath =
    options.currentProjectPath !== undefined
      ? options.currentProjectPath
      : stateRef.currentProjectPath;
  stateRef.dirty = options.dirty ?? stateRef.dirty;
  ensureCustomsOfficeSelection();
  renderOreKindOptions(stateRef.state.oreKind);
  renderCustomsOfficeOptions();
  populateInputs();
  recompute();
}

function collectOfficeDraft() {
  return {
    id: stateRef.officeDraftId,
    code: elements.settingsOfficeCode.value.trim(),
    name: elements.settingsOfficeName.value.trim(),
    addressLine1: elements.settingsOfficeAddress1.value.trim(),
    addressLine2: elements.settingsOfficeAddress2.value.trim(),
    sortOrder: (() => {
      const current = stateRef.customsOffices.find(
        (office) => office.id === stateRef.officeDraftId
      );
      return current?.sortOrder ?? stateRef.customsOffices.length;
    })(),
  };
}

async function handleOfficeSave() {
  const existingOffice = stateRef.customsOffices.find(
    (office) => office.id === stateRef.officeDraftId
  );
  const previousCode = existingOffice?.code || "";
  const payload = collectOfficeDraft();
  const result = await bridge.saveCustomsOffice(payload);

  stateRef.customsOffices = result.customsOffices || stateRef.customsOffices;
  stateRef.officeDraftId = result.savedOffice?.id ?? null;

  const shouldSwitchSelectedOffice =
    !stateRef.state.customsOfficeCode ||
    stateRef.state.customsOfficeCode === previousCode ||
    !stateRef.customsOffices.some(
      (office) => office.code === stateRef.state.customsOfficeCode
    );

  if (shouldSwitchSelectedOffice && result.savedOffice?.code) {
    stateRef.state.customsOfficeCode = result.savedOffice.code;
    markDirty();
  }

  ensureCustomsOfficeSelection();
  renderCustomsOfficeOptions();
  populateInputs();
  recompute();
  showStatus(`Zapisano urząd ${result.savedOffice?.code || ""}.`);
}

function handleOfficeNew() {
  stateRef.officeDraftId = null;
  renderCustomsOfficeEditor(null);
  showStatus("Wprowadź dane nowego urzędu i zapisz je do słownika.");
}

async function handleChoosePdfOutputDir() {
  const currentPath = stateRef.state.print?.pdfOutputDir || stateRef.state.fileLocation || "";
  const result = await bridge.chooseDirectory(currentPath);
  if (result.canceled) {
    return;
  }

  stateRef.state.print.pdfOutputDir = result.filePath;
  elements.settingsPdfOutputDir.value = result.filePath;
  renderPrintSettingsControls();
  markDirty();
  recompute();
  showStatus(`Ustawiono folder PDF: ${result.filePath}.`);
}

async function handleAction(action) {
  try {
    if (action === "new") {
      if (!(await confirmDiscardIfNeeded())) {
        return;
      }

      const result = await bridge.bootstrap();
      applyCatalogs(result);
      buildSelectOptions();
      setState(result.state, { currentProjectPath: null, dirty: false });
      showStatus(result.error || result.catalogError || "Załadowano szablon startowy.");
      return;
    }

    if (action === "open") {
      if (!(await confirmDiscardIfNeeded())) {
        return;
      }

      const result = await bridge.openProject();
      if (result.canceled) {
        return;
      }

      setState(result.state, { currentProjectPath: result.filePath, dirty: false });
      showStatus(`Otworzono ${basename(result.filePath)}.`);
      return;
    }

    if (action === "import") {
      const result = await bridge.importSourceWorkbook(stateRef.state);
      if (result.canceled) {
        return;
      }

      setState(result.state, { dirty: true });
      showStatus(`Zaimportowano dane z ${basename(result.filePath)}.`);
      return;
    }

    if (action === "save") {
      const result = await bridge.saveProject(
        stateRef.state,
        stateRef.currentProjectPath
      );
      if (result.canceled) {
        return;
      }

      stateRef.currentProjectPath = result.filePath;
      markDirty(false);
      showStatus(`Zapisano projekt: ${basename(result.filePath)}.`);
      return;
    }

    if (action === "saveAs") {
      const result = await bridge.saveProjectAs(stateRef.state);
      if (result.canceled) {
        return;
      }

      stateRef.currentProjectPath = result.filePath;
      markDirty(false);
      showStatus(`Zapisano projekt jako ${basename(result.filePath)}.`);
      return;
    }

    if (action === "show-print") {
      if (stateRef.snapshot.validation.errors.length > 0) {
        alert("Uzupełnij numer i datę noty we wszystkich rozpoczętych wierszach korekty.");
        setActiveTab("dane");
        return;
      }

      setActiveTab("wydruk");
      await waitForPrintPreviewReady();
      showStatus("Podgląd wydruku jest gotowy.");
      return;
    }

    if (action === "print") {
      if (stateRef.isPrinting) {
        return;
      }

      if (stateRef.snapshot.validation.errors.length > 0) {
        alert("Nie można drukować, dopóki są błędy walidacji.");
        setActiveTab("dane");
        return;
      }

      if (
        stateRef.state.print?.savePdfAfterPrint &&
        !String(stateRef.state.print?.pdfOutputDir || "").trim()
      ) {
        alert("Włączono zapis PDF po wydruku, ale nie ustawiono folderu docelowego.");
        setActiveTab("ustawienia");
        return;
      }

      setActiveTab("wydruk");
      const pageCount = getPrintPageCount() || 0;
      openPrintStatusModal(pageCount);
      await waitForPrintPreviewReady();
      const resolvedPageCount = getPrintPageCount() || pageCount || 0;
      updatePrintStatusModalAfterPrepare(resolvedPageCount);
      const result = await bridge.printToDefaultPrinter({
        ...stateRef.state,
        print: {
          ...stateRef.state.print,
          pageCount: resolvedPageCount,
        },
      });
      const modeLabel = result.colorMode === "grayscale" ? "czarno-biały" : "kolor";
      updatePrintStatusModalSuccess(result, resolvedPageCount);
      if (result.pdfError) {
        showStatus(
          `Wydrukowano na ${result.printerName} (${modeLabel}), ale zapis PDF nie udał się: ${result.pdfError}`
        );
        return;
      }

      if (result.pdfPath) {
        showStatus(
          `Wydrukowano na ${result.printerName} (${modeLabel}) i zapisano PDF: ${basename(
            result.pdfPath
          )}.`
        );
        return;
      }

      showStatus(`Wydrukowano na ${result.printerName} (${modeLabel}).`);
      return;
    }

    if (action === "back") {
      setActiveTab(stateRef.lastWorkTab || "dane");
      return;
    }

    if (action === "office-new") {
      handleOfficeNew();
      return;
    }

    if (action === "office-save") {
      await handleOfficeSave();
      return;
    }

    if (action === "choose-pdf-output-dir") {
      await handleChoosePdfOutputDir();
      return;
    }

    if (action === "close-print-status") {
      closePrintStatusModal();
    }
  } catch (error) {
    updatePrintStatusModalError(error);
    alert(error.message);
    showStatus(error.message);
  }
}

function wireEvents() {
  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      handleAction(actionButton.dataset.action);
      return;
    }

    const tabButton = event.target.closest(".tab");
    if (tabButton) {
      setActiveTab(tabButton.dataset.tab);
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }

    if (!target.dataset.path) {
      return;
    }

    handlePathInput(target);
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }

    if (!target.dataset.path) {
      return;
    }

    handlePathInput(target);
  });

  elements.settingsCustomsOffice.addEventListener("change", (event) => {
    renderCustomsOfficeEditor(event.target.value);
  });

  window.addEventListener("keydown", async (event) => {
    if (event.key === "Escape" && !elements.printStatusModal.hidden) {
      closePrintStatusModal();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      await handleAction("save");
    }
  });
}

async function bootstrap() {
  buildTables();
  bridge.onPrintStatus(handlePrintStatusEvent);
  wireEvents();

  const result = await bridge.bootstrap();
  applyCatalogs(result);
  buildSelectOptions();
  setState(result.state, { currentProjectPath: null, dirty: false });
  showStatus(result.error || result.catalogError || "Załadowano szablon Trade_N.xls.");
}

bootstrap();
