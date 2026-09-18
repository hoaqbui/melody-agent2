import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { probeRuntimes } from '../../native/runtimes.js';
import { seatState, overallGateState } from './seat-state';

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
        const gateState = overallGateState(seats);

        if (gateState !== 'ready') {
          navigate('/runtimes', { replace: true });
        }
      } catch (error) {
        console.error('Failed to probe runtimes:', error);
        navigate('/runtimes', { replace: true });
      }
    };

    void checkRuntimes();
  }, [navigate, location.pathname]);

  return <>{children}</>;
}
