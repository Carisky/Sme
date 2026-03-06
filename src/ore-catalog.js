const path = require("path");
const fs = require("fs");
const {
  createOreCatalogClient,
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

async function disconnectOreCatalog() {
  if (!prismaClient) {
    return;
  }

  await prismaClient.$disconnect();
  prismaClient = null;
}

module.exports = {
  disconnectOreCatalog,
  listOreKinds,
};
