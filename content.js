console.log('[matiks-extension] content script loaded');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'matiks.pageRead') {
    const result = {
      title: document.title,
      url: location.href,
      friendNodes: Array.from(document.querySelectorAll('[data-user-id]')).map((node) => node.getAttribute('data-user-id'))
    };

    sendResponse(result);
    return true;
  }
});
