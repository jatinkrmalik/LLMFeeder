# LLMFeeder

A Chrome extension that converts web page content to clean Markdown format and copies it to clipboard with a single click, perfect for feeding content to Large Language Models (LLMs).

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

## Installation

### Option 1: Direct Download (Easiest)

1. Download the [latest release zip file](https://github.com/jatinkrmalik/LLMFeeder/releases/latest)
2. Extract the zip file to a location of your choice
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" by toggling the switch in the top right
5. Click "Load unpacked" and select the extracted `extension` directory
6. The LLMFeeder extension should now appear in your extensions list
7. Click the puzzle piece icon in Chrome toolbar and pin LLMFeeder for easy access

### Option 2: From Source (Development)

1. Clone this repository:
   ```
   git clone git@github.com:jatinkrmalik/LLMFeeder.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" by toggling the switch in the top right

4. Click "Load unpacked" and select the `extension` directory from this repository

5. The LLMFeeder extension should now appear in your extensions list

6. Click the puzzle piece icon in Chrome toolbar and pin LLMFeeder for easy access

### Usage

1. Navigate to any web page you want to convert to Markdown
2. Click the LLMFeeder icon in your browser toolbar
3. Click the "Convert & Copy" button
4. The content will be processed and copied to your clipboard
5. Paste the Markdown content into your LLM tool of choice

### Keyboard Shortcuts

- **Open Extension Popup**: `Alt+Shift+L` (all platforms)
- **Convert & Copy without Opening Popup**: `Alt+Shift+M` (all platforms)

#### Customizing Shortcuts

Users can customize keyboard shortcuts by following these steps:

1. Go to `chrome://extensions/shortcuts` in your Chrome browser
2. Find "LLMFeeder" in the list
3. Click on the pencil icon next to the shortcut you want to change
4. Press your desired key combination
5. Click "OK" to save

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
├── extension/               # Chrome extension directory (load this in Chrome)
│   ├── icons/               # Extension icons
│   │   ├── icon16.png       # 16x16 icon
│   │   ├── icon48.png       # 48x48 icon
│   │   └── icon128.png      # 128x128 icon
│   │
│   ├── libs/                # Third-party libraries
│   │   ├── readability.js   # Mozilla's Readability for content extraction
│   │   └── turndown.js      # HTML to Markdown conversion
│   │
│   ├── manifest.json        # Extension configuration and metadata
│   ├── popup.html           # UI for the extension popup
│   ├── popup.js             # Controls popup behavior and user interactions
│   ├── styles.css           # Styling for the popup UI
│   ├── content.js           # Content script that runs on web pages
│   └── background.js        # Background script for keyboard shortcuts
│
├── .gitignore               # Git ignore rules
└── README.md                # Project documentation
```

### Component Descriptions

- **manifest.json**: Defines extension metadata, permissions, and configuration
- **popup.html/js/css**: Creates the user interface when you click the extension icon
- **content.js**: Contains the core functionality to extract and convert web content to Markdown
- **background.js**: Handles keyboard shortcuts and global extension functionality
- **readability.js**: Mozilla's library that identifies and extracts the main content from a webpage
- **turndown.js**: Converts HTML to Markdown with configurable options

### Data Flow

1. User triggers conversion (via popup UI or keyboard shortcut)
2. Request is sent from popup.js or background.js to content.js
3. content.js extracts content using readability.js
4. Content is converted to Markdown using turndown.js
5. Markdown is copied to clipboard and success feedback is shown

## Tech Stack

- **Content Extraction**: Mozilla's Readability.js
- **Markdown Conversion**: Turndown.js
- **Extension Framework**: Chrome Extension API (Manifest V3)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 