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