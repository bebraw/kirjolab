# Browser Debugging

Use a dedicated Chrome profile with the DevTools Protocol enabled when another local agent or script needs to inspect the Studio browser session.

## Start Chrome

On macOS, launch a separate debug Chrome instance:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-kirjolab-debug \
  --no-first-run \
  --no-default-browser-check
```

Keep this browser window open while debugging. The separate `--user-data-dir` keeps the debugging session isolated from your normal Chrome profile.

## Open The Studio

Start the repository server:

```bash
npm run dev
```

Then open Kirjolab in the debug Chrome window:

```text
http://127.0.0.1:8787
```

## Check The Hook

Confirm that the DevTools endpoint is reachable:

```bash
curl http://127.0.0.1:9222/json/version
```

The response should include a `webSocketDebuggerUrl`. Scripts can use that endpoint, or Playwright can connect over CDP with:

```js
import { chromium } from "@playwright/test";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0]?.pages()[0];
```

## Refresh Build Week Media

Leave the dedicated debug Chrome window open, stop any server already using
ports `8788` or `9230`, and run:

```bash
npm run media:build-week
```

The command starts its own temporary-persistence end-to-end Worker, creates an
owned browser context at `2880x1920` output resolution, seeds synthetic data,
and writes the validated fifteen-image set plus captions below
`.generated/build-week-media/`. It does not use an existing tab or close the
debug Chrome process. Validate an existing set without opening a browser or
starting a Worker with:

```bash
npm run media:build-week -- --validate
```

Set `KIRJOLAB_BUILD_WEEK_CDP_URL` only when the dedicated loopback HTTP endpoint
uses a port other than `9222`. Generated media is ignored and should remain out
of commits.

## Safety Notes

- Bind the endpoint locally and do not expose port `9222` to a network.
- Use the dedicated profile path above instead of attaching automation to a normal browser profile.
- Let the media command create its own context; do not adapt it to reuse a signed-in tab.
- Close the debug Chrome window when the session is finished.
