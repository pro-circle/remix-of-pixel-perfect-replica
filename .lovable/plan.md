# Refactor Groq generation and preview sizing

## Changes
- Keep every Groq request within the account’s token-per-minute limit by using task-specific output budgets instead of adding reasoning tokens above the configured maximum.
- Treat oversized requests as terminal for that key/model call and show a concise, actionable error rather than leaking the full provider response.
- Make the embedded preview fill its available workspace height and width, including Sandpack’s internal layout and iframe containers.
- Keep the full-page preview truly viewport-sized while preserving page tabs, refresh, and new-tab controls.

## Technical details
- Centralize Groq output limits and clamp the final completion budget below 8,000 tokens, accounting for thinking within that same budget.
- Add preview-specific semantic CSS hooks so nested Sandpack elements inherit `height: 100%` and avoid their default fixed height.
- Adjust the build workspace tracks so the preview receives a stable minimum height on smaller screens and fills the desktop panel.

## Verification
- Confirm the project builds without errors.
- Verify the build preview and full-page preview at desktop dimensions, checking that generated content fills the panel without a short or collapsed iframe.
