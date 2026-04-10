import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && session) navigate('/');
  }, [session, loading]);

  async function handleLogin() {
    if (!email || !password) {
      setError('Inserisci email e password / Vnesi email in geslo');
      return;
    }

    setSubmitting(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError('Email o password errati / Napačen email ali geslo');
      setSubmitting(false);
      return;
    }

    toast.success('Benvenuto! / Dobrodošli!');
    navigate('/');
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8faf8',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      backgroundImage: 'radial-gradient(circle, #d4ead9 1px, transparent 1px)',
      backgroundSize: '24px 24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: 'white',
        borderRadius: '16px',
        padding: '48px 40px',
        boxShadow: '0 4px 24px rgba(26,71,49,0.10)',
        border: '1px solid #d4ead9',
      }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            fontFamily: 'Fraunces, serif',
            fontSize: '32px',
            fontWeight: '700',
            color: '#1a4731',
            letterSpacing: '-0.5px',
          }}>
            FleetInvoice
          </div>
          <div style={{ marginTop: '6px', fontSize: '13px', color: '#6b8f75' }}>
            Accedi al tuo account / Prijava
          </div>
        </div>

        {/* Email field */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: '500',
            color: '#1c2b22',
            marginBottom: '6px',
          }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="email@example.com"
            autoComplete="email"
            style={{
              width: '100%',
              padding: '10px 14px',
              border: '1px solid #a8d4b3',
              borderRadius: '8px',
              fontSize: '14px',
              color: '#1c2b22',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.target.style.borderColor = '#1a4731')}
            onBlur={e => (e.target.style.borderColor = '#a8d4b3')}
          />
        </div>

        {/* Password field */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: '500',
            color: '#1c2b22',
            marginBottom: '6px',
          }}>
            Password / Geslo
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{
                width: '100%',
                padding: '10px 40px 10px 14px',
                border: '1px solid #a8d4b3',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#1c2b22',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target.style.borderColor = '#1a4731')}
              onBlur={e => (e.target.style.borderColor = '#a8d4b3')}
            />
            <button
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#6b8f75',
                padding: '0',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {showPassword
                ? <EyeOff size={16} strokeWidth={1.5} />
                : <Eye size={16} strokeWidth={1.5} />}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom: '16px',
            padding: '10px 14px',
            background: '#fee2e2',
            border: '1px solid #fca5a5',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#c0392b',
          }}>
            {error}
          </div>
        )}

        {/* Login button */}
        <button
          onClick={handleLogin}
          disabled={submitting}
          style={{
            width: '100%',
            padding: '12px',
            background: submitting ? '#4a9668' : '#1a4731',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: submitting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => !submitting && ((e.currentTarget).style.background = '#22603f')}
          onMouseLeave={e => !submitting && ((e.currentTarget).style.background = '#1a4731')}
        >
          {submitting ? (
            <div className="animate-spin" style={{
              width: 18,
              height: 18,
              border: '2px solid rgba(255,255,255,0.3)',
              borderTop: '2px solid white',
              borderRadius: '50%',
            }} />
          ) : (
            <LogIn size={18} strokeWidth={1.5} />
          )}
          {submitting ? 'Accesso...' : 'Accedi / Prijava'}
        </button>

        {/* Footer */}
        <div style={{
          marginTop: '32px',
          textAlign: 'center',
          fontSize: '11px',
          color: '#a8d4b3',
        }}>
          FleetInvoice © {new Date().getFullYear()} — Manutecnica d.o.o.
        </div>
      </div>
    </div>
  );
}
