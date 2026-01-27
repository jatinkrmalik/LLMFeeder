# LLMFeeder - AI Agent & Contributor Guide

This guide is designed for AI agents (like Claude, ChatGPT, etc.) and human contributors working on the LLMFeeder browser extension. It provides a comprehensive reference for understanding the codebase, development workflow, and testing procedures.

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Repository Structure](#repository-structure)
3. [Development Workflow](#development-workflow)
4. [Extension Architecture](#extension-architecture)
5. [Local Testing Guide](#local-testing-guide)
6. [Debug Mode & Logging](#debug-mode--logging)
7. [Common Development Tasks](#common-development-tasks)
8. [Build & Release Process](#build--release-process)
9. [CI/CD Pipeline](#cicd-pipeline)

---

## Quick Reference

```bash
# Build extensions
./scripts/build.sh chrome    # Chrome only
./scripts/build.sh firefox   # Firefox only
./scripts/build.sh all       # All packages
make chrome                  # Alternative: using Make

# Start local test server
python3 -m http.server 8080

# Git workflow
git checkout -b feature/your-feature-name
# ... make changes ...
git add extension/
git commit -m "feat: description"
git push origin feature/your-feature-name
```

**Key Files for Feature Development:**
- `extension/content.js` - Core conversion logic (main content extraction, markdown)
- `extension/popup.js` - Popup UI and settings handling
- `extension/popup.html` - UI structure
- `extension/styles.css` - Styling
- `extension/manifest.json` - Extension configuration

**Testing Files:**
- `testbench.html` - Comprehensive test page
- `iframe-content-test.html` - Nested iframe content for testing

---

## Repository Structure

```
LLMFeeder/
├── extension/                 # Browser extension source
│   ├── icons/                # Extension icons (16, 48, 128px)
│   ├── libs/                 # Third-party libraries
│   │   ├── readability.js    # Mozilla content extraction
│   │   ├── turndown.js       # HTML to Markdown
│   │   └── browser-polyfill.js # Cross-browser compatibility
│   ├── manifest.json         # Extension manifest (MV3 base)
│   ├── popup.html            # Popup UI
│   ├── popup.js              # Popup logic (18KB)
│   ├── styles.css            # Popup styling
│   ├── content.js            # Content script (42KB) - CORE LOGIC
│   └── background.js         # Background script for keyboard shortcuts
│
├── scripts/
│   └── build.sh              # Build script (240 lines)
│
├── .github/workflows/
│   ├── pr-validation.yml     # PR build validation
│   └── release.yml           # Release asset upload
│
├── testbench.html             # Main testing page
├── iframe-content-test.html   # Nested iframe test content
├── Makefile                   # Build automation
└── README.md                  # User documentation
```

---

## Development Workflow

### Step 1: Create a Feature Branch

```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

### Step 2: Make Changes

Edit files in the `extension/` directory based on your feature:

| Change Type | Files to Modify |
|-------------|-----------------|
| New UI controls | `popup.html`, `popup.js`, `styles.css` |
| New settings | `popup.js` (add to loadSettings/saveSettings) |
| Content extraction logic | `content.js` |
| Keyboard shortcuts | `background.js`, `manifest.json` |
| Permissions | `manifest.json` |

### Step 3: Build and Test Locally

```bash
# Build Chrome extension
./scripts/build.sh chrome

# Extract for local testing
unzip -q dist/LLMFeeder-Chrome-v*.zip -d /tmp/llmfeeder-test
# OR just use the chrome-unpacked directory if created
```

### Step 4: Load in Browser

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the extracted extension directory (or `extension/` folder directly)

### Step 5: Test with Test Bench

```bash
# In project root
python3 -m http.server 8080
```

Then navigate to `http://localhost:8080/testbench.html` and test your changes.

### Step 6: Commit and Push

```bash
git add extension/
git commit -m "feat: description of changes"
git push origin feature/your-feature-name
```

---

## Extension Architecture

### Component Communication

```
┌─────────────────┐     messages     ┌─────────────────┐
│   popup.js      │ ───────────────▶ │   content.js    │
│  (UI/Settings)  │                  │ (Core Logic)    │
└─────────────────┘                  └─────────────────┘
        ▲                                    │
        │                                    │
        │ browser storage                   │
        │                                    ▼
┌─────────────────┐              ┌─────────────────┐
│ browser.storage │              │   Turndown.js   │
│  (sync prefs)   │              │  (HTML→MD)      │
└─────────────────┘              └─────────────────┘
                                         ▲
                                         │
┌─────────────────┐                      │
│ background.js   │ ─────────────────────┘
│ (shortcuts)     │
└─────────────────┘
```

### Content Script (`content.js`) - Core Functions

| Function | Purpose |
|----------|---------|
| `convertToMarkdown(settings)` | Main entry point for conversion |
| `extractMainContent(doc)` | Uses Readability.js for article content |
| `extractFullPageContent(doc)` | Full page extraction |
| `extractSelectedContent()` | User-selected text only |
| `configureTurndownService(settings)` | Configure Markdown conversion rules |
| `cleanContent(content, settings)` | Remove unwanted elements |
| `extractAndReplaceIframes...()` | Handle iframe content extraction |

### Popup Script (`popup.js`) - Key Functions

| Function | Purpose |
|----------|---------|
| `loadSettings()` | Load user preferences from storage |
| `saveSettings()` | Save settings to browser storage |
| `convertToMarkdown()` | Trigger conversion and copy to clipboard |
| `downloadMarkdown()` | Trigger conversion and download as file |
| `copyLogs()` | Copy debug logs from content script |

### Message Actions (for communication between scripts)

| Action | Source | Destination |
|--------|--------|-------------|
| `convertToMarkdown` | popup.js/background.js → content.js |
| `getDebugLogs` | popup.js → content.js |
| `copyToClipboard` | popup.js → content.js |
| `downloadMarkdown` | popup.js → content.js |
| `showNotification` | popup.js → content.js |

---

## Local Testing Guide

### Quick Test Cycle

```bash
# 1. Build extension
./scripts/build.sh chrome

# 2. Extract to temp location
mkdir -p /tmp/llmfeeder-test
unzip -q -o dist/LLMFeeder-Chrome-v*.zip -d /tmp/llmfeeder-test

# 3. Start test server
python3 -m http.server 8080
```

### Test Bench Scenarios

Open `http://localhost:8080/testbench.html` and test:

| Test | Description | Expected Behavior |
|------|-------------|-------------------|
| Test 1 | Main content extraction | Article content converted to Markdown |
| Test 2 | srcdoc iframe | Same-origin iframe content extracted |
| Test 3 | Nested iframe | Same-origin nested content extracted |
| Test 4 | Cross-origin iframe | Warning message about inaccessible content |
| Test 5 | Sandboxed iframe | May or may not extract (browser-dependent) |
| Test 6 | Standard HTML table | Proper Markdown table with separator |
| Test 7 | GitHub-style table | Markdown table without `<thead>` |
| Test 8 | Empty cells | Empty cells handled correctly |

### Test Settings to Use

When testing with the test bench:

1. **Enable Debug Mode** (gear icon → Debug Mode checkbox)
2. **Enable "Preserve Tables"** for table tests
3. **Set Content Scope to "Full Page"** for iframe tests
4. **Set Content Scope to "Main Content"** for article tests

### After Testing

1. Click "Copy Logs" button in settings to get debug output
2. Paste logs in your PR or issue for troubleshooting
3. Click "Remove" on the extension in `chrome://extensions/`
4. Reload extension after code changes (click reload icon)

---

## Debug Mode & Logging

### Enabling Debug Mode

1. Open LLMFeeder popup
2. Click gear icon (Settings)
3. Check "Debug Mode" checkbox
4. Logs are now collected during conversions

### Accessing Debug Logs

1. After running a conversion, go to Settings
2. Click "Copy Logs" button
3. Logs are copied to clipboard
4. Paste in issue/PR for debugging

### Debug Log Format

```
[2025-01-26T12:34:56.789Z] Conversion started
{
  "contentScope": "mainContent",
  "preserveTables": true,
  "includeImages": true,
  "includeTitle": true
}
[2025-01-26T12:34:56.890Z] Content extracted
{
  "innerHTMLLength": 45678
}
[2025-01-26T12:34:57.123Z] Conversion successful
{
  "markdownLength": 12345,
  "hasTables": true
}
```

### Adding Debug Logs

In `content.js`, use the `DebugLog` object:

```javascript
DebugLog.log('Your message here', { key: 'value' });
DebugLog.error('Error message', errorObject);
```

---

## Common Development Tasks

### Adding a New Setting

1. **Add to `popup.html`** - Create UI element (checkbox, radio, input)
2. **Add to `popup.js`** - Add to `loadSettings()` and `saveSettings()`
3. **Add to `content.js`** - Use in `convertToMarkdown()` function

```javascript
// In popup.js
const myNewSetting = document.getElementById("myNewSetting");

// In loadSettings()
myNewSetting.checked = data.myNewSetting || false;

// In saveSettings()
const myNewSetting = myNewSetting.checked;
await browserAPI.storage.sync.set({ myNewSetting });

// In content.js convertToMarkdown()
const myNewSetting = settings.myNewSetting || false;
```

### Adding a New Keyboard Shortcut

1. **Edit `manifest.json`** - Add to `commands` section:

```json
"my_new_command": {
  "suggested_key": {
    "default": "Alt+Shift+N",
    "mac": "Alt+Shift+N"
  },
  "description": "My new command description"
}
```

2. **Edit `background.js`** - Add handler:

```javascript
chrome.commands.onCommand.addListener((command) => {
  if (command === 'my_new_command') {
    // Your logic here
  }
});
```

### Adding Custom Markdown Conversion Rules

In `content.js`, modify `configureTurndownService()`:

```javascript
turndownService.addRule('myCustomRule', {
  filter: 'myElement',
  replacement: function(content, node) {
    // Return markdown representation
    return '**Custom:** ' + content;
  }
});
```

### Modifying Table Handling

Tables are handled in `configureTurndownService()` when `settings.preserveTables` is true. Key rules:
- `table` - Wraps content in newlines
- `tableRow` - Creates pipe-separated rows with header separator
- `tableCell` - Formats individual cells
- `thead`/`tbody` - Prevent extra newlines

---

## Build & Release Process

### Build System Overview

The project uses two build methods:

1. **Shell Script** (`scripts/build.sh`) - Full-featured build
2. **Makefile** - Convenient targets

### Build Script Usage

```bash
# Build all packages
./scripts/build.sh all

# Build specific package
./scripts/build.sh chrome
./scripts/build.sh firefox
./scripts/build.sh source

# Build with custom version
./scripts/build.sh --version 2.1.0 all
```

### Output Files

Built packages are created in `dist/`:

- `LLMFeeder-Chrome-v{version}.zip` - Chrome extension
- `LLMFeeder-Firefox-v{version}.zip` - Firefox extension
- `LLMFeeder-Source-v{version}.zip` - Source package

### Version Bumping

1. Edit `extension/manifest.json`:
   ```json
   "version": "2.1.0"
   ```

2. Build with version:
   ```bash
   ./scripts/build.sh --version 2.1.0 all
   ```

---

## CI/CD Pipeline

### Pull Request Validation (`.github/workflows/pr-validation.yml`)

Triggered on:
- PR opened, synchronized, or reopened
- Push to main branch

Validates:
- Chrome package builds
- Firefox package builds
- Source package builds
- Manifest JSON validity

### Release Workflow (`.github/workflows/release.yml`)

Triggered on:
- GitHub release creation

Actions:
- Extracts version from git tag
- Builds all packages with version
- Uploads assets to release

### Creating a Release

```bash
# Tag and push
git tag v2.1.0
git push origin v2.1.0

# Then create release on GitHub
# CI will automatically build and upload packages
```

---

## Browser Compatibility Notes

### Chrome (Manifest V3)
- Uses `service_worker` in background
- Default for new features

### Firefox (Manifest V2)
- Uses `scripts` array in background
- Build script automatically converts manifest

### Cross-Browser Considerations

- Use `browserAPI` wrapper in `popup.js`
- Use `browserRuntime` wrapper in `content.js`
- Test on both browsers before submitting PR

---

## Settings Reference

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `contentScope` | string | "mainContent" | "mainContent", "fullPage", or "selection" |
| `preserveTables` | boolean | true | Convert HTML tables to Markdown |
| `includeImages` | boolean | true | Include images in output |
| `includeTitle` | boolean | true | Prepend page title as H1 |
| `includeMetadata` | boolean | true | Append metadata block |
| `metadataFormat` | string | "---\nSource: [{title}]({url})" | Metadata template |
| `debugMode` | boolean | false | Enable debug logging |

### Metadata Template Variables

- `{title}` - Page title
- `{url}` - Page URL
- `{date}` - Published date
- `{author}` - Article author
- `{siteName}` - Site name
- `{excerpt}` - Article excerpt

---

## Troubleshooting

### Extension not loading
- Check `manifest.json` for syntax errors
- Verify all referenced files exist
- Check browser console for errors

### Content extraction not working
- Enable debug mode
- Copy logs and check for errors
- Verify content scope setting

### Tables not converting to Markdown
- Ensure "Preserve Tables" is enabled
- Check if HTML table structure is valid
- Review debug logs for conversion errors

### Build script fails
- Ensure `jq` and `zip` are installed
- Make script executable: `chmod +x ./scripts/build.sh`
- Check file permissions in `extension/` directory

---

## Contributing Guidelines

1. **Branch Naming**: Use `feature/`, `fix/`, or `docs/` prefixes
2. **Commit Messages**: Use conventional commits (`feat:`, `fix:`, `docs:`, etc.)
3. **Testing**: Always test with `testbench.html` before submitting
4. **Debug Logs**: Include debug logs when reporting issues
5. **Co-Authored-By**: Add when collaborating with AI agents

```
feat: add new feature description

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

---

## Quick Command Reference

```bash
# Development
make chrome                  # Build Chrome
make firefox                 # Build Firefox
make clean                   # Clean dist/
make help                    # Show help

# Testing
python3 -m http.server 8080  # Start test server
open http://localhost:8080/testbench.html

# Git
git checkout -b feature/name # New branch
git add extension/           # Stage changes
git commit -m "feat: desc"   # Commit
git push origin feature/name # Push

# Cleanup
lsof -ti:8080 | xargs kill   # Kill server on port 8080
```

---

## External Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| Readability.js | Mozilla | Content extraction from web pages |
| Turndown.js | - | HTML to Markdown conversion |
| browser-polyfill.js | - | Cross-browser API compatibility |

These are located in `extension/libs/` and should not be modified without careful consideration.
