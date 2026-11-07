'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, CircleAlert, Eye, EyeOff } from 'lucide-react';

export function SignInForm({ action, error }: { action: string; error?: string }) {
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const reset = () => {
      setSubmitting(false);
      setVisible(false);
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  return (
    <form className="sign-in-form" method="post" action={action} onSubmit={() => {
      setVisible(false);
      setSubmitting(true);
    }}>
      {error && (
        <div className="sign-in-error" role="alert">
          <CircleAlert size={17} aria-hidden="true" /> {error}
        </div>
      )}
      <div className="sign-in-field">
        <label htmlFor="staff-identifier">Staff email or phone number</label>
        <input id="staff-identifier" name="phone" type="text" autoComplete="username" autoCapitalize="none"
          spellCheck={false} maxLength={254} required placeholder="Email address or phone number" />
      </div>
      <div className="sign-in-field">
        <label htmlFor="staff-password">Password</label>
        <div className="sign-in-password">
          <input id="staff-password" name="password" type={visible ? 'text' : 'password'}
            autoComplete="current-password" maxLength={256} required placeholder="Enter your password" />
          <button className="sign-in-reveal" type="button" aria-label={visible ? 'Hide password' : 'Show password'}
            onClick={() => setVisible(!visible)}>
            {visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <button className="sign-in-submit" type="submit" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'} <ArrowRight size={17} aria-hidden="true" />
      </button>
    </form>
  );
}
