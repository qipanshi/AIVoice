const tabs = [...document.querySelectorAll('[role="tab"]')];
function activate(tab, focus = false) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  }
  if (focus) tab.focus();
}
for (const [index, tab] of tabs.entries()) {
  tab.addEventListener('click', () => activate(tab));
  tab.addEventListener('keydown', event => {
    const target = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length] : event.key === 'ArrowLeft' ? tabs[(index + tabs.length - 1) % tabs.length] : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : null;
    if (target) { event.preventDefault(); activate(target, true); }
  });
}
let messageTimer;
for (const button of document.querySelectorAll('[data-copy]')) button.addEventListener('click', async () => {
  const status = document.getElementById('copy-status');
  try {
    await navigator.clipboard.writeText(document.getElementById(button.dataset.copy).textContent.trim());
    status.textContent = '已复制，可粘贴到你的工具中';
  } catch { status.textContent = '复制未完成，请选中代码后手动复制'; }
  clearTimeout(messageTimer); messageTimer = setTimeout(() => { status.textContent = ''; }, 3500);
});
