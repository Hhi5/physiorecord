import { useEffect, useState } from 'react';
import {
  getDeviceFormFactor,
  type DeviceFormFactor,
} from '../platform/nativeBridge';

export function useDeviceFormFactor(): DeviceFormFactor {
  const [formFactor, setFormFactor] = useState<DeviceFormFactor>(() =>
    getDeviceFormFactor()
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => {
      setFormFactor(getDeviceFormFactor());
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, []);

  return formFactor;
}
