// Shared test environment setup
// jsdom does not provide TextEncoder/TextDecoder, so pull them from Node
const { TextEncoder, TextDecoder } = require('util');

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Minimal mock of the Chrome extension APIs used by the codebase.
// Tests can override individual methods with jest.spyOn() as needed.
global.chrome = {
  storage: {
    local: {
      get: async () => ({}),
      set: async () => {},
      remove: async () => {}
    }
  }
};
