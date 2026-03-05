const { bridge } = window;

const stateRef = {
  state: null,
  snapshot: null,
  currentProjectPath: null,
  dirty: false,
  activeTab: "dane",
};

const elements = {
  projectIndicator: document.getElementById("project-indicator"),
  statusText: document.getElementById("status-text"),
  originalTableBody: document.getElementById("original-table-body"),
  correctionTableBody: document.getElementById("correction-table-body"),
  documentType: document.getElementById("document-type"),
  oreType: document.getElementById("ore-type"),
  documentNumberLabel: document.getElementById("document-number-label"),
  hintList: document.getElementById("hint-list"),
  validationList: document.getElementById("validation-list"),
  printRoot: document.getElementById("print-root"),
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
  const suffix = stateRef.dirty ? " • niezapisane zmiany" : "";

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

function buildSelectOptions() {
  elements.documentType.innerHTML = bridge.meta.documentTypes
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}">${escapeHtml(value || "—")}</option>`
    )
    .join("");

  elements.oreType.innerHTML = bridge.meta.oreTypes
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("");
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
      : "<li>Brak błędów walidacji.</li>";

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
  const paragraphs =
    snapshot.printParagraphs.length > 0
      ? snapshot.printParagraphs
          .map(
            (paragraph) => `
              <p class="document__paragraph">${escapeHtml(paragraph.line1)}</p>
              <p class="document__paragraph">${escapeHtml(paragraph.line2)}</p>
              <p class="document__paragraph">${escapeHtml(paragraph.line3)}</p>
            `
          )
          .join("")
      : `<p class="document__paragraph document__empty">Brak pozycji korekty z kompletem numeru i daty noty.</p>`;

  const attachmentItems = [
    snapshot.attachments.noteAttachmentLine,
    snapshot.attachments.copySadLine,
    snapshot.attachments.invoiceLine,
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
        <div class="document__address">
          <div class="document__label">Adres do korespondencji:</div>
          <strong>${escapeHtml(snapshot.state.letter.senderCompany)}</strong>
          <div>${escapeHtml(snapshot.state.letter.senderAddressLine1)}</div>
          <div>${escapeHtml(snapshot.state.letter.senderAddressLine2)}</div>
        </div>

        <div class="document__address">
          <strong>${escapeHtml(snapshot.state.letter.recipientOffice)}</strong>
          <div>${escapeHtml(snapshot.state.letter.recipientAddressLine1)}</div>
          <div>${escapeHtml(snapshot.state.letter.recipientAddressLine2)}</div>
        </div>
      </div>

      <p class="document__subject">Sprawa: WPIS DO REJESTRU ${escapeHtml(
        snapshot.state.entryNumber
      )} z dnia ${escapeHtml(snapshot.state.entryDate)}</p>
      <p class="document__subject document__subject--secondary">
        SAD UZUPEŁNIAJĄCY ${escapeHtml(snapshot.meta.documentDisplay)}
      </p>

      <p class="document__paragraph">
        Działając w imieniu i z upoważnienia ArcelorMittal Poland S.A. w dniu
        ${escapeHtml(snapshot.state.entryDate)} TSL Silesia Sp. z o.o.
      </p>
      <p class="document__paragraph">
        dokonała wpisu do rejestru towarów objętych procedurą uproszczoną pod
        pozycją ${escapeHtml(snapshot.state.entryNumber)} oraz sporządziła
      </p>
      <p class="document__paragraph">
        uzupełniające zgłoszenie celne towaru - ruda żelaza
        ${escapeHtml(snapshot.state.oreType)} ${escapeHtml(snapshot.state.oreKind)}
      </p>
      <p class="document__paragraph">
        zarejestrowanej w ewidencji pod pozycją nr ${escapeHtml(
          snapshot.meta.documentDisplay
        )} pochodzącego i przywiezionego
      </p>
      <p class="document__paragraph">
        z ${escapeHtml(snapshot.state.originCountry)} oraz zaklasyfikowanego do
        kodu CN ${escapeHtml(snapshot.meta.cnCode)}.
      </p>

      ${paragraphs}

      <p class="document__paragraph">
        Na podstawie art. 173 ust. 3 Rozporządzenia Parlamentu Europejskiego i
        Rady (UE) nr 952/2013 z dn. 09.10.2013 r. ustanawiającego UKC z
        późniejszymi zmianami, proszę o dokonanie zmian w polach SAD na:
      </p>

      <table class="document__summary">
        <thead>
          <tr>
            <th></th>
            <th>JEST:</th>
            <th>WINNO BYĆ:</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Całkowita zafakt. kwota 1406</td>
            <td>EUR ${snapshot.totals.formatted.originalEur}</td>
            <td>EUR ${snapshot.totals.formatted.correctedEurRounded}</td>
          </tr>
          <tr>
            <td>Wartość fakt. pozycji 1408</td>
            <td>${snapshot.totals.formatted.originalEur}</td>
            <td>${snapshot.totals.formatted.correctedEurRounded}</td>
          </tr>
          <tr>
            <td>Dokumenty załączone 1203</td>
            <td>${escapeHtml(snapshot.meta.invoiceNumbersList)}</td>
            <td>${escapeHtml(snapshot.meta.paymentDocumentsList)}</td>
          </tr>
          <tr>
            <td>Wartość statystyczna 9906</td>
            <td>${snapshot.totals.formatted.originalStatValue}</td>
            <td>${snapshot.totals.formatted.correctedStatValue}</td>
          </tr>
          <tr>
            <td>Kalkulacje podatkowe 1403</td>
            <td>
              <table class="document__tax">
                <tr><th>Typ</th><th>Podstawa opłaty</th><th>Stawka</th><th>Kwota</th></tr>
                <tr><td>A00</td><td>${snapshot.totals.formatted.originalStatValue}</td><td>0</td><td>0</td></tr>
                <tr><td>B00</td><td>${snapshot.totals.formatted.vatBaseOriginal}</td><td>23</td><td>${snapshot.totals.formatted.vatAmountOriginal}</td></tr>
              </table>
            </td>
            <td>
              <table class="document__tax">
                <tr><th>Typ</th><th>Podstawa opłaty</th><th>Stawka</th><th>Kwota</th></tr>
                <tr><td>A00</td><td>${snapshot.totals.formatted.correctedStatValue}</td><td>0</td><td>0</td></tr>
                <tr><td>B00</td><td>${snapshot.totals.formatted.vatBaseCorrected}</td><td>23</td><td>${snapshot.totals.formatted.vatAmountCorrected}</td></tr>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <p class="document__paragraph">
        Kwota ${escapeHtml(snapshot.totals.vatDescriptor)} podatku VAT wynosi:
        ${snapshot.totals.formatted.vatDifference} zł
      </p>

      <div class="document__attachments">
        <strong>Załączniki:</strong>
        <ul>${attachmentItems}</ul>
      </div>

      <p class="document__signature">Z poważaniem ${escapeHtml(
        snapshot.state.letter.signatory
      )}</p>
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

  markDirty();
  recompute();
}

async function confirmDiscardIfNeeded() {
  if (!stateRef.dirty) {
    return true;
  }

  return window.confirm("Są niezapisane zmiany. Kontynuować?");
}

function setState(nextState, options = {}) {
  stateRef.state = bridge.normalizeState(nextState);
  stateRef.currentProjectPath =
    options.currentProjectPath !== undefined
      ? options.currentProjectPath
      : stateRef.currentProjectPath;
  stateRef.dirty = options.dirty ?? stateRef.dirty;
  populateInputs();
  recompute();
}

async function handleAction(action) {
  try {
    if (action === "new") {
      if (!(await confirmDiscardIfNeeded())) {
        return;
      }

      const result = await bridge.bootstrap();
      setState(result.state, { currentProjectPath: null, dirty: false });
      showStatus("Załadowano szablon startowy.");
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
      showStatus("Podgląd wydruku jest gotowy.");
      return;
    }

    if (action === "print") {
      if (stateRef.snapshot.validation.errors.length > 0) {
        alert("Nie można drukować, dopóki są błędy walidacji.");
        setActiveTab("dane");
        return;
      }

      setActiveTab("wydruk");
      window.print();
      return;
    }

    if (action === "back") {
      setActiveTab("dane");
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

  window.addEventListener("keydown", async (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      await handleAction("save");
    }
  });
}

async function bootstrap() {
  buildSelectOptions();
  buildTables();
  wireEvents();

  const result = await bridge.bootstrap();
  setState(result.state, { currentProjectPath: null, dirty: false });
  showStatus(result.error || "Załadowano szablon Trade_N.xls.");
}

bootstrap();
