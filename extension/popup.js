// LLMFeeder Popup Script
// Created by @jatinkrmalik (https://github.com/jatinkrmalik)

const MAX_FILENAME_LENGTH = 100;

// Review prompt constants
const REVIEW_TRIGGER_COUNT = 20;
const REVIEW_SNOOZE_COUNT = 40;
const CHROME_WEBSTORE_URL = "https://chromewebstore.google.com/detail/llmfeeder/cjjfhhapabcpcokkfldbiiojiphbifdk/reviews";
const FIREFOX_ADDONS_URL = "https://addons.mozilla.org/en-US/firefox/addon/llmfeeder/reviews/";

// Create a proper browserAPI wrapper for the popup
const browserAPI = (function () {
  // Check if we're in Firefox (browser is defined) or Chrome (chrome is defined)
  const isBrowser = typeof browser !== "undefined";
  const isChrome = typeof chrome !== "undefined";

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
      query: function (queryInfo) {
        return new Promise((resolve, reject) => {
          chrome.tabs.query(queryInfo, (tabs) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message || 'Unknown error'));
            } else {
              resolve(tabs);
            }
          });
        });
      },
      sendMessage: function (tabId, message) {
        return new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message || 'Unknown error'));
            } else {
              resolve(response);
            }
          });
        });
      },
    };

    api.runtime = chrome.runtime;

    api.storage = {
      sync: {
        get: function (keys) {
          return new Promise((resolve, reject) => {
            chrome.storage.sync.get(keys, (result) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message || 'Unknown error'));
              } else {
                resolve(result);
              }
            });
          });
        },
        set: function (items) {
          return new Promise((resolve, reject) => {
            chrome.storage.sync.set(items, () => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message || 'Unknown error'));
              } else {
                resolve();
              }
            });
          });
        },
      },
    };

    api.commands = chrome.commands;
  }

  return api;
})();

// DOM elements - Main view
const convertBtn = document.getElementById("convertBtn");
const downloadBtn = document.getElementById("downloadBtn");
const downloadBtnShortcut = document.getElementById("downloadBtnShortcut");
const statusIndicator = document.getElementById("statusIndicator");
const convertShortcut = document.getElementById("convertShortcut");

// DOM elements - Views
const mainView = document.getElementById("mainView");
const settingsView = document.getElementById("settingsView");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const backToMainBtn = document.getElementById("backToMainBtn");

// DOM elements - Theme
const lightThemeBtn = document.getElementById("lightThemeBtn");
const darkThemeBtn = document.getElementById("darkThemeBtn");
const bodyTag = document.querySelector("body");

// DOM elements - Settings
const popupShortcut = document.getElementById("popupShortcut");
const quickConvertShortcut = document.getElementById("quickConvertShortcut");
const downloadShortcut = document.getElementById("downloadShortcut");

const THEME_KEY = "llmfeeder-theme";
const THEMES = { DARK: "dark", LIGHT: "light" };

// View navigation
function showSettingsView() {
  mainView.classList.add("slide-out");
  settingsView.classList.add("active");
}

function showMainView() {
  mainView.classList.remove("slide-out");
  settingsView.classList.remove("active");
}

// Theme management
function setTheme(theme) {
  const isDark = theme === THEMES.DARK;
  bodyTag.classList.toggle("dark-theme", isDark);
  bodyTag.classList.toggle("light-theme", !isDark);
  
  // Update theme buttons
  lightThemeBtn.classList.toggle("active", !isDark);
  darkThemeBtn.classList.toggle("active", isDark);
  
  localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
  const userThemePreference = localStorage.getItem(THEME_KEY);
  if (userThemePreference === THEMES.DARK || userThemePreference === THEMES.LIGHT) {
    setTheme(userThemePreference);
  } else {
    setTheme(THEMES.LIGHT);
  }
}

// Get all settings elements
const contentScopeRadios = document.querySelectorAll('input[name="contentScope"]');
const preserveTablesCheckbox = document.getElementById("preserveTables");
const includeImagesCheckbox = document.getElementById("includeImages");
const includeTitleCheckbox = document.getElementById("includeTitle");
const includeLinksCheckbox = document.getElementById("includeLinks");
const includeMetadataCheckbox = document.getElementById("includeMetadata");
const metadataFormatTextarea = document.getElementById("metadataFormat");
const metadataFormatContainer = document.getElementById("metadataFormatContainer");
const resetMetadataFormatBtn = document.getElementById("resetMetadataFormat");
const debugModeCheckbox = document.getElementById("debugMode");
const copyLogsBtn = document.getElementById("copyLogsBtn");

// Token Counter DOM elements
const tokenCounter = document.getElementById("tokenCounter");
const tokenCountValue = document.getElementById("tokenCountValue");
const tokenLimitValue = document.getElementById("tokenLimitValue");
const tokenProgressBar = document.getElementById("tokenProgressBar");
const tokenWarning = document.getElementById("tokenWarning");
const showTokenCountCheckbox = document.getElementById("showTokenCount");
const tokenContextLimitSelect = document.getElementById("tokenContextLimit");

// Tagline element
const tagline = document.getElementById("tagline");

// Current token count for display
let currentTokenCount = 0;

// Review banner elements
const reviewBanner = document.getElementById("reviewBanner");
const leaveReviewBtn = document.getElementById("leaveReviewBtn");
const snoozeReviewBtn = document.getElementById("snoozeReviewBtn");
const dismissReviewBtn = document.getElementById("dismissReviewBtn");

// Settings rating CTA elements
const settingsReviewLink = document.getElementById("settingsReviewLink");
const storeNameSpan = document.getElementById("storeName");
const ratingCta = document.getElementById("ratingCta");
const dismissRatingCta = document.getElementById("dismissRatingCta");

// Default metadata format
const DEFAULT_METADATA_FORMAT = "---\nSource: [{title}]({url})";

// Default token counter settings
const DEFAULT_TOKEN_SETTINGS = {
  showTokenCount: true,
  tokenContextLimit: 8192
};

/**
 * Format large numbers for display (e.g., 128000 -> "128K")
 * @param {number} num - Number to format
 * @returns {string} Formatted string
 */
function formatTokenLimit(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(0) + 'K';
  }
  return num.toString();
}

/**
 * Update token counter display
 * @param {number} count - Token count
 * @param {number} limit - Context limit
 */
function updateTokenDisplay(count, limit) {
  currentTokenCount = count;
  
  // Update values
  tokenCountValue.textContent = count.toLocaleString();
  tokenLimitValue.textContent = formatTokenLimit(limit);
  
  // Calculate percentage
  const percentage = Math.min((count / limit) * 100, 100);
  tokenProgressBar.style.width = percentage + '%';
  
  // Update progress bar color based on percentage
  tokenProgressBar.classList.remove('warning', 'error');
  if (percentage >= 100) {
    tokenProgressBar.classList.add('error');
  } else if (percentage >= 75) {
    tokenProgressBar.classList.add('warning');
  }
  
  // Show/hide counter and tagline
  if (showTokenCountCheckbox.checked) {
    tokenCounter.classList.remove('hidden');
    // Hide tagline with animation when token counter is shown
    if (tagline) {
      tagline.classList.add('hidden');
    }
  } else {
    tokenCounter.classList.add('hidden');
    // Show tagline when token counter is hidden
    if (tagline) {
      tagline.classList.remove('hidden');
    }
  }
  
  // Update warning message
  tokenWarning.classList.remove('hidden', 'error');
  if (percentage >= 100) {
    tokenWarning.textContent = `⚠️ Exceeds limit by ${(count - limit).toLocaleString()} tokens`;
    tokenWarning.classList.add('error');
  } else if (percentage >= 90) {
    tokenWarning.textContent = `⚠️ ${(limit - count).toLocaleString()} tokens remaining`;
  } else if (percentage >= 75) {
    tokenWarning.textContent = `${(limit - count).toLocaleString()} tokens remaining`;
  } else {
    tokenWarning.classList.add('hidden');
  }
}

/**
 * Hide token counter display
 */
function hideTokenDisplay() {
  tokenCounter.classList.add('hidden');
  // Show tagline when token counter is hidden
  if (tagline) {
    tagline.classList.remove('hidden');
  }
}

// Show proper keyboard shortcuts based on OS
function updateShortcutDisplay() {
  // Detect OS
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const modifier = isMac ? "⌥⇧" : "Alt+Shift+";

  // Update shortcut badges
  popupShortcut.textContent = `${modifier}L`;
  quickConvertShortcut.textContent = `${modifier}M`;
  convertShortcut.textContent = `${modifier}M`;
  
  // Update download shortcut in settings
  if (downloadShortcut) {
    downloadShortcut.textContent = `${modifier}D`;
  }
  
  // Update download button shortcut
  if (downloadBtnShortcut) {
    downloadBtnShortcut.textContent = `${modifier}D`;
  }

  // Detect browser - check for Firefox-specific APIs
  // browser-polyfill defines 'browser' in Chrome too, so we need a different check
  const isFirefox = navigator.userAgent.toLowerCase().includes("firefox");

  // Update shortcut customization link
  const shortcutLink = document.getElementById("shortcutLink");
  if (shortcutLink) {
    const shortcutPage = isFirefox ? "about:addons" : "chrome://extensions/shortcuts";
    shortcutLink.textContent = shortcutPage;
    
    // Handle click to open the shortcuts page
    shortcutLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (isFirefox) {
        browser.tabs.create({ url: "about:addons" });
      } else {
        chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
      }
    });
  }

  // Update settings rating CTA store name
  if (storeNameSpan) {
    storeNameSpan.textContent = isFirefox ? "Firefox Add-ons" : "Chrome Web Store";
  }
}

// Load user settings
async function loadSettings() {
  try {
    const data = await browserAPI.storage.sync.get({
      contentScope: "mainContent",
      preserveTables: true,
      includeImages: true,
      includeTitle: true,
      includeLinks: true,
      includeMetadata: true,
      metadataFormat: DEFAULT_METADATA_FORMAT,
      debugMode: false,
      showTokenCount: DEFAULT_TOKEN_SETTINGS.showTokenCount,
      tokenContextLimit: DEFAULT_TOKEN_SETTINGS.tokenContextLimit,
    });

    // Apply settings to UI
    document.querySelector(`input[name="contentScope"][value="${data.contentScope}"]`).checked = true;
    preserveTablesCheckbox.checked = data.preserveTables;
    includeImagesCheckbox.checked = data.includeImages;
    includeTitleCheckbox.checked = data.includeTitle;
    includeLinksCheckbox.checked = data.includeLinks !== false;
    includeMetadataCheckbox.checked = data.includeMetadata;
    metadataFormatTextarea.value = data.metadataFormat;
    debugModeCheckbox.checked = data.debugMode;
    showTokenCountCheckbox.checked = data.showTokenCount;
    tokenContextLimitSelect.value = data.tokenContextLimit.toString();

    // Show/hide metadata format container based on checkbox state
    updateMetadataFormatVisibility(data.includeMetadata);

    // Show/hide debug logs button based on debug mode
    updateDebugModeVisibility();
  } catch (error) {
    console.error("Error loading settings:", error);
    statusIndicator.textContent = "Error loading settings";
    statusIndicator.classList.add("error");
  }
}

// Save user settings
async function saveSettings() {
  try {
    const contentScope = document.querySelector('input[name="contentScope"]:checked').value;
    const preserveTables = preserveTablesCheckbox.checked;
    const includeImages = includeImagesCheckbox.checked;
    const includeTitle = includeTitleCheckbox.checked;
    const includeLinks = includeLinksCheckbox.checked;
    const includeMetadata = includeMetadataCheckbox.checked;
    const metadataFormat = metadataFormatTextarea.value;
    const debugMode = debugModeCheckbox.checked;
    const showTokenCount = showTokenCountCheckbox.checked;
    const tokenContextLimit = parseInt(tokenContextLimitSelect.value, 10);

    await browserAPI.storage.sync.set({
      contentScope,
      preserveTables,
      includeImages,
      includeTitle,
      includeLinks,
      includeMetadata,
      metadataFormat,
      debugMode,
      showTokenCount,
      tokenContextLimit,
    });
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}

// Update metadata format container visibility
function updateMetadataFormatVisibility(isVisible) {
  if (isVisible) {
    metadataFormatContainer.classList.remove("hidden");
  } else {
    metadataFormatContainer.classList.add("hidden");
  }
}

// Copy debug logs from content script
async function copyLogs() {
  const btn = copyLogsBtn;
  const originalText = btn.querySelector('.btn-text').textContent;

  try {
    const tabs = await browserAPI.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tabs || tabs.length === 0) {
      statusIndicator.textContent = "No active tab";
      statusIndicator.className = "status error";
      return;
    }

    const response = await browserAPI.tabs.sendMessage(tabs[0].id, {
      action: "getDebugLogs",
    });

    if (response.success && response.logs) {
      await navigator.clipboard.writeText(response.logs);

      // Update button text temporarily to show feedback
      btn.querySelector('.btn-text').textContent = "Copied!";
      btn.classList.add('success');

      setTimeout(() => {
        btn.querySelector('.btn-text').textContent = originalText;
        btn.classList.remove('success');
      }, 2000);
    } else {
      statusIndicator.textContent = "No logs to copy";
      statusIndicator.className = "status error";
      setTimeout(() => {
        statusIndicator.textContent = "Ready";
        statusIndicator.className = "status";
      }, 2000);
    }
  } catch (error) {
    statusIndicator.textContent = "Error: " + error.message;
    statusIndicator.className = "status error";
    setTimeout(() => {
      statusIndicator.textContent = "Ready";
      statusIndicator.className = "status";
    }, 2000);
  }
}

// Toggle copy logs button visibility based on debug mode
function updateDebugModeVisibility() {
  const debugEnabled = debugModeCheckbox.checked;
  if (debugEnabled) {
    copyLogsBtn.style.display = '';
  } else {
    copyLogsBtn.style.display = 'none';
  }
}

// Detect browser type
function detectBrowser() {
  return navigator.userAgent.toLowerCase().includes("firefox") ? "firefox" : "chrome";
}

// Get appropriate store URL based on browser
function getStoreUrl() {
  return detectBrowser() === "firefox" ? FIREFOX_ADDONS_URL : CHROME_WEBSTORE_URL;
}

// Track conversion and check if review banner should be shown
async function trackConversion() {
  try {
    const data = await browserAPI.storage.sync.get({
      conversionCount: 0,
      reviewPromptDismissed: false,
      snoozeThreshold: null
    });

    const newCount = data.conversionCount + 1;
    const isSnoozed = data.snoozeThreshold !== null;
    const shouldShowBanner = !data.reviewPromptDismissed && 
                             (newCount === REVIEW_TRIGGER_COUNT || 
                              (data.snoozeThreshold && newCount === data.snoozeThreshold));

    await browserAPI.storage.sync.set({ conversionCount: newCount });

    return shouldShowBanner ? { show: true, isSnoozed } : { show: false, isSnoozed: false };
  } catch (error) {
    console.error("Error tracking conversion:", error);
    return { show: false, isSnoozed: false };
  }
}

// Show review banner
function showReviewBanner(isSnoozed = false) {
  if (reviewBanner) {
    reviewBanner.classList.remove("hidden");
    // First appearance: show "Leave a Review" and "Maybe Later" only
    // Second appearance (after snooze): show "Leave a Review" and "No Thanks" only
    if (snoozeReviewBtn) {
      snoozeReviewBtn.style.display = isSnoozed ? "none" : "inline-block";
    }
    if (dismissReviewBtn) {
      dismissReviewBtn.style.display = isSnoozed ? "inline-block" : "none";
    }
  }
}

// Hide review banner
function hideReviewBanner() {
  if (reviewBanner) {
    reviewBanner.classList.add("hidden");
  }
}

// Handle "Leave a Review" button click
async function handleLeaveReview() {
  try {
    const storeUrl = getStoreUrl();
    await browserAPI.storage.sync.set({ reviewPromptDismissed: true });
    hideReviewBanner();
    browserAPI.tabs.create({ url: storeUrl });
  } catch (error) {
    console.error("Error opening store:", error);
  }
}

// Handle "Maybe Later" button click (snooze)
async function handleSnoozeReview() {
  try {
    await browserAPI.storage.sync.set({ snoozeThreshold: REVIEW_SNOOZE_COUNT });
    hideReviewBanner();
  } catch (error) {
    console.error("Error snoozing review prompt:", error);
  }
}

// Handle "No Thanks" button click (dismiss permanently)
async function handleDismissReview() {
  try {
    await browserAPI.storage.sync.set({ reviewPromptDismissed: true });
    hideReviewBanner();
  } catch (error) {
    console.error("Error dismissing review prompt:", error);
  }
}

// Initialize review banner state
async function initReviewBanner() {
  try {
    const data = await browserAPI.storage.sync.get({
      conversionCount: 0,
      reviewPromptDismissed: false,
      snoozeThreshold: null
    });

    const isSnoozed = data.snoozeThreshold !== null;
    const shouldShow = !data.reviewPromptDismissed && 
                      (data.conversionCount === REVIEW_TRIGGER_COUNT || 
                       (data.snoozeThreshold && data.conversionCount === data.snoozeThreshold));

    if (shouldShow) {
      showReviewBanner(isSnoozed);
    } else {
      hideReviewBanner();
    }
  } catch (error) {
    console.error("Error initializing review banner:", error);
    hideReviewBanner();
  }
}

// Initialize settings rating CTA visibility
async function initSettingsRatingCta() {
  try {
    // Check if we should reset the CTA (60 days passed and hasn't rated)
    const shouldReset = await shouldResetSettingsRatingCta();
    if (shouldReset) {
      await browserAPI.storage.sync.set({
        settingsRatingCtaDismissed: false,
        settingsRatingCtaDismissedAt: null
      });
    }

    const data = await browserAPI.storage.sync.get({
      settingsRatingCtaDismissed: false
    });

    if (ratingCta) {
      if (data.settingsRatingCtaDismissed) {
        ratingCta.style.display = 'none';
      } else {
        ratingCta.style.display = 'block';
      }
    }
  } catch (error) {
    console.error("Error initializing settings rating CTA:", error);
  }
}

// Handle settings rating CTA dismiss
async function handleDismissSettingsRatingCta() {
  try {
    const now = Date.now();
    await browserAPI.storage.sync.set({ 
      settingsRatingCtaDismissed: true,
      settingsRatingCtaDismissedAt: now
    });
    if (ratingCta) {
      ratingCta.style.display = 'none';
    }
  } catch (error) {
    console.error("Error dismissing settings rating CTA:", error);
  }
}

// Check if we should reset the settings rating CTA (after 60 days)
async function shouldResetSettingsRatingCta() {
  try {
    const data = await browserAPI.storage.sync.get({
      settingsRatingCtaDismissed: false,
      settingsRatingCtaDismissedAt: null,
      hasClickedRatingLink: false
    });

    // If they've rated, don't show again
    if (data.hasClickedRatingLink) {
      return false;
    }

    // If not dismissed, no need to reset
    if (!data.settingsRatingCtaDismissed || !data.settingsRatingCtaDismissedAt) {
      return false;
    }

    // Check if 60 days have passed
    const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
    const timeSinceDismissal = Date.now() - data.settingsRatingCtaDismissedAt;
    
    return timeSinceDismissal >= SIXTY_DAYS_MS;
  } catch (error) {
    console.error("Error checking settings rating CTA reset:", error);
    return false;
  }
}

// Convert current page to Markdown
async function convertToMarkdown() {
  statusIndicator.textContent = "Converting...";
  statusIndicator.className = "status processing";

  try {
    // Get current tab
    const tabs = await browserAPI.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tabs || tabs.length === 0) {
      throw new Error("No active tab found");
    }

    // Get current settings
    const contentScope = document.querySelector('input[name="contentScope"]:checked').value;
    const preserveTables = preserveTablesCheckbox.checked;
    const includeImages = includeImagesCheckbox.checked;
    const includeTitle = includeTitleCheckbox.checked;
    const includeLinks = includeLinksCheckbox.checked;
    const includeMetadata = includeMetadataCheckbox.checked;
    const metadataFormat = metadataFormatTextarea.value;
    const debugMode = debugModeCheckbox.checked;

    // Send message to content script
    const response = await browserAPI.tabs.sendMessage(tabs[0].id, {
      action: "convertToMarkdown",
      settings: {
        contentScope,
        preserveTables,
        includeImages,
        includeTitle,
        includeLinks,
        includeMetadata,
        metadataFormat,
        debugMode,
      },
    });

    if (!response.success) {
      throw new Error(response.error || "Unknown error");
    }

    // Use token count from content script response for consistency
    let tokenCount = response.tokenCount || 0;
    
    // Fallback to TokenCounter if needed (shouldn't happen)
    if (tokenCount === 0 && typeof TokenCounter !== 'undefined') {
      try {
        tokenCount = await TokenCounter.count(response.markdown);
      } catch (tokenError) {
        console.error("Token counting error:", tokenError);
      }
    }

    // Copy to clipboard
    await navigator.clipboard.writeText(response.markdown);

    // Update UI
    statusIndicator.textContent = "Copied to clipboard!";
    statusIndicator.className = "status success";

    // Update token display
    const contextLimit = parseInt(tokenContextLimitSelect.value, 10);
    updateTokenDisplay(tokenCount, contextLimit);

    // Save settings
    await saveSettings();

    // Track conversion and show review banner if needed
    const bannerState = await trackConversion();
    if (bannerState.show) {
      showReviewBanner(bannerState.isSnoozed);
    }
  } catch (error) {
    console.error("Conversion error:", error);
    const errorMessage = error.message || error.toString() || "Failed to convert page";
    statusIndicator.textContent = `Error: ${errorMessage}`;
    statusIndicator.className = "status error";
    hideTokenDisplay();
  }
}

// Download markdown file
async function downloadMarkdown() {
  statusIndicator.textContent = "Converting...";
  statusIndicator.className = "status processing";

  try {
    // Get current tab
    const tabs = await browserAPI.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tabs || tabs.length === 0) {
      throw new Error("No active tab found");
    }

    // Get current settings
    const contentScope = document.querySelector('input[name="contentScope"]:checked').value;
    const preserveTables = preserveTablesCheckbox.checked;
    const includeImages = includeImagesCheckbox.checked;
    const includeTitle = includeTitleCheckbox.checked;
    const includeLinks = includeLinksCheckbox.checked;
    const includeMetadata = includeMetadataCheckbox.checked;
    const metadataFormat = metadataFormatTextarea.value;
    const debugMode = debugModeCheckbox.checked;

    // Send message to content script
    const response = await browserAPI.tabs.sendMessage(tabs[0].id, {
      action: "convertToMarkdown",
      settings: {
        contentScope,
        preserveTables,
        includeImages,
        includeTitle,
        includeLinks,
        includeMetadata,
        metadataFormat,
        debugMode,
      },
    });

    if (!response.success) {
      throw new Error(response.error || "Unknown error");
    }

    // Use token count from content script response for consistency
    let tokenCount = response.tokenCount || 0;
    
    // Fallback to TokenCounter if needed (shouldn't happen)
    if (tokenCount === 0 && typeof TokenCounter !== 'undefined') {
      try {
        tokenCount = await TokenCounter.count(response.markdown);
      } catch (tokenError) {
        console.error("Token counting error:", tokenError);
      }
    }

    // Download the file
    const filename = await generateFileNameFromPageTitle();
    downloadMarkdownFile(filename, response.markdown);

    // Update UI
    statusIndicator.textContent = "Downloaded!";
    statusIndicator.className = "status success";

    // Update token display
    const contextLimit = parseInt(tokenContextLimitSelect.value, 10);
    updateTokenDisplay(tokenCount, contextLimit);

    // Save settings
    await saveSettings();

    // Track conversion and show review banner if needed
    const bannerState = await trackConversion();
    if (bannerState.show) {
      showReviewBanner(bannerState.isSnoozed);
    }
  } catch (error) {
    console.error("Download error:", error);
    const errorMessage = error.message || error.toString() || "Failed to download";
    statusIndicator.textContent = `Error: ${errorMessage}`;
    statusIndicator.className = "status error";
    hideTokenDisplay();
  }
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  updateShortcutDisplay();
  loadSettings();
  initReviewBanner();
  initSettingsRatingCta();

  // Convert button click
  convertBtn.addEventListener("click", convertToMarkdown);
  
  // Download button click
  downloadBtn.addEventListener("click", downloadMarkdown);

  // View navigation
  openSettingsBtn.addEventListener("click", showSettingsView);
  backToMainBtn.addEventListener("click", showMainView);

  // Theme buttons
  lightThemeBtn.addEventListener("click", () => setTheme(THEMES.LIGHT));
  darkThemeBtn.addEventListener("click", () => setTheme(THEMES.DARK));

  // Save settings when changed
  contentScopeRadios.forEach((radio) => {
    radio.addEventListener("change", saveSettings);
  });

  preserveTablesCheckbox.addEventListener("change", saveSettings);
  includeImagesCheckbox.addEventListener("change", saveSettings);
  includeTitleCheckbox.addEventListener("change", saveSettings);
  includeLinksCheckbox.addEventListener("change", saveSettings);
  debugModeCheckbox.addEventListener("change", () => {
    updateDebugModeVisibility();
    saveSettings();
  });

  // Metadata format settings
  includeMetadataCheckbox.addEventListener("change", () => {
    updateMetadataFormatVisibility(includeMetadataCheckbox.checked);
    saveSettings();
  });

  metadataFormatTextarea.addEventListener("input", saveSettings);

  resetMetadataFormatBtn.addEventListener("click", () => {
    metadataFormatTextarea.value = DEFAULT_METADATA_FORMAT;
    saveSettings();
  });

  // Copy logs button
  copyLogsBtn.addEventListener("click", copyLogs);

  // Token counter settings
  showTokenCountCheckbox.addEventListener("change", () => {
    saveSettings();
    // Toggle visibility immediately
    if (showTokenCountCheckbox.checked && currentTokenCount > 0) {
      const contextLimit = parseInt(tokenContextLimitSelect.value, 10);
      updateTokenDisplay(currentTokenCount, contextLimit);
    } else {
      hideTokenDisplay();
    }
  });

  tokenContextLimitSelect.addEventListener("change", () => {
    saveSettings();
    // Update display if we have a current count
    if (currentTokenCount > 0) {
      const contextLimit = parseInt(tokenContextLimitSelect.value, 10);
      updateTokenDisplay(currentTokenCount, contextLimit);
    }
  });

  // Initialize token counter
  if (typeof TokenCounter !== 'undefined') {
    TokenCounter.init().then(() => {
      console.log("TokenCounter initialized");
    }).catch(err => {
      console.error("Failed to initialize TokenCounter:", err);
    });
  }

  // Review banner buttons
  if (leaveReviewBtn) {
    leaveReviewBtn.addEventListener("click", handleLeaveReview);
  }
  if (snoozeReviewBtn) {
    snoozeReviewBtn.addEventListener("click", handleSnoozeReview);
  }
  if (dismissReviewBtn) {
    dismissReviewBtn.addEventListener("click", handleDismissReview);
  }

  // Settings rating CTA link
  if (settingsReviewLink) {
    settingsReviewLink.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await browserAPI.storage.sync.set({ hasClickedRatingLink: true });
        const storeUrl = getStoreUrl();
        browserAPI.tabs.create({ url: storeUrl });
      } catch (error) {
        console.error("Error tracking rating link click:", error);
        const storeUrl = getStoreUrl();
        browserAPI.tabs.create({ url: storeUrl });
      }
    });
  }

  // Settings rating CTA dismiss button
  if (dismissRatingCta) {
    dismissRatingCta.addEventListener("click", handleDismissSettingsRatingCta);
  }
});

async function generateFileNameFromPageTitle() {
  let baseFilename = "llmfeeder"; // Default filename
  try {
    const tabs = await browserAPI.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tabs && tabs.length > 0 && tabs[0].title) {
      let pageTitle = tabs[0].title.trim();
      if (pageTitle) {
        // Sanitize the title to be a valid filename
        let sanitizedTitle = pageTitle
          .replace(/[<>:"/\\|?*\x00-\x1F]/g, "") // Remove invalid characters
          .replace(/[\s./]+/g, "_") // Replace spaces, dots, slashes with underscores
          .replace(/_+/g, "_") // Consolidate multiple underscores
          .replace(/^_+|_+$/g, ""); // Trim leading/trailing underscores

        if (sanitizedTitle.length > MAX_FILENAME_LENGTH) {
          // Limit length
          sanitizedTitle = sanitizedTitle
            .substring(0, MAX_FILENAME_LENGTH)
            .replace(/_+$/g, "");
        }
        if (sanitizedTitle) baseFilename = sanitizedTitle;
      }
    }
  } catch (error) {
    console.error("Error getting tab title for filename:", error);
    // Silently use default filename if error occurs, or show a non-critical error
  } finally {
    return baseFilename;
  }
}

function downloadMarkdownFile(filename, content) {
  let a = null;
  let url = null;
  
  try {
    // Create a blob and download
    const blob = new Blob([content], { type: "text/markdown" });
    url = URL.createObjectURL(blob);

    a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.md`;
    document.body.appendChild(a);
    a.click();
  } catch (error) {
    console.error("Error downloading file:", error);
  } finally {
    // Clean up, ensuring 'a' and 'url' are defined if an error occurred before their assignment
    if (a && a.parentElement) {
      document.body.removeChild(a);
    }
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
