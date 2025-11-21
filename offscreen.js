const audioStates = {}; // { [tabId]: { context, gain, source, stream } }

chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg.action === 'update-volume-request') {
        const { tabId, volume } = msg;

        if (audioStates[tabId]) {
            // 1. Nếu đã capture, chỉ chỉnh volume
            updateGain(tabId, volume);
        } else {
            // 2. Nếu chưa, xin streamId và bắt đầu capture
            try {
                const response = await chrome.runtime.sendMessage({
                    action: 'getStreamId',
                    tabId: tabId
                });

                if (response && response.streamId) {
                    await startCapture(tabId, response.streamId, volume);
                }
            } catch (e) {
                console.error("Failed to init capture:", e);
            }
        }
    }
});

function updateGain(tabId, volume) {
    const state = audioStates[tabId];
    if (state && state.gain) {
        const val = volume / 100;
        // Set giá trị tức thì để phản hồi nhanh
        state.gain.gain.value = val;
        // Dùng setTargetAtTime để làm mượt nếu kéo liên tục
        state.gain.gain.setTargetAtTime(val, state.context.currentTime, 0.1);
    }
}

async function startCapture(tabId, streamId, volume) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            }
        });

        const context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const gain = context.createGain();

        // Set volume ban đầu
        gain.gain.value = volume / 100;

        source.connect(gain);
        gain.connect(context.destination);

        audioStates[tabId] = { context, gain, source, stream };

        // Dọn dẹp khi stream kết thúc (tắt tab hoặc điều hướng)
        stream.getAudioTracks()[0].onended = () => {
            cleanup(tabId);
            // Gửi tin nhắn cho background để xóa storage
            chrome.runtime.sendMessage({ action: 'cleanup-tab', tabId: tabId });
        };

    } catch (err) {
        console.error("Capture error:", err);
    }
}

function cleanup(tabId) {
    if (audioStates[tabId]) {
        try {
            audioStates[tabId].gain.disconnect();
            audioStates[tabId].source.disconnect();
            audioStates[tabId].stream.getTracks().forEach(t => t.stop());
            audioStates[tabId].context.close();
        } catch (e) { }
        delete audioStates[tabId];
    }
}

// Keep-alive
setInterval(() => {
    chrome.runtime.sendMessage({ action: 'ping' }).catch(() => { });
}, 20000);