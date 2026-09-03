const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('content.js reinjection', () => {
  it('replaces its long-lived listeners instead of adding duplicates', async () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../extension/content.js'),
      'utf8'
    );
    const windowListeners = new Map();
    const runtimeListeners = new Set();
    const testWindow = {
      location: { href: 'https://example.com/' },
      addEventListener(type, listener) {
        if (!windowListeners.has(type)) windowListeners.set(type, new Set());
        windowListeners.get(type).add(listener);
      },
      removeEventListener(type, listener) {
        if (windowListeners.has(type)) windowListeners.get(type).delete(listener);
      }
    };
    const runtime = {
      lastError: null,
      onMessage: {
        addListener(listener) {
          runtimeListeners.add(listener);
        },
        removeListener(listener) {
          runtimeListeners.delete(listener);
        }
      },
      sendMessage(message, callback) {
        callback({ success: true, bindings: [] });
      }
    };
    const context = vm.createContext({
      chrome: { runtime },
      console,
      document: {},
      navigator: { platform: 'MacIntel' },
      ShortcutUtils: { findMatchingShortcut: () => null },
      window: testWindow
    });

    vm.runInContext(source, context);
    vm.runInContext(source, context);
    await Promise.resolve();

    expect(runtimeListeners.size).toBe(1);
    expect(windowListeners.get('keydown').size).toBe(1);
    expect(windowListeners.get('focus').size).toBe(1);
    expect(windowListeners.get('blur').size).toBe(1);

    context.__llmFeederContentScriptLifecycle.dispose();
    expect(runtimeListeners.size).toBe(0);
    expect(windowListeners.get('keydown').size).toBe(0);
  });
});
