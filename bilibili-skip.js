// ==UserScript==
// @name         Bilibili Ai Skip
// @namespace    http://qingmeng.org/
// @version      1.0
// @description  Bilibili AI Skip
// @author       qingmeng
// @match        *://*.bilibili.com/video/*
// @grant        none
// ==/UserScript==

(async function() {
    let auto_jump = false;
    let bid = '';
    setInterval(async function(){
        var popup = document.createElement('div');;
        const bvid = window.location.pathname.split('/')[2];
        if(bid != bvid){
            bid = bvid;
            console.log(`Ai skip start. auto=${auto_jump}`);
            let adTimeUrl = `http://localhost:8181/adtime?bvid=${bvid}`;
            let video = document.querySelector('video');
            console.log(`video length：${video.duration}s.`);
            if(video.duration < 60) {
                console.log('the video is too short, no need to skip.');
                return
            }
            try {
                //let adsResponse = await adRecognition(bvid);
                let adsData = await adRecognition(bvid);
                for(i = 0; i <3 && adsData == null; i++) {
                    console.log(adsData);
                    console.log('re try get ad data.');
                    adsData = await adRecognition(bvid);
                }
                console.log(`skip data`);
                console.log(adsData);
                if(adsData.ads.length >= 1) {
                    for (var i=0;i<adsData.ads.length;i++) {
                        let TARGET_TIME = adsData.ads[i].start_time;
                        let SKIP_TO_TIME = adsData.ads[i].end_time;
                        let product_name = adsData.ads[i].product_name;
                        let ad_content = adsData.ads[i].ad_content;
                        let intervalId = setInterval(skipVideoAD, 1000);
                        console.log(`will skip ${TARGET_TIME} --> ${SKIP_TO_TIME}`);
                        function skipVideoAD() {
                             if(popup != undefined) {
                                 popup.remove();
                                 if(window.location.pathname.split('/')[2] != bvid) {
                                     clearInterval(intervalId);
                                     return;
                                 }
                             }
                            let video = document.querySelector('video');
                            if (!video) {
                                console.log('not fount video.');
                                return;
                            }
                            let currentTime = video.currentTime;
                            if (currentTime > TARGET_TIME && currentTime < SKIP_TO_TIME) {
                                if(auto_jump){
                                    video.currentTime = SKIP_TO_TIME;
                                    console.log('ad skipped.');
                                    clearInterval(intervalId);
                                }else{
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
          <div style="font-weight: bold; font-size: 16px;">广告 · ` + product_name + `</div>
          <div style="height: 60px; display: flex; align-items: center; flex: 1;">
            <div style="width: 40px; height: 40px; background-color: rgba(255, 255, 255, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 10px; flex-shrink: 0;">
              <button id="skip-button" style="color: #fff; font-size: 14px; font-weight: bold; background: linear-gradient(135deg, #48D1CC, #48D1CC); border: none; border-radius: 50%; width: 100%; height: 100%; cursor: pointer; transition: all 0.3s ease;">${Math.ceil(SKIP_TO_TIME - currentTime)}</button>
            </div>
            <div style="overflow: hidden; flex: 1;">
              <div style="word-wrap: break-word;">` + ad_content + `</div>
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

                                    /*setTimeout(() => {
                                    popup.style.opacity = '0';
                                    setTimeout(() => popup.remove(), 300);
                                }, 50000);*/

                                    closeButton.addEventListener('click', () => {
                                        clearInterval(intervalId);
                                        popup.remove()
                                    });
                                    popup.querySelector('#skip-button').addEventListener('click', () => {
                                        video.currentTime = SKIP_TO_TIME;
                                        console.log('ad skipped.');
                                        //clearInterval(intervalId);
                                        //popup.style.opacity = '0.4';
                                        setTimeout(() => popup.remove(), 800)
                                    });
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('failed to fetch ad time:', error);
            }
        }
    }, 1000);
})();


async function adRecognition(bvid) {
    const apiKey = "sk-NHzvSvB3mlURAXXXX2f53BeB44402Bb86C9XXXXa5096";
    const apiURL = "https://www.gptapi.us/v1/chat/completions";
    const apiModel = "gpt-4o-mini";

    try {
        let response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
            credentials: "include"
        });
        const videoData = await response.json();
        const aid = videoData.data.aid;
        const cid = videoData.data.cid;
        const title = videoData.data.title;
        console.log(`title: ${title}`);

        response = await fetch(`https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`, {
            credentials: "include"
        });
        const playerData = await response.json();
        const subtitleUrl = playerData.data.subtitle.subtitles ? playerData.data.subtitle.subtitles[0]?.subtitle_url : null;

        if (!subtitleUrl) {
            console.log("subtitle is empty.");
            return JSON.parse(`{"ads":[]}`);
        }

        response = await fetch(`https:${subtitleUrl}`);
        const subtitleData = await response.json();

        let subtitle = "";
        subtitleData.body.forEach(item => {
            subtitle += `${item.from} --> ${item.to}\n${item.content}\n`;
        });

        const aiResponse = await callOpenAI(subtitle);

        const jsonMatch = aiResponse.match(/```json([\s\S]*?)```/);
        if (jsonMatch && jsonMatch[1]) {
            const jsonContent = jsonMatch[1].trim();
            console.log(`bvid: ${bvid}, ad data: ${jsonContent}`);
            return JSON.parse(jsonContent);
        }

       return JSON.parse(`{"ads":[]}`);

    } catch (error) {
        console.error("Error:", error);
        return null;
    }

    async function callOpenAI(subtitle) {
        const requestData = {
            model: apiModel,
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

        const response = await fetch(apiURL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestData)
        });

        const data = await response.json();

        if (data.error?.message) {
            console.error("API error:", data.error.message);
            return "";
        }

        if (!data.choices?.length) {
            console.log("No valid response received");
            return "";
        }

        return data.choices[0].message.content;
    }
}