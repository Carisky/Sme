import { bridge, persistedSettingsPaths, cloneValue } from "./bridge.js";
import { elements } from "./dom.js";
import { basename, readControlValue, setValueAtPath } from "./utils.js";

export function createActions({ store, renderers, extensions }) {
  const stateRef = store.state;

  function getBootstrapStatusMessage(result = {}) {
    if (result.updateGate?.locked || result.updateGate?.status === "offline-verified") {
      return result.updateGate.message;
    }

    return result.error || result.catalogError || "Zaladowano pusty projekt startowy.";
  }

  function markDirty(value = true) {
    stateRef.dirty = value;
    renderers.renderProjectIndicator();
  }

  function isPersistedSettingPath(targetPath = "") {
    return persistedSettingsPaths.has(targetPath);
  }

  function schedulePersistedSettingsSave() {
    if (stateRef.settingsSaveTimer) {
      clearTimeout(stateRef.settingsSaveTimer);
    }

    stateRef.settingsSaveTimer = window.setTimeout(async () => {
      try {
        await bridge.saveAppSettings(bridge.extractAppSettings(stateRef.state));
      } catch (error) {
        renderers.showStatus(`Nie udalo sie zapisac ustawien aplikacji: ${error.message}`);
      }
    }, 250);
  }

  function recompute() {
    if (!stateRef.state) {
      return null;
    }

    const snapshot = bridge.computeSnapshot(stateRef.state);
    stateRef.snapshot = extensions.applyValidators(snapshot, {
      state: cloneValue(stateRef.state),
      modules: cloneValue(stateRef.projectModules),
      snapshot: cloneValue(snapshot),
    });
    renderers.renderOutputs();
    return stateRef.snapshot;
  }

  function setState(nextState, options = {}) {
    stateRef.state = bridge.normalizeState(nextState);
    stateRef.currentProjectPath =
      options.currentProjectPath !== undefined
        ? options.currentProjectPath
        : stateRef.currentProjectPath;
    stateRef.dirty = options.dirty ?? stateRef.dirty;
    store.setProjectModules(options.modules ?? stateRef.projectModules);
    renderers.ensureOreKindSelection();
    renderers.ensureCustomsOfficeSelection();
    renderers.ensureOriginCountrySelection();
    renderers.renderOreKindOptions(stateRef.state.oreKind);
    renderers.renderCustomsOfficeOptions();
    renderers.renderOriginCountryOptions();
    renderers.populateInputs();
    recompute();
  }

  async function confirmDiscardIfNeeded() {
    if (!stateRef.dirty) {
      return true;
    }

    return window.confirm("Sa niezapisane zmiany. Kontynuowac?");
  }

  function applyBootstrapPayload(result, options = {}) {
    store.applyCatalogs(result);
    renderers.buildSelectOptions();
    setState(result.state, {
      currentProjectPath: options.currentProjectPath ?? null,
      dirty: options.dirty ?? false,
      modules: options.modules ?? {},
    });
    renderers.applyUpdateGate(result.updateGate);
    renderers.showStatus(getBootstrapStatusMessage(result));
    return result;
  }

  async function refreshUpdateGate() {
    const nextGate = await bridge.checkForUpdates();
    renderers.applyUpdateGate(nextGate);
    renderers.showStatus(nextGate.message || "Sprawdzono stan aktualizacji.");
    return nextGate;
  }

  async function startMandatoryUpdateInstall() {
    renderers.setUpdateGateBusy(true);
    await bridge.downloadAndInstallUpdate();
  }

  async function createNewProject() {
    if (!(await confirmDiscardIfNeeded())) {
      return null;
    }

    const result = await bridge.bootstrap();
    store.setUserModules(result.userModules || stateRef.userModules);
    applyBootstrapPayload(result);
    return result;
  }

  async function openProject() {
    if (!(await confirmDiscardIfNeeded())) {
      return null;
    }

    const result = await bridge.openProject();
    if (result.canceled) {
      return null;
    }

    setState(result.state, {
      currentProjectPath: result.filePath,
      dirty: false,
      modules: result.modules || {},
    });
    renderers.showStatus(`Otworzono ${basename(result.filePath)}.`);
    return result;
  }

  async function importProject() {
    const result = await bridge.importSourceWorkbook(stateRef.state);
    if (result.canceled) {
      return null;
    }

    setState(result.state, { dirty: true, modules: stateRef.projectModules });
    renderers.showStatus(`Zaimportowano dane z ${basename(result.filePath)}.`);
    return result;
  }

  async function saveProject() {
    const result = await bridge.saveProject(store.getProjectPayload(), stateRef.currentProjectPath);
    if (result.canceled) {
      return null;
    }

    stateRef.currentProjectPath = result.filePath;
    markDirty(false);
    renderers.showStatus(`Zapisano projekt: ${basename(result.filePath)}.`);
    return result;
  }

  async function saveProjectAs() {
    const result = await bridge.saveProjectAs(store.getProjectPayload());
    if (result.canceled) {
      return null;
    }

    stateRef.currentProjectPath = result.filePath;
    markDirty(false);
    renderers.showStatus(`Zapisano projekt jako ${basename(result.filePath)}.`);
    return result;
  }

  async function showPrintPreview() {
    if (stateRef.snapshot.validation.errors.length > 0) {
      window.alert(
        "Uzupelnij numer i date noty we wszystkich rozpoczetych wierszach korekty."
      );
      renderers.setActiveTab("dane");
      return null;
    }

    renderers.setActiveTab("wydruk");
    await renderers.waitForPrintPreviewReady();
    renderers.showStatus("Podglad wydruku jest gotowy.");
    return true;
  }

  async function printProject() {
    if (stateRef.isPrinting) {
      return null;
    }

    if (stateRef.snapshot.validation.errors.length > 0) {
      window.alert("Nie mozna drukowac, dopoki sa bledy walidacji.");
      renderers.setActiveTab("dane");
      return null;
    }

    if (
      stateRef.state.print?.savePdfAfterPrint &&
      !String(stateRef.state.print?.pdfOutputDir || "").trim()
    ) {
      window.alert("Wlaczono zapis PDF po wydruku, ale nie ustawiono folderu docelowego.");
      renderers.setActiveTab("ustawienia");
      return null;
    }

    renderers.setActiveTab("wydruk");
    const pageCount = renderers.getPrintPageCount() || 0;
    renderers.openPrintStatusModal(pageCount);
    await renderers.waitForPrintPreviewReady();
    const resolvedPageCount = renderers.getPrintPageCount() || pageCount || 0;
    renderers.updatePrintStatusModalAfterPrepare(resolvedPageCount);
    const result = await bridge.printToDefaultPrinter({
      ...stateRef.state,
      print: {
        ...stateRef.state.print,
        pageCount: resolvedPageCount,
      },
    });
    const modeLabel = result.colorMode === "grayscale" ? "czarno-bialy" : "kolor";
    renderers.updatePrintStatusModalSuccess(result, resolvedPageCount);

    if (result.pdfError) {
      renderers.showStatus(
        `Wydrukowano na ${result.printerName} (${modeLabel}), ale zapis PDF nie udal sie: ${result.pdfError}`
      );
      return result;
    }

    if (result.pdfPath) {
      renderers.showStatus(
        `Wydrukowano na ${result.printerName} (${modeLabel}) i zapisano PDF: ${basename(
          result.pdfPath
        )}.`
      );
      return result;
    }

    renderers.showStatus(`Wydrukowano na ${result.printerName} (${modeLabel}).`);
    return result;
  }

  function goBackFromPrint() {
    renderers.setActiveTab(stateRef.lastWorkTab || "dane");
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

  function collectOriginCountryDraft() {
    return {
      id: stateRef.originCountryDraftId,
      name: elements.settingsOriginCountryName.value.trim(),
      sortOrder: (() => {
        const current = stateRef.originCountries.find(
          (country) => country.id === stateRef.originCountryDraftId
        );
        return current?.sortOrder ?? stateRef.originCountries.length;
      })(),
    };
  }

  async function saveOffice() {
    const existingOffice = stateRef.customsOffices.find(
      (office) => office.id === stateRef.officeDraftId
    );
    const previousCode = existingOffice?.code || "";
    const result = await bridge.saveCustomsOffice(collectOfficeDraft());

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

    renderers.ensureCustomsOfficeSelection();
    renderers.renderCustomsOfficeOptions();
    renderers.populateInputs();
    recompute();
    renderers.showStatus(`Zapisano urzad ${result.savedOffice?.code || ""}.`);
    return result;
  }

  function createOfficeDraft() {
    stateRef.officeDraftId = null;
    renderers.renderCustomsOfficeEditor(null);
    renderers.showStatus("Wprowadz dane nowego urzedu i zapisz je do slownika.");
  }

  async function saveOriginCountry() {
    const existingCountry = stateRef.originCountries.find(
      (country) => country.id === stateRef.originCountryDraftId
    );
    const previousName = existingCountry?.name || "";
    const result = await bridge.saveOriginCountry(collectOriginCountryDraft());

    stateRef.originCountries = result.originCountries || stateRef.originCountries;
    stateRef.originCountryDraftId = result.savedCountry?.id ?? null;

    const shouldSwitchSelectedCountry =
      !stateRef.state.originCountry ||
      stateRef.state.originCountry === previousName ||
      !stateRef.originCountries.some(
        (country) => country.name === stateRef.state.originCountry
      );

    if (shouldSwitchSelectedCountry && result.savedCountry?.name) {
      stateRef.state.originCountry = result.savedCountry.name;
      markDirty();
    }

    renderers.ensureOriginCountrySelection();
    renderers.renderOriginCountryOptions(stateRef.state.originCountry);
    renderers.populateInputs();
    recompute();
    renderers.showStatus(`Zapisano kraj pochodzenia ${result.savedCountry?.name || ""}.`);
    return result;
  }

  function createOriginCountryDraft() {
    stateRef.originCountryDraftId = null;
    renderers.renderOriginCountryEditor(null);
    renderers.showStatus("Wprowadz dane nowego kraju pochodzenia i zapisz je do slownika.");
  }

  async function choosePdfOutputDir() {
    const currentPath = stateRef.state.print?.pdfOutputDir || stateRef.state.fileLocation || "";
    const result = await bridge.chooseDirectory(currentPath);
    if (result.canceled) {
      return null;
    }

    stateRef.state.print.pdfOutputDir = result.filePath;
    elements.settingsPdfOutputDir.value = result.filePath;
    renderers.renderPrintSettingsControls();
    markDirty();
    recompute();
    schedulePersistedSettingsSave();
    renderers.showStatus(`Ustawiono folder PDF: ${result.filePath}.`);
    return result;
  }

  function handlePathInput(target) {
    if (renderers.isUpdateLocked()) {
      return;
    }

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
      renderers.renderOreKindOptions(target.value);

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
        renderers.renderCustomsOfficeEditor(selectedOffice.id);
      }
    }

    if (target.dataset.path === "originCountry") {
      const selectedCountry = stateRef.originCountries.find(
        (country) => country.name === target.value
      );
      if (selectedCountry) {
        stateRef.originCountryDraftId = selectedCountry.id;
        renderers.renderOriginCountryEditor(selectedCountry.id);
      }
    }

    if (target.dataset.path === "print.savePdfAfterPrint") {
      renderers.renderPrintSettingsControls();
    }

    markDirty();
    recompute();

    if (isPersistedSettingPath(target.dataset.path)) {
      schedulePersistedSettingsSave();
    }
  }

  function setProjectModuleData(moduleId, value, options = {}) {
    store.setProjectModuleData(moduleId, value);
    if (options.markDirty !== false) {
      markDirty(true);
    }

    if (options.recompute !== false) {
      recompute();
    }
  }

  function replaceProjectState(nextState, options = {}) {
    setState(nextState, {
      currentProjectPath:
        options.currentProjectPath !== undefined
          ? options.currentProjectPath
          : stateRef.currentProjectPath,
      dirty: options.dirty ?? stateRef.dirty,
      modules: options.modules ?? stateRef.projectModules,
    });
  }

  function isUpdateAction(action) {
    return action === "update-retry" || action === "update-install";
  }

  function handleCommandError(action, error) {
    if (action === "print" || stateRef.isPrinting) {
      renderers.updatePrintStatusModalError(error);
    }

    if (isUpdateAction(action)) {
      renderers.setUpdateGateBusy(false);
      if (!renderers.elements.updateModal.hidden) {
        renderers.elements.updateDetail.textContent = error.message;
      }
    }

    window.alert(error.message);
    renderers.showStatus(error.message);
  }

  return {
    applyBootstrapPayload,
    choosePdfOutputDir,
    confirmDiscardIfNeeded,
    createNewProject,
    createOfficeDraft,
    createOriginCountryDraft,
    getBootstrapStatusMessage,
    goBackFromPrint,
    handleCommandError,
    handlePathInput,
    importProject,
    markDirty,
    openProject,
    printProject,
    recompute,
    refreshUpdateGate,
    replaceProjectState,
    saveOffice,
    saveOriginCountry,
    saveProject,
    saveProjectAs,
    schedulePersistedSettingsSave,
    setProjectModuleData,
    showPrintPreview,
    startMandatoryUpdateInstall,
  };
}
