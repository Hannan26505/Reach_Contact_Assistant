import { useEffect, useState } from 'react';


function App() {
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [recoveryError, setRecoveryError] = useState('');
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [formError, setFormError] = useState('');
  const [apiStatus, setApiStatus] = useState('Sign in to load contacts.');

  const [token, setToken] = useState(
    () => localStorage.getItem('reach-token') || ''
  );
  const [authMode, setAuthMode] = useState('login');
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');

  function clearSession(message) {
    localStorage.removeItem('reach-token');
    setToken('');
    setContacts([]);
    setApiStatus(message);
    setRecoveryCodes([]);
  }

  useEffect(() => {
    if (!token) {
      setContacts([]);
      setApiStatus('Sign in to load contacts.');
      return;
    }

    const controller = new AbortController();

    async function loadContacts() {
      try {
        const params = new URLSearchParams();

        if (search.trim()) {
          params.set('q', search.trim());
        }

        const response = await fetch(`/api/contacts?${params}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        const data = await response.json();

        if (response.status === 401) {
          clearSession('Your session expired. Please sign in again.');
          return;
        }

        if (!response.ok) {
          throw new Error(data.error || data.message || 'Could not load contacts.');
        }

        setContacts(data);
        setApiStatus(`API connected · ${data.length} matching contacts`);
      } catch (error) {
        if (error.name !== 'AbortError') {
          setApiStatus(`Could not load contacts: ${error.message}`);
        }
      }
    }

    loadContacts();

    return () => controller.abort();
  }, [search, token]);

  async function handleAuth(event) {
    event.preventDefault();
    setAuthError('');

    const formData = new FormData(event.currentTarget);
    const email = formData.get('email').trim();
    const password = formData.get('password');

    try {
      const response = await fetch(`/api/auth/${authMode === 'signup' ? 'signup' : 'login'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        setAuthError(result.message || 'Could not sign in.');
        return;
      }

      localStorage.setItem('reach-token', result.token);
      setToken(result.token);
      event.currentTarget.reset();
    } catch {
      setAuthError('Could not connect to the server. Check that it is running.');
    }
  }

  async function handleForgotPassword(event) {
  event.preventDefault();
  setAuthError('');
  setAuthMessage('');

  const formData = new FormData(event.currentTarget);
  const email = formData.get('email').trim();

  try {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const result = await response.json();

    if (!response.ok) {
      setAuthError(result.message || 'Could not request a reset code.');
      return;
    }

    setAuthMessage(result.message);
    setAuthMode('reset');
  } catch {
    setAuthError('Could not connect to the server. Check that it is running.');
  }
}

async function handleResetPassword(event) {
  event.preventDefault();
  setAuthError('');
  setAuthMessage('');

  const formData = new FormData(event.currentTarget);
  const email = formData.get('email').trim();
  const code = formData.get('code').trim();
  const password = formData.get('password');

  try {
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, password }),
    });

    const result = await response.json();

    if (!response.ok) {
      setAuthError(result.message || 'Could not reset the password.');
      return;
    }

    setAuthMessage(result.message);
    setAuthMode('login');
  } catch {
    setAuthError('Could not connect to the server. Check that it is running.');
  }
}

  async function handleGenerateRecoveryCodes() {
  const confirmed = window.confirm(
    'Generating new codes will invalidate any unused codes you saved earlier. Continue?'
  );

  if (!confirmed) return;

  setRecoveryCodes([]);
  setRecoveryError('');

  try {
    const response = await fetch('/api/recovery-codes', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await response.json();

    if (response.status === 401) {
      clearSession('Your session expired. Please sign in again.');
      return;
    }

    if (!response.ok) {
      setRecoveryError(result.message || 'Could not generate codes.');
      return;
    }

    setRecoveryCodes(result.codes);
  } catch {
    setRecoveryError('Could not connect to the server.');
  }
}

  async function handleAddContact(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = formData.get('name').trim();
    const phone = formData.get('phone').trim();

    if (!name || !phone.replace(/\D/g, '')) {
      setFormError('Enter a name and a phone number containing digits.');
      return;
    }

    try {
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, phone }),
      });

      const result = await response.json();

      if (response.status === 401) {
        clearSession('Your session expired. Please sign in again.');
        return;
      }

      if (!response.ok) {
        setFormError(result.error || result.message || 'Could not add the contact.');
        return;
      }

      setFormError('');
      form.reset();
      setSearch('');
      setContacts((currentContacts) => [...currentContacts, result]);
    } catch {
      setFormError('Could not connect to the server. Check that it is running.');
    }
  }

  async function handleDeleteContact(id) {
    try {
      const response = await fetch(`/api/contacts/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (response.status === 401) {
        clearSession('Your session expired. Please sign in again.');
        return;
      }

      if (!response.ok) {
        setApiStatus(result.error || result.message || 'Could not delete the contact.');
        return;
      }

      setContacts((currentContacts) =>
        currentContacts.filter((contact) => contact.id !== id)
      );
      setApiStatus('Contact deleted from the API.');
    } catch {
      setApiStatus('Could not connect to the server. Check that it is running.');
    }
  }

  function handleSignOut() {
    clearSession('You have signed out.');
    setSearch('');
    setFormError('');
  }

 return (
  <main>
    {!token && (
  <header className="site-brand">
    <span className="brand-mark" aria-hidden="true">R</span>
    <span>Reach</span>
  </header>
)}
    {!token ? (
      <div className="landing-layout">
        <section className="landing-info">
          <section className="welcome">
            <div className="welcome-hero">
              <div className="welcome-copy">
                <p className="welcome-eyebrow">
                  YOUR CONTACTS, WHEN YOUR PHONE IS AWAY
                </p>

                <h2>Find the number you need, wherever you are.</h2>

                <p className="welcome-description">
                  Save your contacts in Reach, then look them up from another
                  device using a one-time code in Telegram.
                </p>
              </div>

              <div className="hero-visual" aria-hidden="true">
                <svg viewBox="0 0 420 340">
                  <circle cx="210" cy="170" r="150" fill="#dcefe1" />
                  <circle cx="332" cy="82" r="34" fill="#f6d5b8" />

                  <rect
                    x="113"
                    y="27"
                    width="194"
                    height="286"
                    rx="28"
                    fill="#214b36"
                  />
                  <rect
                    x="123"
                    y="38"
                    width="174"
                    height="264"
                    rx="21"
                    fill="#fbfdf8"
                  />

                  <text
                    x="143"
                    y="69"
                    fill="#214b36"
                    fontSize="17"
                    fontWeight="700"
                  >
                    Reach
                  </text>

                  <rect
                    x="140"
                    y="85"
                    width="140"
                    height="34"
                    rx="17"
                    fill="#edf4ee"
                  />
                  <circle cx="157" cy="102" r="6" fill="#789482" />
                  <text x="170" y="107" fill="#718078" fontSize="11">
                    Find a contact
                  </text>

                  <rect
                    x="140"
                    y="132"
                    width="140"
                    height="76"
                    rx="14"
                    fill="#ffffff"
                    stroke="#e1e9e2"
                  />
                  <circle cx="166" cy="170" r="17" fill="#dcefe1" />
                  <text
                    x="194"
                    y="165"
                    fill="#263b2e"
                    fontSize="12"
                    fontWeight="700"
                  >
                    Maya Patel
                  </text>
                  <text x="194" y="183" fill="#718078" fontSize="10">
                    ••• ••• 0138
                  </text>

                  <rect
                    x="140"
                    y="220"
                    width="140"
                    height="43"
                    rx="13"
                    fill="#24583f"
                  />
                  <text
                    x="171"
                    y="247"
                    fill="#ffffff"
                    fontSize="12"
                    fontWeight="700"
                  >
                    Contact found
                  </text>

                  <path
                    d="M311 234l50-22-13 51-12-18-13 10 3-17z"
                    fill="#36a269"
                  />
                  <circle
                    cx="345"
                    cy="241"
                    r="34"
                    fill="none"
                    stroke="#36a269"
                    strokeWidth="3"
                    opacity=".25"
                  />
                </svg>
              </div>
            </div>

            <div className="how-grid">
              <article className="how-card">
                <span className="step-number">01</span>
                <h3>Save your contacts</h3>
                <p>Add names and phone numbers to your Reach account.</p>
              </article>

              <article className="how-card">
                <span className="step-number">02</span>
                <h3>Save your codes</h3>
                <p>Generate emergency codes. Each code is for one lookup.</p>
              </article>

              <article className="how-card">
                <span className="step-number">03</span>
                <h3>Ask Telegram</h3>
                <p>Message the bot with your email, code, and contact name.</p>
              </article>
            </div>

            <div className="telegram-card">
              <div>
                <span className="channel-status">AVAILABLE</span>
                <h3>Look up a contact with Telegram</h3>
                <p>
                  Open the bot and send <code>/start</code> to begin.
                </p>
              </div>

              <a
                className="telegram-link"
                href="https://t.me/HannanReachBot"
                target="_blank"
                rel="noreferrer"
              >
                Open @HannanReachBot <span aria-hidden="true">↗</span>
              </a>
            </div>

            <p className="channel-note">
              WhatsApp integration is not currently available.
            </p>
          </section>
        </section>

        <section className="auth-panel">
          <h2>
            {authMode === 'signup'
              ? 'Create an account'
              : authMode === 'forgot'
                ? 'Request a reset code'
                : authMode === 'reset'
                  ? 'Reset your password'
                  : 'Welcome back'}
          </h2>

          {authMode === 'login' || authMode === 'signup' ? (
            <>
              <form onSubmit={handleAuth}>
                <label>
                  Email
                  <input name="email" type="email" required />
                </label>

                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    minLength="8"
                    required
                  />
                </label>

                <button type="submit">
                  {authMode === 'signup' ? 'Create account' : 'Sign in'}
                </button>
              </form>

              {authMode === 'login' && (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setAuthMode('forgot');
                    setAuthError('');
                    setAuthMessage('');
                  }}
                >
                  Forgot password?
                </button>
              )}

              <p>
                {authMode === 'signup'
                  ? 'Already have an account?'
                  : 'New to Reach?'}{' '}
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === 'signup' ? 'login' : 'signup');
                    setAuthError('');
                    setAuthMessage('');
                  }}
                >
                  {authMode === 'signup' ? 'Sign in' : 'Create an account'}
                </button>
              </p>
            </>
          ) : authMode === 'forgot' ? (
            <form onSubmit={handleForgotPassword}>
              <label>
                Account email
                <input name="email" type="email" required />
              </label>

              <button type="submit">Email me a reset code</button>
              <button
                className="text-button"
                type="button"
                onClick={() => setAuthMode('login')}
              >
                Back to sign in
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword}>
              <label>
                Account email
                <input name="email" type="email" required />
              </label>

              <label>
                Six-digit code
                <input
                  name="code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  required
                />
              </label>

              <label>
                New password
                <input
                  name="password"
                  type="password"
                  minLength="8"
                  required
                />
              </label>

              <button type="submit">Reset password</button>
              <button
                className="text-button"
                type="button"
                onClick={() => setAuthMode('login')}
              >
                Back to sign in
              </button>
            </form>
          )}

          {authMessage && <p role="status">{authMessage}</p>}
          {authError && (
            <p className="form-error" role="alert">
              {authError}
            </p>
          )}
        </section>
      </div>
    ) : (
      <>
        <h1>Reach</h1>
        <p>{apiStatus}</p>

        <button type="button" onClick={handleSignOut}>
          Sign out
        </button>

        <button type="button" onClick={handleGenerateRecoveryCodes}>
          Generate or replace emergency codes
        </button>

        {recoveryError && (
          <p className="form-error" role="alert">
            {recoveryError}
          </p>
        )}

        {recoveryCodes.length > 0 && (
          <section>
            <h2>Save these codes now</h2>
            <p>They will disappear if you refresh or sign out.</p>
            <ol>
              {recoveryCodes.map((code) => (
                <li key={code}>
                  <code>{code}</code>
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => setRecoveryCodes([])}>
              I’ve saved them
            </button>
          </section>
        )}

        <input
          type="search"
          placeholder="Search by name or phone"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <form onSubmit={handleAddContact}>
          <label>
            Name
            <input name="name" required />
          </label>

          <label>
            Phone number
            <input name="phone" type="tel" required />
          </label>

          <button type="submit">Add contact</button>
        </form>

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        {contacts.length > 0 ? (
          <ul>
            {contacts.map((contact) => (
              <li key={contact.id}>
                <span>
                  <strong>{contact.name}</strong> — {contact.phone}
                </span>

                <button
                  type="button"
                  onClick={() => handleDeleteContact(contact.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No contacts found.</p>
        )}
      </>
    )}
  </main>
);
}

export default App;