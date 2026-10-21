/* =====================================================================
   SynapseAI Lab — Lógica del cliente
   Registro con formulario + Google Identity Services (GIS)
   ===================================================================== */
(function () {
  'use strict';

  var V = window.SynapseValidators;
  var CONFIG = { googleClientId: '', bonusUsd: 1, bonusTexto: '$1.00 USD', appName: 'SynapseAI Lab' };

  /* ------------------------------------------------------------------ *
   * Referencias del DOM
   * ------------------------------------------------------------------ */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var form = $('#registerForm');
  var cardRegister = $('#cardRegister');
  var cardWelcome = $('#cardWelcome');
  var submitBtn = $('#submitBtn');
  var googleHint = $('#googleHint');
  var strengthBar = $('#strengthBar');
  var strengthFill = $('#strengthFill');
  var strengthLabel = $('#strengthLabel');

  var FIELDS = ['nombre', 'apellido', 'cedula', 'telefono', 'ocupacion', 'email', 'password'];

  /* ------------------------------------------------------------------ *
   * Utilidades
   * ------------------------------------------------------------------ */
  function toast(message, type) {
    var box = $('#toasts');
    if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast toast--' + (type || 'info');
    var icons = { success: '✓', error: '✕', info: 'ℹ' };
    var icon = document.createElement('span');
    icon.className = 'toast__icon';
    icon.textContent = icons[type] || 'ℹ';
    var text = document.createElement('span');
    text.textContent = message; // textContent: evita inyección de HTML
    el.appendChild(icon);
    el.appendChild(text);
    box.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { el.remove(); }, 320);
    }, 5200);
  }

  function setLoading(btn, loading) {
    if (!btn) return;
    btn.classList.toggle('is-loading', !!loading);
    btn.disabled = !!loading;
  }

  function money(value) {
    var n = Number(value || 0);
    return '$' + n.toFixed(2) + ' USD';
  }

  function api(url, options) {
    var opts = options || {};
    return fetch(url, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin'
    }).then(function (res) {
      return res
        .json()
        .catch(function () { return { ok: false, error: 'Respuesta inválida del servidor.' }; })
        .then(function (data) {
          if (!res.ok) {
            var err = new Error(data && data.error ? data.error : 'Error ' + res.status);
            err.status = res.status;
            err.data = data || {};
            throw err;
          }
          return data;
        });
    });
  }

  /* ------------------------------------------------------------------ *
   * Validación por campo (mismas reglas que el servidor)
   * ------------------------------------------------------------------ */
  function validateField(name, value) {
    var v = V.clean(value);
    var P = V.PATTERNS;

    switch (name) {
      case 'nombre':
        if (!v) return 'El nombre es obligatorio.';
        if (v.length < 2) return 'El nombre debe tener al menos 2 caracteres.';
        if (!P.nombre.test(v)) return 'Solo letras, espacios, apóstrofos, guiones y puntos.';
        return '';

      case 'apellido':
        if (!v) return 'El apellido es obligatorio.';
        if (v.length < 2) return 'El apellido debe tener al menos 2 caracteres.';
        if (!P.apellido.test(v)) return 'Solo letras, espacios, apóstrofos, guiones y puntos.';
        return '';

      case 'cedula':
        if (!v) return 'La cédula de identidad es obligatoria.';
        if (!P.cedula.test(v)) return 'Debe tener entre 6 y 32 caracteres alfanuméricos (ej. 402-1234567-8).';
        return '';

      case 'telefono':
        if (!v) return 'El teléfono es obligatorio.';
        if (!P.telefono.test(v)) return 'Formato no válido (ej. +1 809 555 0134).';
        var digits = V.countDigits(v);
        if (digits < 8 || digits > 15) return 'Debe contener entre 8 y 15 dígitos.';
        return '';

      case 'ocupacion':
        if (!v) return 'Indica a qué te dedicas.';
        if (v.length < 3) return 'La ocupación debe tener al menos 3 caracteres.';
        if (!P.ocupacion.test(v)) return 'Caracteres no permitidos.';
        return '';

      case 'email':
        if (!v) return 'El correo electrónico es obligatorio.';
        if (!P.email.test(v)) return 'Introduce un correo válido (ej. nombre@dominio.com).';
        return '';

      case 'password':
        var res = V.validatePassword(value || '');
        return res.valid ? '' : res.errors[0];

      default:
        return '';
    }
  }

  function showFieldError(name, message) {
    var input = document.getElementById(name);
    var box = document.getElementById('err-' + name);
    if (!input || !box) return;
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      box.textContent = message;
      box.classList.add('is-visible');
    } else {
      input.removeAttribute('aria-invalid');
      box.textContent = '';
      box.classList.remove('is-visible');
    }
  }

  function validateForm(showAll) {
    var ok = true;
    FIELDS.forEach(function (name) {
      var input = document.getElementById(name);
      if (!input) return;
      var msg = validateField(name, input.value);
      if (msg) ok = false;
      if (showAll || input.getAttribute('aria-invalid') === 'true') showFieldError(name, msg);
      else if (!msg) showFieldError(name, '');
    });

    var terms = $('#terms');
    var termsError = $('#err-terms');
    if (terms && !terms.checked) {
      ok = false;
      if (termsError) {
        termsError.textContent = 'Debes aceptar los términos y condiciones.';
        termsError.classList.add('is-visible');
      }
    } else if (termsError) {
      termsError.textContent = '';
      termsError.classList.remove('is-visible');
    }

    return ok;
  }

  /* ------------------------------------------------------------------ *
   * Medidor de seguridad de contraseña
   * ------------------------------------------------------------------ */
  function updateStrength(value) {
    var pwd = value || '';
    var score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd) && pwd.length >= 12) score++;

    var level = Math.min(score, 4);
    var labels = ['', 'Débil', 'Aceptable', 'Buena', 'Excelente'];
    var widths = [0, 25, 50, 75, 100];

    strengthFill.style.width = widths[level] + '%';
    strengthLabel.textContent = pwd ? 'Seguridad: ' + labels[level] : 'Seguridad de la contraseña';
    strengthBar.setAttribute('data-level', String(level));
  }

  /* ------------------------------------------------------------------ *
   * Google Identity Services
   * ------------------------------------------------------------------ */
  var googleReady = false;

  function initGoogle() {
    if (!CONFIG.googleClientId) {
      googleHint.textContent = 'Configura GOOGLE_CLIENT_ID en el archivo .env para habilitar el acceso con Google.';
      googleHint.classList.add('google-block__hint--error');
      return;
    }
    if (typeof window.google === 'undefined' || !google.accounts || !google.accounts.id) {
      googleHint.textContent = 'No fue posible cargar el servicio de Google. Revisa tu conexión.';
      googleHint.classList.add('google-block__hint--error');
      return;
    }

    google.accounts.id.initialize({
      client_id: CONFIG.googleClientId,
      callback: handleGoogleCredential,
      ux_mode: 'popup',
      auto_select: false,
      cancel_on_tap_outside: false,
      context: 'signup'
    });

    var opts = {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      width: Math.max(140, Math.min(360, window.innerWidth - 70)),
      text: 'signup_with',
      locale: 'es'
    };

    var btn = $('#googleSigninButton');
    if (btn) {
      google.accounts.id.renderButton(btn, opts);
      googleReady = true;
    }

    var verifyBtn = $('#googleVerifyButton');
    if (verifyBtn) {
      google.accounts.id.renderButton(verifyBtn, {
        type: 'standard',
        theme: 'filled_black',
        size: 'medium',
        shape: 'pill',
        text: 'continue_with',
        locale: 'es'
      });
    }
  }

  function handleGoogleCredential(response) {
    if (!response || !response.credential) {
      toast('No se recibió una credencial válida de Google.', 'error');
      return;
    }

    // Sugiere el correo del formulario para vincular la cuenta si existe.
    var emailInput = $('#email');
    if (emailInput && emailInput.value) {
      try { google.accounts.id.setLoginHint(emailInput.value); } catch (e) { /* noop */ }
    }

    api('/api/auth/google', { method: 'POST', body: { credential: response.credential } })
      .then(function (data) {
        showWelcome(data.user, data.nuevo !== false);
        toast(data.message || 'Cuenta verificada con Google.', 'success');
      })
      .catch(function (err) {
        toast(err.message || 'No se pudo verificar la cuenta de Google.', 'error');
      });
  }

  /* ------------------------------------------------------------------ *
   * Pantalla de bienvenida
   * ------------------------------------------------------------------ */
  function showWelcome(user, isNew) {
    if (!user) return;

    var set = function (id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value === null || value === undefined || value === '' ? '—' : value;
    };

    set('w-nombre', user.nombre);
    set('w-apellido', user.apellido);
    set('w-cedula', user.cedula);
    set('w-telefono', user.telefono);
    set('w-ocupacion', user.ocupacion);
    set('w-email', user.email);
    set('w-id', '#' + user.id);

    set('welcomeBalance', money(user.saldo));
    set('welcomeBonus', money(user.saldo));

    var verified = document.getElementById('w-verified');
    if (verified) {
      if (user.emailVerified) {
        verified.textContent = 'Verificado por Google';
        verified.className = 'badge badge--ok';
      } else {
        verified.textContent = 'Pendiente de verificación';
        verified.className = 'badge badge--warn';
      }
    }

    // Aviso de verificación con Google (solo cuentas creadas por formulario).
    var verifyBlock = $('#verifyBlock');
    if (verifyBlock) verifyBlock.hidden = !!user.emailVerified;

    // Perfil incompleto (cuentas creadas únicamente con Google).
    var profileBlock = $('#profileBlock');
    if (profileBlock) profileBlock.hidden = !!user.perfilCompleto;

    var note = $('#welcomeNote');
    if (note) {
      note.textContent = user.emailVerified
        ? 'El administrador ya recibió por correo los datos de tu registro.'
        : 'El administrador ya recibió por correo los datos de tu registro. Verifica tu correo con Google para completar la activación.';
    }

    cardRegister.hidden = true;
    cardWelcome.hidden = false;
    cardWelcome.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ------------------------------------------------------------------ *
   * Envío del formulario
   * ------------------------------------------------------------------ */
  function handleSubmit(event) {
    event.preventDefault();

    if (!validateForm(true)) {
      toast('Revisa los campos señalados en rojo.', 'error');
      var firstInvalid = $('.field input[aria-invalid="true"]');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    var payload = {};
    FIELDS.forEach(function (name) {
      var input = document.getElementById(name);
      payload[name] = input ? input.value : '';
    });

    setLoading(submitBtn, true);

    api('/api/auth/register', { method: 'POST', body: payload })
      .then(function (data) {
        setLoading(submitBtn, false);
        showWelcome(data.user, true);
        toast('¡Registro completado! Se acreditaron ' + money(data.bonus) + ' en tu saldo.', 'success');
        if (form) form.reset();
        updateStrength('');
      })
      .catch(function (err) {
        setLoading(submitBtn, false);
        var data = err.data || {};

        if (data.code === 'VALIDATION_ERROR' && data.errors) {
          Object.keys(data.errors).forEach(function (key) {
            showFieldError(key, data.errors[key]);
          });
        }
        if (data.code === 'DUPLICATE' && data.errors) {
          if (data.errors.email) showFieldError('email', 'Este correo ya está registrado.');
          if (data.errors.cedula) showFieldError('cedula', 'Esta cédula ya está registrada.');
        }

        toast(err.message || 'No se pudo completar el registro.', 'error');
      });
  }

  /* ------------------------------------------------------------------ *
   * Perfil (cuentas creadas con Google)
   * ------------------------------------------------------------------ */
  function handleProfileSubmit(event) {
    event.preventDefault();

    var data = {
      cedula: $('#p-cedula').value,
      telefono: $('#p-telefono').value,
      ocupacion: $('#p-ocupacion').value
    };

    var ok = true;
    ['cedula', 'telefono', 'ocupacion'].forEach(function (key) {
      var map = { cedula: 'p-cedula', telefono: 'p-telefono', ocupacion: 'p-ocupacion' };
      var msg = validateField(key, data[key]);
      var errId = 'err-' + map[key];
      var errEl = document.getElementById(errId);
      if (msg) {
        ok = false;
        if (errEl) { errEl.textContent = msg; errEl.classList.add('is-visible'); }
      } else if (errEl) {
        errEl.textContent = '';
        errEl.classList.remove('is-visible');
      }
    });

    if (!ok) {
      toast('Revisa los campos de tu perfil.', 'error');
      return;
    }

    var btn = $('#profileBtn');
    setLoading(btn, true);

    api('/api/auth/me/profile', { method: 'PATCH', body: data })
      .then(function (res) {
        setLoading(btn, false);
        showWelcome(res.user, false);
        toast('Perfil actualizado correctamente.', 'success');
      })
      .catch(function (err) {
        setLoading(btn, false);
        toast(err.message || 'No se pudo actualizar el perfil.', 'error');
      });
  }

  /* ------------------------------------------------------------------ *
   * Panel del anotador (movimientos de saldo)
   * ------------------------------------------------------------------ */
  function openDashboard() {
    var modal = $('#dashboardModal');
    var body = $('#dashboardBody');
    if (!modal || !body) return;

    modal.hidden = false;
    body.textContent = 'Cargando tus movimientos de saldo…';

    api('/api/me/movimientos')
      .then(function (data) {
        var moves = data.movimientos || [];
        body.textContent = '';

        if (!moves.length) {
          var empty = document.createElement('p');
          empty.className = 'modal__muted';
          empty.textContent = 'Todavía no tienes movimientos de saldo.';
          body.appendChild(empty);
          return;
        }

        var list = document.createElement('div');
        list.className = 'tx-list';

        moves.forEach(function (m) {
          var row = document.createElement('div');
          row.className = 'tx';

          var left = document.createElement('div');
          var label = document.createElement('div');
          label.className = 'tx__label';
          label.textContent = m.referencia || (m.tipo === 'bono' ? 'Bono de bienvenida' : m.tipo);
          var meta = document.createElement('div');
          meta.className = 'tx__meta';
          meta.textContent = new Date(m.fecha).toLocaleString('es-DO');
          left.appendChild(label);
          left.appendChild(meta);

          var amount = document.createElement('div');
          amount.className = 'tx__amount';
          amount.textContent = (m.monto >= 0 ? '+' : '') + money(m.monto);

          row.appendChild(left);
          row.appendChild(amount);
          list.appendChild(row);
        });

        body.appendChild(list);
      })
      .catch(function (err) {
        body.textContent = err.message || 'No se pudieron cargar los movimientos.';
      });
  }

  function closeModal() {
    var modal = $('#dashboardModal');
    if (modal) modal.hidden = true;
  }

  /* ------------------------------------------------------------------ *
   * Arranque
   * ------------------------------------------------------------------ */
  function bindEvents() {
    if (form) form.addEventListener('submit', handleSubmit);

    // Validación en vivo (blur) y limpieza al escribir.
    FIELDS.forEach(function (name) {
      var input = document.getElementById(name);
      if (!input) return;

      input.addEventListener('blur', function () {
        var msg = validateField(name, input.value);
        if (msg || input.getAttribute('aria-invalid') === 'true') showFieldError(name, msg);
      });

      input.addEventListener('input', function () {
        if (input.getAttribute('aria-invalid') === 'true') {
          var msg = validateField(name, input.value);
          if (!msg) showFieldError(name, '');
        }
        if (name === 'password') updateStrength(input.value);
      });
    });

    var terms = $('#terms');
    if (terms) {
      terms.addEventListener('change', function () {
        var err = $('#err-terms');
        if (terms.checked && err) { err.textContent = ''; err.classList.remove('is-visible'); }
      });
    }

    // Mostrar / ocultar contraseña
    var toggle = $('#togglePassword');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var input = $('#password');
        if (!input) return;
        var visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        toggle.classList.toggle('is-visible', !visible);
        toggle.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
        input.focus();
      });
    }

    var profileForm = $('#profileForm');
    if (profileForm) profileForm.addEventListener('submit', handleProfileSubmit);

    var dashboardBtn = $('#dashboardBtn');
    if (dashboardBtn) dashboardBtn.addEventListener('click', openDashboard);

    var logoutBtn = $('#logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        api('/api/auth/logout', { method: 'POST' })
          .then(function () {
            window.location.reload();
          })
          .catch(function () {
            window.location.reload();
          });
      });
    }

    $$('[data-close-modal]').forEach(function (el) {
      el.addEventListener('click', closeModal);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeModal();
    });
  }

  function loadSession() {
    api('/api/me')
      .then(function (data) {
        if (data.user) showWelcome(data.user, false);
      })
      .catch(function () { /* sin sesión activa: se muestra el formulario */ });
  }

  function boot() {
    $('#year').textContent = String(new Date().getFullYear());
    bindEvents();

    api('/api/config')
      .then(function (data) {
        CONFIG.googleClientId = data.googleClientId || '';
        CONFIG.bonusUsd = data.bonusUsd || 1;
        CONFIG.bonusTexto = data.bonusTexto || '$1.00 USD';

        var bonusForm = $('#bonusLabelForm');
        if (bonusForm) bonusForm.textContent = CONFIG.bonusTexto;
        var submitLabel = $('.btn__label', submitBtn);
        if (submitLabel) submitLabel.textContent = 'Crear mi cuenta y recibir ' + CONFIG.bonusTexto;
      })
      .catch(function () { /* la app funciona igual sin /api/config */ })
      .then(function () {
        // Google Identity Services puede cargarse de forma asíncrona.
        if (typeof window.google !== 'undefined' && window.google.accounts) initGoogle();
        else window.addEventListener('load', initGoogle);
      });

    loadSession();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
