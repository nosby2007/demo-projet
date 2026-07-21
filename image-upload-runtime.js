/* Shared Firebase Storage image upload helper for product creation forms. */
'use strict';

(function imageUploadRuntime() {
  const MAX_FILES = 8;
  const MAX_SIZE = 5 * 1024 * 1024;
  const EXTENSION_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  const ALLOWED_TYPES = new Set(Object.keys(EXTENSION_BY_TYPE));

  function backend() {
    return window.SokivaFirebase || window.AfroMarketFirebase || null;
  }

  function extensionFor(file) {
    if (EXTENSION_BY_TYPE[file.type]) return EXTENSION_BY_TYPE[file.type];
    const match = /\.([a-z0-9]+)$/i.exec(file.name || '');
    return match ? match[1].toLowerCase() : 'jpg';
  }

  function randomId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function uploadOne(storage, uid, file) {
    if (!ALLOWED_TYPES.has(file.type)) {
      throw new Error(`${file.name} : format non supporté (JPEG, PNG, WEBP ou GIF uniquement).`);
    }
    if (file.size > MAX_SIZE) {
      throw new Error(`${file.name} : image trop volumineuse (5 Mo maximum).`);
    }
    const path = `productImages/${uid}/${randomId()}.${extensionFor(file)}`;
    const fileRef = storage.ref(path);
    await fileRef.put(file, { contentType: file.type });
    return fileRef.getDownloadURL();
  }

  window.SokivaImageUpload = {
    maxFiles: MAX_FILES,
    maxSizeBytes: MAX_SIZE,
    async uploadFiles(fileList, onFileStart) {
      const back = backend();
      const uid = back?.auth?.currentUser?.uid;
      if (!back?.storage || !uid) {
        throw new Error('Connectez-vous pour importer des photos.');
      }
      const files = Array.from(fileList || []).slice(0, MAX_FILES);
      const urls = [];
      for (const file of files) {
        if (typeof onFileStart === 'function') onFileStart(file);
        urls.push(await uploadOne(back.storage, uid, file));
      }
      return urls;
    }
  };
})();
