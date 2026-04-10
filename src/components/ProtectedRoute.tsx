import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#f8faf8',
      }}>
        <div className="animate-spin" style={{
          width: 32,
          height: 32,
          border: '3px solid #d4ead9',
          borderTop: '3px solid #1a4731',
          borderRadius: '50%',
        }} />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
