const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('settings.js reinjection', () => {
  it('can run twice in one extension world', async () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../extension/settings.js'),
      'utf8'
    );
    const context = vm.createContext({});

    expect(() => vm.runInContext(source, context)).not.toThrow();
    expect(() => vm.runInContext(source, context)).not.toThrow();
    expect(vm.runInContext('SettingsUtils.DEFAULT_METADATA_FORMAT', context))
      .toBe('---\nSource: [{title}]({url})');

    const storage = {
      sync: {
        get: jest.fn().mockImplementation(defaults => Promise.resolve(defaults))
      }
    };
    const settings = await context.SettingsUtils.getUserSettings({ storage });

    expect(settings.contentScope).toBe('mainContent');
    expect(settings.preserveTables).toBe(true);
  });
});
