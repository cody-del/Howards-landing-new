const form = document.querySelector('#consultation-form');
const button = form.querySelector('button[type="submit"]');
const errorBox = document.querySelector('#form-error');
const fields = ['firstName', 'lastName', 'phone', 'email'];
const CALL_US = 'We couldn’t confirm your request. Please call (303) 449-4337 before submitting again.';
// consultation.mjs rejects anything sent sooner than this after the page loads.
const MIN_FILL_MS = 3000;
// The same email pattern consultation.mjs and the main site accept.
const EMAIL = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;
let pending = false;

function fieldError(name) {
  const value = form.elements[name].value.trim();
  if (!value) return `Please enter your ${{firstName: 'first name', lastName: 'last name', phone: 'phone number', email: 'email address'}[name]}.`;
  if (name === 'email' && !EMAIL.test(value)) return 'Please enter a valid email address.';
  if (name === 'phone' && !/^\d{10}$|^1\d{10}$/.test(value.replace(/\D/g, ''))) return 'Please enter a 10-digit phone number.';
  return '';
}

function validate(name) {
  const message = fieldError(name);
  const error = document.querySelector(`#${name}-error`);
  error.textContent = message;
  error.hidden = !message;
  form.elements[name].setAttribute('aria-invalid', String(Boolean(message)));
  return !message;
}

for (const name of fields) {
  form.elements[name].addEventListener('input', () => {
    if (form.elements[name].getAttribute('aria-invalid') === 'true') validate(name);
  });
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (pending) return;
  errorBox.hidden = true;
  const invalid = fields.filter(name => !validate(name));
  if (invalid.length) {
    form.elements[invalid[0]].focus();
    return;
  }
  pending = true;
  button.disabled = true;
  button.textContent = 'Sending your request…';
  form.setAttribute('aria-busy', 'true');
  try {
    // Someone whose browser autofills the form can be faster than the minimum;
    // wait it out rather than have the lead rejected.
    const wait = MIN_FILL_MS + 100 - performance.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    const payload = Object.fromEntries(new FormData(form));
    // Time since the page started loading, on this browser's own clock.
    payload.elapsedMs = Math.round(performance.now());
    const response = await fetch('/api/consultation', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      // AbortSignal.timeout is missing before Safari 16 (iOS 15 iPads); send
      // without a timeout there rather than fail.
      signal: AbortSignal.timeout?.(20000),
    });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error(result.error || CALL_US);
    form.hidden = true;
    form.reset();
    const success = document.querySelector('#consultation-success');
    success.hidden = false;
    success.focus();
  } catch (error) {
    errorBox.textContent = error.name === 'TimeoutError' || error instanceof TypeError || error instanceof SyntaxError
      ? CALL_US
      : error.message;
    errorBox.hidden = false;
  } finally {
    pending = false;
    button.disabled = false;
    button.textContent = 'Request My Consultation';
    form.removeAttribute('aria-busy');
  }
});
