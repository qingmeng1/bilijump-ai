let settings = {
    enabled: true,
    autoJump: false,
    apiKey: '',
    apiURL: 'https://www.openai.com/v1/chat/completions',
    apiModel: 'gpt-4o-mini',

    audioEnabled: true,
    autoAudio: false,
    aliApiURL: "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription",
    aliTaskURL: "https://dashscope.aliyuncs.com/api/v1/tasks/",
    aliApiKey: "",
};

const configKeys = ['autoJump','enabled','apiKey','apiURL','apiModel','audioEnabled','autoAudio','aliApiKey'];
var videoPopup;
var taskPopup;
var aiPopup;
var adPopups = [];

(async function() {
    chrome.storage.sync.get(configKeys, res => {
        configKeys.forEach(k => settings[k] = res[k] ?? settings[k]);
        startAdSkipping();
    });

    chrome.runtime.onMessage.addListener(({ action }, _, res) => 
        action === 'getDefaultSettings' && res({ 
            settings: Object.fromEntries(configKeys.map(k => [k, settings[k]])) 
        })
    );

    chrome.storage.onChanged.addListener(changes => 
        Object.entries(changes).forEach(([k, v]) => {
            if (!configKeys.includes(k)) return;
            settings[k] = v.newValue;
            k === 'enabled' && (v.newValue ? startAdSkipping() : location.reload());
        })
    );


    let bid = '';
    function startAdSkipping() {
        if (!settings.enabled) return;

        showPopup(`AI skip start.`);
        showPopup(`自动跳过：${settings.autoJump}`);
        showPopup(`音频分析：${settings.audioEnabled}`);
        setInterval(async function(){
            const bvid = window.location.pathname.split('/')[2];
            if(bid !== bvid){
                bid = bvid;
                if(videoPopup) closePopup(videoPopup);
                if(taskPopup) closePopup(taskPopup);
                if(aiPopup) closePopup(aiPopup);

                let video = document.querySelector('video');
                while(!video.duration) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    video = document.querySelector('video');
                }
                showPopup(`视频长度：${Math.ceil(video.duration)}s`);
                if((video?.duration || 0) < 120) {
                    console.log(video.duration);
                    showPopup('视频过短，无需分析广告');
                    return;
                }
                try {
                    let adsData = await adRecognition(bvid);
                    for(let i = 1; i < 3 && adsData == null; i++) {
                        console.log(adsData);
                        showPopup('Re-fetch AD data.');
                        adsData = await adRecognition(bvid);
                    }
                    console.log(`Skip data`);
                    console.log(adsData);
                    if(adsData && adsData.ads.length >= 1) {
                        for (let i = 0; i < adsData.ads.length; i++) {
                            let TARGET_TIME = adsData.ads[i].start_time;
                            let SKIP_TO_TIME = adsData.ads[i].end_time;
                            let product_name = adsData.ads[i].product_name;
                            let ad_content = adsData.ads[i].ad_content;
                            let intervalId = setInterval(skipVideoAD, 1000);
                            showPopup(`广告时间：${getTime(TARGET_TIME)} --> ${getTime(SKIP_TO_TIME)}`);
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
                                        //clearInterval(intervalId);
                                    } else {
                                        if(adPopups[i]) {
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
                                            clearInterval(intervalId);
                                            adPopups[i].remove();
                                        });
                                        popup.querySelector('#skip-button').addEventListener('click', () => {
                                            popup.style.background = 'linear-gradient(135deg, rgba(0, 0, 0, 0.3), rgba(50, 50, 50, 0.3))';
                                            adPopups[i].remove();
                                            adPopups[i] = undefined;
                                            video.currentTime = SKIP_TO_TIME;
                                            showPopup('广告已跳过.');
                                        });

                                        adPopups[i] = popup;
                                    }
                                }else if(adPopups[i]) {
                                    adPopups[i].remove();
                                    adPopups[i] = undefined;
                                    if(window.location.pathname.split('/')[2] !== bvid) {
                                        clearInterval(intervalId);
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

    chrome.storage.onChanged.addListener(function(changes, namespace) {
        if (changes.autoJump) settings.autoJump = changes.autoJump.newValue;
        if (changes.enabled) {
            settings.enabled = changes.enabled.newValue;
            if (!settings.enabled) location.reload();
            else startAdSkipping();
        }
        if (changes.apiKey) settings.apiKey = changes.apiKey.newValue;
        if (changes.apiURL) settings.apiURL = changes.apiURL.newValue;
        if (changes.apiModel) settings.apiModel = changes.apiModel.newValue;
    });
})();

async function adRecognition(bvid) {
    if (!settings.apiKey) {
        showPopup("Please set API Key in extension settings");
        return JSON.parse(`{"ads":[], "msg":"Please set API Key"}`);
    }
    if (!settings.apiURL) {
        showPopup("Please set API URL in extension settings");
        return JSON.parse(`{"ads":[], "msg":"Please set API URL"}`);
    }
    if (!settings.apiModel) {
        showPopup("Please set API Model in extension settings");
        return JSON.parse(`{"ads":[], "msg":"Please set AI Model"}`);
    }
    if (!settings.aliApiKey) {
        showPopup("Please set Aliyun API Key in extension settings");
        return JSON.parse(`{"ads":[], "msg":"Please set Aliyun API Key"}`);
    }

    try {
        let response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
            credentials: "include"
        });
        const videoData = await response.json();
        const aid = videoData.data.aid;
        const cid = videoData.data.cid;
        const title = videoData.data.title;
        showPopup(`bvid: ${bvid}`);

        response = await fetch(`https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`, {
            credentials: "include"
        });
        const playerData = await response.json();
        const subtitleUrl = playerData.data.subtitle.subtitles ? playerData.data.subtitle.subtitles[0]?.subtitle_url : null;


        var subtitle = "";
        if (subtitleUrl) {
            showPopup("使用字幕分析.");
            response = await fetch(`https:${subtitleUrl}`);
            const subtitleData = await response.json();

            subtitleData.body.forEach(item => {
                subtitle += `${item.from} --> ${item.to}\n${item.content}\n`;
            });
        }else if(settings.audioEnabled) {
            showPopup("60s 后解锁音频分析.");
            await new Promise(resolve => setTimeout(resolve, document.querySelector('video').currentTime < 60 ? (60 - document.querySelector('video').currentTime) * 1000 : 0));
            if (!settings.autoAudio && ! await checkPopup()) {
                return JSON.parse(`{"ads":[], "msg":"用户拒绝音频分析, 识别结束."}`);
            }

            showPopup("使用音频分析.");
            response = await fetch(`https://api.bilibili.com/x/player/wbi/playurl?bvid=${bvid}&cid=${cid}&qn=0&fnver=0&fnval=80&fourk=1`, {
                credentials: "include"
            });
            const playerData = await response.json();
            const audioUrl = playerData.data.dash.audio ? playerData.data.dash.audio[0]?.base_url : null;

            showPopup("提交音频文件.");
            console.log("audioUrl: " + audioUrl);
            const taskId = await submitTranscriptionTask(audioUrl);
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
                        return JSON.parse(`{"ads":[], "msg":"No valid fragment."}`);
                    } else {
                        return JSON.parse(`{"ads":[], "msg":"音频解析失败：${result.message}"}`);
                    }
                }
            }
        }
        

        if (subtitle == "") {
            return JSON.parse(`{"ads":[], "msg":"无解析内容."}`);
        }

        aiPopup = showPopup("AI 分析中...",1);
        const aiResponse = await callOpenAI(subtitle);
        closePopup(aiPopup);


        if (aiResponse == "") {
            return JSON.parse(`{"ads":[], "msg":"AI 解析失败."}`);
        }

        const jsonMatch = aiResponse.match(/```json([\s\S]*?)```/);
        if (jsonMatch && jsonMatch[1]) {
            const jsonContent = jsonMatch[1].trim();
            console.log(`bvid: ${bvid}, ad data: ${jsonContent}`);
            return JSON.parse(jsonContent);
        }
        try {
            return JSON.parse(aiResponse);
        } catch (error) {
            return JSON.parse(`{"ads":[], "msg":"AI 分析结果获取失败."}` + error);
        }
    } catch (error) {
        showPopup("Error: " + error);
        console.log("Error:", error);
        return null;
    }

    async function callOpenAI(subtitle) {
        const requestData = {
            model: settings.apiModel,
            messages: [
                {
                    role: "system",
                    content: "你是一个广告识别助手，我会给你发送一份视频的字幕，请识别广告在该视频中的开始与结束时间，产品名称，广告内容，只需要识别20秒以上的内容"
                },
                {
                    role: "system",
                    content: "如果结果匹配则继续检测原始内容前后上下文是否与广告有关联，如果有关联则把相关内容的时间范围也包括在内"
                },
                {
                    role: "system",
                    content: "检查产品名称和广告内容是否有错别字，如果有请修正，广告内容不能太长，请严格以这样的json的格式返回：{\n  \"ads\": [\n    {\n      \"start_time\": \"335.88\",\n      \"end_time\": \"425.34\",\n      \"product_name\": \"产品名称\",\n      \"ad_content\": \"广告内容。\"\n    },\n  \"msg\": \"是否识别到广告\"\n  ]\n}"
                },
                {
                    role: "user",
                    content: subtitle
                }
            ]
        };

        const response = await fetch(settings.apiURL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify(requestData)
        });

        const data = await response.json();

        if (data.error?.message) {
            showPopup("API error: " + data.error.message);
            console.log("API error:", data.error.message);
            return "";
        }

        if (!data.choices?.length) {
            showPopup("No valid response received");
            return "";
        }

        return data.choices[0].message.content;
    }
}

let popupCount = 0;

function closePopup(popup) {
    popup.remove();
    popupCount--;
    adjustPopupPositions();
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
        if (persist == undefined) {
            setTimeout(function() {
                closePopup(popup);
            }, 7000);
        }
    } else {
        console.error('Player container not found.');
    }
    return popup;
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
        videoPopup = popup;
    })
    return userChoice;
}

const adjustPopupPositions = () => {
    document.querySelectorAll('.popup').forEach((el, i, arr) => {
        el.style.bottom = `${60 + (arr.length - i - 1) * (el.offsetHeight + 10)}px`;
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
    parameters: { channel_id: [0], language_hints: ["zh", "en"] }
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
        console.error("Background fetch error:", response.error);
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
            closePopup(taskPopup);
            return response.output.results;
        case "FAILED":
            showPopup("音频解析失败.");
            closePopup(taskPopup);
            //throw new Error(`Task failed: ${response.error?.message || "Unknown error"}`);
            return response.output.results;
        case "RUNNING":
        case "PENDING":
            if (taskPopup == null) {
                taskPopup = showPopup("音频解析中...", 1);
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