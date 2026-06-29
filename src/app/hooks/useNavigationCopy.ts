import { useMemo } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { mergeNavigation } from '../lib/mergeNavigation';

export function useNavigationCopy() {
  const { publicSettings, revision } = useSettings();
  return useMemo(
    () => mergeNavigation(publicSettings.navigation),
    [publicSettings.navigation, revision],
  );
}
