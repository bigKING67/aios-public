import { Bot } from 'lucide-react';
import aiTabStyles from './content-assets-inspector-ai-tab.module.css';

export function AiSectionTitle({ title }: { title: string }) {
  return (
    <div className={aiTabStyles.aiSectionTitle}>
      <h3>{title}</h3>
      <Bot size={14} strokeWidth={1.8} aria-hidden="true" />
    </div>
  );
}
