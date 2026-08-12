// Unit tests for extension/multi-tab-utils.js
//
// Covers the tab-selection logic across browsers with different
// tabs.query semantics: compliant ones (Chrome/Firefox) honour the
// `highlighted` filter, while others (e.g. Orion) ignore it and return
// every tab in the window with `highlighted: false`. Also covers the
// content-script presence check: Chrome rejects a message to a tab with
// no receiver, while Orion resolves it with null.

describe('MultiTabUtils.getHighlightedTabs', () => {
  let MultiTabUtils;

  function makeTab(overrides) {
    return {
      id: 1,
      index: 0,
      active: false,
      highlighted: false,
      url: 'https://example.com/',
      ...overrides
    };
  }

  function browserWithQueryResult(tabs) {
    return {
      tabs: {
        query: jest.fn().mockResolvedValue(tabs)
      }
    };
  }

  beforeEach(() => {
    jest.resetModules();
    MultiTabUtils = require('../extension/multi-tab-utils.js');
  });

  it('queries for highlighted tabs in the current window', async () => {
    const browserAPI = browserWithQueryResult([]);

    await MultiTabUtils.getHighlightedTabs(browserAPI);

    expect(browserAPI.tabs.query).toHaveBeenCalledWith({
      highlighted: true,
      currentWindow: true
    });
  });

  it('returns all highlighted tabs on compliant browsers (multi-select)', async () => {
    const browserAPI = browserWithQueryResult([
      makeTab({ id: 1, active: true, highlighted: true, url: 'https://a.example/' }),
      makeTab({ id: 2, highlighted: true, url: 'https://b.example/' }),
      makeTab({ id: 3, highlighted: true, url: 'https://c.example/' })
    ]);

    const tabs = await MultiTabUtils.getHighlightedTabs(browserAPI);

    expect(tabs.map(t => t.id)).toEqual([1, 2, 3]);
  });

  it('returns only the active tab on compliant browsers with no multi-select', async () => {
    const browserAPI = browserWithQueryResult([
      makeTab({ id: 1, active: true, highlighted: true })
    ]);

    const tabs = await MultiTabUtils.getHighlightedTabs(browserAPI);

    expect(tabs.map(t => t.id)).toEqual([1]);
  });

  it('falls back to the active tab when the browser ignores the highlighted filter (Orion)', async () => {
    // Orion returns every tab in the window, all with highlighted: false
    const browserAPI = browserWithQueryResult([
      makeTab({ id: 1, url: 'https://a.example/' }),
      makeTab({ id: 2, url: 'https://b.example/' }),
      makeTab({ id: 3, active: true, url: 'https://c.example/' })
    ]);

    const tabs = await MultiTabUtils.getHighlightedTabs(browserAPI);

    expect(tabs.map(t => t.id)).toEqual([3]);
  });

  it('keeps the active tab even if the browser does not mark it highlighted', async () => {
    const browserAPI = browserWithQueryResult([
      makeTab({ id: 1, active: true, highlighted: false }),
      makeTab({ id: 2, highlighted: true })
    ]);

    const tabs = await MultiTabUtils.getHighlightedTabs(browserAPI);

    expect(tabs.map(t => t.id)).toEqual([1, 2]);
  });

  it('filters out browser internal pages', async () => {
    const browserAPI = browserWithQueryResult([
      makeTab({ id: 1, active: true, highlighted: true, url: 'https://a.example/' }),
      makeTab({ id: 2, highlighted: true, url: 'chrome://settings/' }),
      makeTab({ id: 3, highlighted: true, url: 'edge://flags/' }),
      makeTab({ id: 4, highlighted: true, url: 'about:blank' }),
      makeTab({ id: 5, highlighted: true, url: 'chrome-extension://abc/popup.html' }),
      makeTab({ id: 6, highlighted: true, url: 'moz-extension://abc/popup.html' }),
      makeTab({ id: 7, highlighted: true, url: undefined })
    ]);

    const tabs = await MultiTabUtils.getHighlightedTabs(browserAPI);

    expect(tabs.map(t => t.id)).toEqual([1]);
  });
});

describe('MultiTabUtils.ensureContentScriptLoaded', () => {
  let MultiTabUtils;

  const PONG = { success: true };

  // Builds a browserAPI whose ping responses come from `pingResults`
  // (consumed in order, last one repeats) and whose executeScript is a
  // jest mock. A ping result that is an Error rejects the ping.
  function apiWithPings(pingResults, executeScript) {
    let call = 0;
    return {
      tabs: {
        sendMessage: jest.fn().mockImplementation((tabId, message) => {
          expect(message).toEqual({ action: 'ping' });
          const result = pingResults[Math.min(call++, pingResults.length - 1)];
          return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
        })
      },
      scripting: {
        executeScript: executeScript || jest.fn().mockResolvedValue([{}])
      }
    };
  }

  beforeEach(() => {
    jest.resetModules();
    MultiTabUtils = require('../extension/multi-tab-utils.js');
  });

  it('does not inject when the content script answers the ping', async () => {
    const api = apiWithPings([PONG]);

    const loaded = await MultiTabUtils.ensureContentScriptLoaded(api, 7);

    expect(loaded).toBe(true);
    expect(api.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('injects and retries when the ping rejects (Chrome semantics)', async () => {
    const api = apiWithPings([new Error('Receiving end does not exist'), PONG]);

    const loaded = await MultiTabUtils.ensureContentScriptLoaded(api, 7);

    expect(loaded).toBe(true);
    expect(api.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ['libs/readability.js', 'libs/turndown.js', 'content.js']
    });
  });

  it('injects and retries when the ping resolves null (Orion semantics)', async () => {
    const api = apiWithPings([null, PONG]);

    const loaded = await MultiTabUtils.ensureContentScriptLoaded(api, 7);

    expect(loaded).toBe(true);
    expect(api.scripting.executeScript).toHaveBeenCalledTimes(1);
  });

  it('returns false when injection fails', async () => {
    const api = apiWithPings(
      [null],
      jest.fn().mockRejectedValue(new Error('Cannot access contents of the page'))
    );

    const loaded = await MultiTabUtils.ensureContentScriptLoaded(api, 7);

    expect(loaded).toBe(false);
  });

  it('returns false when the tab stays silent even after injection', async () => {
    const api = apiWithPings([null, null]);

    const loaded = await MultiTabUtils.ensureContentScriptLoaded(api, 7);

    expect(loaded).toBe(false);
  });
});

describe('MultiTabUtils.processMultipleTabs', () => {
  let MultiTabUtils;

  // browserAPI whose sendMessage answers pings with success and
  // convertToMarkdown with the per-tab responses given (an Error rejects)
  function apiConverting(responsesByTabId) {
    return {
      tabs: {
        sendMessage: jest.fn().mockImplementation((tabId, message) => {
          if (message.action === 'ping') {
            return Promise.resolve({ success: true });
          }
          const result = responsesByTabId[tabId];
          return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
        })
      },
      scripting: {
        executeScript: jest.fn().mockResolvedValue([{}])
      }
    };
  }

  beforeEach(() => {
    jest.resetModules();
    MultiTabUtils = require('../extension/multi-tab-utils.js');
  });

  it('collects markdown from every tab that responds', async () => {
    const api = apiConverting({
      1: { success: true, markdown: '# one', tokenCount: 3 },
      2: { success: true, markdown: '# two', tokenCount: 4 }
    });

    const results = await MultiTabUtils.processMultipleTabs(
      [{ id: 1, title: 'one' }, { id: 2, title: 'two' }], {}, api, null
    );

    expect(results.map(r => r.success)).toEqual([true, true]);
    expect(results.map(r => r.markdown)).toEqual(['# one', '# two']);
  });

  it('marks a tab as failed when the response is null instead of crashing (Orion)', async () => {
    const api = apiConverting({
      1: { success: true, markdown: '# one', tokenCount: 3 },
      2: null
    });

    const results = await MultiTabUtils.processMultipleTabs(
      [{ id: 1, title: 'one' }, { id: 2, title: 'two' }], {}, api, null
    );

    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].error).toMatch(/No response from tab/);
  });

  it('marks a tab as failed when it cannot be reached at all', async () => {
    const api = apiConverting({
      1: { success: true, markdown: '# one', tokenCount: 3 }
    });
    // Tab 2 never answers pings and injection fails
    api.tabs.sendMessage.mockImplementation((tabId, message) => {
      if (message.action === 'ping') {
        return tabId === 2 ? Promise.resolve(null) : Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true, markdown: '# one', tokenCount: 3 });
    });
    api.scripting.executeScript.mockRejectedValue(new Error('Cannot access contents of the page'));

    const results = await MultiTabUtils.processMultipleTabs(
      [{ id: 1, title: 'one' }, { id: 2, title: 'two' }], {}, api, null
    );

    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].error).toMatch(/Cannot access this tab/);
  });
});
