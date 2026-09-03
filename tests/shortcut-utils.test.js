describe('ShortcutUtils', () => {
  let ShortcutUtils;

  beforeEach(() => {
    jest.resetModules();
    ShortcutUtils = require('../extension/shortcut-utils.js');
  });

  describe('getAssignedShortcuts', () => {
    it('keeps supported commands with active assignments', () => {
      const bindings = ShortcutUtils.getAssignedShortcuts([
        { name: 'convert_to_markdown', shortcut: 'Alt+Shift+K' },
        { name: 'download_markdown', shortcut: '' },
        { name: 'unknown_command', shortcut: 'Alt+Shift+U' },
        { name: '_execute_action', shortcut: 'Alt+Shift+L' }
      ]);

      expect(bindings).toEqual([
        { command: 'convert_to_markdown', shortcut: 'Alt+Shift+K' },
        { command: '_execute_action', shortcut: 'Alt+Shift+L' }
      ]);
    });

    it('does not invent defaults when command data is unavailable', () => {
      expect(ShortcutUtils.getAssignedShortcuts()).toEqual([]);
      expect(ShortcutUtils.getAssignedShortcuts([])).toEqual([]);
    });
  });

  describe('keyboard event matching', () => {
    function event(overrides) {
      return {
        altKey: true,
        ctrlKey: false,
        metaKey: false,
        shiftKey: true,
        code: 'KeyK',
        isTrusted: true,
        repeat: false,
        target: { tagName: 'BODY', isContentEditable: false },
        ...overrides
      };
    }

    const remapped = [
      { command: 'convert_to_markdown', shortcut: 'Alt+Shift+K' }
    ];

    it('matches the assigned chord and leaves the old default unmatched', () => {
      expect(ShortcutUtils.findMatchingShortcut(remapped, event(), false)).toEqual(remapped[0]);
      expect(ShortcutUtils.findMatchingShortcut(
        remapped,
        event({ code: 'KeyM' }),
        false
      )).toBeNull();
    });

    it('requires an exact modifier match', () => {
      expect(ShortcutUtils.findMatchingShortcut(
        remapped,
        event({ ctrlKey: true }),
        false
      )).toBeNull();
      expect(ShortcutUtils.findMatchingShortcut(
        remapped,
        event({ shiftKey: false }),
        false
      )).toBeNull();
    });

    it('uses event.code when Option changes event.key', () => {
      expect(ShortcutUtils.findMatchingShortcut(
        remapped,
        event({ key: '˚', code: 'KeyK' }),
        true
      )).toEqual(remapped[0]);
    });

    it('matches the macOS glyph form returned by commands.getAll', () => {
      expect(ShortcutUtils.matchesKeyboardEvent('⌥⇧K', event(), true)).toBe(true);
      expect(ShortcutUtils.matchesKeyboardEvent(
        '⌘⇧K',
        event({ altKey: false, metaKey: true }),
        true
      )).toBe(true);
    });

    it('matches macOS glyph forms for punctuation and navigation keys', () => {
      expect(ShortcutUtils.matchesKeyboardEvent(
        '⌥⇧,',
        event({ code: 'Comma' }),
        true
      )).toBe(true);
      expect(ShortcutUtils.matchesKeyboardEvent(
        '⌥⇧.',
        event({ code: 'Period' }),
        true
      )).toBe(true);
      expect(ShortcutUtils.matchesKeyboardEvent(
        '⌥⇧↑',
        event({ code: 'ArrowUp' }),
        true
      )).toBe(true);
    });

    it('maps Ctrl to Command on macOS and MacCtrl to Control', () => {
      expect(ShortcutUtils.matchesKeyboardEvent(
        'Ctrl+Shift+K',
        event({ altKey: false, metaKey: true }),
        true
      )).toBe(true);
      expect(ShortcutUtils.matchesKeyboardEvent(
        'MacCtrl+Shift+K',
        event({ altKey: false, ctrlKey: true }),
        true
      )).toBe(true);
    });

    it('rejects untrusted and repeated events', () => {
      expect(ShortcutUtils.findMatchingShortcut(
        remapped,
        event({ isTrusted: false }),
        false
      )).toBeNull();
      expect(ShortcutUtils.findMatchingShortcut(
        remapped,
        event({ repeat: true }),
        false
      )).toBeNull();
    });

    it.each(['INPUT', 'TEXTAREA', 'SELECT'])('leaves %s controls alone', tagName => {
      expect(ShortcutUtils.findMatchingShortcut(
        remapped,
        event({ target: { tagName, isContentEditable: false } }),
        false
      )).toBeNull();
    });

    it('leaves editable content alone', () => {
      expect(ShortcutUtils.findMatchingShortcut(
        remapped,
        event({ target: { tagName: 'DIV', isContentEditable: true } }),
        false
      )).toBeNull();
    });
  });

  describe('native/fallback arbitration', () => {
    function controlledArbiter() {
      let currentTime = 1000;
      const waits = [];
      const arbiter = ShortcutUtils.createArbiter({
        dedupeMs: 500,
        now: () => currentTime,
        wait: () => new Promise(resolve => waits.push(resolve))
      });

      return {
        arbiter,
        advance(milliseconds) {
          currentTime += milliseconds;
        },
        releaseWait() {
          waits.shift()();
        }
      };
    }

    it('lets a native command cancel a pending fallback', async () => {
      const clock = controlledArbiter();
      const fallbackRun = jest.fn();
      const nativeRun = jest.fn().mockResolvedValue({ success: true });
      const fallback = clock.arbiter.submit('convert_to_markdown', 'fallback', fallbackRun);

      await Promise.resolve();
      clock.advance(20);
      const native = await clock.arbiter.submit('convert_to_markdown', 'native', nativeRun);
      clock.advance(480);
      clock.releaseWait();

      await expect(fallback).resolves.toEqual({ accepted: false });
      expect(native).toEqual({ accepted: true, success: true });
      expect(nativeRun).toHaveBeenCalledTimes(1);
      expect(fallbackRun).not.toHaveBeenCalled();
    });

    it('runs a fallback after the native grace period expires', async () => {
      let currentTime = 1000;
      const execute = jest.fn().mockResolvedValue({ success: true });
      const arbiter = ShortcutUtils.createArbiter({
        dedupeMs: 500,
        now: () => currentTime,
        wait: async milliseconds => {
          currentTime += milliseconds;
        }
      });

      await expect(arbiter.submit('download_markdown', 'fallback', execute))
        .resolves.toEqual({ accepted: true, success: true });
      expect(execute).toHaveBeenCalledTimes(1);

      currentTime += 100;
      await expect(arbiter.submit('download_markdown', 'native', execute))
        .resolves.toEqual({ accepted: false });
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('lets a popup heartbeat cancel the reserved action fallback', async () => {
      const clock = controlledArbiter();
      const execute = jest.fn();
      const fallback = clock.arbiter.submit('_execute_action', 'fallback', execute);

      await Promise.resolve();
      clock.advance(100);
      clock.arbiter.markHandled('_execute_action');
      clock.advance(400);
      clock.releaseWait();

      await expect(fallback).resolves.toEqual({ accepted: false });
      expect(execute).not.toHaveBeenCalled();
    });

    it('does not let an invalid fallback suppress a native command', async () => {
      let currentTime = 1000;
      const execute = jest.fn().mockResolvedValue({ success: true });
      const arbiter = ShortcutUtils.createArbiter({
        dedupeMs: 500,
        now: () => currentTime,
        wait: async milliseconds => {
          currentTime += milliseconds;
        }
      });

      await expect(arbiter.submit(
        'convert_to_markdown',
        'fallback',
        execute,
        async () => ({ error: 'Keyboard shortcut is not assigned' })
      )).resolves.toEqual({
        accepted: false,
        error: 'Keyboard shortcut is not assigned'
      });

      await expect(arbiter.submit('convert_to_markdown', 'native', execute))
        .resolves.toEqual({ accepted: true, success: true });
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('starts an immediate command before returning a promise', async () => {
      const execute = jest.fn().mockResolvedValue({ success: true });
      const arbiter = ShortcutUtils.createArbiter();

      const result = arbiter.submitImmediate('_execute_action', execute);

      expect(execute).toHaveBeenCalledTimes(1);
      await expect(result).resolves.toEqual({ accepted: true, success: true });
    });
  });
});
