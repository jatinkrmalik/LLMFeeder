// Unit tests for extension/token-counter.js
//
// TokenCounter is an IIFE singleton with internal caches, so each test
// gets a fresh copy via jest.resetModules(). Chrome storage APIs come
// from the mock in tests/setup.js; fetch is mocked per test.

describe('TokenCounter', () => {
  let TokenCounter;

  // Encoding with no BPE merges: every byte counts as one token
  const emptyEncoding = { bpe_ranks: {} };

  function mockFetchWith(encodingData) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => encodingData
    });
  }

  function mockFetchFailure() {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
  }

  beforeEach(() => {
    jest.resetModules();
    TokenCounter = require('../extension/token-counter.js');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  describe('count()', () => {
    it('counts one token per byte when the encoding has no BPE merges', async () => {
      mockFetchWith(emptyEncoding);

      const count = await TokenCounter.count('hi');

      expect(count).toBe(2);
      expect(fetch).toHaveBeenCalledWith(
        'https://tiktoken.pages.dev/js/cl100k_base.json'
      );
    });

    it('merges bytes into a single token when a BPE rank matches', async () => {
      // "hi" is bytes [104, 105]; rank the pair so it merges to one token
      mockFetchWith({ bpe_ranks: { '104,105': 1 } });

      const count = await TokenCounter.count('hi');

      expect(count).toBe(1);
    });

    it('returns 0 for empty or non-string input', async () => {
      mockFetchWith(emptyEncoding);

      expect(await TokenCounter.count('')).toBe(0);
      expect(await TokenCounter.count(null)).toBe(0);
      expect(await TokenCounter.count(undefined)).toBe(0);
    });

    it('falls back to heuristic counting when the encoding cannot be loaded', async () => {
      mockFetchFailure();

      // Heuristic: "hi" is one word of 2 bytes -> 1 token, +1 special token
      const count = await TokenCounter.count('hi');

      expect(count).toBe(2);
    });

    it('uses the encoding cached in chrome.storage without fetching', async () => {
      global.fetch = jest.fn();
      jest.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        llmfeeder_encoding_cache: {
          version: '1',
          cl100k_base: emptyEncoding
        }
      });

      const count = await TokenCounter.count('hi');

      expect(count).toBe(2);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('saves a freshly fetched encoding to chrome.storage', async () => {
      mockFetchWith(emptyEncoding);
      const setSpy = jest.spyOn(chrome.storage.local, 'set');

      await TokenCounter.count('hi');

      expect(setSpy).toHaveBeenCalledWith({
        llmfeeder_encoding_cache: expect.objectContaining({
          version: '1',
          cl100k_base: emptyEncoding
        })
      });
    });

    it('fetches the encoding only once for repeated calls', async () => {
      mockFetchWith(emptyEncoding);

      await TokenCounter.count('first');
      await TokenCounter.count('second');

      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('countSync()', () => {
    it('uses the heuristic when no encoding is cached', () => {
      expect(TokenCounter.countSync('hi')).toBe(2);
      expect(TokenCounter.countSync('')).toBe(0);
    });

    it('uses the cached encoding after count() has loaded it', async () => {
      mockFetchWith(emptyEncoding);
      await TokenCounter.count('warm up');

      expect(TokenCounter.countSync('hi')).toBe(2);
    });
  });

  describe('countWithLimit()', () => {
    it('reports usage against the limit', async () => {
      mockFetchWith(emptyEncoding);

      // "hi" counts as 2 tokens against a limit of 4
      const result = await TokenCounter.countWithLimit('hi', 4);

      expect(result).toEqual({
        count: 2,
        limit: 4,
        percentage: 50,
        isOverLimit: false,
        remaining: 2
      });
    });

    it('flags text that exceeds the limit', async () => {
      mockFetchWith(emptyEncoding);

      const result = await TokenCounter.countWithLimit('hello', 3);

      expect(result.isOverLimit).toBe(true);
      expect(result.remaining).toBe(0);
    });
  });

  describe('format()', () => {
    it('formats a plain count', () => {
      expect(TokenCounter.format(500)).toBe('500 tokens');
    });

    it('formats a count with a limit and percentage', () => {
      expect(TokenCounter.format(50, 100)).toBe('50 / 100 tokens (50%)');
    });
  });

  describe('init() and cache management', () => {
    it('init() resolves true when the encoding loads', async () => {
      mockFetchWith(emptyEncoding);

      await expect(TokenCounter.init()).resolves.toBe(true);
    });

    it('init() resolves false when the encoding cannot be loaded', async () => {
      mockFetchFailure();

      await expect(TokenCounter.init()).resolves.toBe(false);
    });

    it('getStatus() reflects whether an encoding is cached', async () => {
      expect(TokenCounter.getStatus()).toEqual({
        isReady: false,
        cachedEncodings: [],
        defaultEncoding: 'cl100k_base'
      });

      mockFetchWith(emptyEncoding);
      await TokenCounter.init();

      const status = TokenCounter.getStatus();
      expect(status.isReady).toBe(true);
      expect(status.cachedEncodings).toContain('cl100k_base');
    });

    it('clearCache() empties the cache and clears chrome.storage', async () => {
      mockFetchWith(emptyEncoding);
      await TokenCounter.init();
      const removeSpy = jest.spyOn(chrome.storage.local, 'remove');

      await TokenCounter.clearCache();

      expect(TokenCounter.getStatus().isReady).toBe(false);
      expect(removeSpy).toHaveBeenCalledWith('llmfeeder_encoding_cache');
    });
  });
});
