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
    api.contextMenus = browser.contextMenus;
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
    api.contextMenus = chrome.contextMenus;
  }
  
  return api;
})();

// Create context menu items when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  console.log("Creating context menu items");
  
  // Main context menu item - only appears when text is selected
  chrome.contextMenus.create({
    id: "convert-selection",
    title: "Convert selection to Markdown & copy",
    contexts: ["selection"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "convert-selection") {
    handleSelectedText(info.selectionText, tab);
  }
});

// Function to handle selected text conversion
async function handleSelectedText(selectedText, tab) {
  if (!selectedText || selectedText.trim() === '') {
    await showNotificationInTab("Error", "No text selected");
    return;
  }
  
  try {
    // Format the selected text
    const formattedMarkdown = formatSelectedTextAsMarkdown(selectedText, tab.title, tab.url);
    
    // Copy to clipboard - multiple approaches for maximum compatibility
    let copied = false;
    
    // 1. Try using navigator.clipboard directly in background context (works in some browsers)
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(formattedMarkdown);
        copied = true;
        console.log("Copied using navigator.clipboard in background");
      }
    } catch (clipboardError) {
      console.log("Background clipboard API failed:", clipboardError);
    }
    
    // 2. If direct clipboard access failed, try to use the service worker approach
    if (!copied) {
      try {
        // Store the text to be copied
        chrome.storage.local.set({
          'markdownToCopy': formattedMarkdown
        });
        
        // Open the copy popup which will handle the clipboard operation
        chrome.windows.create({
          url: chrome.runtime.getURL('copy-popup.html'),
          type: 'popup',
          width: 600,
          height: 400,
          focused: true
        });
        
        return; // Exit early since we're showing the popup
      } catch (error) {
        console.error("Clipboard error:", error);
        
        // 3. Last resort: Try the ultra-minimal approach with query parameter
        // This is the most compatible approach for highly restricted sites
        const encodedText = encodeURIComponent(formattedMarkdown);
        chrome.tabs.create({
          url: chrome.runtime.getURL(`direct-copy.html?text=${encodedText}`)
        });
        
        return;
      }
    }
    
    // Show success notification if we got here (meaning the direct clipboard worked)
    if (copied) {
      await showNotificationInTab("Success", "Selection converted and copied to clipboard");
    }
  } catch (error) {
    console.error("Selection handling error:", error);
    
    // Try to show a notification or open the popup as last resort
    try {
      // Use the ultra-minimal approach as final fallback
      const errorMessage = `# Error occurred\n\nCould not process the selection due to site restrictions.\n\nHere's your original selection:\n\n${selectedText}`;
      const encodedText = encodeURIComponent(errorMessage);
      
      chrome.tabs.create({
        url: chrome.runtime.getURL(`direct-copy.html?text=${encodedText}`)
      });
    } catch (popupError) {
      console.error("Even popup failed:", popupError);
    }
  }
}

// Format selected text as markdown with title and source link
function formatSelectedTextAsMarkdown(text, title, url) {
  // Clean the text (remove excessive whitespace)
  const cleanedText = text.replace(/\s+/g, ' ').trim();
  
  // Format as markdown
  return `# ${title}\n\n${cleanedText}\n\n---\nSource: [${title}](${url})`;
}

// Ensure content script is injected before sending messages
async function ensureContentScriptLoaded(tabId) {
  try {
    // Get tab information to check URL
    const tab = await chrome.tabs.get(tabId);
    const url = tab.url || "";
    
    // Check if we're on a restricted page
    if (isRestrictedPage(url)) {
      console.warn("Cannot inject scripts into restricted page:", url);
      return false;
    }
    
    // Try sending a ping message to check if content script is loaded
    try {
      await browserAPI.tabs.sendMessage(tabId, { action: "ping" });
      console.log("Content script is already loaded");
      return true;
    } catch (pingError) {
      console.log("Content script not loaded, attempting to inject...");
      
      // If error (script not loaded), inject the content script
      if (typeof chrome !== 'undefined' && chrome.scripting) {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ["libs/readability.js", "libs/turndown.js", "content.js"]
        });
        
        // Verify injection worked by sending another ping
        try {
          await browserAPI.tabs.sendMessage(tabId, { action: "ping" });
          console.log("Content script injected successfully");
          return true;
        } catch (verifyError) {
          console.error("Failed to verify content script injection:", verifyError);
          return false;
        }
      } else if (typeof browser !== 'undefined' && browser.scripting) {
        await browser.scripting.executeScript({
          target: { tabId: tabId },
          files: ["libs/readability.js", "libs/turndown.js", "content.js"]
        });
        
        // Verify injection worked
        try {
          await browserAPI.tabs.sendMessage(tabId, { action: "ping" });
          console.log("Content script injected successfully");
          return true;
        } catch (verifyError) {
          console.error("Failed to verify content script injection:", verifyError);
          return false;
        }
      } else {
        console.error("Scripting API not available");
        return false;
      }
    }
  } catch (error) {
    console.error("Error ensuring content script loaded:", error);
    return false;
  }
}

// Helper function to check if a page is restricted
function isRestrictedPage(url) {
  if (!url) return true;
  
  // List of restricted URL schemes
  const restrictedSchemes = [
    'chrome://', 
    'chrome-extension://',
    'edge://',
    'about:',
    'moz-extension://',
    'file://',
    'view-source:',
    'data:',
    'devtools://'
  ];
  
  // Check if URL starts with any restricted scheme
  for (const scheme of restrictedSchemes) {
    if (url.startsWith(scheme)) {
      return true;
    }
  }
  
  // Check for other special cases
  if (url === 'newtab' || url === 'New Tab') {
    return true;
  }
  
  return false;
}

// Show notification in the current tab
async function showNotificationInTab(title, message) {
  try {
    const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs.length) return;
    
    const tab = tabs[0];
    await browserAPI.scripting.executeScript({
      target: { tabId: tab.id },
      function: (title, message) => {
        // Create notification element
        const notification = document.createElement('div');
        notification.style.position = 'fixed';
        notification.style.top = '20px';
        notification.style.right = '20px';
        notification.style.backgroundColor = '#fff';
        notification.style.border = '1px solid #ccc';
        notification.style.borderRadius = '4px';
        notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        notification.style.padding = '10px 15px';
        notification.style.zIndex = '9999';
        notification.style.maxWidth = '300px';
        notification.style.fontFamily = 'Roboto, Arial, sans-serif';
        
        // Add title
        const titleElement = document.createElement('h3');
        titleElement.textContent = title;
        titleElement.style.margin = '0 0 5px 0';
        titleElement.style.fontSize = '16px';
        notification.appendChild(titleElement);
        
        // Add message
        const messageElement = document.createElement('p');
        messageElement.textContent = message;
        messageElement.style.margin = '0';
        messageElement.style.fontSize = '14px';
        notification.appendChild(messageElement);
        
        // Add to page
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
          notification.style.opacity = '0';
          notification.style.transition = 'opacity 0.5s';
          setTimeout(() => notification.remove(), 500);
        }, 3000);
      },
      args: [title, message]
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
      if (!url || isRestrictedPage(url)) {
        await showNotificationInTab("Cannot Convert", "Cannot run on browser pages. Please try on a regular website.");
        return;
      }
      
      // Handle sites with CSP restrictions by trying a simplified approach first
      try {
        // Get user settings
        const settings = await browserAPI.storage.sync.get({
          contentScope: 'mainContent',
          preserveTables: true,
          includeImages: true
        });
        
        // Try direct approach first - getting selected text
        const scriptResult = await browserAPI.scripting.executeScript({
          target: { tabId: activeTab.id },
          function: getSelectedTextAndTitle
        });
        
        // Check if we got a successful result
        if (scriptResult && scriptResult[0] && scriptResult[0].result) {
          const result = scriptResult[0].result;
          
          // If there's selected text, use it directly
          if (result.selectedText && result.selectedText.trim().length > 0) {
            await copyToClipboard(result.selectedText);
            await showNotificationInTab("Success", "Selected text copied to clipboard");
            return;
          }
        }
        
        // If no selection or the direct approach failed, try the regular way
        const isLoaded = await ensureContentScriptLoaded(activeTab.id);
        if (!isLoaded) {
          throw new Error("Could not load content script");
        }
        
        // Send message to content script to perform conversion
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
        
        // Check if this might be a CSP restriction
        if (error.message && (
            error.message.includes("ExtensionsSettings policy") || 
            error.message.includes("cannot be scripted") ||
            error.message.includes("Cannot access contents"))) {
          await showNotificationInTab("Restricted Page", "This page restricts extensions. Try selecting text manually.");
        } else {
          await showNotificationInTab("Error", "Could not convert page. Please try again or open the extension popup.");
        }
      }
    } catch (error) {
      console.error("Command handler error:", error);
    }
  }
});

/**
 * Function to get selected text and page title directly 
 * (runs in page context so might work with CSP restrictions)
 */
function getSelectedTextAndTitle() {
  const selection = window.getSelection();
  const selectedText = selection ? selection.toString() : '';
  
  // Format the selected text with some basic context
  let formattedText = '';
  
  if (selectedText && selectedText.trim().length > 0) {
    formattedText = `# ${document.title}\n\n${selectedText}\n\n---\nSource: [${document.title}](${window.location.href})`;
  }
  
  return {
    selectedText: formattedText,
    title: document.title,
    url: window.location.href
  };
}

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