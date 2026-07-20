/* SOKIVA professional toast presentation and accessibility runtime. */
'use strict';

(function sokivaToastRuntime() {
  if (window.SokivaToastRuntime) return;

  const TYPE_META = Object.freeze({
    success: { title: 'Operation reussie', icon: 'circle-check' },
    error: { title: 'Une erreur est survenue', icon: 'circle-alert' },
    warning: { title: 'Attention requise', icon: 'triangle-alert' },
    info: { title: 'Information', icon: 'info' },
    default: { title: 'Notification', icon: 'bell' }
  });

  function installStyles() {
    if (document.getElementById('sokiva-toast-runtime-styles')) return;
    const style = document.createElement('style');
    style.id = 'sokiva-toast-runtime-styles';
    style.textContent = `
      #toast-container {
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 10000;
        display: grid;
        gap: 12px;
        width: min(420px, calc(100vw - 32px));
        pointer-events: none;
      }
      #toast-container .toast {
        position: relative;
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) 32px;
        align-items: center;
        gap: 12px;
        min-height: 78px;
        margin: 0;
        padding: 14px 14px 14px 16px;
        overflow: hidden;
        color: #172033;
        background: rgba(255,255,255,.98);
        border: 1px solid rgba(15,23,42,.10);
        border-radius: 18px;
        box-shadow: 0 20px 55px rgba(15,23,42,.18), 0 4px 14px rgba(15,23,42,.08);
        backdrop-filter: blur(18px);
        pointer-events: auto;
        animation: sokivaToastIn .28s cubic-bezier(.2,.8,.2,1) both;
      }
      #toast-container .toast::before {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 5px;
        background: #2563eb;
      }
      #toast-container .toast.success::before { background: #16a34a; }
      #toast-container .toast.error::before { background: #dc2626; }
      #toast-container .toast.warning::before { background: #d97706; }
      #toast-container .toast.info::before { background: #2563eb; }
      #toast-container .toast > svg,
      #toast-container .toast > i {
        width: 24px;
        height: 24px;
        padding: 10px;
        box-sizing: content-box;
        border-radius: 14px;
        color: #2563eb;
        background: #eff6ff;
      }
      #toast-container .toast.success > svg,
      #toast-container .toast.success > i { color: #15803d; background: #f0fdf4; }
      #toast-container .toast.error > svg,
      #toast-container .toast.error > i { color: #b91c1c; background: #fef2f2; }
      #toast-container .toast.warning > svg,
      #toast-container .toast.warning > i { color: #b45309; background: #fffbeb; }
      .sokiva-toast-copy { min-width: 0; line-height: 1.35; }
      .sokiva-toast-title { display: block; margin-bottom: 3px; font-size: 14px; font-weight: 800; color: #0f172a; }
      .sokiva-toast-message { display: block; font-size: 13px; color: #475569; overflow-wrap: anywhere; }
      .sokiva-toast-close {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: 0;
        border-radius: 10px;
        color: #64748b;
        background: transparent;
        cursor: pointer;
      }
      .sokiva-toast-close:hover { color: #0f172a; background: #f1f5f9; }
      .sokiva-toast-close svg { width: 17px; height: 17px; }
      #toast-container .toast.out { animation: sokivaToastOut .22s ease both; }
      @keyframes sokivaToastIn { from { opacity: 0; transform: translate3d(22px,-8px,0) scale(.97); } to { opacity: 1; transform: none; } }
      @keyframes sokivaToastOut { to { opacity: 0; transform: translate3d(30px,0,0) scale(.96); } }
      @media (max-width: 640px) {
        #toast-container { top: 12px; right: 16px; left: 16px; width: auto; }
      }
      @media (prefers-reduced-motion: reduce) {
        #toast-container .toast, #toast-container .toast.out { animation-duration: .01ms; }
      }
    `;
    document.head.appendChild(style);
  }

  function enhance(toast) {
    if (!(toast instanceof HTMLElement) || toast.dataset.sokivaEnhanced === 'true') return;
    toast.dataset.sokivaEnhanced = 'true';
    const type = ['success', 'error', 'warning', 'info'].find(name => toast.classList.contains(name)) || 'default';
    const meta = TYPE_META[type];
    const icon = toast.querySelector(':scope > svg, :scope > i');
    const nodes = [...toast.childNodes].filter(node => node !== icon);
    const message = nodes.map(node => node.textContent || '').join(' ').trim();
    nodes.forEach(node => node.remove());

    if (icon) icon.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('div');
    copy.className = 'sokiva-toast-copy';
    copy.innerHTML = `<strong class="sokiva-toast-title"></strong><span class="sokiva-toast-message"></span>`;
    copy.querySelector('.sokiva-toast-title').textContent = meta.title;
    copy.querySelector('.sokiva-toast-message').textContent = message;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'sokiva-toast-close';
    close.setAttribute('aria-label', 'Fermer la notification');
    close.innerHTML = '<i data-lucide="x" aria-hidden="true"></i>';
    close.addEventListener('click', () => {
      toast.classList.add('out');
      setTimeout(() => toast.remove(), 240);
    });

    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    toast.append(copy, close);
    if (window.lucide) window.lucide.createIcons({ nodes: [toast] });
  }

  function start() {
    installStyles();
    const enhanceExisting = () => document.querySelectorAll('#toast-container .toast').forEach(enhance);
    enhanceExisting();
    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node instanceof HTMLElement && node.matches('.toast')) enhance(node);
        if (node instanceof HTMLElement) node.querySelectorAll?.('.toast').forEach(enhance);
      }));
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.SokivaToastRuntime = Object.freeze({ enhance, refresh: enhanceExisting });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
