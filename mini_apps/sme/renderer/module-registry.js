function normalizeDefinition(input = {}, fallback = {}) {
  const raw = input?.default || input?.moduleDefinition || input;
  const id = String(raw?.id || fallback.id || "").trim();
  if (!id) {
    return null;
  }

  return {
    id,
    name: String(raw.name || fallback.name || id).trim() || id,
    version: String(raw.version || fallback.version || "0.0.0").trim() || "0.0.0",
    source: String(raw.source || fallback.source || "user"),
    activate: typeof raw.activate === "function" ? raw.activate : null,
  };
}

export function createModuleRegistry({ createContext }) {
  const modules = new Map();

  async function activateModule(input, options = {}) {
    const definition = normalizeDefinition(input, options);
    if (!definition) {
      throw new Error("Module definition is invalid.");
    }

    if (modules.has(definition.id)) {
      throw new Error(`Module ${definition.id} is already activated.`);
    }

    const context = createContext(definition, options);
    if (definition.activate) {
      await definition.activate(context);
    }

    const record = {
      id: definition.id,
      name: definition.name,
      version: definition.version,
      source: definition.source,
    };
    modules.set(definition.id, record);
    return record;
  }

  return {
    async activateMany(entries = []) {
      const activated = [];

      for (const entry of entries) {
        if (!entry) {
          continue;
        }

        const input = entry.definition || entry;
        const options =
          entry && typeof entry === "object" && entry.definition
            ? { ...entry, definition: undefined }
            : {};
        activated.push(await activateModule(input, options));
      }

      return activated;
    },
    list() {
      return Array.from(modules.values());
    },
  };
}
