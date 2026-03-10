import { createActions } from "./actions.js";
import { createCommandRegistry } from "./command-registry.js";
import { createExtensionRegistry } from "./extension-registry.js";
import { wireEvents } from "./events.js";
import { loadUserModules } from "./module-loader.js";
import { createModuleContextFactory } from "./module-context.js";
import { createModuleRegistry } from "./module-registry.js";
import { createRenderers } from "./renderers.js";
import { createAppStore } from "./store.js";
import { createUiSlots } from "./ui-slots.js";
import { bridge } from "./bridge.js";
import { builtInModules } from "./modules/builtins/index.js";

async function bootstrap() {
  const store = createAppStore();
  const commands = createCommandRegistry();
  const extensions = createExtensionRegistry();
  const uiSlots = createUiSlots();
  const renderers = createRenderers({ store, extensions });
  const actions = createActions({ store, renderers, extensions });
  const contextFactory = createModuleContextFactory({
    store,
    actions,
    renderers,
    commands,
    uiSlots,
    extensions,
  });
  const moduleRegistry = createModuleRegistry({
    createContext: (definition, options) => contextFactory.createContext(definition, options),
  });

  renderers.buildTables();

  const bootstrapResult = await bridge.bootstrap();
  store.setUserModules(bootstrapResult.userModules || []);

  const builtInActivated = await moduleRegistry.activateMany(
    builtInModules.map((definition) => ({
      definition,
      builtIn: true,
      source: "built-in",
    }))
  );

  const userModules = await loadUserModules(store.state.userModules);
  const userActivated = [];
  for (const definition of userModules) {
    try {
      const [activated] = await moduleRegistry.activateMany([
        {
          definition,
          builtIn: false,
          source: "user",
        },
      ]);
      if (activated) {
        userActivated.push(activated);
      }
    } catch (error) {
      console.error(`Failed to activate module ${definition.id}:`, error);
    }
  }

  store.setLoadedModules([...builtInActivated, ...userActivated]);

  bridge.onPrintStatus(renderers.handlePrintStatusEvent);
  bridge.onUpdateStatus(renderers.handleUpdateStatusEvent);
  wireEvents({ commands, actions, renderers });
  actions.applyBootstrapPayload(bootstrapResult);
}

bootstrap().catch((error) => {
  console.error(error);
  window.alert(error.message);
});
