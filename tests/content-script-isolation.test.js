// Guards that the content script does not proxy page HTML over window messages.
// The script is an IIFE, so we load it in jsdom and assert it stays silent.

const fs = require('fs');
const path = require('path');

const CONTENT_SCRIPT = path.join(__dirname, '../extension/content.js');

describe('content script page isolation', () => {
  const source = fs.readFileSync(CONTENT_SCRIPT, 'utf8');

  it('does not register a window message listener', () => {
    expect(source).not.toMatch(/addEventListener\(\s*['"]message['"]/);
    expect(source).not.toMatch(/llmfeeder_extract_content/);
    expect(source).not.toMatch(/event\.source\.postMessage/);
  });

  it('does not echo document HTML in response to page messages', (done) => {
    global.chrome.runtime = {
      onMessage: { addListener: jest.fn() }
    };
    document.body.textContent = 'Secret account balance $42,784.49 and more padding text.';
    require(CONTENT_SCRIPT);

    const onMessage = (event) => {
      if (event.data && event.data.action === 'llmfeeder_extract_content_response') {
        window.removeEventListener('message', onMessage);
        done(new Error('content script should not reply to unsolicited page messages'));
      }
    };

    window.addEventListener('message', onMessage);
    window.postMessage({
      action: 'llmfeeder_extract_content',
      messageId: 'isolation-check'
    }, '*');

    setTimeout(() => {
      window.removeEventListener('message', onMessage);
      done();
    }, 150);
  });
});
