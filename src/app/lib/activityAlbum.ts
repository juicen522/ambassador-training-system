import type { Activity } from '../types/activity';
import type { AmbassadorAlbum } from '../data/ambassadorMoments';

const DEFAULT_GRADIENT =
  'linear-gradient(135deg, #C3E2C7 0%, #5EC4B6 55%, #7EB8A8 100%)';

function formatActivityDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export function plainTextFromHtml(html: string) {
  if (!html) return '';
  if (typeof document === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}

export function activityToAlbum(activity: Activity): AmbassadorAlbum {
  const cover = activity.coverImageUrl || activity.images[0]?.imageUrl || undefined;
  const copyPlain = plainTextFromHtml(activity.copywriting);
  const intro =
    activity.theme?.trim() ||
    copyPlain.slice(0, 160) ||
    activity.title;
  const summary = copyPlain.slice(0, 100) || activity.title;

  return {
    id: activity.id,
    title: activity.title,
    date: formatActivityDate(activity.updatedAt || activity.createdAt),
    location: activity.theme || undefined,
    intro,
    summary,
    description: activity.copywriting,
    descriptionHtml: true,
    coverImageUrl: cover,
    coverGradient: DEFAULT_GRADIENT,
    photos: activity.images.map((img, index) => ({
      id: img.id,
      imageUrl: img.imageUrl,
      caption: img.imageName || `图片 ${index + 1}`,
    })),
  };
}

export function activitiesToAlbums(activities: Activity[]) {
  return activities.map(activityToAlbum);
}
