import { renderDefaultPrint } from "./default-print-renderer.js";

export default {
  id: "print-preview",
  name: "Print Preview",
  version: "1.0.0",
  source: "built-in",
  activate(ctx) {
    ctx.project.setPrintRenderer(renderDefaultPrint);
    ctx.commands.register("show-print", () => ctx.system.actions.showPrintPreview());
    ctx.commands.register("print", () => ctx.system.actions.printProject());
    ctx.commands.register("back", () => ctx.system.actions.goBackFromPrint());
    ctx.commands.register("choose-pdf-output-dir", () =>
      ctx.system.actions.choosePdfOutputDir()
    );
    ctx.commands.register("close-print-status", () =>
      ctx.system.renderers.closePrintStatusModal()
    );
  },
};
