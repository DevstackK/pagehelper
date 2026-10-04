# Page Answer Helper

A generic Chrome/Edge side-panel extension: scan visible page text, edit what is sent, and select multiple-choice answers and advance with Next. Includes a text-only answer mode and optional continued operation through question pages.

## Run locally

Requires Node.js 20.12+ and an AI service. No npm dependencies.

1. For Claude, open `.env` beside `package.json` and fill in `ANTHROPIC_API_KEY`. If using Ollama, set `AI_PROVIDER=compatible` and `AI_MODEL=llama3.2` in `.env`, then install it and run `ollama pull llama3.2`. Keep Ollama running. Alternatively use Claude or a chat-completions-compatible service using the variables below.
2. In this folder run `npm start`.
3. Open `chrome://extensions` (or `edge://extensions`), enable **Developer mode**, choose **Load unpacked**, and select this project's `extension` folder.
4. Open your training page, click the extension toolbar icon, and expand **Connection settings**. Paste the pairing token printed by the server.
5. Click **Answer & move on** to scan, select answers, and click Next. Enable **Keep going** to repeat for up to 50 question pages. Use **Stop** to halt. For text-only answers, scan or paste text and choose **Answer as text instead**.

After switching to a different site, click the toolbar icon on that tab to grant access. Scan again after advancing a lesson. You can also paste text directly. The pairing token lasts until browser restart, and the server generates a new token on restart unless HELPER_TOKEN is configured.

## AI configuration

Edit the included `.env` file before running `npm start`. It loads automatically from the project folder. `.env.example` is a blank template. Existing terminal environment variables take precedence. Restart the server after changes.

Available settings:

- `AI_PROVIDER`: `compatible` (default, including Ollama) or `anthropic` (Claude).
- `ANTHROPIC_API_KEY`: required for Claude; stays on the server.
- `API_URL`: optional full provider endpoint; Claude defaults to `https://api.anthropic.com/v1/messages`. Compatible mode uses the full chat completions URL (default `http://127.0.0.1:11434/v1/chat/completions`).
- `AI_MODEL`: model name (Claude default `claude-sonnet-5-5`; compatible default `llama3.2`).
- `AI_API_KEY`: provider API key when needed; it stays in the server process.
- `HELPER_TOKEN`: optional stable random pairing secret.

For a remote provider use HTTPS. This server binds only to the local machine. This is a local prototype, not a hosted multi-user service. There is no bundled AI service or provider key. Model downloads and hosted API usage may require separate setup or payment.

## Use Claude

The easiest setup on Windows or Linux is to edit `.env`, paste your replacement key after `ANTHROPIC_API_KEY=`, save, and run `npm start` from the folder containing `package.json`. Make sure the filename is `.env`, not `.env.txt`.

Alternatively, in a Bash terminal in the project folder:

```bash
export AI_PROVIDER=anthropic
export AI_MODEL=claude-sonnet-5-5
read -rsp 'Anthropic API key: ' ANTHROPIC_API_KEY
export ANTHROPIC_API_KEY
printf '\n'
npm start
```

The hidden prompt keeps the key out of shell history. If switching from a custom provider, unset `API_URL` first so the Claude endpoint is used. Paste the new server pairing token into the extension. Both automatic selection and text answers now use Claude; no extension changes are needed. Override `AI_MODEL` with another model available to your Anthropic account.

This uses the Anthropic API and sends scanned text to Anthropic. Supply an API key locally, not in the extension or chat. Live Claude calls have not been tested without a supplied key; automated tests mock the provider.

References: [Messages API](https://platform.claude.com/docs/en/api/messages/create) and [model IDs](https://platform.claude.com/docs/en/models/overview).

## Data and limits

The scanner reads rendered DOM text, including open shadow roots, up to 40,000 characters. It excludes form input values and editable areas. Review the text before sending: other personal or confidential text on the page may still be included. In text mode the editable page text and optional question are sent; automatic mode sends fresh page text and detected choice labels, without page URL, cookies, or browser credentials. The server does not log or persist prompts. Provider retention is governed by the provider.

Embedded frames, image/canvas questions, PDFs, closed shadow roots, browser internal pages, and extension-store pages may not be readable. Open a lesson frame in its own tab or paste text. This version does not perform OCR. AI-selected answers may be incorrect, especially if answers depend on lessons not included in the scan.

## Verification

`npm test` exercises the real HTTP boundary with a mocked AI provider: authentication, origin restrictions, validation, successful generation and upstream failure handling. Browser installation and real model answers require local end-to-end verification.

Browser APIs: https://developer.chrome.com/docs/extensions/reference/api/sidePanel and https://developer.chrome.com/docs/extensions/reference/api/scripting

## Automatic mode limits

Supports labeled native radio buttons/checkboxes and common ARIA radio/checkbox controls. Stops on missing/ambiguous answers, unsupported controls, changed questions, tab switches, failed selection verification, or no unique visible Next/Continue button. It does not click buttons labeled Submit, Finish, Certify, or Complete. Next/Continue buttons can save progress on the target site. Site-specific custom widgets may need an adapter. Closed/shadow-root controls and dropdown questions are not supported by automatic mode yet. The model's apparent confidence is not a guarantee of correctness.
