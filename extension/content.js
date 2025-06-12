// LLMFeeder Content Script
// Created by @jatinkrmalik (https://github.com/jatinkrmalik)
(function() {
  // Constants for error handling
  const ERROR_MESSAGES = {
    NO_CONTENT: 'No content could be extracted from this page.',
    TIMEOUT: 'Conversion timed out. The page might be too large.',
    NO_SELECTION: 'No text is selected. Please select text or use a different content scope.',
    PERMISSION_DENIED: 'Permission denied. Please check extension permissions.',
    GENERAL: 'An error occurred during conversion.'
  };
  
  const CONVERSION_TIMEOUT = 10000; // 10 seconds
  
  // Create a proper runtime API wrapper for message handling
  const browserRuntime = (function() {
    if (typeof browser !== 'undefined' && browser.runtime) {
      return browser.runtime;
    } else if (typeof chrome !== 'undefined' && chrome.runtime) {
      return chrome.runtime;
    }
    return {
      onMessage: { addListener: function() {} }
    };
  })();
  
  // Listen for messages from popup or background script
  browserRuntime.onMessage.addListener((request, sender, sendResponse) => {
    // Ping handler - used to check if content script is loaded
    if (request.action === 'ping') {
      sendResponse({ success: true });
      return true;
    }
    
    // Copy to clipboard handler
    if (request.action === 'copyToClipboard' && request.text) {
      copyTextToClipboard(request.text)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ 
          success: false, 
          error: 'Failed to copy to clipboard: ' + error.message 
        }));
      return true;
    }
    
    // Convert handler (simplified version)
    if (request.action === 'convert') {
      const options = request.options || {};
      const markdownResult = convertToMarkdown(options);
      sendResponse({ success: true, markdown: markdownResult });
      return true;
    }
    
    // Main conversion handler
    if (request.action === 'convertToMarkdown') {
      // Set up timeout for conversion process
      const timeoutId = setTimeout(() => {
        sendResponse({ 
          success: false, 
          error: ERROR_MESSAGES.TIMEOUT 
        });
      }, CONVERSION_TIMEOUT);
      
      try {
        const settings = request.settings || request.options || {};
        const markdown = convertToMarkdown(settings);
        clearTimeout(timeoutId);
        sendResponse({ success: true, markdown });
      } catch (error) {
        clearTimeout(timeoutId);
        console.error('Conversion error:', error);
        
        // Map error to user-friendly message
        let errorMessage = ERROR_MESSAGES.GENERAL;
        if (error.message.includes('No content')) {
          errorMessage = ERROR_MESSAGES.NO_CONTENT;
        } else if (error.message.includes('No text is selected')) {
          errorMessage = ERROR_MESSAGES.NO_SELECTION;
        } else if (error.message.includes('Permission')) {
          errorMessage = ERROR_MESSAGES.PERMISSION_DENIED;
        }
        
        sendResponse({ 
          success: false, 
          error: errorMessage,
          details: error.message 
        });
      }
      return true; // Indicates we will send a response asynchronously
    }
    
    // Show notification handler
    if (request.action === 'showNotification') {
      showNotification(request.title, request.message);
      sendResponse({ success: true });
      return true;
    }
  });
  
  /**
   * Copy text to clipboard
   * @param {string} text - Text to copy to clipboard
   * @returns {Promise} - Promise resolving when copy completes
   */
  async function copyTextToClipboard(text) {
    // Try using the Clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    
    // Fallback to document.execCommand
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    
    return new Promise((resolve, reject) => {
      try {
        const success = document.execCommand('copy');
        if (success) {
          resolve();
        } else {
          reject(new Error('execCommand returned false'));
        }
      } catch (err) {
        reject(err);
      } finally {
        document.body.removeChild(textarea);
      }
    });
  }
  
  /**
   * Main conversion function
   * @param {Object} settings - User settings for conversion
   * @returns {string} Markdown output
   */
  function convertToMarkdown(settings) {
    // Clone the document to avoid modifying the original
    const docClone = document.cloneNode(true);

    // Get content based on scope setting
    let content;
    switch (settings.contentScope) {
      case 'fullPage':
        content = extractFullPageContent(docClone);
        break;
      case 'selection':
        content = extractSelectedContent();
        break;
      case 'mainContent':
      default:
        content = extractMainContent(docClone);
        break;
    }
    
    if (!content) {
      throw new Error('No content could be extracted');
    }
    
    // Check if content is too large (potential performance issue)
    const contentSize = content.innerHTML.length;
    if (contentSize > 1000000) { // 1MB
      console.warn('Large content detected:', contentSize, 'bytes');
    }
    
    // Clean the content before conversion
    cleanContent(content, settings);
    
    // Convert to Markdown using TurndownService
    const turndownService = configureTurndownService(settings);
    
    try {
      let markdown = turndownService.turndown(content);
      
      // Validate markdown output
      if (!markdown || markdown.trim() === '') {
        throw new Error('Conversion resulted in empty markdown');
      }
      
      // Add page title as H1 if enabled and title is non-empty
      if (settings.includeTitle) {
        const pageTitle = document.title.trim();
        if (pageTitle.length > 0) {
          markdown = `# ${pageTitle}\n\n${markdown}`;
        }
      }
      
      // Post-process the markdown
      return postProcessMarkdown(markdown);
    } catch (error) {
      console.error('Turndown conversion error:', error);
      
      // Attempt a simplified conversion for problematic content
      if (contentSize > 100000) { // 100KB
        // Try converting a smaller portion of the content
        const simplifiedContent = document.createElement('div');
        simplifiedContent.innerHTML = content.innerHTML.substring(0, 100000);
        return turndownService.turndown(simplifiedContent) + 
               '\n\n---\n*Note: Content was truncated due to size limitations.*';
      }
      
      throw error;
    }
  }
  
  /**
   * Extract the full page content
   * @param {Document} doc - Cloned document
   * @returns {HTMLElement} Content element
   */
  function extractFullPageContent(doc) {
    // Remove script and style tags
    const scripts = doc.getElementsByTagName('script');
    const styles = doc.getElementsByTagName('style');
    
    // Remove scripts and styles (iterate backwards to avoid issues with live collections)
    for (let i = scripts.length - 1; i >= 0; i--) {
      scripts[i].parentNode.removeChild(scripts[i]);
    }
    
    for (let i = styles.length - 1; i >= 0; i--) {
      styles[i].parentNode.removeChild(styles[i]);
    }
    
    return doc.body;
  }
  
  /**
   * Extract the selected content
   * @returns {HTMLElement} Content element
   */
  function extractSelectedContent() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.toString().trim() === '') {
      throw new Error('No text is selected');
    }
    
    const container = document.createElement('div');
    const range = selection.getRangeAt(0);
    container.appendChild(range.cloneContents());
    
    return container;
  }
  
  /**
   * Extract the main content using Readability
   * @param {Document} doc - Cloned document
   * @returns {HTMLElement} Content element
   */
  function extractMainContent(doc) {
    try {
      // Use Readability to extract the main content
      const documentClone = doc.implementation.createHTMLDocument('Article');
      documentClone.documentElement.innerHTML = doc.documentElement.innerHTML;
      
      const reader = new Readability(documentClone);
      const article = reader.parse();
      
      if (!article || !article.content) {
        throw new Error('Could not extract main content');
      }
      
      const container = document.createElement('div');
      container.innerHTML = article.content;
      
      
      return container;
    } catch (error) {
      console.error('Readability error:', error);
      // Fallback to a simple extraction
      return fallbackContentExtraction(doc);
    }
  }
  
  /**
   * Fallback content extraction when Readability fails
   * @param {Document} doc - Cloned document
   * @returns {HTMLElement} Content element
   */
  function fallbackContentExtraction(doc) {
    // Try to find the main content area
    const container = document.createElement('div');
    // Look for common content containers
    const mainContent = doc.querySelector('main') || 
                        doc.querySelector('article') || 
                        doc.querySelector('.content') || 
                        doc.querySelector('#content') ||
                        doc.body;
    // Clone the content to avoid modifying the original
    container.appendChild(mainContent.cloneNode(true));
    return container;
  }
  
  /**
   * Clean the HTML content before conversion
   * @param {HTMLElement} content - The content element
   * @param {Object} settings - User settings
   */
  function cleanContent(content, settings) {
    // Remove elements that shouldn't be included
    const elementsToRemove = [
      'script', 'style', 'noscript', 'iframe',
      'nav', 'footer', '.comments', '.ads', '.sidebar'
    ];
    
    // Add more elements to remove if images are disabled
    if (!settings.includeImages) {
      elementsToRemove.push('img', 'picture', 'svg');
    }
    
    // Remove unwanted elements
    elementsToRemove.forEach(selector => {
      const elements = content.querySelectorAll(selector);
      for (let i = 0; i < elements.length; i++) {
        if (elements[i].parentNode) {
          elements[i].parentNode.removeChild(elements[i]);
        }
      }
    });
    
    // Remove empty paragraphs and divs
    const emptyElements = content.querySelectorAll('p:empty, div:empty');
    for (let i = 0; i < emptyElements.length; i++) {
      emptyElements[i].parentNode.removeChild(emptyElements[i]);
    }
    
    // Convert relative URLs to absolute
    makeUrlsAbsolute(content);
  }
  
  /**
   * Make all URLs in the content absolute
   * @param {HTMLElement} content - The content element
   */
  function makeUrlsAbsolute(content) {
    // Convert links
    const links = content.querySelectorAll('a');
    for (let i = 0; i < links.length; i++) {
      if (links[i].href) {
        links[i].href = new URL(links[i].getAttribute('href'), document.baseURI).href;
      }
    }
    
    // Convert images
    const images = content.querySelectorAll('img');
    for (let i = 0; i < images.length; i++) {
      if (images[i].src) {
        images[i].src = new URL(images[i].getAttribute('src'), document.baseURI).href;
      }
    }
  }
  
  /**
   * Configure the TurndownService based on user settings
   * @param {Object} settings - User settings
   * @returns {TurndownService} Configured TurndownService
   */
  function configureTurndownService(settings) {
    const turndownService = new TurndownService({
      headingStyle: 'atx',        // Use # style headings
      hr: '---',                  // Use --- for horizontal rules
      bulletListMarker: '-',      // Use - for bullet lists
      codeBlockStyle: 'fenced',   // Use ``` style code blocks
      emDelimiter: '*'            // Use * for emphasis
    });
    
    // Preserve tables if enabled
    if (settings.preserveTables) {
      turndownService.use(turndownPluginTables);
    }
    
    // Configure image handling
    if (!settings.includeImages) {
      // Override image rule to ignore images
      turndownService.addRule('images', {
        filter: 'img',
        replacement: function() {
          return '';
        }
      });
    }
    
    // Improve code block handling
    turndownService.addRule('fencedCodeBlock', {
      filter: function(node) {
        return (
          node.nodeName === 'PRE' &&
          node.firstChild &&
          node.firstChild.nodeName === 'CODE'
        );
      },
      replacement: function(content, node) {
        const language = node.firstChild.getAttribute('class') || '';
        const languageMatch = language.match(/language-(\S+)/);
        const languageIdentifier = languageMatch ? languageMatch[1] : '';
        
        return (
          '\n\n```' + languageIdentifier + '\n' +
          node.firstChild.textContent.replace(/\n$/, '') +
          '\n```\n\n'
        );
      }
    });
    
    return turndownService;
  }
  
  /**
   * Post-process the markdown output
   * @param {string} markdown - Raw markdown
   * @returns {string} Processed markdown
   */
  function postProcessMarkdown(markdown) {
    // Remove excessive blank lines (more than 2 in a row)
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    
    // Ensure proper spacing around headings
    markdown = markdown.replace(/([^\n])(\n#{1,6} )/g, '$1\n\n$2');
    
    // Fix list item spacing
    markdown = markdown.replace(/(\n[*\-+] [^\n]+)(\n[*\-+] )/g, '$1\n$2');
    
    // Add URL source at the end
    markdown = markdown + '\n\n---\nSource: [' + document.title + '](' + window.location.href + ')';
    
    return markdown;
  }
  
  // This function would normally be provided by the TurndownService-tables plugin
  // Simplified implementation for demonstration
  function turndownPluginTables() {
    return function(turndownService) {
      turndownService.addRule('tableCell', {
        filter: ['th', 'td'],
        replacement: function(content, node) {
          return ' ' + content + ' |';
        }
      });
      
      turndownService.addRule('tableRow', {
        filter: 'tr',
        replacement: function(content, node) {
          let output = '|' + content + '\n';
          
          // Add header row separator
          if (node.parentNode.nodeName === 'THEAD') {
            const cells = node.querySelectorAll('th, td');
            output += '|' + Array.from(cells).map(() => ' --- |').join('') + '\n';
          }
          
          return output;
        }
      });
      
      turndownService.addRule('table', {
        filter: 'table',
        replacement: function(content, node) {
          return '\n\n' + content + '\n\n';
        }
      });
    };
  }

  /**
   * Show notification in the current tab
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   */
  function showNotification(title, message) {
    // Remove any existing notifications first
    const existingNotifications = document.querySelectorAll('.llmfeeder-notification');
    existingNotifications.forEach(notification => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    });

    // Create notification container
    const notification = document.createElement('div');
    notification.className = 'llmfeeder-notification';
    
    // Modern styling with high contrast and accessibility
    notification.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      background: linear-gradient(135deg, #4285f4 0%, #34a853 100%);
      color: #ffffff;
      border: none;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(66, 133, 244, 0.2);
      padding: 20px 24px;
      z-index: 2147483647;
      max-width: 400px;
      min-width: 320px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      transform: translateX(100%) scale(0.8);
      opacity: 0;
      transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    `;

    // Create content wrapper
    const contentWrapper = document.createElement('div');
    contentWrapper.style.cssText = `
      display: flex;
      align-items: flex-start;
      gap: 12px;
    `;

    // Add icon based on title
    const iconWrapper = document.createElement('div');
    iconWrapper.style.cssText = `
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 2px;
    `;

    // Choose icon based on title
    let iconSVG = '';
    if (title.toLowerCase().includes('success')) {
      iconSVG = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
    } else if (title.toLowerCase().includes('error') || title.toLowerCase().includes('failed')) {
      iconSVG = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
      // Use red gradient for errors
      notification.style.background = 'linear-gradient(135deg, #ea4335 0%, #d93025 100%)';
    } else {
      iconSVG = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M13 16H12V12H11M12 8H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
    }
    iconWrapper.innerHTML = iconSVG;

    // Create text content
    const textWrapper = document.createElement('div');
    textWrapper.style.cssText = `
      flex: 1;
      min-width: 0;
    `;

    // Add title
    const titleElement = document.createElement('div');
    titleElement.textContent = title;
    titleElement.style.cssText = `
      font-size: 16px;
      font-weight: 600;
      line-height: 1.3;
      margin: 0 0 4px 0;
      color: #ffffff;
    `;

    // Add message
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    messageElement.style.cssText = `
      font-size: 14px;
      line-height: 1.4;
      margin: 0;
      color: rgba(255, 255, 255, 0.9);
      word-wrap: break-word;
    `;

    // Add close button
    const closeButton = document.createElement('button');
    closeButton.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.7);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    `;
    closeButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    // Close button hover effect
    closeButton.addEventListener('mouseenter', () => {
      closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
      closeButton.style.color = '#ffffff';
    });
    closeButton.addEventListener('mouseleave', () => {
      closeButton.style.backgroundColor = 'transparent';
      closeButton.style.color = 'rgba(255, 255, 255, 0.7)';
    });

    // Assemble the notification
    textWrapper.appendChild(titleElement);
    textWrapper.appendChild(messageElement);
    contentWrapper.appendChild(iconWrapper);
    contentWrapper.appendChild(textWrapper);
    notification.appendChild(contentWrapper);
    notification.appendChild(closeButton);

    // Add to page
    document.body.appendChild(notification);

    // Trigger entrance animation
    requestAnimationFrame(() => {
      notification.style.transform = 'translateX(0) scale(1)';
      notification.style.opacity = '1';
    });

    // Auto-remove function
    const removeNotification = () => {
      notification.style.transform = 'translateX(100%) scale(0.8)';
      notification.style.opacity = '0';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 400);
    };

    // Close button click handler
    closeButton.addEventListener('click', removeNotification);

    // Auto-remove after 4 seconds (increased from 3 for better readability)
    const autoRemoveTimeout = setTimeout(removeNotification, 4000);

    // Clear timeout if manually closed
    closeButton.addEventListener('click', () => {
      clearTimeout(autoRemoveTimeout);
    });
  }
})(); 