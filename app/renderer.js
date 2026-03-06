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

function renderProjectIndicator() {
  const suffix = stateRef.dirty ? " * niezapisane zmiany" : "";

  if (stateRef.currentProjectPath) {
    elements.projectIndicator.textContent = `${stateRef.currentProjectPath}${suffix}`;
  } else {
    elements.projectIndicator.textContent = `Projekt w pamieci${suffix}`;
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
    '<option value="">Nowy urzad...</option>',
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
    input.value = value ?? "";
  });
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
      : "<li>Brak bledow walidacji.</li>";

  document.querySelectorAll("#correction-table-body tr").forEach((rowNode, index) => {
    const correction = snapshot.rows[index].correction;
    rowNode.classList.toggle("row--active", correction.isActive);
    rowNode.classList.toggle("row--invalid", correction.isIncomplete);
  });

  applyCorrectionPlaceholders();
  elements.printRoot.innerHTML = renderPrint(snapshot);
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

  return `
    <div class="document">
      <div class="document__header">
        <div class="document__case">${escapeHtml(snapshot.meta.caseNumber)}</div>
        <div class="document__place">
          <strong>${escapeHtml(snapshot.state.letter.printCity)}</strong><br />
          ${escapeHtml(snapshot.state.letter.printDate)}
        </div>
      </div>

      <div class="document__address-grid">
        <div class="document__address"></div>
        <div class="document__address">
          <strong>${escapeHtml(String(office.name || "").toUpperCase())}</strong>
          <div>${escapeHtml(office.addressLine1)}</div>
          <div>${escapeHtml(office.addressLine2)}</div>
        </div>
      </div>

      <p class="document__subject">Sprawa: ${escapeHtml(snapshot.state.documentNumber)}</p>

      <p class="document__paragraph">
        Dzialajac w imieniu i z upowaznienia ArcelorMittal Poland S.A. w dniu
        ${escapeHtml(snapshot.state.entryDate)} ${escapeHtml(snapshot.state.letter.senderCompany)}
      </p>
      <p class="document__paragraph">
        Dzialajac jako przedstawiciel bezposredni dokonala zgloszenia w procedurze
        standardowej MRN
      </p>
      <p class="document__paragraph">
        ${escapeHtml(snapshot.state.documentNumber)} dla towaru - ruda zelaza
        ${escapeHtml(snapshot.state.oreType)} ${escapeHtml(snapshot.state.oreKind)}
      </p>
      <p class="document__paragraph">
        pochodzacego i przywiezionego z ${escapeHtml(
          snapshot.state.originCountry
        )} oraz zaklasyfikowanego do kodu CN${escapeHtml(snapshot.meta.cnCode)}.
      </p>

      ${paragraphs}

      <p class="document__paragraph">
        Na podstawie art. 173 ust. 3 Rozporzadzenia Parlamentu Europejskiego i
        Rady (UE) nr 952/2013 z dn. 09.10.2013 r. ustanawiajacego UKC z
        pozniejszymi zmianami, prosze o dokonanie zmian w polach SAD na:
      </p>

      <table class="document__summary">
        <thead>
          <tr>
            <th></th>
            <th>JEST:</th>
            <th>WINNO BYC:</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Calkowita zafakt. kwota 1406</td>
            <td>EUR ${snapshot.totals.formatted.originalEur}</td>
            <td>EUR ${snapshot.totals.formatted.correctedEurRounded}</td>
          </tr>
          <tr>
            <td>Wartosc fakt. pozycji 1408</td>
            <td>${snapshot.totals.formatted.originalEur}</td>
            <td>${snapshot.totals.formatted.correctedEurRounded}</td>
          </tr>
          <tr>
            <td>Dokumenty zalaczone 1203</td>
            <td>${escapeHtml(snapshot.meta.invoiceNumbersList)}</td>
            <td>${escapeHtml(snapshot.meta.paymentDocumentsList)}</td>
          </tr>
          <tr>
            <td>Wartosc statystyczna 9906</td>
            <td>${snapshot.totals.formatted.originalStatValue}</td>
            <td>${snapshot.totals.formatted.correctedStatValue}</td>
          </tr>
          <tr>
            <td>Kalkulacje podatkowe 1403</td>
            <td>
              <table class="document__tax">
                <tr><th>Typ</th><th>Podstawa oplaty</th><th>Stawka</th><th>Kwota</th></tr>
                <tr><td>A00</td><td>${snapshot.totals.formatted.originalStatValue}</td><td>0</td><td>0</td></tr>
                <tr><td>B00</td><td>${snapshot.totals.formatted.vatBaseOriginal}</td><td>23</td><td>${snapshot.totals.formatted.vatAmountOriginal}</td></tr>
              </table>
            </td>
            <td>
              <table class="document__tax">
                <tr><th>Typ</th><th>Podstawa oplaty</th><th>Stawka</th><th>Kwota</th></tr>
                <tr><td>A00</td><td>${snapshot.totals.formatted.correctedStatValue}</td><td>0</td><td>0</td></tr>
                <tr><td>B00</td><td>${snapshot.totals.formatted.vatBaseCorrected}</td><td>23</td><td>${snapshot.totals.formatted.vatAmountCorrected}</td></tr>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <p class="document__paragraph">
        Kwota ${escapeHtml(snapshot.totals.vatDescriptor)} podatku VAT wynosi:
        ${snapshot.totals.formatted.vatDifference} zl
      </p>

      <div class="document__attachments">
        <strong>Zalaczniki:</strong>
        <ul>${attachmentItems}</ul>
      </div>

      <p class="document__signature">
        Z powazaniem<br />${escapeHtml(snapshot.state.letter.signatory)}
      </p>
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
  setValueAtPath(stateRef.state, target.dataset.path, target.value);

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

  markDirty();
  recompute();
}

async function confirmDiscardIfNeeded() {
  if (!stateRef.dirty) {
    return true;
  }

  return window.confirm("Sa niezapisane zmiany. Kontynuowac?");
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
  showStatus(`Zapisano urzad ${result.savedOffice?.code || ""}.`);
}

function handleOfficeNew() {
  stateRef.officeDraftId = null;
  renderCustomsOfficeEditor(null);
  showStatus("Wprowadz dane nowego urzedu i zapisz je do slownika.");
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
      showStatus(result.error || result.catalogError || "Zaladowano szablon startowy.");
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
        alert("Uzupelnij numer i date noty we wszystkich rozpoczetych wierszach korekty.");
        setActiveTab("dane");
        return;
      }

      setActiveTab("wydruk");
      showStatus("Podglad wydruku jest gotowy.");
      return;
    }

    if (action === "print") {
      if (stateRef.snapshot.validation.errors.length > 0) {
        alert("Nie mozna drukowac, dopoki sa bledy walidacji.");
        setActiveTab("dane");
        return;
      }

      setActiveTab("wydruk");
      window.print();
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
    }
  } catch (error) {
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
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      await handleAction("save");
    }
  });
}

async function bootstrap() {
  buildTables();
  wireEvents();

  const result = await bridge.bootstrap();
  applyCatalogs(result);
  buildSelectOptions();
  setState(result.state, { currentProjectPath: null, dirty: false });
  showStatus(result.error || result.catalogError || "Zaladowano szablon Trade_N.xls.");
}

bootstrap();
