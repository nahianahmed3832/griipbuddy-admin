'use client';

import { useEffect, useState, type FormEvent } from 'react';

type FieldErrors = {
  phone?: string;
  password?: string;
};

export function SignInForm({ action, error }: { action: string; error?: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showError, setShowError] = useState(Boolean(error));

  useEffect(() => {
    const resetSubmitting = () => setSubmitting(false);
    window.addEventListener('pageshow', resetSubmitting);
    return () => window.removeEventListener('pageshow', resetSubmitting);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    const values = new FormData(event.currentTarget);
    const phone = String(values.get('phone') ?? '').trim();
    const password = String(values.get('password') ?? '');
    const errors: FieldErrors = {};

    // Mirror the session endpoint's input bounds. It authenticates the number or the
    // configured staff email server-side and is the only issuer of the session cookie.
    if (!/^\+?\d{8,16}$/.test(phone) && !/^[^\s@]+@[^\s@]+$/.test(phone)) {
      errors.phone = 'Enter your phone number.';
    }
    if (!password.length) errors.password = 'Password is required';
    else if (password.length < 6) errors.password = 'Password must be at least 6 characters long';

    setShowError(false);
    setFieldErrors(errors);
    if (errors.phone || errors.password) {
      event.preventDefault();
      return;
    }

    setSubmitting(true);
  }

  return (
    <form className="production-sign-in-form" method="post" action={action} noValidate onSubmit={submit}>
      <h1 id="sign-in-heading">Login</h1>
      <div className="production-sign-in-field">
        <label htmlFor="staff-identifier">Phone Number</label>
        <input
          id="staff-identifier"
          name="phone"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          required
          placeholder="Enter your phone number"
          aria-invalid={Boolean(fieldErrors.phone)}
          aria-describedby={fieldErrors.phone ? 'staff-identifier-error' : undefined}
        />
        {fieldErrors.phone && <p id="staff-identifier-error" role="alert">{fieldErrors.phone}</p>}
      </div>
      <div className="production-sign-in-field">
        <label htmlFor="staff-password">Password</label>
        <input
          id="staff-password"
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={256}
          required
          placeholder="Enter your password"
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? 'staff-password-error' : undefined}
        />
        {fieldErrors.password && <p id="staff-password-error" role="alert">{fieldErrors.password}</p>}
      </div>
      <button className="production-sign-in-submit" type="submit" disabled={submitting}>
        {submitting ? 'Logging in…' : 'Login'}
      </button>
      {showError && error && <p className="production-sign-in-error" role="alert">{error}</p>}
    </form>
  );
}
