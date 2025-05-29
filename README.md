# LLMFeeder

<div align="center">

[![GitHub release](https://img.shields.io/github/v/release/jatinkrmalik/LLMFeeder)](https://github.com/jatinkrmalik/LLMFeeder/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub issues](https://img.shields.io/github/issues/jatinkrmalik/LLMFeeder)](https://github.com/jatinkrmalik/LLMFeeder/issues)
[![GitHub stars](https://img.shields.io/github/stars/jatinkrmalik/LLMFeeder)](https://github.com/jatinkrmalik/LLMFeeder/stargazers)
[![Last Commit](https://img.shields.io/github/last-commit/jatinkrmalik/LLMFeeder)](https://github.com/jatinkrmalik/LLMFeeder/commits/main)
[![Chrome](https://img.shields.io/badge/Chrome-supported-brightgreen)](https://chrome.google.com/webstore/detail/llmfeeder/coming-soon)
[![Firefox](https://img.shields.io/badge/Firefox-coming_soon-orange)](https://github.com/jatinkrmalik/LLMFeeder)

</div>

A browser extension that converts web page content to clean Markdown format and copies it to clipboard with a single click, perfect for feeding content to Large Language Models (LLMs). Available for both Chrome and Firefox.

## Demo

[![LLMFeeder Demo](https://i3.ytimg.com/vi/JxHWqszlZDw/maxresdefault.jpg)](https://www.youtube.com/watch?v=JxHWqszlZDw)
Click the image for YT Demo video.

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
The Chrome extension is currently under review and will be available soon for one-click installation. 

#### Firefox Add-ons
The Firefox add-on is currently in development and will be submitted to the Firefox Add-ons store soon. Stay tuned for updates!

### Option 2: Direct Download

#### For Chrome

1. Download the [latest release zip file](https://github.com/jatinkrmalik/LLMFeeder/releases/latest)
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

2. Follow the browser-specific instructions from Option 2 above to load the extension.

#### For Firefox

1. Clone this repository:
   ```
   git clone git@github.com:jatinkrmalik/LLMFeeder.git
   ```
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Select the `manifest.json` file inside the `extension` directory.
5. The extension will appear in your Firefox extensions list for the current session.

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
│   ├── build-chrome.sh        # Chrome package build script
│   └── build-firefox.sh       # Firefox package build script
│
├── build.sh                   # Main build script (runs both browser builds)
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

To build the extension packages for distribution:

1. Make sure you have `zip` and `jq` installed (optional but recommended)
2. Run the main build script:
   ```bash
   ./build.sh
   ```

This will create three packages:
- `LLMFeeder-Chrome-v1.0.0.zip` - Chrome-compatible package
- `LLMFeeder-Firefox-v1.0.0.zip` - Firefox-compatible package
- `LLMFeeder-v1.0.0.zip` - Source code package

You can also run individual build scripts:
- `./scripts/build-chrome.sh` - Build only Chrome package
- `./scripts/build-firefox.sh` - Build only Firefox package
- `./scripts/build-all.sh` - Build only source code package

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
