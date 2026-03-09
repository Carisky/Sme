function createButtonHtml(config = {}) {
  const label = String(config.label || "").trim();
  const action = String(config.action || "").trim();
  const className = String(config.className || "").trim();

  if (!label || !action) {
    throw new Error("Slot button requires label and action.");
  }

  const classAttr = className ? ` class="${className}"` : "";
  return `<button type="button"${classAttr} data-action="${action}">${label}</button>`;
}

export function createUiSlots() {
  const slotNodes = new Map(
    Array.from(document.querySelectorAll("[data-ui-slot]")).map((node) => [
      node.dataset.uiSlot,
      node,
    ])
  );
  const ownerNodes = new Map();

  function ensureOwner(ownerId) {
    if (!ownerNodes.has(ownerId)) {
      ownerNodes.set(ownerId, []);
    }

    return ownerNodes.get(ownerId);
  }

  function getSlot(slotId) {
    const slot = slotNodes.get(slotId);
    if (!slot) {
      throw new Error(`Unknown ui slot: ${slotId}`);
    }

    return slot;
  }

  function remember(ownerId, node) {
    ensureOwner(ownerId).push(node);
  }

  function mountHtml(ownerId, slotId, html) {
    const wrapper = document.createElement("div");
    wrapper.className = "module-slot__item";
    wrapper.innerHTML = String(html || "");
    getSlot(slotId).appendChild(wrapper);
    remember(ownerId, wrapper);
    return wrapper;
  }

  return {
    list() {
      return Array.from(slotNodes.keys());
    },
    mountHtml(ownerId, slotId, html) {
      return mountHtml(ownerId, slotId, html);
    },
    appendButton(ownerId, slotId, config) {
      return mountHtml(ownerId, slotId, createButtonHtml(config));
    },
    clearOwner(ownerId) {
      const nodes = ownerNodes.get(ownerId) || [];
      for (const node of nodes) {
        node.remove();
      }

      ownerNodes.delete(ownerId);
    },
  };
}
