<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/2a6cec07-97bc-4bb7-9039-858f28fd8eae

## Run Locally

**Prerequisites:**  Node.js 22+

1. Install dependencies:
   `npm install`
2. Create `.env.local` in the project root with your Claude API key
   (server-side only — never bundled into the browser):
   `ANTHROPIC_API_KEY=sk-ant-...`
3. Run the app (Vite dev server + API proxy):
   `npm run dev`
4. Open http://localhost:3000

**Production:** `npm run start` builds the frontend and serves it with
the API proxy on http://localhost:8787.
