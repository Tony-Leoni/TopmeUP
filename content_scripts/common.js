// content_scripts/common.js

let autoClickInterval = null;

function startAutoClicker() {
  if (autoClickInterval) return;
  // ONLY run on search pages
  if (!window.location.pathname.includes('/search/vacancy')) {
    console.log('AI HR: Not a search page, auto-clicker will not start.');
    return;
  }

  console.log('AI HR: Auto-clicker started');
  
  autoClickInterval = setInterval(() => {
    chrome.storage.local.get(['autoClick', 'minSalary', 'clicksPerformed'], (result) => {
      if (!result.autoClick) {
        stopAutoClicker();
        return;
      }

      // Find "Apply" buttons
      const applyButtons = Array.from(document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]'))
        .filter(btn => btn.innerText.includes('Откликнуться') && !btn.classList.contains('applied'));

      if (applyButtons.length > 0) {
        const btn = applyButtons[0];
        
        // Simple logic: click the first one found
        btn.click();
        btn.classList.add('applied'); // Mark as applied locally to avoid double clicks
        btn.innerText = 'Отправлено (AI)';
        
        // Update stats
        const newCount = (result.clicksPerformed || 0) + 1;
        chrome.storage.local.set({ clicksPerformed: newCount });
        
        console.log('AI HR: Applied to vacancy. Total:', newCount);
      } else {
        // Check if we need to go to the next page
        const nextBtn = document.querySelector('[data-qa="pager-next"]');
        if (nextBtn) {
          console.log('AI HR: No vacancies on this page, moving to next...');
          nextBtn.click();
        } else {
          console.log('AI HR: No more vacancies found.');
          stopAutoClicker();
        }
      }
    });
  }, 5000); 
}

function stopAutoClicker() {
  if (autoClickInterval) {
    clearInterval(autoClickInterval);
    autoClickInterval = null;
    console.log('AI HR: Auto-clicker stopped');
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TOGGLE_AUTO_CLICK') {
    if (message.value) {
      startAutoClicker();
    } else {
      stopAutoClicker();
    }
  }
});

// Check state on load
chrome.storage.local.get(['autoClick'], (result) => {
  if (result.autoClick) {
    startAutoClicker();
  }
});
