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

// Handle keyboard shortcuts
browserAPI.commands.onCommand.addListener(async (command) => {
  if (command === "convert_to_markdown") {
    // Get current active tab
    const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    
    if (activeTab) {
      // Get user settings
      try {
        const settings = await browserAPI.storage.sync.get({
          contentScope: 'mainContent',
          preserveTables: true,
          includeImages: true
        });
        
        // Send message to content script to perform conversion
        try {
          const response = await browserAPI.tabs.sendMessage(activeTab.id, {
            action: "convertToMarkdown",
            options: settings
          });
          
          if (response && response.success) {
            console.log("Markdown conversion successful");
          }
        } catch (error) {
          console.error("Error during conversion:", error);
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      }
    }
  }
});

/**
 * Show a simple notification to the user
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 */
function showNotification(title, message) {
  // In Chrome extensions, we can use the notifications API if we have permission
  // For this simple implementation, we'll just create a basic notification
  browserAPI.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const tab = tabs[0];
    
    // Inject a content script to show a visual notification on the page
    browserAPI.scripting.executeScript({
      target: {tabId: tab.id},
      function: createPageNotification,
      args: [title, message]
    }).catch(err => console.error('Could not inject notification script:', err));
  });
}

/**
 * This function runs in the context of the web page to show a notification
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 */
function createPageNotification(title, message) {
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