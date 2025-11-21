let offscreenPromise;

async function ensureOffscreen() {
    if (offscreenPromise) return offscreenPromise;

    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: ['offscreen.html']
    });

    if (existingContexts.length > 0) return;

    try {
        offscreenPromise = chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'Volume control'
        });
        await offscreenPromise;
    } catch (e) {
        if (!e.message.includes('Only a single offscreen')) {
            console.error('Offscreen creation failed:', e);
        }
    } finally {
        offscreenPromise = null;
    }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'setVolume') {
        handleSetVolume(msg);
    } else if (msg.action === 'getStreamId') {
        // Offscreen yêu cầu lấy StreamID
        chrome.tabCapture.getMediaStreamId({ targetTabId: msg.tabId }, (streamId) => {
            sendResponse({ streamId });
        });
        return true; // Giữ kết nối async
    } else if (msg.action === 'cleanup-tab') {
        // Offscreen yêu cầu dọn dẹp storage
        chrome.storage.local.remove(`vol_${msg.tabId}`);
    }
});

async function handleSetVolume(msg) {
    await ensureOffscreen();
    // Chuyển tiếp lệnh sang Offscreen
    chrome.runtime.sendMessage({
        action: 'update-volume-request',
        tabId: msg.tabId,
        volume: msg.volume
    });
}