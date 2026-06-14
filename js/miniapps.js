/* -------------------------------------------------------------
   Miniapps AI – Host Adapter that persists files in IndexedDB
   ------------------------------------------------------------- */
(function (global) {
  // -------------------------------------------------------------------------
  // 1️⃣  CONFIGURATION & CONSTANTS
  // -------------------------------------------------------------------------
  const DB_NAME = "miniappsAIFileDB";
  const DB_VERSION = 1;
  const STORE_NAME = "files";

  // Keys used for the tiny shared‑storage pieces that are NOT files
  const PREFIX = "miniappsAI_storage";
  const FILE_PREFIX = "miniappsAI_file";

  // -------------------------------------------------------------------------
  // 2️⃣  OPEN / INITIALISE IndexedDB
  // -------------------------------------------------------------------------
  let db; // will be populated once the DB is ready

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const database = e.target.result;
        // Object store for file metadata / small blobs
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, {
            keyPath: "id", // we’ll use auto‑generated keys
          });
          // Store all regular fields we need; indexes are optional but handy
          store.createIndex("fileId", "fileId", { unique: true });
        }
      };
      request.onsuccess = () => {
        db = request.result;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  // -------------------------------------------------------------------------
  // 3️⃣  BASIC IndexedDB CRUD helpers (promise‑based)
  // -------------------------------------------------------------------------
  function tx(storeName, mode = "readwrite") {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  async function addFileRecord(record) {
    return tx(STORE_NAME, "readwrite").add(record);
  }

  function getFileRecord(id) {
    return new Promise((resolve, reject) => {
      const store = db?.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => reject(getReq.error);
    });
  }

  function updateFileRecord(id, updates) {
    return new Promise((resolve, reject) => {
      const store = db?.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (!record) return reject(new Error("File not found"));
        Object.assign(record, updates);
        store.put(record);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  function deleteFileRecord(id) {
    return tx(STORE_NAME, "readwrite").delete(id);
  }

  // -------------------------------------------------------------------------
  // 4️⃣  MINI‑STORAGE HELPERS (sessionStorage / localStorage)
  // -------------------------------------------------------------------------
  function storageGetItem(key, area) {
    const storageKey = (area === "session" ? "session" : "local") + "::" + key;
    if (area === "session") {
      return window.sessionStorage.getItem(storageKey);
    }
    return window.localStorage.getItem(storageKey);
  }

  function storageSetItem(key, value, area) {
    const storageKey = (area === "session" ? "session" : "local") + "::" + key;
    if (area === "session") {
      window.sessionStorage.setItem(storageKey, value);
    } else {
      window.localStorage.setItem(storageKey, value);
    }
  }

  function storageRemoveItem(key, area) {
    const storageKey = (area === "session" ? "session" : "local") + "::" + key;
    if (area === "session") {
      window.sessionStorage.removeItem(storageKey);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  }

  // -------------------------------------------------------------------------
  // 5️⃣  FILE‑UPLOAD HELPERS (store in IndexedDB)
  // -------------------------------------------------------------------------
  function generateId(prefix) {
    // simple UUID‑ish id; good enough for an internal fileId
    return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).substr(2, 6);
  }

  // Read a File as a **dataURL** (base64 string) – needed to embed the file
  // in the metadata we store.  Returns a Promise<string>.
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = e => reject(e);
      fr.readAsDataURL(file);
    });
  }

  /**
   * Store an uploaded file.
   * Returns a Promise that resolves to the SDK‑compatible metadata object.
   */
  function storeUploadedFile(file) {
    return readFileAsDataURL(file).then(dataURL => {
      const fileId = generateId(FILE_PREFIX);
      const meta = {
        id: fileId,                     // IndexedDB primary key
        fileId,                          // SDK‑exposed identifier
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        dataURL,                         // base64 representation (small files)
        lifecycleClass: "temporary",    // default – can be changed later
        temporary: true,
        canPromote: true,
        // Store a *copy* of the file path string if you ever need it (empty here)
        filePath: "",
        publicUrl: dataURL
      };
      // Save to IndexedDB
      return addFileRecord(meta).then(() => meta);
    });
  }

  /**
   * Load a previously uploaded file’s metadata from IndexedDB.
   * Returns a Promise that resolves to the stored object or `null`.
   */
  function loadFileMeta(fileId) {
    return getFileRecord(fileId);
  }

  /**
   * Extract **plain‑text** from a stored file (best‑effort).
   * Only text MIME types are decoded; other types return an empty string.
   */
  function extractFileText(fileId) {
    return loadFileMeta(fileId).then(meta => {
      if (!meta || !meta.dataURL) return "";
      if (!meta.mimeType?.startsWith("text/")) return "";
      return meta.dataURL;
    });
  }

  // -------------------------------------------------------------------------
  // 6️⃣  INDEXEDDB PROMOTION (temporary → durable)
  // -------------------------------------------------------------------------
  function promoteFile(fileId) {
    return loadFileMeta(fileId).then(meta => {
      if (!meta) throw new Error("File not found");
      // Convert to durable
      meta.lifecycleClass = "durable";
      meta.temporary = false;
      meta.canPromote = false;
      return updateFileRecord(fileId, meta).then(() => ({
        fileId,
        lifecycleClass: "durable",
        temporary: false,
        canPromote: false,
      }));
    });
  }

  // -------------------------------------------------------------------------
  // 7️⃣  MAIN ADAPTER – expose as `window.miniappsAIParentAdapter`
  // -------------------------------------------------------------------------
  const adapter = {
    handleRequest(message) {
      // All requests must resolve to an object:
      //   { success, result?, error? }
      return new Promise(resolve => {
        (async () => {
          // -----------------------------------------------------------------
          //   FRAMEWORK SWITCHES (type/action)
          // -----------------------------------------------------------------
          if (!message || !message.type) {
            resolve({ success: false, error: { code: "INVALID_REQUEST", message: "Missing type" } });
            return;
          }

          // --------------------------------------------------------------
          //  ✈  AI CALLS  (≥  miniapp-ai-request → callModel)
          // --------------------------------------------------------------
          if (message.type === "miniapp-tts-request") {
            if (message.action === "speak") {
              const text = message.payload?.text;
              if (!text) {
                resolve({ success: false, error: { code: "INVALID_REQUEST", message: "Missing text" } });
                return;
              }
              const audio = new Audio();
              audio.oncanplay = () => audio.play();
              audio.onerror = () => resolve({ success: false, error: { code: "TTS_FAILED", message: "Audio playback failed" } });
              audio.onended = () => resolve({ success: true, result: null });
              audio.src =  "https://g4f.space/ai/audio/" + encodeURIComponent(text);
              return;
            }
          }

          if (message.type === "miniapp-ai-request") {
            if (message.action === "callModel") {
              console.log("[MiniappsAI] AI request received:", message);
              const payload = message.payload || {};
              const modelId = payload.modelId;
              if (!modelId) {
                resolve({ success: false, error: { code: "INVALID_REQUEST", message: "modelId is required" } });
                return;
              }
              // --------------------------------------------------------------
              //  Build a text prompt from the SDK messages
              // --------------------------------------------------------------
              const materialize = async () => {
                const messages = payload.messages || [];
                const parts = [];

                for (const m of messages) {
                  if (typeof m.content === "string") {
                    parts.push(m.content);
                    continue;
                  }
                  if (!Array.isArray(m.content)) continue;
                  for (const c of m.content) {
                    if (!c) continue;
                    if (c.type === "text" && typeof c.text === "string") {
                      parts.push(c.text);
                    } else if (c.type === "file_id" && typeof c.fileId === "string") {
                      // Async fetch of file content (text only)
                      const txt = await extractFileText(c.fileId);
                      parts.push(txt);
                    } else if (c.type === "image_url" && c.url) {
                      parts.push("[image: " + c.url + "]");
                    } else if (c.type === "audio_url" && c.url) {
                      parts.push("[audio: " + c.url + "]");
                    } else if (c.type === "video_url" && c.url) {
                      parts.push("[video: " + c.url + "]");
                    }
                  }
                }
                return parts.join("\n");
              };

              const g4fSession = localStorage.getItem("g4f_session");
              let prompt = "";
              if (payload.messages && payload.messages.length > 0) {
                const content = payload.messages[0].content || "";
                if (Array.isArray(content)) {
                  prompt = content.find(c => c.inputKey === "prompt")?.text || "";
                }
              }
              if (prompt || ["239ecbe1-5434-47b9-81b5-492f2fab7cf7"].includes(modelId)) {
                prompt = prompt || await materialize();
                fetch("https://g4f.space/api/gen.pollinations/images/generations", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(g4fSession ? { "Authorization": `Bearer ${g4fSession}` } : {})
                    },
                    body: JSON.stringify({
                        model: "flux",
                        prompt
                    }),
                }).then(res => {
                  if (!res.ok) throw new Error(`AI request failed with ${res.status}`);
                  return res.json();
                })
                .then(aiData => {
                    const output = [];
                    if (aiData?.data?.[0]?.url) {
                        output.push({ type: "image_url", url: aiData.data[0].url });
                    }
                    resolve({ success: true, result: { output } });
                })
                .catch(err => {
                    resolve({
                        success: false,
                        error: { code: "AI_CALL_FAILED", message: err && err.message ? err.message : "AI call failed" },
                    });
                });
                return; // early‑return to skip the text‑based call below
              }

              // --------------------------------------------------------------
              //  Call g4f.space/v1/chat/completions
              // --------------------------------------------------------------
              for (const m of payload.messages) {
                if (!Array.isArray(m.content)) continue;
                const parts = [];
                for (const c of m.content) {
                    if (!c) continue;
                    if (c.type === "file_id" && typeof c.fileId === "string") {
                        parts.push({ type: "image_url", url: await extractFileText(c.fileId) });
                    } else {
                        parts.push(c);
                    }
                }
                m.content = parts;
              }
              fetch("https://g4f.space/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(g4fSession ? { "Authorization": `Bearer ${g4fSession}` } : {})
                },
                body: JSON.stringify({
                    messages: payload.messages,
                }),
              })
                .then(res => {
                  if (!res.ok) throw new Error(`AI request failed with ${res.status}`);
                  return res.json();
                })
                .then(aiData => {
                  // Normalise to the SDK shape (output → array of parts)
                  const output = [];
                  if (aiData?.choices?.[0]?.message?.content) {
                    output.push({ type: "text", text: aiData.choices[0].message.content });
                  } else if (aiData?.text) {
                    output.push({ type: "text", text: aiData.text });
                  }
                  resolve({ success: true, result: { output } });
                })
                .catch(err => {
                  resolve({
                    success: false,
                    error: { code: "AI_CALL_FAILED", message: err && err.message ? err.message : "AI call failed" },
                  });
                });
              return; // early‑return to skip other branches
            }

            // --------------------------------------------------------------
            //  List models / Get model (simple fetches)
            // --------------------------------------------------------------
            if (message.type === "miniapp-ai-list-models") {
              fetch("https://g4f.space/v1/models")
                .then(r => {
                  if (!r.ok) throw new Error("model list fetch failed");
                  return r.json();
                })
                .then(json => {
                  // g4f may expose `data` or `models`; pick the first array we see
                  const models = json?.data?.models ?? json?.models ?? [];
                  resolve({ success: true, result: models });
                })
                .catch(err => {
                  resolve({ success: false, error: { code: "MODEL_LIST_FAILED", message: err.message } });
                });
              return;
            }

            if (message.type === "miniapp-ai-get-model") {
              const mid = (message.payload || {}).modelId;
              if (!mid) {
                resolve({ success: false, error: { code: "INVALID_REQUEST", message: "modelId required" } });
                return;
              }
              fetch(`https://g4f.space/v1/models/${encodeURIComponent(mid)}`)
                .then(r => {
                  if (!r.ok) throw new Error("model not found");
                  return r.json();
                })
                .then(json => resolve({ success: true, result: json }))
                .catch(err => {
                  resolve({ success: false, error: { code: "MODEL_NOT_FOUND", message: err.message } });
                });
              return;
            }

            // --------------------------------------------------------------
            //  Unknown AI request
            // --------------------------------------------------------------
            resolve({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Unsupported miniapp-ai action" } });
            return;
          }

          // --------------------------------------------------------------
          //  FILE REQUESTS  (uploadFile, promoteFile)
          // --------------------------------------------------------------
          if (message.type === "miniapp-file-request") {
            if (message.action === "uploadFile") {
              const file = message.payload?.file;
              if (!(file && typeof file === "object" && file.name)) {
                resolve({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid file object" } });
                return;
              }
              storeUploadedFile(file)
                .then(meta => resolve({ success: true, result: meta }))
                .catch(err => resolve({ success: false, error: { code: "FILE_UPLOAD_FAILED", message: err.message } }));
              return;
            }

            if (message.action === "promoteFile") {
              const inObj = message.payload || {};
              const fid = inObj.fileId || inObj.id;
              if (!fid) {
                resolve({ success: false, error: { code: "INVALID_REQUEST", message: "fileId required" } });
                return;
              }
              promoteFile(fid)
                .then(resolved => resolve({ success: true, result: resolved }))
                .catch(err => resolve({ success: false, error: { code: "FILE_NOT_FOUND", message: err.message } }));
              return;
            }

            resolve({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Unsupported file action" } });
            return;
          }

          // --------------------------------------------------------------
          //  STORAGE REQUESTS  (getItem, setItem, removeItem)
          // --------------------------------------------------------------
          if (message.type === "miniapp-storage-request") {
            const area = (message.payload || {}).area || "persistent";
            switch (message.action) {
              case "getItem": {
                const val = storageGetItem(message.payload.key, area);
                resolve({ success: true, result: val });
                return;
              }
              case "setItem": {
                storageSetItem(message.payload.key, message.payload.value, area);
                resolve({ success: true, result: null });
                return;
              }
              case "removeItem": {
                storageRemoveItem(message.payload.key, area);
                resolve({ success: true, result: null });
                return;
              }
              default:
                resolve({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Unknown storage action" } });
            }
            return;
          }

          // --------------------------------------------------------------
          //  CONTEXT / LOCALE (stubbed – keep existing behaviour)
          // --------------------------------------------------------------
          if (message.type === "miniapp-context-request") {
            resolve({
              success: true,
              result: {
                locale: "en-US",
                resolvedLocale: "en-US",
                sourceLocale: "en",
                direction: "ltr",
                availableLocales: ["en-US", "en", "es"],
              },
            });
            return;
          }
          if (message.type === "miniapp-locale-request") {
            resolve({ success: true, result: { locale: "en-US" } });
            return;
          }

          // --------------------------------------------------------------
          //  UNKNOWN REQUEST
          // --------------------------------------------------------------
          resolve({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Unknown request type" } });
        })();
      });
    },
  };

  // Expose globally – you can replace it at runtime if you wish.
  global.miniappsAIParentAdapter = global.miniappsAIParentAdapter || adapter;

  // -------------------------------------------------------------------------
  // 8️⃣  INITIALISATION – open DB once and keep it alive
  // -------------------------------------------------------------------------
  // All subsequent calls will wait for the DB to be ready.
  openDatabase().catch(err => console.error("[MiniappsAI] IndexedDB error:", err));

  // -------------------------------------------------------------------------
  // 9️⃣  OPTIONAL EXPORT (if host runs as a module)
  // -------------------------------------------------------------------------
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { miniappsAIParentAdapter };
  }

})(typeof window !== "undefined" ? window : this);
(function (global) {
  var ADAPTER_GLOBAL = "miniappsAIParentAdapter";

  // Default adapter: replace this with your real host implementation.
  // Your implementation should return a Promise resolving to:
  // { success: true, result: ... }  OR  { success: false, error: { code, message } }
  var defaultAdapter = {
    handleRequest: function (message) {
      console && console.warn("[MiniappsAI] No host adapter installed. Message:", message);
      return Promise.resolve({
        success: false,
        error: { code: "NOT_IMPLEMENTED", message: "Host adapter not installed" }
      });
    }
  };

  // Ensure a global adapter that you can replace
  global[ADAPTER_GLOBAL] = global[ADAPTER_GLOBAL] || defaultAdapter;

  // Helper: transform an adapter response into the iframe-ready response
  function buildIframeResponse(request, adapterResp) {
    var resp = {
      source: "miniapps-ai-sdk",
      version: request && request.version ? request.version : 1,
      requestId: request && request.requestId ? request.requestId : "",
      // Success and payload
    };

    if (!adapterResp || adapterResp.success === false) {
      resp.success = false;
      resp.error = (adapterResp && adapterResp.error) || {
        code: "UNKNOWN_ERROR",
        message: "Unknown error from host"
      };
    } else {
      resp.success = true;
      resp.result = adapterResp.result;
    }

    return resp;
  }

  // Main message handler: routes requests to the adapter and posts back a response
  function onMessage(event) {
    var data = event && event.data;
    console && console.log("[MiniappsAI] Received message:", data);
    if (!data || data.source !== "miniapps-ai-sdk" || !data.requestId) return;

    var adapter = global[ADAPTER_GLOBAL];
    if (!adapter || typeof adapter.handleRequest !== "function") {
      // Fallback if adapter is missing
      var fallback = {
        source: "miniapps-ai-sdk",
        version: data.version || 1,
        requestId: data.requestId,
        success: false,
        error: { code: "NOT_IMPLEMENTED", message: "Host adapter not installed" }
      };
      event.source.postMessage(fallback, "*");
      return;
    }

    // Forward to host adapter
    adapter
      .handleRequest(data)
      .then(function (resp) {
        var framed = buildIframeResponse(data, resp);
        event.source.postMessage(framed, "*");
      })
      .catch(function (err) {
        var framed = {
          source: "miniapps-ai-sdk",
          version: data.version || 1,
          requestId: data.requestId,
          success: false,
          error: {
            code: (err && err.code) || "AI_CALL_FAILED",
            message: (err && err.message) || "Unknown error"
          }
        };
        event.source.postMessage(framed, "*");
      });
  }

  // Install listener
  global.addEventListener("message", onMessage, false);
})(typeof window !== "undefined" ? window : this);