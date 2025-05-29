/**
 * Browser API compatibility layer for LLMFeeder
 * Provides a unified interface for Chrome and Firefox extensions
 */

(function() {
  // Create a unified 'browser' object that works in both Chrome and Firefox
  window.browserAPI = (function() {
    // Check if we're in Firefox (browser is defined) or Chrome (chrome is defined)
    const isBrowser = typeof browser !== 'undefined';
    const isChrome = typeof chrome !== 'undefined';
    
    // Base object - we'll use Firefox's browser API as our model
    const api = {};
    
    // Helper to promisify callback-based Chrome APIs
    function promisify(chromeAPICall) {
      return (...args) => {
        return new Promise((resolve, reject) => {
          chromeAPICall(...args, (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(result);
            }
          });
        });
      };
    }
    
    // Set up tabs API
    if (isBrowser) {
      api.tabs = browser.tabs;
    } else if (isChrome) {
      api.tabs = {
        query: promisify(chrome.tabs.query),
        sendMessage: promisify(chrome.tabs.sendMessage),
        // Add more methods as needed
      };
    }
    
    // Set up runtime API
    if (isBrowser) {
      api.runtime = browser.runtime;
    } else if (isChrome) {
      api.runtime = {
        // Maintain event listeners
        onMessage: chrome.runtime.onMessage,
        // Add other runtime methods as needed
        getURL: chrome.runtime.getURL,
        lastError: chrome.runtime.lastError
      };
    }
    
    // Set up storage API
    if (isBrowser) {
      api.storage = browser.storage;
    } else if (isChrome) {
      api.storage = {
        sync: {
          get: promisify(chrome.storage.sync.get),
          set: promisify(chrome.storage.sync.set)
        }
        // Add more storage types as needed
      };
    }
    
    // Set up commands API
    if (isBrowser) {
      api.commands = browser.commands;
    } else if (isChrome) {
      api.commands = {
        onCommand: chrome.commands.onCommand
      };
    }
    
    // Set up scripting API
    if (isBrowser) {
      api.scripting = browser.scripting;
    } else if (isChrome) {
      api.scripting = chrome.scripting;
    }
    
    // Clipboard handling - different across browsers
    api.clipboard = {
      writeText: (text) => {
        return navigator.clipboard.writeText(text);
      }
    };
    
    return api;
  })();
})(); 