export default {
  id: "excel-import",
  name: "Excel Import",
  version: "1.0.0",
  source: "built-in",
  activate(ctx) {
    ctx.commands.register("import", () => ctx.system.actions.importProject());
  },
};
