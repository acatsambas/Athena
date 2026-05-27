'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const [mode, setMode] = useState<'parent' | 'child'>('parent');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { signIn, childLogin } = useAuth();
  const router = useRouter();

  const handleParentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await signIn(email, password);
      router.push('/parent');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to sign in';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChildLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await childLogin(username, pin);
      router.push('/child');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to sign in';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-container">
        <button className="btn btn-ghost back-btn" onClick={() => router.push('/')}>
          ← Back
        </button>

        <div className="auth-header">
          <h1>Welcome Back</h1>
          <p>Sign in to continue learning</p>
        </div>

        {/* Mode Toggle */}
        <div className="auth-toggle">
          <button
            id="toggle-parent"
            className={`toggle-btn ${mode === 'parent' ? 'active' : ''}`}
            onClick={() => { setMode('parent'); setError(''); }}
          >
            Parent
          </button>
          <button
            id="toggle-child"
            className={`toggle-btn ${mode === 'child' ? 'active' : ''}`}
            onClick={() => { setMode('child'); setError(''); }}
          >
            Child
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {mode === 'parent' ? (
          <form onSubmit={handleParentLogin} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="parent@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              id="btn-parent-login"
              type="submit"
              className="btn btn-primary btn-lg btn-full"
              disabled={isLoading}
            >
              {isLoading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleChildLogin} className="auth-form">
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label htmlFor="pin">PIN</label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setPin(val);
                }}
                placeholder="6-digit PIN"
                required
                autoComplete="off"
              />
              <span className="form-hint">Enter your 6-digit PIN</span>
            </div>

            <button
              id="btn-child-login"
              type="submit"
              className="btn btn-primary btn-lg btn-full"
              disabled={isLoading || pin.length !== 6}
            >
              {isLoading ? 'Signing in…' : 'Let\'s Go!'}
            </button>
          </form>
        )}

        <div className="auth-footer">
          <p>
            Don&apos;t have an account?{' '}
            <button className="btn-link" onClick={() => router.push('/signup')}>
              Create one
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
