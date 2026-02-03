document.addEventListener('DOMContentLoaded', async () => {
    const keys = ['autoJump', 'enabled', 'tagFilter', 'apiKey', 'apiURL', 'apiModel', 'audioEnabled', 'autoAudio', 'aliApiKey'];

    let aiconfig = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: "kvQuery",
            k: "bilijump-ai-api-config"
        }, response => {
            if (response.success) {
                resolve(response?.data);
            } else {
                styleLog("Background fetch error: " + response.error);
                reject(new Error(response.error));
            }
        });
    });
    console.log(aiconfig);
    document.getElementById('free').textContent = aiconfig?.apiDesc;

    chrome.storage.sync.get(keys, result => {
        const apply = defaults => keys.forEach(k => {
            const el = document.getElementById(k);
            const val = result[k] ?? defaults[k] ?? (el.type === 'checkbox' ? false : '');
            el[el.type === 'checkbox' ? 'checked' : 'value'] = val;
            el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', save);
        });
        chrome.storage.sync.get('config', result => {
            apply(result?.config || {});
        });
    });

    const save = debounce(() => {
        const settings = Object.fromEntries(keys.map(k => {
            const el = document.getElementById(k);
            return [k, el.type === 'checkbox' ? el.checked : el.value.trim()];
        }));

        if (settings.apiKey && settings.apiURL && settings.apiModel) {
            chrome.storage.sync.get({apiHistory: {}}, res => {
                res.apiHistory[settings.apiKey] = { url: settings.apiURL, model: settings.apiModel };
                chrome.storage.sync.set({ apiHistory: res.apiHistory });
            });
        }
        
        chrome.storage.sync.set(settings, () => {
            chrome.action.setIcon({path: settings.enabled?'icons/icon48_red_3.png':'icons/icon48_blue.png'});
            const s = document.getElementById('status');
            s.textContent = 'Saved';
            s.classList.add('show');
            setTimeout(() => (s.classList.remove('show'), s.textContent = ''), 1000);
        });
    }, 300);

    const apiURLInput = document.getElementById('apiURL');
    const apiURLDrop = document.getElementById('apiURLDropdown');
    const apiKeyInput = document.getElementById('apiKey');
    const apiKeyDrop = document.getElementById('apiKeyDropdown');
    const dropdownOptions = apiURLDrop.querySelectorAll('.dropdown-option');

    apiURLInput.addEventListener('click', (e) => {
        apiURLDrop.style.display = 'block';
        apiKeyDrop.style.display = 'none';
        e.stopPropagation();
    });

    dropdownOptions.forEach(option => {
        option.addEventListener('click', () => {
            apiURLInput.value = option.getAttribute('data-value');
            apiURLDrop.style.display = 'none';
            save();
        });
    });


    apiKeyDrop.addEventListener('click', e => {
        if (e.target.classList.contains('delete-btn')) {
            const option = e.target.closest('.dropdown-option');
            const keyToDelete = option.dataset.k;
            option.remove();
            chrome.storage.sync.get({apiHistory: {}}, res => {
                const h = res.apiHistory;
                if (h[keyToDelete]) {
                    delete h[keyToDelete];
                    chrome.storage.sync.set({ apiHistory: h });
                }
                if (Object.keys(h).length === 0) {
                    apiKeyDrop.style.display = 'none';
                }
            });
            return;
        }

        const t = e.target.closest('.dropdown-option');
        if (t) {
            document.getElementById('apiKey').value = t.dataset.k;
            document.getElementById('apiURL').value = t.dataset.u;
            document.getElementById('apiModel').value = t.dataset.m;
            apiKeyDrop.style.display = 'none';
            save();
        }
    });

    document.addEventListener('click', (e) => {
        if (!apiURLInput.contains(e.target) && !apiURLDrop.contains(e.target)) apiURLDrop.style.display = 'none';
        if (!apiKeyInput.contains(e.target) && !apiKeyDrop.contains(e.target)) apiKeyDrop.style.display = 'none';
    });

    apiURLInput.addEventListener('input', save);

    dropdownOptions.forEach(option => {
        option.addEventListener('click', () => {
            const selectedValue = option.getAttribute('data-value');
            apiURLInput.value = selectedValue;
            apiURLDrop.style.display = 'none';

            if (option.id.trim() === 'free') {
                document.getElementById('apiKey').value = aiconfig?.apiKey;
                document.getElementById('apiURL').value = aiconfig?.apiURL;
                document.getElementById('apiModel').value = aiconfig?.apiModel;
            }else {
                document.getElementById('apiKey').value = '';
                document.getElementById('apiModel').value = '';
            }
            save();
        });
    });

    apiKeyInput.addEventListener('click', e => {
        e.stopPropagation();
        apiURLDrop.style.display = 'none';
        chrome.storage.sync.get({apiHistory: {}}, res => {
            const h = res.apiHistory;
            if (!Object.keys(h).length) return;
            apiKeyDrop.innerHTML = Object.entries(h).reverse().map(([k, v]) => 
            `<div class="dropdown-option" data-k="${k}" data-u="${v.url}" data-m="${v.model}" style="display: flex; align-items: center; padding: 5px 10px; gap: 10px;">
                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;">
                    ${new URL(v.url).host}
                </span>
                <small style="color: #aaa; font-family: monospace; white-space: nowrap; flex-shrink: 0;">
                    ${k.slice(0,7)}...${k.slice(-4)}
                </small>
                <span class="delete-btn" style="color: #999; cursor: pointer; font-size: 18px; line-height: 1; flex-shrink: 0;" title="删除">×</span>
            </div>`
        ).join('');
            apiKeyDrop.style.display = 'block';
        });
    });

});

const debounce = (fn, wait) => {
    let t;
    return (...args) => (clearTimeout(t), t = setTimeout(() => fn(...args), wait));
};
