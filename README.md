# LLMFeeder - Webpage to Markdown for your LLM context!

<div align="center">


[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/cjjfhhapabcpcokkfldbiiojiphbifdk?logo=googlechrome&logoColor=white&color=4285F4&label=Chrome)](https://chromewebstore.google.com/detail/llmfeeder/cjjfhhapabcpcokkfldbiiojiphbifdk)
[![Firefox Add-on](https://img.shields.io/amo/v/llmfeeder?logo=firefox-browser&logoColor=white&color=FF7139&label=Firefox)](https://addons.mozilla.org/en-US/firefox/addon/llmfeeder/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub release](https://img.shields.io/github/v/release/jatinkrmalik/LLMFeeder)](https://github.com/jatinkrmalik/LLMFeeder/releases)
[![Last Commit](https://img.shields.io/github/last-commit/jatinkrmalik/LLMFeeder)](https://github.com/jatinkrmalik/LLMFeeder/commits/main)
[![GitHub issues](https://img.shields.io/github/issues/jatinkrmalik/LLMFeeder)](https://github.com/jatinkrmalik/LLMFeeder/issues)
[![Contributors](https://img.shields.io/github/contributors/jatinkrmalik/llmfeeder)](https://github.com/jatinkrmalik/LLMFeeder/graphs/contributors)
[![GitHub stars](https://img.shields.io/github/stars/jatinkrmalik/LLMFeeder)](https://github.com/jatinkrmalik/LLMFeeder/stargazers)

</div>

A browser extension that converts web page content to clean Markdown format and copies it to clipboard with a single click, perfect for feeding content to Large Language Models (LLMs). Available for both Chrome and Firefox.

## Demo

<div align="center">
   
[![llmfeeder_promo](https://github.com/user-attachments/assets/6585a653-79fc-4dab-81e9-9d12a1552223)](https://www.youtube.com/watch?v=JxHWqszlZDw)
Click the image for YT Demo video. 👆

</div>

## Privacy & Security

LLMFeeder operates as a fully client-side extension with zero backend dependencies. All content processing occurs locally within your browser's execution environment:

- **No Remote Data Transmission**: The extension performs all operations (content extraction, Markdown conversion, clipboard operations) entirely within your browser's sandbox. No data is ever transmitted to external servers.

- **Zero Telemetry**: Unlike many extensions, LLMFeeder contains no analytics, tracking, or data collection mechanisms of any kind.

- **Minimal Permissions**: The extension requests only the permissions strictly necessary for its core functionality (activeTab, clipboardWrite, storage, scripting).

- **Verifiable Codebase**: Being fully open source, the entire codebase is available for inspection to verify these privacy claims. Users are encouraged to review the source code to confirm the absence of any data exfiltration mechanisms.

This architecture ensures that your content remains exclusively on your device throughout the entire extraction and conversion process.

## Features

- **Smart Content Extraction**: Uses Readability algorithm to focus on main content
- **One-Click Simplicity**: Single action to process and copy content
- **LLM-Optimized Output**: Clean, structured Markdown perfect for AI consumption
- **Visual Feedback**: Clear indication of successful copying
- **Customizable**: Configure content scope and formatting options
- **Keyboard Shortcuts**: Convert content without opening the popup
- **Multi-Browser Support**: Works on both Chrome and Firefox

## Installation

### Option 1: Browser Extension Stores (Recommended)

#### Chrome Web Store
✅ **Now Available!** Install directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/llmfeeder/cjjfhhapabcpcokkfldbiiojiphbifdk)

#### Firefox Add-ons
✅ **Now Available!** Install directly from the [Firefox Add-ons Store](https://addons.mozilla.org/en-US/firefox/addon/llmfeeder/)

### Option 2: Direct Download

1. Download the [latest release zip file](https://github.com/jatinkrmalik/LLMFeeder/releases/latest) based on your browser.
2. Extract the zip file to a location of your choice

#### For Chrome:
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" by toggling the switch in the top right
5. Click "Load unpacked" and select the extracted `extension` directory
6. The LLMFeeder extension should now appear in your extensions list
7. Click the puzzle piece icon in Chrome toolbar and pin LLMFeeder for easy access

#### For Firefox:
3. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
4. Click "Load Temporary Add-on..."
5. Select the `manifest.json` file in the extracted `extension` directory
6. The LLMFeeder extension should now appear in your add-ons list
7. Note: For permanent installation in Firefox, use the Firefox Add-ons store option when available

### Option 3: From Source (Development)

#### For Chrome

1. Clone this repository:
   ```
   git clone git@github.com:jatinkrmalik/LLMFeeder.git
   ```
2. Build the extension:
- Using the provided build script:
   ```bash
   cd LLMFeeder
   ./scripts/build.sh chrome
   ```
- Using Makefile (if you have `make` installed):
   ```bash
   cd LLMFeeder
   make chrome
   ```
   This will create a Chrome-compatible package in the `dist/` directory.
3. Unzip the generated `LLMFeeder-Chrome-*.zip` file in the `dist` directory to a directory of your choice
4. Open Chrome and navigate to `chrome://extensions/`
5. Enable "Developer mode" by toggling the switch in the top right
6. Click "Load unpacked" and select the `extension` directory from the unzipped package
7. The extension will appear in your Chrome extensions list

#### For Firefox

1. Clone this repository:
   ```
   git clone git@github.com:jatinkrmalik/LLMFeeder.git
   ```
   
   (If you've already cloned, ensure you are on the desired branch/commit.)

2. Navigate to the cloned directory:
   ```
   cd LLMFeeder
   ```
   
3. Build the extension:

- Using the provided build script:
   ```bash
   ./scripts/build.sh firefox
   ```
- Using Makefile (if you have `make` installed):
   ```bash
   make firefox
   ```
   This will create a Firefox-compatible package in the `dist/` directory.
4. Unzip the generated `LLMFeeder-Firefox-*.zip` file in the `dist` directory to a directory of your choice
5. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
6. Click "Load Temporary Add-on..."
7. Select the `manifest.json` file inside the `extension` directory from the unzipped package
8. The extension will appear in your Firefox extensions list

### Usage

1. Navigate to any web page you want to convert to Markdown
2. Click the LLMFeeder icon in your browser toolbar
3. Click the "Convert & Copy" button
4. The content will be processed and copied to your clipboard
5. Paste the Markdown content into your LLM tool of choice

### Keyboard Shortcuts

- **Open Extension Popup**: `Alt+Shift+L` (Windows/Linux) or `⌥⇧L` (Mac)
- **Convert & Copy without Opening Popup**: `Alt+Shift+M` (Windows/Linux) or `⌥⇧M` (Mac)

#### Customizing Shortcuts

Users can customize keyboard shortcuts by following these steps:

- **Chrome**: Go to `chrome://extensions/shortcuts` in your browser
- **Firefox**: Go to `about:addons` → Extensions → ⚙️ (Gear icon) → Manage Extension Shortcuts

### Settings

- **Content Scope**:
  - Main article content only (default)
  - Full page content
  - Selected text only

- **Formatting Options**:
  - Preserve table formatting
  - Include/exclude images

## Project Structure

Below is a visual representation of the project structure to help developers understand the codebase:

```
LLMFeeder/
│
├── dist/                     # Distribution packages directory
│   ├── LLMFeeder-Chrome-*.zip # Chrome package
│   ├── LLMFeeder-Firefox-*.zip # Firefox package
│   └── LLMFeeder-Source-*.zip # Source package
│
├── extension/                 # Browser extension directory
│   ├── icons/                 # Extension icons
│   │   ├── icon16.png         # 16x16 icon
│   │   ├── icon48.png         # 48x48 icon
│   │   └── icon128.png        # 128x128 icon
│   │
│   ├── libs/                  # Third-party libraries
│   │   ├── readability.js     # Mozilla's Readability for content extraction
│   │   ├── turndown.js        # HTML to Markdown conversion
│   │   └── browser-polyfill.js # Browser compatibility layer
│   │
│   ├── manifest.json          # Extension configuration and metadata
│   ├── popup.html             # UI for the extension popup
│   ├── popup.js               # Controls popup behavior and user interactions
│   ├── styles.css             # Styling for the popup UI
│   ├── content.js             # Content script that runs on web pages
│   └── background.js          # Background script for keyboard shortcuts
│
├── scripts/                   # Build and utility scripts
│   └── build.sh               # Main build script
│
├── .gitignore                 # Git ignore rules
└── README.md                  # Project documentation
```

### Component Descriptions

- **manifest.json**: Defines extension metadata, permissions, and configuration
- **popup.html/js/css**: Creates the user interface when you click the extension icon
- **content.js**: Contains the core functionality to extract and convert web content to Markdown
- **background.js**: Handles keyboard shortcuts and global extension functionality
- **readability.js**: Mozilla's library that identifies and extracts the main content from a webpage
- **turndown.js**: Converts HTML to Markdown with configurable options
- **browser-polyfill.js**: Provides compatibility layer for Chrome and Firefox extension APIs

### Data Flow

1. User triggers conversion (via popup UI or keyboard shortcut)
2. Request is sent from popup.js or background.js to content.js
3. content.js extracts content using readability.js
4. Content is converted to Markdown using turndown.js
5. Markdown is copied to clipboard and success feedback is shown

## Browser Compatibility

LLMFeeder is designed to work on all modern browsers with complete feature parity:

- **Chrome/Chromium-based browsers**: Fully supported (v80+)
- **Firefox**: Fully supported (v109+)

## Tech Stack

- **Content Extraction**: Mozilla's Readability.js
- **Markdown Conversion**: Turndown.js
- **Extension Framework**: Web Extensions API (Chrome Manifest V3, Firefox Manifest V2 compatibility)
- **Browser Compatibility**: Custom polyfill for cross-browser support

## Build Instructions

### Prerequisites
- `zip` installed (required for packaging)
- `jq` installed (optional but recommended for JSON processing)
- For Make approach: GNU Make (usually pre-installed on Linux/macOS)

---

### Using Scripts

To build the extension packages for distribution:

1. Run the build script:
   ```bash
   ./scripts/build.sh
   ```

This will create three packages in the `dist/` directory:
- `LLMFeeder-Chrome-v1.0.1.zip` - Chrome-compatible package
- `LLMFeeder-Firefox-v1.0.1.zip` - Firefox-compatible package
- `LLMFeeder-Source-v1.0.1.zip` - Source code package

You can also build specific packages:
```bash
# Build only Chrome package
./scripts/build.sh chrome

# Build only Firefox package
./scripts/build.sh firefox

# Build only source package
./scripts/build.sh source

# Specify version number
./scripts/build.sh --version 1.1.0 all
```

### Using Make

To build the extension packages for distribution:

- Common Targets
```bash
make all           # Build all (chrome, firefox, source)
make chrome        # Build Chrome only
make firefox       # Build Firefox only
make source        # Build source zip only
make full-build    # Full build via ./scripts/build.sh
```

- Versioned Builds
```bash
make versioned-chrome version=1.0.0
make versioned-full version=1.0.0
make versioned-firefox version=1.0.0
make versioned-source version=1.0.0
```

> Note: ❗ These require a `version=x.y.z` flag or will throw an error.

- Utilities
```bash
make clean         # Remove dist/ artifacts
make help          # Show help message
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
