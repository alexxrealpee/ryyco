import type { User } from 'firebase/auth';
import type { DriverProfile } from '../types';

export interface DriverSessionState {
  checking: boolean;
  driver: DriverProfile | null;
  error: string;
}

// One owner of session resolution, including Google sign-in and account changes.
// Late responses must never restore a previous account after logout or navigation.
export function observeDriverSession(
  subscribe: (next: (user: User | null) => void, error: () => void) => () => void,
  verify: (user: User) => Promise<DriverProfile | null>,
  publish: (state: DriverSessionState) => void,
) {
  let generation = 0;
  let disposed = false;
  const failure = 'No se pudo verificar tu cuenta. Intenta ingresar nuevamente con Google.';
  publish({ checking: true, driver: null, error: '' });
  const unsubscribe = subscribe(async user => {
    const request = ++generation;
    if (disposed) return;
    if (!user) {
      publish({ checking: false, driver: null, error: '' });
      return;
    }
    publish({ checking: true, driver: null, error: '' });
    try {
      const driver = await verify(user);
      if (disposed || request !== generation) return;
      publish({ checking: false, driver, error: driver ? '' :
        'No hay una cuenta de domiciliario para este correo. Usa el correo registrado o regístrate.' });
    } catch {
      if (!disposed && request === generation) publish({ checking: false, driver: null, error: failure });
    }
  }, () => {
    generation++;
    if (!disposed) publish({ checking: false, driver: null, error: failure });
  });
  return () => { disposed = true; generation++; unsubscribe(); };
}
