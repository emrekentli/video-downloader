'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface VideoItem {
  url: string;
  filename: string;
  downloaded: boolean;
}

export default function DownloadPage() {
  const params = useParams();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const fetchLinks = async () => {
      try {
        const res = await fetch(`/api/collection/${params.id}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Koleksiyon bulunamadı');
          return;
        }

        const items: VideoItem[] = data.items.map((item: { url: string; filename: string }) => ({
          url: item.url,
          filename: item.filename,
          downloaded: false
        }));

        setVideos(items);
      } catch (err) {
        setError('Bir hata oluştu');
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      fetchLinks();
    }
  }, [params.id]);

  const downloadSingle = (index: number) => {
    const video = videos[index];
    const proxyUrl = `/api/download?url=${encodeURIComponent(video.url)}&filename=${encodeURIComponent(video.filename)}`;

    // Hidden iframe ile indirme başlat (iOS uyumlu)
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = proxyUrl;
    document.body.appendChild(iframe);

    // Temizlik için 30 saniye sonra iframe'i kaldır
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 30000);

    setVideos(prev => prev.map((v, i) =>
      i === index ? { ...v, downloaded: true } : v
    ));
  };

  const downloadAll = async () => {
    setDownloading(true);
    setCurrentIndex(0);

    for (let i = 0; i < videos.length; i++) {
      setCurrentIndex(i);
      downloadSingle(i);
      // iOS'ta ardışık indirmeler için kısa bekleme
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    setDownloading(false);
  };

  if (loading) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <p>Yükleniyor...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ color: '#f00' }}>{error}</p>
      </div>
    );
  }

  const downloadedCount = videos.filter(v => v.downloaded).length;

  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      padding: '20px',
    }}>
      <h1 style={{ fontSize: '20px', marginBottom: '8px' }}>
        {videos.length} Video
      </h1>
      <p style={{ color: '#888', marginBottom: '20px', fontSize: '14px' }}>
        {downloadedCount} / {videos.length} indirildi
      </p>

      <button
        onClick={downloadAll}
        disabled={downloading}
        style={{
          width: '100%',
          padding: '16px',
          backgroundColor: downloading ? '#333' : '#0f0',
          color: '#000',
          border: 'none',
          borderRadius: '12px',
          fontSize: '18px',
          fontWeight: '700',
          cursor: downloading ? 'wait' : 'pointer',
          marginBottom: '24px',
        }}
      >
        {downloading
          ? `İndiriliyor... (${currentIndex + 1}/${videos.length})`
          : 'Hepsini İndir'}
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {videos.map((video, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px',
              backgroundColor: video.downloaded ? '#1a2a1a' : '#1a1a1a',
              borderRadius: '8px',
              border: `1px solid ${video.downloaded ? '#0f0' : '#333'}`,
            }}
          >
            <span style={{
              flex: 1,
              fontSize: '13px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginRight: '12px',
            }}>
              {video.filename}
            </span>
            <button
              onClick={() => downloadSingle(index)}
              style={{
                padding: '8px 16px',
                backgroundColor: video.downloaded ? '#0f0' : '#333',
                color: video.downloaded ? '#000' : '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {video.downloaded ? 'Tamam' : 'İndir'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
