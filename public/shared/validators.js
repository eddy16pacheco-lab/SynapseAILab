/**
 * SynapseAI Lab — Validadores compartidos (servidor + navegador)
 *
 * Archivo UMD: se carga con `require()` en Node y como script global
 * `window.SynapseValidators` en el navegador. Así el cliente y el
 * servidor aplican EXACTAMENTE las mismas reglas (nada de reglas
 * duplicadas que se desincronicen).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SynapseValidators = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Expresiones regulares
   * ------------------------------------------------------------------ */
  var PATTERNS = {
    // Letras Unicode (acentos, ñ, etc.), espacios, apóstrofos, guion y punto.
    nombre: /^[\p{L}][\p{L}\s'’.-]{1,79}$/u,
    apellido: /^[\p{L}][\p{L}\s'’.-]{1,79}$/u,
    // Cédula: alfanumérica con guiones/espacios (ej. 402-1234567-8).
    cedula: /^[A-Za-z0-9][A-Za-z0-9\s-]{5,31}$/,
    // Teléfono internacional opcional.
    telefono: /^\+?[\d\s()-]{7,24}$/,
    // Correo (validación pragmática, no RFC 5322 completo).
    email: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/,
    ocupacion: /^[\p{L}\p{N}][\p{L}\p{N}\s'’.,/&+()\-]{2,119}$/u
  };

  /* ------------------------------------------------------------------ *
   * Contraseñas más frecuentes -> se rechazan aunque cumplan el formato
   * ------------------------------------------------------------------ */
  var COMMON_PASSWORDS = [
    'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
    'qwerty123', 'qwertyuiop', 'abc12345', 'admin123', 'administrador', 'iloveyou',
    'contrasena', 'contraseña', 'clave123', 'letmein', 'welcome1', 'synapse123'
  ];

  /* ------------------------------------------------------------------ *
   * Utilidades internas
   * ------------------------------------------------------------------ */
  function isStr(v) {
    return typeof v === 'string';
  }

  /** Normaliza un valor a string recortado y sin caracteres de control. */
  function clean(v) {
    if (v === null || v === undefined) return '';
    if (typeof v !== 'string') v = String(v);
    // eslint-disable-next-line no-control-regex
    return v.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  }

  function countDigits(v) {
    return (String(v).match(/\d/g) || []).length;
  }

  /**
   * Escapa HTML — se usa en las plantillas de correo (nodemailer) para
   * impedir inyección de etiquetas en el mensaje al administrador.
   */
  function escapeHtml(v) {
    return clean(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ------------------------------------------------------------------ *
   * Reglas de contraseña (estrictas)
   * ------------------------------------------------------------------ */
  function validatePassword(password) {
    var errors = [];
    var pwd = typeof password === 'string' ? password : '';

    if (pwd.length < 8) {
      errors.push('La contraseña debe tener al menos 8 caracteres.');
    }
    if (pwd.length > 72) {
      errors.push('La contraseña no puede superar los 72 caracteres.');
    }
    if (!/[A-Z]/.test(pwd)) {
      errors.push('La contraseña debe incluir al menos una letra mayúscula (A-Z).');
    }
    if (!/[a-z]/.test(pwd)) {
      errors.push('La contraseña debe incluir al menos una letra minúscula (a-z).');
    }
    if (!/\d/.test(pwd)) {
      errors.push('La contraseña debe incluir al menos un número (0-9).');
    }
    if (!/[^A-Za-z0-9]/.test(pwd)) {
      errors.push('La contraseña debe incluir al menos un símbolo (!@#$%^&*...).');
    }
    if (COMMON_PASSWORDS.indexOf(pwd.toLowerCase()) !== -1) {
      errors.push('Esta contraseña es demasiado común. Elige una más segura.');
    }

    return { valid: errors.length === 0, errors: errors, value: { length: pwd.length } };
  }

  /* ------------------------------------------------------------------ *
   * Validador principal del formulario de registro
   * ------------------------------------------------------------------ */
  /**
   * @param {Object} data  Objeto con los campos del formulario.
   * @returns {{ valid:boolean, errors:Object<string,string>, values:Object<string,string> }}
   */
  function validateRegistration(data) {
    var src = data && typeof data === 'object' ? data : {};
    var errors = {};
    var values = {};

    values.nombre = clean(src.nombre);
    values.apellido = clean(src.apellido);
    values.cedula = clean(src.cedula).toUpperCase();
    values.telefono = clean(src.telefono);
    values.ocupacion = clean(src.ocupacion);
    values.email = clean(src.email).toLowerCase();
    // La contraseña se conserva EXACTAMENTE como se escribió (sin trim, sin hash).
    values.password = typeof src.password === 'string' ? src.password : '';

    /* --- Nombre --- */
    if (!values.nombre) {
      errors.nombre = 'El nombre es obligatorio.';
    } else if (values.nombre.length < 2) {
      errors.nombre = 'El nombre debe tener al menos 2 caracteres.';
    } else if (!PATTERNS.nombre.test(values.nombre)) {
      errors.nombre = 'El nombre solo puede contener letras, espacios, apóstrofos, guiones y puntos.';
    }

    /* --- Apellido --- */
    if (!values.apellido) {
      errors.apellido = 'El apellido es obligatorio.';
    } else if (values.apellido.length < 2) {
      errors.apellido = 'El apellido debe tener al menos 2 caracteres.';
    } else if (!PATTERNS.apellido.test(values.apellido)) {
      errors.apellido = 'El apellido solo puede contener letras, espacios, apóstrofos, guiones y puntos.';
    }

    /* --- Cédula --- */
    if (!values.cedula) {
      errors.cedula = 'La cédula de identidad es obligatoria.';
    } else if (!PATTERNS.cedula.test(values.cedula)) {
      errors.cedula = 'La cédula debe tener entre 6 y 32 caracteres alfanuméricos (ej. 402-1234567-8).';
    }

    /* --- Teléfono --- */
    if (!values.telefono) {
      errors.telefono = 'El teléfono es obligatorio.';
    } else if (!PATTERNS.telefono.test(values.telefono)) {
      errors.telefono = 'El teléfono solo puede contener números, espacios, +, -, ( y ).';
    } else {
      var digits = countDigits(values.telefono);
      if (digits < 8 || digits > 15) {
        errors.telefono = 'El teléfono debe contener entre 8 y 15 dígitos.';
      }
    }

    /* --- Ocupación --- */
    if (!values.ocupacion) {
      errors.ocupacion = 'Indica a qué te dedicas.';
    } else if (values.ocupacion.length < 3) {
      errors.ocupacion = 'La ocupación debe tener al menos 3 caracteres.';
    } else if (!PATTERNS.ocupacion.test(values.ocupacion)) {
      errors.ocupacion = 'La ocupación contiene caracteres no permitidos.';
    }

    /* --- Correo --- */
    if (!values.email) {
      errors.email = 'El correo electrónico es obligatorio.';
    } else if (values.email.length > 190) {
      errors.email = 'El correo electrónico es demasiado largo.';
    } else if (!PATTERNS.email.test(values.email)) {
      errors.email = 'Introduce un correo electrónico válido (ej. nombre@dominio.com).';
    }

    /* --- Contraseña --- */
    var pwd = validatePassword(values.password);
    if (!pwd.valid) {
      errors.password = pwd.errors[0];
      errors.passwordDetalle = pwd.errors;
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors: errors,
      values: values
    };
  }

  return {
    PATTERNS: PATTERNS,
    clean: clean,
    escapeHtml: escapeHtml,
    countDigits: countDigits,
    validatePassword: validatePassword,
    validateRegistration: validateRegistration
  };
});
