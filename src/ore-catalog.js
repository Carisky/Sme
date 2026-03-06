const path = require("path");
const fs = require("fs");
const {
  createOreCatalogClient,
  saveCustomsOffice: persistCustomsOffice,
  seedDefaultCustomsOffices,
  seedDefaultOreKinds,
} = require("./ore-catalog-store");

let prismaClient;

function getDatabasePath() {
  const packagedPath = path.join(
    __dirname,
    "..",
    "..",
    "app.asar.unpacked",
    "prisma",
    "dev.db"
  );
  if (fs.existsSync(packagedPath)) {
    return packagedPath;
  }

  return path.join(__dirname, "..", "prisma", "dev.db");
}

function getPrismaClient() {
  if (!prismaClient) {
    prismaClient = createOreCatalogClient(getDatabasePath());
  }

  return prismaClient;
}

async function listOreKinds() {
  const prisma = getPrismaClient();
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
  const prisma = getPrismaClient();
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

async function saveCustomsOffice(office) {
  const prisma = getPrismaClient();
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
  listOreKinds,
  saveCustomsOffice,
};
