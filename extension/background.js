// LLMFeeder Background Script
// Handles keyboard shortcuts and background tasks
// Dependencies: libs/jszip.min.js and multi-tab-utils.js
// (loaded via manifest in Firefox, or importScripts in Chrome service worker)

// Load dependencies for Chrome service worker (not needed in Firefox)
if (typeof importScripts === 'function') {
  try {
    importScripts('libs/jszip.min.js', 'multi-tab-utils.js');
  } catch (e) {
    console.error('Failed to load dependencies:', e);
  }
}

// Create browser compatibility layer for service worker context
const browserAPI = (function() {
  // Check if we're in Firefox (browser is defined) or Chrome (chrome is defined)
  const isBrowser = typeof browser !== 'undefined';
  const isChrome = typeof chrome !== 'undefined';
  
  // Base object
  const api = {};
  
  // Helper to promisify callback-based Chrome APIs
  function promisify(chromeAPICall, context) {
    return (...args) => {
      return new Promise((resolve, reject) => {
        chromeAPICall.call(context, ...args, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });
    };
  }
  
  // Set up APIs
  if (isBrowser) {
    // Firefox already has promise-based APIs
    api.tabs = browser.tabs;
    api.runtime = browser.runtime;
    api.storage = browser.storage;
    api.commands = browser.commands;
    api.scripting = browser.scripting;
    // Use browser.menus for Firefox (more features than contextMenus)
    api.contextMenus = browser.menus || browser.contextMenus;
  } else if (isChrome) {
    // Chrome needs promisification
    api.tabs = {
      query: promisify(chrome.tabs.query, chrome.tabs),
      sendMessage: promisify(chrome.tabs.sendMessage, chrome.tabs),
      onHighlighted: chrome.tabs.onHighlighted,
      onActivated: chrome.tabs.onActivated
    };
    
    api.runtime = {
      onMessage: chrome.runtime.onMessage,
      onInstalled: chrome.runtime.onInstalled,
      onStartup: chrome.runtime.onStartup,
      getURL: chrome.runtime.getURL,
      lastError: chrome.runtime.lastError
    };
    
    api.storage = {
      sync: {
        get: function(keys) {
          return new Promise((resolve, reject) => {
            chrome.storage.sync.get(keys, (result) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(result);
              }
            });
          });
        },
        set: function(items) {
          return new Promise((resolve, reject) => {
            chrome.storage.sync.set(items, () => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve();
              }
            });
          });
        }
      }
    };
    
    api.commands = {
      onCommand: chrome.commands.onCommand
    };

    api.scripting = chrome.scripting;

    // Chrome contextMenus has special handling - create() returns ID synchronously
    api.contextMenus = {
      create: function(createProperties) {
        return new Promise((resolve, reject) => {
          const id = chrome.contextMenus.create(createProperties, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(id);
            }
          });
        });
      },
      update: promisify(chrome.contextMenus.update, chrome.contextMenus),
      remove: promisify(chrome.contextMenus.remove, chrome.contextMenus),
      removeAll: function() {
        return new Promise((resolve, reject) => {
          chrome.contextMenus.removeAll(() => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
      },
      onClicked: chrome.contextMenus.onClicked
    };
  }

  return api;
})();

// Ensure content script is injected before sending messages
async function ensureContentScriptLoaded(tabId) {
  try {
    // Try sending a ping message to check if content script is loaded
    await browserAPI.tabs.sendMessage(tabId, { action: "ping" }).catch(() => {
      // If error, inject the content script
      return browserAPI.scripting.executeScript({
        target: { tabId: tabId },
        files: ["libs/readability.js", "libs/turndown.js", "content.js"]
      });
    });
    return true;
  } catch (error) {
    console.error("Cannot inject content script:", error);
    return false;
  }
}

// Context Menu Management
const CONTEXT_MENU_IDS = {
  PARENT: 'llmfeeder-parent',
  SINGLE_COPY: 'llmfeeder-single-copy',
  SINGLE_DOWNLOAD: 'llmfeeder-single-download',
  MULTI_COPY: 'llmfeeder-multi-copy',
  MULTI_DOWNLOAD: 'llmfeeder-multi-download',
  MULTI_ZIP: 'llmfeeder-multi-zip'
};

// Current menu state
let currentMenuMode = null; // 'single' or 'multi'
let currentMenuTabCount = 0; // Track tab count for multi-tab mode

// Browser-specific contexts ('tab' is Firefox-only)
// Detect Firefox by checking for browser.menus API
// Chrome doesn't support "menus" permission, so browser.menus will be undefined
const isFirefox = typeof browser !== 'undefined' &&
                  typeof browser.menus !== 'undefined';

const PAGE_CONTEXTS = isFirefox
  ? ['page', 'selection', 'link', 'tab']  // Firefox supports 'tab' context
  : ['page', 'selection', 'link'];        // Chrome doesn't support 'tab'

// Create single-tab context menus
async function createSingleTabMenus() {
  try {
    await browserAPI.contextMenus.removeAll();

    // Parent menu - appears in page/selection/link contexts (and tab in Firefox)
    const parentMenuProps = {
      id: CONTEXT_MENU_IDS.PARENT,
      title: 'Copy to Markdown',
      contexts: PAGE_CONTEXTS
    };

    // Icons are only supported in Firefox
    if (isFirefox) {
      parentMenuProps.icons = {
        16: 'icons/icon16.png',
        32: 'icons/icon48.png'
      };
    }

    await browserAPI.contextMenus.create(parentMenuProps);

    // Single-tab options
    await browserAPI.contextMenus.create({
      id: CONTEXT_MENU_IDS.SINGLE_COPY,
      parentId: CONTEXT_MENU_IDS.PARENT,
      title: 'Copy to Clipboard (Alt+Shift+M)',
      contexts: PAGE_CONTEXTS
    });

    await browserAPI.contextMenus.create({
      id: CONTEXT_MENU_IDS.SINGLE_DOWNLOAD,
      parentId: CONTEXT_MENU_IDS.PARENT,
      title: 'Download as Markdown (Alt+Shift+D)',
      contexts: PAGE_CONTEXTS
    });

    currentMenuMode = 'single';
    currentMenuTabCount = 0;
  } catch (error) {
    console.error('Error creating single-tab menus:', error);
  }
}

// Create multi-tab context menus
async function createMultiTabMenus(tabCount) {
  try {
    await browserAPI.contextMenus.removeAll();

    // Parent menu - appears in page/selection/link contexts (and tab in Firefox)
    const parentMenuProps = {
      id: CONTEXT_MENU_IDS.PARENT,
      title: `Copy to Markdown (${tabCount} tabs)`,
      contexts: PAGE_CONTEXTS
    };

    // Icons are only supported in Firefox
    if (isFirefox) {
      parentMenuProps.icons = {
        16: 'icons/icon16.png',
        32: 'icons/icon48.png'
      };
    }

    await browserAPI.contextMenus.create(parentMenuProps);

    // Multi-tab options
    await browserAPI.contextMenus.create({
      id: CONTEXT_MENU_IDS.MULTI_COPY,
      parentId: CONTEXT_MENU_IDS.PARENT,
      title: 'Copy All Tabs (Alt+Shift+M)',
      contexts: PAGE_CONTEXTS
    });

    await browserAPI.contextMenus.create({
      id: CONTEXT_MENU_IDS.MULTI_DOWNLOAD,
      parentId: CONTEXT_MENU_IDS.PARENT,
      title: 'Download Merged File (Alt+Shift+D)',
      contexts: PAGE_CONTEXTS
    });

    await browserAPI.contextMenus.create({
      id: CONTEXT_MENU_IDS.MULTI_ZIP,
      parentId: CONTEXT_MENU_IDS.PARENT,
      title: 'Download as ZIP (Alt+Shift+Z)',
      contexts: PAGE_CONTEXTS
    });

    currentMenuMode = 'multi';
    currentMenuTabCount = tabCount;
  } catch (error) {
    console.error('Error creating multi-tab menus:', error);
  }
}

// Update context menus based on tab selection
async function updateContextMenus() {
  try {
    const highlightedTabs = await MultiTabUtils.getHighlightedTabs(browserAPI);
    const tabCount = highlightedTabs.length;

    if (tabCount > 1) {
      // Multi-tab mode - recreate if mode changed or tab count changed
      if (currentMenuMode !== 'multi' || currentMenuTabCount !== tabCount) {
        await createMultiTabMenus(tabCount);
      }
    } else {
      // Single-tab mode
      if (currentMenuMode !== 'single') {
        await createSingleTabMenus();
      }
    }
  } catch (error) {
    console.error('Error updating context menus:', error);
  }
}

// Handle context menu clicks
browserAPI.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuItemId = info.menuItemId;

  // Single-tab actions
  if (menuItemId === CONTEXT_MENU_IDS.SINGLE_COPY) {
    // Trigger the keyboard shortcut handler for copy
    await handleKeyboardShortcut('convert_to_markdown');
  } else if (menuItemId === CONTEXT_MENU_IDS.SINGLE_DOWNLOAD) {
    // Trigger the keyboard shortcut handler for download
    await handleKeyboardShortcut('download_markdown');
  }
  // Multi-tab actions
  else if (menuItemId === CONTEXT_MENU_IDS.MULTI_COPY) {
    await handleKeyboardShortcut('convert_to_markdown');
  } else if (menuItemId === CONTEXT_MENU_IDS.MULTI_DOWNLOAD) {
    await handleKeyboardShortcut('download_markdown');
  } else if (menuItemId === CONTEXT_MENU_IDS.MULTI_ZIP) {
    await handleKeyboardShortcut('download_zip');
  }
});

// Listen for tab selection changes to update context menus
browserAPI.tabs.onHighlighted.addListener(() => {
  updateContextMenus();
});

// Listen for tab activation to update context menus
browserAPI.tabs.onActivated.addListener(() => {
  updateContextMenus();
});

// Initialize context menus when extension is installed or updated
browserAPI.runtime.onInstalled.addListener(async () => {
  await createSingleTabMenus();
});

// Initialize context menus when browser starts
browserAPI.runtime.onStartup.addListener(async () => {
  await createSingleTabMenus();
});

// Initialize context menus immediately on script load (for development/reload)
createSingleTabMenus();

// Show notification in the current tab
async function showNotificationInTab(title, message) {
  try {
    const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs.length) return;

    const tab = tabs[0];

    // Send message to content script to show notification
    await browserAPI.tabs.sendMessage(tab.id, {
      action: 'showNotification',
      title: title,
      message: message
    });
  } catch (error) {
    console.error('Failed to show notification:', error);
  }
}

// Handle multi-tab commands
async function handleMultiTabCommand(command, tabs) {
  try {
    // Ensure content scripts are loaded in all tabs
    for (const tab of tabs) {
      await ensureContentScriptLoaded(tab.id);
    }

    // Get user settings
    const settings = await browserAPI.storage.sync.get({
      contentScope: 'mainContent',
      preserveTables: true,
      includeImages: true,
      includeTitle: true,
      includeMetadata: true,
      metadataFormat: "---\nSource: [{title}]({url})"
    });

    // Process all tabs
    const results = await MultiTabUtils.processMultipleTabs(tabs, settings, browserAPI, null);
    const { message, successCount } = MultiTabUtils.getResultsSummary(results);

    if (successCount === 0) {
      await showNotificationInTab("Conversion Failed", "No tabs were successfully converted");
      return;
    }

    // Handle different commands
    if (command === "convert_to_markdown") {
      // Copy All: Merge and copy to clipboard
      const merged = MultiTabUtils.mergeMarkdownResults(results);

      // Copy to clipboard via active tab's content script
      const activeTabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
      if (activeTabs && activeTabs.length > 0) {
        await browserAPI.tabs.sendMessage(activeTabs[0].id, {
          action: "copyToClipboard",
          text: merged
        });
        await showNotificationInTab("Success", `${message} copied to clipboard`);
      }

    } else if (command === "download_markdown") {
      // Download Merged: Single .md file
      const merged = MultiTabUtils.mergeMarkdownResults(results);
      const filename = `llmfeeder-merged-${MultiTabUtils.getDateString()}.md`;

      // Trigger download via active tab
      const activeTabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
      if (activeTabs && activeTabs.length > 0) {
        await browserAPI.tabs.sendMessage(activeTabs[0].id, {
          action: "downloadMarkdown",
          markdown: merged,
          title: filename.replace('.md', '')
        });
        await showNotificationInTab("Success", `${message} downloaded as merged file`);
      }

    } else if (command === "download_zip") {
      // Download ZIP: Individual files in archive
      const { blob, filename } = await MultiTabUtils.createZipArchive(results);

      // Convert blob to data URL for download
      const reader = new FileReader();
      reader.onloadend = async function() {
        const activeTabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
        if (activeTabs && activeTabs.length > 0) {
          // Send download message to content script
          await browserAPI.tabs.sendMessage(activeTabs[0].id, {
            action: "downloadFile",
            dataUrl: reader.result,
            filename: filename
          });
          await showNotificationInTab("Success", `ZIP with ${message} downloaded`);
        }
      };
      reader.readAsDataURL(blob);
    }

  } catch (error) {
    console.error("Multi-tab command error:", error);
    await showNotificationInTab("Error", error.message || "Failed to process multiple tabs");
  }
}

// Handle keyboard shortcut/context menu action
async function handleKeyboardShortcut(command) {
  if (command === "convert_to_markdown" || command === "download_markdown" || command === "download_zip") {
    try {
      // Check if multiple tabs are selected
      const highlightedTabs = await MultiTabUtils.getHighlightedTabs(browserAPI);

      // Route to multi-tab handler if 2+ tabs selected
      if (highlightedTabs.length > 1) {
        await handleMultiTabCommand(command, highlightedTabs);
        return;
      }

      // Single-tab handling (existing behavior)
      const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
      if (!tabs || !tabs.length) {
        console.error("No active tab found");
        return;
      }

      const activeTab = tabs[0];
      
      // Check if the URL is valid for content scripts
      const url = activeTab.url || "";
      if (!url || url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:")) {
        await showNotificationInTab("Cannot Convert", "Cannot run on browser pages. Please try on a regular website.");
        return;
      }
      
      // Ensure content script is loaded
      const isLoaded = await ensureContentScriptLoaded(activeTab.id);
      if (!isLoaded) {
        await showNotificationInTab("Error", "Could not load content script. Try refreshing the page.");
        return;
      }
      
      // Get user settings
      const settings = await browserAPI.storage.sync.get({
        contentScope: 'mainContent',
        preserveTables: true,
        includeImages: true,
        includeTitle: true,
        includeMetadata: true,
        metadataFormat: "---\nSource: [{title}]({url})"
      });
      
      // Send message to content script to perform conversion
      try {
        const response = await browserAPI.tabs.sendMessage(activeTab.id, {
          action: "convertToMarkdown",
          settings: settings
        });
        
        if (response && response.success) {
          if (command === "download_markdown") {
            // Download as file
            const pageTitle = activeTab.title || "llmfeeder";
            await browserAPI.tabs.sendMessage(activeTab.id, {
              action: "downloadMarkdown",
              markdown: response.markdown,
              title: pageTitle
            });
            await showNotificationInTab("Success", "Markdown file downloaded");
          } else {
            // Copy to clipboard via content script
            await browserAPI.tabs.sendMessage(activeTab.id, {
              action: "copyToClipboard",
              text: response.markdown
            });
            await showNotificationInTab("Success", "Content converted to Markdown and copied to clipboard");
          }
        } else {
          await showNotificationInTab("Conversion Failed", response?.error || "Unknown error");
        }
      } catch (error) {
        console.error("Error during conversion:", error);
        await showNotificationInTab("Error", "Could not convert page. Please try again or open the extension popup.");
      }
    } catch (error) {
      console.error("Command handler error:", error);
    }
  }
}

// Handle keyboard shortcuts
browserAPI.commands.onCommand.addListener(async (command) => {
  await handleKeyboardShortcut(command);
});

/**
 * Copy text to clipboard via content script
 * @param {string} text - Text to copy
 */
async function copyToClipboard(text) {
  try {
    browserAPI.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      browserAPI.scripting.executeScript({
        target: {tabId: tab.id},
        function: textToClipboard,
        args: [text]
      }).catch(err => console.error('Could not inject clipboard script:', err));
    });
  } catch (error) {
    console.error('Could not copy to clipboard:', error);
  }
}

/**
 * This function runs in the context of the web page to copy text to clipboard
 * @param {string} text - Text to copy
 */
function textToClipboard(text) {
  // Create a temporary textarea element
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  
  // Select and copy
  textarea.select();
  document.execCommand('copy');
  
  // Clean up
  document.body.removeChild(textarea);
} 