# Fix the generated app preview

## Changes
- Open the first generated page by default instead of the often-minimal root `App` file.
- Match page files robustly across names, routes, and common filename styles.
- Recreate the preview when generated files or the selected page change, preventing stale output.
- Load generated frontend dependencies and global styles when available.
- Keep the App tab available so the generated root app can still be inspected explicitly.

## Verification
- Confirm the project builds without errors.
- Open the build screen and verify page tabs render their corresponding generated content rather than the stale “Hello world” screen.
