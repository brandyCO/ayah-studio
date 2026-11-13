// Android's back button (and the browser's back) closes the top sheet
// instead of leaving the screen. Every modal sheet gets its own history
// entry; the few full pages that manage history themselves are skipped.
const SELF_MANAGED = ['sh-page', 'fr-page', 'lw-page'];
const stack: { d: HTMLDialogElement; id: number }[] = [];
let seq = 0;
let ignorePops = 0;

function prune() {
  for (let i = stack.length - 1; i >= 0; i--) {
    const s = stack[i];
    if (!s.d.open || !s.d.isConnected) stack.splice(i, 1);
  }
}

function goBackQuietly() {
  ignorePops++;
  history.back();
}

const showModal = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  showModal.call(this);
  if (SELF_MANAGED.some((c) => this.classList.contains(c))) return;
  if (stack.some((s) => s.d === this)) return;
  const id = ++seq;
  try { history.pushState({ ...(history.state ?? {}), __sheet: id }, ''); } catch { return; }
  stack.push({ d: this, id });
  const d = this;
  d.addEventListener('close', function onClose() {
    d.removeEventListener('close', onClose);
    const i = stack.findIndex((s) => s.id === id);
    if (i >= 0) stack.splice(i, 1);
    // Closed by a button: drop its history entry too, unless the sheet
    // already navigated somewhere (then that entry stays as it is).
    if (history.state?.__sheet === id) goBackQuietly();
  });
};

// Registered at start-up, so it runs before any screen's own popstate
// listener and can keep a sheet's back press from reaching them.
window.addEventListener('popstate', (e) => {
  if (ignorePops > 0) { ignorePops--; e.stopImmediatePropagation(); return; }
  prune();
  const top = stack[stack.length - 1];
  const at = history.state?.__sheet as number | undefined;
  if (top && at !== top.id && !(at && at > top.id)) {
    e.stopImmediatePropagation();
    const ev = new Event('cancel', { cancelable: true });
    if (top.d.dispatchEvent(ev)) {
      stack.pop();
      top.d.close();
    } else {
      // The sheet refused (e.g. unsaved work): keep it and its entry.
      try { history.pushState({ ...(history.state ?? {}), __sheet: top.id }, ''); } catch { /* ignore */ }
    }
    return;
  }
  // Landed on an entry of a sheet that is no longer open: step over it.
  if (at && !stack.some((s) => s.id === at)) { e.stopImmediatePropagation(); goBackQuietly(); }
});

export {};
