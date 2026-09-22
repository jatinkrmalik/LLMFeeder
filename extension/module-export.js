(function () {
  'use strict';

  const browserAPI = typeof browser !== 'undefined'
    ? browser
    : {
        runtime: {
          sendMessage: message => new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, response => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else resolve(response);
            });
          }),
          onMessage: chrome.runtime.onMessage
        },
        storage: {
          sync: {
            get: keys => new Promise((resolve, reject) => {
              chrome.storage.sync.get(keys, result => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else resolve(result);
              });
            })
          }
        }
      };
  const params = new URLSearchParams(window.location.search);
  const sourceTabId = Number(params.get('sourceTabId'));
  const moduleUrl = params.get('moduleUrl') || '';
  const exportId = `module-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const startButton = document.getElementById('startExportBtn');
  const cancelButton = document.getElementById('cancelExportBtn');
  const progress = document.getElementById('exportProgress');
  const errors = document.getElementById('exportErrors');
  const moduleName = document.getElementById('moduleName');
  let directoryHandle;
  let zip;
  let fileCount = 0;
  let running = false;
  let overwriteConfirmed = false;
  const pendingWrites = new Set();

  moduleName.textContent = moduleUrl
    ? `Source: ${new URL(moduleUrl).pathname.split('/').filter(Boolean).pop()}`
    : 'Choose an output folder to export this module\'s units as Markdown files.';

  function sendMessage(message) {
    return Promise.resolve(browserAPI.runtime.sendMessage(message));
  }

  function setStatus(message) {
    progress.textContent = message;
  }

  async function getSettings() {
    return SettingsUtils.getUserSettings({ storage: browserAPI.storage });
  }

  async function discoverUrls() {
    const response = await sendMessage({ action: 'discoverModuleUnits', sourceTabId });
    if (!response || !response.success) throw new Error(response?.error || 'Could not discover module units');
    return response;
  }

  async function hasExistingFiles(handle, filenames) {
    const expectedNames = new Set(filenames);
    let count = 0;
    for await (const [name] of handle.entries()) {
      if (expectedNames.has(name)) count++;
    }
    return count;
  }

  async function writeFile(filename, markdown) {
    if (directoryHandle) {
      try {
        await directoryHandle.getFileHandle(filename, { create: false });
        if (!overwriteConfirmed) throw new Error(`File appeared during export: ${filename}`);
      } catch (error) {
        if (error.message.startsWith('File appeared during export:')) throw error;
        if (error.name !== 'NotFoundError') throw error;
      }
      const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(markdown);
      await writable.close();
      return;
    }
    zip.file(filename, markdown);
    fileCount++;
  }

  async function finishZip() {
    if (!zip || fileCount === 0) return;
    const blob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'llmfeeder-learn-module.zip';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function startExport() {
    if (running) return;
    running = true;
    startButton.disabled = true;
    cancelButton.classList.remove('hidden');
    errors.textContent = '';

    try {
      if (typeof window.showDirectoryPicker === 'function') {
        directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      } else {
        zip = new JSZip();
        setStatus('Folder access is unavailable; preparing a ZIP download...');
      }

      const discovery = await discoverUrls();
      const urls = discovery.urls;
      const filenames = ModuleExportUtils.expectedFilenames(discovery.title, urls);
      const collisions = ModuleExportUtils.findFilenameCollisions(filenames);
      if (collisions.length) throw new Error(`Filename collision: ${collisions.join(', ')}`);
      if (directoryHandle) {
        const existingCount = await hasExistingFiles(directoryHandle, filenames);
        if (existingCount && !window.confirm(`${existingCount} Markdown file(s) already exist in this folder. Replace them?`)) {
          throw new Error('Export cancelled before writing files');
        }
        overwriteConfirmed = existingCount > 0;
      }

      await sendMessage({
        action: 'startModuleExport',
        exportId,
        sourceTabId,
        moduleUrl,
        urls,
        settings: await getSettings()
      });
      setStatus(`Starting export of ${urls.length} units...`);
    } catch (error) {
      running = false;
      startButton.disabled = false;
      cancelButton.classList.add('hidden');
      setStatus(error.name === 'AbortError' ? 'Export cancelled' : `Error: ${error.message}`);
    }
  }

  async function cancelExport() {
    await sendMessage({ action: 'cancelModuleExport', exportId });
    setStatus('Cancelling...');
    cancelButton.disabled = true;
  }

  browserAPI.runtime.onMessage.addListener((message) => {
    if (!message || message.action !== 'moduleExportEvent' || message.exportId !== exportId) return;
    if (message.type === 'file') {
      const writePromise = writeFile(message.filename, message.markdown)
        .then(() => setStatus(`Received ${message.index + 1} of ${message.total} units...`))
        .catch(error => { errors.textContent += `${message.filename}: ${error.message}\n`; });
      pendingWrites.add(writePromise);
      writePromise.finally(() => pendingWrites.delete(writePromise));
    } else if (message.type === 'error') {
      errors.textContent += `Unit ${message.index + 1}: ${message.error}\n`;
    } else if (message.type === 'progress') {
      setStatus(`${message.completed} of ${message.total} units processed`);
    } else if (message.type === 'complete' || message.type === 'cancelled') {
      Promise.all([...pendingWrites]).then(() => finishZip()).catch(error => {
        errors.textContent += `${error.message}\n`;
      }).finally(() => {
        running = false;
        startButton.disabled = false;
        cancelButton.classList.add('hidden');
        setStatus(message.type === 'complete' ? 'Export complete' : 'Export cancelled');
      });
    } else if (message.type === 'fatalError') {
      running = false;
      startButton.disabled = false;
      cancelButton.classList.add('hidden');
      setStatus(`Error: ${message.error}`);
    }
  });

  startButton.addEventListener('click', startExport);
  cancelButton.addEventListener('click', cancelExport);
})();
