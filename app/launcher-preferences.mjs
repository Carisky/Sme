export function normalizeLauncherVisibility(value = null) {
  const sourceIds = Array.isArray(value?.hiddenMiniAppIds) ? value.hiddenMiniAppIds : [];
  const hiddenMiniAppIds = [];
  const seenIds = new Set();

  for (const entry of sourceIds) {
    const normalizedId = String(entry || "").trim();
    if (!normalizedId || seenIds.has(normalizedId)) {
      continue;
    }

    seenIds.add(normalizedId);
    hiddenMiniAppIds.push(normalizedId);
  }

  return {
    hiddenMiniAppIds,
  };
}

export function filterVisibleMiniApps(miniApps = [], visibility = null) {
  const hiddenIds = new Set(normalizeLauncherVisibility(visibility).hiddenMiniAppIds);

  return (Array.isArray(miniApps) ? miniApps : []).filter((miniApp) => {
    const miniAppId = String(miniApp?.id || "").trim();
    return miniAppId && !hiddenIds.has(miniAppId);
  });
}

export function countVisibleMiniApps(miniApps = [], visibility = null) {
  return filterVisibleMiniApps(miniApps, visibility).length;
}
