let settings = {
    enabled: true,
    auto_jump: false,
    apiKey: 'sk-xxxxxx..',
    apiURL: 'https://www.openai.com/v1/chat/completions',
    apiModel: 'gpt-4o-mini',

    aliApiURL: "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription",
    aliTaskURL: "https://dashscope.aliyuncs.com/api/v1/tasks/",
    aliApiKey: "sk-xxxxxx..",
};
(async function() {
    let bid = '';

    chrome.storage.sync.get(['auto_jump', 'enabled', 'apiKey', 'apiURL', 'apiModel', 'aliApiKey'], function(result) {
        if (result.auto_jump !== undefined) settings.auto_jump = result.auto_jump;
        if (result.enabled !== undefined) settings.enabled = result.enabled;
        if (result.apiKey) settings.apiKey = result.apiKey;
        if (result.apiURL) settings.apiURL = result.apiURL;
        if (result.apiModel) settings.apiModel = result.apiModel;
        if (result.aliApiKey) settings.aliApiKey = result.aliApiKey;
        startAdSkipping();
    });

    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        if (message.action === 'getDefaultSettings') {
            sendResponse({ settings: {
                auto_jump: settings.auto_jump,
                enabled: settings.enabled,
                apiKey: settings.apiKey,
                apiURL: settings.apiURL,
                apiModel: settings.apiModel,
                aliApiKey: settings.aliApiKey
            }});
        }
    });
    
    chrome.storage.onChanged.addListener(function(changes, namespace) {
        if (changes.auto_jump) settings.auto_jump = changes.auto_jump.newValue;
        if (changes.enabled) {
            settings.enabled = changes.enabled.newValue;
            if (!settings.enabled) location.reload();
            else startAdSkipping();
        }
        if (changes.apiKey) settings.apiKey = changes.apiKey.newValue;
        if (changes.apiURL) settings.apiURL = changes.apiURL.newValue;
        if (changes.apiModel) settings.apiModel = changes.apiModel.newValue;
        if (changes.aliApiKey) settings.aliApiKey = changes.aliApiKey.newValue;
    });
    
    function startAdSkipping() {
        if (!settings.enabled) return;

        setInterval(async function(){
            var popup = document.createElement('div');
            const bvid = window.location.pathname.split('/')[2];
            if(bid !== bvid){
                bid = bvid;
                showPopup(`Ai skip start. auto=${settings.auto_jump}`);
                let video = document.querySelector('video');
                showPopup(`Video length：${Math.ceil(video.duration)}s.`);
                if(video.duration < 120) {
                    showPopup('Video too short, no skip.');
                    return;
                }
                try {
                    let adsData = await adRecognition(bvid);
                    for(let i = 0; i < 3 && adsData == null; i++) {
                        console.log(adsData);
                        showPopup('Re try get ad data.');
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
                            showPopup(`Will skip ${getTime(TARGET_TIME)} --> ${getTime(SKIP_TO_TIME)}`);
                            function skipVideoAD() {
                                if(popup) {
                                    popup.remove();
                                    if(window.location.pathname.split('/')[2] !== bvid) {
                                        clearInterval(intervalId);
                                        return;
                                    }
                                }
                                let video = document.querySelector('video');
                                if (!video) {
                                    showPopup('Not found video.');
                                    return;
                                }
                                let currentTime = video.currentTime;
                                if (currentTime > TARGET_TIME && currentTime < SKIP_TO_TIME) {
                                    if(settings.auto_jump){
                                        video.currentTime = SKIP_TO_TIME;
                                        showPopup('Ad skipped.');
                                        //clearInterval(intervalId);
                                    } else {
                                        const playerContainer = document.querySelector('.bpx-player-container');
                                        if (!playerContainer) {
                                            console.error('Player container not found.');
                                            return;
                                        }

                                        playerContainer.style.position = 'relative';

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
                                        popup.style.background = 'linear-gradient(135deg, rgba(0, 0, 0, 0.5), rgba(50, 50, 50, 0.8))';
                                        popup.style.color = '#fff';
                                        popup.style.borderRadius = '8px';
                                        popup.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.3)';
                                        popup.style.zIndex = '50';
                                        popup.style.fontFamily = 'Arial, sans-serif';
                                        popup.style.lineHeight = '1.5';
                                        popup.style.overflow = 'hidden';

                                        var closeButton = document.createElement('span');
                                        closeButton.innerHTML = '×';
                                        closeButton.style.position = 'absolute';
                                        closeButton.style.top = '10px';
                                        closeButton.style.right = '15px';
                                        closeButton.style.cursor = 'pointer';
                                        closeButton.style.fontSize = '18px';
                                        closeButton.style.color = '#fff';
                                        popup.appendChild(closeButton);

                                        playerContainer.appendChild(popup);

                                        closeButton.addEventListener('click', () => {
                                            clearInterval(intervalId);
                                            popup.remove();
                                        });
                                        popup.querySelector('#skip-button').addEventListener('click', () => {
                                            video.currentTime = SKIP_TO_TIME;
                                            showPopup('Ad skipped.');
                                            setTimeout(() => popup.remove(), 800);
                                        });
                                    }
                                }
                            }
                        }
                    } else showPopup('No found AD data.');
                } catch (error) {
                    console.error('Failed to fetch ad time:', error);
                }
            }
        }, 1000);
    }

    chrome.storage.onChanged.addListener(function(changes, namespace) {
        if (changes.auto_jump) settings.auto_jump = changes.auto_jump.newValue;
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
        return JSON.parse(`{"ads":[]}`);
    }
    if (!settings.apiURL) {
        showPopup("Please set API URL in extension settings");
        return JSON.parse(`{"ads":[]}`);
    }
    if (!settings.apiModel) {
        showPopup("Please set API Model in extension settings");
        return JSON.parse(`{"ads":[]}`);
    }
    if (!settings.aliApiKey) {
        showPopup("Please set Aliyun API Key in extension settings");
        return JSON.parse(`{"ads":[]}`);
    }

    try {
        let response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
            credentials: "include"
        });
        const videoData = await response.json();
        const aid = videoData.data.aid;
        const cid = videoData.data.cid;
        const title = videoData.data.title;
        showPopup(`Title: ${title}`);

        response = await fetch(`https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`, {
            credentials: "include"
        });
        const playerData = await response.json();
        const subtitleUrl = playerData.data.subtitle.subtitles ? playerData.data.subtitle.subtitles[0]?.subtitle_url : null;


        var subtitle = "";
        if (subtitleUrl) {
            showPopup("Use subtitle analysis.");
            response = await fetch(`https:${subtitleUrl}`);
            const subtitleData = await response.json();

            subtitleData.body.forEach(item => {
                subtitle += `${item.from} --> ${item.to}\n${item.content}\n`;
            });
        }else {
            showPopup("Use audio analysis.");
            response = await fetch(`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=0&fnver=0&fnval=80&fourk=1`, {
                credentials: "include"
            });
            const playerData = await response.json();
            const audioUrl = playerData.data.dash.audio ? playerData.data.dash.audio[0]?.base_url : null;

            const taskId = await submitTranscriptionTask(audioUrl);
            console.log("Task submitted successfully, Task ID:", taskId);

            const results = await waitForTaskCompletion(taskId);

            for (const result of results) {
                if (result.subtask_status === "SUCCEEDED") {
                    const transcription = await fetchTranscription(result.transcription_url);
                    subtitle = generateSubtitle(transcription);
                    //console.log("Subtitle content:\n", subtitle);
                } else {
                    console.log(`Subtask failed for file ${result.file_url}, status: ${result.subtask_status}`);
                }
            }
        }
        

        if (subtitle == "") {
            return JSON.parse(`{"ads":[]}`);
        }
        const aiResponse = await callOpenAI(subtitle);

        const jsonMatch = aiResponse.match(/```json([\s\S]*?)```/);
        if (jsonMatch && jsonMatch[1]) {
            const jsonContent = jsonMatch[1].trim();
            console.log(`bvid: ${bvid}, ad data: ${jsonContent}`);
            return JSON.parse(jsonContent);
        }

        return JSON.parse(`{"ads":[]}`);

    } catch (error) {
        showPopup("Error: " + error);
        console.error("Error:", error);
        return null;
    }

    async function callOpenAI(subtitle) {
        const requestData = {
            model: settings.apiModel,
            messages: [
                {
                    role: "system",
                    content: "你是一个广告识别助手，我会给你发送一份视频的字幕，请识别广告在该视频中的开始与结束时间，产品名称，广告内容"
                },
                {
                    role: "system",
                    content: "如果结果匹配则继续检测原始内容前后上下文是否与广告有关联，如果有关联则把相关内容的时间范围也包括在内"
                },
                {
                    role: "system",
                    content: "检查结果是否有错别字，如果有请修正，然后请严格以这样的json的格式返回：{\n  \"ads\": [\n    {\n      \"start_time\": \"335.88\",\n      \"end_time\": \"425.34\",\n      \"product_name\": \"铜池扫阵杀菌牙刷\",\n      \"ad_content\": \"介绍了一款电动牙刷，强调其杀菌功能、强力吸盘、便携性、智能提醒、软胶包裹刷头、磁吸充电等特点，并鼓励用户购买，享受优惠和赠品。\"\n    }\n  ]\n}"
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
            console.error("API error:", data.error.message);
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

function showPopup(msg) {
    var popup = document.createElement('div');
    popup.innerText = msg;
    popup.style.position = 'absolute';
    popup.style.bottom = `${80 + popupCount * 60}px`;
    popup.style.right = '10px';
    popup.style.padding = '10px';
    popup.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
    popup.style.color = '#fff';
    popup.style.borderRadius = '5px';
    popup.style.zIndex = '1000';
    popup.classList.add('popup');

    var playerContainer = document.querySelector('.bpx-player-container');
    if (playerContainer) {
        playerContainer.appendChild(popup);
        popupCount++;

        adjustPopupPositions();

        setTimeout(function() {
            popup.remove();
            popupCount--;
            adjustPopupPositions();
        }, 7000);
    } else {
        console.error('Player container not found.');
    }
}

function adjustPopupPositions() {
    let remainingPopups = document.querySelectorAll('.popup');
    remainingPopups.forEach((el, index) => {
        el.style.bottom = `${60 + (remainingPopups.length - index - 1) * (el.offsetHeight + 10)}px`;
    });
}

function getTime(time) {
    let h = parseInt(time / 60 / 60 % 24);
    h = h < 10 ? '0' + h : h;
    let m = parseInt(time / 60 % 60);
    m = m < 10 ? '0' + m : m;
    let s = parseInt(time % 60);
    s = s < 10 ? '0' + s : s;
    return h + ":" + m + ":" + s;
}

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
            showPopup("Audio analysis successfully.");
          return response.output.results;
        case "FAILED":
          showPopup("Audio analysis is failed.");
          throw new Error(`Task failed: ${response.error?.message || "Unknown error"}`);
        case "RUNNING":
        case "PENDING":
          showPopup("Audio analysis in progress, waiting...");
          await new Promise(resolve => setTimeout(resolve, 5000));
          break;
        default:
        showPopup("Audio analysis unknown error.");
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