function openAathiMoiApp() {
  const appUrl = chrome.runtime.getURL('index.html');
  if (chrome.windows && chrome.windows.create) {
    chrome.windows.create({
      url: appUrl,
      type: 'popup',
      state: 'maximized'
    }, () => {
      if (chrome.runtime.lastError && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: appUrl });
      }
    });
  } else if (chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url: appUrl });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  openAathiMoiApp();
});

chrome.runtime.onStartup.addListener(() => {
  openAathiMoiApp();
});

chrome.action.onClicked.addListener(() => {
  openAathiMoiApp();
});
