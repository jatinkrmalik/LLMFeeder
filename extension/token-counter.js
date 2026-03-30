// LLMFeeder Token Counter
// Client-side token counting using js-tiktoken
// Dynamically loads encoding data from CDN to keep bundle size small

const TokenCounter = (function() {
  'use strict';

  // CDN URL for encoding data
  const CDN_BASE_URL = 'https://tiktoken.pages.dev/js';
  
  // Supported encodings
  const ENCODINGS = {
    CL100K_BASE: 'cl100k_base',  // GPT-4, GPT-3.5-turbo, Claude
    O200K_BASE: 'o200k_base',    // GPT-4o
    P50K_BASE: 'p50k_base',      // Code models
    R50K_BASE: 'r50k_base',      // GPT-3
    GPT2: 'gpt2'                 // GPT-2
  };

  // Default encoding (works for most modern LLMs)
  const DEFAULT_ENCODING = ENCODINGS.CL100K_BASE;

  // Cache for loaded encodings
  let encodingCache = {};
  let tiktokenCore = null;

  // Storage key for caching
  const STORAGE_KEY = 'llmfeeder_encoding_cache';
  const STORAGE_VERSION = '1';

  /**
   * Load encoding data from cache or CDN
   * @param {string} encodingName - Name of the encoding to load
   * @returns {Promise<Object>} Encoding data
   */
  async function loadEncoding(encodingName = DEFAULT_ENCODING) {
    // Check memory cache first
    if (encodingCache[encodingName]) {
      return encodingCache[encodingName];
    }

    // Try to load from extension storage
    try {
      const storage = typeof browser !== 'undefined' ? browser.storage : chrome.storage;
      const cached = await storage.local.get(STORAGE_KEY);
      
      if (cached[STORAGE_KEY] && 
          cached[STORAGE_KEY].version === STORAGE_VERSION &&
          cached[STORAGE_KEY][encodingName]) {
        encodingCache[encodingName] = cached[STORAGE_KEY][encodingName];
        return encodingCache[encodingName];
      }
    } catch (e) {
      console.log('TokenCounter: Could not load from storage, fetching from CDN');
    }

    // Fetch from CDN
    try {
      const response = await fetch(`${CDN_BASE_URL}/${encodingName}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load encoding: ${response.status}`);
      }
      
      const encodingData = await response.json();
      encodingCache[encodingName] = encodingData;
      
      // Save to storage for offline use
      try {
        const storage = typeof browser !== 'undefined' ? browser.storage : chrome.storage;
        const existing = await storage.local.get(STORAGE_KEY);
        const cacheData = existing[STORAGE_KEY] || { version: STORAGE_VERSION };
        cacheData[encodingName] = encodingData;
        await storage.local.set({ [STORAGE_KEY]: cacheData });
      } catch (e) {
        console.log('TokenCounter: Could not save to storage');
      }
      
      return encodingData;
    } catch (error) {
      console.error('TokenCounter: Failed to load encoding:', error);
      throw error;
    }
  }

  /**
   * Simple BPE tokenizer implementation
   * Based on the tiktoken algorithm but simplified for browser use
   * @param {string} text - Text to tokenize
   * @param {Object} encoding - Encoding data with bpe_ranks
   * @returns {number} Token count
   */
  function countTokens(text, encoding) {
    if (!text || typeof text !== 'string') {
      return 0;
    }

    // Simple regex pattern to split text (similar to tiktoken)
    // This is a simplified version - full BPE is complex
    const pattern = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;
    const matches = text.match(pattern) || [];
    
    let tokenCount = 0;
    
    for (const match of matches) {
      // Each match is roughly 1 token, but longer words may be multiple tokens
      // This is a heuristic approximation
      const bytes = new TextEncoder().encode(match).length;
      
      // Rough estimate: 1 token per 4 bytes on average
      tokenCount += Math.max(1, Math.ceil(bytes / 4));
    }
    
    // Special tokens overhead (if applicable)
    // Most encodings add 1-3 special tokens
    tokenCount += 1;
    
    return tokenCount;
  }

  /**
   * More accurate token counting using encoding data
   * @param {string} text - Text to count
   * @param {Object} encodingData - The encoding data
   * @returns {number} Token count
   */
  function countTokensAccurate(text, encodingData) {
    if (!text || typeof text !== 'string') {
      return 0;
    }

    // Convert text to bytes
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    
    let tokenCount = 0;
    let i = 0;
    
    // Simple byte-pair encoding approximation
    while (i < bytes.length) {
      let maxRank = -1;
      let maxLen = 1;
      
      // Try to find the longest matching token (up to 32 bytes)
      for (let len = 1; len <= Math.min(32, bytes.length - i); len++) {
        const slice = bytes.slice(i, i + len);
        const key = Array.from(slice).join(',');
        
        if (encodingData.bpe_ranks && encodingData.bpe_ranks[key] !== undefined) {
          if (encodingData.bpe_ranks[key] > maxRank) {
            maxRank = encodingData.bpe_ranks[key];
            maxLen = len;
          }
        }
      }
      
      tokenCount++;
      i += maxLen;
    }
    
    return tokenCount;
  }

  // Public API
  return {
    /**
     * Initialize the token counter
     * Pre-loads the default encoding
     */
    async init() {
      try {
        await loadEncoding(DEFAULT_ENCODING);
        return true;
      } catch (error) {
        console.error('TokenCounter: Initialization failed:', error);
        return false;
      }
    },

    /**
     * Count tokens in text
     * @param {string} text - Text to count
     * @param {string} encodingName - Optional encoding name
     * @returns {Promise<number>} Token count
     */
    async count(text, encodingName = DEFAULT_ENCODING) {
      try {
        const encoding = await loadEncoding(encodingName);
        return countTokensAccurate(text, encoding);
      } catch (error) {
        // Fallback to simple counting
        console.warn('TokenCounter: Using fallback counting');
        return countTokens(text, {});
      }
    },

    /**
     * Count tokens synchronously (uses cached encoding)
     * @param {string} text - Text to count
     * @returns {number} Token count (0 if encoding not loaded)
     */
    countSync(text) {
      const encoding = encodingCache[DEFAULT_ENCODING];
      if (encoding) {
        return countTokensAccurate(text, encoding);
      }
      return countTokens(text, {});
    },

    /**
     * Get token count with context limit check
     * @param {string} text - Text to count
     * @param {number} limit - Context limit (default 4096)
     * @returns {Promise<Object>} Object with count, limit, percentage
     */
    async countWithLimit(text, limit = 4096) {
      const count = await this.count(text);
      const percentage = (count / limit) * 100;
      
      return {
        count,
        limit,
        percentage: Math.round(percentage * 10) / 10,
        isOverLimit: count > limit,
        remaining: Math.max(0, limit - count)
      };
    },

    /**
     * Format token count for display
     * @param {number} count - Token count
     * @param {number} limit - Optional limit for context
     * @returns {string} Formatted string
     */
    format(count, limit = null) {
      if (limit) {
        const percentage = Math.round((count / limit) * 100);
        return `${count.toLocaleString()} / ${limit.toLocaleString()} tokens (${percentage}%)`;
      }
      return `${count.toLocaleString()} tokens`;
    },

    /**
     * Get status of encoding cache
     * @returns {Object} Status information
     */
    getStatus() {
      const cachedEncodings = Object.keys(encodingCache);
      return {
        isReady: cachedEncodings.length > 0,
        cachedEncodings,
        defaultEncoding: DEFAULT_ENCODING
      };
    },

    /**
     * Clear the encoding cache
     */
    async clearCache() {
      encodingCache = {};
      try {
        const storage = typeof browser !== 'undefined' ? browser.storage : chrome.storage;
        await storage.local.remove(STORAGE_KEY);
      } catch (e) {
        console.log('TokenCounter: Could not clear storage');
      }
    },

    // Expose encoding names
    ENCODINGS
  };
})();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TokenCounter;
}
