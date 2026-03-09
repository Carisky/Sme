export function createCommandRegistry() {
  const commands = new Map();

  return {
    register(commandId, handler, metadata = {}) {
      const normalizedId = String(commandId || "").trim();
      if (!normalizedId) {
        throw new Error("Command id is required.");
      }

      if (typeof handler !== "function") {
        throw new Error(`Command ${normalizedId} must provide a handler.`);
      }

      if (commands.has(normalizedId)) {
        throw new Error(`Command ${normalizedId} is already registered.`);
      }

      commands.set(normalizedId, {
        id: normalizedId,
        handler,
        metadata: { ...metadata },
      });
    },
    has(commandId) {
      return commands.has(String(commandId || "").trim());
    },
    async execute(commandId, payload) {
      const normalizedId = String(commandId || "").trim();
      const command = commands.get(normalizedId);
      if (!command) {
        throw new Error(`Unknown command: ${normalizedId}`);
      }

      return command.handler(payload);
    },
    list() {
      return Array.from(commands.values()).map((entry) => ({
        id: entry.id,
        ...entry.metadata,
      }));
    },
  };
}
