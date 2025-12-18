import { Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header';
import MapPage from './pages/Map';
import Dashboard from './pages/Dashboard';
import Sources from './pages/Sources';
import Timeline from './pages/Timeline';

function Home() {
  return (
    <div className="px-6 pt-20">
      <div className="text-2xl text-primary">Welcome</div>
      <div className="mt-2 text-muted-foreground">Select a section from the top bar.</div>
    </div>
  );
}

export default function App() {
  const isOnline = true;
  return (
    <div className="min-h-screen">
      <Header isOnline={isOnline} />
      <div className="pt-16">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/settings" element={<Home />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}