// LLMFeeder Multi-Tab Utilities
// Shared utilities for multi-tab processing in popup and background scripts

const MultiTabUtils = (function() {
  const MAX_FILENAME_LENGTH = 100;
  const LARGE_TAB_COUNT_THRESHOLD = 20; // Warn user when processing more than this many tabs
  const CONTENT_SCRIPT_FILES = ['libs/readability.js', 'libs/turndown.js', 'settings.js', 'content.js'];

  // Confirm the content script is listening in a tab, injecting it if not.
  // A rejected ping means there is no receiver (Chrome/Firefox); a null or
  // undefined response means the same on browsers that resolve instead of
  // reject (eg. Orion). Injection needs host access (activeTab covers the
  // active tab) and never works on browser internal pages - those failures
  // surface as a false return.
  async function ensureContentScriptLoaded(browserAPI, tabId) {
    const ping = () =>
      browserAPI.tabs.sendMessage(tabId, { action: 'ping' }).catch(() => null);

    if (await ping()) return true;

    try {
      await browserAPI.scripting.executeScript({
        target: { tabId: tabId },
        files: CONTENT_SCRIPT_FILES
      });
    } catch (error) {
      console.error('Cannot inject content script:', error);
      return false;
    }
    return Boolean(await ping());
  }

  function shouldWarnAboutLargeTabCount(tabCount) {
    return tabCount > LARGE_TAB_COUNT_THRESHOLD;
  }

  function getLargeTabCountWarning(tabCount) {
    return `You are about to process ${tabCount} tabs. This may take some time and use significant memory. Do you want to continue?`;
  }

  // Process multiple tabs with concurrency limit using worker pool pattern
  async function processMultipleTabs(tabs, settings, browserAPI, progressCallback) {
    const total = tabs.length;
    const MAX_CONCURRENT = 4; // Max tabs processing simultaneously
    const results = new Array(total);
    let completed = 0;
    let nextIndex = 0;

    if (progressCallback) {
      progressCallback(`Converting ${total} tabs...`);
    }

    // Worker consumes tabs from the queue until exhausted
    async function worker() {
      // Each worker loops, grabbing the next available tab index.
      // JavaScript is single-threaded, so nextIndex reads/writes are safe.
      while (nextIndex < total) {
        const index = nextIndex++;
        const tab = tabs[index];

        try {
          const loaded = await ensureContentScriptLoaded(browserAPI, tab.id);
          if (!loaded) {
            throw new Error("Cannot access this tab - try reloading it");
          }

          const response = await browserAPI.tabs.sendMessage(tab.id, {
            action: "convertToMarkdown",
            settings: settings
          });

          if (response && response.success) {
            results[index] = {
              success: true,
              tab: tab,
              markdown: response.markdown,
              metadata: response.metadata,
              tokenCount: response.tokenCount || 0
            };
          } else {
            results[index] = {
              success: false,
              tab: tab,
              error: (response && response.error) || "No response from tab - try reloading it"
            };
          }
        } catch (error) {
          const errorMessage = error.message || "Failed to communicate with tab";
          console.error(errorMessage);
          results[index] = {
            success: false,
            tab: tab,
            error: errorMessage,
          };
        }

        completed++;
        if (progressCallback && total > MAX_CONCURRENT) {
          progressCallback(`Converted ${completed} of ${total} tabs...`);
        }
      }
    }

    // Start worker pool
    const workerCount = Math.min(MAX_CONCURRENT, total);
    const workers = Array.from({ length: workerCount }, () => worker());

    // Wait for all workers to finish
    await Promise.all(workers);
    return results;
  }

  // Merge multiple markdown results
  function mergeMarkdownResults(results) {
    const successfulResults = results.filter(r => r.success);

    if (successfulResults.length === 0) {
      throw new Error('No tabs were successfully converted');
    }

    const merged = successfulResults.map(result => result.markdown).join('\n\n---\n\n');
    return merged;
  }

  // Generate unique filename for ZIP entries
  function generateUniqueFilename(title, index, usedFilenames) {
    let baseFilename = sanitizeFilename(title);
    let filename = baseFilename;
    let counter = 1;

    while (usedFilenames.has(filename)) {
      filename = `${baseFilename}_${counter}`;
      counter++;
    }

    usedFilenames.add(filename);
    return `${filename}.md`;
  }

  // Sanitize filename
  function sanitizeFilename(title) {
    return title
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/[\s.]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, MAX_FILENAME_LENGTH)
      .replace(/_+$/g, '') || 'untitled';
  }

  // Get date string for filenames
  function getDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  // Create ZIP archive from results
  async function createZipArchive(results) {
    // Check if JSZip is loaded
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip library not loaded');
    }

    const zip = new JSZip();
    const usedFilenames = new Set();
    let successCount = 0;

    results.forEach((result, index) => {
      if (result.success) {
        const filename = generateUniqueFilename(
          result.tab.title,
          index,
          usedFilenames
        );
        zip.file(filename, result.markdown);
        successCount++;
      }
    });

    if (successCount === 0) {
      throw new Error('No tabs were successfully converted');
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const zipFilename = `llmfeeder-export-${getDateString()}-${successCount}tabs.zip`;

    return { blob, filename: zipFilename, successCount };
  }

  // Get highlighted/selected tabs
  async function getHighlightedTabs(browserAPI) {
    const highlightedTabs = await browserAPI.tabs.query({
      highlighted: true,
      currentWindow: true
    });

    // Some browsers (e.g. Orion) ignore the `highlighted` query filter and
    // return every tab in the window, each with `highlighted: false`.
    // Re-check each tab's own state so those browsers fall back to the
    // active tab instead of treating all open tabs as selected. Compliant
    // browsers are unaffected: every tab they return here is highlighted,
    // and the active tab is always part of the highlighted set.
    const selectedTabs = highlightedTabs.filter(tab => tab.highlighted || tab.active);

    // Filter out browser internal pages
    const validTabs = selectedTabs.filter(tab =>
      tab.url &&
      !tab.url.startsWith('chrome://') &&
      !tab.url.startsWith('edge://') &&
      !tab.url.startsWith('about:') &&
      !tab.url.startsWith('chrome-extension://') &&
      !tab.url.startsWith('moz-extension://')
    );

    return validTabs;
  }

  // Format results summary message
  function getResultsSummary(results) {
    const successCount = results.filter(r => r.success).length;
    const failedResults = results.filter(r => !r.success);
    const failCount = failedResults.length;

    let message = `${successCount} tab${successCount > 1 ? 's' : ''}`;
    if (failCount > 0) {
      message += ` (${failCount} failed)`;
    }

    return { message, successCount, failCount };
  }

  // Public API
  return {
    ensureContentScriptLoaded,
    processMultipleTabs,
    mergeMarkdownResults,
    generateUniqueFilename,
    sanitizeFilename,
    getDateString,
    createZipArchive,
    getHighlightedTabs,
    getResultsSummary,
    shouldWarnAboutLargeTabCount,
    getLargeTabCountWarning,
  };
})();

// For use in browser extension contexts (not modules)
if (typeof window !== 'undefined') {
  window.MultiTabUtils = MultiTabUtils;
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MultiTabUtils;
}
