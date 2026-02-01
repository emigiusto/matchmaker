// InviteConfirm.tsx
// Public invite confirmation page (token-based)


// This page is the ONLY way to confirm or decline a match invite.
// No login required. WhatsApp replies are never trusted.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

interface Invite {
  status: string;
  matchDetails?: {
    date: string;
    location: string;
    // ...other fields
  };
}

export default function InviteConfirm() {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [optIn, setOptIn] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  useEffect(() => {
    // Fetch invite by token
    async function fetchInvite() {
      setLoading(true);
      setError(null);
      try {
        // TODO: Replace with real API call
        // Example: const res = await fetch(`/api/invites/${token}`);
        // const data = await res.json();
        const data = {
          status: 'pending',
          matchDetails: {
            date: '2026-02-01',
            location: 'Central Park',
          },
        };
        setInvite(data);
      } catch (e) {
        setError('Failed to load invite.');
      } finally {
        setLoading(false);
      }
    }
    if (token) fetchInvite();
  }, [token]);

  const handleAction = async (action: 'confirm' | 'decline') => {
    setActionStatus('loading');
    try {
      // TODO: Replace with real API call
      // await fetch(`/api/invites/${token}/${action}`, { method: 'POST' });
      setActionStatus(action === 'confirm' ? 'confirmed' : 'declined');
    } catch (e) {
      setActionStatus('error');
    }
  };

  if (loading) return <main>Loading...</main>;
  if (error) return <main>{error}</main>;
  if (!invite) return <main>Invite not found.</main>;

  return (
    <main>
      <h1>Confirm Your Invite</h1>
      {/* This page is the ONLY way to confirm or decline a match invite. */}
      <section>
        <h2>Match Details</h2>
        <p>Date: {invite.matchDetails?.date}</p>
        <p>Location: {invite.matchDetails?.location}</p>
        {/* Add more match details as needed */}
      </section>
      <section>
        <label>
          <input
            type="checkbox"
            checked={optIn}
            onChange={e => setOptIn(e.target.checked)}
          />
          Opt in to contact updates (optional)
        </label>
      </section>
      <section>
        {invite.status === 'pending' && !actionStatus && (
          <>
            <button onClick={() => handleAction('confirm')}>Confirm</button>
            <button onClick={() => handleAction('decline')}>Decline</button>
          </>
        )}
        {actionStatus === 'confirmed' && <p>Invite confirmed! See you at the match.</p>}
        {actionStatus === 'declined' && <p>Invite declined.</p>}
        {actionStatus === 'loading' && <p>Processing...</p>}
        {actionStatus === 'error' && <p>Something went wrong. Please try again.</p>}
      </section>
    </main>
  );
}
