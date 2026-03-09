const {
  listCustomsOffices,
  listOriginCountries,
  listOreKinds,
  loadAppSettings,
  loadModuleStorage,
  loadVerifiedRelease,
  saveCustomsOffice,
  saveAppSettings,
  saveModuleStorage,
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
      catalogError = `Nie udalo sie odczytac slownikow aplikacji: ${error.message}`;
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
    saveOriginCountry,
    saveVerifiedRelease,
  };
}

module.exports = {
  createCatalogService,
};
