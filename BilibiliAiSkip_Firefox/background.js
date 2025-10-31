chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fetchDashScope") {
    fetch(message.url, {
      method: message.method || "POST",
      headers: {
        "Authorization": `Bearer ${message.apiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable"
      },
      body: JSON.stringify(message.body)
    })
    .then(response => response.json())
    .then(data => sendResponse({ success: true, data }))
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
  if (message.action === "getPopupConfig") {
    fetch(`https://dns.google/resolve?name=${encodeURIComponent('bilijump-ai-api-config.oooo.uno')}&type=TXT`)
      .then(response => response.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === "fetchTranscription") {
    fetch(message.url)
      .then(response => response.text())
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function initConfig() {
  const [config, banModels] = await Promise.all([
    getDnsConfig('bilijump-config.oooo.uno'),
    getDnsConfig('bilijump-ai-ban-model.oooo.uno')
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

async function getDnsConfig(dns) {
  let url = `https://1.1.1.1/dns-query?name=${encodeURIComponent(dns)}&type=TXT`;
  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch(url, { headers: { "accept": "application/dns-json" } });
      if (response.ok) {
        const config = await response.json();
        const dataString = config?.Answer?.[0]?.data?.replace(/" "/g, "");
        if (dataString) {
          return JSON.parse(JSON.parse(dataString));
        }
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

