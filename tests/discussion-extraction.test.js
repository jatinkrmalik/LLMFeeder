// Discussion-page extraction (fixes #114): Reddit threads and Hacker News
// are not article-shaped, so Readability discards the actual content
// (comments) by design. These tests drive the full conversion path through
// the content script's runtime message handler against jsdom fixtures.
//
// Load order mirrors the extension manifest: Readability, Turndown, then the
// shortcut utils the content script expects as globals.

const fs = require('fs');
const path = require('path');

global.Readability = require('../extension/libs/readability.js');
// Turndown ships as a plain script (no module.exports), so evaluate it in
// the jsdom window where `var TurndownService` becomes a global.
window.eval(fs.readFileSync(path.join(__dirname, '../extension/libs/turndown.js'), 'utf8'));
require('../extension/shortcut-utils.js');

let runtimeListener;
global.chrome.runtime = {
  onMessage: {
    addListener: (listener) => { runtimeListener = listener; },
    removeListener: () => {}
  },
  sendMessage: (message, callback) => {
    if (callback) callback({ success: true, bindings: [] });
  }
};

require('../extension/content.js');

function convert(settings) {
  return new Promise((resolve) => {
    runtimeListener(
      { action: 'convertToMarkdown', settings },
      {},
      (response) => resolve(response)
    );
  });
}

const BASE_SETTINGS = {
  contentScope: 'mainContent',
  preserveTables: true,
  includeImages: true,
  includeTitle: true,
  includeLinks: true,
  includeMetadata: false,
  triggerLazyLoading: false
};

// Reddit new-UI thread: one shreddit-post plus a nested comment tree,
// wrapped in the usual sidebar / nav / footer chrome.
const REDDIT_THREAD_HTML = `
<header><nav><a href="/r/ClaudeCode/">r/ClaudeCode</a> <a href="/">Home</a></nav></header>
<aside>
  <h2>About Community</h2><p>Subreddit rules go here.</p>
  <h2>Related posts</h2><a href="/r/other/comments/1">Some other thread</a>
</aside>
<main>
  <shreddit-post author="op_user" post-title="I still dont understand the difference between">
    <h1 slot="title">I still dont understand the difference between</h1>
    <div slot="text-body"><p>Post body paragraph one.</p><p>Post body paragraph two.</p></div>
  </shreddit-post>
  <div id="comment-tree">
    <shreddit-comment author="alice" depth="0">
      <div slot="comment"><p>First comment text.</p></div>
      <shreddit-comment author="bob" depth="1">
        <div slot="comment"><p>Reply to first comment.</p></div>
      </shreddit-comment>
    </shreddit-comment>
    <shreddit-comment author="carol" depth="0">
      <div slot="comment"><p>Second top-level comment.</p></div>
    </shreddit-comment>
  </div>
</main>
<footer><a href="/privacy">Privacy</a> <a href="/terms">Terms</a></footer>
`;

// Same tree, but comments are flat siblings carrying only a depth attribute
// (covers the case where the tree is not nested in the DOM).
const REDDIT_FLAT_HTML = `
<main>
  <shreddit-post author="op_user" post-title="Flat thread">
    <div slot="text-body"><p>Flat post body.</p></div>
  </shreddit-post>
  <shreddit-comment author="alice" depth="0"><div slot="comment"><p>Flat first comment.</p></div></shreddit-comment>
  <shreddit-comment author="bob" depth="1"><div slot="comment"><p>Flat nested reply.</p></div></shreddit-comment>
  <shreddit-comment author="carol" depth="0"><div slot="comment"><p>Flat second comment.</p></div></shreddit-comment>
</main>
`;

// Hacker News thread page.
const HN_THREAD_HTML = `
<main>
  <table><tr class="athing" id="424242">
    <td class="title"><span class="titleline"><a href="https://example.com/x">HN post title</a></span></td>
  </tr>
  <tr><td class="subtext"><span class="hnuser">hn_op</span></td></tr></table>
  <table class="comment-tree">
    <tr class="athing comtr" id="1">
      <td class="ind"><img src="s.gif" width="0" height="1"></td>
      <td class="default"><div class="comment"><span class="hnuser">dave</span> <span class="commtext">HN comment one.</span></div></td>
    </tr>
    <tr class="athing comtr" id="2">
      <td class="ind"><img src="s.gif" width="40" height="1"></td>
      <td class="default"><div class="comment"><span class="hnuser">erin</span> <span class="commtext">HN nested reply.</span></div></td>
    </tr>
  </table>
</main>
`;

describe('discussion-page extraction (#114)', () => {
  beforeEach(() => {
    document.title = 'I still dont understand the difference between : r/ClaudeCode';
  });

  it('mainContent on a Reddit thread keeps the post body and every comment', async () => {
    document.body.innerHTML = REDDIT_THREAD_HTML;
    const response = await convert(BASE_SETTINGS);

    expect(response.success).toBe(true);
    expect(response.markdown).toContain('Post body paragraph one.');
    expect(response.markdown).toContain('Post body paragraph two.');
    expect(response.markdown).toContain('First comment text.');
    expect(response.markdown).toContain('Reply to first comment.');
    expect(response.markdown).toContain('Second top-level comment.');
    expect(response.markdown).toContain('alice');
    expect(response.markdown).toContain('bob');
    expect(response.markdown).toContain('carol');
  });

  it('mainContent on a Reddit thread drops sidebar / nav / footer chrome', async () => {
    document.body.innerHTML = REDDIT_THREAD_HTML;
    const response = await convert(BASE_SETTINGS);

    expect(response.success).toBe(true);
    expect(response.markdown).not.toContain('Subreddit rules go here.');
    expect(response.markdown).not.toContain('Related posts');
    expect(response.markdown).not.toContain('Some other thread');
  });

  it('preserves comment nesting as nested blockquotes', async () => {
    document.body.innerHTML = REDDIT_THREAD_HTML;
    const response = await convert(BASE_SETTINGS);

    expect(response.success).toBe(true);
    // A reply nested under its parent renders as a doubly-quoted block.
    expect(response.markdown).toMatch(/^> > .*Reply to first comment\./m);
    // Top-level comments are singly quoted.
    expect(response.markdown).toMatch(/^> .*First comment text\./m);
  });

  it('rebuilds the tree from depth attributes when comments are flat siblings', async () => {
    document.body.innerHTML = REDDIT_FLAT_HTML;
    const response = await convert(BASE_SETTINGS);

    expect(response.success).toBe(true);
    expect(response.markdown).toContain('Flat post body.');
    expect(response.markdown).toContain('Flat first comment.');
    expect(response.markdown).toContain('Flat nested reply.');
    expect(response.markdown).toContain('Flat second comment.');
    expect(response.markdown).toMatch(/^> > .*Flat nested reply\./m);
  });

  it('mainContent on a Hacker News thread keeps the post and the comment tree', async () => {
    document.body.innerHTML = HN_THREAD_HTML;
    const response = await convert(BASE_SETTINGS);

    expect(response.success).toBe(true);
    expect(response.markdown).toContain('HN comment one.');
    expect(response.markdown).toContain('HN nested reply.');
    expect(response.markdown).toContain('dave');
    expect(response.markdown).toContain('erin');
    expect(response.markdown).toMatch(/^> > .*HN nested reply\./m);
  });

  it('fullPage strips sidebar and ARIA landmark chrome', async () => {
    document.body.innerHTML = `
      <header role="banner"><a href="/">Site header nav</a></header>
      <nav><a href="/menu">Menu link soup</a></nav>
      <aside><p>Sidebar noise paragraph.</p></aside>
      <div role="complementary"><p>Complementary noise paragraph.</p></div>
      <article><p>Real article paragraph.</p></article>
      <footer role="contentinfo"><a href="/about">Footer link soup</a></footer>
    `;
    const response = await convert({ ...BASE_SETTINGS, contentScope: 'fullPage' });

    expect(response.success).toBe(true);
    expect(response.markdown).toContain('Real article paragraph.');
    expect(response.markdown).not.toContain('Sidebar noise paragraph.');
    expect(response.markdown).not.toContain('Complementary noise paragraph.');
    expect(response.markdown).not.toContain('Menu link soup');
    expect(response.markdown).not.toContain('Footer link soup');
  });
});
