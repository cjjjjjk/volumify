document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('tabs-container');
  const resetBtn = document.getElementById('resetAll');
  const settingsBtn = document.getElementById('toggleSettings');
  const settingsPanel = document.getElementById('settingsPanel');
  const themeBtns = document.querySelectorAll('.theme-btn');
  const body = document.body;

  // --- THEME LOGIC ---
  // Load theme
  const { theme } = await chrome.storage.local.get('theme');
  if (theme) {
    body.className = theme;
    updateActiveThemeBtn(theme);
  }

  // Toggle Settings
  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('open');
  });

  // Switch Theme
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const newTheme = btn.dataset.theme;
      body.className = newTheme;
      chrome.storage.local.set({ theme: newTheme });
      updateActiveThemeBtn(newTheme);
    });
  });

  function updateActiveThemeBtn(activeTheme) {
    themeBtns.forEach(btn => {
      if (btn.dataset.theme === activeTheme) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // --- RESET ALL FUNCTIONALITY ---
  resetBtn.addEventListener('click', async () => {
    const allSliders = document.querySelectorAll('input[type="range"]');
    for (const slider of allSliders) {
      slider.value = 100;
      slider.dispatchEvent(new Event('input')); // Trigger update
    }
  });

  // --- LOAD TABS ---
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const audibleTabs = await chrome.tabs.query({ audible: true });

  const storageData = await chrome.storage.local.get(null);
  const storedTabIds = Object.keys(storageData)
    .filter(key => key.startsWith('vol_'))
    .map(key => parseInt(key.replace('vol_', '')));

  const tabsMap = new Map();

  if (activeTab) tabsMap.set(activeTab.id, activeTab);
  audibleTabs.forEach(t => tabsMap.set(t.id, t));

  for (const tabId of storedTabIds) {
    if (!tabsMap.has(tabId)) {
      try {
        const tab = await chrome.tabs.get(tabId);
        tabsMap.set(tab.id, tab);
      } catch (e) {
        chrome.storage.local.remove(`vol_${tabId}`);
      }
    }
  }

  const tabs = Array.from(tabsMap.values()).filter(t =>
    t.url && !t.url.startsWith("chrome://") && !t.url.startsWith("edge://")
  );

  container.innerHTML = '';

  if (tabs.length === 0) {
    container.innerHTML = '<div class="note">NO AUDIO SOURCES DETECTED</div>';
    return;
  }

  for (const tab of tabs) {
    const wrapper = document.createElement('div');
    wrapper.className = 'control-group';

    const key = `vol_${tab.id}`;
    const currentVol = storageData[key] ?? 100;

    // Favicon fallback
    const favicon = tab.favIconUrl || 'icons/icon16.png';

    wrapper.innerHTML = `
      <div class="tab-info">
        <img src="${favicon}" class="tab-icon" onerror="this.src='icons/icon16.png'">
        <div class="tab-title" title="${tab.title}">
          ${tab.title}
        </div>
      </div>
      <div class="volume-row">
        <input type="range" min="0" max="150" value="${currentVol}" data-id="${tab.id}">
        <div class="volume-value">${currentVol}%</div>
      </div>
      <div class="presets">
        <button class="preset-btn" data-val="0">0%</button>
        <button class="preset-btn" data-val="1">1%</button>
        <button class="preset-btn" data-val="10">10%</button>
        <button class="preset-btn" data-val="50">50%</button>
        <button class="preset-btn" data-val="100">100%</button>
      </div>
    `;

    const input = wrapper.querySelector('input');
    const label = wrapper.querySelector('.volume-value');
    const presetBtns = wrapper.querySelectorAll('.preset-btn');
    let debounce;

    // --- SLIDER LOGIC ---
    const updateVolume = (vol) => {
      label.textContent = `${vol}%`;
      chrome.storage.local.set({ [key]: vol });

      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        chrome.runtime.sendMessage({
          action: 'setVolume',
          tabId: tab.id,
          volume: vol
        });
      }, 50);
    };

    input.addEventListener('input', (e) => {
      updateVolume(parseInt(e.target.value));
    });

    // --- PRESET BUTTONS LOGIC ---
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.val);
        input.value = val;
        updateVolume(val);
      });
    });

    container.appendChild(wrapper);
  }
});