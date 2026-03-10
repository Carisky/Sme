export default {
  id: "ore-catalog",
  name: "Ore Catalog",
  version: "1.0.0",
  source: "built-in",
  activate(ctx) {
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
