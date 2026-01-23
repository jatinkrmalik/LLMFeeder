// LLMFeeder Multi-Tab Utilities
// Shared utilities for multi-tab processing in popup and background scripts

const MultiTabUtils = (function() {
  const MAX_FILENAME_LENGTH = 100;

  // Process multiple tabs sequentially
  async function processMultipleTabs(tabs, settings, browserAPI, progressCallback) {
    const results = [];
    const total = tabs.length;

    if (progressCallback) {
      progressCallback(`Converting ${total} tabs...`);
    }

    for (let i = 0; i < total; i++) {
      const tab = tabs[i];

      try {
        // Send conversion message to content script
        const response = await browserAPI.tabs.sendMessage(tab.id, {
          action: "convertToMarkdown",
          settings: settings
        });

        if (response.success) {
          results.push({
            success: true,
            tab: tab,
            markdown: response.markdown,
            metadata: response.metadata
          });
        } else {
          results.push({
            success: false,
            tab: tab,
            error: response.error || "Conversion failed"
          });
        }
      } catch (error) {
        const errorMessage = error.message || "Failed to communicate with tab";
        console.error(errorMessage);
        results.push({
          success: false,
          tab: tab,
          error: errorMessage,
        });
      }
    }

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

    // Filter out browser internal pages
    const validTabs = highlightedTabs.filter(tab =>
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
    processMultipleTabs,
    mergeMarkdownResults,
    generateUniqueFilename,
    sanitizeFilename,
    getDateString,
    createZipArchive,
    getHighlightedTabs,
    getResultsSummary
  };
})();

// For use in browser extension contexts (not modules)
if (typeof window !== 'undefined') {
  window.MultiTabUtils = MultiTabUtils;
}
