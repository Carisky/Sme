export default {
  id: "core-document",
  name: "Core Document",
  version: "1.0.0",
  source: "built-in",
  activate(ctx) {
    ctx.commands.register("go-home", () => ctx.dialogs.openHome());
    ctx.commands.register("new", () => ctx.system.actions.createNewProject());
    ctx.commands.register("open", () => ctx.system.actions.openProject());
    ctx.commands.register("save", () => ctx.system.actions.saveProject());
    ctx.commands.register("saveAs", () => ctx.system.actions.saveProjectAs());
    ctx.commands.register("update-retry", () => ctx.system.actions.refreshUpdateGate());
    ctx.commands.register("update-install", () =>
      ctx.system.actions.startMandatoryUpdateInstall()
    );
  },
};
