// LLMFeeder Content Script
// Created by @jatinkrmalik (https://github.com/jatinkrmalik)
(function() {
  'use strict';

  // ==========================================================================
  // CONSTANTS
  // ==========================================================================

  const ERROR_MESSAGES = {
    NO_CONTENT: 'No content could be extracted from this page.',
    TIMEOUT: 'Conversion timed out. The page might be too large.',
    NO_SELECTION: 'No text is selected. Please select text or use a different content scope.',
    PERMISSION_DENIED: 'Permission denied. Please check extension permissions.',
    GENERAL: 'An error occurred during conversion.'
  };

  const CONVERSION_TIMEOUT = 15000; // 15 seconds (increased for iframe handling)
  const IFRAME_EXTRACTION_TIMEOUT = 1000; // 1 second per iframe
  const MIN_CONTENT_LENGTH = 50; // Minimum meaningful content length
  const MAX_IFRAME_BATCH_SIZE = 5; // Process up to 5 iframes in parallel
  const MAX_DEBUG_LOG_ENTRIES = 500; // Keep memory usage in check

  // Message action constants for security validation
  const MESSAGE_ACTIONS = {
    EXTRACT_CONTENT: 'llmfeeder_extract_content',
    EXTRACT_RESPONSE: 'llmfeeder_extract_content_response'
  };

  // ==========================================================================
  // DEBUG LOGGING SYSTEM
  // ==========================================================================

  const DebugLog = {
    logs: [],
    enabled: false,

    init(settings) {
      this.enabled = settings?.debugMode || false;
      if (this.enabled) {
        this.clear();
        this.log('Debug mode enabled', { url: window.location.href, timestamp: new Date().toISOString() });
      }
    },

    log(message, data) {
      if (this.enabled) {
        const entry = {
          time: new Date().toISOString(),
          message,
          ...(data !== undefined && { data })
        };
        this.logs.push(entry);
        // Keep only last MAX_DEBUG_LOG_ENTRIES entries to prevent memory issues
        if (this.logs.length > MAX_DEBUG_LOG_ENTRIES) {
          this.logs.shift();
        }
      }
    },

    error(message, error) {
      if (this.enabled) {
        this.log(message, {
          error: error?.message || String(error),
          stack: error?.stack
        });
      }
    },

    getLogs() {
      return this.logs.map(entry => {
        let str = `[${entry.time}] ${entry.message}`;
        if (entry.data !== undefined) {
          str += '\n  ' + JSON.stringify(entry.data, null, 2);
        }
        return str;
      }).join('\n');
    },

    clear() {
      this.logs = [];
    }
  };

  // ==========================================================================
  // BROWSER RUNTIME WRAPPER
  // ==========================================================================

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

  // ==========================================================================
  // CROSS-ORIGIN IFRAME MESSAGE LISTENER
  // ==========================================================================

  // Listen for messages from parent window for iframe content extraction
  window.addEventListener('message', (event) => {
    if (event.data && event.data.action === MESSAGE_ACTIONS.EXTRACT_CONTENT) {
      try {
        const content = document.body.cloneNode(true);
        const elementsToRemove = content.querySelectorAll('script, style, noscript, iframe');
        for (let i = elementsToRemove.length - 1; i >= 0; i--) {
          if (elementsToRemove[i].parentNode) {
            elementsToRemove[i].parentNode.removeChild(elementsToRemove[i]);
          }
        }
        const contentText = content.textContent || '';
        if (contentText.trim().length > MIN_CONTENT_LENGTH) {
          event.source.postMessage({
            action: MESSAGE_ACTIONS.EXTRACT_RESPONSE,
            messageId: event.data.messageId,
            content: content.innerHTML
          }, event.origin);
        } else {
          event.source.postMessage({
            action: MESSAGE_ACTIONS.EXTRACT_RESPONSE,
            messageId: event.data.messageId,
            content: null
          }, event.origin);
        }
      } catch (e) {
        event.source.postMessage({
          action: MESSAGE_ACTIONS.EXTRACT_RESPONSE,
          messageId: event.data.messageId,
          content: null
        }, event.origin);
      }
    }
  });

  // ==========================================================================
  // MESSAGE HANDLERS
  // ==========================================================================

  browserRuntime.onMessage.addListener((request, sender, sendResponse) => {
    // Ping handler
    if (request.action === 'ping') {
      sendResponse({ success: true });
      return true;
    }

    // Get debug logs handler
    if (request.action === 'getDebugLogs') {
      sendResponse({ success: true, logs: DebugLog.getLogs() });
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

    // Main conversion handler - async
    if (request.action === 'convertToMarkdown') {
      const timeoutId = setTimeout(() => {
        sendResponse({
          success: false,
          error: ERROR_MESSAGES.TIMEOUT
        });
      }, CONVERSION_TIMEOUT);

      (async () => {
        try {
          const settings = request.settings || request.options || {};
          const markdown = await convertToMarkdown(settings);
          clearTimeout(timeoutId);
          sendResponse({ success: true, markdown });
        } catch (error) {
          clearTimeout(timeoutId);
          console.error('Conversion error:', error);
          DebugLog.error('Conversion error', error);

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
      })();

      return true;
    }

    // Show notification handler
    if (request.action === 'showNotification') {
      showNotification(request.title, request.message);
      sendResponse({ success: true });
      return true;
    }

    // Download markdown handler
    if (request.action === 'downloadMarkdown') {
      try {
        downloadMarkdownFile(request.markdown, request.title);
        sendResponse({ success: true });
      } catch (error) {
        console.error('Download error:', error);
        sendResponse({ success: false, error: error.message });
      }
      return true;
    }
  });

  // ==========================================================================
  // UTILITY FUNCTIONS
  // ==========================================================================

  function downloadMarkdownFile(markdown, title) {
    const MAX_FILENAME_LENGTH = 100;
    let filename = title
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/[\s./]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    
    if (filename.length > MAX_FILENAME_LENGTH) {
      filename = filename.substring(0, MAX_FILENAME_LENGTH).replace(/_+$/g, '');
    }
    if (!filename) filename = 'llmfeeder';
    
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.md`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
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
        if (success) resolve();
        else reject(new Error('execCommand returned false'));
      } catch (err) {
        reject(err);
      } finally {
        document.body.removeChild(textarea);
      }
    });
  }

  // ==========================================================================
  // MAIN CONVERSION FUNCTION
  // ==========================================================================

  async function convertToMarkdown(settings) {
    DebugLog.init(settings);
    DebugLog.log('Conversion started', {
      contentScope: settings.contentScope,
      preserveTables: settings.preserveTables,
      includeImages: settings.includeImages,
      includeTitle: settings.includeTitle
    });

    const docClone = document.cloneNode(true);
    let content;
    let articleData = null;
    
    switch (settings.contentScope) {
      case 'fullPage':
        content = extractFullPageContent(docClone);
        break;
      case 'selection':
        content = extractSelectedContent();
        break;
      case 'mainContent':
      default:
        const result = extractMainContent(docClone);
        content = result.content;
        articleData = result.articleData;
        break;
    }

    if (!content) {
      DebugLog.log('Content extraction failed');
      throw new Error('No content could be extracted');
    }

    DebugLog.log('Content extracted', { innerHTMLLength: content.innerHTML?.length || 0 });

    const contentSize = content.innerHTML.length;
    if (contentSize > 1000000) {
      console.warn('Large content detected:', contentSize, 'bytes');
      DebugLog.log('Large content detected', { size: contentSize });
    }

    // Extract iframes BEFORE running cleanContent (which removes them)
    // For mainContent scope, we need to extract from original document since Readability may remove iframes
    let iframeWarnings = [];
    if (settings.contentScope === 'mainContent') {
      iframeWarnings = await extractAndReplaceIframesFromOriginal(content, settings.preserveIframeLinks !== false);
    }
    
    const cleanWarnings = await cleanContent(content, settings);
    iframeWarnings = iframeWarnings.concat(cleanWarnings);

    DebugLog.log('Iframe warnings', { count: iframeWarnings.length, types: iframeWarnings.map(w => w.type) });

    const turndownService = configureTurndownService(settings);

    try {
      let markdown = turndownService.turndown(content);

      if (!markdown || markdown.trim() === '') {
        throw new Error('Conversion resulted in empty markdown');
      }

      DebugLog.log('Conversion successful', {
        markdownLength: markdown.length,
        hasTables: markdown.includes('|---')
      });

      if (settings.includeTitle) {
        const pageTitle = document.title.trim();
        if (pageTitle.length > 0) {
          markdown = `# ${pageTitle}\n\n${markdown}`;
        }
      }

      const iframeWarning = iframeWarnings.find(w => w.type === 'crossOriginIframe');
      if (iframeWarning) {
        const warningText = `\n\n---\n> **Note:** This page contains ${iframeWarning.count} cross-origin iframe(s) that could not be accessed due to browser security policies. Some content may be missing. Links to these iframes have been preserved where possible.\n`;
        markdown += warningText;
        DebugLog.log('Added iframe warning', { count: iframeWarning.count });
      }

      return postProcessMarkdown(markdown, settings, articleData);
    } catch (error) {
      DebugLog.error('Conversion failed', error);
      console.error('Turndown conversion error:', error);

      if (contentSize > 100000) {
        const simplifiedContent = document.createElement('div');
        simplifiedContent.innerHTML = content.innerHTML.substring(0, 100000);
        return turndownService.turndown(simplifiedContent) +
               '\n\n---\n*Note: Content was truncated due to size limitations.*';
      }

      throw error;
    }
  }

  // ==========================================================================
  // CONTENT EXTRACTION FUNCTIONS
  // ==========================================================================

  function extractFullPageContent(doc) {
    const scripts = doc.getElementsByTagName('script');
    const styles = doc.getElementsByTagName('style');
    for (let i = scripts.length - 1; i >= 0; i--) {
      scripts[i].parentNode.removeChild(scripts[i]);
    }
    for (let i = styles.length - 1; i >= 0; i--) {
      styles[i].parentNode.removeChild(styles[i]);
    }
    return doc.body;
  }

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

  function extractMainContent(doc) {
    try {
      const documentClone = doc.implementation.createHTMLDocument('Article');
      documentClone.documentElement.innerHTML = doc.documentElement.innerHTML;
      const reader = new Readability(documentClone);
      const article = reader.parse();
      
      if (!article || !article.content) {
        throw new Error('Could not extract main content');
      }
      
      const container = document.createElement('div');
      container.innerHTML = article.content;
      
      return {
        content: container,
        articleData: {
          title: article.title || document.title,
          author: article.byline || extractAuthorFromMeta(),
          siteName: article.siteName || extractSiteNameFromMeta(),
          publishedTime: article.publishedTime || extractPublishedDateFromMeta(),
          excerpt: article.excerpt || ''
        }
      };
    } catch (error) {
      console.error('Readability error:', error);
      DebugLog.error('Readability error', error);
      return {
        content: fallbackContentExtraction(doc),
        articleData: null
      };
    }
  }

  function fallbackContentExtraction(doc) {
    const container = document.createElement('div');
    const mainContent = doc.querySelector('main') || 
                        doc.querySelector('article') || 
                        doc.querySelector('.content') || 
                        doc.querySelector('#content') ||
                        doc.body;
    container.appendChild(mainContent.cloneNode(true));
    return container;
  }

  function extractAuthorFromMeta() {
    const authorSelectors = [
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[name="dcterms.creator"]',
      'meta[name="DC.creator"]',
      'meta[property="og:author"]'
    ];
    for (const selector of authorSelectors) {
      const metaTag = document.querySelector(selector);
      if (metaTag && metaTag.content) {
        return metaTag.content.trim();
      }
    }
    return '';
  }

  function extractSiteNameFromMeta() {
    const siteNameSelectors = [
      'meta[property="og:site_name"]',
      'meta[name="application-name"]',
      'meta[name="apple-mobile-web-app-title"]'
    ];
    for (const selector of siteNameSelectors) {
      const metaTag = document.querySelector(selector);
      if (metaTag && metaTag.content) {
        return metaTag.content.trim();
      }
    }
    try {
      return new URL(window.location.href).hostname;
    } catch {
      return '';
    }
  }

  function extractPublishedDateFromMeta() {
    const dateSelectors = [
      'meta[property="article:published_time"]',
      'meta[name="dcterms.created"]',
      'meta[name="DC.date.created"]',
      'meta[name="date"]',
      'meta[property="og:published_time"]',
      'time[datetime]',
      'time[pubdate]'
    ];
    for (const selector of dateSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const dateValue = element.getAttribute('content') || 
                         element.getAttribute('datetime') || 
                         element.textContent;
        if (dateValue) {
          try {
            const date = new Date(dateValue.trim());
            if (!isNaN(date.getTime())) {
              return date.toISOString().split('T')[0];
            }
          } catch {
            return dateValue.trim();
          }
        }
      }
    }
    return '';
  }

  // ==========================================================================
  // IFRAME CONTENT EXTRACTION
  // ==========================================================================

  function isSameOriginIframe(iframe) {
    try {
      if (!iframe.contentWindow) {
        return false;
      }
      const iframeDoc = iframe.contentWindow.document;
      return !!iframeDoc;
    } catch (e) {
      return false;
    }
  }

  function extractSingleIframe(iframe, iframeSrc) {
    return new Promise((resolve) => {
      const messageId = `llmfeeder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      let timeoutId = null;
      let messageHandler = null;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (messageHandler) window.removeEventListener('message', messageHandler);
      };

      messageHandler = (event) => {
        if (event.data &&
            event.data.action === MESSAGE_ACTIONS.EXTRACT_RESPONSE &&
            event.data.messageId === messageId) {
          cleanup();
          resolve({
            success: true,
            content: event.data.content,
            src: iframeSrc
          });
        }
      };

      window.addEventListener('message', messageHandler);

      timeoutId = setTimeout(() => {
        cleanup();
        resolve({ success: false, content: null, src: iframeSrc });
      }, IFRAME_EXTRACTION_TIMEOUT);

      try {
        iframe.contentWindow.postMessage({
          action: MESSAGE_ACTIONS.EXTRACT_CONTENT,
          messageId: messageId
        }, '*');
      } catch (e) {
        cleanup();
        resolve({ success: false, content: null, src: iframeSrc });
      }
    });
  }

  async function extractIframesInBatches(iframes) {
    const results = [];
    for (let i = 0; i < iframes.length; i += MAX_IFRAME_BATCH_SIZE) {
      const batch = iframes.slice(i, i + MAX_IFRAME_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(iframe => extractSingleIframe(iframe, iframe.src))
      );
      results.push(...batchResults);
    }
    return results;
  }

  /**
   * Extract iframe content from the ORIGINAL document and append to content
   * This is needed because Readability may remove iframes from the content
   */
  async function extractAndReplaceIframesFromOriginal(clonedContent, preserveIframeLinks) {
    const originalIframes = Array.from(document.querySelectorAll('iframe'));
    const extractedContents = [];
    const crossOriginIframes = [];
    const inaccessibleIframes = [];

    DebugLog.log('Starting iframe extraction from original document', {
      originalIframes: originalIframes.length
    });

    for (let i = 0; i < originalIframes.length; i++) {
      const iframe = originalIframes[i];
      const iframeSrc = iframe.src || iframe.srcdoc || 'about:blank';

      // Skip hidden/empty iframes
      if (!iframe.offsetParent && !iframe.src && !iframe.srcdoc) {
        continue;
      }

      if (isSameOriginIframe(iframe)) {
        try {
          const iframeDoc = iframe.contentWindow.document;
          const iframeBody = iframeDoc.body;
          const clonedContent = iframeBody.cloneNode(true);

          // Clean scripts, styles
          const scripts = clonedContent.querySelectorAll('script, style, noscript');
          for (let j = scripts.length - 1; j >= 0; j--) {
            scripts[j].parentNode.removeChild(scripts[j]);
          }

          const iframeText = clonedContent.textContent || '';
          if (iframeText.trim().length > MIN_CONTENT_LENGTH) {
            const wrapper = document.createElement('div');
            wrapper.className = 'llmfeeder-iframe-content';
            wrapper.setAttribute('data-iframe-src', iframeSrc);
            wrapper.setAttribute('data-iframe-index', i);
            wrapper.innerHTML = clonedContent.innerHTML;
            extractedContents.push(wrapper);
            DebugLog.log('Extracted same-origin iframe', {
              src: iframeSrc.substring(0, 50),
              contentLength: iframeText.length
            });
          } else {
            DebugLog.log('Iframe skipped (not enough content)', {
              src: iframeSrc.substring(0, 50),
              contentLength: iframeText.length
            });
          }
        } catch (e) {
          DebugLog.error('Same-origin iframe extraction failed', e);
          if (iframe.src) {
            inaccessibleIframes.push({ iframe, index: i, src: iframeSrc });
          }
        }
      } else if (iframe.src && iframe.src !== 'about:blank' && iframe.src !== 'javascript:void(0)') {
        inaccessibleIframes.push({ iframe, index: i, src: iframeSrc });
      }
    }

    // Try cross-origin via messaging
    if (inaccessibleIframes.length > 0) {
      DebugLog.log('Attempting cross-origin iframe extraction', {
        count: inaccessibleIframes.length
      });
      const iframesToExtract = inaccessibleIframes.map(item => item.iframe);
      const results = await extractIframesInBatches(iframesToExtract);

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const originalItem = inaccessibleIframes[j];

        if (result.success && result.content) {
          const wrapper = document.createElement('div');
          wrapper.className = 'llmfeeder-iframe-content';
          wrapper.setAttribute('data-iframe-src', result.src);
          wrapper.setAttribute('data-iframe-index', originalItem.index);
          wrapper.innerHTML = result.content;
          extractedContents.push(wrapper);
          DebugLog.log('Extracted cross-origin iframe via messaging', {
            src: result.src.substring(0, 50)
          });
        } else {
          crossOriginIframes.push({
            src: result.src,
            title: originalItem.iframe?.title || originalItem.iframe?.getAttribute('aria-label') || 'Embedded content'
          });
        }
      }
    }

    DebugLog.log('Iframe extraction complete', {
      extracted: extractedContents.length,
      crossOrigin: crossOriginIframes.length
    });

    // CRITICAL FIX: For mainContent scope, Readability has already removed iframes
    // So we APPEND the extracted iframe content directly to the cloned content
    // instead of trying to replace non-existent iframes
    if (extractedContents.length > 0) {
      DebugLog.log('Appending extracted iframe content to cloned content', {
        count: extractedContents.length
      });

      const iframeSection = document.createElement('div');
      iframeSection.className = 'llmfeeder-iframes';

      extractedContents.forEach((wrapper, index) => {
        const section = document.createElement('div');
        section.className = 'llmfeeder-iframe-section';
        section.innerHTML = `<hr>\n<h3>Embedded Content ${index + 1}</h3>\n` + wrapper.innerHTML;
        iframeSection.appendChild(section);
      });

      clonedContent.appendChild(iframeSection);
      DebugLog.log('Appended iframe content to cloned content');
    }

    const warnings = [];
    if (crossOriginIframes.length > 0) {
      warnings.push({
        type: 'crossOriginIframe',
        count: crossOriginIframes.length,
        details: crossOriginIframes.slice(0, 3)
      });
    }

    return warnings;
  }

  /**
   * Extract and replace iframes for fullPage/selection scope
   * (For these scopes, iframes are still present in the cloned content)
   */
  async function extractAndReplaceIframesFromCloned(content, preserveIframeLinks) {
    const originalIframes = Array.from(document.querySelectorAll('iframe'));
    const extractedContents = [];
    const crossOriginIframes = [];
    const inaccessibleIframes = [];

    DebugLog.log('Starting iframe extraction from cloned content', { 
      originalIframes: originalIframes.length 
    });

    for (let i = 0; i < originalIframes.length; i++) {
      const iframe = originalIframes[i];
      const iframeSrc = iframe.src || iframe.srcdoc || 'about:blank';

      if (!iframe.offsetParent && !iframe.src && !iframe.srcdoc) {
        continue;
      }

      if (isSameOriginIframe(iframe)) {
        try {
          const iframeDoc = iframe.contentWindow.document;
          const iframeBody = iframeDoc.body;
          const clonedContent = iframeBody.cloneNode(true);

          const scripts = clonedContent.querySelectorAll('script, style, noscript');
          for (let j = scripts.length - 1; j >= 0; j--) {
            scripts[j].parentNode.removeChild(scripts[j]);
          }

          const iframeText = clonedContent.textContent || '';
          if (iframeText.trim().length > MIN_CONTENT_LENGTH) {
            const wrapper = document.createElement('div');
            wrapper.className = 'llmfeeder-iframe-content';
            wrapper.setAttribute('data-iframe-src', iframeSrc);
            wrapper.setAttribute('data-iframe-index', i);
            wrapper.innerHTML = clonedContent.innerHTML;
            extractedContents.push(wrapper);
            DebugLog.log('Extracted same-origin iframe', { 
              src: iframeSrc.substring(0, 50), 
              contentLength: iframeText.length 
            });
          }
        } catch (e) {
          DebugLog.error('Same-origin iframe extraction failed', e);
          if (iframe.src) {
            inaccessibleIframes.push({ iframe, index: i, src: iframeSrc });
          }
        }
      } else if (iframe.src && iframe.src !== 'about:blank' && iframe.src !== 'javascript:void(0)') {
        inaccessibleIframes.push({ iframe, index: i, src: iframeSrc });
      }
    }

    if (inaccessibleIframes.length > 0) {
      const iframesToExtract = inaccessibleIframes.map(item => item.iframe);
      const results = await extractIframesInBatches(iframesToExtract);

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const originalItem = inaccessibleIframes[j];

        if (result.success && result.content) {
          const wrapper = document.createElement('div');
          wrapper.className = 'llmfeeder-iframe-content';
          wrapper.setAttribute('data-iframe-src', result.src);
          wrapper.setAttribute('data-iframe-index', originalItem.index);
          wrapper.innerHTML = result.content;
          extractedContents.push(wrapper);
        } else {
          crossOriginIframes.push({
            src: result.src,
            title: originalItem.iframe?.title || originalItem.iframe?.getAttribute('aria-label') || 'Embedded content'
          });
        }
      }
    }

    // Replace iframes in cloned content
    const clonedIframes = Array.from(content.querySelectorAll('iframe'));
    for (let i = 0; i < clonedIframes.length; i++) {
      const iframe = clonedIframes[i];
      const iframeSrc = iframe.src || iframe.srcdoc || 'about:blank';

      const extractedContent = extractedContents.find(c =>
        parseInt(c.getAttribute('data-iframe-index')) === i
      );

      if (extractedContent) {
        const replacementDiv = document.createElement('div');
        replacementDiv.className = 'llmfeeder-iframe-replacement';
        replacementDiv.innerHTML = extractedContent.innerHTML;
        iframe.parentNode.replaceChild(replacementDiv, iframe);
      } else if (preserveIframeLinks && iframeSrc && iframeSrc !== 'about:blank') {
        const linkDiv = document.createElement('div');
        linkDiv.className = 'llmfeeder-iframe-link';
        const iframeTitle = iframe.title || iframe.getAttribute('aria-label') || 'Embedded content';
        linkDiv.innerHTML = `<p>[Embedded content: <a href="${iframeSrc}">${iframeTitle}</a>]</p>`;
        iframe.parentNode.replaceChild(linkDiv, iframe);
      } else {
        iframe.parentNode.removeChild(iframe);
      }
    }

    const warnings = [];
    if (crossOriginIframes.length > 0) {
      warnings.push({
        type: 'crossOriginIframe',
        count: crossOriginIframes.length,
        details: crossOriginIframes.slice(0, 3)
      });
    }

    return warnings;
  }

  // ==========================================================================
  // CONTENT CLEANING
  // ==========================================================================

  async function cleanContent(content, settings) {
    // For fullPage and selection scopes, extract iframes from cloned content
    // For mainContent scope, this was already done before Readability
    let iframeWarnings = [];
    if (settings.contentScope !== 'mainContent') {
      iframeWarnings = await extractAndReplaceIframesFromCloned(content, settings.preserveIframeLinks !== false);
    }

    // Remove elements that shouldn't be included
    const elementsToRemove = [
      'script', 'style', 'noscript',
      'nav', 'footer', '.comments', '.ads', '.sidebar'
    ];

    if (!settings.includeImages) {
      elementsToRemove.push('img', 'picture', 'svg');
    }

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

    makeUrlsAbsolute(content);
    return iframeWarnings;
  }

  function makeUrlsAbsolute(content) {
    const links = content.querySelectorAll('a');
    for (let i = 0; i < links.length; i++) {
      if (links[i].href) {
        try {
          links[i].href = new URL(links[i].getAttribute('href'), document.baseURI).href;
        } catch (e) {}
      }
    }

    const images = content.querySelectorAll('img');
    for (let i = 0; i < images.length; i++) {
      if (images[i].src) {
        try {
          images[i].src = new URL(images[i].getAttribute('src'), document.baseURI).href;
        } catch (e) {}
      }
    }
  }

  // ==========================================================================
  // TURNDOWN CONFIGURATION
  // ==========================================================================

  function configureTurndownService(settings) {
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '*'
    });

    if (settings.preserveTables) {
      turndownService.use(turndownPluginTables);
    }

    if (!settings.includeImages) {
      turndownService.addRule('images', {
        filter: 'img',
        replacement: function() {
          return '';
        }
      });
    }

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

  function postProcessMarkdown(markdown, settings, articleData) {
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    markdown = markdown.replace(/([^\n])(\n#{1,6} )/g, '$1\n\n$2');
    markdown = markdown.replace(/(\n[*\-+] [^\n]+)(\n[*\-+] )/g, '$1\n$2');

    if (settings.includeMetadata && settings.metadataFormat) {
      const metadataText = formatMetadata(settings.metadataFormat, articleData);
      if (metadataText) {
        markdown = markdown + '\n\n' + metadataText;
      }
    }

    return markdown;
  }

  function formatMetadata(template, articleData) {
    try {
      const metadata = {
        title: articleData?.title || document.title || 'Untitled',
        url: window.location.href,
        date: articleData?.publishedTime || '',
        author: articleData?.author || '',
        siteName: articleData?.siteName || new URL(window.location.href).hostname,
        excerpt: articleData?.excerpt || ''
      };

      let formatted = template;
      Object.entries(metadata).forEach(([key, value]) => {
        const placeholder = new RegExp(`\\{${key}\\}`, 'g');
        formatted = formatted.replace(placeholder, value);
      });

      return formatted;
    } catch (error) {
      console.error('Error formatting metadata:', error);
      return `---\nSource: [${document.title || 'Untitled'}](${window.location.href})`;
    }
  }

  // This function would normally be provided by the TurndownService-tables plugin
  // Enhanced implementation to properly handle HTML tables including those without <thead>
  function turndownPluginTables() {
    return function(turndownService) {
      turndownService.addRule('table', {
        filter: 'table',
        replacement: function(content, node) {
          return '\n\n' + content + '\n\n';
        }
      });

      turndownService.addRule('tableRow', {
        filter: 'tr',
        replacement: function(content, node) {
          const cells = node.querySelectorAll('th, td');
          let output = '|' + content + '\n';

          // Check if this row contains th elements (header row)
          const hasHeaderCell = Array.from(cells).some(cell => cell.nodeName === 'TH');

          // Add separator row after header row
          if (hasHeaderCell) {
            const separator = '|' + Array.from(cells).map(() => ' --- |').join('') + '\n';
            output += separator;
          }

          return output;
        }
      });

      turndownService.addRule('tableCell', {
        filter: ['th', 'td'],
        replacement: function(content, node) {
          return ' ' + content.trim() + ' |';
        }
      });
    };
  }

  // ==========================================================================
  // NOTIFICATION SYSTEM
  // ==========================================================================

  function showNotification(title, message) {
    const existingNotifications = document.querySelectorAll('.llmfeeder-notification');
    existingNotifications.forEach(notification => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    });

    const notification = document.createElement('div');
    notification.className = 'llmfeeder-notification';

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

    const contentWrapper = document.createElement('div');
    contentWrapper.style.cssText = `
      display: flex;
      align-items: flex-start;
      gap: 12px;
    `;

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
      notification.style.background = 'linear-gradient(135deg, #ea4335 0%, #d93025 100%)';
    } else {
      iconSVG = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M13 16H12V12H11M12 8H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
    }
    iconWrapper.innerHTML = iconSVG;

    const textWrapper = document.createElement('div');
    textWrapper.style.cssText = `
      flex: 1;
      min-width: 0;
    `;

    const titleElement = document.createElement('div');
    titleElement.textContent = title;
    titleElement.style.cssText = `
      font-size: 16px;
      font-weight: 600;
      line-height: 1.3;
      margin: 0 0 4px 0;
      color: #ffffff;
    `;

    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    messageElement.style.cssText = `
      font-size: 14px;
      line-height: 1.4;
      margin: 0;
      color: rgba(255, 255, 255, 0.9);
      word-wrap: break-word;
    `;

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

    closeButton.addEventListener('mouseenter', () => {
      closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
      closeButton.style.color = '#ffffff';
    });
    closeButton.addEventListener('mouseleave', () => {
      closeButton.style.backgroundColor = 'transparent';
      closeButton.style.color = 'rgba(255, 255, 255, 0.7)';
    });

    textWrapper.appendChild(titleElement);
    textWrapper.appendChild(messageElement);
    contentWrapper.appendChild(iconWrapper);
    contentWrapper.appendChild(textWrapper);
    notification.appendChild(contentWrapper);
    notification.appendChild(closeButton);

    document.body.appendChild(notification);

    requestAnimationFrame(() => {
      notification.style.transform = 'translateX(0) scale(1)';
      notification.style.opacity = '1';
    });

    const removeNotification = () => {
      notification.style.transform = 'translateX(100%) scale(0.8)';
      notification.style.opacity = '0';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 400);
    };

    closeButton.addEventListener('click', removeNotification);

    const autoRemoveTimeout = setTimeout(removeNotification, 4000);

    closeButton.addEventListener('click', () => {
      clearTimeout(autoRemoveTimeout);
    });
  }

})();
