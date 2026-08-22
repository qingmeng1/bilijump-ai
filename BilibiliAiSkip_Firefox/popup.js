document.addEventListener('DOMContentLoaded', () => {
    const keys = ['autoJump', 'enabled', 'tagFilter', 'apiKey', 'apiURL', 'apiModel', 'audioEnabled', 'autoAudio', 'aliApiKey'];
    const apiURLInput = document.getElementById('apiURL');
    const apiURLDropdown = document.getElementById('apiURLDropdown');
    const apiAccessStatus = document.getElementById('apiAccessStatus');
    const aliApiKeyInput = document.getElementById('aliApiKey');
    const aliUsage = document.getElementById('aliUsage');
    const aliUsageRemaining = {
        'paraformer-v2': document.getElementById('aliUsageRemainingV2'),
        'paraformer-v1': document.getElementById('aliUsageRemainingV1')
    };
    const freeOption = document.getElementById('free');
    let aiConfig;
    let aliUsageRequestId = 0;

    const formatNumber = value => Number(value).toLocaleString('zh-CN', {maximumFractionDigits: 4});

    const showAliUsage = (model, data) => {
        const button = aliUsageRemaining[model];
        button.textContent = formatNumber(data.remaining);
        button.dataset.remaining = String(data.remaining);
        button.disabled = false;
        aliUsage.title = '根据本扩展分别记录的模型任务用量计算；点击剩余额度可手动修改';
    };

    const loadAliUsage = () => {
        const apiKey = aliApiKeyInput.value.trim();
        const requestId = ++aliUsageRequestId;
        if (!apiKey) {
            Object.values(aliUsageRemaining).forEach(button => {
                button.textContent = '36,000';
                button.dataset.remaining = '36000';
                button.disabled = true;
            });
            aliUsage.title = '请先输入阿里云 API Key';
            return;
        }

        Object.entries(aliUsageRemaining).forEach(([model, button]) => {
            button.textContent = '...';
            chrome.runtime.sendMessage({action: 'getAliUsage', apiKey, model}, response => {
                if (requestId !== aliUsageRequestId || apiKey !== aliApiKeyInput.value.trim()) return;
                if (chrome.runtime.lastError || !response?.success) {
                    button.textContent = '--';
                    button.disabled = true;
                    aliUsage.title = chrome.runtime.lastError?.message || response?.error || '读取失败';
                    return;
                }
                showAliUsage(model, response.data);
            });
        });
    };

    const scheduleAliUsageLoad = debounce(loadAliUsage, 300);

    Object.entries(aliUsageRemaining).forEach(([model, button]) => {
        button.addEventListener('click', () => {
            const apiKey = aliApiKeyInput.value.trim();
            if (!apiKey) {
                alert('请先输入阿里云 API Key');
                return;
            }
            const input = prompt(`请输入 ${model} 剩余额度（秒）`, button.dataset.remaining || '36000');
            if (input === null) return;
            const remaining = Number(input.replace(/,/g, '').trim());
            if (!Number.isFinite(remaining) || remaining < 0 || remaining > 36000) {
                alert('请输入 0 到 36,000 之间的数字');
                return;
            }
            chrome.runtime.sendMessage({action: 'setAliRemaining', apiKey, model, remaining}, response => {
                if (chrome.runtime.lastError || !response?.success) {
                    alert(chrome.runtime.lastError?.message || response?.error || '保存失败');
                    return;
                }
                showAliUsage(model, response.data);
            });
        });
    });

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
            const isLocalHttp = url.protocol === 'http:' &&
                (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
            return url.protocol === 'https:' || isLocalHttp
                ? `${url.protocol}//${url.hostname}/*`
                : null;
        } catch {
            return null;
        }
    };

    const updateApiAccessStatus = () => {
        const origin = getApiOrigin();
        if (!origin) {
            apiAccessStatus.textContent = '请输入有效的 HTTPS API URL，或本机 HTTP 地址';
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
            loadAliUsage();
        });
    });

    aliApiKeyInput.addEventListener('input', scheduleAliUsageLoad);

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
            apiAccessStatus.textContent = '请输入有效的 HTTPS API URL，或本机 HTTP 地址';
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
