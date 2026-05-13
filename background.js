// background.js

chrome.runtime.onInstalled.addListener(() => {
  console.log('AI HR Assistant installed');
  chrome.storage.local.get(['autoUpdate', 'resumesUpdated', 'clicksPerformed'], (result) => {
    if (result.resumesUpdated === undefined) chrome.storage.local.set({ resumesUpdated: 0 });
    if (result.clicksPerformed === undefined) chrome.storage.local.set({ clicksPerformed: 0 });
    
    // При установке/обновлении проверяем, нужно ли запустить цикл
    if (result.autoUpdate) {
      setupAlarm(true);
    }
  });
});

// Добавляем обработчик запуска браузера (для 100% надежности)
chrome.runtime.onStartup.addListener(() => {
  console.log('AI HR: Browser started. Re-initializing alarms...');
  chrome.storage.local.get(['autoUpdate'], (result) => {
    if (result.autoUpdate) {
      setupAlarm(true);
      checkAndPerformResumeUpdate(); // Проверяем сразу при запуске
    }
  });
});

function setupAlarm(isActive) {
  if (isActive) {
    // Используем период, чтобы будильник был персистентным
    chrome.alarms.create('autoResumeUpdate', { periodInMinutes: 30 });
  } else {
    chrome.alarms.clear('autoResumeUpdate');
  }
}

// Handle alarms for periodic tasks
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoResumeUpdate') {
    checkAndPerformResumeUpdate();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('AI HR: Message received:', message.type);
  if (message.type === 'TOGGLE_AUTO_UPDATE') {
    setupAlarm(message.value);
    if (message.value) {
      checkAndPerformResumeUpdate();
    }
  } else if (message.type === 'RUN_UPDATE_NOW') {
    console.log('AI HR: Manual update triggered via button');
    checkAndPerformResumeUpdate();
  }
});

async function checkAndPerformResumeUpdate() {
  chrome.storage.local.get(['autoUpdate'], async (result) => {
    // Note: RUN_UPDATE_NOW ignores the autoUpdate toggle for testing
    console.log('AI HR: Searching for HH.ru resumes tab...');

    // Find hh.ru tabs - broader search
    const tabs = await chrome.tabs.query({ url: "*://*.hh.ru/*resumes*" });
    
    if (tabs.length > 0) {
      const tabId = tabs[0].id;
      console.log('AI HR: HH.ru tab found. Reloading to ensure freshness...');
      
      // 1. Reload the tab
      chrome.tabs.reload(tabId);

      // 2. Wait for reload to complete
      const onUpdated = (updatedTabId, info) => {
        if (updatedTabId === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          console.log('AI HR: Reload complete. Executing update script...');
          
          // 3. Execute the script after a small safety delay
          setTimeout(async () => {
            const results = await chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: performResumeUpdateAction
            });
            
            if (results && results[0] && results[0].result) {
              const { clickedCount, nextUpdateTime, resumeDetails } = results[0].result;
              
              if (clickedCount > 0) {
                chrome.storage.local.get(['resumesUpdated'], (res) => {
                  chrome.storage.local.set({ resumesUpdated: (res.resumesUpdated || 0) + clickedCount });
                });
              }

              // Save detailed info
              if (resumeDetails) {
                chrome.storage.local.set({ resumeDetails: resumeDetails });
              }

              if (nextUpdateTime) {
                const delayInMinutes = Math.max(1, Math.round((nextUpdateTime - Date.now()) / 60000) + 1);
                console.log(`AI HR: Scheduling next dynamic check in ${delayInMinutes} minutes`);
                chrome.alarms.create('autoResumeUpdate', { delayInMinutes });
                chrome.storage.local.set({ nextUpdateTime: nextUpdateTime });
              } else {
                chrome.alarms.create('autoResumeUpdate', { delayInMinutes: 30 });
              }
            }
          }, 2000); // 2 sec delay for stability
        }
      };

      chrome.tabs.onUpdated.addListener(onUpdated);

    } else {
      console.log('AI HR: No resumes tab found. Creating a new one...');
      
      // 1. Create a new tab (inactive, so it doesn't interrupt the user)
      chrome.tabs.create({ url: 'https://hh.ru/applicant/resumes', active: false }, (newTab) => {
        const tabId = newTab.id;
        
        // 2. Wait for it to load
        const onNewTabUpdated = (updatedTabId, info) => {
          if (updatedTabId === tabId && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(onNewTabUpdated);
            console.log('AI HR: New tab loaded. Executing update script...');
            
            setTimeout(async () => {
              const results = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: performResumeUpdateAction
              });
              
              if (results && results[0] && results[0].result) {
                const { clickedCount, nextUpdateTime, resumeDetails } = results[0].result;
                
                if (clickedCount > 0) {
                  chrome.storage.local.get(['resumesUpdated'], (res) => {
                    chrome.storage.local.set({ resumesUpdated: (res.resumesUpdated || 0) + clickedCount });
                  });
                }

                // Save detailed info
                if (resumeDetails) {
                  chrome.storage.local.set({ resumeDetails: resumeDetails });
                }

                if (nextUpdateTime) {
                  const delayInMinutes = Math.max(1, Math.round((nextUpdateTime - Date.now()) / 60000) + 1);
                  chrome.alarms.create('autoResumeUpdate', { delayInMinutes });
                  chrome.storage.local.set({ nextUpdateTime: nextUpdateTime });
                } else {
                  chrome.alarms.create('autoResumeUpdate', { delayInMinutes: 30 });
                  chrome.storage.local.set({ nextUpdateTime: 0 }); // Reset if nothing found
                }
              }
            }, 3000); // Slightly longer delay for new tabs
          }
        };
        chrome.tabs.onUpdated.addListener(onNewTabUpdated);
      });
    }
  });
}

async function performResumeUpdateAction() {
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  console.log('AI HR: Script execution started on page');

  // 0. Popup Killer - Dismiss any modals or overlays that might block clicks
  console.log('AI HR: Cleaning up popups and overlays...');
  const popups = document.querySelectorAll('[data-qa="bloko-modal-close"], [data-qa="bloko-toast-close"], [data-qa="popover-close-button"], .bloko-modal-close');
  popups.forEach(p => {
    console.log('AI HR: Closing popup/modal');
    p.click();
  });
  
  // Also remove overlays manually just in case
  const overlays = document.querySelectorAll('.bloko-modal-container, .bloko-modal-overlay, [class*="overlay"], [class*="modal-container"]');
  overlays.forEach(o => {
    console.log('AI HR: Removing overlay element');
    o.remove();
  });
  
  // Small wait after cleanup
  await wait(500);

  // 1. Expansion logic
  const expandBtn = document.querySelector('[data-qa="resume-show-more-button"]') || 
                    document.querySelector('[data-qa="resume-show-all"]') ||
                    Array.from(document.querySelectorAll('button, span, a')).find(el => el.innerText && (el.innerText.includes('Все резюме') || el.innerText.includes('Показать все')));
  
  if (expandBtn) {
    console.log('AI HR: Found expansion button, clicking...', expandBtn.innerText);
    expandBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(800);
    expandBtn.click();
    await wait(3000); // Increased wait to 3 seconds
  } else {
    console.log('AI HR: Expansion button not found or already expanded.');
  }

  // 2. Find ALL update buttons
  // HH.ru sometimes uses different data-qa or simple text for the button
  const buttons = Array.from(document.querySelectorAll('[data-qa="resume-update-button"], [data-qa="resume-update-button-modern"]'))
                  .concat(Array.from(document.querySelectorAll('button, a')).filter(el => el.innerText && (el.innerText.includes('Обновить дату') || el.innerText.includes('Поднять в поиске'))));
  
  // Remove duplicates
  const uniqueButtons = [...new Set(buttons)];
  
  console.log(`AI HR: Found ${uniqueButtons.length} potential update buttons total.`);
  let clickedCount = 0;
  let disabledCount = 0;
  let hiddenCount = 0;

  for (const btn of uniqueButtons) {
    if (btn.disabled) {
      disabledCount++;
      continue;
    }
    if (btn.offsetParent === null) {
      hiddenCount++;
      continue;
    }

    console.log('AI HR: Clicking button:', btn.innerText);
    btn.click();
    clickedCount++;
    await wait(Math.floor(Math.random() * 5000) + 2000); // 2-7s delay
  }

  // 3. Find next update times for EACH resume
  const timeRegex = /(\d{1,2}):(\d{2})/;
  const resumeDetails = [];
  let earliestNextTime = null;

  // SUPER-AGRESSIVE SEARCH (but with visibility filter)
  let cards = Array.from(document.querySelectorAll('[data-qa*="resume"], [class*="resume-card"], .resume-item, [data-qa="resume-item"]'))
    .filter(el => {
      const rect = el.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 50; // Real cards are big
      const hasResumeLink = el.querySelector('a[href*="/resume/"]'); // Must have a link to resume
      return isVisible && hasResumeLink;
    });
  
  if (cards.length === 0) {
    // Last resort: find blocks that contain words like "Обновить" or "Поднять" or a time
    const allDivs = Array.from(document.querySelectorAll('div, section, article'));
    cards = allDivs.filter(div => {
      const rect = div.getBoundingClientRect();
      const hasTime = timeRegex.test(div.innerText);
      const isVisible = rect.width > 0 && rect.height > 50;
      const hasResumeLink = div.querySelector('a[href*="/resume/"]');
      return isVisible && hasTime && hasResumeLink;
    });
  }

  // Remove nested duplicates (keep only the topmost resume blocks)
  const topCards = cards.filter(card => !cards.some(parent => parent !== card && parent.contains(card)));

  if (topCards.length > 0) {
    topCards.forEach((card, index) => {
      // Find title and clean it
      const titleEl = card.querySelector('[data-qa*="title"], h1, h2, h3, a[href*="/resume/"]');
      let title = titleEl ? titleEl.innerText.trim() : `Резюме #${index + 1}`;
      
      // SUPER-CLEANING: Remove anything after a newline or specific keywords
      title = title.split('\n')[0]; // Take only first line
      title = title.split('Поднять')[0]; // Cut everything starting from "Поднять"
      title = title.split('Обновить')[0]; // Cut everything starting from "Обновить"
      title = title.trim();
      
      // 3.1. Extract time with priority: "Поднять в" > "Обновлено" > any time
      const liftTimeMatch = card.innerText.match(/(?:Поднять|Доступно).*?(\d{1,2}:\d{2})/i);
      const updateTimeMatch = card.innerText.match(/Обновлено.*?(\d{1,2}:\d{2})/i);
      const generalTimeMatch = card.innerText.match(/(\d{1,2}:\d{2})/);
      
      let nextTimeStr = 'Готово';
      let hours, mins;
      let isFutureTime = false;

      if (liftTimeMatch) {
        nextTimeStr = liftTimeMatch[1];
        [hours, mins] = nextTimeStr.split(':').map(Number);
        isFutureTime = true;
      } else if (updateTimeMatch) {
        nextTimeStr = updateTimeMatch[1];
        [hours, mins] = nextTimeStr.split(':').map(Number);
        // If it's an update time, the next lift is +4 hours
        hours += 4;
      } else if (generalTimeMatch) {
        nextTimeStr = generalTimeMatch[0];
        [hours, mins] = nextTimeStr.split(':').map(Number);
      }
      
      if (hours !== undefined && mins !== undefined) {
        const target = new Date();
        target.setHours(hours, mins, 0, 0);
        if (target < new Date()) target.setDate(target.getDate() + 1);
        
        if (!earliestNextTime || target.getTime() < earliestNextTime) {
          earliestNextTime = target.getTime();
        }
      }
      
      resumeDetails.push({ name: title, time: nextTimeStr });
    });
  } else {
    // ONLY run this if no cards were found
    const anyUpdateBtn = Array.from(document.querySelectorAll('button, a')).filter(el => /поднять|обновить/i.test(el.innerText));
    anyUpdateBtn.forEach((btn, index) => {
      resumeDetails.push({ name: `Резюме #${index + 1}`, time: 'Готово' });
    });
  }

  console.log(`AI HR: Finished. Success: ${clickedCount}, Details:`, resumeDetails);
  
  return { 
    clickedCount, 
    nextUpdateTime: earliestNextTime,
    resumeDetails: resumeDetails
  };
}
