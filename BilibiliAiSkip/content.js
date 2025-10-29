let settings;
let banModels;

const configKeys = ['autoJump','enabled','tagFilter','apiKey','apiURL','apiModel','audioEnabled','autoAudio','aliApiKey'];
let popups = { audioCheck: null, task: null, ai: null, ads: [], others: []}, now_cid;

(async function() {
    chrome.storage.sync.get('config', result => {
        settings = result.config;
    });
    chrome.storage.sync.get('banModels', result => {
        banModels = result.banModels;
    });

    chrome.storage.sync.get(configKeys, res => {
        configKeys.forEach(k => settings[k] = res[k] ?? settings[k]);
        startAdSkipping();
    });
    
    chrome.storage.onChanged.addListener(changes => 
        Object.entries(changes).forEach(([k, v]) => {
            if (!configKeys.includes(k)) return;
            settings[k] = v.newValue;
            k === 'enabled' && (v.newValue ? startAdSkipping() : location.reload());
        })
    );

    activeLog();

    let bid = '', pid = '', intervals = [];
    function startAdSkipping() {
        if (!settings.enabled) return;

        showPopup(`AI skip start.`);
        //showPopup(`自动跳过：${settings.autoJump}`);
        //showPopup(`音频分析：${settings.audioEnabled}`);
        setInterval(async function(){
            let bvid = window.location.pathname.split('/')[2], pvid = new URLSearchParams(window.location.search).get('p');
            if(bvid == 'watchlater') bvid = new URLSearchParams(window.location.search).get('bvid');
            if(bid !== bvid || pid !== pvid){
                bid = bvid, pid = pvid;

                const tagFilter = settings.tagFilter || "";
                const filterTags = tagFilter.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag !== "");
                if (filterTags.length > 0) {
                    const tagElements = document.querySelectorAll('.tag-panel .tag .ordinary-tag a');
                    const author = document.querySelector('meta[name="author"]')?.getAttribute('content');
                    const tags = Array.from(tagElements).map(element => element.innerHTML.toLowerCase());
                    if (author) tags.push(author);
                    if (filterTags.some(tag => tags.some(pageTag => pageTag.includes(tag)))) {
                        popups.others.push(showPopup(`过滤列表，跳过`));
                        return;
                    }
                }

                while (intervals.length) clearInterval(intervals.shift());
                while (popups.others.length) popups.others.shift()?.remove();
                while (popups.ads.length) popups.ads.shift()?.remove();
                document.getElementById('bilibili-ai-skip-correct')?.remove();

                closePopup(popups.audioCheck);
                closePopup(popups.task);
                closePopup(popups.ai);

                let video = document.querySelector('video');
                while(!video?.duration) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    video = document.querySelector('video');
                }
                popups.others.push(showPopup(`视频长度：${Math.ceil(video.duration)}s`));
                if((video?.duration || 0) < 120) {
                    styleLog(video.duration);
                    popups.others.push(showPopup('短视频，无需分析广告'));
                    return;
                }
                try {
                    let adsData = await adRecognition(bvid,pvid);
                    for(let i = 1; i < 3 && adsData == null; i++) {
                        styleLog(adsData);
                        popups.others.push(showPopup('Re-fetch AD data.'));
                        adsData = await adRecognition(bvid,pvid);
                    }
                    styleLog(`广告数据: ` + JSON.stringify(adsData));

                    new Promise(async resolve => {
                        let curr_progress = document.querySelectorAll('.bpx-player-progress-schedule-current');
                        while(!curr_progress || curr_progress?.length == 0) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            curr_progress = document.querySelectorAll('.bpx-player-progress-schedule-current');
                        }
                        for (var p = 0; p < curr_progress.length; p++) {
                            curr_progress[p].style.backgroundColor = '#13c58ae6';
                            curr_progress[p].style.zIndex = '99';
                        }
                    });

                    if(adsData && adsData.ads.length > 0) {
                        let progress = document.getElementsByClassName('bpx-player-progress-schedule');
                        while(!progress || progress?.length == 0) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            progress = document.getElementsByClassName('bpx-player-progress-schedule');
                        }
                        let segment_progress = document.getElementsByClassName('bpx-player-progress-schedule-segment');
                        let player_progress = document.getElementsByClassName('bpx-player-progress');
                        let shadow_progress = document.getElementsByClassName('bpx-player-shadow-progress-schedule-wrap');
                        
                        for (let i = 0; i < adsData.ads.length; i++) {
                            let TARGET_TIME = adsData.ads[i].start_time, SKIP_TO_TIME = adsData.ads[i].end_time, product_name = adsData.ads[i].product_name, ad_content = adsData.ads[i].ad_content;
                            intervals[i] = setInterval(skipVideoAD, 1000);
                            popups.others.push(showPopup(`广告时间：${getTime(TARGET_TIME)} --> ${getTime(SKIP_TO_TIME)}`));
                            popups.others.push(showPopup(`产品名称：${product_name}`));
                            //showPopup(`广告内容：${ad_content}`);
                            new Promise(async resolve => {
                                if(segment_progress.length > 0) {
                                    var ad_progress = document.createElement('div');
                                    ad_progress.className = 'bpx-player-progress-schedule-current';
                                    ad_progress.style.transform = `translate(${(TARGET_TIME/video.duration)*100}%, 0%) 
                                                                  scaleX(${(SKIP_TO_TIME-TARGET_TIME)/video.duration})`;
                                    ad_progress.style.backgroundColor = '#df9938';
                                    ad_progress.style.zIndex = 'auto';
                                    player_progress?.[0]?.appendChild(ad_progress);
                                    shadow_progress?.[0]?.appendChild(ad_progress.cloneNode(true));
                                }else {
                                    for (var p = 0; p < progress.length; p++) {
                                        var ad_progress = document.createElement('div');
                                        ad_progress.className = 'bpx-player-progress-schedule-current';
                                        ad_progress.style.transform = `translate(${(TARGET_TIME/video.duration)*100}%, 0%) 
                                                                      scaleX(${(SKIP_TO_TIME-TARGET_TIME)/video.duration})`;
                                        ad_progress.style.backgroundColor = '#df9938';
                                        progress[p].appendChild(ad_progress);
                                    }
                                }
                            });
                            function skipVideoAD() {
                                let video = document.querySelector('video');
                                if (!video) {
                                    showPopup('未找到视频组件.');
                                    return;
                                }
                                let currentTime = video.currentTime;
                                if (currentTime > TARGET_TIME && currentTime < SKIP_TO_TIME) {
                                    if(settings.autoJump){
                                        video.currentTime = SKIP_TO_TIME;
                                        popups.others.push(showPopup('广告已跳过.'));
                                        updateTimes(now_cid, SKIP_TO_TIME - TARGET_TIME);
                                        clearInterval(intervals[i]);
                                    } else {
                                        if(popups.ads[i]) {
                                            document.querySelector('#skip-button').innerHTML = Math.ceil(SKIP_TO_TIME - currentTime);
                                            return;
                                        }
                                        const playerContainer = document.querySelector('.bpx-player-container');
                                        if (!playerContainer) {
                                            styleLog('Player container not found.');
                                            return;
                                        }

                                        playerContainer.style.position = 'relative';

                                        var popup = document.createElement('div');
                                        popup.innerHTML = `
                                            <div style="display: flex; align-items: flex-start; height: 100%;">
                                                <div style="width: 2px; height: 100%; background-color: #ff0000; margin-right: 10px;"></div>
                                                <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                                                    <div style="font-weight: bold; font-size: 16px;">广告 · ${product_name}<span style="font-size: 11px; color: #cccccc; font-weight: normal; margin-left: 8px;">(按 k 跳过)</span></div>
                                                    <div style="height: 60px; display: flex; align-items: center; flex: 1;">
                                                        <div style="width: 40px; height: 40px; background-color: rgba(255, 255, 255, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 10px; flex-shrink: 0;">
                                                            <button id="skip-button" title="按k或点击倒计时跳过" style="color: #fff; font-size: 14px; font-weight: bold; background: linear-gradient(135deg, #48D1CC, #48D1CC); border: none; border-radius: 50%; width: 100%; height: 100%; cursor: pointer; transition: all 0.3s ease;">${Math.ceil(SKIP_TO_TIME - currentTime)}</button>
                                                        </div>
                                                        <div style="overflow: hidden; flex: 1;">
                                                            <div style="word-wrap: break-word;">${ad_content}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        `;
                                        //popup.title = "按k或点击倒计时跳过";
                                        popup.style.position = 'absolute';
                                        popup.style.bottom = '90px';
                                        popup.style.right = '30px';
                                        popup.style.width = '300px';
                                        popup.style.padding = '15px';
                                        popup.style.background = 'linear-gradient(135deg, rgba(0, 0, 0, 0.3), rgba(50, 50, 50, 0.5))';
                                        popup.style.color = '#fff';
                                        popup.style.borderRadius = '8px';
                                        popup.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.3)';
                                        popup.style.zIndex = '50';
                                        popup.style.fontFamily = 'Arial, sans-serif';
                                        popup.style.lineHeight = '1.5';
                                        popup.style.overflow = 'hidden';
                                        popup.style.transition = 'background 0.3s ease';

                                        var closeButton = document.createElement('span');
                                        closeButton.innerHTML = '×';
                                        closeButton.style.position = 'absolute';
                                        closeButton.style.top = '10px';
                                        closeButton.style.right = '15px';
                                        closeButton.style.cursor = 'pointer';
                                        closeButton.style.fontSize = '18px';
                                        closeButton.style.color = '#fff';
                                        popup.appendChild(closeButton);

                                        popup.addEventListener('mouseenter', function() {
                                            popup.style.background = 'linear-gradient(135deg, rgba(0, 0, 0, 0.8), rgba(50, 50, 50, 1))';
                                        });

                                        popup.addEventListener('mouseleave', function() {
                                            popup.style.background = 'linear-gradient(135deg, rgba(0, 0, 0, 0.3), rgba(50, 50, 50, 0.5))';
                                        });

                                        playerContainer.appendChild(popup);

                                        closeButton.addEventListener('click', () => {
                                            clearInterval(intervals[i]);
                                            popups.ads[i].remove();
                                        });
                                        popup.querySelector('#skip-button').addEventListener('click', () => {
                                            popup.style.background = 'linear-gradient(135deg, rgba(0, 0, 0, 0.3), rgba(50, 50, 50, 0.3))';
                                            popups.ads[i].remove();
                                            popups.ads[i] = undefined;
                                            video.currentTime = SKIP_TO_TIME;
                                            popups.others.push(showPopup('广告已跳过.'));
                                            updateTimes(now_cid, SKIP_TO_TIME - TARGET_TIME);
                                        });

                                        popups.ads[i] = popup;
                                    }
                                }else if(popups.ads[i]) {
                                    popups.ads[i].remove();
                                    popups.ads[i] = undefined;
                                    if(window.location.pathname.split('/')[2] !== bvid || new URLSearchParams(window.location.search).get('p') !== pvid) {
                                        clearInterval(intervals[i]);
                                        return;
                                    }
                                }
                            }
                        }
                    } else {
                        popups.others.push(showPopup(adsData?.msg || "无有效数据"));
                    }
                } catch (error) {
                    console.info('Failed to fetch ad time:', error);
                }
            }
        }, 1000);

        document.addEventListener('keydown', (event) => {
            if (event.key.toLowerCase() === 'k') {
                for (let i = 0; i < popups.ads.length; i++) {
                    const adPopup = popups.ads[i];
                    if (adPopup && document.body.contains(adPopup)) {
                        const skipButton = adPopup.querySelector('#skip-button');
                        if (skipButton) {
                            skipButton.click();
                            break;
                        }
                    }
                }
            } else if (popups.audioCheck && document.body.contains(popups.audioCheck)) {
                if (event.key.toLowerCase() === 'y') {
                    const yesButton = popups.audioCheck.querySelector('#yes-button');
                    if (yesButton) {
                        yesButton.click();
                    }
                } else if (event.key.toLowerCase() === 'n') {
                    const noButton = popups.audioCheck.querySelector('#no-button');
                    if (noButton) {
                        noButton.click();
                    }
                }
            }
        });
    }

    chrome.storage.onChanged.addListener((changes, namespace) => {
        for (const [key, { newValue }] of Object.entries(changes)) {
            settings[key] = newValue;
            if (key === 'enabled') {
                newValue ? startAdSkipping() : location.reload();
            }
        }
    });
})();

async function adRecognition(bvid,pvid) {

    try {
        let resultS = await chrome.storage.local.get('subtitle');

        let response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {credentials: "include"});
        const videoData = await response.json(), aid = videoData.data.aid, cid = videoData.data.pages?.[pvid?pvid-1:pvid]?.cid || videoData.data.cid, title = videoData.data.title;
        now_cid = cid;

        //showPopup(`视频ID: ${bvid}`);
        //showPopup(`CID: ${cid}`);
        styleLog(`PID: ${pvid}`);

        //todo 获取云端数据
        let dbResults = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: "dbQuery",
                url: settings.cfApiURL,
                method: "POST",
                cfApiKey: settings.cfApiKey,
                body: {sql: "SELECT data,model FROM bilijump WHERE cid = ? LIMIT 1;", params: [cid]}
            }, response => {
                if (response.success) {
                    resolve(response?.data?.result?.[0]?.results?.[0]);
                } else {
                    styleLog("Background fetch error: " + response.error);
                    reject(new Error(response.error));
                }
            });
        });

        if(dbResults) {
            popups.others.push(showPopup(`使用云端数据, 模型: ${dbResults?.model}.`));
            correctButton(cid, JSON.parse(dbResults?.data));
            return JSON.parse(dbResults?.data);
        }

        for(const key of ["apiKey", "apiURL", "apiModel"]) {
            if(!settings[key]) {
                popups.others.push(showPopup(`Please set ${key} in extension settings`));
                return {ads:[], msg:`Please set ${key}`};
            }
        }

        if (banModels.includes(settings.apiModel)) {
            showPopup(`禁用 ${settings.apiModel} 模型，效果太差`);
            return {ads:[], msg: `请使用其他模型`};
        }

        response = await fetch(`https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`, {
            credentials: "include"
        });
        const playerData = await response.json(), subtitleUrl = playerData.data?.subtitle?.subtitles?.[0]?.subtitle_url;


        let subtitle = "", type;
        if (subtitleUrl) {
            type = '字幕';
            popups.others.push(showPopup("使用字幕分析."));
            response = await fetch(`https:${subtitleUrl}`);
            const subtitleData = await response.json();

            subtitleData.body.forEach(item => {
                subtitle += `${item.from} --> ${item.to}\n${item.content}\n`;
            });
        }else if(settings.audioEnabled) {
            type = '音频';
            if (resultS?.subtitle?.hasOwnProperty(cid)) {
                subtitle = resultS.subtitle[cid];
                popups.others.push(showPopup("使用音频缓存."));
            }else {
                if(!settings["aliApiKey"]) {
                    showPopup(`Please set aliApiKey in extension settings`);
                    return {ads:[], msg:"Please set aliApiKey"};
                }
                if (settings.autoAudio)  {
                    popups.others.push(showPopup("01:00 后解锁音频分析."));
                    while(document.querySelector('video').currentTime < 45) {
                        if(window.location.pathname.split('/')[2] !== bvid || new URLSearchParams(window.location.search).get('p') !== pvid) {
                            return {ads:[], msg:"上下文已切换."};
                        }
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                    //await new Promise(resolve => setTimeout(resolve, document.querySelector('video').currentTime < 60 ? (60 - document.querySelector('video').currentTime) * 1000 : 0));
                } else if(!await checkPopup()) {
                    return {ads:[], msg:"用户拒绝音频分析, 识别结束."};
                }

                popups.others.push(showPopup("使用音频分析."));
                response = await fetch(`https://api.bilibili.com/x/player/wbi/playurl?bvid=${bvid}&cid=${cid}&qn=0&fnver=0&fnval=80&fourk=1`, {
                    credentials: "include"
                });
                const playerData = await response.json(), audioUrl = playerData?.data?.dash?.audio?.[0]?.base_url;

                if(!audioUrl) {
                    return {ads:[], msg:"获取不到音频文件."};
                }
                popups.others.push(showPopup("提交音频文件."));
                styleLog("audioUrl: " + audioUrl);
                const taskId = await submitTranscriptionTask("https://bili.oooo.uno?url="+encodeURIComponent(audioUrl));
                styleLog("Task submitted successfully, Task ID: " + taskId);

                popups.others.push(showPopup("等待音频分析结果."));
                const results = await waitForTaskCompletion(taskId);

                for (const result of results) {
                    if (result.subtask_status === "SUCCEEDED") {
                        const transcription = await fetchTranscription(result.transcription_url);
                        subtitle = generateSubtitle(transcription);

                        resultS = await chrome.storage.local.get('subtitle');
                        const updatedSubtitles = {
                          ...(resultS.subtitle || {}),
                          [cid]: subtitle
                        };
                        await chrome.storage.local.set({subtitle: updatedSubtitles});
                        //styleLog("Subtitle content:\n", subtitle);
                    } else {
                        styleLog(`Subtask failed for file ${result.file_url}, status: ${result.subtask_status}`);
                        if(result.code === "SUCCESS_WITH_NO_VALID_FRAGMENT") {
                            return {ads:[], msg:"音频无有效片段."};
                        } else {
                            return {ads:[], msg:`音频解析失败：${result.message}`};
                        }
                    }
                }
            }
        }

        if (!subtitle) {
            return {ads:[], msg:"无解析内容."};
        }

        subtitle = `标题: ${title}

内容:

` + subtitle;

        popups.ai = showPopup("AI 分析中...",1);
        popups.others.push(popups.ai);

        let data = await callOpenAI(subtitle), aiResponse = data?.choices?.[0]?.message?.content, total_tokens = data?.usage?.total_tokens;
        for(let i = 1; i < 3 && !aiResponse; i++) {
            showPopup('Re-fetch AI.');
            aiResponse = await callOpenAI(subtitle);
        }
        closePopup(popups.ai);


        if (!aiResponse) {
            return {ads:[], msg:"AI 解析失败."};
        }

        const jsonMatch = aiResponse.match(/```json([\s\S]*?)```/);
        let resultAD;
        if (jsonMatch && jsonMatch[1]) {
            const jsonContent = jsonMatch[1].trim();
            resultAD = JSON.parse(jsonContent);
        }else {
            try {
                resultAD = JSON.parse(aiResponse);
            } catch (error) {
                return {ads:[], msg:"AI 分析结果获取失败. " + error};
            }
        }
        styleLog(`CID: ${cid}, data: ${JSON.stringify(resultAD)}`);
        chrome.runtime.sendMessage({
            action: "dbQuery", url: settings.cfApiURL, method: "POST", cfApiKey: settings.cfApiKey,
            body: {
                sql: `INSERT INTO bilijump (aid, bid, cid, data, subtitle, title, type, model, tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(cid) DO UPDATE SET data = excluded.data;`,
                params: [aid, bvid, cid, JSON.stringify(resultAD), subtitle, title, type, settings.apiModel, total_tokens]
            }
        });

        correctButton(cid, resultAD);
        resultS = await chrome.storage.local.get('subtitle');
        if (resultS?.subtitle?.hasOwnProperty(cid)) {
            delete resultS.subtitle[cid];
            await chrome.storage.local.set({ subtitle: resultS.subtitle });
        }
        return resultAD;
    } catch (error) {
        showPopup("Error: " + JSON.stringify(error));
        if(popups.audioCheck) closePopup(popups.audioCheck);
        if(popups.task) closePopup(popups.task);
        if(popups.ai) closePopup(popups.ai);
        return null;
    }
}

async function callOpenAI(subtitle) {
    const storageData = await chrome.storage.sync.get('prompt');
    const requestData = {
        model: settings.apiModel,
        max_tokens: 8192,
        messages: [ {role: "system", content: storageData.prompt},
                    {role: "user", content: subtitle}]};

    let response;
    for (var i = 0; i < 3;) {
        try {
            response = await fetch(settings.apiURL, {
                method: "POST",
                headers: {"Content-Type": "application/json", "Authorization": `Bearer ${settings.apiKey}`},
                body: JSON.stringify(requestData)
            });
            i = 3;
        } catch (error) {
            i++;
        }
    }

    const data = await response.json();
    if (data.error?.message) {
        showPopup("API error: " + data.error.message);
        return "";
    }

    if (!data.choices?.length) {
        showPopup("未收到有效响应.");
        return "";
    }
    return data;
}

let popupCount = 0;

function closePopup(popup) {
    if(popup) {
        popup.remove();
        for (const key in popups) {
            if (key === 'ads') continue;
            if (popups[key] === popup) {
                popups[key] = null;
                break;
            }
        }
        popups.ads = popups.ads.filter(item => item !== popup);
        popupCount--;
        adjustPopupPositions();
    }
}

async function checkPopup() {
    const userChoice = await new Promise((resolve) => {
        const popup = document.createElement('div');
        popup.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; height: 100%;">
                <div style="font-weight: bold; font-size: 16px; margin-bottom: 10px;">没有可识别字幕</div>
                <div style="font-size: 14px; margin-bottom: 15px;">是否启用音频分析? 音频分析大约需要一分钟。</div>
                <div style="display: flex; gap: 10px;">
                    <button id="yes-button" style="padding: 5px 15px; background: #1a73e8; color: #fff; border: none; border-radius: 4px; cursor: pointer;">是(y)</button>
                    <button id="no-button" style="padding: 5px 15px; background: #ccc; color: #333; border: none; border-radius: 4px; cursor: pointer;">否(n)</button>
                </div>
            </div>
        `;
        popup.style.position = 'absolute';
        popup.style.bottom = '90px';
        popup.style.right = '30px';
        popup.style.width = '300px';
        popup.style.padding = '15px';
        popup.style.background = 'linear-gradient(135deg, rgba(0, 0, 0, 0.3), rgba(50, 50, 50, 0.5))';
        popup.style.color = '#fff';
        popup.style.borderRadius = '8px';
        popup.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.3)';
        popup.style.zIndex = '1000';
        popup.style.fontFamily = 'Arial, sans-serif';
        popup.style.lineHeight = '1.5';

        popup.addEventListener('mouseenter', function() {
            popup.style.background = 'linear-gradient(135deg, rgba(0, 0, 0, 0.5), rgba(50, 50, 50, 7))';
        });
        popup.addEventListener('mouseleave', function() {
            popup.style.background = 'linear-gradient(135deg, rgba(0, 0, 0, 0.3), rgba(50, 50, 50, 0.5))';
        });

        const playerContainer = document.querySelector('.bpx-player-container');
        if (playerContainer) {
            playerContainer.appendChild(popup);
        } else {
            console.info('Player container not found.');
            resolve(false);
            return;
        }

        popup.querySelector('#yes-button').addEventListener('click', () => {
            popup.remove();
            resolve(true);
        });
        popup.querySelector('#no-button').addEventListener('click', () => {
            popup.remove();
            resolve(false);
        });
        popups.audioCheck = popup;
        popups.others.push(popups.audioCheck);
    })
    return userChoice;
}

function showPopup(msg,persist) {
    styleLog(msg);
    var popup = document.createElement('div');
    popup.innerText = msg;
    popup.style.position = 'absolute';
    popup.style.bottom = `${80 + popupCount * 60}px`;
    popup.style.right = '10px';
    popup.style.padding = '10px';
    popup.style.background = 'linear-gradient(135deg, rgba(0, 0, 0, 0.3), rgba(50, 50, 50, 0.5))';
    popup.style.color = '#fff';
    popup.style.borderRadius = '5px';
    popup.style.zIndex = '1000';
    popup.classList.add('popup');

    var playerContainer = document.querySelector('.bpx-player-container');
    if (playerContainer) {
        playerContainer.appendChild(popup);
        popupCount++;

        adjustPopupPositions();
        if (!persist) {
            setTimeout(function() {
                closePopup(popup);
            }, 7000);
        }
    } else {
        console.info('Player container not found.');
    }
    return popup;
}

function getVideoElement() {
    return document.querySelector('video');
}

function secondsToTime(seconds, forceHours = false) {
    if (seconds === null || seconds === undefined || isNaN(seconds)) return '--:--';
    seconds = Math.floor(seconds);
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0 || forceHours) {
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

let isSettingTime = false;
let targetSegmentElement = null;
let targetTimeType = null;
let progressClickListener = null;
let activeTimeSettingButton = null; 

function showCorrectionPopup(cid, currentAdsData) {
    const existingPopup = document.getElementById('bilibili-ai-skip-correction-popup');
    if (existingPopup) {
        closePopup(existingPopup);
        return;
    }

    const cancelTimeSelectionMode = () => {
        if (!isSettingTime) return;

        const progressBar = document.querySelector('.bpx-player-progress-wrap');
        const timeSelectionStatus = document.getElementById('time-selection-status');

        if (progressBar && progressClickListener) {
            progressBar.removeEventListener('click', progressClickListener);
            progressBar.style.cursor = '';
            styleLog("Bilibili AI Skip: Removed progress bar click listener.");
        }

        if (activeTimeSettingButton) {
            const isStartButton = activeTimeSettingButton.classList.contains('set-start-time');
            activeTimeSettingButton.textContent = isStartButton ? 'Set Start' : 'Set End';
            styleLog(`Bilibili AI Skip: Reset button text for ${isStartButton ? 'start' : 'end'} time.`);
        }

        if (timeSelectionStatus) {
             timeSelectionStatus.textContent = '';
             timeSelectionStatus.style.display = 'none';
             styleLog("Bilibili AI Skip: Cleared and hid time selection status.");
        }

        isSettingTime = false;
        targetSegmentElement = null;
        targetTimeType = null;
        progressClickListener = null;
        activeTimeSettingButton = null;
        styleLog("Bilibili AI Skip: Time selection mode cancelled.");
    };

    const popup = document.createElement('div');
    popup.id = 'bilibili-ai-skip-correction-popup';
    popup.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-weight: bold; font-size: 18px;">人工纠错</span>
                <button id="close-correction-popup" style="background: none; border: none; color: #fff; font-size: 24px; cursor: pointer; line-height: 1;">×</button>
            </div>
            <div id="time-selection-status" style="min-height: 20px; text-align: center; color: #ffeb3b; margin-bottom: 10px; font-size: 13px; display: none;"></div>
            <div id="ad-segments-container" style="min-height: 100px; max-height: 350px; overflow-y: auto; margin-bottom: 15px; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; padding: 10px;">
                <div id="ad-segments"></div>
                <div id="empty-state" style="text-align: center; color: #ccc; padding: 20px; display: none;">当前未识别到广告片段。<br>您可以手动添加。</div>
            </div>
            <div style="display: flex; gap: 10px; justify-content: space-between; margin-top: 5px;">
                <button id="ai-re-recog" style="flex-basis: 25%; padding: 8px; background: #a19cef; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">AI重新识别</button>
                <button id="add-segment" style="flex-basis: 25%; padding: 8px; background: #4caf50; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">增加片段</button>
                <button id="confirm-no-ads" style="flex-basis: 25%; padding: 8px; background: #ff9800; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">无广告</button>
                <button id="submit-button" style="flex-basis: 25%; padding: 8px; background: #1a73e8; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">提交</button>
            </div>
        </div>
    `;
    popup.style.position = 'absolute';
    popup.style.bottom = '120px';
    popup.style.right = '30px';
    popup.style.width = '420px';
    popup.style.padding = '20px';
    popup.style.background = 'linear-gradient(135deg, rgba(0, 0, 0, 0.6), rgba(50, 50, 50, 0.8))';
    popup.style.color = '#fff';
    popup.style.borderRadius = '12px';
    popup.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4)';
    popup.style.zIndex = '50';
    popup.style.fontFamily = '"Arial", sans-serif';
    popup.style.lineHeight = '1.6';
    popup.style.backdropFilter = 'blur(8px)';


    const playerContainer = document.querySelector('.bpx-player-container');
    if (!playerContainer) {
        showPopup('错误：无法找到播放器容器');
        return;
    }
    playerContainer.appendChild(popup);
    if (popups?.others) {
         popups.others.push(popup);
    } else {
         console.warn("Bilibili AI Skip: popups.others array not found. Popup management might be affected.");
    }

    const adSegmentsContainer = popup.querySelector('#ad-segments');
    const emptyStateDiv = popup.querySelector('#empty-state');
    const timeSelectionStatus = popup.querySelector('#time-selection-status');

     const enterTimeSelectionMode = (segmentElement, timeType, buttonElement) => {
        if (isSettingTime && activeTimeSettingButton === buttonElement) {
            styleLog(`Bilibili AI Skip: Re-clicked the active setting button. Cancelling selection.`);
            cancelTimeSelectionMode();
            return;
        }

        if (isSettingTime) {
            styleLog("Bilibili AI Skip: Switching time selection target. Cancelling previous mode.");
            cancelTimeSelectionMode();
        }

        const video = getVideoElement();
        const progressBar = document.querySelector('.bpx-player-progress-wrap');

        if (!video || !progressBar) {
            showPopup('错误：无法找到视频或进度条');
            styleLog("Bilibili AI Skip: Video or progress bar element not found for time setting.");
            return;
        }

        isSettingTime = true;
        targetSegmentElement = segmentElement;
        targetTimeType = timeType;
        activeTimeSettingButton = buttonElement;

        buttonElement.textContent = 'Setting...';
        timeSelectionStatus.textContent = `请点击播放器进度条以设置${timeType === 'start' ? '开始' : '结束'}时间`;
        timeSelectionStatus.style.display = 'block';
        progressBar.style.cursor = 'crosshair';
        progressClickListener = (event) => {
            const rect = progressBar.getBoundingClientRect();
            const offsetX = event.clientX - rect.left;
            const barWidth = progressBar.offsetWidth;
            const duration = video.duration;

            if (!isNaN(duration) && duration > 0 && barWidth > 0) {
                const clickedTime = Math.max(0, Math.min(duration, (offsetX / barWidth) * duration));
                const timeDisplaySpan = segmentElement.querySelector(timeType === 'start' ? '.start-time-display' : '.end-time-display');
                if (timeDisplaySpan) {
                     timeDisplaySpan.textContent = secondsToTime(clickedTime);
                     segmentElement.setAttribute(`data-${timeType}-seconds`, clickedTime.toFixed(3));
                     console.log(`Bilibili AI Skip: Set ${timeType} time to ${clickedTime.toFixed(3)}s (${secondsToTime(clickedTime)})`);
                     if(timeType === 'start') {
                        segmentElement.dataset.sortTime = clickedTime.toFixed(3);
                     }
                } else {
                     console.info("Bilibili AI Skip: Time display span not found for", timeType);
                }
                video.currentTime = clickedTime;
                cancelTimeSelectionMode();

            } else {
                console.warn("Bilibili AI Skip: Could not calculate time. Duration or bar width invalid.", {duration, barWidth});
                showPopup("无法获取时间，请确保视频已加载");
            }
        };

        progressBar.addEventListener('click', progressClickListener);
    };

    function addAdSegment(ad = { start_time: null, end_time: null, product_name: '', ad_content: '' }) {
        const segment = document.createElement('div');
        segment.className = 'ad-segment';
        segment.style.marginBottom = '15px';
        segment.style.padding = '15px';
        segment.style.background = 'rgba(255, 255, 255, 0.1)';
        segment.style.borderRadius = '8px';
        segment.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        segment.style.position = 'relative';

        const startTimeSeconds = (ad.start_time !== null && !isNaN(parseFloat(ad.start_time))) ? parseFloat(ad.start_time) : null;
        const endTimeSeconds = (ad.end_time !== null && !isNaN(parseFloat(ad.end_time))) ? parseFloat(ad.end_time) : null;

        segment.setAttribute('data-start-seconds', startTimeSeconds !== null ? startTimeSeconds.toFixed(3) : '');
        segment.setAttribute('data-end-seconds', endTimeSeconds !== null ? endTimeSeconds.toFixed(3) : '');
        segment.dataset.sortTime = startTimeSeconds !== null ? startTimeSeconds.toFixed(3) : Infinity;

        segment.innerHTML = `
            <button class="remove-segment" style="position: absolute; top: 8px; right: 8px; padding: 2px 6px; background: #f44336; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; line-height: 1;">删除</button>
            <div style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
                <div style="flex: 1; text-align: center;">
                    <label style="font-size: 13px; display: block; margin-bottom: 5px;">开始时间</label>
                    <span class="start-time-display" style="font-size: 16px; font-weight: bold; color: #a0ffa0; display: block; margin-bottom: 5px; border: 2px solid transparent; padding: 2px 4px; border-radius: 3px;">${secondsToTime(startTimeSeconds)}</span>
                    <button class="set-start-time" style="padding: 4px 8px; background: #03a9f4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Set Start</button>
                </div>
                <div style="width: 20px; text-align: center; font-size: 16px;">→</div>
                <div style="flex: 1; text-align: center;">
                    <label style="font-size: 13px; display: block; margin-bottom: 5px;">结束时间</label>
                    <span class="end-time-display" style="font-size: 16px; font-weight: bold; color: #ffa0a0; display: block; margin-bottom: 5px; border: 2px solid transparent; padding: 2px 4px; border-radius: 3px;">${secondsToTime(endTimeSeconds)}</span>
                    <button class="set-end-time" style="padding: 4px 8px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Set End</button>
                </div>
            </div>
            <div class="mini-progress" style="height: 6px; background: rgba(255,255,255,0.3); border-radius: 3px; margin-bottom: 10px; position: relative; overflow: hidden;">
                <div class="mini-progress-indicator" style="position: absolute; height: 100%; background: #ffeb3b; left: 0%; width: 0%;"></div>
            </div>
            <label style="margin-bottom: 5px; font-size: 13px; display: block;">产品名称:</label>
            <input type="text" class="product-name" style="width: 100%; margin-bottom: 10px; padding: 8px; color: #000; background: #fff; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; box-sizing: border-box;" value="${ad.product_name || ''}">
            <label style="margin-bottom: 5px; font-size: 13px; display: block;">广告内容:</label>
            <textarea class="ad-content-textarea" style="width: 100%; height: 60px; padding: 8px; color: #000; background: #fff; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; box-sizing: border-box; resize: vertical;">${ad.ad_content || ''}</textarea>
        `;

        const updateMiniProgress = () => {
             const video = getVideoElement();
             if (!video || !video.duration || isNaN(video.duration) || video.duration <= 0) return;
             const duration = video.duration;
             const startAttr = segment.getAttribute('data-start-seconds');
             const endAttr = segment.getAttribute('data-end-seconds');
             const indicator = segment.querySelector('.mini-progress-indicator');

             if (!indicator) return;

             const start = (startAttr && !isNaN(parseFloat(startAttr))) ? parseFloat(startAttr) : null;
             const end = (endAttr && !isNaN(parseFloat(endAttr))) ? parseFloat(endAttr) : null;

             if (start !== null && end !== null && end > start) {
                 const leftPercent = (start / duration) * 100;
                 const widthPercent = ((end - start) / duration) * 100;
                 indicator.style.left = `${Math.max(0, leftPercent)}%`;
                 indicator.style.width = `${Math.min(100 - leftPercent, widthPercent)}%`;
             } else {
                 indicator.style.left = '0%';
                 indicator.style.width = '0%';
             }
        };

        updateMiniProgress();
        const observer = new MutationObserver(mutations => {
             if (mutations.some(m => m.attributeName === 'data-start-seconds' || m.attributeName === 'data-end-seconds')) {
                  updateMiniProgress();
             }
        });
        observer.observe(segment, {
            attributes: true, attributeFilter: ['data-start-seconds', 'data-end-seconds']
        });
        const videoElem = getVideoElement();
        if (videoElem) {
            if (videoElem.readyState >= 1) {
                updateMiniProgress();
            } else {
                 videoElem.addEventListener('loadedmetadata', updateMiniProgress, {once: true});
            }
        }

        const sortSegmentsVisually = () => {
            const segments = Array.from(adSegmentsContainer.children).filter(el => el.classList.contains('ad-segment'));
            segments.sort((a, b) => {
                const timeA = parseFloat(a.dataset.sortTime ?? Infinity);
                const timeB = parseFloat(b.dataset.sortTime ?? Infinity);
                return timeA - timeB;
            });
            segments.forEach(seg => adSegmentsContainer.appendChild(seg));
        }

        adSegmentsContainer.appendChild(segment);
        sortSegmentsVisually();

        segment.querySelector('.remove-segment').addEventListener('click', () => {
            if(targetSegmentElement === segment) {
                cancelTimeSelectionMode();
            }
            segment.remove();
            observer.disconnect();
             const videoElem = getVideoElement();
             if (videoElem) videoElem.removeEventListener('loadedmetadata', updateMiniProgress);
            checkEmptyState();
        });

        const setStartButton = segment.querySelector('.set-start-time');
        setStartButton.addEventListener('click', () => {
            enterTimeSelectionMode(segment, 'start', setStartButton);
        });

        const setEndButton = segment.querySelector('.set-end-time');
        setEndButton.addEventListener('click', () => {
            enterTimeSelectionMode(segment, 'end', setEndButton);
        });

        checkEmptyState();
    }

    function checkEmptyState() {
        const segmentCount = adSegmentsContainer.children.length;
        emptyStateDiv.style.display = segmentCount === 0 ? 'block' : 'none';
    }

    const initialAds = (currentAdsData && currentAdsData.ads ? currentAdsData.ads : [])
        .map(ad => ({
            start_time: !isNaN(parseFloat(ad.start_time)) ? parseFloat(ad.start_time) : null,
            end_time: !isNaN(parseFloat(ad.end_time)) ? parseFloat(ad.end_time) : null,
            product_name: ad.product_name,
            ad_content: ad.ad_content
        }));
    initialAds.forEach(ad => addAdSegment(ad));
    checkEmptyState();

    popup.querySelector('#add-segment').addEventListener('click', () => {
        addAdSegment();
    });

    popup.querySelector('#close-correction-popup').addEventListener('click', () => {
        cancelTimeSelectionMode();
        closePopup(popup);
    });

    async function submitCorrection(adsData, message, model) {
        cancelTimeSelectionMode();
        if (typeof settings === 'undefined' || !settings.cfApiURL || !settings.cfApiKey) {
            showPopup("提交失败：无法访问配置");
            return;
        }

        if (JSON.stringify(adsData) == JSON.stringify(currentAdsData)) {
            const submitButton = popup.querySelector('#submit-button');
            if(submitButton) submitButton.disabled = false; submitButton.textContent = '提交';
            showPopup("数据无变化");
            return; 
        }

        try {
            await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: "dbQuery",
                    url: settings.cfApiURL,
                    method: "POST",
                    cfApiKey: settings.cfApiKey,
                    body: {
                        sql: `UPDATE bilijump SET data = ?, model = ? WHERE cid = ?;`,
                        params: [JSON.stringify(adsData), model, cid]
                    }
                }, response => {
                    if (chrome.runtime.lastError) {
                         console.info("Bilibili AI Skip: chrome.runtime.lastError:", chrome.runtime.lastError.message);
                         reject(new Error(chrome.runtime.lastError.message || 'Unknown background script error'));
                    } else if (response && response.success) {
                         styleLog('Bilibili AI Skip: Database update successful for correction.');
                         resolve();
                    } else {
                         const errorMsg = (response && response.error) ? response.error : 'Unknown background error';
                         console.info("Bilibili AI Skip: Correction submission error -", errorMsg);
                         reject(new Error(errorMsg));
                    }
                });
            });

            showPopup(message);
            styleLog('Bilibili AI Skip: Correction submitted successfully.');
            closePopup(popup);
            showPopup("页面将在3秒后刷新...");
            setTimeout(() => { location.reload(); }, 3000);
        } catch (error) {
             showPopup('提交失败：' + error.message);
             console.info('Bilibili AI Skip: Submission failed:', error);
        }
    }

    popup.querySelector('#ai-re-recog').addEventListener('click', async () => {
        if (window.confirm("您确定使用 AI 重新识别广告吗？这将覆盖之前的记录。")) {
            let bvid = window.location.pathname.split('/')[2], pvid = new URLSearchParams(window.location.search).get('p');
            let response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {credentials: "include"});
            const videoData = await response.json(), aid = videoData.data.aid, cid = videoData.data.pages?.[pvid?pvid-1:pvid]?.cid || videoData.data.cid;

            let dbResults = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: "dbQuery",
                    url: settings.cfApiURL,
                    method: "POST",
                    cfApiKey: settings.cfApiKey,
                    body: {sql: "SELECT subtitle FROM bilijump WHERE cid = ? LIMIT 1;", params: [cid]}
                }, response => {
                    if (response.success) {
                        resolve(response?.data?.result?.[0]?.results?.[0]);
                    } else {
                        styleLog("Background fetch error: " + response.error);
                        reject(new Error(response.error));
                    }
                });
            });

            if(dbResults?.subtitle) {
                for(const key of ["apiKey", "apiURL", "apiModel"]) {
                    if(!settings[key]) {
                        popups.others.push(showPopup(`Please set ${key} in extension settings`));
                        return {ads:[], msg:`Please set ${key}`};
                    }
                }

                if (banModels.includes(settings.apiModel)) {
                    showPopup(`禁用 ${settings.apiModel} 模型，效果太差`);
                    return {ads:[], msg: `请使用其他模型`};
                }

                popups.ai = showPopup(`使用 ${settings.apiModel} 重新分析中...`,1);
                popups.others.push(popups.ai);

                let data = await callOpenAI(dbResults.subtitle), aiResponse = data?.choices?.[0]?.message?.content, total_tokens = data?.usage?.total_tokens;
                for(let i = 1; i < 3 && !aiResponse; i++) {
                    showPopup('Re-fetch AI.');
                    aiResponse = await callOpenAI(dbResults.subtitle);
                }
                closePopup(popups.ai);


                if (!aiResponse) {
                    showPopup("AI 解析失败.");
                    return
                }

                const jsonMatch = aiResponse.match(/```json([\s\S]*?)```/);
                let resultAD;
                if (jsonMatch && jsonMatch[1]) {
                    const jsonContent = jsonMatch[1].trim();
                    resultAD = JSON.parse(jsonContent);
                }else {
                    try {
                        resultAD = JSON.parse(aiResponse);
                    } catch (error) {
                        showPopup("AAI 分析结果获取失败. " + error);
                        return
                    }
                }

                submitCorrection(resultAD, '重新识别已完成.', settings.apiModel);
            }
        } else {
            showPopup('取消提交');
        }
    });

    popup.querySelector('#confirm-no-ads').addEventListener('click', () => {
        if (window.confirm("您确定这个视频没有广告内容吗？这将覆盖之前的记录。")) {
             const noAdsData = {
                 ads: [],
                 msg: "未识别到广告"
             };
             submitCorrection(noAdsData, '已提交', 'artificial');
        } else {
            showPopup('取消提交');
        }
    });

    popup.querySelector('#submit-button').addEventListener('click', async () => {
        cancelTimeSelectionMode();

        const segments = adSegmentsContainer.querySelectorAll('.ad-segment');
        const ads = [];
        let validationError = null;
        let firstErrorElement = null;

        for (const segment of segments) {
            const startTimeStr = segment.getAttribute('data-start-seconds');
            const endTimeStr = segment.getAttribute('data-end-seconds');
            const productNameInput = segment.querySelector('.product-name');
            const adContentTextarea = segment.querySelector('.ad-content-textarea');
            const startTimeDisplay = segment.querySelector('.start-time-display');
            const endTimeDisplay = segment.querySelector('.end-time-display');

            const productName = productNameInput.value.trim();
            const adContent = adContentTextarea.value.trim();

            startTimeDisplay.style.borderColor = 'transparent';
            endTimeDisplay.style.borderColor = 'transparent';
            productNameInput.style.borderColor = '';
            adContentTextarea.style.borderColor = '';

            const startTime = (startTimeStr && !isNaN(parseFloat(startTimeStr))) ? parseFloat(startTimeStr) : null;
            const endTime = (endTimeStr && !isNaN(parseFloat(endTimeStr))) ? parseFloat(endTimeStr) : null;

            if (startTime === null) {
                validationError = '存在未设置的开始时间';
                startTimeDisplay.style.borderColor = 'red';
                if (!firstErrorElement) firstErrorElement = segment.querySelector('.set-start-time');
                break;
            }
            if (endTime === null) {
                validationError = '存在未设置的结束时间';
                endTimeDisplay.style.borderColor = 'red';
                 if (!firstErrorElement) firstErrorElement = segment.querySelector('.set-end-time');
                break;
            }
             if (startTime >= endTime) {
                 validationError = `开始时间 (${secondsToTime(startTime)}) 必须早于结束时间 (${secondsToTime(endTime)})`;
                 startTimeDisplay.style.borderColor = 'red';
                 endTimeDisplay.style.borderColor = 'red';
                 if (!firstErrorElement) firstErrorElement = startTimeDisplay;
                 break;
             }

            if (ads.length > 0) {
                const prevAd = ads[ads.length - 1];
                const prevEndTime = parseFloat(prevAd.end_time);
                if (startTime < prevEndTime) {
                    validationError = `片段重叠：开始时间 (${secondsToTime(startTime)}) 早于上一个片段的结束时间 (${secondsToTime(prevEndTime)})`;
                    startTimeDisplay.style.borderColor = 'orange';
                    const prevSegment = segments[ads.length -1];
                    if(prevSegment) prevSegment.querySelector('.end-time-display').style.borderColor = 'orange';
                    if (!firstErrorElement) firstErrorElement = startTimeDisplay;
                    break;
                }
            }

            if (!productName) {
                 validationError = '产品名称不能为空';
                 productNameInput.style.borderColor = 'red';
                  if (!firstErrorElement) firstErrorElement = productNameInput;
                 break;
             }
             if (!adContent) {
                 validationError = '广告内容不能为空';
                 adContentTextarea.style.borderColor = 'red';
                  if (!firstErrorElement) firstErrorElement = adContentTextarea;
                 break;
             }

            ads.push({
                start_time: startTime.toFixed(2),
                end_time: endTime.toFixed(2),
                product_name: productName,
                ad_content: adContent
            });
        }

        if (validationError) {
            showPopup('提交失败：' + validationError);
            styleLog('Bilibili AI Skip: Validation failed -' + validationError);
            if (firstErrorElement && typeof firstErrorElement.focus === 'function') {
                 firstErrorElement.focus();
            }
             if(firstErrorElement) {
                  const errorSegment = firstErrorElement.closest('.ad-segment');
                  if(errorSegment) {
                       errorSegment.style.transition = 'outline 0.1s ease-in-out';
                       errorSegment.style.outline = '2px solid red';
                       setTimeout(() => { errorSegment.style.outline = 'none'; }, 2000);
                  }
             }
            return;
        }

        ads.sort((a, b) => parseFloat(a.start_time) - parseFloat(b.start_time));

        const mergedAds = [];
        let currentAd = null;
        const mergeThreshold = 1.0;

        for (const ad of ads) {
            const adStart = parseFloat(ad.start_time);
            const adEnd = parseFloat(ad.end_time);
            if (!currentAd) {
                currentAd = { ...ad, start_time: adStart, end_time: adEnd };
            } else if (adStart <= currentAd.end_time + mergeThreshold) {
                currentAd.end_time = Math.max(currentAd.end_time, adEnd);
                currentAd.product_name = `${currentAd.product_name} | ${ad.product_name}`;
                currentAd.ad_content = `${currentAd.ad_content}\n---\n${ad.ad_content}`;
            } else {
                mergedAds.push({
                    ...currentAd,
                    start_time: currentAd.start_time.toFixed(2),
                    end_time: currentAd.end_time.toFixed(2)
                });
                currentAd = { ...ad, start_time: adStart, end_time: adEnd };
            }
        }
        if (currentAd) {
            mergedAds.push({
                ...currentAd,
                start_time: currentAd.start_time.toFixed(2),
                end_time: currentAd.end_time.toFixed(2)
            });
        }

        const correctedAdsData = {
            ads: mergedAds,
            msg: mergedAds.length > 0 ? "识别到广告" : "未识别到广告"
        };

        const submitButton = popup.querySelector('#submit-button');
        if(submitButton) submitButton.disabled = true; submitButton.textContent = '提交中...';

        try {
            if(window.confirm("确定提交？这将覆盖之前的记录。")) {      
                await submitCorrection(correctedAdsData, '纠错提交成功！', 'artificial');
            }else {
                showPopup('取消提交');
                if(submitButton) submitButton.disabled = false; submitButton.textContent = '提交';
            }
        } catch (error) {
             if(submitButton) submitButton.disabled = false; submitButton.textContent = '提交';
        }
    });
}

const adjustPopupPositions = () => {
    document.querySelectorAll('.popup').forEach((el, i, arr) => {
        el.style.bottom = `${100 + (arr.length - i - 1) * (el.offsetHeight + 10)}px`;
    });
};

const getTime = (seconds) => {
    const pad = n => n.toString().padStart(2, '0');
    return [
        Math.floor(seconds / 3600),
        Math.floor(seconds % 3600 / 60),
        Math.floor(seconds % 60)
    ].map(pad).join(':');
};

async function submitTranscriptionTask(audioURL) {
  const requestBody = {
    model: "paraformer-v2",
    input: { file_urls: [audioURL] },
    parameters: { channel_id: [0], language_hints: ["zh", "en", "ja", "yue", "ko", "de", "fr", "ru"] }
  };
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: "fetchDashScope",
      url: settings.aliApiURL,
      method: "POST",
      apiKey: settings.aliApiKey,
      body: requestBody
    }, response => {
      if (response.success) {
        resolve(response.data.output.task_id);
      } else {
        styleLog("Background fetch error: " + JSON.stringify(response.error));
        reject(new Error(response.error));
      }
    });
  });
}

async function waitForTaskCompletion(taskId) {
  while (true) {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "fetchDashScope",
          url: `${settings.aliTaskURL}${taskId}`,
          method: "GET",
          apiKey: settings.aliApiKey
        }, response => {
          if (response.success) {
            resolve(response.data);
          } else {
            styleLog("Background fetch error: " + JSON.stringify(response.error));
            reject(new Error(response.error));
          }
        });
      });

      styleLog("Task status: " + response?.output?.task_status);

      switch (response.output.task_status) {
        case "SUCCEEDED":
            showPopup("音频解析成功.");
            closePopup(popups.task);
            return response.output.results;
        case "FAILED":
            showPopup("音频解析失败.");
            closePopup(popups.task);
            //throw new Error(`Task failed: ${response.error?.message || "Unknown error"}`);
            return response.output.results;
        case "RUNNING":
        case "PENDING":
            if (!popups.task) {
                popups.task = showPopup("音频解析中...", 1);
                popups.others.push(popups.task);
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
            break;
        default:
            showPopup("音频解析遇到未知错误.");
            throw new Error(`Unknown task status: ${response.output.task_status}`);
      }
    } catch (error) {
      styleLog("Error checking task status: " + JSON.stringify(error));
      throw error;
    }
  }
}

async function fetchTranscription(transcriptionURL) {
    try {
        const response = await fetch(transcriptionURL);
        if (!response.ok) {
            throw new Error(`Failed to fetch transcription: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        styleLog("Error fetching transcription: " + JSON.stringify(error));
        throw error;
    }
}

function generateSubtitle(transcription) {
    const transcripts = JSON.parse(transcription).transcripts[0].sentences;
    let subtitle = "";
    
    transcripts.forEach(sentence => {
        const from = (sentence.begin_time / 1000).toFixed(2);
        const to = (sentence.end_time / 1000).toFixed(2);
        subtitle += `${from} --> ${to}\n${sentence.text}\n`;
    });
    
    return subtitle;
}

function updateTimes(cid, skip_time) {
     chrome.runtime.sendMessage({
        action: "dbQuery", url: settings.cfApiURL, method: "POST", cfApiKey: settings.cfApiKey,
        body: {
            sql: `UPDATE bilijump SET times = times + 1, skip_time = skip_time + ? WHERE cid = ?;`,
            params: [Math.ceil(skip_time), cid]
        }
    });
}

function correctButton(cid, data) {
    const adLength = data.ads.length;
    const adTime = data.ads.reduce((sum, ad) => sum + (parseFloat(ad.end_time) - parseFloat(ad.start_time)), 0);
    const iconUse = Math.max(adLength < 3 ? adLength : 3, adTime == 0 ? 0 : adTime <= 45 ? 1 : adTime <= 90 ? 2 : 3);

    let playerRight = document.querySelector('.bpx-player-control-bottom-right');
    var correct = document.createElement('div');
    correct.innerHTML = `<div class="bpx-player-ctrl-quality-result"><img src="${chrome.runtime.getURL('icons/icon48_red_'+iconUse+'.png')}" alt="icon" style="width: 22px; height: 22px; bottom: ${6-iconUse}px;"><span style="color: hsla(0,0%,100%,.8);">纠错  </span> </div>`;
    correct.id = 'bilibili-ai-skip-correct';
    correct.style.width = 'auto';
    correct.style.height = '22px';
    correct.style.marginRight = '20px';
    correct.addEventListener('click', () => showCorrectionPopup(cid, data));
    playerRight.prepend(correct);
}

async function activeLog() {
    let uid = await chrome.storage.sync.get('uid');
    chrome.runtime.sendMessage({
        action: "dbQuery", url: settings.cfApiURL, method: "POST", cfApiKey: settings.cfApiKey,
        body: {
            sql: `INSERT INTO bilijump_active(uid) VALUES(?);`,
            params: [uid.uid]
        }
    });
}

function styleLog(msg) {
    console.info("%c Bilibili AI Skip %c " + msg + " ", "padding: 2px 6px; border-radius: 3px 0 0 3px; color: #fff; background: #a19cef; font-weight: bold;", "padding: 2px 6px; border-radius: 0 3px 3px 0; color: #fff; background: #FF6699; font-weight: bold;")
}