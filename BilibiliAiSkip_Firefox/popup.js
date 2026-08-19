document.addEventListener('DOMContentLoaded', () => {
    const keys = ['autoJump', 'enabled', 'tagFilter', 'apiKey', 'apiURL', 'apiModel', 'audioEnabled', 'autoAudio', 'aliApiKey'];
    const apiURLInput = document.getElementById('apiURL');
    const apiURLDropdown = document.getElementById('apiURLDropdown');
    const apiAccessStatus = document.getElementById('apiAccessStatus');
    const freeOption = document.getElementById('free');
    let aiConfig;

    const save = debounce(() => {
        const settings = Object.fromEntries(keys.map(key => {
            const element = document.getElementById(key);
            return [key, element.type === 'checkbox' ? element.checked : element.value.trim()];
        }));

        chrome.storage.sync.set(settings, () => {
            chrome.action.setIcon({path: settings.enabled ? 'icons/icon48_red_3.png' : 'icons/icon48_blue.png'});
            const status = document.getElementById('status');
            status.textContent = 'Saved';
            status.classList.add('show');
            setTimeout(() => (status.classList.remove('show'), status.textContent = ''), 1000);
        });
    }, 300);

    const getApiOrigin = () => {
        try {
            const url = new URL(apiURLInput.value.trim());
            return url.protocol === 'https:' ? `${url.protocol}//${url.hostname}/*` : null;
        } catch {
            return null;
        }
    };

    const updateApiAccessStatus = () => {
        const origin = getApiOrigin();
        if (!origin) {
            apiAccessStatus.textContent = '请输入有效的 HTTPS API URL';
            return;
        }

        chrome.permissions.contains({origins: [origin]}, granted => {
            if (origin === getApiOrigin()) {
                apiAccessStatus.textContent = granted ? `已授权 ${origin}` : `尚未授权 ${origin}`;
            }
        });
    };

    chrome.storage.sync.get(keys, stored => {
        chrome.storage.sync.get('config', result => {
            const defaults = result.config || {};
            keys.forEach(key => {
                const element = document.getElementById(key);
                const value = stored[key] ?? defaults[key] ?? (element.type === 'checkbox' ? false : '');
                element[element.type === 'checkbox' ? 'checked' : 'value'] = value;
                element.addEventListener(element.type === 'checkbox' ? 'change' : 'input', save);
            });
            updateApiAccessStatus();
        });
    });

    chrome.runtime.sendMessage({action: 'kvQuery', k: 'bilijump-ai-api-config'}, response => {
        if (chrome.runtime.lastError || !response?.success) {
            console.warn('Failed to load free API config:', chrome.runtime.lastError?.message || response?.error);
            return;
        }
        aiConfig = response.data;
        freeOption.textContent = aiConfig?.apiDesc || 'free';
    });

    document.getElementById('grantApiAccess').addEventListener('click', () => {
        const origin = getApiOrigin();
        if (!origin) {
            apiAccessStatus.textContent = '请输入有效的 HTTPS API URL';
            return;
        }

        chrome.permissions.request({origins: [origin]}, granted => {
            if (origin !== getApiOrigin()) return;
            if (chrome.runtime.lastError) {
                apiAccessStatus.textContent = `授权失败: ${chrome.runtime.lastError.message}`;
            } else if (granted) {
                apiAccessStatus.textContent = `已授权 ${origin}，正在刷新视频页面`;
                chrome.runtime.sendMessage({action: "reloadApiSourceTab", origin});
            } else {
                apiAccessStatus.textContent = `未授予 ${origin}`;
            }
        });
    });

    apiURLInput.addEventListener('click', event => {
        apiURLDropdown.style.display = 'block';
        event.stopPropagation();
    });
    apiURLInput.addEventListener('input', updateApiAccessStatus);

    apiURLDropdown.addEventListener('click', event => {
        if (event.target.closest('a')) return;
        const option = event.target.closest('.dropdown-option');
        if (!option) return;

        if (option === freeOption) {
            if (!aiConfig) {
                apiAccessStatus.textContent = '免费 API 配置暂不可用';
                return;
            }
            document.getElementById('apiKey').value = aiConfig.apiKey || '';
            apiURLInput.value = aiConfig.apiURL || '';
            document.getElementById('apiModel').value = aiConfig.apiModel || '';
        } else {
            apiURLInput.value = option.dataset.value || '';
            document.getElementById('apiKey').value = '';
            document.getElementById('apiModel').value = '';
        }

        apiURLDropdown.style.display = 'none';
        save();
        updateApiAccessStatus();
    });

    document.addEventListener('click', event => {
        if (!apiURLInput.contains(event.target) && !apiURLDropdown.contains(event.target)) {
            apiURLDropdown.style.display = 'none';
        }
    });
});

const debounce = (fn, wait) => {
    let timer;
    return (...args) => (clearTimeout(timer), timer = setTimeout(() => fn(...args), wait));
};
