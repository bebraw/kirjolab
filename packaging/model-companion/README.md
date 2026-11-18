# Kirjolab Model Companion

The companion runs on the same Mac as your browser. It connects Kirjolab to an
OpenAI-compatible model on your computer or to an HTTPS gateway you can reach,
such as the Aalto LLM Gateway. The package requires Node.js 24 or later and npm.

## Connect to the Aalto LLM Gateway

1. Connect your Mac to the Aalto VPN. Create a personal API key from the
   [Aalto LLM Gateway](https://llm-gateway.k8s.aalto.fi/) and get the exact model
   ID from your colleague or the gateway.
2. Run `openssl rand -hex 32` in Terminal to generate a separate companion
   token. Run `umask 077` before creating a new file named `companion.env`
   in a private folder. Add these settings and replace the example values.

   ```dotenv
   KIRJOLAB_MODEL_COMPANION_ORIGIN=https://your-kirjolab-site.example
   KIRJOLAB_MODEL_UPSTREAM=https://llm-gateway.k8s.aalto.fi/api/v1/chat/completions
   KIRJOLAB_MODEL_UPSTREAM_MODEL=exact-model-id
   KIRJOLAB_MODEL_UPSTREAM_API_KEY=your-aalto-api-key
   KIRJOLAB_MODEL_COMPANION_TOKEN=the-token-you-generated
   ```

   The Kirjolab origin is the scheme and hostname of the page you open, plus
   its port if present. Leave out the path and trailing slash. Keep the file
   private and share only the gateway URL, Kirjolab origin, and model ID.

3. In Terminal, start the companion from the folder containing
   `companion.env`. Leave it running while you use the model. For a release
   published to npm, run this command.

   ```sh
   npx kirjolab-model-companion@0.1.0 --env-file ./companion.env
   ```

   If your colleague supplied an npm tarball, run this from the folder with
   both files.

   ```sh
   npm exec --package=./kirjolab-model-companion-0.1.0.tgz -- kirjolab-model-companion --env-file ./companion.env
   ```

4. In Kirjolab, open **Model connection** and select **Local companion**. Keep
   the endpoint `http://127.0.0.1:8790/v1/chat/completions`. Enter the generated
   value in **Companion token (for remote gateways)** and click **Find loaded
   models**. Select **Provider default** for reasoning to use the model's usual
   settings. Kirjolab selects the model ID from your config.

The Aalto API key stays in the companion. Kirjolab keeps the separate companion
token in the current tab session. The companion sends the writing request
directly to Aalto over your VPN. See [Aalto's gateway guide](https://scicomp.aalto.fi/aalto/llm-web-apis/)
for API access and available models.

The model list shows the configured ID even while the VPN is disconnected.
Try a short writing request to verify the connection. If the browser asks for
permission to reach the local network, allow it for your Kirjolab site. A
401 from the companion means to check the companion token in Kirjolab.
If Kirjolab reports that the gateway rejected the API key, check the key in
`companion.env` and restart the companion. For an unavailable gateway, check
the VPN and exact endpoint. Aalto's on-demand models may take time to start.

## Connect to a model on your Mac

Use the same npm command with an env file containing the exact Kirjolab origin
and your model server's loopback completion URL.

```dotenv
KIRJOLAB_MODEL_COMPANION_ORIGIN=https://your-kirjolab-site.example
KIRJOLAB_MODEL_UPSTREAM=http://127.0.0.1:1234/v1/chat/completions
```

Leave the companion token blank in Kirjolab and click **Find loaded models**.
The companion reads the model server's `/models` route.
