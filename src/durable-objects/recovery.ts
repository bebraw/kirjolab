export async function currentRecoveryBookmark(storage: DurableObjectStorage, authenticationMode: string): Promise<string | null> {
  if (authenticationMode === "local") return null;
  return await storage.getCurrentBookmark();
}
