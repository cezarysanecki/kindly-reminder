const SESSION_KEY = 'activeSession';
const SETTINGS_KEY = 'preferences';
const REMINDER_OPTIONS = [30, 60, 120, 300, 600];
const DEFAULT_PREFERENCES = { intervalSeconds: 300, durationMinutes: 25, breakMinutes: 5, alertTone: 'muted', reminderWidth: 920, reminderHeight: 320, reminderFontSize: 72 };

let activeSession = null;
let popupData = null;
let timer = null;
let trayTitle = null;
let trayIcon = 'sf:timer';

function clearTimer() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

function closest(options, value) {
  return options.reduce((best, option) => Math.abs(option - value) < Math.abs(best - value) ? option : best, options[0]);
}

function clampStep(value, min, max, step, fallback) {
  return Math.min(max, Math.max(min, Math.round((Number(value) || fallback) / step) * step));
}

function cleanPreferences({ intervalSeconds, durationMinutes, breakMinutes, alertTone, reminderWidth, reminderHeight, reminderFontSize }) {
  return {
    intervalSeconds: closest(REMINDER_OPTIONS, Number(intervalSeconds) || 300),
    durationMinutes: clampStep(durationMinutes, 15, 30, 5, 25),
    breakMinutes: closest([5, 10, 15], Number(breakMinutes || 5)),
    alertTone: ['muted', 'vivid', 'bright'].includes(alertTone) ? alertTone : 'muted',
    reminderWidth: clampStep(reminderWidth, 320, 1200, 20, DEFAULT_PREFERENCES.reminderWidth),
    reminderHeight: clampStep(reminderHeight, 100, 480, 10, DEFAULT_PREFERENCES.reminderHeight),
    reminderFontSize: clampStep(reminderFontSize, 16, 120, 2, DEFAULT_PREFERENCES.reminderFontSize),
  };
}

async function loadPreferences(app) {
  return { ...DEFAULT_PREFERENCES, ...((await app.store.get(SETTINGS_KEY)) ?? {}) };
}

// The menu bar shows the time left, so it's clear the session runs in the background.
function refreshTray(app) {
  const minutesLeft = activeSession ? Math.max(1, Math.ceil((activeSession.endsAt - Date.now()) / 60_000)) : 0;
  const title = !activeSession ? '' : activeSession.phase === 'break' ? `Przerwa ${minutesLeft} min` : `${minutesLeft} min`;
  if (title === trayTitle) return;
  trayTitle = title;
  app.tray.set({
    title,
    icon: trayIcon,
    tooltip: 'Kindly Reminder — przypomnienia o zadaniu',
    menu: [
      { id: 'show', label: 'Otwórz Kindly Reminder' },
      { id: 'stop', label: 'Zakończ bieżącą sesję' },
      { separator: true },
      { id: 'quit', label: 'Zamknij aplikację' },
    ],
  });
}

// During a session the app lives only in the menu bar: no Dock icon, no main window.
function hideToMenuBar(app) {
  app.win.hide({ app: false });
  app.presence('menubar');
}

async function saveSession(app) {
  refreshTray(app);
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

// preview: sample reminder shown while the user adjusts its size in the main window.
async function showPopup(app, kind, preview = null) {
  if (!activeSession && !preview && kind !== 'complete' && kind !== 'break-complete') return;
  const prefs = preview ?? await loadPreferences(app);
  popupData = preview ? {
    kind,
    preview: true,
    task: 'Przykładowe zadanie',
    alertTone: preview.alertTone,
    reminderWidth: preview.reminderWidth,
    reminderHeight: preview.reminderHeight,
    reminderFontSize: preview.reminderFontSize,
  } : {
    kind,
    task: activeSession?.task ?? popupData?.task ?? '',
    breakMinutes: activeSession?.breakMinutes ?? popupData?.breakMinutes ?? 5,
    alertTone: activeSession?.alertTone ?? popupData?.alertTone ?? 'muted',
    durationMinutes: activeSession?.durationMinutes ?? 25,
    reminderWidth: prefs.reminderWidth,
    reminderHeight: prefs.reminderHeight,
    reminderFontSize: prefs.reminderFontSize,
  };

  const requestedWidth = kind === 'reminder' ? prefs.reminderWidth : 620;
  const requestedHeight = kind === 'reminder' ? prefs.reminderHeight : kind === 'complete' ? 340 : 360;
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
    // The preview stays visible between slider moves to avoid flicker.
    if (!preview) popup.hide({ app: false });
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
  await app.presence('normal');
  await app.win.show();
  if (focusTask) app.win.push('focus-task', {});
}

export async function init(app) {
  await app.win.setHideOnClose(true);
  if ((await app.system.os()) !== 'macos') trayIcon = 'emoji:⏳';
  refreshTray(app);
  setInterval(() => refreshTray(app), 15_000);

  activeSession = await app.store.get(SESSION_KEY);
  if (activeSession && activeSession.endsAt <= Date.now()) {
    if (activeSession.phase === 'break') await finishBreak(app);
    else await finishSession(app);
  } else if (activeSession) {
    hideToMenuBar(app);
    await scheduleNext(app);
  }
}

export async function onTray(id, app) {
  if (id === 'quit') {
    app.quit();
    return;
  }
  if (id === 'stop') {
    clearTimer();
    activeSession = null;
    popupData = null;
    await saveSession(app);
    app.win.close('popup');
    // focusTask also switches the main window from the session card back to the form.
    await openMain(app, { focusTask: true });
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
    preferences: await loadPreferences(app),
    popup: popupData,
  }),

  // Each window sends only its own settings; the rest keep their stored values.
  savePreferences: async (params, app) => {
    const prefs = cleanPreferences({ ...await loadPreferences(app), ...params });
    await app.store.set(SETTINGS_KEY, prefs);
    return prefs;
  },

  previewReminder: async (params, app) => {
    if (activeSession) return { ok: false };
    await showPopup(app, 'reminder', cleanPreferences({ ...await loadPreferences(app), ...params }));
    return { ok: true };
  },

  startSession: async ({ task, ...params }, app) => {
    const cleanTask = typeof task === 'string' ? task.trim().slice(0, 180) : '';
    if (!cleanTask) throw new Error('Wpisz, nad czym teraz pracujesz.');
    if (activeSession) throw new Error('Sesja już trwa. Zakończ ją przed rozpoczęciem kolejnej.');

    const prefs = cleanPreferences({ ...await loadPreferences(app), ...params });
    const now = Date.now();
    activeSession = {
      phase: 'work',
      task: cleanTask,
      intervalSeconds: prefs.intervalSeconds,
      durationMinutes: prefs.durationMinutes,
      breakMinutes: prefs.breakMinutes,
      alertTone: prefs.alertTone,
      startedAt: now,
      endsAt: now + prefs.durationMinutes * 60_000,
      nextReminderAt: now + prefs.intervalSeconds * 1000,
    };
    popupData = null;
    await app.store.set(SETTINGS_KEY, prefs);
    await saveSession(app);
    hideToMenuBar(app);
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
