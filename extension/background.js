// LLMFeeder Background Script
// Handles keyboard shortcuts and background tasks
import './libs/browser-polyfill.js';
// Ensure content script is injected before sending messages
async function ensureContentScriptLoaded(tabId) {
  try {
    // Try sending a ping message to check if content script is loaded
    await browserAPI.tabs.sendMessage(tabId, { action: "ping" }).catch(() => {
      // If error, inject the content script
      return browserAPI.scripting.executeScript({
        target: { tabId: tabId },
        files: ["libs/browser-polyfill.js", "libs/readability.js", "libs/turndown.js", "content.js"]
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
        includeImages: true
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