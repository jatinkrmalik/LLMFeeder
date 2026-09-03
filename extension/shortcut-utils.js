// LLMFeeder Keyboard Shortcut Utilities
// Shared parsing and arbitration for native commands and page fallbacks

(function(root) {
  'use strict';

  const SUPPORTED_COMMANDS = new Set([
    '_execute_action',
    'convert_to_markdown',
    'download_markdown',
    'download_zip'
  ]);

  const NAMED_KEY_CODES = {
    comma: 'Comma',
    period: 'Period',
    home: 'Home',
    end: 'End',
    pageup: 'PageUp',
    pagedown: 'PageDown',
    space: 'Space',
    insert: 'Insert',
    delete: 'Delete',
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    medianexttrack: 'MediaTrackNext',
    mediaplaypause: 'MediaPlayPause',
    mediaprevtrack: 'MediaTrackPrevious',
    mediastop: 'MediaStop'
  };

  const GLYPH_MODIFIERS = {
    '⌥': 'Option',
    '⇧': 'Shift',
    '⌘': 'Command',
    '⌃': 'MacCtrl'
  };

  const GLYPH_KEYS = {
    ',': 'Comma',
    '.': 'Period',
    '↑': 'Up',
    '↓': 'Down',
    '←': 'Left',
    '→': 'Right',
    '↖': 'Home',
    '↘': 'End',
    '⇞': 'PageUp',
    '⇟': 'PageDown',
    '⌦': 'Delete',
    '⌫': 'Delete',
    '␣': 'Space'
  };

  function getAssignedShortcuts(commands) {
    if (!Array.isArray(commands)) return [];

    return commands
      .filter(command =>
        command &&
        SUPPORTED_COMMANDS.has(command.name) &&
        typeof command.shortcut === 'string' &&
        command.shortcut.trim()
      )
      .map(command => ({
        command: command.name,
        shortcut: command.shortcut.trim()
      }));
  }

  function keyCodeForToken(token) {
    const lowerToken = token.toLowerCase();

    if (/^[a-z]$/.test(lowerToken)) {
      return `Key${lowerToken.toUpperCase()}`;
    }
    if (/^[0-9]$/.test(lowerToken)) {
      return `Digit${lowerToken}`;
    }
    if (/^f(?:[1-9]|1[0-2])$/.test(lowerToken)) {
      return lowerToken.toUpperCase();
    }
    return NAMED_KEY_CODES[lowerToken] || null;
  }

  function shortcutTokens(shortcut) {
    if (shortcut.includes('+')) {
      return shortcut.split('+').map(part => part.trim()).filter(Boolean);
    }

    const tokens = [];
    let key = '';
    for (const character of shortcut.trim()) {
      if (GLYPH_MODIFIERS[character]) {
        tokens.push(GLYPH_MODIFIERS[character]);
      } else {
        key += character;
      }
    }
    if (key.trim()) {
      tokens.push(GLYPH_KEYS[key.trim()] || key.trim());
    }
    return tokens;
  }

  function parseShortcut(shortcut, isMac) {
    if (typeof shortcut !== 'string' || !shortcut.trim()) return null;

    const parsed = {
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      code: null
    };
    let keyToken = null;

    for (const token of shortcutTokens(shortcut)) {
      switch (token.toLowerCase()) {
        case 'alt':
        case 'option':
          parsed.altKey = true;
          break;
        case 'command':
          parsed.metaKey = true;
          break;
        case 'ctrl':
        case 'control':
          if (isMac) parsed.metaKey = true;
          else parsed.ctrlKey = true;
          break;
        case 'macctrl':
          parsed.ctrlKey = true;
          break;
        case 'search':
          parsed.metaKey = true;
          break;
        case 'shift':
          parsed.shiftKey = true;
          break;
        default:
          if (keyToken) return null;
          keyToken = token;
      }
    }

    if (!keyToken) return null;
    parsed.code = keyCodeForToken(keyToken);
    return parsed.code ? parsed : null;
  }

  function matchesKeyboardEvent(shortcut, event, isMac) {
    const parsed = parseShortcut(shortcut, isMac);
    if (!parsed || !event) return false;

    const codeMatches = event.code === parsed.code ||
      (parsed.code === 'Delete' && event.code === 'Backspace');

    return Boolean(event.altKey) === parsed.altKey &&
      Boolean(event.ctrlKey) === parsed.ctrlKey &&
      Boolean(event.metaKey) === parsed.metaKey &&
      Boolean(event.shiftKey) === parsed.shiftKey &&
      codeMatches;
  }

  function findMatchingShortcut(bindings, event, isMac) {
    if (!Array.isArray(bindings) || !event || event.isTrusted !== true || event.repeat) {
      return null;
    }

    const target = event.target;
    if (target && (target.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || ''))) {
      return null;
    }

    return bindings.find(binding =>
      binding && matchesKeyboardEvent(binding.shortcut, event, isMac)
    ) || null;
  }

  function createArbiter(options) {
    const config = options || {};
    const dedupeMs = config.dedupeMs === undefined ? 500 : config.dedupeMs;
    const now = config.now || (() => Date.now());
    const wait = config.wait || (milliseconds =>
      new Promise(resolve => setTimeout(resolve, milliseconds))
    );
    const recentTriggers = new Map();

    function accept(command) {
      const acceptedAt = now();
      const previous = recentTriggers.get(command);
      if (previous !== undefined && acceptedAt - previous < dedupeMs) {
        return false;
      }
      recentTriggers.set(command, acceptedAt);
      return true;
    }

    async function submit(command, source, execute, validate, fallbackDelayMs) {
      if (!SUPPORTED_COMMANDS.has(command)) {
        return { accepted: false, error: 'Unknown keyboard command' };
      }

      const validationPromise = validate
        ? Promise.resolve().then(validate)
        : Promise.resolve(true);

      if (source === 'fallback') {
        const candidateStartedAt = now();
        await wait(fallbackDelayMs === undefined ? dedupeMs : fallbackDelayMs);

        // Native commands get the full grace period. Compare with the time at
        // which the candidate arrived, so timer drift cannot let both paths run.
        const previous = recentTriggers.get(command);
        if (previous !== undefined && previous >= candidateStartedAt - dedupeMs) {
          return { accepted: false };
        }
      }

      const validation = await validationPromise;
      if (validation !== true) {
        return Object.assign({ accepted: false }, validation || {});
      }

      if (!accept(command)) {
        return { accepted: false };
      }

      const result = await execute();
      return Object.assign({ accepted: true }, result || {});
    }

    function submitImmediate(command, execute) {
      if (!SUPPORTED_COMMANDS.has(command)) {
        return Promise.resolve({ accepted: false, error: 'Unknown keyboard command' });
      }
      if (!accept(command)) {
        return Promise.resolve({ accepted: false });
      }

      try {
        // Call execute before the current user-activation task ends. This is
        // required by browsers that only permit action.openPopup() here.
        return Promise.resolve(execute()).then(result =>
          Object.assign({ accepted: true }, result || {})
        );
      } catch (error) {
        return Promise.reject(error);
      }
    }

    function markHandled(command) {
      if (SUPPORTED_COMMANDS.has(command)) {
        recentTriggers.set(command, now());
      }
    }

    return {
      markHandled,
      submit,
      submitImmediate
    };
  }

  const api = {
    SUPPORTED_COMMANDS,
    createArbiter,
    findMatchingShortcut,
    getAssignedShortcuts,
    matchesKeyboardEvent,
    parseShortcut
  };

  root.ShortcutUtils = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
