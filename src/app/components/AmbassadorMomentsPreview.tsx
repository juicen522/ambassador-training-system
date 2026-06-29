import { Link } from 'react-router';
import { ArrowRight, CalendarRange, Images } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { AMBASSADOR_MOMENTS_INTRO } from '../data/ambassadorMoments';
import { usePublishedAlbums } from '../hooks/usePublishedAlbums';

const labelStyle = { color: '#382C25' };
const hintStyle = { color: '#7A6E68' };

function AlbumCover({
  coverImageUrl,
  coverGradient,
}: {
  coverImageUrl?: string;
  coverGradient: string;
}) {
  if (coverImageUrl) {
    return (
      <img
        src={coverImageUrl}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />
    );
  }
  return <div className="absolute inset-0" style={{ background: coverGradient }} />;
}

export default function AmbassadorMomentsPreview() {
  const { currentUser } = useUser();
  const { albums, loading, error } = usePublishedAlbums();
  const isAdmin = currentUser.role === 'admin';
  const featured = albums.slice(0, 3);

  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Images className="w-5 h-5" style={{ color: '#5EC4B6' }} />
            <h2 className="text-lg font-medium" style={labelStyle}>
              {AMBASSADOR_MOMENTS_INTRO.homeTitle}
            </h2>
          </div>
          <p className="text-sm max-w-2xl" style={hintStyle}>
            {AMBASSADOR_MOMENTS_INTRO.homeDescription}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <Link
              to="/ambassador-moments/admin"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all"
              style={{ borderColor: '#5EC4B6', color: '#5EC4B6', backgroundColor: 'rgba(94, 196, 182, 0.06)' }}
            >
              <CalendarRange className="w-4 h-4" />
              活动管理
            </Link>
          )}
          {albums.length > 0 && (
            <Link
              to="/ambassador-moments"
              className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
              style={{ color: '#5EC4B6' }}
            >
              查看全部相册
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm py-8 text-center" style={hintStyle}>
          加载中…
        </p>
      ) : error ? (
        <div
          className="rounded-lg border p-6 text-center"
          style={{ borderColor: 'rgba(220, 80, 80, 0.25)', backgroundColor: 'rgba(220, 80, 80, 0.04)' }}
        >
          <p className="text-sm" style={{ color: '#B45309' }}>
            {error}
          </p>
        </div>
      ) : featured.length === 0 ? (
        <div
          className="rounded-lg border p-8 text-center"
          style={{
            borderColor: 'rgba(56, 44, 37, 0.08)',
            backgroundColor: 'rgba(94, 196, 182, 0.04)',
          }}
        >
          <p className="text-sm mb-4" style={hintStyle}>
            暂无已发布活动，发布后将显示在这里。
          </p>
          {isAdmin && (
            <Link
              to="/ambassador-moments/admin"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium"
              style={{ borderColor: '#5EC4B6', color: '#5EC4B6' }}
            >
              <CalendarRange className="w-4 h-4" />
              进入活动管理
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {featured.map((album) => (
            <Link
              key={album.id}
              to={`/ambassador-moments/${album.id}`}
              className="group bg-white rounded-lg border overflow-hidden transition-all"
              style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#5EC4B6';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(94, 196, 182, 0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(56, 44, 37, 0.06)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <AlbumCover
                  coverImageUrl={album.coverImageUrl}
                  coverGradient={album.coverGradient}
                />
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4"
                  style={{
                    background:
                      'linear-gradient(to top, rgba(56, 44, 37, 0.65) 0%, transparent 70%)',
                  }}
                >
                  <p className="text-xs text-white leading-relaxed line-clamp-2">
                    {album.summary}
                  </p>
                </div>
              </div>
              <div className="p-4">
                <h3 className="text-sm font-medium mb-1" style={labelStyle}>
                  {album.title}
                </h3>
                <p className="text-xs" style={hintStyle}>
                  {[album.date, album.location].filter(Boolean).join(' · ')}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
