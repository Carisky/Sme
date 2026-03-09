export const bridge = window.bridge;
export const persistedSettingsPaths = new Set(bridge.meta.persistedSettingsPaths || []);

export function cloneValue(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}
