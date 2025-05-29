// LLMFeeder Popup Script
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const convertBtn = document.getElementById('convertBtn');
  const statusIndicator = document.getElementById('statusIndicator');
  const previewContainer = document.getElementById('previewContainer');
  const previewContent = document.getElementById('previewContent');
  const settingsToggleBtn = document.getElementById('settingsToggleBtn');
  const settingsContainer = document.getElementById('settingsContainer');
  
  // Settings elements
  const contentScopeRadios = document.getElementsByName('contentScope');
  const preserveTablesCheckbox = document.getElementById('preserveTables');
  const includeImagesCheckbox = document.getElementById('includeImages');
  
  // Load saved settings
  loadSettings();
  
  // Event Listeners
  convertBtn.addEventListener('click', handleConversion);
  
  settingsToggleBtn.addEventListener('click', () => {
    settingsContainer.classList.toggle('hidden');
  });
  
  // Save settings when changed
  contentScopeRadios.forEach(radio => {
    radio.addEventListener('change', saveSettings);
  });
  
  preserveTablesCheckbox.addEventListener('change', saveSettings);
  includeImagesCheckbox.addEventListener('change', saveSettings);
  
  // Main conversion function
  async function handleConversion() {
    // Update UI state
    convertBtn.disabled = true;
    statusIndicator.textContent = 'Processing...';
    statusIndicator.className = 'status processing';
    previewContainer.classList.add('hidden');
    
    try {
      // Get current settings
      const settings = {
        contentScope: getSelectedContentScope(),
        preserveTables: preserveTablesCheckbox.checked,
        includeImages: includeImagesCheckbox.checked
      };
      
      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Send message to content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'convertToMarkdown',
        settings: settings
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to convert');
      }
      
      // Copy to clipboard
      await navigator.clipboard.writeText(response.markdown);
      
      // Update UI with success
      const checkMark = document.createElement('span');
      checkMark.textContent = '✓';
      checkMark.className = 'success-animation';
      
      statusIndicator.innerHTML = '';
      statusIndicator.appendChild(checkMark);
      statusIndicator.appendChild(document.createTextNode('Copied to clipboard!'));
      statusIndicator.className = 'status success';
      
      // Show preview
      const preview = response.markdown.substring(0, 200) + (response.markdown.length > 200 ? '...' : '');
      previewContent.textContent = preview;
      previewContainer.classList.remove('hidden');
      
      // Analytics tracking (if implemented)
      trackEvent('conversion_success', {
        contentScope: settings.contentScope,
        charCount: response.markdown.length
      });
      
    } catch (error) {
      // Update UI with error
      const errorIcon = document.createElement('span');
      errorIcon.textContent = '!';
      errorIcon.className = 'error-icon';
      
      statusIndicator.innerHTML = '';
      statusIndicator.appendChild(errorIcon);
      
      // Use the error message, but fallback to a generic message if not available
      const errorMessage = error.message || 'Failed to convert';
      statusIndicator.appendChild(document.createTextNode(errorMessage));
      statusIndicator.className = 'status error';
      
      console.error('Conversion error:', error);
      
      // Show settings if the error is related to the content scope
      if (error.message && (
          error.message.includes('No text is selected') || 
          error.message.includes('No content could be extracted')
      )) {
        settingsContainer.classList.remove('hidden');
      }
      
      // Analytics tracking (if implemented)
      trackEvent('conversion_error', {
        error: error.message || 'Unknown error'
      });
    } finally {
      // Re-enable button
      convertBtn.disabled = false;
    }
  }
  
  // Helper functions
  function getSelectedContentScope() {
    for (const radio of contentScopeRadios) {
      if (radio.checked) {
        return radio.value;
      }
    }
    return 'mainContent'; // Default
  }
  
  function saveSettings() {
    const settings = {
      contentScope: getSelectedContentScope(),
      preserveTables: preserveTablesCheckbox.checked,
      includeImages: includeImagesCheckbox.checked
    };
    
    chrome.storage.sync.set({ settings }, () => {
      console.log('Settings saved:', settings);
    });
  }
  
  function loadSettings() {
    chrome.storage.sync.get('settings', (data) => {
      if (data.settings) {
        // Set content scope
        for (const radio of contentScopeRadios) {
          radio.checked = (radio.value === data.settings.contentScope);
        }
        
        // Set checkboxes
        if (typeof data.settings.preserveTables === 'boolean') {
          preserveTablesCheckbox.checked = data.settings.preserveTables;
        }
        
        if (typeof data.settings.includeImages === 'boolean') {
          includeImagesCheckbox.checked = data.settings.includeImages;
        }
      }
    });
  }
  
  // Simple analytics tracking function (placeholder)
  function trackEvent(eventName, eventData) {
    // This would normally send data to an analytics service
    console.log('Event tracked:', eventName, eventData);
  }
}); 