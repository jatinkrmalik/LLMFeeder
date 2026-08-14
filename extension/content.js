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

  const CONVERSION_TIMEOUT = 15000; // 15 seconds baseline (extended dynamically when scrolling lazy-loaded pages)
  const MIN_CONTENT_LENGTH = 50; // Minimum meaningful content length
  const MAX_DEBUG_LOG_ENTRIES = 500; // Keep memory usage in check
  const SCROLL_LOAD_DELAY = 300; // ms to wait after scroll for content to load
  const MAX_SCROLL_ATTEMPTS = 50; // Maximum scroll iterations per container
  // Wall-clock ceiling for the whole scroll pass, shared across every container
  // we walk. MAX_SCROLL_ATTEMPTS alone cannot bound the pass: a page with N
  // scrollable containers costs N times the per-container budget, which would
  // outlive the conversion timeout and keep yanking the page around long after
  // the user has been shown an error.
  const SCROLL_PASS_BUDGET = 15000;
  const SCROLL_TIMEOUT_HEADROOM = SCROLL_PASS_BUDGET; // ms of extra time we may need when scrolling

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
      // Extend the conversion timeout when the user has opted into the
      // scroll-to-load pass, since that step alone can take up to
      // SCROLL_TIMEOUT_HEADROOM ms before extraction even begins.
      const requestSettings = request.settings || request.options || {};
      const conversionTimeout = requestSettings.triggerLazyLoading === true
        ? CONVERSION_TIMEOUT + SCROLL_TIMEOUT_HEADROOM
        : CONVERSION_TIMEOUT;
      const timeoutId = setTimeout(() => {
        sendResponse({
          success: false,
          error: ERROR_MESSAGES.TIMEOUT
        });
      }, conversionTimeout);

      (async () => {
        try {
          const settings = request.settings || request.options || {};
          const markdown = await convertToMarkdown(settings);
          clearTimeout(timeoutId);
          
          // Calculate token count estimation for response
          let tokenCount = 0;
          try {
            // Rough estimation: ~0.75 tokens per word, ~1 token per 4 chars
            const wordCount = markdown.split(/\s+/).filter(w => w.length > 0).length;
            const charCount = markdown.length;
            tokenCount = Math.ceil(Math.max(wordCount * 0.75, charCount / 4));
          } catch (e) {
            console.error('Token estimation error:', e);
          }
          
          sendResponse({ success: true, markdown, tokenCount });
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

    // Download file from data URL (used for ZIP downloads)
    if (request.action === 'downloadFile') {
      try {
        const a = document.createElement('a');
        a.href = request.dataUrl;
        a.download = request.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        sendResponse({ success: true });
      } catch (error) {
        console.error('Download file error:', error);
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
  // LAZY LOADING DETECTION AND SCROLL EXTRACTION
  // ==========================================================================

  /**
   * Hosts that we know ship lazy-loaded conversational UIs. Exact/subdomain
   * matching keeps the detector focused without treating unrelated domains
   * like `notchatgpt.com` as positive matches.
   */
  const KNOWN_LAZY_HOSTS = [
    'gemini.google.com',
    'aistudio.google.com',
    'chat.openai.com',
    'chatgpt.com',
    'claude.ai',
    'poe.com',
    'perplexity.ai',
    'copilot.microsoft.com'
  ];

  /**
   * Tight, semantically-meaningful selectors. We deliberately avoid loose
   * `[class*="..."]` matches here because they fire on too many ordinary
   * pages (any class containing "chat", "scroll", "conversation", etc.) and
   * trigger a noisy scroll pass + footer warning when nothing is actually
   * lazy-loaded.
   */
  const LAZY_CONTAINER_SELECTORS = [
    '[role="log"]',
    '[role="feed"]',
    '[data-conversation]',
    '[data-virtual]',
    '[data-test-id*="conversation"]'
  ];

  /**
   * Single source of truth for "is this DOM node a scrollable container we
   * could meaningfully scroll through?". Used by both the detector and the
   * scroll-pass collector so the threshold lives in one place.
   */
  function isMeaningfullyScrollable(el) {
    const style = window.getComputedStyle(el);
    const overflowsY = style.overflowY === 'auto' || style.overflowY === 'scroll';
    return overflowsY && el.clientHeight > 0 && el.scrollHeight > el.clientHeight * 2;
  }

  /**
   * Detects if a page likely uses virtual scrolling/lazy loading for content.
   * Cheap and short-circuits on the first positive signal so we don't pay
   * an O(DOM) scan on every conversion.
   */
  function detectLazyLoadingPattern() {
    const host = window.location.hostname || '';
    const matchedHost = KNOWN_LAZY_HOSTS.find(h => host === h || host.endsWith('.' + h)) || null;
    if (matchedHost) {
      DebugLog.log('Lazy loading detection', { matchedHost, isLazyLoaded: true });
      return { isLazyLoaded: true, reason: 'host:' + matchedHost };
    }

    if (document.querySelector(LAZY_CONTAINER_SELECTORS.join(', '))) {
      DebugLog.log('Lazy loading detection', { reason: 'semantic-selector', isLazyLoaded: true });
      return { isLazyLoaded: true, reason: 'semantic' };
    }

    DebugLog.log('Lazy loading detection', { isLazyLoaded: false });
    return { isLazyLoaded: false, reason: null };
  }

  /**
   * Attempts to load all lazy-loaded content by scrolling through the page.
   * Returns information about what was loaded; `scrolled: false` means no
   * suitable container was found and the caller should not warn the user
   * about partial content.
   */
  async function scrollToLoadAllContent(scrollables) {
    if (scrollables.length === 0) {
      DebugLog.log('No scrollable containers found');
      return { scrolled: false, heightDelta: 0, contentChanged: false };
    }

    DebugLog.log('Found scrollable containers', { count: scrollables.length });

    // Save the user's viewport position so we can restore it after the
    // scroll-pass instead of dumping them at the top of the page.
    const savedScrollX = window.scrollX;
    const savedScrollY = window.scrollY;

    // Share one wall-clock budget across every container. Each container gets
    // an even slice of whatever time is left, so a container that finishes
    // early hands its unused time to the ones after it.
    const passDeadline = Date.now() + SCROLL_PASS_BUDGET;

    let totalHeightDelta = 0;
    let contentChanged = false;
    let containersScrolled = 0;
    for (let i = 0; i < scrollables.length; i++) {
      const timeLeft = passDeadline - Date.now();
      if (timeLeft <= SCROLL_LOAD_DELAY) {
        DebugLog.log('Scroll budget exhausted, skipping remaining containers', {
          skipped: scrollables.length - i
        });
        break;
      }

      const containerDeadline = Date.now() + timeLeft / (scrollables.length - i);
      const result = await scrollContainerToLoadContent(scrollables[i], containerDeadline);
      totalHeightDelta += result.heightDelta;
      contentChanged = contentChanged || result.contentChanged;
      containersScrolled++;
    }

    window.scrollTo(savedScrollX, savedScrollY);

    // Virtualised lists re-render from their scroll handler, which fires
    // asynchronously. Without this settle delay we clone the DOM mid-render
    // and capture fewer rows than were on screen before the pass started.
    await sleep(SCROLL_LOAD_DELAY);

    DebugLog.log('Scroll loading complete', { totalHeightDelta, contentChanged, containersScrolled });
    return { scrolled: true, heightDelta: totalHeightDelta, contentChanged };
  }

  /**
   * Find all scrollable containers on the page using the same
   * `isMeaningfullyScrollable` heuristic as the detector.
   *
   * Semantic lazy-load containers (role=log/feed, data-conversation, etc.)
   * take priority. Burning budget on the window / generic main wrappers as
   * well would leave less time for the surface that actually loads content —
   * the multi-scroller timeout #101 fixed. Only fall back to those generic
   * containers when no semantic match is scrollable.
   */
  function findScrollableContainers() {
    const containers = [];
    const seen = new Set();

    document.querySelectorAll(LAZY_CONTAINER_SELECTORS.join(', ')).forEach(el => {
      if (isMeaningfullyScrollable(el) && !seen.has(el)) {
        seen.add(el);
        containers.push({ element: el, isWindow: false });
      }
    });

    if (containers.length > 0) {
      return containers;
    }

    if (document.documentElement.scrollHeight > window.innerHeight * 1.5) {
      containers.push({ element: document.documentElement, isWindow: true });
    }

    document.querySelectorAll('main, article, .main-content, #content').forEach(el => {
      if (isMeaningfullyScrollable(el) && !seen.has(el)) {
        seen.add(el);
        containers.push({ element: el, isWindow: false });
      }
    });

    return containers;
  }

  /**
   * Scroll a container to load lazy-loaded content.
   * Stall detection looks at `scrollHeight` and a bounded text signature
   * because virtualised lists can recycle DOM nodes without growing height.
   */
  async function scrollContainerToLoadContent(containerInfo, deadline) {
    const { element, isWindow } = containerInfo;
    const getScrollHeight = () => isWindow ? document.documentElement.scrollHeight : element.scrollHeight;
    const getClientHeight = () => isWindow ? window.innerHeight : element.clientHeight;
    const getTextSignature = () => {
      const text = ((isWindow ? document.body : element).innerText || '').trim();
      return text.slice(0, 2000) + '|' + text.slice(-2000);
    };
    const getCurrentScroll = () => isWindow ? window.scrollY : element.scrollTop;
    const scrollTo = (pos) => {
      if (isWindow) {
        window.scrollTo(0, pos);
      } else {
        element.scrollTop = pos;
      }
    };

    const originalScroll = getCurrentScroll();
    const startHeight = getScrollHeight();
    const startTextSignature = getTextSignature();
    let previousHeight = startHeight;
    let previousTextSignature = startTextSignature;
    let attempts = 0;
    let stallCount = 0;

    // First, scroll to top to ensure top content is loaded
    scrollTo(0);
    if (Date.now() + SCROLL_LOAD_DELAY <= deadline) {
      await sleep(SCROLL_LOAD_DELAY);
    }

    const clientHeight = getClientHeight();
    const scrollStep = clientHeight * 0.8;
    let currentPos = 0;

    while (attempts < MAX_SCROLL_ATTEMPTS && Date.now() + SCROLL_LOAD_DELAY <= deadline) {
      attempts++;

      currentPos += scrollStep;
      scrollTo(currentPos);
      await sleep(SCROLL_LOAD_DELAY);

      const newHeight = getScrollHeight();
      const newTextSignature = getTextSignature();

      const grewHeight = newHeight > previousHeight;
      const changedText = newTextSignature !== previousTextSignature;

      if (grewHeight || changedText) {
        previousHeight = newHeight;
        previousTextSignature = newTextSignature;
        stallCount = 0;
      } else {
        stallCount++;
      }

      const maxScroll = newHeight - clientHeight;
      if (currentPos >= maxScroll - 10) {
        if (stallCount >= 3) {
          DebugLog.log('Reached bottom of scrollable container', {
            attempts,
            finalHeight: newHeight,
            heightDelta: newHeight - startHeight,
            contentChanged: newTextSignature !== startTextSignature
          });
          break;
        }
        // Nudge past the bottom to trigger any remaining lazy loaders.
        currentPos = maxScroll + 100;
        scrollTo(currentPos);
        if (Date.now() + SCROLL_LOAD_DELAY > deadline) {
          break;
        }
        await sleep(SCROLL_LOAD_DELAY);
      }
    }

    scrollTo(originalScroll);

    return {
      heightDelta: previousHeight - startHeight,
      contentChanged: previousTextSignature !== startTextSignature
    };
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
      includeTitle: settings.includeTitle,
      includeLinks: settings.includeLinks,
      triggerLazyLoading: settings.triggerLazyLoading === true
    });

    // Detect and handle lazy-loaded content before extraction.
    // The detector itself is gated on the user setting so we don't pay for
    // host/selector lookups (or surface a false-positive footer warning) on
    // pages where the user has explicitly opted out. We also skip the
    // scroll-pass when the user is converting a selection: scrolling moves
    // the page out from under them and `window.getSelection()` would be
    // collapsed by the time we read it.
    let lazyLoadInfo = { isLazyLoaded: false, reason: null };
    let scrollResult = { scrolled: false, heightDelta: 0, contentChanged: false };
    const lazyLoadingEnabled = settings.triggerLazyLoading === true &&
                               settings.contentScope !== 'selection';

    if (lazyLoadingEnabled) {
      lazyLoadInfo = detectLazyLoadingPattern();
      if (lazyLoadInfo.isLazyLoaded) {
        // Probe for actual containers before notifying the user. If there's
        // nothing meaningful to scroll we'd rather stay silent than flash a
        // toast that doesn't reflect any real work.
        const probe = findScrollableContainers();
        if (probe.length > 0) {
          DebugLog.log('Attempting to load lazy-loaded content via scrolling', { reason: lazyLoadInfo.reason });
          showNotification('Loading content...', 'Scrolling to load all content before extraction');
          scrollResult = await scrollToLoadAllContent(probe);
          DebugLog.log('Scroll loading result', scrollResult);
        } else {
          DebugLog.log('Lazy load detected but no scrollable container; skipping scroll-pass');
        }
      }
    }

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
      iframeWarnings = extractAndReplaceIframesFromOriginal(content);
    }
    
    const cleanWarnings = cleanContent(content, settings);
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

      // Only warn when we have evidence the scroll-pass changed the rendered
      // content. Emitting this for every positive detector hit is noisier
      // than helpful on pages that use ARIA logs for non-lazy content.
      if (lazyLoadInfo.isLazyLoaded && scrollResult.scrolled &&
          (scrollResult.heightDelta > 0 || scrollResult.contentChanged)) {
        const lazyLoadWarning = `\n\n---\n> **Note:** This page uses dynamic content loading (virtual scrolling). The extension scrolled to load all visible content, but some may still be missing if it wasn't rendered in the DOM. For long conversations or feeds, try scrolling through the entire content manually before converting.\n`;
        markdown += lazyLoadWarning;
        DebugLog.log('Added lazy load warning', { scrollResult, reason: lazyLoadInfo.reason });
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

  // Same-origin frames (including srcdoc) are read through the DOM.
  // Cross-origin frames stay behind the browser's origin checks: we keep a
  // link/warning instead of asking another window to echo its HTML.

  function isHttpOrHttpsUrl(src) {
    if (!src || typeof src !== 'string') {
      return false;
    }
    // Require an explicit http(s) URL so srcdoc HTML cannot be resolved as
    // a relative path against the page.
    if (!/^https?:\/\//i.test(src.trim())) {
      return false;
    }
    try {
      const url = new URL(src);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  function iframeFallbackInfo(iframe, iframeSrc) {
    return {
      src: iframeSrc,
      title: iframe.title || iframe.getAttribute('aria-label') || 'Embedded content'
    };
  }

  function createIframePlaceholder(iframeSrc, iframeTitle) {
    const linkDiv = document.createElement('div');
    linkDiv.className = 'llmfeeder-iframe-link';
    const p = document.createElement('p');
    p.appendChild(document.createTextNode('[Embedded content: '));
    const title = iframeTitle || 'Embedded content';
    if (isHttpOrHttpsUrl(iframeSrc)) {
      const a = document.createElement('a');
      a.href = iframeSrc;
      a.textContent = title;
      p.appendChild(a);
    } else {
      p.appendChild(document.createTextNode(title));
    }
    p.appendChild(document.createTextNode(']'));
    linkDiv.appendChild(p);
    return linkDiv;
  }

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

  function isHiddenEmptyIframe(iframe) {
    return !iframe.offsetParent && !iframe.src && !iframe.srcdoc;
  }

  function isRemoteIframeSrc(iframe) {
    return !!(iframe.src && iframe.src !== 'about:blank' && iframe.src !== 'javascript:void(0)');
  }

  function tryExtractSameOriginIframe(iframe, iframeSrc, index) {
    const iframeDoc = iframe.contentWindow.document;
    const iframeBody = iframeDoc.body;
    const clonedIframeContent = iframeBody.cloneNode(true);

    const scripts = clonedIframeContent.querySelectorAll('script, style, noscript');
    for (let j = scripts.length - 1; j >= 0; j--) {
      scripts[j].parentNode.removeChild(scripts[j]);
    }

    const iframeText = clonedIframeContent.textContent || '';
    if (iframeText.trim().length <= MIN_CONTENT_LENGTH) {
      return { skipped: true, contentLength: iframeText.length };
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'llmfeeder-iframe-content';
    wrapper.setAttribute('data-iframe-src', iframeSrc);
    wrapper.setAttribute('data-iframe-index', String(index));
    while (clonedIframeContent.firstChild) {
      wrapper.appendChild(clonedIframeContent.firstChild);
    }
    return { wrapper, contentLength: iframeText.length };
  }

  function collectIframeExtraction(iframes, logLabel) {
    const extractedContents = [];
    const crossOriginIframes = [];

    DebugLog.log(logLabel, {
      originalIframes: iframes.length
    });

    for (let i = 0; i < iframes.length; i++) {
      const iframe = iframes[i];
      const iframeSrc = iframe.src || iframe.srcdoc || 'about:blank';

      if (isHiddenEmptyIframe(iframe)) {
        continue;
      }

      if (isSameOriginIframe(iframe)) {
        try {
          const result = tryExtractSameOriginIframe(iframe, iframeSrc, i);
          if (result.wrapper) {
            extractedContents.push(result.wrapper);
            DebugLog.log('Extracted same-origin iframe', {
              src: iframeSrc.substring(0, 50),
              contentLength: result.contentLength
            });
          } else {
            DebugLog.log('Iframe skipped (not enough content)', {
              src: iframeSrc.substring(0, 50),
              contentLength: result.contentLength
            });
          }
        } catch (e) {
          DebugLog.error('Same-origin iframe extraction failed', e);
          if (iframe.src) {
            crossOriginIframes.push(iframeFallbackInfo(iframe, iframeSrc));
          }
        }
      } else if (isRemoteIframeSrc(iframe)) {
        crossOriginIframes.push(iframeFallbackInfo(iframe, iframeSrc));
      }
    }

    DebugLog.log('Iframe extraction complete', {
      extracted: extractedContents.length,
      crossOrigin: crossOriginIframes.length
    });

    return { extractedContents, crossOriginIframes };
  }

  function crossOriginIframeWarnings(crossOriginIframes) {
    if (crossOriginIframes.length === 0) {
      return [];
    }
    return [{
      type: 'crossOriginIframe',
      count: crossOriginIframes.length,
      details: crossOriginIframes.slice(0, 3)
    }];
  }

  /**
   * Extract iframe content from the ORIGINAL document and append to content
   * This is needed because Readability may remove iframes from the content
   */
  function extractAndReplaceIframesFromOriginal(clonedContent) {
    const originalIframes = Array.from(document.querySelectorAll('iframe'));
    const { extractedContents, crossOriginIframes } = collectIframeExtraction(
      originalIframes,
      'Starting iframe extraction from original document'
    );

    // For mainContent scope, Readability has already removed iframes, so
    // append extracted iframe content directly to the cloned article.
    if (extractedContents.length > 0) {
      DebugLog.log('Appending extracted iframe content to cloned content', {
        count: extractedContents.length
      });

      const iframeSection = document.createElement('div');
      iframeSection.className = 'llmfeeder-iframes';

      extractedContents.forEach((wrapper, index) => {
        const section = document.createElement('div');
        section.className = 'llmfeeder-iframe-section';
        section.appendChild(document.createElement('hr'));
        const heading = document.createElement('h3');
        heading.textContent = `Embedded Content ${index + 1}`;
        section.appendChild(heading);
        section.appendChild(wrapper);
        iframeSection.appendChild(section);
      });

      clonedContent.appendChild(iframeSection);
      DebugLog.log('Appended iframe content to cloned content');
    }

    return crossOriginIframeWarnings(crossOriginIframes);
  }

  /**
   * Extract and replace iframes for fullPage/selection scope
   * (For these scopes, iframes are still present in the cloned content)
   */
  function extractAndReplaceIframesFromCloned(content, preserveIframeLinks) {
    const originalIframes = Array.from(document.querySelectorAll('iframe'));
    const { extractedContents, crossOriginIframes } = collectIframeExtraction(
      originalIframes,
      'Starting iframe extraction from cloned content'
    );

    const clonedIframes = Array.from(content.querySelectorAll('iframe'));
    for (let i = 0; i < clonedIframes.length; i++) {
      const iframe = clonedIframes[i];
      const iframeSrc = iframe.src || iframe.srcdoc || 'about:blank';

      const extractedContent = extractedContents.find(c =>
        parseInt(c.getAttribute('data-iframe-index'), 10) === i
      );

      if (extractedContent) {
        const replacementDiv = document.createElement('div');
        replacementDiv.className = 'llmfeeder-iframe-replacement';
        while (extractedContent.firstChild) {
          replacementDiv.appendChild(extractedContent.firstChild);
        }
        iframe.parentNode.replaceChild(replacementDiv, iframe);
      } else if (preserveIframeLinks && iframeSrc && iframeSrc !== 'about:blank') {
        const iframeTitle = iframe.title || iframe.getAttribute('aria-label') || 'Embedded content';
        iframe.parentNode.replaceChild(createIframePlaceholder(iframeSrc, iframeTitle), iframe);
      } else {
        iframe.parentNode.removeChild(iframe);
      }
    }

    return crossOriginIframeWarnings(crossOriginIframes);
  }

  // ==========================================================================
  // CONTENT CLEANING
  // ==========================================================================

  function cleanContent(content, settings) {
    // For fullPage and selection scopes, extract iframes from cloned content
    // For mainContent scope, this was already done before Readability
    let iframeWarnings = [];
    if (settings.contentScope !== 'mainContent') {
      iframeWarnings = extractAndReplaceIframesFromCloned(content, settings.preserveIframeLinks !== false);
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
      // Prevent thead and tbody from adding extra newlines
      turndownService.addRule('thead', {
        filter: 'thead',
        replacement: function(content) {
          return content;
        }
      });

      turndownService.addRule('tbody', {
        filter: 'tbody',
        replacement: function(content) {
          return content;
        }
      });

      // Add custom table rules before default rules can process them
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
    }

    if (!settings.includeImages) {
      turndownService.addRule('images', {
        filter: 'img',
        replacement: function() {
          return '';
        }
      });
    }

    if (!settings.includeLinks) {
      turndownService.addRule('stripLinks', {
        filter: function(node) {
          return node.nodeName === 'A' && node.href;
        },
        replacement: function(content, node) {
          return content;
        }
      });
    }

    turndownService.addRule('fencedCodeBlock', {
      filter: function(node) {
        return node.nodeName === 'PRE';
      },
      replacement: function(content, node) {
        const codeElement = node.querySelector('code');
        const languageClasses = [
          codeElement?.getAttribute('class') || '',
          node.getAttribute('class') || ''
        ].join(' ');
        const languageMatch = languageClasses.match(/(?:language|lang)-(\S+)/);
        const languageIdentifier = languageMatch ? languageMatch[1] : '';
        const codeContainer = (codeElement || node).cloneNode(true);

        // Syntax highlighters often emit <pre><span>...<br>...</span></pre>.
        // textContent preserves the highlighted text, but <br> needs explicit handling.
        const lineBreaks = codeContainer.querySelectorAll('br');
        lineBreaks.forEach(lineBreak => lineBreak.replaceWith('\n'));

        const code = codeContainer.textContent.replace(/\n$/, '');
        const fenceMatches = code.match(/^`{3,}/gm) || [];
        const fenceSize = fenceMatches.reduce(
          (size, fence) => Math.max(size, fence.length + 1),
          3
        );
        const fence = '`'.repeat(fenceSize);

        return (
          '\n\n' + fence + languageIdentifier + '\n' +
          code +
          '\n' + fence + '\n\n'
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
    messageElement.style.cssText = `
      font-size: 14px;
      line-height: 1.5;
      margin: 0;
      color: rgba(255, 255, 255, 0.9);
      word-wrap: break-word;
      white-space: pre-line;
    `;
    
    // Handle multiline messages
    const lines = message.split('\n').filter(line => line.trim() !== '');
    if (lines.length > 1) {
      lines.forEach((line, index) => {
        const lineDiv = document.createElement('div');
        lineDiv.textContent = line;
        if (index > 0) {
          lineDiv.style.marginTop = '4px';
        }
        messageElement.appendChild(lineDiv);
      });
    } else {
      messageElement.textContent = message;
    }

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
