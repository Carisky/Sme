const { postContainerLookup } = require("./shared");

async function lookupGctContainers(containers, options = {}) {
  return postContainerLookup({
    label: "GCT",
    url: options.url || process.env.REJ_CONT_GCT_LOOKUP_URL || "",
    containers,
  });
}

module.exports = {
  lookupGctContainers,
};
