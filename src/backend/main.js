const SESSION_KEY = 'activeSession';
const SETTINGS_KEY = 'preferences';
const REMINDER_OPTIONS = [30, 60, 120, 300, 600];

let activeSession = null;
let popupData = null;
let timer = null;

function clearTimer() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

async function saveSession(app) {
  await app.store.set(SESSION_KEY, activeSession);
}

async function screensForPopup(app, width, height) {
  let screen = await app.foregroundScreen();
  const screens = await app.screens();
  if (!screen) screen = screens.find((item) => item.primary) ?? screens[0];
  if (!screen) return { x: 80, y: 36 };

  const visible = screen.visible ?? { x: screen.x, y: screen.y, width: screen.width, height: screen.height };
  const popupWidth = Math.min(width, Math.max(360, visible.width - 40));
  const popupHeight = Math.min(height, Math.max(280, visible.height - 48));
  return {
    screen,
    width: popupWidth,
    height: popupHeight,
    x: Math.max(20, Math.round((visible.width - popupWidth) / 2)),
    y: 28,
  };
}

async function showPopup(app, kind) {
  if (!activeSession && kind !== 'complete' && kind !== 'break-complete') return;
  popupData = {
    kind,
    task: activeSession?.task ?? popupData?.task ?? '',
    breakMinutes: activeSession?.breakMinutes ?? popupData?.breakMinutes ?? 5,
    alertTone: activeSession?.alertTone ?? popupData?.alertTone ?? 'muted',
    durationMinutes: activeSession?.durationMinutes ?? 25,
  };

  const requestedWidth = kind === 'reminder' ? 920 : 620;
  const requestedHeight = kind === 'reminder' ? 320 : kind === 'complete' ? 340 : 360;
  const position = await screensForPopup(app, requestedWidth, requestedHeight);
  const width = position.width ?? requestedWidth;
  const height = position.height ?? requestedHeight;
  const options = {
    page: 'popup.html',
    title: kind === 'complete' ? 'Dobra robota' : kind === 'break-complete' ? 'Przerwa skończona' : 'Chwila na sprawdzenie',
    size: `${width}x${height}`,
    minSize: `${width}x${height}`,
    x: position.x,
    y: position.y,
    show: kind !== 'reminder',
    chrome: { frame: false, windowControls: false, transparent: true, menu: false },
  };
  if (position.screen) options.screen = position.screen;

  const popup = app.window('popup');
  const popupState = await popup.getState();
  if (!popupState) {
    await app.win.open('popup', options);
  } else if (kind === 'reminder') {
    // Opening an existing TinyJS window focuses it, so reuse it directly for reminders.
    popup.hide({ app: false });
  } else {
    await app.win.open('popup', options);
  }
  popup.setSize(width, height);
  popup.setLevel('floating');
  popup.setAllSpaces(true);
  if (position.screen) popup.setPosition(position.x, position.y, { screen: position.screen });
  else popup.setPosition(position.x, position.y);
  popup.show(kind === 'reminder' ? { activate: false } : undefined);
  popup.push('popup:update', popupData);
}

async function finishSession(app) {
  if (!activeSession) return;
  const finishedTask = activeSession.task;
  const breakMinutes = activeSession.breakMinutes;
  const alertTone = activeSession.alertTone;
  clearTimer();
  activeSession = null;
  await saveSession(app);
  popupData = { kind: 'complete', task: finishedTask, breakMinutes, alertTone };
  await showPopup(app, 'complete');
}

async function finishBreak(app) {
  if (!activeSession || activeSession.phase !== 'break') return;
  const { task, breakMinutes, alertTone } = activeSession;
  clearTimer();
  activeSession = null;
  await saveSession(app);
  popupData = { kind: 'break-complete', task, breakMinutes, alertTone };
  await showPopup(app, 'break-complete');
}

async function scheduleNext(app) {
  clearTimer();
  if (!activeSession) return;

  const now = Date.now();
  if (now >= activeSession.endsAt) {
    if (activeSession.phase === 'break') await finishBreak(app);
    else await finishSession(app);
    return;
  }

  const dueAt = activeSession.phase === 'break'
    ? activeSession.endsAt
    : Math.min(activeSession.nextReminderAt, activeSession.endsAt);
  timer = setTimeout(async () => {
    if (!activeSession) return;
    if (Date.now() >= activeSession.endsAt) {
      if (activeSession.phase === 'break') await finishBreak(app);
      else await finishSession(app);
      return;
    }

    await showPopup(app, 'reminder');
    // Skip missed intervals after sleep or a long system pause.
    activeSession.nextReminderAt = Date.now() + activeSession.intervalSeconds * 1000;
    await saveSession(app);
    await scheduleNext(app);
  }, Math.max(0, dueAt - now));
}

async function openMain(app, { focusTask = false } = {}) {
  await app.win.show();
  if (focusTask) app.win.push('focus-task', {});
}

export async function init(app) {
  await app.win.setHideOnClose(true);
  const os = await app.system.os();
  await app.tray.set({
    icon: os === 'macos' ? 'sf:timer' : 'emoji:⏳',
    tooltip: 'Kindly Reminder — przypomnienia o zadaniu',
    menu: [
      { id: 'show', label: 'Otwórz Kindly Reminder' },
      { id: 'stop', label: 'Zakończ bieżącą sesję' },
      { separator: true },
      { id: 'quit', label: 'Zamknij aplikację' },
    ],
  });

  activeSession = await app.store.get(SESSION_KEY);
  if (activeSession && activeSession.endsAt <= Date.now()) {
    if (activeSession.phase === 'break') await finishBreak(app);
    else await finishSession(app);
  } else if (activeSession) {
    app.win.hide({ app: false });
    await scheduleNext(app);
  }
}

export async function onTray(id, app) {
  if (id === 'quit') {
    app.quit();
    return;
  }
  if (id === 'stop') {
    if (activeSession) {
      clearTimer();
      activeSession = null;
      popupData = null;
      await saveSession(app);
      app.win.close('popup');
      await openMain(app);
    }
    return;
  }
  if (id === null || id === 'show') await openMain(app);
}

export async function onSystem(kind, _value, app) {
  if (kind === 'wake' && activeSession) await scheduleNext(app);
}

export const api = {
  getState: async (_params, app) => ({
    session: activeSession,
    preferences: (await app.store.get(SETTINGS_KEY)) ?? { intervalSeconds: 300, durationMinutes: 25, breakMinutes: 5, alertTone: 'muted' },
    popup: popupData,
  }),

  savePreferences: async ({ intervalSeconds, durationMinutes, breakMinutes, alertTone }, app) => {
    const requestedInterval = Number(intervalSeconds) || 300;
    const safeInterval = REMINDER_OPTIONS.reduce((closest, option) =>
      Math.abs(option - requestedInterval) < Math.abs(closest - requestedInterval) ? option : closest,
    REMINDER_OPTIONS[0]);
    const prefs = {
      intervalSeconds: safeInterval,
      durationMinutes: Math.min(30, Math.max(15, Math.round((Number(durationMinutes) || 25) / 5) * 5)),
      breakMinutes: [5, 10, 15].reduce((closest, option) =>
        Math.abs(option - Number(breakMinutes || 5)) < Math.abs(closest - Number(breakMinutes || 5)) ? option : closest,
      5),
      alertTone: ['muted', 'vivid', 'bright'].includes(alertTone) ? alertTone : 'muted',
    };
    await app.store.set(SETTINGS_KEY, prefs);
    return prefs;
  },

  startSession: async ({ task, intervalSeconds, durationMinutes, breakMinutes, alertTone }, app) => {
    const cleanTask = typeof task === 'string' ? task.trim().slice(0, 180) : '';
    if (!cleanTask) throw new Error('Wpisz, nad czym teraz pracujesz.');
    if (activeSession) throw new Error('Sesja już trwa. Zakończ ją przed rozpoczęciem kolejnej.');

    const requestedInterval = Number(intervalSeconds) || 300;
    const interval = REMINDER_OPTIONS.reduce((closest, option) =>
      Math.abs(option - requestedInterval) < Math.abs(closest - requestedInterval) ? option : closest,
    REMINDER_OPTIONS[0]);
    const duration = Math.min(30, Math.max(15, Math.round((Number(durationMinutes) || 25) / 5) * 5));
    const breakLength = [5, 10, 15].reduce((closest, option) =>
      Math.abs(option - Number(breakMinutes || 5)) < Math.abs(closest - Number(breakMinutes || 5)) ? option : closest,
    5);
    const safeTone = ['muted', 'vivid', 'bright'].includes(alertTone) ? alertTone : 'muted';
    const now = Date.now();
    activeSession = {
      phase: 'work',
      task: cleanTask,
      intervalSeconds: interval,
      durationMinutes: duration,
      breakMinutes: breakLength,
      alertTone: safeTone,
      startedAt: now,
      endsAt: now + duration * 60_000,
      nextReminderAt: now + interval * 1000,
    };
    popupData = null;
    await app.store.set(SETTINGS_KEY, { intervalSeconds: interval, durationMinutes: duration, breakMinutes: breakLength, alertTone: safeTone });
    await saveSession(app);
    await app.win.hide({ app: false });
    await scheduleNext(app);
    return activeSession;
  },

  stopSession: async (_params, app) => {
    clearTimer();
    activeSession = null;
    popupData = null;
    await saveSession(app);
    app.win.close('popup');
    await openMain(app);
    return { ok: true };
  },

  dismissPopup: async (_params, app) => {
    popupData = null;
    app.win.close('popup');
    return { ok: true };
  },

  startNewTask: async (_params, app) => {
    popupData = null;
    app.win.close('popup');
    await openMain(app, { focusTask: true });
    return { ok: true };
  },

  startBreak: async (_params, app) => {
    if (activeSession) throw new Error('Najpierw zakończ bieżącą sesję.');
    const task = popupData?.task ?? '';
    const breakMinutes = popupData?.breakMinutes ?? 5;
    const alertTone = popupData?.alertTone ?? 'muted';
    const now = Date.now();
    activeSession = {
      phase: 'break',
      task,
      breakMinutes,
      alertTone,
      startedAt: now,
      endsAt: now + breakMinutes * 60_000,
      nextReminderAt: now + breakMinutes * 60_000,
    };
    popupData = null;
    await saveSession(app);
    app.win.close('popup');
    await scheduleNext(app);
    return activeSession;
  },
};
