const { createRejContPrismaClient, getRejContPrismaClient } = require("../../rej-cont/prisma");
const { createContainer, listContainers } = require("../../rej-cont/store");
const { updateContainers } = require("../../rej-cont/update-controller");

function isMissingContainerTableError(error) {
  const message = String(error?.message || "");
  return error?.code === "P2021" || /container/i.test(message) && /exist|does not/i.test(message);
}

function createRejContService() {
  function getPrisma() {
    return getRejContPrismaClient();
  }

  async function listDbContainers(options = {}) {
    try {
      return await listContainers(getPrisma(), options);
    } catch (error) {
      if (isMissingContainerTableError(error)) {
        throw new Error(
          "Tabela Container nie istnieje jeszcze w bazie rej-cont. Uruchom migracje rej-cont."
        );
      }

      throw error;
    }
  }

  async function saveDbContainer(record = {}) {
    try {
      return {
        container: await createContainer(getPrisma(), record),
      };
    } catch (error) {
      if (isMissingContainerTableError(error)) {
        throw new Error(
          "Tabela Container nie istnieje jeszcze w bazie rej-cont. Uruchom migracje rej-cont."
        );
      }

      throw error;
    }
  }

  async function updateDbContainers(options = {}) {
    try {
      return await updateContainers(getPrisma(), options);
    } catch (error) {
      if (isMissingContainerTableError(error)) {
        throw new Error(
          "Tabela Container nie istnieje jeszcze w bazie rej-cont. Uruchom migracje rej-cont."
        );
      }

      throw error;
    }
  }

  return {
    createPrismaClient: createRejContPrismaClient,
    listDbContainers,
    saveDbContainer,
    updateDbContainers,
  };
}

module.exports = {
  createRejContService,
};
