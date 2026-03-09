const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const { app } = require("electron");
const { normalizeAppSettings } = require("./core");
const { VERIFIED_RELEASE_KEY } = require("./update-common");
const {
  createOreCatalogClient,
  loadAppSettingJson,
  loadAppSettingsJson: readAppSettingsJson,
  saveAppSettingJson,
  saveCustomsOffice: persistCustomsOffice,
  saveAppSettingsJson: persistAppSettingsJson,
  saveOriginCountry: persistOriginCountry,
  seedDefaultCustomsOffices,
  seedDefaultOriginCountries,
  seedDefaultOreKinds,
} = require("./ore-catalog-store");

let prismaClient;
let databasePathPromise;

function getBundledDatabasePath() {
  const candidates = [
    path.join(process.resourcesPath || "", "prisma", "dev.db"),
    path.join(__dirname, "..", "..", "app.asar.unpacked", "prisma", "dev.db"),
    path.join(__dirname, "..", "prisma", "dev.db"),
  ];

  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function getWritableDatabasePath() {
  if (!app.isPackaged) {
    return path.join(__dirname, "..", "prisma", "dev.db");
  }

  return path.join(app.getPath("appData"), "SME", "dev.db");
}

async function ensureDatabasePath() {
  if (!databasePathPromise) {
    databasePathPromise = (async () => {
      const targetPath = getWritableDatabasePath();
      const sourcePath = getBundledDatabasePath();

      await fsp.mkdir(path.dirname(targetPath), { recursive: true });
      if (!fs.existsSync(targetPath) && sourcePath) {
        await fsp.copyFile(sourcePath, targetPath);
      }

      return targetPath;
    })();
  }

  return databasePathPromise;
}

async function getPrismaClient() {
  if (!prismaClient) {
    prismaClient = createOreCatalogClient(await ensureDatabasePath());
  }

  return prismaClient;
}

async function listOreKinds() {
  const prisma = await getPrismaClient();
  await seedDefaultOreKinds(prisma);
  return prisma.oreKind.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      name: true,
      defaultOreType: true,
    },
  });
}

async function listCustomsOffices() {
  const prisma = await getPrismaClient();
  await seedDefaultCustomsOffices(prisma);
  return prisma.customsOffice.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      addressLine1: true,
      addressLine2: true,
      sortOrder: true,
    },
  });
}

async function listOriginCountries() {
  const prisma = await getPrismaClient();
  await seedDefaultOriginCountries(prisma);
  return prisma.$queryRawUnsafe(
    'SELECT "id", "name", "sortOrder" FROM "OriginCountry" ORDER BY "sortOrder" ASC, "name" ASC'
  );
}

async function saveCustomsOffice(office) {
  const prisma = await getPrismaClient();
  const savedOffice = await persistCustomsOffice(prisma, office);
  return {
    savedOffice: {
      id: savedOffice.id,
      code: savedOffice.code,
      name: savedOffice.name,
      addressLine1: savedOffice.addressLine1,
      addressLine2: savedOffice.addressLine2,
      sortOrder: savedOffice.sortOrder,
    },
    customsOffices: await listCustomsOffices(),
  };
}

async function saveOriginCountry(country) {
  const prisma = await getPrismaClient();
  const savedCountry = await persistOriginCountry(prisma, country);
  return {
    savedCountry: {
      id: savedCountry.id,
      name: savedCountry.name,
      sortOrder: savedCountry.sortOrder,
    },
    originCountries: await listOriginCountries(),
  };
}

async function loadAppSettings() {
  const prisma = await getPrismaClient();

  try {
    return normalizeAppSettings(JSON.parse(await readAppSettingsJson(prisma)));
  } catch {
    return normalizeAppSettings({});
  }
}

async function saveAppSettings(settings) {
  const prisma = await getPrismaClient();
  const normalizedSettings = normalizeAppSettings(settings);

  await persistAppSettingsJson(prisma, JSON.stringify(normalizedSettings));
  return normalizedSettings;
}

async function loadModuleStorage(moduleId) {
  const prisma = await getPrismaClient();
  const normalizedId = String(moduleId || "").trim();
  if (!normalizedId) {
    return null;
  }

  try {
    return JSON.parse(
      await loadAppSettingJson(prisma, `module.storage.${normalizedId}`, "null")
    );
  } catch {
    return null;
  }
}

async function saveModuleStorage(moduleId, value) {
  const prisma = await getPrismaClient();
  const normalizedId = String(moduleId || "").trim();
  if (!normalizedId) {
    throw new Error("Module storage key is required.");
  }

  await saveAppSettingJson(
    prisma,
    `module.storage.${normalizedId}`,
    JSON.stringify(value ?? null)
  );
  return value ?? null;
}

async function loadVerifiedRelease() {
  const prisma = await getPrismaClient();

  try {
    return JSON.parse(await loadAppSettingJson(prisma, VERIFIED_RELEASE_KEY, "null"));
  } catch {
    return null;
  }
}

async function saveVerifiedRelease(releaseState) {
  const prisma = await getPrismaClient();
  const normalizedState =
    releaseState && typeof releaseState === "object" ? releaseState : null;

  await saveAppSettingJson(prisma, VERIFIED_RELEASE_KEY, JSON.stringify(normalizedState));
  return normalizedState;
}

async function disconnectOreCatalog() {
  if (!prismaClient) {
    return;
  }

  await prismaClient.$disconnect();
  prismaClient = null;
}

module.exports = {
  disconnectOreCatalog,
  listCustomsOffices,
  listOriginCountries,
  listOreKinds,
  loadAppSettings,
  loadModuleStorage,
  loadVerifiedRelease,
  saveCustomsOffice,
  saveAppSettings,
  saveModuleStorage,
  saveVerifiedRelease,
  saveOriginCountry,
};
