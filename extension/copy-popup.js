// Copy popup functionality
document.addEventListener('DOMContentLoaded', async () => {
  // Get the markdown content from storage
  const textarea = document.getElementById('markdownContent');
  const copyBtn = document.getElementById('copyBtn');
  const status = document.getElementById('status');
  
  try {
    // Use local storage to be compatible with all browsers
    chrome.storage.local.get(['markdownToCopy'], (result) => {
      if (result.markdownToCopy) {
        textarea.value = result.markdownToCopy;
      } else {
        textarea.value = 'No content available. Please try again.';
      }
    });
  } catch (error) {
    console.error('Failed to get content from storage:', error);
    textarea.value = 'Error accessing storage. Please try again.';
  }
  
  // Handle copy button click
  copyBtn.addEventListener('click', () => {
    textarea.select();
    document.execCommand('copy');
    
    // Show success message
    status.style.display = 'block';
    
    // Hide after 3 seconds
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
  });
  
  // Select the text automatically
  setTimeout(() => {
    textarea.focus();
    textarea.select();
  }, 500);
}); 