const { postContainerLookup } = require("./shared");

async function lookupBctContainers(containers, options = {}) {
  return postContainerLookup({
    label: "BCT",
    url: options.url || process.env.REJ_CONT_BCT_LOOKUP_URL || "",
    containers,
  });
}

module.exports = {
  lookupBctContainers,
};
