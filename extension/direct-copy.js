// Ultra-simple script for copying text to clipboard
document.addEventListener('DOMContentLoaded', function() {
  const textarea = document.getElementById('content');
  const copyBtn = document.getElementById('copyBtn');
  
  // Get content from URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('text')) {
    try {
      textarea.value = decodeURIComponent(urlParams.get('text'));
    } catch (e) {
      textarea.value = urlParams.get('text');
    }
  } else {
    // Try getting from storage as fallback
    chrome.storage.local.get(['markdownToCopy'], function(result) {
      if (result && result.markdownToCopy) {
        textarea.value = result.markdownToCopy;
      } else {
        textarea.value = "No content available.";
      }
    });
  }
  
  // Select all text initially
  textarea.focus();
  textarea.select();
  
  // Copy button handler
  copyBtn.addEventListener('click', function() {
    textarea.select();
    document.execCommand('copy');
    copyBtn.textContent = '✓ Copied!';
    setTimeout(function() {
      copyBtn.textContent = 'Copy to Clipboard';
    }, 2000);
  });
}); 