// Utilities shared by the Microsoft Learn module exporter and its tests.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ModuleExportUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function getModulePath(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      return null;
    }
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'learn.microsoft.com') return null;

    const path = `/${parsed.pathname.replace(/^\/+|\/+$/g, '')}`;
    const parts = path.split('/');
    if (parts.length !== 5 || parts[2] !== 'training' || parts[3] !== 'modules') return null;
    return path;
  }

  function isModuleIndexUrl(url) {
    return Boolean(getModulePath(url));
  }

  function discoverUnitLinks(anchors, currentUrl) {
    const modulePath = getModulePath(currentUrl);
    if (!modulePath || !Array.isArray(anchors)) return [];

    const seen = new Set();
    return anchors.reduce((links, anchor) => {
      const href = anchor && anchor.href;
      if (!href) return links;

      let parsed;
      try {
        parsed = new URL(href, currentUrl);
      } catch (error) {
        return links;
      }

      const relativePath = parsed.pathname.replace(/^\/+|\/+$/g, '');
      const expectedPrefix = modulePath.replace(/^\/+/, '') + '/';
      const unitSlug = relativePath.startsWith(expectedPrefix)
        ? relativePath.slice(expectedPrefix.length)
        : '';
      if (parsed.origin !== 'https://learn.microsoft.com' ||
          !/^\d+-[^/]+$/i.test(unitSlug) ||
          parsed.search || parsed.hash) {
        return links;
      }

      const normalized = `https://learn.microsoft.com/${relativePath}`;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        links.push(normalized);
      }
      return links;
    }, []);
  }

  function sanitizeFilename(value) {
    return String(value || 'untitled')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/[\s.]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 100)
      .replace(/_+$/g, '') || 'untitled';
  }

  function filenameForUnitUrl(url, index) {
    let slug = '';
    try {
      slug = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    } catch (error) {
      slug = '';
    }
    return `${String(index + 1).padStart(2, '0')}-${sanitizeFilename(slug)}.md`;
  }

  function filenameForIndexTitle(title) {
    return `00-${sanitizeFilename(title || 'index')}.md`;
  }

  function isModuleUnitUrl(url, moduleUrl) {
    const modulePath = getModulePath(moduleUrl);
    if (!modulePath) return false;

    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      return false;
    }

    const relativePath = parsed.pathname.replace(/^\/+|\/+$/g, '');
    const expectedPrefix = modulePath.replace(/^\/+/, '') + '/';
    return parsed.protocol === 'https:' &&
      parsed.hostname.toLowerCase() === 'learn.microsoft.com' &&
      parsed.origin === 'https://learn.microsoft.com' &&
      !parsed.search &&
      !parsed.hash &&
      relativePath.startsWith(expectedPrefix) &&
      /^\d+-[^/]+$/i.test(relativePath.slice(expectedPrefix.length));
  }

  function expectedFilenames(moduleTitle, urls) {
    return [
      filenameForIndexTitle(moduleTitle),
      ...urls.map((url, index) => filenameForUnitUrl(url, index))
    ];
  }

  function findFilenameCollisions(filenames) {
    const counts = new Map();
    filenames.forEach(filename => counts.set(filename, (counts.get(filename) || 0) + 1));
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([filename]) => filename);
  }

  function validateMarkdown(markdown, url) {
    if (typeof markdown !== 'string' || !markdown.trim()) {
      return { valid: false, error: 'Conversion produced empty Markdown' };
    }

    const preciseMarkers = [
      'Please sign in to view this page',
      'Sign in to use Ask Learn',
      'Conversion timed out. The page might be too large.',
      'Content was truncated due to size limitations.',
      'No content could be extracted from this page.'
    ];
    if (preciseMarkers.some(marker => markdown.toLowerCase().includes(marker.toLowerCase()))) {
      return { valid: false, error: 'Conversion returned a sign-in, error, or incomplete page' };
    }

    if (/\/training\/modules\/[^/]+\/\d+-knowledge-check\/?$/i.test(url || '')) {
      const questionCount = (markdown.match(/^### Question \d+\s*$/gim) || []).length;
      const choicesCount = (markdown.match(/^\*\*Answer choices\*\*\s*$/gim) || []).length;
      if (questionCount === 0 || choicesCount < questionCount || markdown.trim().length < 100) {
        return { valid: false, error: 'Knowledge-check content was not fully formatted' };
      }
    }

    return { valid: true };
  }

  function validateExportRequest(request) {
    if (!request || typeof request !== 'object') return { valid: false, error: 'Invalid export request' };
    if (typeof request.exportId !== 'string' || !request.exportId.trim()) {
      return { valid: false, error: 'Invalid export ID' };
    }
    if (!Number.isInteger(request.sourceTabId) || request.sourceTabId < 0) {
      return { valid: false, error: 'Invalid source tab ID' };
    }
    if (!isModuleIndexUrl(request.moduleUrl)) {
      return { valid: false, error: 'Invalid Microsoft Learn module URL' };
    }
    if (!Array.isArray(request.urls) || request.urls.length === 0 ||
        request.urls.some(url => !isModuleUnitUrl(url, request.moduleUrl))) {
      return { valid: false, error: 'Invalid Microsoft Learn module unit URL' };
    }
    if (!request.settings || typeof request.settings !== 'object' || Array.isArray(request.settings)) {
      return { valid: false, error: 'Invalid export settings' };
    }
    return { valid: true };
  }

  return {
    getModulePath,
    isModuleIndexUrl,
    isModuleUnitUrl,
    discoverUnitLinks,
    filenameForUnitUrl,
    filenameForIndexTitle,
    expectedFilenames,
    findFilenameCollisions,
    validateMarkdown,
    validateExportRequest
  };
});
