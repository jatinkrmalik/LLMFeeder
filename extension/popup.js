// LLMFeeder Popup Script
// Created by @jatinkrmalik (https://github.com/jatinkrmalik)

const MAX_FILENAME_LENGTH = 100;
const DOWNLOAD_STATUS_INDICATOR_DURATION = 4000;

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
              reject(chrome.runtime.lastError);
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
              reject(chrome.runtime.lastError);
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
                reject(chrome.runtime.lastError);
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
                reject(chrome.runtime.lastError);
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

// DOM elements
const convertBtn = document.getElementById("convertBtn");
const statusIndicator = document.getElementById("statusIndicator");
const settingsToggleBtn = document.getElementById("settingsToggleBtn");
const settingsContainer = document.getElementById("settingsContainer");
const previewContainer = document.getElementById("previewContainer");
const previewContent = document.getElementById("previewContent");
const convertShortcut = document.getElementById("convertShortcut");
const popupShortcut = document.getElementById("popupShortcut");
const quickConvertShortcut = document.getElementById("quickConvertShortcut");
const downloadMarkdownFileBtn = document.getElementById(
  "downloadMarkdownFileBtn"
);
const downloadMarkdownFileContainer = document.getElementById(
  "downloadMarkdownFileContainer"
);
const downloadStatusIndicator = document.getElementById(
  "downloadStatusIndicator"
);

// DOM elements (theme)
const toggleLight = document.querySelector(".toggle-light");
const toggleDark = document.querySelector(".toggle-dark");
const bodyTag = document.querySelector("body");

const THEME_KEY = "llmfeeder-theme";
const THEMES = { DARK: "dark", LIGHT: "light" };

function setTheme(theme) {
  const isDark = theme === THEMES.DARK;
  bodyTag.classList.toggle("dark-theme", isDark);
  bodyTag.classList.toggle("light-theme", !isDark);
  toggleDark.classList.toggle("hidden", isDark);
  toggleLight.classList.toggle("hidden", !isDark);
  localStorage.setItem(THEME_KEY, theme);
}

toggleDark.addEventListener("click", () => {
  setTheme("dark");
});
toggleLight.addEventListener("click", () => {
  setTheme("light");
});

let userThemePreference = localStorage.getItem("llmfeeder-theme");
window.addEventListener("DOMContentLoaded", () => {
  if (userThemePreference === "dark" || userThemePreference === "light")
    setTheme(userThemePreference);
});

// Get all settings elements
const contentScopeRadios = document.querySelectorAll(
  'input[name="contentScope"]'
);
const preserveTablesCheckbox = document.getElementById("preserveTables");
const includeImagesCheckbox = document.getElementById("includeImages");
const includeTitleCheckbox = document.getElementById("includeTitle");

// Show proper keyboard shortcuts based on OS
function updateShortcutDisplay() {
  // Detect OS
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const modifier = isMac ? "⌥⇧" : "Alt+Shift+";

  // Update shortcut badges
  popupShortcut.textContent = `${modifier}L`;
  quickConvertShortcut.textContent = `${modifier}M`;
  convertShortcut.textContent = `${modifier}M`;

  // Update shortcut customization instruction
  const shortcutCustomizeText = document.querySelector(
    ".shortcut-customize small"
  );
  if (shortcutCustomizeText) {
    const browserName = typeof browser !== "undefined" ? "Firefox" : "Chrome";
    const shortcutPage =
      browserName === "Firefox"
        ? "about:addons"
        : "chrome://extensions/shortcuts";
    shortcutCustomizeText.textContent = `Customize at ${shortcutPage}`;
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
    });

    // Apply settings to UI
    document.querySelector(
      `input[name="contentScope"][value="${data.contentScope}"]`
    ).checked = true;
    preserveTablesCheckbox.checked = data.preserveTables;
    includeImagesCheckbox.checked = data.includeImages;
    includeTitleCheckbox.checked = data.includeTitle;
  } catch (error) {
    console.error("Error loading settings:", error);
    statusIndicator.textContent = "Error loading settings";
    statusIndicator.classList.add("error");
  }
}

// Save user settings
async function saveSettings() {
  try {
    const contentScope = document.querySelector(
      'input[name="contentScope"]:checked'
    ).value;
    const preserveTables = preserveTablesCheckbox.checked;
    const includeImages = includeImagesCheckbox.checked;
    const includeTitle = includeTitleCheckbox.checked;

    await browserAPI.storage.sync.set({
      contentScope,
      preserveTables,
      includeImages,
      includeTitle,
    });
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}

// Convert current page to Markdown
async function convertToMarkdown() {
  statusIndicator.textContent = "Converting...";
  statusIndicator.className = "status processing";
  previewContainer.classList.add("hidden");

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
    const contentScope = document.querySelector(
      'input[name="contentScope"]:checked'
    ).value;
    const preserveTables = preserveTablesCheckbox.checked;
    const includeImages = includeImagesCheckbox.checked;
    const includeTitle = includeTitleCheckbox.checked;

    // Send message to content script
    const response = await browserAPI.tabs.sendMessage(tabs[0].id, {
      action: "convertToMarkdown",
      settings: {
        contentScope,
        preserveTables,
        includeImages,
        includeTitle,
      },
    });

    if (!response.success) {
      throw new Error(response.error || "Unknown error");
    }

    // Copy to clipboard
    await navigator.clipboard.writeText(response.markdown);

    // Update UI
    statusIndicator.textContent = "Copied to clipboard!";
    statusIndicator.className = "status success";

    // Show preview
    previewContent.textContent = response.markdown;
    previewContainer.classList.remove("hidden");
    if (downloadMarkdownFileContainer) {
      downloadMarkdownFileContainer.classList.remove("hidden");
    }

    // Save settings
    saveSettings();
  } catch (error) {
    console.error("Conversion error:", error);
    statusIndicator.textContent = `Error: ${
      error.message || "Failed to convert page"
    }`;
    statusIndicator.className = "status error";
  }
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  updateShortcutDisplay();
  loadSettings();

  // Convert button click
  convertBtn.addEventListener("click", convertToMarkdown);

  // Settings toggle
  settingsToggleBtn.addEventListener("click", () => {
    const isHidden = settingsContainer.classList.contains("hidden");
    settingsContainer.classList.toggle("hidden");
    settingsToggleBtn.querySelector(".toggle-icon").textContent = isHidden
      ? "▲"
      : "▼";
  });

  // Save settings when changed
  contentScopeRadios.forEach((radio) => {
    radio.addEventListener("change", saveSettings);
  });

  preserveTablesCheckbox.addEventListener("change", saveSettings);
  includeImagesCheckbox.addEventListener("change", saveSettings);
  includeTitleCheckbox.addEventListener("change", saveSettings);

  downloadMarkdownFileBtn.addEventListener("click", async () => {
    const markdownContent = previewContent.textContent;

    if (!markdownContent || markdownContent.trim() === "") {
      updateDownloadStatus("Markdown content is empty.", "error");
      return;
    }

    const filename = await generateFileNameFromPageTitle();
    downloadMarkdownFile(filename, markdownContent);
  });
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
  try {
    // Create a blob and download
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.md`;
    document.body.appendChild(a);
    a.click();

    updateDownloadStatus("Download complete!", "success");
  } catch (error) {
    console.error("Error downloading file:", error);

    updateDownloadStatus(
      `Error: ${error.message || "Failed to download file"}`,
      "error"
    );
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

// Helper function to update and reset the download status indicator
function updateDownloadStatus(message, type = "success") {
  downloadStatusIndicator.textContent = message;
  downloadStatusIndicator.className = `status ${type}`; // Reset classes and add new ones
  downloadStatusIndicator.classList.remove("hidden");

  setTimeout(() => {
    downloadStatusIndicator.textContent = "";
    downloadStatusIndicator.classList.add("hidden");
    downloadStatusIndicator.classList.remove("status", type);
  }, DOWNLOAD_STATUS_INDICATOR_DURATION);
}
