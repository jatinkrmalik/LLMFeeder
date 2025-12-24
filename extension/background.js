// LLMFeeder Background Script
// Handles keyboard shortcuts and background tasks

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
  } else if (isChrome) {
    // Chrome needs promisification
    api.tabs = {
      query: promisify(chrome.tabs.query, chrome.tabs),
      sendMessage: promisify(chrome.tabs.sendMessage, chrome.tabs),
    };
    
    api.runtime = {
      onMessage: chrome.runtime.onMessage,
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

// Handle keyboard shortcuts
browserAPI.commands.onCommand.addListener(async (command) => {
  if (command === "convert_to_markdown") {
    try {
      // Get current active tab
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
          // Copy to clipboard via content script
          await browserAPI.tabs.sendMessage(activeTab.id, {
            action: "copyToClipboard",
            text: response.markdown
          });
          
          await showNotificationInTab("Success", "Content converted to Markdown and copied to clipboard");
          console.log("Markdown conversion successful");
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