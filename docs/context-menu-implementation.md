# LLMFeeder: Context Menu Implementation

## Overview

This document explains the implementation of the right-click context menu feature in LLMFeeder, specifically designed to work on websites with strict Content Security Policy (CSP) restrictions.

## Problem Statement

The original implementation of LLMFeeder relied on content script injection to convert webpage content to Markdown. However, many websites implement strict CSP rules that prevent:
- Script injection
- DOM access from extensions
- Use of clipboard APIs
- Storage access
- Inline scripts execution

These restrictions caused the extension to fail on certain websites, resulting in errors like:
```
This page cannot be scripted due to an ExtensionsSettings policy.
Refused to execute inline script because it violates the following Content Security Policy directive...
```

## Solution Architecture

We implemented a multi-layered approach with several fallback mechanisms:

### 1. Context Menu Integration

The extension now adds a right-click context menu option that appears when text is selected:
- Context menus operate at the browser level, not the page level
- Bypasses many CSP restrictions
- Allows users to manually select the text they want to convert

### 2. Multi-Layered Clipboard Access

We implemented three methods for copying text to clipboard, with automatic fallback:

#### Method 1: Direct Clipboard API
- Uses `navigator.clipboard.writeText()` directly from the background script
- Fast and seamless when permitted

#### Method 2: Popup Window
- Opens a popup window with the converted text
- Uses external JavaScript files instead of inline scripts to avoid CSP violations
- Text is passed via browser storage

#### Method 3: New Tab Fallback
- Ultra-minimal page that opens in a new tab
- Text is passed via URL parameters to bypass storage restrictions
- Designed to work in the most restrictive environments

## Implementation Details

### Context Menu Registration

In `background.js`, we register a context menu item that appears only when text is selected:

```javascript
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "convert-selection",
    title: "Convert selection to Markdown & copy",
    contexts: ["selection"]
  });
});
```

### Text Selection Handling

When the context menu option is clicked, we format the selected text into Markdown:

```javascript
function formatSelectedTextAsMarkdown(text, title, url) {
  const cleanedText = text.replace(/\s+/g, ' ').trim();
  return `# ${title}\n\n${cleanedText}\n\n---\nSource: [${title}](${url})`;
}
```

### CSP-Resistant Design Patterns

1. **No inline scripts**: All JavaScript is in external files to comply with CSP restrictions
2. **Multiple clipboard approaches**: Graceful degradation through various clipboard access methods
3. **URL parameter passing**: Using query parameters to pass data when storage access is restricted
4. **Manual text selection**: Relying on user-selected text rather than programmatic DOM access

### Fallback Mechanism Flow

The extension attempts clipboard operations in this order:

1. Try direct clipboard API access
2. If that fails, open a popup with external script
3. If that fails, open a new tab with text passed via URL parameter

## File Structure

- `background.js`: Handles context menu registration and clipboard operations
- `copy-popup.html` & `copy-popup.js`: Popup window for clipboard access
- `direct-copy.html` & `direct-copy.js`: Ultra-minimal fallback page for restricted sites
- `manifest.json`: Declares required permissions and accessible resources

## User Flow

1. User selects text on any webpage
2. User right-clicks and selects "Convert selection to Markdown & copy"
3. The extension attempts to copy the formatted text to clipboard
4. If direct copying fails, a popup or new tab appears with the text and copy button
5. User can then copy the text manually if necessary

## Permissions

The extension requires these permissions:
- `contextMenus`: For right-click menu functionality
- `activeTab`: To access the current tab
- `clipboardWrite`: For clipboard operations
- `storage`: For passing data between contexts
- `scripting`: For potential script injection when permitted

## Compatibility

This implementation is designed to work on:
- Chrome
- Firefox
- Websites with strict CSP policies
- Websites that block script injection
- Websites that block DOM access

## Future Improvements

Potential enhancements:
- Add a user preference to select default conversion behavior
- Add formatting options for the Markdown output
- Support image conversion in compatible environments
- Add keyboard shortcut for context menu activation 