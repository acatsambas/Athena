'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

const AI_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o — versatile, highly capable',
    icon: '🟢',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude — thoughtful, nuanced responses',
    icon: '🟠',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini — fast, multimodal',
    icon: '🔵',
  },
];

export default function SignupPage() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { signUp, setApiKey: saveApiKey } = useAuth();
  const router = useRouter();

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setStep(2);
  };

  const handleStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!aiModel) {
      setError('Please select an AI provider');
      return;
    }

    setStep(3);
  };

  const handleStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!apiKey.trim()) {
      setError('Please enter your API key');
      setIsLoading(false);
      return;
    }

    try {
      await signUp(email, password, displayName, aiModel);
      saveApiKey(apiKey);
      router.push('/parent');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create account';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-container">
        <button className="btn btn-ghost back-btn" onClick={() => {
          if (step > 1) {
            setStep(step - 1);
            setError('');
          } else {
            router.push('/');
          }
        }}>
          ← Back
        </button>

        <div className="auth-header">
          <h1>Create Account</h1>
          <p>Step {step} of 3</p>
        </div>

        {/* Progress Indicator */}
        <div className="signup-progress">
          <div className={`progress-dot ${step >= 1 ? 'active' : ''}`}>1</div>
          <div className={`progress-line ${step >= 2 ? 'active' : ''}`} />
          <div className={`progress-dot ${step >= 2 ? 'active' : ''}`}>2</div>
          <div className={`progress-line ${step >= 3 ? 'active' : ''}`} />
          <div className={`progress-dot ${step >= 3 ? 'active' : ''}`}>3</div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Step 1: Account Details */}
        {step === 1 && (
          <form onSubmit={handleStep1} className="auth-form fade-in">
            <div className="form-group">
              <label htmlFor="signup-name">Your Name</label>
              <input
                id="signup-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alex"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="parent@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="signup-password">Password</label>
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            <div className="form-group">
              <label htmlFor="signup-confirm">Confirm Password</label>
              <input
                id="signup-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
                autoComplete="new-password"
              />
            </div>

            <button id="btn-step1-next" type="submit" className="btn btn-primary btn-lg btn-full">
              Continue
            </button>
          </form>
        )}

        {/* Step 2: AI Provider */}
        {step === 2 && (
          <form onSubmit={handleStep2} className="auth-form fade-in">
            <p className="form-description">
              Athena uses AI to generate personalised lessons for your child.
              Choose your preferred AI provider and enter your API key.
            </p>

            <div className="provider-grid">
              {AI_PROVIDERS.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  id={`provider-${provider.id}`}
                  className={`provider-card ${aiModel === provider.id ? 'selected' : ''}`}
                  onClick={() => setAiModel(provider.id)}
                >
                  <span className="provider-icon">{provider.icon}</span>
                  <span className="provider-name">{provider.name}</span>
                  <span className="provider-desc">{provider.description}</span>
                </button>
              ))}
            </div>

            <button id="btn-step2-next" type="submit" className="btn btn-primary btn-lg btn-full">
              Continue
            </button>
          </form>
        )}

        {/* Step 3: API Key */}
        {step === 3 && (
          <form onSubmit={handleStep3} className="auth-form fade-in">
            <div className="info-box">
              <h3>🔒 Your API key stays on your device</h3>
              <p>
                Your API key is stored only in your browser&apos;s local storage.
                It is never sent to our servers. You can find your API key in your{' '}
                {aiModel === 'openai' ? 'OpenAI' : aiModel === 'anthropic' ? 'Anthropic' : 'Google AI Studio'}{' '}
                account settings.
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="signup-apikey">
                {aiModel === 'openai' ? 'OpenAI' : aiModel === 'anthropic' ? 'Anthropic' : 'Gemini'} API Key
              </label>
              <input
                id="signup-apikey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  aiModel === 'openai'
                    ? 'sk-...'
                    : aiModel === 'anthropic'
                    ? 'sk-ant-...'
                    : 'AIza...'
                }
                required
                autoComplete="off"
              />
            </div>

            <button
              id="btn-create-account"
              type="submit"
              className="btn btn-primary btn-lg btn-full"
              disabled={isLoading}
            >
              {isLoading ? 'Creating Account…' : 'Create Account'}
            </button>
          </form>
        )}

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <button className="btn-link" onClick={() => router.push('/login')}>
              Sign in
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
