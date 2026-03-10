export function createExtensionRegistry() {
  const validators = new Map();
  let printRenderer = null;
  let printRendererOwner = null;

  return {
    registerValidator(ownerId, validatorId, handler) {
      const key = `${ownerId}:${validatorId}`;
      validators.set(key, handler);
      return () => {
        validators.delete(key);
      };
    },
    applyValidators(snapshot, context) {
      const nextSnapshot = {
        ...snapshot,
        validation: {
          ...snapshot.validation,
          errors: [...(snapshot.validation?.errors || [])],
        },
      };

      for (const validator of validators.values()) {
        const errors = validator(context) || [];
        if (Array.isArray(errors)) {
          nextSnapshot.validation.errors.push(...errors.filter(Boolean));
        }
      }

      return nextSnapshot;
    },
    setPrintRenderer(ownerId, renderer) {
      printRendererOwner = ownerId;
      printRenderer = typeof renderer === "function" ? renderer : null;
      return () => {
        if (printRendererOwner === ownerId) {
          printRendererOwner = null;
          printRenderer = null;
        }
      };
    },
    getPrintRenderer() {
      return printRenderer;
    },
  };
}
