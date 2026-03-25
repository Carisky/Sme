const { postContainerLookup } = require("./shared");

const DEFAULT_DCT_LOOKUP_URL = "http://localhost:3400/lookup?t_status=true";
const DEFAULT_API_KEY_HEADER = "x-api-access";
const DEFAULT_API_KEY = "dev-local-key";

async function lookupDctContainers(containers, options = {}) {
  const apiKeyHeader =
    process.env.REJ_CONT_API_KEY_HEADER ||
    process.env.API_KEY_HEADER ||
    DEFAULT_API_KEY_HEADER;
  const apiKey =
    process.env.REJ_CONT_API_KEY ||
    process.env.REJ_CONT_DCT_API_KEY ||
    process.env.API_KEY ||
    DEFAULT_API_KEY;

  return postContainerLookup({
    label: "DCT",
    url:
      options.url ||
      process.env.REJ_CONT_DCT_LOOKUP_URL ||
      DEFAULT_DCT_LOOKUP_URL,
    containers,
    headers: apiKey
      ? {
          [apiKeyHeader]: apiKey,
        }
      : {},
  });
}

module.exports = {
  DEFAULT_DCT_LOOKUP_URL,
  lookupDctContainers,
};
