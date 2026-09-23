import { BrowserRouter } from 'react-router-dom';
import { ViteProviders } from './ViteProviders';
import { AppRoutes } from './routes';

export default function App() {
  return (
    <ViteProviders>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ViteProviders>
  );
}
