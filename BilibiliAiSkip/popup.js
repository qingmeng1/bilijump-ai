document.addEventListener('DOMContentLoaded', () => {
    const keys = ['autoJump', 'enabled', 'tagFilter', 'apiKey', 'apiURL', 'apiModel', 'audioEnabled', 'autoAudio', 'aliApiKey'];
    const apiURLInput = document.getElementById('apiURL');
    const apiURLDrop = document.getElementById('apiURLDropdown');
    const apiKeyInput = document.getElementById('apiKey');
    const apiKeyDrop = document.getElementById('apiKeyDropdown');
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

        if (settings.apiKey && settings.apiURL && settings.apiModel) {
            chrome.storage.sync.get({apiHistory: {}}, result => {
                result.apiHistory[settings.apiKey] = {url: settings.apiURL, model: settings.apiModel};
                chrome.storage.sync.set({apiHistory: result.apiHistory});
            });
        }

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
        apiURLDrop.style.display = 'block';
        apiKeyDrop.style.display = 'none';
        event.stopPropagation();
    });
    apiURLInput.addEventListener('input', updateApiAccessStatus);

    apiURLDrop.addEventListener('click', event => {
        if (event.target.closest('a')) return;
        const option = event.target.closest('.dropdown-option');
        if (!option) return;

        if (option === freeOption) {
            if (!aiConfig) {
                apiAccessStatus.textContent = '免费 API 配置暂不可用';
                return;
            }
            apiKeyInput.value = aiConfig.apiKey || '';
            apiURLInput.value = aiConfig.apiURL || '';
            document.getElementById('apiModel').value = aiConfig.apiModel || '';
        } else {
            apiURLInput.value = option.dataset.value || '';
            apiKeyInput.value = '';
            document.getElementById('apiModel').value = '';
        }

        apiURLDrop.style.display = 'none';
        save();
        updateApiAccessStatus();
    });

    apiKeyInput.addEventListener('click', event => {
        event.stopPropagation();
        apiURLDrop.style.display = 'none';
        chrome.storage.sync.get({apiHistory: {}}, result => {
            const history = result.apiHistory;
            if (!Object.keys(history).length) return;

            apiKeyDrop.innerHTML = Object.entries(history).reverse().map(([key, value]) =>
                `<div class="dropdown-option" data-k="${key}" data-u="${value.url}" data-m="${value.model}" style="display: flex; align-items: center; padding: 5px 10px; gap: 10px;">
                    <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;">
                        ${new URL(value.url).host}
                    </span>
                    <small style="color: #aaa; font-family: monospace; white-space: nowrap; flex-shrink: 0;">
                        ${key.slice(0, 7)}...${key.slice(-4)}
                    </small>
                    <span class="delete-btn" style="color: #999; cursor: pointer; font-size: 18px; line-height: 1; flex-shrink: 0;" title="删除">×</span>
                </div>`
            ).join('');
            apiKeyDrop.style.display = 'block';
        });
    });

    apiKeyDrop.addEventListener('click', event => {
        const option = event.target.closest('.dropdown-option');
        if (!option) return;

        if (event.target.classList.contains('delete-btn')) {
            const key = option.dataset.k;
            option.remove();
            chrome.storage.sync.get({apiHistory: {}}, result => {
                delete result.apiHistory[key];
                chrome.storage.sync.set({apiHistory: result.apiHistory});
                if (!Object.keys(result.apiHistory).length) apiKeyDrop.style.display = 'none';
            });
            return;
        }

        apiKeyInput.value = option.dataset.k;
        apiURLInput.value = option.dataset.u;
        document.getElementById('apiModel').value = option.dataset.m;
        apiKeyDrop.style.display = 'none';
        save();
        updateApiAccessStatus();
    });

    document.addEventListener('click', event => {
        if (!apiURLInput.contains(event.target) && !apiURLDrop.contains(event.target)) apiURLDrop.style.display = 'none';
        if (!apiKeyInput.contains(event.target) && !apiKeyDrop.contains(event.target)) apiKeyDrop.style.display = 'none';
    });
});

const debounce = (fn, wait) => {
    let timer;
    return (...args) => (clearTimeout(timer), timer = setTimeout(() => fn(...args), wait));
};
