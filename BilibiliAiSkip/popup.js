document.addEventListener('DOMContentLoaded', async () => {
    const keys = ['autoJump', 'enabled', 'apiKey', 'apiURL', 'apiModel', 'audioEnabled', 'autoAudio', 'aliApiKey'];

    let response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent('bilijump-ai-api-config.oooo.uno')}&type=TXT`);
    let aiconfig = await response.json();
    
    const defaultSettings = JSON.parse(aiconfig?.Answer?.[0]?.data);

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
        
        chrome.storage.sync.set(settings, () => {
            const s = document.getElementById('status');
            s.textContent = 'Saved';
            s.classList.add('show');
            setTimeout(() => (s.classList.remove('show'), s.textContent = ''), 1000);
        });
    }, 300);

    const apiURLInput = document.getElementById('apiURL');
    const apiURLDropdown = document.getElementById('apiURLDropdown');
    const dropdownOptions = apiURLDropdown.querySelectorAll('.dropdown-option');

    apiURLInput.addEventListener('click', (e) => {
        apiURLDropdown.style.display = 'block';
        e.stopPropagation();
    });

    dropdownOptions.forEach(option => {
        option.addEventListener('click', () => {
            apiURLInput.value = option.getAttribute('data-value');
            apiURLDropdown.style.display = 'none';
            save();
        });
    });

    document.addEventListener('click', (e) => {
        if (!apiURLInput.contains(e.target) && !apiURLDropdown.contains(e.target)) {
            apiURLDropdown.style.display = 'none';
        }
    });

    apiURLInput.addEventListener('input', save);

    dropdownOptions.forEach(option => {
        option.addEventListener('click', () => {
            const selectedValue = option.getAttribute('data-value');
            apiURLInput.value = selectedValue;
            apiURLDropdown.style.display = 'none';

            if (option.textContent.trim() === 'free, only gpt-4o-mini') {
                document.getElementById('apiKey').value = defaultSettings?.apiKey;
                document.getElementById('apiURL').value = defaultSettings?.apiURL;
                document.getElementById('apiModel').value = defaultSettings?.apiModel;
            }else {
                document.getElementById('apiKey').value = '';
                document.getElementById('apiModel').value = '';
            }
            save();
        });
    });
});

const debounce = (fn, wait) => {
    let t;
    return (...args) => (clearTimeout(t), t = setTimeout(() => fn(...args), wait));
};