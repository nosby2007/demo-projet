/* SOKIVA Firebase Auth flows and authenticated account rendering. */
'use strict';

(function sokivaIdentityRuntime() {
  if (window.SokivaIdentityRuntime) return;
  const backend = window.SokivaFirebase;
  if (!backend?.auth || !backend?.db) return;

  const allowedPages = new Set([
    'index.html', 'shop.html', 'product.html', 'checkout.html', 'account.html',
    'customer.html', 'seller.html', 'courier.html', 'admin.html', 'request.html'
  ]);

  function callable(name) {
    if (!backend.functions) throw new Error('Les fonctions Firebase ne sont pas disponibles.');
    return backend.functions.httpsCallable(name);
  }

  function toast(message, type = 'default', icon = 'info') {
    if (window.Toast?.show) return Toast.show(message, type, icon, 4500);
    window.alert(message);
  }

  function errorMessage(error) {
    const code = String(error?.code || '').replace('auth/', '');
    const known = {
      'email-already-in-use': 'Cette adresse email possède déjà un compte.',
      'invalid-email': 'Adresse email invalide.',
      'weak-password': 'Le mot de passe doit contenir au moins huit caractères.',
      'invalid-credential': 'Email ou mot de passe incorrect.',
      'user-not-found': 'Aucun compte ne correspond à cette adresse.',
      'wrong-password': 'Email ou mot de passe incorrect.',
      'too-many-requests': 'Trop de tentatives. Réessayez un peu plus tard.',
      'popup-closed-by-user': 'Connexion Google annulée.',
      'network-request-failed': 'Connexion réseau indisponible.'
    };
    return known[code] || String(error?.details?.message || error?.message || 'Opération impossible.').replace(/^FirebaseError:\s*/i, '');
  }

  function safeNext(raw, fallback = 'account.html') {
    try {
      const url = new URL(String(raw || fallback), window.location.href);
      const page = url.pathname.split('/').filter(Boolean).pop() || 'index.html';
      if (url.origin !== window.location.origin || !allowedPages.has(page)) return fallback;
      return `${page}${url.search}${url.hash}`;
    } catch {
      return fallback;
    }
  }

  function roleHome(identity) {
    if (identity?.isSuperAdmin) return 'admin.html';
    return {
      admin: 'admin.html',
      seller: 'seller.html',
      courier: 'courier.html',
      customer: 'customer.html'
    }[identity?.role] || 'account.html';
  }

  async function getIdentity() {
    const user = backend.auth.currentUser;
    if (!user) return null;
    if (backend.functions) {
      const response = await callable('getMyIdentity')({});
      return response.data || null;
    }
    const profile = (await backend.db.ref(`profiles/${user.uid}`).once('value')).val();
    return {
      uid: user.uid,
      email: user.email || profile?.email || '',
      emailVerified: user.emailVerified,
      displayName: user.displayName || profile?.name || '',
      role: profile?.role || 'customer',
      status: profile?.status || 'active',
      isSuperAdmin: profile?.isSuperAdmin === true,
      profile
    };
  }

  async function register(form) {
    const firstName = form.querySelector('[name="firstName"]')?.value.trim() || '';
    const lastName = form.querySelector('[name="lastName"]')?.value.trim() || '';
    const email = form.querySelector('[name="email"]')?.value.trim().toLowerCase() || '';
    const phone = form.querySelector('[name="phone"]')?.value.trim() || '';
    const password = form.querySelector('[name="password"]')?.value || '';
    const confirmPassword = form.querySelector('[name="confirmPassword"]')?.value || '';
    const terms = form.querySelector('[name="terms"]')?.checked === true;
    const marketingConsent = form.querySelector('[name="marketingConsent"]')?.checked === true;

    if (!firstName || !lastName || !email || !phone || !password) throw new Error('Tous les champs obligatoires doivent être remplis.');
    if (password.length < 8) throw new Error('Le mot de passe doit contenir au moins huit caractères.');
    if (password !== confirmPassword) throw new Error('Les mots de passe ne correspondent pas.');
    if (!terms) throw new Error('Vous devez accepter les conditions et la politique de confidentialité.');

    const credential = await backend.auth.createUserWithEmailAndPassword(email, password);
    try {
      const displayName = `${firstName} ${lastName}`.trim();
      await credential.user.updateProfile({ displayName });
      if (backend.functions) {
        await callable('registerCustomerProfile')({
          firstName,
          lastName,
          email,
          phone,
          language: 'fr',
          marketingConsent
        });
      } else {
        await backend.db.ref(`profiles/${credential.user.uid}`).set({
          uid: credential.user.uid,
          role: 'customer',
          status: 'active',
          tenantId: 'lamylenoise',
          brandId: 'sokiva',
          name: displayName,
          firstName,
          lastName,
          email,
          phone,
          language: 'fr',
          marketingConsent,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
      }
      await credential.user.sendEmailVerification({ url: `${window.location.origin}/login.html?verified=1` });
      await backend.auth.signOut();
      toast('Compte créé. Vérifiez votre email avant de vous connecter.', 'success', 'mail-check');
      setTimeout(() => window.location.assign('login.html?registered=1'), 1200);
    } catch (error) {
      try { await credential.user.delete(); } catch {}
      throw error;
    }
  }

  async function login(form) {
    const email = form.querySelector('[name="email"]')?.value.trim().toLowerCase() || '';
    const password = form.querySelector('[name="password"]')?.value || '';
    const remember = form.querySelector('[name="remember"]')?.checked === true;
    if (!email || !password) throw new Error('Email et mot de passe requis.');

    await backend.auth.setPersistence(remember
      ? firebase.auth.Auth.Persistence.LOCAL
      : firebase.auth.Auth.Persistence.SESSION);
    const credential = await backend.auth.signInWithEmailAndPassword(email, password);
    if (!credential.user.emailVerified) {
      await credential.user.sendEmailVerification({ url: `${window.location.origin}/login.html?verified=1` });
      await backend.auth.signOut();
      throw new Error('Votre email doit être vérifié. Un nouveau lien vient d’être envoyé.');
    }
    const identity = await getIdentity();
    const next = safeNext(new URLSearchParams(window.location.search).get('next'), roleHome(identity));
    toast('Connexion réussie.', 'success', 'log-in');
    setTimeout(() => window.location.assign(next), 500);
  }

  async function googleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await backend.auth.signInWithPopup(provider);
    let identity = await getIdentity();
    if (!identity?.profile) {
      const [firstName = '', ...lastParts] = String(credential.user.displayName || '').trim().split(/\s+/);
      await callable('registerCustomerProfile')({
        firstName,
        lastName: lastParts.join(' '),
        email: credential.user.email,
        phone: '',
        language: 'fr',
        marketingConsent: false
      });
      identity = await getIdentity();
    }
    const next = safeNext(new URLSearchParams(window.location.search).get('next'), roleHome(identity));
    window.location.assign(next);
  }

  async function resetPassword(form) {
    const email = form.querySelector('[name="resetEmail"]')?.value.trim().toLowerCase() || '';
    if (!email) throw new Error('Entrez votre adresse email.');
    await backend.auth.sendPasswordResetEmail(email, { url: `${window.location.origin}/login.html` });
    toast('Lien de réinitialisation envoyé.', 'success', 'mail');
  }

  function bindForms() {
    const loginForm = document.getElementById('sokiva-login-form');
    loginForm?.addEventListener('submit', async event => {
      event.preventDefault();
      const button = loginForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try { await login(loginForm); }
      catch (error) { toast(errorMessage(error), 'error', 'alert-circle'); }
      finally { if (button) button.disabled = false; }
    });

    const registerForm = document.getElementById('sokiva-register-form');
    registerForm?.addEventListener('submit', async event => {
      event.preventDefault();
      const button = registerForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try { await register(registerForm); }
      catch (error) { toast(errorMessage(error), 'error', 'alert-circle'); }
      finally { if (button) button.disabled = false; }
    });

    const resetForm = document.getElementById('sokiva-reset-form');
    resetForm?.addEventListener('submit', async event => {
      event.preventDefault();
      const button = resetForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try { await resetPassword(resetForm); }
      catch (error) { toast(errorMessage(error), 'error', 'alert-circle'); }
      finally { if (button) button.disabled = false; }
    });

    document.getElementById('show-reset-password')?.addEventListener('click', event => {
      event.preventDefault();
      document.getElementById('reset-password-panel')?.removeAttribute('hidden');
      document.querySelector('#sokiva-reset-form input')?.focus();
    });

    document.querySelectorAll('[data-google-login]').forEach(button => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await googleLogin(); }
        catch (error) { toast(errorMessage(error), 'error', 'alert-circle'); }
        finally { button.disabled = false; }
      });
    });
  }

  function boot() {
    bindForms();
    const params = new URLSearchParams(window.location.search);
    if (params.has('registered')) toast('Compte créé. Consultez votre boîte email.', 'success', 'mail-check');
    if (params.has('verified')) toast('Email vérifié. Vous pouvez vous connecter.', 'success', 'badge-check');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.SokivaIdentityRuntime = Object.freeze({ getIdentity, roleHome, safeNext, errorMessage });
})();
