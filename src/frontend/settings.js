const byId = (id) => document.getElementById(id);
const inputs = {
  reminderWidth: byId('reminder-width'),
  reminderHeight: byId('reminder-height'),
  reminderFontSize: byId('reminder-font'),
};
let previewCloseTimer = null;

function sizes() {
  return Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, Number(input.value)]));
}

function syncCopy() {
  byId('reminder-width-value').textContent = `${inputs.reminderWidth.value} px`;
  byId('reminder-height-value').textContent = `${inputs.reminderHeight.value} px`;
  byId('reminder-font-value').textContent = `${inputs.reminderFontSize.value} px`;
}

// While a slider moves, a sample reminder shows the result; it closes shortly after release.
Object.values(inputs).forEach((input) => {
  input.addEventListener('input', () => {
    syncCopy();
    clearTimeout(previewCloseTimer);
    tiny.api.call('previewReminder', sizes()).catch(() => {});
  });
  input.addEventListener('change', () => {
    tiny.api.call('savePreferences', sizes()).catch(() => {});
    clearTimeout(previewCloseTimer);
    previewCloseTimer = setTimeout(() => tiny.api.call('dismissPopup').catch(() => {}), 1500);
  });
});

tiny.api.call('getState').then((state) => {
  Object.entries(inputs).forEach(([key, input]) => { input.value = state.preferences[key]; });
  syncCopy();
});
