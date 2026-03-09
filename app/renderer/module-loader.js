function normalizeLoadedModule(entry, fallback = {}) {
  const raw = entry?.default || entry?.moduleDefinition || entry;
  const id = String(raw?.id || fallback.id || "").trim();
  if (!id) {
    return null;
  }

  return {
    ...raw,
    id,
    name: String(raw.name || fallback.name || id).trim() || id,
    version: String(raw.version || fallback.version || "0.0.0").trim() || "0.0.0",
    source: String(raw.source || fallback.source || "user"),
  };
}

export async function loadUserModules(moduleEntries = []) {
  const loaded = [];

  for (const moduleEntry of moduleEntries) {
    if (!moduleEntry?.entryUrl) {
      continue;
    }

    try {
      const imported = await import(moduleEntry.entryUrl);
      const normalized = normalizeLoadedModule(imported, moduleEntry);
      if (normalized) {
        loaded.push(normalized);
      }
    } catch (error) {
      console.error(`Failed to load module ${moduleEntry.id || moduleEntry.entryUrl}:`, error);
    }
  }

  return loaded;
}
