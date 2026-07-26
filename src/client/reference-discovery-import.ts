import { referenceDiscoveryCslRecord, type ReferenceDiscoveryResult } from "../domain/reference-discovery";
import { expectOk } from "./http";

export async function importDiscoveredReference(result: ReferenceDiscoveryResult): Promise<void> {
  const response = await fetch("/api/library/import/csl-json", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([referenceDiscoveryCslRecord(result)]),
  });
  await expectOk(response);
}
