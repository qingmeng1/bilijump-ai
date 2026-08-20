chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fetchDashScope") {
    fetch(message.url, {
      method: message.method || "POST",
      headers: {
        "Authorization": `Bearer ${message.apiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
        ...(message.ossResourceResolve ? { "X-DashScope-OssResourceResolve": "enable" } : {})
      },
      body: JSON.stringify(message.body)
    })
    .then(response => response.json())
    .then(data => sendResponse({ success: true, data }))
    .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.action === "fetchOpenAI") {
    fetchOpenAI(message.body)
    .then(data => sendResponse({ success: true, data }))
    .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.action === "openApiSettings") {
    openApiSettings(sender.tab?.windowId, sender.tab?.id, message.origin)
    .then(() => sendResponse({ success: true }))
    .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.action === "reloadApiSourceTab") {
    reloadApiSourceTab(message.origin)
    .then(() => sendResponse({ success: true }))
    .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.action === "uploadDashScopeTemp") {
    uploadDashScopeTemp(message.audioUrl, message.apiKey, message.model || "paraformer-v2")
    .then(url => sendResponse({ success: true, url }))
    .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.action === "dbQuery") {
    fetch(message.url, {
      method: message.method || "POST",
      headers: {
        "Authorization": `Bearer ${message.cfApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message.body)
    })
    .then(response => response.json())
    .then(data => sendResponse({ success: true, data }))
    .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.action === "kvQuery") {
    getConfig(message.k)
    .then(data => sendResponse({ success: true, data: data }))
    .catch(error => sendResponse({ success: false, error: error }));
    return true;
  }
});

let apiPermissionReloadInProgress = false;

chrome.permissions.onAdded.addListener(permissions => {
  handleApiPermissionAdded(permissions).catch(error => {
    console.warn("Failed to refresh the API source tab:", error);
  });
});

async function handleApiPermissionAdded(permissions) {
  const grantedOrigins = permissions.origins || [];
  const { apiPermissionOrigin } = await chrome.storage.local.get("apiPermissionOrigin");
  if (apiPermissionOrigin && grantedOrigins.includes(apiPermissionOrigin)) {
    await reloadApiSourceTab(apiPermissionOrigin);
  }
}

async function openApiSettings(windowId, sourceTabId, origin) {
  if (Number.isInteger(sourceTabId) && typeof origin === "string") {
    await chrome.storage.local.set({
      apiPermissionSourceTabId: sourceTabId,
      apiPermissionOrigin: origin
    });
  }

  if (chrome.action?.openPopup) {
    try {
      await chrome.action.openPopup(windowId === undefined ? undefined : { windowId });
      return;
    } catch {
      // Fall back when the toolbar popup cannot be opened programmatically.
    }
  }

  const createOptions = {
    url: chrome.runtime.getURL("popup.html"),
    active: true
  };

  if (Number.isInteger(windowId)) {
    createOptions.windowId = windowId;
  }

  await chrome.tabs.create(createOptions);
}

async function reloadApiSourceTab(origin) {
  if (apiPermissionReloadInProgress) return;
  apiPermissionReloadInProgress = true;
  try {
    const { apiPermissionSourceTabId, apiPermissionOrigin } = await chrome.storage.local.get([
      "apiPermissionSourceTabId",
      "apiPermissionOrigin"
    ]);
    if (!Number.isInteger(apiPermissionSourceTabId) || !apiPermissionOrigin) return;
    if (origin && origin !== apiPermissionOrigin) return;
    if (!await chrome.permissions.contains({ origins: [apiPermissionOrigin] })) return;

    await chrome.storage.local.remove(["apiPermissionSourceTabId", "apiPermissionOrigin"]);
    await chrome.tabs.reload(apiPermissionSourceTabId);
  } finally {
    apiPermissionReloadInProgress = false;
  }
}

async function fetchOpenAI(body) {
  const stored = await chrome.storage.sync.get(['apiURL', 'apiKey', 'config']);
  const url = new URL(stored.apiURL ?? stored.config?.apiURL);
  const apiKey = stored.apiKey ?? stored.config?.apiKey;
  if (url.protocol !== "https:") throw new Error("Only HTTPS API URLs are supported");

  const origin = `${url.protocol}//${url.hostname}/*`;
  if (!await chrome.permissions.contains({ origins: [origin] })) {
    throw new Error(`Missing API access permission for ${origin}. Grant it in the extension settings.`);
  }

  const response = await fetch(url.href, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`API request failed (${response.status}): ${data.error?.message || data.message || response.statusText}`);
  }
  return data;
}

async function uploadDashScopeTemp(audioUrl, apiKey, model) {
  const sourceUrl = new URL(audioUrl);
  if (!/(^|\.)bilivideo\.(com|cn)$/i.test(sourceUrl.hostname)) {
    throw new Error("Unsupported Bilibili audio host");
  }

  await ensureBilibiliAudioHeaders();
  const audioResponse = await fetch(sourceUrl.href, { method: "GET", cache: "no-store" });
  if (!audioResponse.ok) {
    throw new Error(`Bilibili audio download failed: ${audioResponse.status}`);
  }

  const audioBlob = await audioResponse.blob();
  const policyResponse = await fetch(
    `https://dashscope.aliyuncs.com/api/v1/uploads?action=getPolicy&model=${encodeURIComponent(model)}`,
    { headers: { "Authorization": `Bearer ${apiKey}` } }
  );
  if (!policyResponse.ok) {
    throw new Error(`DashScope upload policy failed: ${policyResponse.status}`);
  }

  const policyResult = await policyResponse.json();
  const policy = policyResult.data;
  if (!policy?.upload_host || !policy?.upload_dir) {
    throw new Error(policyResult.message || "Invalid DashScope upload policy");
  }

  const maxBytes = Number(policy.max_file_size_mb) * 1024 * 1024;
  if (Number.isFinite(maxBytes) && maxBytes > 0 && audioBlob.size > maxBytes) {
    throw new Error(`Audio file exceeds DashScope temporary upload limit (${policy.max_file_size_mb} MB)`);
  }

  const uploadHost = new URL(policy.upload_host);
  if (uploadHost.protocol !== "https:" || !uploadHost.hostname.endsWith(".aliyuncs.com")) {
    throw new Error("Invalid DashScope upload host");
  }

  const fileName = `${crypto.randomUUID()}.m4a`;
  const key = `${policy.upload_dir}/${fileName}`;
  const form = new FormData();
  form.append("OSSAccessKeyId", policy.oss_access_key_id);
  form.append("Signature", policy.signature);
  form.append("policy", policy.policy);
  form.append("x-oss-object-acl", policy.x_oss_object_acl);
  form.append("x-oss-forbid-overwrite", policy.x_oss_forbid_overwrite);
  form.append("key", key);
  form.append("success_action_status", "200");
  form.append("file", audioBlob, fileName);

  const uploadResponse = await fetch(uploadHost.href, { method: "POST", body: form });
  if (!uploadResponse.ok) {
    throw new Error(`DashScope temporary upload failed: ${uploadResponse.status}`);
  }

  return `oss://${key}`;
}

async function ensureBilibiliAudioHeaders() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [{
          header: "Referer",
          operation: "set",
          value: "https://www.bilibili.com/"
        }]
      },
      condition: {
        regexFilter: "^https?://[^/]+\\.bilivideo\\.(com|cn)/",
        resourceTypes: ["xmlhttprequest"]
      }
    }]
  });
}

async function initConfig() {
  const [config, banModels] = await Promise.all([
    getConfig('bilijump-config'),
    getConfig('bilijump-ai-ban-model')
  ]);

  await chrome.storage.sync.set({
    config: config ?? {
      "aliApiKey": "",
      "aliApiURL": "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription",
      "aliTaskURL": "https://dashscope.aliyuncs.com/api/v1/tasks/",
      "apiKey": "",
      "apiModel": "",
      "apiURL": "",
      "audioEnabled": true,
      "autoAudio": false,
      "autoJump": false,
      "cfApiKey": "Dmlpe9TkvsvBCE0N-FkqeRkN5ANCyHTnUSnAtGCH",
      "cfApiURL": "https://api.cloudflare.com/client/v4/accounts/34c49ed8e1d2bd41c330fb65de4c5890/d1/database/c1ad567a-2375-49b4-83e2-d1de52a0902f/query",
      "enabled": true
    },
    banModels: banModels ?? ["glm-4-flash"]
  });
}

async function getConfig(k) {
  let url = `https://api.cloudflare.com/client/v4/accounts/34c49ed8e1d2bd41c330fb65de4c5890/storage/kv/namespaces/1c7e51cc9ae546748c5afc55df196f85/values/${encodeURIComponent(k)}`;
  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch(url, { headers: { "Authorization": `Bearer Dmlpe9TkvsvBCE0N-FkqeRkN5ANCyHTnUSnAtGCH`, "Content-Type": "application/json"} });
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Ignore errors to allow for retry
    }
  }
  return null;
}

async function loadPrompt() {
  const promptURL = chrome.runtime.getURL('prompt.txt');
  const response = await fetch(promptURL);
  while(!response.ok) {
    response = await fetch(promptURL);
  }
  const promptText = await response.text();
  await chrome.storage.sync.set({ prompt: promptText });
}

chrome.runtime.onInstalled.addListener(async () => {
  let uid = await chrome.storage.sync.get('uid');
  if(!uid?.uid) {
    chrome.storage.sync.set({uid: crypto.randomUUID()});
  }
  await initConfig();
  await loadPrompt();
});

chrome.runtime.onStartup.addListener(async () => {
  await initConfig();
});
