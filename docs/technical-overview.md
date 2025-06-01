# LLMFeeder: Technical Overview

## Introduction

LLMFeeder is a browser extension designed to convert web content to clean Markdown format for use with Large Language Models (LLMs). It provides multiple methods to extract and format content, with special considerations for websites with Content Security Policy (CSP) restrictions.

## Architecture

The extension follows a standard browser extension architecture with these components:

1. **Background Script**: Runs persistently to handle events and coordinate actions
2. **Content Script**: Runs in the context of web pages to access and manipulate page content
3. **Popup UI**: User interface for configuration and manual activation
4. **Context Menu**: Right-click menu for quick access to core functionality

## Core Components

### 1. Background Script (background.js)

The background script is a service worker that:
- Handles keyboard shortcuts
- Manages the context menu
- Coordinates between popup and content scripts
- Provides clipboard access when available
- Handles fallback mechanisms for restricted sites

Key features:
- Browser compatibility layer for Chrome/Firefox differences
- Clipboard operations with multiple fallback methods
- Notification display for user feedback

### 2. Content Script (content.js)

The content script runs in the context of web pages and provides:
- Readability extraction for main content
- Full-page content extraction
- Selected text processing
- Markdown conversion using TurndownService
- Post-processing and formatting

Key capabilities:
- Table preservation
- Image handling
- URL absolutization
- Fallback extraction methods

### 3. Popup Interface (popup.js, popup.html)

The popup provides a user interface for:
- Manual conversion activation
- Content scope selection (main content, selection, full page)
- Configuration options
- Status reporting

User settings include:
- Content scope selection
- Table preservation toggle
- Image inclusion toggle

### 4. Context Menu Integration

A right-click context menu option that:
- Appears when text is selected
- Provides direct access to conversion functionality
- Works on sites with CSP restrictions
- Offers multiple clipboard access methods

## Data Flow

### Standard Conversion Flow

1. User triggers conversion (popup, shortcut, or context menu)
2. Background script checks for CSP restrictions
3. If unrestricted, content script extracts and converts content
4. Markdown is copied to clipboard
5. User receives success notification

### Restricted Site Flow

1. User selects text manually
2. User activates via context menu
3. Background script formats the selection
4. Multiple clipboard methods attempted:
   - Direct clipboard API
   - Popup window with external script
   - New tab with URL-parameter-based text passing
5. User can copy from the provided interface

## Browser Compatibility

The extension is designed to work on both Chrome and Firefox through:
- Browser detection and API normalization
- Promise-based API wrappers
- Fallback mechanisms for different capabilities

## Security and Privacy Considerations

- No data is sent to external servers
- All processing happens locally in the browser
- User data is not persisted beyond the current session
- Settings are stored in browser.storage.sync for user convenience

## Build and Packaging

The build process:
1. Combines all extension files
2. Creates browser-specific versions
3. Packages into distributable ZIP files

## Testing Approach

Testing focuses on:
- Basic functionality on standard sites
- Behavior on sites with CSP restrictions
- Firefox/Chrome compatibility
- Settings persistence

## Known Limitations

- Cannot run on browser pages (chrome://, about:, etc.)
- Extraction quality depends on page structure
- Some sites may block all extension functionality
- Complex tables may not convert perfectly

## Future Development Roadmap

Planned improvements:
- Enhanced formatting options
- More robust CSP handling
- Improved image handling
- User-configurable output templates 