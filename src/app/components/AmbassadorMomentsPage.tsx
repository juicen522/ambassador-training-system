import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowLeft,
  Calendar,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Download,
  Images,
  MapPin,
  X,
} from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import {
  AMBASSADOR_MOMENTS_INTRO,
  type AmbassadorAlbum,
  type AmbassadorPhoto,
} from '../data/ambassadorMoments';
import { activityToAlbum } from '../lib/activityAlbum';
import { getActivityApi } from '../lib/activitiesApi';
import { usePublishedAlbums } from '../hooks/usePublishedAlbums';

const labelStyle = { color: '#382C25' };
const hintStyle = { color: '#7A6E68' };
const carouselFrameBg = '#F5F1E9';
const CAROUSEL_INTERVAL_MS = 4000;
const CAROUSEL_TRANSITION_MS = 600;

function PhotoGalleryTile({
  photo,
  album,
  index,
  onOpen,
}: {
  photo: AmbassadorPhoto;
  album: AmbassadorAlbum;
  index: number;
  onOpen: () => void;
}) {
  const fileName =
    photo.caption?.replace(/[^\w\u4e00-\u9fa5.-]+/g, '_').slice(0, 60) ||
    `活动图片-${index + 1}`;

  return (
    <div
      className="group relative text-left rounded-xl border overflow-hidden transition-all w-full"
      style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(94, 196, 182, 0.45)';
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(94, 196, 182, 0.12)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(56, 44, 37, 0.08)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="relative aspect-[4/3] overflow-hidden bg-[#F3EFEB]">
          {photo.imageUrl ? (
            <img
              src={photo.imageUrl}
              alt={photo.caption}
              className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.02]"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center px-4"
              style={{ background: album.coverGradient }}
            >
              <span className="text-xs text-center text-white/90 line-clamp-3">
                {photo.caption}
              </span>
            </div>
          )}
        </div>
        {photo.caption && (
          <p className="text-xs px-3 py-2 line-clamp-2" style={hintStyle}>
            {photo.caption}
          </p>
        )}
      </button>
      {photo.imageUrl && (
        <a
          href={photo.imageUrl}
          download={fileName}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: 'rgba(255,255,255,0.95)', color: '#5EC4B6' }}
          title="下载图片"
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="w-4 h-4" />
        </a>
      )}
    </div>
  );
}

type CarouselSlide = {
  photo: AmbassadorPhoto;
  photoIndex: number;
  key: string;
};

function AlbumPhotoCarousel({
  album,
  photos,
  onOpen,
  autoPlay = false,
}: {
  album: AmbassadorAlbum;
  photos: AmbassadorPhoto[];
  onOpen?: (index: number) => void;
  autoPlay?: boolean;
}) {
  const slides = useMemo<CarouselSlide[]>(
    () =>
      photos
        .map((photo, photoIndex) => ({
          photo,
          photoIndex,
          key: photo.id,
        }))
        .filter(({ photo }) => photo.imageUrl),
    [photos],
  );
  const count = slides.length;
  const loop = count > 1;
  const displaySlides = useMemo<CarouselSlide[]>(
    () =>
      loop
        ? [
            ...slides,
            {
              ...slides[0],
              key: `${slides[0].key}-loop-clone`,
            },
          ]
        : slides,
    [loop, slides],
  );

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [enableTransition, setEnableTransition] = useState(true);

  useEffect(() => {
    setIndex(0);
    setEnableTransition(false);
    const frame = window.requestAnimationFrame(() => setEnableTransition(true));
    return () => window.cancelAnimationFrame(frame);
  }, [album.id]);

  const goNext = useCallback(() => {
    if (!loop) return;
    setIndex((i) => i + 1);
  }, [loop]);

  const onTrackTransitionEnd = (e: { propertyName: string }) => {
    if (e.propertyName !== 'transform' || !loop || index !== count) return;
    setEnableTransition(false);
    setIndex(0);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setEnableTransition(true));
    });
  };

  useEffect(() => {
    if (!autoPlay || !loop || paused) return;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const timer = window.setInterval(goNext, CAROUSEL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autoPlay, loop, paused, album.id, goNext]);

  if (count === 0) {
    return (
      <div
        className="rounded-2xl p-8 sm:p-12 flex items-center justify-center min-h-[240px]"
        style={{ backgroundColor: carouselFrameBg }}
      >
        <p className="text-sm text-center max-w-sm" style={hintStyle}>
          暂无相册图片
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden relative select-none"
      style={{ backgroundColor: carouselFrameBg }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="活动照片轮播"
    >
      <div className="overflow-hidden">
        <div
          className="flex"
          onTransitionEnd={onTrackTransitionEnd}
          style={{
            transform: `translate3d(-${index * 100}%, 0, 0)`,
            transition: enableTransition
              ? `transform ${CAROUSEL_TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
              : 'none',
            willChange: 'transform',
          }}
        >
          {displaySlides.map((slide) => (
            <div key={slide.key} className="w-full shrink-0 p-4 sm:p-5">
              <button
                type="button"
                className="w-full flex items-center justify-center min-h-[220px] sm:min-h-[280px] rounded-2xl overflow-hidden cursor-zoom-in"
                style={{ backgroundColor: carouselFrameBg }}
                onClick={() => onOpen?.(slide.photoIndex)}
                aria-label="点击查看大图"
              >
                <img
                  src={slide.photo.imageUrl}
                  alt=""
                  draggable={false}
                  className="block max-w-full w-auto h-auto object-contain max-h-[min(58vh,500px)] rounded-2xl"
                  style={{ backgroundColor: carouselFrameBg }}
                />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AlbumListCard({ album }: { album: AmbassadorAlbum }) {
  const themeLabel = album.location?.trim() || album.title;
  const coverSrc =
    album.coverImageUrl || album.photos.find((p) => p.imageUrl)?.imageUrl;

  return (
    <Link
      to={`/ambassador-moments/${album.id}`}
      className="group block bg-white rounded-xl border overflow-hidden transition-all duration-300"
      style={{
        borderColor: 'rgba(56, 44, 37, 0.06)',
        boxShadow: '0 2px 14px rgba(56, 44, 37, 0.06)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#5EC4B6';
        e.currentTarget.style.boxShadow = '0 8px 28px rgba(94, 196, 182, 0.14)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(56, 44, 37, 0.06)';
        e.currentTarget.style.boxShadow = '0 2px 14px rgba(56, 44, 37, 0.06)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        {coverSrc ? (
          <>
            <img
              src={coverSrc}
              alt=""
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to bottom, rgba(56, 44, 37, 0.12) 0%, rgba(56, 44, 37, 0.28) 100%)',
              }}
            />
            <span className="absolute inset-0 flex items-center justify-center px-6 text-sm sm:text-base font-medium text-white text-center tracking-wide drop-shadow-sm">
              {themeLabel}
            </span>
          </>
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center px-6"
            style={{ background: album.coverGradient }}
          >
            <span className="text-sm sm:text-base font-medium text-white text-center tracking-wide">
              {themeLabel}
            </span>
          </div>
        )}
      </div>

      <div className="px-5 sm:px-6 py-4 sm:py-5">
        <h3
          className="text-[15px] sm:text-base font-medium mb-2.5 leading-snug"
          style={labelStyle}
        >
          {album.title}
        </h3>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2.5">
          {album.date && (
            <span className="inline-flex items-center gap-1 text-xs" style={hintStyle}>
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              {album.date}
            </span>
          )}
          {album.location && (
            <span className="inline-flex items-center gap-1 text-xs" style={hintStyle}>
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              {album.location}
            </span>
          )}
        </div>
        {album.summary && (
          <p className="text-xs sm:text-sm leading-relaxed line-clamp-2" style={hintStyle}>
            {album.summary}
          </p>
        )}
      </div>
    </Link>
  );
}

function Lightbox({
  album,
  photo,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: {
  album: AmbassadorAlbum;
  photo: AmbassadorPhoto;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 motion-safe:animate-in fade-in duration-200"
      style={{ backgroundColor: 'rgba(56, 44, 37, 0.88)' }}
      role="dialog"
      aria-modal
      aria-label="图片预览"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute top-4 right-4 p-2 rounded-full text-white/90 hover:bg-white/10 transition-colors"
        aria-label="关闭"
        onClick={onClose}
      >
        <X className="w-6 h-6" />
      </button>

      {hasPrev && (
        <button
          type="button"
          className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 p-2 rounded-full text-white/90 hover:bg-white/10 transition-colors"
          aria-label="上一张"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
        >
          <ChevronLeft className="w-7 h-7" />
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 p-2 rounded-full text-white/90 hover:bg-white/10 transition-colors"
          aria-label="下一张"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
        >
          <ChevronRight className="w-7 h-7" />
        </button>
      )}

      <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
        <div
          className="rounded-xl overflow-hidden mb-4 min-h-[200px] flex items-center justify-center p-4 sm:p-8"
          style={{
            background: photo.imageUrl ? '#1a1512' : album.coverGradient,
          }}
        >
          {photo.imageUrl ? (
            <img
              src={photo.imageUrl}
              alt={photo.caption}
              className="max-h-[min(72vh,800px)] w-auto max-w-full mx-auto object-contain motion-safe:animate-in zoom-in-95 duration-300"
            />
          ) : (
            <p className="text-white text-center text-sm leading-relaxed max-w-md">
              {photo.caption}
            </p>
          )}
        </div>
        {photo.caption && (
          <p className="text-sm text-white/90 text-center leading-relaxed px-4">
            {photo.caption}
          </p>
        )}
      </div>
    </div>
  );
}

function AlbumDetail({ album }: { album: AmbassadorAlbum }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const photos = album.photos;
  const lightboxPhoto = lightboxIndex !== null ? photos[lightboxIndex] : null;

  const openAt = useCallback((index: number) => setLightboxIndex(index), []);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const goPrev = useCallback(() => {
    setLightboxIndex((i) => (i === null || i <= 0 ? i : i - 1));
  }, []);
  const goNext = useCallback(() => {
    setLightboxIndex((i) =>
      i === null || i >= photos.length - 1 ? i : i + 1,
    );
  }, [photos.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, closeLightbox, goPrev, goNext]);

  return (
    <article
      id={album.id}
      className="scroll-mt-6 motion-safe:animate-in fade-in duration-500"
    >
        <div
          className="bg-white rounded-2xl border overflow-hidden shadow-sm"
          style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
        >
          <div className="p-4 sm:p-6 pb-0">
            <AlbumPhotoCarousel
              album={album}
              photos={photos}
              onOpen={openAt}
              autoPlay
            />
          </div>

          <div className="px-6 sm:px-10 pt-8 pb-6 border-t" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
            <h1 className="text-2xl sm:text-[1.65rem] font-medium tracking-tight mb-3" style={labelStyle}>
              {album.title}
            </h1>
            <div className="flex flex-wrap gap-2">
              {album.date && (
                <span
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
                  style={{
                    backgroundColor: 'rgba(94, 196, 182, 0.12)',
                    color: '#3d8f84',
                  }}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  {album.date}
                </span>
              )}
              {album.location && (
                <span
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border"
                  style={{ borderColor: 'rgba(56, 44, 37, 0.1)', color: '#7A6E68' }}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {album.location}
                </span>
              )}
              {photos.length > 0 && (
                <span
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border"
                  style={{ borderColor: 'rgba(56, 44, 37, 0.1)', color: '#7A6E68' }}
                >
                  <Images className="w-3.5 h-3.5" />
                  {photos.length} 张图片
                </span>
              )}
            </div>
          </div>

          <div className="px-6 sm:px-10 pb-10">
            {(album.description || album.descriptionHtml) && (
              <div className="mb-10 pb-8 border-b" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
                {album.descriptionHtml ? (
                  <div
                    className="text-sm leading-[1.9] [&_h2]:text-base [&_h2]:font-medium [&_h2]:mb-3 [&_h2]:mt-1 [&_p]:mb-3.5"
                    style={hintStyle}
                    dangerouslySetInnerHTML={{ __html: album.description }}
                  />
                ) : (
                  <p className="text-sm leading-[1.9]" style={hintStyle}>
                    {album.description}
                  </p>
                )}
              </div>
            )}

            {photos.length > 0 && (
              <>
                <h2 className="text-sm font-medium mb-1 flex items-center gap-2" style={labelStyle}>
                  <span
                    className="w-1 h-4 rounded-full"
                    style={{ backgroundColor: '#5EC4B6' }}
                  />
                  活动图集
                </h2>
                <p className="text-xs mb-4" style={hintStyle}>
                  点击预览大图，悬停可下载原图
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {photos.map((photo, index) => (
                    <PhotoGalleryTile
                      key={photo.id}
                      photo={photo}
                      album={album}
                      index={index}
                      onOpen={() => openAt(index)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {lightboxPhoto && lightboxIndex !== null && (
          <Lightbox
            album={album}
            photo={lightboxPhoto}
            onClose={closeLightbox}
            onPrev={goPrev}
            onNext={goNext}
            hasPrev={lightboxIndex > 0}
            hasNext={lightboxIndex < photos.length - 1}
          />
        )}
    </article>
  );
}

export default function AmbassadorMomentsPage() {
  const { currentUser } = useUser();
  const { albumId } = useParams<{ albumId?: string }>();
  const isAdmin = currentUser.role === 'admin';
  const { albums: publishedAlbums, loading: listLoading, error: listError } =
    usePublishedAlbums();
  const [fetchedAlbum, setFetchedAlbum] = useState<AmbassadorAlbum | undefined>();
  const [fetchingAlbum, setFetchingAlbum] = useState(false);

  const singleAlbum = useMemo(() => {
    if (!albumId) return undefined;
    return publishedAlbums.find((a) => a.id === albumId) ?? fetchedAlbum;
  }, [albumId, publishedAlbums, fetchedAlbum]);

  useEffect(() => {
    if (!albumId) {
      setFetchedAlbum(undefined);
      return;
    }
    if (publishedAlbums.some((a) => a.id === albumId)) return;

    setFetchingAlbum(true);
    getActivityApi(albumId)
      .then((activity) => setFetchedAlbum(activityToAlbum(activity)))
      .catch(() => setFetchedAlbum(undefined))
      .finally(() => setFetchingAlbum(false));
  }, [albumId, publishedAlbums]);

  if (albumId && !singleAlbum && (fetchingAlbum || listLoading)) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center">
        <p className="text-sm animate-pulse" style={hintStyle}>
          加载中…
        </p>
      </div>
    );
  }

  if (albumId && !singleAlbum) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center">
        <p className="text-sm mb-4" style={hintStyle}>
          未找到该相册或活动尚未发布
        </p>
        <Link to="/ambassador-moments" className="text-sm" style={{ color: '#5EC4B6' }}>
          返回相册列表
        </Link>
      </div>
    );
  }

  const isDetailView = Boolean(albumId && singleAlbum);

  return (
    <div
      className={`mx-auto ${isDetailView ? 'p-4 sm:p-8 max-w-4xl' : 'p-6 sm:p-8 max-w-2xl'}`}
    >
      <Link
        to={isDetailView ? '/ambassador-moments' : '/dashboard'}
        className="inline-flex items-center gap-1.5 text-sm mb-6 transition-colors hover:opacity-80"
        style={{ color: '#7A6E68' }}
      >
        <ArrowLeft className="w-4 h-4" />
        {isDetailView ? '返回全部相册' : '返回首页'}
      </Link>

      {!isDetailView && (
        <header className="mb-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-medium mb-2" style={labelStyle}>
                {AMBASSADOR_MOMENTS_INTRO.pageTitle}
              </h1>
              <p className="text-sm leading-relaxed max-w-2xl" style={hintStyle}>
                {AMBASSADOR_MOMENTS_INTRO.pageDescription}
              </p>
              <p className="text-xs mt-3" style={hintStyle}>
                共 {publishedAlbums.length} 个已发布活动
              </p>
            </div>
            {isAdmin && (
              <Link
                to="/ambassador-moments/admin"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all shrink-0"
                style={{ borderColor: '#5EC4B6', color: '#5EC4B6' }}
              >
                <CalendarRange className="w-4 h-4" />
                活动管理
              </Link>
            )}
          </div>
        </header>
      )}

      {!isDetailView && listLoading && (
        <p className="text-sm mb-8 text-center" style={hintStyle}>
          加载中…
        </p>
      )}

      {!isDetailView && listError && (
        <p className="text-sm mb-8 text-center" style={{ color: '#B45309' }}>
          {listError}
        </p>
      )}

      {!isDetailView && !listLoading && !listError && publishedAlbums.length === 0 && (
        <div className="mb-8 text-center">
          <p className="text-sm mb-4" style={hintStyle}>
            暂无已发布活动。
          </p>
          {isAdmin && (
            <Link
              to="/ambassador-moments/admin"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium"
              style={{ borderColor: '#5EC4B6', color: '#5EC4B6' }}
            >
              <CalendarRange className="w-4 h-4" />
              进入活动管理
            </Link>
          )}
        </div>
      )}

      {isDetailView && singleAlbum && <AlbumDetail album={singleAlbum} />}

      {!isDetailView && !listLoading && !listError && publishedAlbums.length > 0 && (
        <div className="space-y-8 sm:space-y-10">
          {publishedAlbums.map((album) => (
            <AlbumListCard key={album.id} album={album} />
          ))}
        </div>
      )}

      {isDetailView && (
        <div className="mt-8 flex justify-center gap-6">
          <Link
            to="/ambassador-moments"
            className="text-sm font-medium transition-opacity hover:opacity-80"
            style={{ color: '#5EC4B6' }}
          >
            浏览全部活动
          </Link>
        </div>
      )}
    </div>
  );
}
