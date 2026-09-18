import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { probeRuntimes } from '../../native/runtimes.js';
import { seatState } from './seat-state';

interface RuntimesGuardProps {
  children: React.ReactNode;
}

export default function RuntimesGuard({ children }: RuntimesGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current || location.pathname === '/runtimes') return;
    checkedRef.current = true;

    const checkRuntimes = async () => {
      try {
        const response = await probeRuntimes();
        const seats = seatState(response);

        // Redirect only when every seat is not ready (task 91).
        const allNotReady = Object.values(seats).every((s) => s.state !== 'ready');
        if (allNotReady) {
          navigate('/runtimes', { replace: true });
        }
      } catch (error) {
        console.error('Failed to probe runtimes:', error);
        // On error, don't redirect; user can reach Settings › App "Runtimes…".
      }
    };

    void checkRuntimes();
  }, [navigate, location.pathname]);

  return <>{children}</>;
}
