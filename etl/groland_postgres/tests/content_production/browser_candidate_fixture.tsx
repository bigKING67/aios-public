// Mount production UI and API client against the isolated loopback Rust fixture.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { ContentEditingResult } from '@/app/marketing/content-assets/_components/content-editing-result';
import { adoptEditingCaptionCandidate, type EditingRun } from '@/app/marketing/content-assets/_lib/content-editing-api';
import '@/styles/globals.css';
function Fixture() {
  const [run, setRun] = useState<EditingRun>();
  const [message, setMessage] = useState('正在连接隔离后端');
  useEffect(() => { void fetch('/__caption_bootstrap').then(r => r.json()).then(value => { setRun(value); setMessage('已连接隔离后端'); }).catch(() => setMessage('隔离后端不可用')); }, []);
  return <main style={{ maxWidth: 960, padding: 24, margin: 'auto' }}>
    <h1>字幕候选 · 真实接口验收</h1><p>本地隔离工程，模型回复为测试数据。</p>
    <p role="status">{message}</p>
    {run && <ContentEditingResult run={run} disabled={false} onAdopt={async candidate => {
      try {
        const next = await adoptEditingCaptionCandidate(run, candidate);
        setMessage(`已采用到工程版本 ${next.run.projectRevision}，后台正在重新制作`);
        setRun(next.run); return true;
      } catch (error) { setMessage(error instanceof Error ? error.message : '采用失败'); return false; }
    }} />}
  </main>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider><QueryClientProvider client={new QueryClient()}><Fixture /></QueryClientProvider></ConfigProvider>);
