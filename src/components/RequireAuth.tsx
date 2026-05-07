import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Wrap protected routes with this. Behavior:
 *   - If the AuthProvider hasn't finished hydrating from localStorage, render nothing.
 *   - If there is no user, redirect to /login and remember where we tried to go.
 *   - Otherwise, render the children.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return null;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
