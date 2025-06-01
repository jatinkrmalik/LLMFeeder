// LLMFeeder Popup Script
// Created by @jatinkrmalik (https://github.com/jatinkrmalik)

// Create a proper browserAPI wrapper for the popup
const browserAPI = (function() {
  // Check if we're in Firefox (browser is defined) or Chrome (chrome is defined)
  const isBrowser = typeof browser !== 'undefined';
  const isChrome = typeof chrome !== 'undefined';
  
  // Base object
  const api = {};
  
  if (isBrowser) {
    // Firefox already has promise-based APIs
    api.tabs = browser.tabs;
    api.runtime = browser.runtime;
    api.storage = browser.storage;
    api.commands = browser.commands;
  } else if (isChrome) {
    // Chrome APIs
    api.tabs = {
      query: function(queryInfo) {
        return new Promise((resolve, reject) => {
          chrome.tabs.query(queryInfo, (tabs) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(tabs);
            }
          });
        });
      },
      sendMessage: function(tabId, message) {
        return new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        });
      }
    };
    
    api.runtime = chrome.runtime;
    
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
    
    api.commands = chrome.commands;
  }
  
  return api;
})();

// DOM elements
const convertBtn = document.getElementById('convertBtn');
const statusIndicator = document.getElementById('statusIndicator');
const settingsToggleBtn = document.getElementById('settingsToggleBtn');
const settingsContainer = document.getElementById('settingsContainer');
const previewContainer = document.getElementById('previewContainer');
const previewContent = document.getElementById('previewContent');
const convertShortcut = document.getElementById('convertShortcut');
const popupShortcut = document.getElementById('popupShortcut');
const quickConvertShortcut = document.getElementById('quickConvertShortcut');

// Get all settings elements
const contentScopeRadios = document.querySelectorAll('input[name="contentScope"]');
const preserveTablesCheckbox = document.getElementById('preserveTables');
const includeImagesCheckbox = document.getElementById('includeImages');

// Show proper keyboard shortcuts based on OS
function updateShortcutDisplay() {
  // Detect OS
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modifier = isMac ? '⌥⇧' : 'Alt+Shift+';
  
  // Update shortcut badges
  popupShortcut.textContent = `${modifier}L`;
  quickConvertShortcut.textContent = `${modifier}M`;
  convertShortcut.textContent = `${modifier}M`;
  
  // Update shortcut customization instruction
  const shortcutCustomizeText = document.querySelector('.shortcut-customize small');
  if (shortcutCustomizeText) {
    const browserName = typeof browser !== 'undefined' ? 'Firefox' : 'Chrome';
    const shortcutPage = browserName === 'Firefox' ? 'about:addons' : 'chrome://extensions/shortcuts';
    shortcutCustomizeText.textContent = `Customize at ${shortcutPage}`;
  }
}

// Load user settings
async function loadSettings() {
  try {
    const data = await browserAPI.storage.sync.get({
      contentScope: 'mainContent',
      preserveTables: true,
      includeImages: true
    });
    
    // Apply settings to UI
    document.querySelector(`input[name="contentScope"][value="${data.contentScope}"]`).checked = true;
    preserveTablesCheckbox.checked = data.preserveTables;
    includeImagesCheckbox.checked = data.includeImages;
  } catch (error) {
    console.error('Error loading settings:', error);
    statusIndicator.textContent = 'Error loading settings';
    statusIndicator.classList.add('error');
  }
}

// Save user settings
async function saveSettings() {
  try {
    const contentScope = document.querySelector('input[name="contentScope"]:checked').value;
    const preserveTables = preserveTablesCheckbox.checked;
    const includeImages = includeImagesCheckbox.checked;
    
    await browserAPI.storage.sync.set({
      contentScope,
      preserveTables,
      includeImages
    });
    
    console.log('Settings saved');
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Convert current page to Markdown
async function convertToMarkdown() {
  statusIndicator.textContent = 'Converting...';
  statusIndicator.className = 'status processing';
  previewContainer.classList.add('hidden');
  
  try {
    // Get current tab
    const tabs = await browserAPI.tabs.query({active: true, currentWindow: true});
    if (!tabs || tabs.length === 0) {
      throw new Error('No active tab found');
    }
    
    // Check if we're on a restricted page
    const tab = tabs[0];
    if (isRestrictedPage(tab.url)) {
      statusIndicator.textContent = 'Cannot run on this type of page';
      statusIndicator.className = 'status error';
      return;
    }
    
    // Get current settings
    const contentScope = document.querySelector('input[name="contentScope"]:checked').value;
    const preserveTables = preserveTablesCheckbox.checked;
    const includeImages = includeImagesCheckbox.checked;
    
    // Try to send message to content script
    try {
      // Send message to content script
      const response = await browserAPI.tabs.sendMessage(tabs[0].id, {
        action: 'convertToMarkdown',
        settings: {
          contentScope,
          preserveTables,
          includeImages
        }
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Unknown error');
      }
      
      // Copy to clipboard
      await navigator.clipboard.writeText(response.markdown);
      
      // Update UI
      statusIndicator.textContent = 'Copied to clipboard!';
      statusIndicator.className = 'status success';
      
      // Show preview
      previewContent.textContent = response.markdown;
      previewContainer.classList.remove('hidden');
      
      // Save settings
      saveSettings();
    } catch (messageError) {
      console.error('Message error:', messageError);
      
      // Check if this is a connection error (content script not loaded)
      const errorMessage = messageError.message || '';
      if (errorMessage.includes('Receiving end does not exist') || 
          errorMessage.includes('Could not establish connection')) {
        
        statusIndicator.textContent = 'Attempting to inject content script...';
        
        // Try to inject the content script
        try {
          if (chrome && chrome.scripting) {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ["libs/readability.js", "libs/turndown.js", "content.js"]
            });
            
            // Try again after injection
            statusIndicator.textContent = 'Retrying conversion...';
            setTimeout(() => convertToMarkdown(), 500);
          } else {
            throw new Error('Cannot inject script');
          }
        } catch (injectionError) {
          console.error('Injection error:', injectionError);
          statusIndicator.textContent = 'Please refresh the page and try again';
          statusIndicator.className = 'status error';
        }
      } else {
        // Other message errors
        statusIndicator.textContent = `Error: ${messageError.message || 'Failed to convert page'}`;
        statusIndicator.className = 'status error';
      }
    }
  } catch (error) {
    console.error('Conversion error:', error);
    statusIndicator.textContent = `Error: ${error.message || 'Failed to convert page'}`;
    statusIndicator.className = 'status error';
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

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  updateShortcutDisplay();
  loadSettings();
  
  // Check current tab
  checkCurrentTab();
  
  // Convert button click
  convertBtn.addEventListener('click', convertToMarkdown);
  
  // Settings toggle
  settingsToggleBtn.addEventListener('click', () => {
    const isHidden = settingsContainer.classList.contains('hidden');
    settingsContainer.classList.toggle('hidden');
    settingsToggleBtn.querySelector('.toggle-icon').textContent = isHidden ? '▲' : '▼';
  });
  
  // Save settings when changed
  contentScopeRadios.forEach(radio => {
    radio.addEventListener('change', saveSettings);
  });
  
  preserveTablesCheckbox.addEventListener('change', saveSettings);
  includeImagesCheckbox.addEventListener('change', saveSettings);
});

// Check the current tab and update UI accordingly
async function checkCurrentTab() {
  try {
    const tabs = await browserAPI.tabs.query({active: true, currentWindow: true});
    if (!tabs || tabs.length === 0) return;
    
    const tab = tabs[0];
    
    // If we're on a restricted page, disable the convert button and show a message
    if (isRestrictedPage(tab.url)) {
      convertBtn.disabled = true;
      convertBtn.classList.add('disabled');
      statusIndicator.textContent = 'Cannot run on browser pages';
      statusIndicator.className = 'status warning';
    }
  } catch (error) {
    console.error('Error checking current tab:', error);
  }
} 