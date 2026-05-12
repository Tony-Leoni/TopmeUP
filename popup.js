document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    autoUpdate: document.getElementById('auto-update-toggle'),
    autoClick: document.getElementById('auto-click-toggle'),
    resUpdated: document.getElementById('resumes-updated'),
    status: document.getElementById('global-status'),
    saveBtn: document.getElementById('save-settings'),
    minSalary: document.getElementById('min-salary'),
    runNow: document.getElementById('run-update-now'),
    accordion: document.getElementById('info-accordion'),
    helpToggle: document.getElementById('help-toggle')
  };

  // Load Initial State
  chrome.storage.local.get(['autoUpdate', 'autoClick', 'resumesUpdated', 'clicksPerformed', 'minSalary', 'resumeDetails'], (res) => {
    if (elements.autoUpdate) elements.autoUpdate.checked = !!res.autoUpdate;
    if (elements.autoClick) elements.autoClick.checked = !!res.autoClick;
    if (elements.resUpdated) elements.resUpdated.textContent = res.resumesUpdated || 0;
    if (elements.minSalary) elements.minSalary.value = res.minSalary || '';
    
    if (res.resumeDetails) renderResumesList(res.resumeDetails);
    updateStatus();
  });

  // Run Now Button
  if (elements.runNow) {
    elements.runNow.addEventListener('click', () => {
      console.log('AI HH: Run Now Clicked');
      chrome.runtime.sendMessage({ type: 'RUN_UPDATE_NOW' });
      
      if (!elements.runNow.dataset.originalText) {
        elements.runNow.dataset.originalText = elements.runNow.textContent;
      }
      
      elements.runNow.textContent = 'ОЖИДАЙТЕ...';
      elements.runNow.classList.add('loading-btn');
      elements.runNow.style.pointerEvents = 'none';
      elements.runNow.style.opacity = '0.7';
    });
  }

  // Toggles
  if (elements.autoUpdate) {
    elements.autoUpdate.addEventListener('change', () => {
      chrome.storage.local.set({ autoUpdate: elements.autoUpdate.checked });
      chrome.runtime.sendMessage({ type: 'TOGGLE_AUTO_UPDATE', value: elements.autoUpdate.checked });
      updateStatus();
    });
  }

  if (elements.autoClick) {
    elements.autoClick.addEventListener('change', () => {
      chrome.storage.local.set({ autoClick: elements.autoClick.checked });
      chrome.runtime.sendMessage({ type: 'TOGGLE_AUTO_CLICK', value: elements.autoClick.checked });
      updateStatus();
    });
  }

  // UI Helpers
  if (elements.accordion) {
    elements.accordion.addEventListener('click', () => {
      const content = document.getElementById('info-content');
      const arrow = document.getElementById('accordion-arrow');
      if (content && arrow) {
        content.classList.toggle('open');
        const isOpen = content.classList.contains('open');
        arrow.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    });
  }

  if (elements.helpToggle) {
    elements.helpToggle.addEventListener('click', () => {
      const help = document.getElementById('help-section');
      if (help) {
        const isHidden = help.style.display === 'none';
        help.style.display = isHidden ? 'block' : 'none';
        elements.helpToggle.style.color = isHidden ? 'var(--primary-light)' : 'var(--text-muted)';
      }
    });
  }

  if (elements.saveBtn) {
    elements.saveBtn.addEventListener('click', () => {
      chrome.storage.local.set({ minSalary: elements.minSalary.value }, () => {
        elements.saveBtn.textContent = 'Сохранено!';
        setTimeout(() => { elements.saveBtn.textContent = 'Сохранить настройки'; }, 2000);
      });
    });
  }

  function updateStatus() {
    if (!elements.status) return;
    const isActive = (elements.autoUpdate && elements.autoUpdate.checked) || (elements.autoClick && elements.autoClick.checked);
    elements.status.textContent = isActive ? 'ACTIVE' : 'READY';
    if (isActive) elements.status.classList.add('status-active');
    else elements.status.classList.remove('status-active');
  }

  function renderResumesList(details) {
    const listCard = document.getElementById('resumes-list-card');
    const listContainer = document.getElementById('resumes-list');
    if (!listCard || !listContainer) return;

    listCard.style.display = 'block';
    listContainer.innerHTML = '';

    if (details.length === 0) {
      listContainer.innerHTML = '<div style="font-size: 0.7rem; color: var(--text-muted); text-align: center; padding: 10px;">Резюме не найдены.</div>';
      return;
    }

    details.forEach(item => {
      const isReady = item.time === 'Готово';
      const row = document.createElement('div');
      row.className = 'resume-item';
      
      row.innerHTML = `
        <div class="resume-info" style="flex: 2;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--secondary); flex-shrink: 0;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <span class="resume-name">${item.name}</span>
        </div>
        <div class="status-center" style="flex: 1; display: flex; justify-content: center;">
          <div class="status-dot ${isReady ? 'ready' : 'waiting'}"></div>
        </div>
        <div class="time-right" style="flex: 1; text-align: right;">
          <span style="color: ${isReady ? '#00ff41' : 'var(--secondary)'}; font-size: 0.85rem; font-family: 'Russo One', sans-serif;">${item.time}</span>
        </div>
      `;
      listContainer.appendChild(row);
    });
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.resumesUpdated && elements.resUpdated) elements.resUpdated.textContent = changes.resumesUpdated.newValue;
    
    if (changes.resumeDetails) {
      renderResumesList(changes.resumeDetails.newValue);
      
      // Reset Run Now button if it was in loading state
      if (elements.runNow && elements.runNow.style.pointerEvents === 'none') {
        elements.runNow.textContent = elements.runNow.dataset.originalText || 'Проверить и поднять сейчас';
        elements.runNow.style.background = 'var(--glass)';
        elements.runNow.style.pointerEvents = 'auto';
        elements.runNow.style.opacity = '1';
      }
    }
  });
});
