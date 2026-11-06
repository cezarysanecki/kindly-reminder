const byId = (id) => document.getElementById(id);
const form = byId('task-form');
const taskInput = byId('task');
const intervalInput = byId('interval');
const durationInput = byId('duration');
const breakInput = byId('break');
const errorBox = byId('form-error');
const reminderSeconds = [30, 60, 120, 300, 600];
let alertTone = 'muted';
let currentSession = null;

function intervalLabel(seconds) {
  if (seconds < 60) return `${seconds} sek.`;
  return `${seconds / 60} min`;
}

function syncSliderCopy() {
  const interval = reminderSeconds[Number(intervalInput.value)];
  const duration = Number(durationInput.value);
  const breakLength = Number(breakInput.value);
  byId('interval-value').textContent = intervalLabel(interval);
  byId('duration-value').textContent = `${duration} min`;
  byId('break-value').textContent = `${breakLength} min`;
  byId('plan-interval').textContent = intervalLabel(interval);
  byId('plan-break').textContent = `${breakLength} min`;
}

function showError(message = '') {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function renderSession(session) {
  currentSession = session;
  const isActive = Boolean(session);
  form.hidden = isActive;
  byId('active-card').hidden = !isActive;
  if (isActive) {
    byId('active-task').textContent = session.task;
    document.querySelector('.active-top').innerHTML = session.phase === 'break'
      ? '<span class="live-dot"></span> PRZERWA W TOKU'
      : '<span class="live-dot"></span> SESJA W TOKU';
    byId('stop-button').textContent = session.phase === 'break' ? 'Zakończ przerwę' : 'Zakończ sesję';
    updateCountdown();
  }
}

function updateCountdown() {
  if (!currentSession) return;
  const total = Math.max(1, currentSession.endsAt - currentSession.startedAt);
  const remaining = Math.max(0, currentSession.endsAt - Date.now());
  byId('time-left').textContent = `${Math.ceil(remaining / 60_000)} min`;
  byId('progress').style.width = `${Math.min(100, Math.max(0, ((total - remaining) / total) * 100))}%`;
}

async function loadState() {
  try {
    const state = await tiny.api.call('getState');
    intervalInput.value = Math.max(0, reminderSeconds.indexOf(state.preferences.intervalSeconds ?? 300));
    durationInput.value = state.preferences.durationMinutes;
    breakInput.value = state.preferences.breakMinutes;
    alertTone = state.preferences.alertTone ?? 'muted';
    setAlertTone(alertTone);
    syncSliderCopy();
    renderSession(state.session);
  } catch (error) {
    showError(typeof error === 'string' ? error : 'Nie udało się odczytać ustawień.');
  }
}

intervalInput.addEventListener('input', syncSliderCopy);
durationInput.addEventListener('input', syncSliderCopy);
breakInput.addEventListener('input', syncSliderCopy);
intervalInput.addEventListener('change', savePreferences);
durationInput.addEventListener('change', savePreferences);
breakInput.addEventListener('change', savePreferences);

function setAlertTone(tone) {
  alertTone = tone;
  document.body.dataset.tone = tone;
  document.querySelectorAll('.tone-option').forEach((button) => {
    const selected = button.dataset.tone === tone;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

document.querySelectorAll('.tone-option').forEach((button) => {
  button.addEventListener('click', () => {
    setAlertTone(button.dataset.tone);
    savePreferences();
  });
});

async function savePreferences() {
  if (!window.tiny?.api) return;
  try {
    await tiny.api.call('savePreferences', {
      intervalSeconds: reminderSeconds[Number(intervalInput.value)],
      durationMinutes: Number(durationInput.value),
      breakMinutes: Number(breakInput.value),
      alertTone,
    });
  } catch (_error) {
    // The selected values remain usable for this session even if saving fails.
  }
}

taskInput.addEventListener('input', () => {
  byId('char-count').textContent = `${taskInput.value.length} / 180`;
  showError();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const task = taskInput.value.trim();
  if (!task) {
    taskInput.focus();
    showError('Wpisz, nad czym chcesz teraz pracować.');
    return;
  }
  if (!window.tiny?.api) {
    showError('Uruchom aplikację w TinyJS, aby włączyć przypomnienia w tle.');
    return;
  }

  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  showError();
  try {
    const session = await tiny.api.call('startSession', {
      task,
      intervalSeconds: reminderSeconds[Number(intervalInput.value)],
      durationMinutes: Number(durationInput.value),
      breakMinutes: Number(breakInput.value),
      alertTone,
    });
    renderSession(session);
  } catch (error) {
    showError(typeof error === 'string' ? error : 'Nie udało się rozpocząć sesji.');
  } finally {
    button.disabled = false;
  }
});

byId('stop-button').addEventListener('click', async () => {
  try {
    await tiny.api.call('stopSession');
    renderSession(null);
  } catch (_error) {
    showError('Nie udało się zakończyć sesji. Spróbuj ponownie.');
  }
});

if (window.tiny?.api) {
  tiny.api.on('focus-task', () => {
    renderSession(null);
    taskInput.value = '';
    byId('char-count').textContent = '0 / 180';
    showError();
    requestAnimationFrame(() => taskInput.focus());
  });
  loadState();
  setInterval(updateCountdown, 1000);
} else {
  syncSliderCopy();
}
