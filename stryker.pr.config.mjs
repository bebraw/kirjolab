// @ts-check

import baseConfig from "./stryker.config.mjs";

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
const config = {
  ...baseConfig,
  jsonReporter: {
    fileName: "reports/mutation/pull-request.json",
  },
  reporters: ["progress", "json"],
  thresholds: {
    ...baseConfig.thresholds,
    break: null,
  },
};

export default config;
