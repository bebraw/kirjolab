import { loadEnvFile } from "node:process";
import { readModelCompanionConfig, startModelCompanion } from "../src/model-companion.ts";

const args = process.argv.slice(2);
const usage = "Usage: kirjolab-model-companion [--env-file <path>]";

try {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    process.stdout.write(`${usage}\n`);
  } else {
    if (args.length !== 0) {
      if (args.length !== 2 || args[0] !== "--env-file" || !args[1]) throw new Error(usage);
      loadEnvFile(args[1]);
    }
    const config = readModelCompanionConfig(process.env);
    if (config.kind === "codex") {
      throw new Error("Select the openai-compatible provider for this package. The repository companion supports Codex.");
    }
    startModelCompanion(config).on("error", reportStartupError);
  }
} catch (error) {
  reportStartupError(error);
}

function reportStartupError(error) {
  process.stderr.write(`Unable to start Kirjolab model companion: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
