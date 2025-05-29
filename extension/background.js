// LLMFeeder Background Script
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'convert_to_markdown') {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      console.error('No active tab found');
      return;
    }
    
    try {
      // Get user settings
      const data = await chrome.storage.sync.get('settings');
      const settings = data.settings || {
        contentScope: 'mainContent',
        preserveTables: true,
        includeImages: true
      };
      
      // Send conversion request to content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'convertToMarkdown',
        settings: settings
      });
      
      if (!response.success) {
        console.error('Conversion failed:', response.error);
        // Show an error notification
        showNotification('Conversion Failed', response.error);
        return;
      }
      
      // Copy to clipboard (this might not work from background script due to security restrictions)
      // As a fallback, we'll pass the markdown to a temporary offscreen document or to the popup
      await copyToClipboard(response.markdown);
      
      // Show success notification
      showNotification('Conversion Successful', 'Content copied to clipboard');
      
    } catch (error) {
      console.error('Error in background script:', error);
      showNotification('Error', error.message || 'Failed to convert page');
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
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const tab = tabs[0];
    
    // Inject a content script to show a visual notification on the page
    chrome.scripting.executeScript({
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
 * Copy text to clipboard
 * Note: This might not work from a background script due to security restrictions
 * @param {string} text - Text to copy
 */
async function copyToClipboard(text) {
  try {
    // First approach: Try to use the clipboard API directly (might not work in background)
    await navigator.clipboard.writeText(text);
    console.log('Content copied to clipboard using Clipboard API');
  } catch (error) {
    console.error('Could not use Clipboard API directly:', error);
    
    // Second approach: Create a temporary offscreen document (requires "offscreen" permission)
    // or inject a content script to handle the copy operation
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: textToClipboard,
        args: [text]
      }).catch(err => console.error('Could not inject clipboard script:', err));
    });
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