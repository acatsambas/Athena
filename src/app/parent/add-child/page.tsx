'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function AddChildPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [yearOfBirth, setYearOfBirth] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 15;
  const maxYear = currentYear - 4;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (pin.length !== 6) {
      setError('PIN must be exactly 6 digits');
      return;
    }

    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }

    const year = parseInt(yearOfBirth);
    if (isNaN(year) || year < minYear || year > maxYear) {
      setError(`Year of birth must be between ${minYear} and ${maxYear}`);
      return;
    }

    if (!user) {
      setError('You must be logged in');
      return;
    }

    setIsLoading(true);

    try {
      const childrenRef = collection(db, 'parents', user.uid, 'children');
      await addDoc(childrenRef, {
        username: username.toLowerCase().trim(),
        firstName: firstName.trim(),
        yearOfBirth: year,
        pin: pin, // In production, this should be hashed
        totalPoints: 0,
        createdAt: serverTimestamp(),
      });

      router.push('/parent');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create child account';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page-center">
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-container">
        <button className="btn btn-ghost back-btn" onClick={() => router.push('/parent')}>
          ← Back to Dashboard
        </button>

        <div className="auth-header">
          <h1>Add a Child</h1>
          <p>Create an account for your child to start learning</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="child-first-name">First Name</label>
            <input
              id="child-first-name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="e.g. Sophie"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="child-username">Username</label>
            <input
              id="child-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="e.g. sophie_123"
              required
              pattern="[a-z0-9_]+"
            />
            <span className="form-hint">Lowercase letters, numbers, and underscores only</span>
          </div>

          <div className="form-group">
            <label htmlFor="child-year">Year of Birth</label>
            <input
              id="child-year"
              type="number"
              value={yearOfBirth}
              onChange={(e) => setYearOfBirth(e.target.value)}
              placeholder={`e.g. ${currentYear - 8}`}
              min={minYear}
              max={maxYear}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="child-pin">6-Digit PIN</label>
            <input
              id="child-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setPin(val);
              }}
              placeholder="Choose a 6-digit PIN"
              required
            />
            <span className="form-hint">Your child will use this PIN to log in</span>
          </div>

          <div className="form-group">
            <label htmlFor="child-confirm-pin">Confirm PIN</label>
            <input
              id="child-confirm-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setConfirmPin(val);
              }}
              placeholder="Re-enter the PIN"
              required
            />
          </div>

          <button
            id="btn-create-child"
            type="submit"
            className="btn btn-primary btn-lg btn-full"
            disabled={isLoading}
          >
            {isLoading ? 'Creating…' : 'Create Child Account'}
          </button>
        </form>
      </div>
    </main>
  );
}
