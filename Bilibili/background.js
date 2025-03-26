chrome.contextMenus.create({
    id: "visit-github",
    title: "GitHub",
    contexts: ["action"]
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "visit-github") {
        chrome.tabs.create({
            url: "https://github.com/qingmeng1/bilijump-ai"
        });
    }
});