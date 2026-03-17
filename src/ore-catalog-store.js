const { pathToFileURL } = require("url");
const { PrismaLibSql } = require("@prisma/adapter-libsql");
const { PrismaClient } = require("@prisma/client");
const { ORE_TYPES } = require("./core");
const DEFAULT_ORE_KINDS = require("./default-ore-kinds");
const DEFAULT_CUSTOMS_OFFICES = require("./default-customs-offices");
const DEFAULT_ORIGIN_COUNTRIES = require("./default-origin-countries");

const APP_SETTINGS_KEY = "ui.settings";
const ORE_KIND_SEEDED_KEY = "catalog.ore-kinds.seeded.v1";

function createOreCatalogClient(databasePath) {
  const adapter = new PrismaLibSql({
    url: pathToFileURL(databasePath).href,
  });

  return new PrismaClient({ adapter });
}

async function ensureOreKindTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "OreKind" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "key" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "defaultOreType" TEXT,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "OreKind_key_key" ON "OreKind"("key")'
  );
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "OreKind_name_key" ON "OreKind"("name")'
  );
}

async function ensureCustomsOfficeTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CustomsOffice" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "code" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "addressLine1" TEXT NOT NULL,
      "addressLine2" TEXT NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "CustomsOffice_code_key" ON "CustomsOffice"("code")'
  );
}

async function ensureOriginCountryTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "OriginCountry" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "OriginCountry_name_key" ON "OriginCountry"("name")'
  );
}

async function ensureAppSettingTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AppSetting" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "key" TEXT NOT NULL,
      "valueJson" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "AppSetting_key_key" ON "AppSetting"("key")'
  );
}

async function loadAppSettingJson(prisma, key, fallbackJson = "{}") {
  await ensureAppSettingTable(prisma);

  const rows = await prisma.$queryRawUnsafe(
    'SELECT "valueJson" FROM "AppSetting" WHERE "key" = ? LIMIT 1',
    key
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return fallbackJson;
  }

  return String(rows[0].valueJson || fallbackJson);
}

async function saveAppSettingJson(prisma, key, valueJson) {
  await ensureAppSettingTable(prisma);

  const existing = await prisma.$queryRawUnsafe(
    'SELECT "id" FROM "AppSetting" WHERE "key" = ? LIMIT 1',
    key
  );

  if (Array.isArray(existing) && existing.length > 0) {
    await prisma.$executeRawUnsafe(
      'UPDATE "AppSetting" SET "valueJson" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?',
      valueJson,
      existing[0].id
    );
    return;
  }

  await prisma.$executeRawUnsafe(
    'INSERT INTO "AppSetting" ("key", "valueJson", "updatedAt") VALUES (?, ?, CURRENT_TIMESTAMP)',
    key,
    valueJson
  );
}

async function seedDefaultOreKinds(prisma) {
  await ensureOreKindTable(prisma);
  await ensureAppSettingTable(prisma);

  let alreadySeeded = false;
  try {
    alreadySeeded = JSON.parse(await loadAppSettingJson(prisma, ORE_KIND_SEEDED_KEY, "false")) === true;
  } catch {
    alreadySeeded = false;
  }

  if (!alreadySeeded) {
    const existingCount = await prisma.oreKind.count();
    if (existingCount === 0) {
      for (const [index, oreKind] of DEFAULT_ORE_KINDS.entries()) {
        await prisma.oreKind.create({
          data: {
            key: oreKind.key,
            name: oreKind.name,
            defaultOreType: oreKind.defaultOreType ?? null,
            sortOrder: index,
          },
        });
      }
    }

    await saveAppSettingJson(prisma, ORE_KIND_SEEDED_KEY, "true");
  }
}

async function seedDefaultCustomsOffices(prisma) {
  await ensureCustomsOfficeTable(prisma);

  for (const [index, office] of DEFAULT_CUSTOMS_OFFICES.entries()) {
    await prisma.customsOffice.upsert({
      where: { code: office.code },
      update: {
        name: office.name,
        addressLine1: office.addressLine1,
        addressLine2: office.addressLine2,
        sortOrder: index,
      },
      create: {
        code: office.code,
        name: office.name,
        addressLine1: office.addressLine1,
        addressLine2: office.addressLine2,
        sortOrder: index,
      },
    });
  }
}

async function seedDefaultOriginCountries(prisma) {
  await ensureOriginCountryTable(prisma);

  for (const [index, country] of DEFAULT_ORIGIN_COUNTRIES.entries()) {
    const existing = await prisma.$queryRawUnsafe(
      'SELECT "id" FROM "OriginCountry" WHERE "name" = ? LIMIT 1',
      country.name
    );

    if (Array.isArray(existing) && existing.length > 0) {
      await prisma.$executeRawUnsafe(
        'UPDATE "OriginCountry" SET "sortOrder" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?',
        index,
        existing[0].id
      );
      continue;
    }

    await prisma.$executeRawUnsafe(
      'INSERT INTO "OriginCountry" ("name", "sortOrder", "updatedAt") VALUES (?, ?, CURRENT_TIMESTAMP)',
      country.name,
      index
    );
  }
}

async function saveCustomsOffice(prisma, office) {
  await ensureCustomsOfficeTable(prisma);

  const payload = {
    code: String(office?.code || "").trim(),
    name: String(office?.name || "").trim(),
    addressLine1: String(office?.addressLine1 || "").trim(),
    addressLine2: String(office?.addressLine2 || "").trim(),
    sortOrder: Number.isFinite(Number(office?.sortOrder))
      ? Number(office.sortOrder)
      : 0,
  };

  if (!payload.code || !payload.name || !payload.addressLine1 || !payload.addressLine2) {
    throw new Error("Kod, nazwa i dwa wiersze adresu urzędu są wymagane.");
  }

  if (office?.id) {
    return prisma.customsOffice.update({
      where: { id: Number(office.id) },
      data: payload,
    });
  }

  return prisma.customsOffice.create({
    data: payload,
  });
}

async function saveOriginCountry(prisma, country) {
  await ensureOriginCountryTable(prisma);

  const payload = {
    name: String(country?.name || "").trim(),
    sortOrder: Number.isFinite(Number(country?.sortOrder))
      ? Number(country.sortOrder)
      : 0,
  };

  if (!payload.name) {
    throw new Error("Nazwa kraju pochodzenia jest wymagana.");
  }

  if (country?.id) {
    await prisma.$executeRawUnsafe(
      'UPDATE "OriginCountry" SET "name" = ?, "sortOrder" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?',
      payload.name,
      payload.sortOrder,
      Number(country.id)
    );

    const updated = await prisma.$queryRawUnsafe(
      'SELECT "id", "name", "sortOrder" FROM "OriginCountry" WHERE "id" = ? LIMIT 1',
      Number(country.id)
    );
    return Array.isArray(updated) ? updated[0] : updated;
  }

  await prisma.$executeRawUnsafe(
    'INSERT INTO "OriginCountry" ("name", "sortOrder", "updatedAt") VALUES (?, ?, CURRENT_TIMESTAMP)',
    payload.name,
    payload.sortOrder
  );

  const inserted = await prisma.$queryRawUnsafe(
    'SELECT "id", "name", "sortOrder" FROM "OriginCountry" WHERE "name" = ? LIMIT 1',
    payload.name
  );
  return Array.isArray(inserted) ? inserted[0] : inserted;
}

function slugifyOreKindName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function createUniqueOreKindKey(prisma, name) {
  const base = slugifyOreKindName(name) || "ore-kind";
  let suffix = 0;

  while (true) {
    const candidate = suffix === 0 ? `custom-${base}` : `custom-${base}-${suffix + 1}`;
    const existing = await prisma.oreKind.findUnique({
      where: { key: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    suffix += 1;
  }
}

async function saveOreKind(prisma, oreKind) {
  await ensureOreKindTable(prisma);

  const payload = {
    name: String(oreKind?.name || "").trim(),
    defaultOreType: String(oreKind?.defaultOreType || "").trim() || null,
    sortOrder: Number.isFinite(Number(oreKind?.sortOrder))
      ? Number(oreKind.sortOrder)
      : 0,
  };

  if (!payload.name) {
    throw new Error("Nazwa rodzaju rudy jest wymagana.");
  }

  if (payload.defaultOreType && !ORE_TYPES.includes(payload.defaultOreType)) {
    throw new Error("Wybrano nieprawidlowy typ rudy.");
  }

  const existingByName = await prisma.oreKind.findUnique({
    where: { name: payload.name },
    select: { id: true },
  });

  if (existingByName && Number(existingByName.id) !== Number(oreKind?.id)) {
    throw new Error(`Rodzaj rudy "${payload.name}" juz istnieje.`);
  }

  if (oreKind?.id) {
    const existing = await prisma.oreKind.findUnique({
      where: { id: Number(oreKind.id) },
      select: { id: true },
    });

    if (!existing) {
      throw new Error("Nie znaleziono wybranego rodzaju rudy.");
    }

    return prisma.oreKind.update({
      where: { id: Number(oreKind.id) },
      data: payload,
    });
  }

  return prisma.oreKind.create({
    data: {
      key: await createUniqueOreKindKey(prisma, payload.name),
      name: payload.name,
      defaultOreType: payload.defaultOreType,
      sortOrder: payload.sortOrder,
    },
  });
}

async function deleteOreKind(prisma, oreKindId) {
  await ensureOreKindTable(prisma);

  const normalizedId = Number(oreKindId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    throw new Error("Nieprawidlowy identyfikator rodzaju rudy.");
  }

  const existing = await prisma.oreKind.findUnique({
    where: { id: normalizedId },
  });

  if (!existing) {
    throw new Error("Nie znaleziono wybranego rodzaju rudy.");
  }

  await prisma.oreKind.delete({
    where: { id: normalizedId },
  });

  return existing;
}

async function loadAppSettingsJson(prisma) {
  return loadAppSettingJson(prisma, APP_SETTINGS_KEY, "{}");
}

async function saveAppSettingsJson(prisma, valueJson) {
  return saveAppSettingJson(prisma, APP_SETTINGS_KEY, valueJson);
}

module.exports = {
  createOreCatalogClient,
  deleteOreKind,
  loadAppSettingJson,
  loadAppSettingsJson,
  saveAppSettingJson,
  saveCustomsOffice,
  saveAppSettingsJson,
  saveOreKind,
  saveOriginCountry,
  seedDefaultCustomsOffices,
  seedDefaultOriginCountries,
  seedDefaultOreKinds,
};
