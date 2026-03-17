export default {
  id: "ore-catalog",
  name: "Ore Catalog",
  version: "1.0.0",
  source: "built-in",
  activate(ctx) {
    ctx.commands.register("ore-kind-new", () => ctx.system.actions.createOreKindDraft());
    ctx.commands.register("ore-kind-save", () => ctx.system.actions.saveOreKind());
    ctx.commands.register("ore-kind-delete", () => ctx.system.actions.deleteOreKind());
    ctx.commands.register("office-new", () => ctx.system.actions.createOfficeDraft());
    ctx.commands.register("office-save", () => ctx.system.actions.saveOffice());
    ctx.commands.register("origin-country-new", () =>
      ctx.system.actions.createOriginCountryDraft()
    );
    ctx.commands.register("origin-country-save", () =>
      ctx.system.actions.saveOriginCountry()
    );
  },
};
