import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";
import {
  getRejContDatasourceUrl,
  getRejContShadowDatabaseUrl,
  isRejContSchemaSelected,
} from "./prisma/config-utils";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const useRejContModule = isRejContSchemaSelected(configDirectory);

export default defineConfig({
  schema: useRejContModule ? "prisma/rej-cont/schema.prisma" : "prisma/schema.prisma",
  migrations: useRejContModule
    ? {
        path: "prisma/rej-cont/migrations",
      }
    : {
        path: "prisma/migrations",
        seed: "node prisma/seed.js",
      },
  datasource: {
    url: useRejContModule ? getRejContDatasourceUrl(configDirectory) : "file:./prisma/dev.db",
    shadowDatabaseUrl: useRejContModule ? getRejContShadowDatabaseUrl(configDirectory) : undefined,
  },
});
