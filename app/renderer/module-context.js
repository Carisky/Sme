import { bridge, cloneValue } from "./bridge.js";

function createStorageKey(moduleId, key) {
  const suffix = String(key || "default").trim() || "default";
  return `${moduleId}:${suffix}`;
}

export function createModuleContextFactory({
  store,
  actions,
  renderers,
  commands,
  uiSlots,
  extensions,
}) {
  const stateRef = store.state;

  function buildSharedContext(definition) {
    return {
      module: {
        id: definition.id,
        name: definition.name,
        version: definition.version,
        source: definition.source,
      },
      commands: {
        register(commandId, handler, metadata = {}) {
          commands.register(commandId, handler, {
            owner: definition.id,
            ...metadata,
          });
        },
        execute(commandId, payload) {
          return commands.execute(commandId, payload);
        },
        list() {
          return commands.list();
        },
      },
      storage: {
        app: {
          async get(key = "default", fallback = null) {
            const value = await store.loadModuleStorage(createStorageKey(definition.id, key));
            return value === null ? cloneValue(fallback) : cloneValue(value);
          },
          async set(key = "default", value = null) {
            return store.saveModuleStorage(createStorageKey(definition.id, key), value);
          },
        },
        project: {
          get(fallback = null) {
            return store.getProjectModuleData(definition.id, fallback);
          },
          set(value, options = {}) {
            actions.setProjectModuleData(definition.id, value, options);
            return store.getProjectModuleData(definition.id, null);
          },
        },
      },
      project: {
        getState() {
          return cloneValue(stateRef.state);
        },
        getSnapshot() {
          return cloneValue(stateRef.snapshot);
        },
        setState(nextState, options = {}) {
          actions.replaceProjectState(nextState, {
            dirty: options.dirty ?? true,
            modules: stateRef.projectModules,
          });
        },
        update(mutator, options = {}) {
          const draft = cloneValue(stateRef.state);
          mutator(draft);
          actions.replaceProjectState(draft, {
            dirty: options.dirty ?? true,
            modules: stateRef.projectModules,
          });
        },
        markDirty(value = true) {
          actions.markDirty(value);
        },
        recompute() {
          actions.recompute();
        },
        registerValidator(validatorId, handler) {
          return extensions.registerValidator(definition.id, validatorId, handler);
        },
        setPrintRenderer(renderer) {
          const unregister = extensions.setPrintRenderer(definition.id, renderer);
          actions.recompute();
          return unregister;
        },
      },
      uiSlots: {
        list() {
          return uiSlots.list();
        },
        mountHtml(slotId, html) {
          return uiSlots.mountHtml(definition.id, slotId, html);
        },
        appendButton(slotId, config) {
          return uiSlots.appendButton(definition.id, slotId, config);
        },
      },
      dialogs: {
        alert(message) {
          window.alert(message);
        },
        confirm(message) {
          return window.confirm(message);
        },
        chooseDirectory(defaultPath) {
          return bridge.chooseDirectory(defaultPath);
        },
      },
      catalog: {
        getOreKinds() {
          return cloneValue(stateRef.oreKinds);
        },
        getCustomsOffices() {
          return cloneValue(stateRef.customsOffices);
        },
        getOriginCountries() {
          return cloneValue(stateRef.originCountries);
        },
        async saveCustomsOffice(office) {
          const result = await bridge.saveCustomsOffice(office);
          stateRef.customsOffices = result.customsOffices || stateRef.customsOffices;
          renderers.renderCustomsOfficeOptions();
          renderers.populateInputs();
          actions.recompute();
          return cloneValue(result);
        },
        async saveOriginCountry(country) {
          const result = await bridge.saveOriginCountry(country);
          stateRef.originCountries = result.originCountries || stateRef.originCountries;
          renderers.renderOriginCountryOptions(stateRef.state?.originCountry || "");
          renderers.populateInputs();
          actions.recompute();
          return cloneValue(result);
        },
      },
    };
  }

  return {
    createContext(definition, options = {}) {
      const context = buildSharedContext(definition);

      if (options.builtIn) {
        context.system = {
          actions,
          bridge,
          renderers,
        };
      }

      return context;
    },
  };
}
