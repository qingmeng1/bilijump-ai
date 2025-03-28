document.addEventListener('DOMContentLoaded', loadSettings);

function loadSettings() {
    chrome.storage.sync.get(['auto_jump', 'enabled', 'apiKey', 'apiURL', 'apiModel', 'aliApiKey'], function(result) {
        const storedValues = {
            auto_jump: result.auto_jump,
            enabled: result.enabled,
            apiKey: result.apiKey,
            apiURL: result.apiURL,
            apiModel: result.apiModel,
            aliApiKey: result.aliApiKey
        };

        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs[0] && tabs[0].url.match(/https?:\/\/.*\.bilibili\.com\/video\/.*/)) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'getDefaultSettings' }, function(response) {
                    if (chrome.runtime.lastError) {
                        applySettings(storedValues, {});
                        return;
                    }
                    applySettings(storedValues, response ? response.settings : {});
                });
            } else {
                applySettings(storedValues, {});
            }
        });
    });

    document.getElementById('enabled').addEventListener('change', saveSettings);
    document.getElementById('autoJump').addEventListener('change', saveSettings);
    document.getElementById('apiKey').addEventListener('input', saveSettings);
    document.getElementById('apiURL').addEventListener('input', saveSettings);
    document.getElementById('apiModel').addEventListener('input', saveSettings);
    document.getElementById('aliApiKey').addEventListener('input', saveSettings);
}

function applySettings(storedValues, defaultSettings) {
    document.getElementById('autoJump').checked = 
        storedValues.auto_jump !== undefined ? storedValues.auto_jump : 
        defaultSettings.auto_jump !== undefined ? defaultSettings.auto_jump : false;
    
    document.getElementById('enabled').checked = 
        storedValues.enabled !== undefined ? storedValues.enabled : 
        defaultSettings.enabled !== undefined ? defaultSettings.enabled : false;
    
    document.getElementById('apiKey').value = 
        storedValues.apiKey !== undefined ? storedValues.apiKey : 
        defaultSettings.apiKey !== undefined ? defaultSettings.apiKey : '';
    
    document.getElementById('apiURL').value = 
        storedValues.apiURL !== undefined ? storedValues.apiURL : 
        defaultSettings.apiURL !== undefined ? defaultSettings.apiURL : '';
    
    document.getElementById('apiModel').value = 
        storedValues.apiModel !== undefined ? storedValues.apiModel : 
        defaultSettings.apiModel !== undefined ? defaultSettings.apiModel : '';
    
    document.getElementById('aliApiKey').value = 
        storedValues.aliApiKey !== undefined ? storedValues.aliApiKey : 
        defaultSettings.aliApiKey !== undefined ? defaultSettings.aliApiKey : '';
}

function saveSettings() {
    const autoJump = document.getElementById('autoJump').checked;
    const enabled = document.getElementById('enabled').checked;
    const apiKey = document.getElementById('apiKey').value.trim();
    const apiURL = document.getElementById('apiURL').value.trim();
    const apiModel = document.getElementById('apiModel').value.trim();
    const aliApiKey = document.getElementById('aliApiKey').value.trim();
    
    chrome.storage.sync.set({
        auto_jump: autoJump,
        enabled: enabled,
        apiKey: apiKey,
        apiURL: apiURL,
        apiModel: apiModel,
        aliApiKey: aliApiKey
    }, function() {
        const status = document.getElementById('status');
        status.textContent = 'Saved';
        status.classList.add('show');
        setTimeout(() => {
            status.classList.remove('show');
            setTimeout(() => status.textContent = '', 300);
        }, 1000);
    });
}