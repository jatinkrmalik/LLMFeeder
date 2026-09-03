// LLMFeeder Background Script
// Handles keyboard shortcuts and background tasks
// Dependencies: libs/jszip.min.js, shortcut-utils.js, settings.js, and multi-tab-utils.js
// (loaded via manifest in Firefox, or importScripts in Chrome service worker)

// Load dependencies for Chrome service worker (not needed in Firefox)
if (typeof importScripts === 'function') {
  try {
    importScripts('libs/jszip.min.js', 'shortcut-utils.js', 'settings.js', 'multi-tab-utils.js');
  } catch (e) {
    console.error('Failed to load dependencies:', e);
    throw new Error('Critical dependencies failed to load. Please reinstall the extension.');
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
    api.action = browser.action;
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
      getAll: promisify(chrome.commands.getAll, chrome.commands),
      onCommand: chrome.commands.onCommand
    };

    api.scripting = chrome.scripting;
    api.action = chrome.action;

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
let menuUpdateLock = Promise.resolve(); // Mutex lock for menu operations

// Browser-specific contexts ('tab' is Firefox-only)
// Detect Firefox by checking for browser.menus API
// Chrome doesn't support "menus" permission, so browser.menus will be undefined
const isFirefox = typeof browser !== 'undefined' &&
                  typeof browser.menus !== 'undefined';

const PAGE_CONTEXTS = isFirefox
  ? ['page', 'selection', 'link', 'tab']  // Firefox supports 'tab' context
  : ['page', 'selection', 'link'];        // Chrome doesn't support 'tab'

// Helper to run menu operations with mutex lock
async function withMenuLock(operation) {
  menuUpdateLock = menuUpdateLock.then(async () => {
    await operation();
  }).catch(err => {
    console.error('Menu operation error:', err);
  });
  return menuUpdateLock;
}

// Create single-tab context menus
async function createSingleTabMenus() {
  return withMenuLock(async () => {
    await browserAPI.contextMenus.removeAll();

    const parentMenuProps = {
      id: CONTEXT_MENU_IDS.PARENT,
      title: 'Copy to Markdown',
      contexts: PAGE_CONTEXTS
    };

    if (isFirefox) {
      parentMenuProps.icons = {
        16: 'icons/icon16.png',
        32: 'icons/icon48.png'
      };
    }

    await browserAPI.contextMenus.create(parentMenuProps);

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
  });
}

// Create multi-tab context menus
async function createMultiTabMenus(tabCount) {
  return withMenuLock(async () => {
    await browserAPI.contextMenus.removeAll();

    const parentMenuProps = {
      id: CONTEXT_MENU_IDS.PARENT,
      title: `Copy to Markdown (${tabCount} tabs)`,
      contexts: PAGE_CONTEXTS
    };

    if (isFirefox) {
      parentMenuProps.icons = {
        16: 'icons/icon16.png',
        32: 'icons/icon48.png'
      };
    }

    await browserAPI.contextMenus.create(parentMenuProps);

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
  });
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
    await handleKeyboardShortcut('convert_to_markdown', { tab });
  } else if (menuItemId === CONTEXT_MENU_IDS.SINGLE_DOWNLOAD) {
    await handleKeyboardShortcut('download_markdown', { tab });
  }
  // Multi-tab actions
  else if (menuItemId === CONTEXT_MENU_IDS.MULTI_COPY) {
    await handleKeyboardShortcut('convert_to_markdown', { tab });
  } else if (menuItemId === CONTEXT_MENU_IDS.MULTI_DOWNLOAD) {
    await handleKeyboardShortcut('download_markdown', { tab });
  } else if (menuItemId === CONTEXT_MENU_IDS.MULTI_ZIP) {
    await handleKeyboardShortcut('download_zip', { tab });
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
async function handleMultiTabCommand(command, tabs, options) {
  const returnResult = options && options.returnResult === true;

  async function fail(title, message) {
    if (!returnResult) {
      await showNotificationInTab(title, message);
    }
    return { success: false, error: message };
  }

  try {
    // Warn about large operations (can't use confirm in background, so just notify)
    if (!returnResult && MultiTabUtils.shouldWarnAboutLargeTabCount(tabs.length)) {
      await showNotificationInTab("Processing Many Tabs", `Converting ${tabs.length} tabs. This may take some time...`);
    }

    // Get user settings
    const settings = await SettingsUtils.getUserSettings(browserAPI);

    // Process all tabs (content scripts are ensured per tab in the worker)
    const results = await MultiTabUtils.processMultipleTabs(tabs, settings, browserAPI, null);
    const { message, successCount } = MultiTabUtils.getResultsSummary(results);

    if (successCount === 0) {
      return fail("Conversion Failed", "No tabs were successfully converted");
    }

    // Get token count settings
    let tokenSettings;
    try {
      tokenSettings = await browserAPI.storage.sync.get({
        showTokenCount: true,
        tokenContextLimit: 8192
      });
    } catch (e) {
      tokenSettings = { showTokenCount: true, tokenContextLimit: 8192 };
    }

    // Calculate total token count from all successful tabs
    let totalTokenCount = 0;
    results.forEach(result => {
      if (result.success && result.tokenCount) {
        totalTokenCount += result.tokenCount;
      }
    });

    // Format token count message
    let tokenMessage = "";
    if (tokenSettings.showTokenCount && totalTokenCount > 0) {
      const limit = tokenSettings.tokenContextLimit;
      const percentage = Math.round((totalTokenCount / limit) * 100);
      tokenMessage = `\n${totalTokenCount.toLocaleString()} tokens (${percentage}% of ${(limit/1000).toFixed(0)}K limit)`;
    }

    // Handle different commands
    if (command === "convert_to_markdown") {
      // Copy All: Merge and copy to clipboard
      const merged = MultiTabUtils.mergeMarkdownResults(results);
      const notification = {
        title: "Success",
        message: `${message} copied to clipboard${tokenMessage}`
      };

      if (returnResult) {
        return {
          success: true,
          action: "copy",
          text: merged,
          notification
        };
      }

      // Use the tab that was active when this multi-tab action started.
      const outputTab = tabs.find(tab => tab.active) || tabs[0];
      if (outputTab) {
        const copyResponse = await browserAPI.tabs.sendMessage(outputTab.id, {
          action: "copyToClipboard",
          text: merged
        });
        if (!copyResponse || !copyResponse.success) {
          return fail("Copy Failed", (copyResponse && copyResponse.error) || "Could not write to the clipboard");
        }
        await showNotificationInTab(notification.title, notification.message);
        return { success: true };
      }
      return fail("Copy Failed", "No active tab found");

    } else if (command === "download_markdown") {
      // Download Merged: Single .md file
      const merged = MultiTabUtils.mergeMarkdownResults(results);
      const filename = `llmfeeder-merged-${MultiTabUtils.getDateString()}.md`;
      const title = filename.replace('.md', '');
      const notification = {
        title: "Success",
        message: `${message} downloaded as merged file${tokenMessage}`
      };

      if (returnResult) {
        return {
          success: true,
          action: "downloadMarkdown",
          markdown: merged,
          title,
          notification
        };
      }

      // Trigger the download in the tab that started the action.
      const outputTab = tabs.find(tab => tab.active) || tabs[0];
      if (outputTab) {
        const downloadResponse = await browserAPI.tabs.sendMessage(outputTab.id, {
          action: "downloadMarkdown",
          markdown: merged,
          title
        });
        if (!downloadResponse || !downloadResponse.success) {
          return fail("Download Failed", (downloadResponse && downloadResponse.error) || "Could not download the Markdown file");
        }
        await showNotificationInTab(notification.title, notification.message);
        return { success: true };
      }
      return fail("Download Failed", "No active tab found");

    } else if (command === "download_zip") {
      // Download ZIP: Individual files in archive
      const { blob, filename } = await MultiTabUtils.createZipArchive(results);

      // Convert blob to data URL for download
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read blob'));
        reader.readAsDataURL(blob);
      });
      const notification = {
        title: "Success",
        message: `ZIP with ${message} downloaded${tokenMessage}`
      };

      if (returnResult) {
        return {
          success: true,
          action: "downloadFile",
          dataUrl,
          filename,
          notification
        };
      }

      const outputTab = tabs.find(tab => tab.active) || tabs[0];
      if (outputTab) {
        // Send download message to content script
        const downloadResponse = await browserAPI.tabs.sendMessage(outputTab.id, {
          action: "downloadFile",
          dataUrl: dataUrl,
          filename: filename
        });
        if (!downloadResponse || !downloadResponse.success) {
          return fail("Download Failed", (downloadResponse && downloadResponse.error) || "Could not download the ZIP file");
        }
        await showNotificationInTab(notification.title, notification.message);
        return { success: true };
      }
      return fail("Download Failed", "No active tab found");
    }

  } catch (error) {
    console.error("Multi-tab command error:", error);
    return fail("Error", error.message || "Failed to process multiple tabs");
  }

  return { success: false, error: "Unknown keyboard command" };
}

// Handle a shortcut after the native/fallback arbiter accepts it.
async function handleKeyboardShortcut(command, options) {
  const returnResult = options && options.returnResult === true;
  const invocationTab = options && options.tab;

  async function fail(title, message) {
    if (!returnResult) {
      await showNotificationInTab(title, message);
    }
    return { success: false, error: message };
  }

  if (command === '_execute_action') {
    try {
      if (!browserAPI.action || typeof browserAPI.action.openPopup !== 'function') {
        return fail('Error', 'This browser cannot open the extension popup from a shortcut');
      }
      // Orion only preserves the user activation for its no-argument form.
      // This runs in the key event task, before focus can move to another window.
      await browserAPI.action.openPopup();
      return { success: true, action: 'handled' };
    } catch (error) {
      console.error('Could not open extension popup:', error);
      return fail('Error', error.message || 'Could not open the extension popup');
    }
  }

  if (command !== 'convert_to_markdown' &&
      command !== 'download_markdown' &&
      command !== 'download_zip') {
    return { success: false, error: 'Unknown keyboard command' };
  }

  try {
    // Every accepted shortcut checks selected tabs before choosing its path.
    const highlightedTabs = options && options.highlightedTabs
      ? options.highlightedTabs
      : await MultiTabUtils.getHighlightedTabs(
        browserAPI,
        invocationTab && invocationTab.windowId
      );
    if (highlightedTabs.length > 1) {
      return handleMultiTabCommand(command, highlightedTabs, { returnResult });
    }

    let activeTab = invocationTab;
    if (!activeTab) {
      const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
      if (!tabs || !tabs.length) {
        console.error('No active tab found');
        return fail('Error', 'No active tab found');
      }
      activeTab = tabs[0];
    }

    const url = activeTab.url || '';
    if (!url || url.startsWith('chrome://') || url.startsWith('edge://') ||
        url.startsWith('about:') || url.startsWith('chrome-extension://') ||
        url.startsWith('moz-extension://')) {
      return fail('Cannot Convert', 'Cannot run on browser pages. Please try on a regular website.');
    }

    const isLoaded = await MultiTabUtils.ensureContentScriptLoaded(browserAPI, activeTab.id);
    if (!isLoaded) {
      return fail('Error', 'Could not load content script. Try refreshing the page.');
    }

    const settings = await SettingsUtils.getUserSettings(browserAPI);
    const response = await browserAPI.tabs.sendMessage(activeTab.id, {
      action: 'convertToMarkdown',
      settings
    });

    if (!response || !response.success) {
      return fail('Conversion Failed', (response && response.error) || 'Unknown error');
    }

    let tokenSettings;
    try {
      tokenSettings = await browserAPI.storage.sync.get({
        showTokenCount: true,
        tokenContextLimit: 8192
      });
    } catch (error) {
      tokenSettings = { showTokenCount: true, tokenContextLimit: 8192 };
    }

    let tokenMessage = '';
    if (tokenSettings.showTokenCount && response.tokenCount > 0) {
      const limit = tokenSettings.tokenContextLimit;
      const percentage = Math.round((response.tokenCount / limit) * 100);
      tokenMessage = `\n${response.tokenCount.toLocaleString()} tokens (${percentage}% of ${(limit / 1000).toFixed(0)}K limit)`;
    }

    if (command === 'download_markdown') {
      const pageTitle = activeTab.title || 'llmfeeder';
      const notification = {
        title: 'Success',
        message: `Markdown file downloaded${tokenMessage}`
      };

      if (returnResult) {
        return {
          success: true,
          action: 'downloadMarkdown',
          markdown: response.markdown,
          title: pageTitle,
          notification
        };
      }

      const downloadResponse = await browserAPI.tabs.sendMessage(activeTab.id, {
        action: 'downloadMarkdown',
        markdown: response.markdown,
        title: pageTitle
      });
      if (!downloadResponse || !downloadResponse.success) {
        return fail('Download Failed', (downloadResponse && downloadResponse.error) || 'Could not download the Markdown file');
      }
      await showNotificationInTab(notification.title, notification.message);
      return { success: true };
    }

    const notification = {
      title: 'Success',
      message: `Content converted and copied to clipboard${tokenMessage}`
    };

    if (returnResult) {
      return {
        success: true,
        action: 'copy',
        text: response.markdown,
        notification
      };
    }

    const copyResponse = await browserAPI.tabs.sendMessage(activeTab.id, {
      action: 'copyToClipboard',
      text: response.markdown
    });
    if (!copyResponse || !copyResponse.success) {
      return fail('Copy Failed', (copyResponse && copyResponse.error) || 'Could not write to the clipboard');
    }
    await showNotificationInTab(notification.title, notification.message);
    return { success: true };
  } catch (error) {
    console.error('Command handler error:', error);
    return fail('Error', error.message || 'Could not convert page. Please try again or open the extension popup.');
  }
}

const shortcutArbiter = ShortcutUtils.createArbiter({ dedupeMs: 500 });

async function getAssignedShortcutBindings() {
  try {
    const commands = await browserAPI.commands.getAll();
    return ShortcutUtils.getAssignedShortcuts(commands);
  } catch (error) {
    console.error('Could not read assigned keyboard shortcuts:', error);
    return [];
  }
}

function submitShortcutCommand(command, source, options) {
  return shortcutArbiter.submit(command, source, () =>
    handleKeyboardShortcut(command, options)
  );
}

async function handleShortcutFallback(request, sender) {
  if (!sender || !sender.tab || sender.tab.id === undefined) {
    return { accepted: false, error: 'Keyboard fallback requires a tab' };
  }

  // Reserved action commands never emit commands.onCommand. Calling
  // openPopup after an await also loses user activation in Orion, so use the
  // assigned binding already matched by the content script and route it now.
  if (request.command === '_execute_action') {
    return shortcutArbiter.submitImmediate(request.command, () =>
      handleKeyboardShortcut(request.command, {
        returnResult: true,
        tab: sender.tab
      })
    );
  }

  const bindingsPromise = getAssignedShortcutBindings();
  const highlightedTabsPromise = MultiTabUtils.getHighlightedTabs(
    browserAPI,
    sender.tab.windowId
  ).then(tabs => ({ tabs }), error => ({ error }));
  return shortcutArbiter.submit(
    request.command,
    'fallback',
    async () => {
      const highlightedSnapshot = await highlightedTabsPromise;
      if (highlightedSnapshot.error) throw highlightedSnapshot.error;
      return handleKeyboardShortcut(request.command, {
        returnResult: true,
        tab: sender.tab,
        highlightedTabs: highlightedSnapshot.tabs
      });
    },
    async () => {
      const bindings = await bindingsPromise;
      const assigned = bindings.some(binding =>
        binding.command === request.command && binding.shortcut === request.shortcut
      );
      return assigned ? true : { error: 'Keyboard shortcut is not assigned' };
    }
  );
}

browserAPI.commands.onCommand.addListener((command, tab) => {
  submitShortcutCommand(command, 'native', { tab }).catch(error => {
    console.error('Native keyboard command failed:', error);
  });
});

// Keep Chrome's callback channel open while asynchronous shortcut work runs.
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request) return;

  if (request.action === 'getAssignedKeyboardShortcuts') {
    getAssignedShortcutBindings()
      .then(bindings => sendResponse({ success: true, bindings }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'actionPopupOpened') {
    shortcutArbiter.markHandled('_execute_action');
    sendResponse({ success: true });
    return;
  }

  if (request.action === 'keyboardShortcutFallback') {
    handleShortcutFallback(request, sender)
      .then(sendResponse)
      .catch(error => sendResponse({ accepted: false, error: error.message }));
    return true;
  }
});
