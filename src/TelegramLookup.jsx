import { useState } from 'react';

function TelegramLookup() {
  const [contacts, setContacts] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLookup(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    setContacts([]);
    setMessage('');
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/telegram/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.get('email').trim(),
          pin: formData.get('pin').trim(),
          query: formData.get('query').trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.message || 'Could not complete the lookup.');
        return;
      }

      setContacts(result.contacts || []);
      setMessage(
        result.contacts?.length
          ? 'Contact found.'
          : 'No matching contact found.'
      );
    } catch {
      setError('Could not connect to Reach. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Reach</h1>
      <p>Look up a contact</p>

      <form onSubmit={handleLookup}>
        <label>
          Reach account email
          <input name="email" type="email" autoComplete="email" required />
        </label>

        <label>
          Six-digit lookup PIN
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6}"
            minLength="6"
            maxLength="6"
            autoComplete="off"
            required
          />
        </label>

        <label>
          Contact name or phone
          <input name="query" required />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'Searching…' : 'Find contact'}
        </button>
      </form>

      {message && <p role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {contacts.length > 0 && (
        <ul>
          {contacts.map((contact) => (
            <li key={`${contact.name}-${contact.phone}`}>
              <strong>{contact.name}</strong> — {contact.phone}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default TelegramLookup;