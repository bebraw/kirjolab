import { runModelCompanion } from "../src/model-companion.ts";

try {
  const server = await runModelCompanion();
  server.on("error", reportStartupError);
} catch (error) {
  reportStartupError(error);
}

function reportStartupError(error) {
  process.stderr.write(`Unable to start Kirjolab model companion: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
