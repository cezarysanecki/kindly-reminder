const byId = (id) => document.getElementById(id);
let currentPopup = null;
let autoDismissTimer = null;

// Uses the chosen font size, shrinking it only when the task doesn't fit the window.
function fitTitle() {
  if (currentPopup?.kind !== 'reminder') return;
  const card = byId('popup-card');
  const title = byId('popup-title');
  let size = currentPopup.reminderFontSize || 72;
  title.style.fontSize = `${size}px`;
  while (size > 12 && (card.scrollHeight > card.clientHeight || card.scrollWidth > card.clientWidth)) {
    size -= 2;
    title.style.fontSize = `${size}px`;
  }
}

function renderPopup(data) {
  if (!data) return;
  currentPopup = data;
  if (autoDismissTimer) clearTimeout(autoDismissTimer);
  const complete = data.kind === 'complete';
  const breakComplete = data.kind === 'break-complete';
  const reminder = data.kind === 'reminder';
  document.body.dataset.tone = data.alertTone || 'muted';
  document.body.classList.toggle('focus-mode', reminder);
  const card = byId('popup-card');
  card.classList.toggle('complete', complete);
  card.classList.toggle('reminder-mode', reminder);
  if (reminder) {
    const task = data.task || 'Twoje zadanie';
    // Padding was tuned for a 920x320 reminder; scale it with the chosen size.
    const scale = Math.min((data.reminderWidth || 920) / 920, (data.reminderHeight || 320) / 320);
    card.style.setProperty('--scale', scale);
    byId('popup-title').textContent = task;
    fitTitle();
    if (!data.preview) autoDismissTimer = setTimeout(() => call('dismissPopup'), 9000);
    return;
  }
  byId('popup-title').style.fontSize = '';
  byId('popup-icon').textContent = complete || breakComplete ? '✓' : '✦';
  byId('popup-eyebrow').textContent = complete
    ? 'DOBRA ROBOTA'
    : breakComplete ? 'CHWILA DLA SIEBIE' : 'CHWILA NA SPRAWDZENIE';
  byId('popup-title').textContent = complete
    ? 'Zadanie ukończone.'
    : breakComplete ? 'Przerwa dobrze zrobiona.' : 'Jak Ci idzie?';
  byId('popup-message').textContent = complete
    ? `Odłóż ekran na ${data.breakMinutes} min. Zrób sobie krótką przerwę — na to też jest czas.`
    : breakComplete
      ? 'Napij się wody, przeciągnij. Kiedy będziesz gotowy, możesz zacząć kolejne zadanie.'
      : 'Zatrzymaj się na moment. Wciąż w dobrym kierunku? Wróć spokojnie do zadania.';
  byId('popup-task').textContent = data.task || 'Twoje zadanie';
  byId('primary-action').innerHTML = complete
    ? `Zacznij przerwę · ${data.breakMinutes} min <span aria-hidden="true">→</span>`
    : breakComplete ? 'Nowe zadanie <span aria-hidden="true">→</span>'
      : 'Wracam do pracy <span aria-hidden="true">→</span>';
  byId('secondary-action').textContent = complete ? 'Nowe zadanie' : breakComplete ? 'Zamknij' : 'Później';
  byId('break-note').hidden = !complete;
}

async function call(name) {
  if (!window.tiny?.api) return;
  try {
    await tiny.api.call(name);
  } catch (_error) {
    // The popup remains visible if the app can't process the action.
  }
}

byId('primary-action').addEventListener('click', () => {
  if (currentPopup?.kind === 'complete') return call('startBreak');
  if (currentPopup?.kind === 'break-complete') return call('startNewTask');
  return call('dismissPopup');
});
byId('secondary-action').addEventListener('click', () => {
  call(currentPopup?.kind === 'complete' ? 'startNewTask' : 'dismissPopup');
});

if (window.tiny?.api) {
  tiny.api.on('popup:update', renderPopup);
  tiny.api.call('getState').then((state) => renderPopup(state.popup));
}

window.addEventListener('resize', fitTitle);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && currentPopup?.kind === 'reminder') call('dismissPopup');
});
