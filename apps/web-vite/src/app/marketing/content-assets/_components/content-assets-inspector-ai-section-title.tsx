import { RobotOutlined } from '@ant-design/icons';
import aiTabStyles from './content-assets-inspector-ai-tab.module.css';

export function AiSectionTitle({ title }: { title: string }) {
  return (
    <div className={aiTabStyles.aiSectionTitle}>
      <h3>{title}</h3>
      <RobotOutlined />
    </div>
  );
}
