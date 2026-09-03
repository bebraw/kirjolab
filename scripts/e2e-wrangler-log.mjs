import { open } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_TAIL_BYTES = 64 * 1024;

export async function createWranglerLog(directory) {
  const path = join(directory, "wrangler.log");
  const handle = await open(path, "w+");
  let closed = false;

  async function close() {
    if (closed) return;
    closed = true;
    await handle.close();
  }

  async function readTail(maxBytes = DEFAULT_TAIL_BYTES) {
    if (closed) throw new Error("Cannot read a closed Wrangler log");

    const { size } = await handle.stat();
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    await close();

    const prefix = size > length ? `[earlier Wrangler output omitted; showing the final ${length} bytes]\n` : "";
    return `${prefix}${buffer.toString("utf8")}`;
  }

  return {
    close,
    path,
    readTail,
    stdio: ["inherit", handle.fd, handle.fd],
  };
}
