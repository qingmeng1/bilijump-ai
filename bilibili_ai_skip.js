// ==UserScript==
// @name         Bilibili Ai Skip
// @namespace    http://oooo.uno/
// @version      1.0
// @description  Bilibili AI Skip
// @author       qingmeng1
// @match        *://*.bilibili.com/video/*
// @grant        none
// ==/UserScript==

(async function() {
    let bid = '';
    setInterval(async function(){
        const bvid = window.location.pathname.split('/')[2];
        if(bid != bvid){
            bid = bvid;
            console.log('Ai skip start.');
            let adTimeUrl = `http://localhost:8181/adtime?bvid=${bvid}`;
            let video = document.querySelector('video');
            console.log(`video length：${video.duration}`);
            if(video.duration < 60) {
                console.log('the video is too short, no need to skip.');
                return
            }
            try {
                let adTimeResponse = await fetch(adTimeUrl);
                let adTimeData = await adTimeResponse.json();
                console.log(`skip data ${adTimeData}.`);
                if(adTimeData.length > 1) {
                    for (var i=0;i<adTimeData.length;i++) {
                        let TARGET_TIME = adTimeData[i];
                        let SKIP_TO_TIME = adTimeData[++i];
                        let intervalId = setInterval(skipVideoAD, 1000);
                        console.log(`will skip ${TARGET_TIME} --> ${SKIP_TO_TIME}.`);
                        function skipVideoAD() {
                            let video = document.querySelector('video');
                            if (!video) {
                                console.log('not fount video.');
                                return;
                            }
                            let currentTime = video.currentTime;
                            if (currentTime > TARGET_TIME && currentTime < SKIP_TO_TIME) {
                                video.currentTime = SKIP_TO_TIME;
                                console.log('ad skipped.');
                                clearInterval(intervalId);
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