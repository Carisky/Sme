const {
  deleteOreKind,
  listCustomsOffices,
  listOriginCountries,
  listOreKinds,
  loadAppSettings,
  loadModuleStorage,
  loadVerifiedRelease,
  saveCustomsOffice,
  saveAppSettings,
  saveModuleStorage,
  saveOreKind,
  saveOriginCountry,
  saveVerifiedRelease,
} = require("../../ore-catalog");
const { buildStateFromAppSettings, createEmptyState } = require("../../core");

function createCatalogService() {
  async function loadBootstrapData() {
    let appSettings = {};
    let oreKinds = [];
    let customsOffices = [];
    let originCountries = [];
    let catalogError = null;

    try {
      appSettings = await loadAppSettings();
      oreKinds = await listOreKinds();
      customsOffices = await listCustomsOffices();
      originCountries = await listOriginCountries();
    } catch (error) {
      catalogError = `Nie udało się odczytać słowników aplikacji: ${error.message}`;
    }

    return {
      state: createEmptyState(buildStateFromAppSettings(appSettings)),
      oreKinds,
      customsOffices,
      originCountries,
      catalogError,
    };
  }

  return {
    deleteOreKind,
    loadBootstrapData,
    listCustomsOffices,
    listOriginCountries,
    listOreKinds,
    loadAppSettings,
    loadModuleStorage,
    loadVerifiedRelease,
    saveCustomsOffice,
    saveAppSettings,
    saveModuleStorage,
    saveOreKind,
    saveOriginCountry,
    saveVerifiedRelease,
  };
}

module.exports = {
  createCatalogService,
};
