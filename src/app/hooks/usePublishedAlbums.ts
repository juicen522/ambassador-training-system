import { useCallback, useEffect, useState } from 'react';
import type { AmbassadorAlbum } from '../data/ambassadorMoments';
import { activitiesToAlbums } from '../lib/activityAlbum';
import { listPublishedActivitiesApi } from '../lib/activitiesApi';

export const PUBLISHED_ACTIVITIES_EVENT = 'published-activities-updated';

export function usePublishedAlbums() {
  const [albums, setAlbums] = useState<AmbassadorAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listPublishedActivitiesApi();
      setAlbums(activitiesToAlbums(list));
    } catch (err) {
      setAlbums([]);
      setError(err instanceof Error ? err.message : '加载活动失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const onUpdate = () => void reload();
    window.addEventListener(PUBLISHED_ACTIVITIES_EVENT, onUpdate);
    return () => window.removeEventListener(PUBLISHED_ACTIVITIES_EVENT, onUpdate);
  }, [reload]);

  return { albums, loading, error, reload };
}
