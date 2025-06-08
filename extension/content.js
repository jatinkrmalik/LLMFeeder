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
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 500);
    }, 3000);
  }
})(); 