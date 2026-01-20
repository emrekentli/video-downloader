'use client';

import { useState } from 'react';

// Doğrudan video dosyası uzantıları
const directVideoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v'];

function isDirectVideoUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return directVideoExtensions.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

export default function Home() {
  const [links, setLinks] = useState('');
  const [result, setResult] = useState<{ url: string; count: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSubmit = async () => {
    if (!links.trim()) return;

    setLoading(true);
    setResult(null);
    setStatus('Linkler işleniyor...');

    try {
      const linkArray = links
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('http'));

      const resolvedLinks: { url: string; filename: string }[] = [];

      for (let i = 0; i < linkArray.length; i++) {
        const link = linkArray[i];
        setStatus(`İşleniyor: ${i + 1}/${linkArray.length}`);

        if (!isDirectVideoUrl(link)) {
          // yt-dlp ile çözümle
          try {
            const res = await fetch('/api/ytdlp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: link }),
            });

            if (res.ok) {
              const data = await res.json();
              resolvedLinks.push({
                url: data.directUrl,
                filename: data.filename
              });
            } else {
              const errData = await res.json().catch(() => ({}));
              console.error('yt-dlp failed for:', link, errData.error);
              // yt-dlp başarısız olursa linki olduğu gibi ekle (belki çalışır)
              resolvedLinks.push({
                url: link,
                filename: `video_${i + 1}.mp4`
              });
            }
          } catch (err) {
            console.error('yt-dlp error:', err);
            // Hata durumunda da linki ekle
            resolvedLinks.push({
              url: link,
              filename: `video_${i + 1}.mp4`
            });
          }
        } else {
          // Doğrudan link
          const filename = link.split('/').pop() || `video_${i + 1}.mp4`;
          resolvedLinks.push({ url: link, filename });
        }
      }

      if (resolvedLinks.length === 0) {
        alert('Geçerli link bulunamadı');
        return;
      }

      setStatus('Koleksiyon oluşturuluyor...');

      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          links: resolvedLinks.map(l => l.url),
          filenames: resolvedLinks.map(l => l.filename)
        }),
      });

      const data = await res.json();

      if (res.ok) {
        const url = `${window.location.origin}/d/${data.id}`;
        setResult({ url, count: data.count });
      } else {
        alert(data.error || 'Bir hata oluştu');
      }
    } catch (error) {
      alert('Bir hata oluştu');
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  const copyToClipboard = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      padding: '40px 20px',
    }}>
      <h1 style={{ marginBottom: '8px', fontSize: '24px' }}>Video Downloader</h1>
      <p style={{ color: '#888', marginBottom: '24px' }}>
        YouTube, Twitter, Instagram veya doğrudan video linkleri
      </p>

      <textarea
        value={links}
        onChange={(e) => setLinks(e.target.value)}
        placeholder="Her satıra bir link yapıştır...

https://www.youtube.com/watch?v=xxx
https://twitter.com/user/status/xxx
https://example.com/video.mp4"
        style={{
          width: '100%',
          minHeight: '200px',
          padding: '16px',
          backgroundColor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '8px',
          color: '#fff',
          fontSize: '14px',
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />

      <button
        onClick={handleSubmit}
        disabled={loading || !links.trim()}
        style={{
          width: '100%',
          padding: '14px',
          marginTop: '16px',
          backgroundColor: loading ? '#333' : '#0070f3',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: '600',
          cursor: loading ? 'wait' : 'pointer',
        }}
      >
        {loading ? status || 'İşleniyor...' : 'Link Oluştur'}
      </button>

      {result && (
        <div style={{
          marginTop: '24px',
          padding: '20px',
          backgroundColor: '#1a1a1a',
          borderRadius: '8px',
          border: '1px solid #333',
        }}>
          <p style={{ margin: '0 0 12px 0', color: '#0f0' }}>
            {result.count} video için link oluşturuldu
          </p>
          <div style={{
            display: 'flex',
            gap: '8px',
          }}>
            <input
              type="text"
              value={result.url}
              readOnly
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#0a0a0a',
                border: '1px solid #333',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '14px',
              }}
            />
            <button
              onClick={copyToClipboard}
              style={{
                padding: '12px 20px',
                backgroundColor: copied ? '#0f0' : '#333',
                color: copied ? '#000' : '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              {copied ? 'Kopyalandı!' : 'Kopyala'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
