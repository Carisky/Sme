export function wireEvents({ commands, actions, renderers }) {
  const commandsAllowedWhileLocked = new Set(["update-retry", "update-install"]);

  async function dispatchCommand(action, payload) {
    if (renderers.isUpdateLocked() && !commandsAllowedWhileLocked.has(action)) {
      return;
    }

    try {
      await commands.execute(action, payload);
    } catch (error) {
      actions.handleCommandError(action, error);
    }
  }

  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      dispatchCommand(actionButton.dataset.action);
      return;
    }

    const tabButton = event.target.closest(".tab");
    if (tabButton && !renderers.isUpdateLocked()) {
      renderers.setActiveTab(tabButton.dataset.tab);
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }

    if (target instanceof HTMLInputElement && target.type === "date") {
      return;
    }

    if (!target.dataset.path) {
      return;
    }

    actions.handlePathInput(target);
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }

    if (!target.dataset.path) {
      return;
    }

    actions.handlePathInput(target);
  });

  renderers.elements.settingsCustomsOffice.addEventListener("change", (event) => {
    renderers.renderCustomsOfficeEditor(event.target.value);
  });

  renderers.elements.settingsOreKind.addEventListener("change", (event) => {
    renderers.renderOreKindEditor(event.target.value);
  });

  renderers.elements.settingsOriginCountry.addEventListener("change", (event) => {
    renderers.renderOriginCountryEditor(event.target.value);
  });

  window.addEventListener("keydown", async (event) => {
    if (event.key === "Escape" && !renderers.elements.printStatusModal.hidden) {
      renderers.closePrintStatusModal();
      return;
    }

    if (renderers.isUpdateLocked()) {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      await dispatchCommand("save");
    }
  });
}
