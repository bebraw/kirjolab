# Checks

Run these after applying the Lighthouse performance kit.

```bash
LIGHTHOUSE_URL=http://127.0.0.1:3000 LIGHTHOUSE_SERVER_COMMAND="npm run dev" npm run lighthouse
```

Adapt the URL and server command to the target repo.

Expected:

- Reports are written under `reports/lighthouse/`.
- The script exits non-zero when a mode falls below `LIGHTHOUSE_MIN_PERFORMANCE_SCORE`.
- The target repo's normal quality gate still passes.
