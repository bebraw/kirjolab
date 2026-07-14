import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function ensureGeneratedStylesheet(): void {
  mkdirSync(".generated", { recursive: true });
  writeFileSync(join(".generated", "styles.css"), ":root{--color-app-canvas:#f3eee6;}", "utf8");
  writeFileSync(join(".generated", "app.txt"), "export {};", "utf8");
  writeFileSync(join(".generated", "service-worker.txt"), "self.addEventListener('fetch',()=>{});", "utf8");
  writeFileSync(join(".generated", "pdf-worker.txt"), "export {};", "utf8");
}
