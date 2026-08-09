# Matiks Control Center

A small web extension skeleton for adding Matiks-specific automation workflows in the browser.

## First shipped feature

The first workflow is a selective unfriending assistant that uses the information described in the Matiks API analysis:

- Mutation target: `removeFriend(id: "TARGET_USER_ID")`
- Endpoint: `https://server.matiks.com/api`
- Required headers: `authorization` and `cookie`
- Rate-limit guardrail: one request at a time with a configurable delay between requests

## Start and use

1. Open your browser's extension page (`chrome://extensions` in Chromium-based browsers, or `edge://extensions` in Edge).
2. Enable Developer Mode.
3. Click Load unpacked and select this workspace directory.
4. Visit the Matiks website in the same browser profile while logged in.
5. Click the extension icon, fill the bearer/token field if you have a live `authorization` value available in the page/runtime, leave the cookie field out because the extension reads the Matiks cookies from the cookie store automatically.
6. Use the popup to load friends, preview the filter result, and execute the removal run.

## Files

- `manifest.json` describes the host permissions, popup action, service worker, and content script.
- `background.js` exposes the popup-to-worker command surface and performs the asynchronous API loop.
- `matiks-client.js` wraps GraphQL requests and the removal mutation.
- `popup.html` / `popup.css` / `popup.js` make the popup UI available to the user.

## Cookie/authentication model

The extension is not expected to ask the user to paste cookies manually. It can call the `cookies` API to read Matiks cookies automatically for the configured host permissions, and it can store a bearer token in extension storage if the popup receives one from the page or from the user. If the Matiks login flow only exposes the bearer token as a runtime value and not a persistent API-call surface for the extension, the current popup UI lets the user paste that token once; otherwise it should be read from browser storage or the active page and injected through the service-worker request layer.

## Notes

The extension stores the API token in Chromium storage and reads active session cookies through the browser cookie API. The live Matiks GraphQL query shape for friend extraction will need to be tuned to the actual schema exposed by the site after logging in.
