// Unit tests for extension/multi-tab-utils.js getHighlightedTabs()
//
// Covers the tab-selection logic across browsers with different
// tabs.query semantics: compliant ones (Chrome/Firefox) honour the
// `highlighted` filter, while others (e.g. Orion) ignore it and return
// every tab in the window with `highlighted: false`.

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
