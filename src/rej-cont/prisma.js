const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("../../node_modules/.prisma/rej-cont-client");
const { initializeRejContRuntimeEnv } = require("./env");

let prismaClient = null;

function getRejContDatabaseUrl(options = {}) {
  initializeRejContRuntimeEnv(options.env);

  const databaseUrl = String(
    options.datasourceUrl || process.env.POSTGRES_DATABASE_URL || process.env.DATABASE_URL || ""
  ).trim();

  if (!databaseUrl) {
    throw new Error(
      "Rej-cont PostgreSQL is not configured. Set POSTGRES_DATABASE_URL or DATABASE_URL."
    );
  }

  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error("Rej-cont PostgreSQL URL must start with postgres:// or postgresql://.");
  }

  return databaseUrl;
}

function createRejContPrismaClient(options = {}) {
  const adapter = new PrismaPg({
    connectionString: getRejContDatabaseUrl(options),
  });

  return new PrismaClient({
    adapter,
  });
}

function getRejContPrismaClient(options = {}) {
  if (!prismaClient) {
    prismaClient = createRejContPrismaClient(options);
  }

  return prismaClient;
}

async function disconnectRejContPrisma() {
  if (!prismaClient) {
    return;
  }

  await prismaClient.$disconnect();
  prismaClient = null;
}

module.exports = {
  createRejContPrismaClient,
  disconnectRejContPrisma,
  getRejContDatabaseUrl,
  getRejContPrismaClient,
};
