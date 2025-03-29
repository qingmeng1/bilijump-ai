document.addEventListener('DOMContentLoaded', () => {
    const keys = ['autoJump', 'enabled', 'apiKey', 'apiURL', 'apiModel', 'audioEnabled', 'autoAudio', 'aliApiKey'];
    
    chrome.storage.sync.get(keys, result => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            const apply = defaults => keys.forEach(k => {
                const el = document.getElementById(k);
                const val = result[k] ?? defaults[k] ?? (el.type === 'checkbox' ? false : '');
                el[el.type === 'checkbox' ? 'checked' : 'value'] = val;
                el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', save);
            });

            if (tab?.url.match(/https?:\/\/.*\.bilibili\.com\/video\/.*/)) {
                chrome.tabs.sendMessage(tab.id, { action: 'getDefaultSettings' }, 
                    r => apply(chrome.runtime.lastError ? {} : r?.settings || {}));
            } else {
                apply({});
            }
        });
    });

    const save = debounce(() => {
        const settings = Object.fromEntries(keys.map(k => {
            const el = document.getElementById(k);
            return [k, el.type === 'checkbox' ? el.checked : el.value.trim()];
        }));
        
        chrome.storage.sync.set(settings, () => {
            const s = document.getElementById('status');
            s.textContent = 'Saved';
            s.classList.add('show');
            setTimeout(() => (s.classList.remove('show'), s.textContent = ''), 1000);
        });
    }, 300);
});

const debounce = (fn, wait) => {
    let t;
    return (...args) => (clearTimeout(t), t = setTimeout(() => fn(...args), wait));
};