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
});

async function initConfig() {
  await chrome.storage.sync.set({ config: await getDnsConfig('bilijump-config.oooo.uno') });
  await chrome.storage.sync.set({ banModels: await getDnsConfig('bilijump-ai-ban-model.oooo.uno') });
}

async function getDnsConfig(dns) {
  let url = `https://dns.google/resolve?name=${encodeURIComponent(dns)}&type=TXT`;
  let configresp = await fetch(url);
  while(!configresp.ok) {
    configresp = await fetch(url);
  }
  let config = await configresp.json();
  let settings = JSON.parse(config?.Answer?.[0]?.data || {});
  return settings;
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

