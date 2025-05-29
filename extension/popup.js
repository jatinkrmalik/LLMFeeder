// LLMFeeder Popup Script
// Created by @jatinkrmalik (https://github.com/jatinkrmalik)

// Use the browser compatibility layer
const browserAPI = typeof window !== 'undefined' && window.browserAPI ? 
                 window.browserAPI : 
                 (typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : {}));

// DOM elements
const convertBtn = document.getElementById('convertBtn');
const statusIndicator = document.getElementById('statusIndicator');
const settingsToggleBtn = document.getElementById('settingsToggleBtn');
const settingsContainer = document.getElementById('settingsContainer');
const previewContainer = document.getElementById('previewContainer');
const previewContent = document.getElementById('previewContent');
const convertShortcut = document.getElementById('convertShortcut');
const popupShortcut = document.getElementById('popupShortcut');
const quickConvertShortcut = document.getElementById('quickConvertShortcut');

// Get all settings elements
const contentScopeRadios = document.querySelectorAll('input[name="contentScope"]');
const preserveTablesCheckbox = document.getElementById('preserveTables');
const includeImagesCheckbox = document.getElementById('includeImages');

// Show proper keyboard shortcuts based on OS
function updateShortcutDisplay() {
  // Detect OS
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modifier = isMac ? '⌥⇧' : 'Alt+Shift+';
  
  // Update shortcut badges
  popupShortcut.textContent = `${modifier}L`;
  quickConvertShortcut.textContent = `${modifier}M`;
  convertShortcut.textContent = `${modifier}M`;
  
  // Update shortcut customization instruction
  const shortcutCustomizeText = document.querySelector('.shortcut-customize small');
  if (shortcutCustomizeText) {
    const browserName = typeof browser !== 'undefined' ? 'Firefox' : 'Chrome';
    const shortcutPage = browserName === 'Firefox' ? 'about:addons' : 'chrome://extensions/shortcuts';
    shortcutCustomizeText.textContent = `Customize at ${shortcutPage}`;
  }
}

// Load user settings
async function loadSettings() {
  try {
    const data = await browserAPI.storage.sync.get({
      contentScope: 'mainContent',
      preserveTables: true,
      includeImages: true
    });
    
    // Apply settings to UI
    document.querySelector(`input[name="contentScope"][value="${data.contentScope}"]`).checked = true;
    preserveTablesCheckbox.checked = data.preserveTables;
    includeImagesCheckbox.checked = data.includeImages;
  } catch (error) {
    console.error('Error loading settings:', error);
    statusIndicator.textContent = 'Error loading settings';
    statusIndicator.classList.add('error');
  }
}

// Save user settings
async function saveSettings() {
  try {
    const contentScope = document.querySelector('input[name="contentScope"]:checked').value;
    const preserveTables = preserveTablesCheckbox.checked;
    const includeImages = includeImagesCheckbox.checked;
    
    await browserAPI.storage.sync.set({
      contentScope,
      preserveTables,
      includeImages
    });
    
    console.log('Settings saved');
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Convert current page to Markdown
async function convertToMarkdown() {
  statusIndicator.textContent = 'Converting...';
  statusIndicator.className = 'status processing';
  previewContainer.classList.add('hidden');
  
  try {
    // Get current tab
    const tabs = await browserAPI.tabs.query({active: true, currentWindow: true});
    if (!tabs || tabs.length === 0) {
      throw new Error('No active tab found');
    }
    
    // Get current settings
    const contentScope = document.querySelector('input[name="contentScope"]:checked').value;
    const preserveTables = preserveTablesCheckbox.checked;
    const includeImages = includeImagesCheckbox.checked;
    
    // Send message to content script
    const response = await browserAPI.tabs.sendMessage(tabs[0].id, {
      action: 'convertToMarkdown',
      settings: {
        contentScope,
        preserveTables,
        includeImages
      }
    });
    
    if (!response.success) {
      throw new Error(response.error || 'Unknown error');
    }
    
    // Copy to clipboard
    await navigator.clipboard.writeText(response.markdown);
    
    // Update UI
    statusIndicator.textContent = 'Copied to clipboard!';
    statusIndicator.className = 'status success';
    
    // Show preview
    previewContent.textContent = response.markdown;
    previewContainer.classList.remove('hidden');
    
    // Save settings
    saveSettings();
    
  } catch (error) {
    console.error('Conversion error:', error);
    statusIndicator.textContent = `Error: ${error.message || 'Failed to convert page'}`;
    statusIndicator.className = 'status error';
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  updateShortcutDisplay();
  loadSettings();
  
  // Convert button click
  convertBtn.addEventListener('click', convertToMarkdown);
  
  // Settings toggle
  settingsToggleBtn.addEventListener('click', () => {
    const isHidden = settingsContainer.classList.contains('hidden');
    settingsContainer.classList.toggle('hidden');
    settingsToggleBtn.querySelector('.toggle-icon').textContent = isHidden ? '▲' : '▼';
  });
  
  // Save settings when changed
  contentScopeRadios.forEach(radio => {
    radio.addEventListener('change', saveSettings);
  });
  
  preserveTablesCheckbox.addEventListener('change', saveSettings);
  includeImagesCheckbox.addEventListener('change', saveSettings);
}); 