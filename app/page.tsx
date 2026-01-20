'use client';

import { useState } from 'react';

export default function Home() {
  const [links, setLinks] = useState('');
  const [result, setResult] = useState<{ url: string; count: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async () => {
    if (!links.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const linkArray = links
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('http'));

      if (linkArray.length === 0) {
        alert('Geçerli link bulunamadı');
        return;
      }

      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: linkArray }),
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
        Video linklerini yapıştır, iPhone'da indir
      </p>

      <textarea
        value={links}
        onChange={(e) => setLinks(e.target.value)}
        placeholder="Her satıra bir link yapıştır...

https://example.com/video1.mp4
https://example.com/video2.mp4"
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
        {loading ? 'Oluşturuluyor...' : 'Link Oluştur'}
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
