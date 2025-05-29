# LLMFeeder

A Chrome extension that converts web page content to clean Markdown format and copies it to clipboard with a single click, perfect for feeding content to Large Language Models (LLMs).

**Created by [@jatinkrmalik](https://github.com/jatinkrmalik)**

## Features

- **Smart Content Extraction**: Uses Readability algorithm to focus on main content
- **One-Click Simplicity**: Single action to process and copy content
- **LLM-Optimized Output**: Clean, structured Markdown perfect for AI consumption
- **Visual Feedback**: Clear indication of successful copying
- **Customizable**: Configure content scope and formatting options
- **Keyboard Shortcuts**: Convert content without opening the popup

## Installation

### From Source (Development)

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

- **Open Extension Popup**: `Ctrl+Shift+M` (Windows/Linux) or `Command+Shift+M` (Mac)
- **Convert & Copy without Opening Popup**: `Ctrl+Shift+C` (Windows/Linux) or `Command+Shift+C` (Mac)

### Settings

- **Content Scope**:
  - Main article content only (default)
  - Full page content
  - Selected text only

- **Formatting Options**:
  - Preserve table formatting
  - Include/exclude images

## Tech Stack

- **Content Extraction**: Mozilla's Readability.js
- **Markdown Conversion**: Turndown.js
- **Extension Framework**: Chrome Extension API (Manifest V3)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 