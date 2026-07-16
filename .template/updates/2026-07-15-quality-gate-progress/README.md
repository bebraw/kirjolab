# Emit Quality-Gate Progress

Use this when a sequential local quality gate can remain quiet long enough for contributors or agents to mistake a slow phase for a hung command.

## Apply

1. Add `scripts/run-quality-gate.mjs` and its tooling test.
2. Change the canonical `quality:gate` package script to run the new runner.
3. Ensure the tooling test command includes `scripts/run-quality-gate.test.mjs`.
4. Adapt the runner's phase list if the target uses different fast, browser, or mutation script names.
5. Document the named phase transitions and 30-second elapsed-time heartbeat in the target project's quality-gate contract.

## Fallback

If the target project already has a task runner, add the same transition and heartbeat behavior there instead of introducing a second orchestration layer. Preserve sequential fail-fast execution and inherited standard I/O so child-tool output remains live.

## Verify

- `npm run test:tooling`
- `npm run quality:gate`
- `npm run ci:local`

During the full gate, confirm each phase is named when it starts and that a phase running longer than 30 seconds emits an elapsed-time heartbeat.
