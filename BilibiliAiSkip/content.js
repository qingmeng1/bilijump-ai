let settings;
let banModels;

const configKeys = ['autoJump','enabled','apiKey','apiURL','apiModel','audioEnabled','autoAudio','aliApiKey'];
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


    let bid = '', pid = '', intervals = [];
    function startAdSkipping() {
        if (!settings.enabled) return;

        showPopup(`AI skip start.`);
        //showPopup(`自动跳过：${settings.autoJump}`);
        //showPopup(`音频分析：${settings.audioEnabled}`);
        setInterval(async function(){
            const bvid = window.location.pathname.split('/')[2], pvid = new URLSearchParams(window.location.search).get('p');;
            if(bid !== bvid || pid !== pvid){
                bid = bvid, pid = pvid;

                while (intervals.length) clearInterval(intervals.shift());
                while (popups.others.length) popups.others.shift()?.remove();
                while (popups.ads.length) popups.ads.shift()?.remove();

                closePopup(popups.audioCheck);
                closePopup(popups.task);
                closePopup(popups.ai);

                let video = document.querySelector('video');
                while(!video?.duration) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    video = document.querySelector('video');
                }
                showPopup(`视频长度：${Math.ceil(video.duration)}s`);
                if((video?.duration || 0) < 120) {
                    console.log(video.duration);
                    showPopup('短视频，无需分析广告');
                    return;
                }
                try {
                    let adsData = await adRecognition(bvid,pvid);
                    for(let i = 1; i < 3 && adsData == null; i++) {
                        console.log(adsData);
                        showPopup('Re-fetch AD data.');
                        adsData = await adRecognition(bvid,pvid);
                    }
                    console.log(`Skip data`);
                    console.log(adsData);

                    new Promise(async resolve => {
                        let curr_progress = document.querySelectorAll('.bpx-player-progress-schedule-current');
                        while(!curr_progress || curr_progress?.length == 0) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            curr_progress = document.querySelectorAll('.bpx-player-progress-schedule-current');
                        }
                        for (var p = 0; p < curr_progress.length; p++) {
                            curr_progress[p].style.backgroundColor = '#13c58ae6';
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
                            showPopup(`广告时间：${getTime(TARGET_TIME)} --> ${getTime(SKIP_TO_TIME)}`);
                            showPopup(`产品名称：${product_name}`);
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
                                    showPopup('没有找到视频组件.');
                                    return;
                                }
                                let currentTime = video.currentTime;
                                if (currentTime > TARGET_TIME && currentTime < SKIP_TO_TIME) {
                                    if(settings.autoJump){
                                        video.currentTime = SKIP_TO_TIME;
                                        showPopup('广告已跳过.');
                                        updateTimes(now_cid, SKIP_TO_TIME - TARGET_TIME);
                                        //clearInterval(intervals[i]);
                                    } else {
                                        if(popups.ads[i]) {
                                            document.querySelector('#skip-button').innerHTML = Math.ceil(SKIP_TO_TIME - currentTime);
                                            return;
                                        }
                                        const playerContainer = document.querySelector('.bpx-player-container');
                                        if (!playerContainer) {
                                            console.error('Player container not found.');
                                            return;
                                        }

                                        playerContainer.style.position = 'relative';

                                        var popup = document.createElement('div');
                                        popup.innerHTML = `
                                            <div style="display: flex; align-items: flex-start; height: 100%;">
                                                <div style="width: 2px; height: 100%; background-color: #ff0000; margin-right: 10px;"></div>
                                                <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                                                    <div style="font-weight: bold; font-size: 16px;">广告 · ${product_name}</div>
                                                    <div style="height: 60px; display: flex; align-items: center; flex: 1;">
                                                        <div style="width: 40px; height: 40px; background-color: rgba(255, 255, 255, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 10px; flex-shrink: 0;">
                                                            <button id="skip-button" style="color: #fff; font-size: 14px; font-weight: bold; background: linear-gradient(135deg, #48D1CC, #48D1CC); border: none; border-radius: 50%; width: 100%; height: 100%; cursor: pointer; transition: all 0.3s ease;">${Math.ceil(SKIP_TO_TIME - currentTime)}</button>
                                                        </div>
                                                        <div style="overflow: hidden; flex: 1;">
                                                            <div style="word-wrap: break-word;">${ad_content}</div>
                                                        </div>
                                                    </div>
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
                                            showPopup('广告已跳过.');
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
                    } else showPopup(adsData?.msg || "无有效数据");
                } catch (error) {
                    console.error('Failed to fetch ad time:', error);
                }
            }
        }, 1000);
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
        let response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {credentials: "include"});
        const videoData = await response.json(), aid = videoData.data.aid, cid = videoData.data.pages?.[pvid?pvid-1:pvid]?.cid || videoData.data.cid, title = videoData.data.title;
        now_cid = cid;

        //showPopup(`视频ID: ${bvid}`);
        //showPopup(`CID: ${cid}`);
        console.log(`PID: ${pvid}`);

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
                    console.log("Background fetch error:", response.error);
                    reject(new Error(response.error));
                }
            });
        });

        if(dbResults) {
            showPopup(`使用云端数据, 模型: ${dbResults?.model}.`);
            return JSON.parse(dbResults?.data);
        }

        for(const key of ["apiKey", "apiURL", "apiModel"]) {
            if(!settings[key]) {
                showPopup(`Please set ${key} in extension settings`);
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
            showPopup("使用字幕分析.");
            response = await fetch(`https:${subtitleUrl}`);
            const subtitleData = await response.json();

            subtitleData.body.forEach(item => {
                subtitle += `${item.from} --> ${item.to}\n${item.content}\n`;
            });
        }else if(settings.audioEnabled) {
            if(!settings["aliApiKey"]) {
                showPopup(`Please set aliApiKey in extension settings`);
                return {ads:[], msg:"Please set aliApiKey"};
            }
            type = '音频';
            showPopup("01:00 后解锁音频分析.");
            while(document.querySelector('video').currentTime < 60) {
                if(window.location.pathname.split('/')[2] !== bvid || new URLSearchParams(window.location.search).get('p') !== pvid) {
                    return {ads:[], msg:"上下文已切换."};
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            //await new Promise(resolve => setTimeout(resolve, document.querySelector('video').currentTime < 60 ? (60 - document.querySelector('video').currentTime) * 1000 : 0));
            if (!settings.autoAudio && ! await checkPopup()) {
                return {ads:[], msg:"用户拒绝音频分析, 识别结束."};
            }

            showPopup("使用音频分析.");
            response = await fetch(`https://api.bilibili.com/x/player/wbi/playurl?bvid=${bvid}&cid=${cid}&qn=0&fnver=0&fnval=80&fourk=1`, {
                credentials: "include"
            });
            const playerData = await response.json(), audioUrl = playerData?.data?.dash?.audio?.[0]?.base_url;

            if(!audioUrl) {
                return {ads:[], msg:"获取不到音频文件."};
            }
            showPopup("提交音频文件.");
            console.log("audioUrl: " + audioUrl);
            const taskId = await submitTranscriptionTask("https://bili.oooo.uno?url="+encodeURIComponent(audioUrl));
            console.log("Task submitted successfully, Task ID:", taskId);

            showPopup("等待音频分析结果.");
            const results = await waitForTaskCompletion(taskId);

            for (const result of results) {
                if (result.subtask_status === "SUCCEEDED") {
                    const transcription = await fetchTranscription(result.transcription_url);
                    subtitle = generateSubtitle(transcription);
                    //console.log("Subtitle content:\n", subtitle);
                } else {
                    console.log(`Subtask failed for file ${result.file_url}, status: ${result.subtask_status}`);
                    if(result.code === "SUCCESS_WITH_NO_VALID_FRAGMENT") {
                        return {ads:[], msg:"音频无有效片段."};
                    } else {
                        return {ads:[], msg:`音频解析失败：${result.message}`};
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
        console.log(`CID: ${cid}, ad data: ${JSON.stringify(resultAD)}`);
        chrome.runtime.sendMessage({
            action: "dbQuery", url: settings.cfApiURL, method: "POST", cfApiKey: settings.cfApiKey,
            body: {
                sql: `INSERT INTO bilijump (aid, bid, cid, data, subtitle, title, type, model, tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(cid) DO UPDATE SET data = excluded.data;`,
                params: [aid, bvid, cid, JSON.stringify(resultAD), subtitle, title, type, settings.apiModel, total_tokens]
            }
        });
        return resultAD;
    } catch (error) {
        showPopup("Error: " + error);
        console.log("Error:", error);
        if(popups.audioCheck) closePopup(popups.audioCheck);
        if(popups.task) closePopup(popups.task);
        if(popups.ai) closePopup(popups.ai);
        return null;
    }

    async function callOpenAI(subtitle) {
        const requestData = {
            model: settings.apiModel,
            messages: [ {role: "system", content: `
请按照以下步骤分析提供的字幕内容（包含标题、时间轴和文本），识别可能存在的广告段落：

1. **基础特征扫描**

* 关键词检测：查找以下类型词汇
  √ 直接推广类（赞助、促销、限时优惠）
  √ 联系信息类（官网、二维码、400电话）
  √ 品牌标识类（"点击下方链接"、"关注公众号"）
* 结构特征分析：
  √ 固定开头/结尾模板（如"本节目由...赞助"）
  √ 重复出现的品牌名称（≥3次非常规提及）

2. **上下文关联分析**

* 判断内容与前后文的相关性
* 检测突兀的产品功能介绍（如突然插入设备参数说明）
* 注意软性植入（主持人非自然口播提及产品）

3. **时空特征识别**

* 高频广告位置标记（片头15秒/片中转场处）
* 异常时长段落（超过常规字幕时长的独立内容块）


**附加要求：**

* 区分赞助声明与实质广告内容
* 生成品牌提及频率统计表
* 非中文内容需要先翻译为中文再识别
* 返回的产品名称和广告内容不能太长
* 正确识别时间轴与字幕内容的顺序，时间轴在字幕内容上方，示例：397.17 --> 399.24\n这就要打开美团外卖app了
* 如果多段广告的开始与结束时间范围重叠了就合并为一条
* 如果广告时间从单段字幕中间部分开始，以单段时长/文字占比作为开始时间，例如："447.34 --> 458.29\n只能说呢啊美国人眼里也是有活的啊，顺带一说呢，更有活的是火凤燎原第二季，每周四哔哩哔哩独家热播，感兴趣的同学们可以追番观看啊。", 字幕内容长度为 63，广告开始为第 17 个字符，公式为 (17/63)*(458.29-447.23)+447.23=450.214，开始时间为450.214
* 如果广告片段少于 15 秒，忽略该段广告

请把产品名称与广告内容精简后严格以这样的json的格式返回：
        {"ads": [{"start_time": "335.88","end_time": "425.34","product_name": "产品名称","ad_content": "广告内容"},"msg": "识别到广告"]}`},
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
            console.log("API error:", data.error.message);
            return "";
        }

        if (!data.choices?.length) {
            showPopup("未收到有效响应.");
            return "";
        }
        return data;
    }
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
                    <button id="yes-button" style="padding: 5px 15px; background: #1a73e8; color: #fff; border: none; border-radius: 4px; cursor: pointer;">是</button>
                    <button id="no-button" style="padding: 5px 15px; background: #ccc; color: #333; border: none; border-radius: 4px; cursor: pointer;">否</button>
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
            console.error('Player container not found.');
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
    console.log(msg);
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
        console.error('Player container not found.');
    }
    return popup;
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
        console.log("Background fetch error:", response.error);
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
            console.log("Background fetch error:", response.error);
            reject(new Error(response.error));
          }
        });
      });

      console.log("Task status:", response);

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
      console.log("Error checking task status:", error);
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
        console.log("Error fetching transcription:", error);
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