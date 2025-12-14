import { Link, useLocation } from 'react-router-dom';
import { Database, LayoutDashboard, Map, Clock, Settings, Radio } from 'lucide-react';
import { cn } from '../lib/utils';

const navItems = [
  { label: 'Sources', path: '/sources', icon: Database },
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Map', path: '/map', icon: Map },
  { label: 'Timeline', path: '/timeline', icon: Clock },
  { label: 'Settings', path: '/settings', icon: Settings },
];

export function Header({ isOnline = false }: { isOnline?: boolean }) {
  const location = useLocation();
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-primary/20 bg-background/80 backdrop-blur-md">
      <div className="flex items-center justify-between px-6 py-3">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="relative">
            <div className="w-10 h-10 clip-corner bg-primary/20 flex items-center justify-center border border-primary/50 group-hover:bg-primary/30 transition-colors">
              <Radio className="w-5 h-5 text-primary" />
            </div>
            <div className="absolute inset-0 bg-primary/20 animate-pulse-ring clip-corner pointer-events-none" />
          </div>
          <span className="text-xl font-bold tracking-wider text-primary text-glow">RTAIP</span>
        </Link>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} to={item.path}
                className={cn(
                  'relative px-4 py-2 flex items-center gap-2 text-sm font-medium tracking-wide transition-all duration-300',
                  'hover:text-primary hover:bg-primary/10',
                  'clip-corner-sm',
                  isActive ? 'text-primary bg-primary/20 border border-primary/30' : 'text-muted-foreground'
                )}>
                <Icon className="w-4 h-4" />
                <span className="hidden md:inline">{item.label}</span>
                {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary box-glow" />}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <div className={cn(
            'flex items-center gap-2 px-3 py-1.5 text-xs font-medium tracking-wider uppercase clip-corner-sm',
            isOnline ? 'bg-success/20 text-success border border-success/30' : 'bg-destructive/20 text-destructive border border-destructive/30'
          )}>
            <div className={cn('w-2 h-2 rounded-full', isOnline ? 'bg-success animate-pulse' : 'bg-destructive')} />
            Backend: {isOnline ? 'Online' : 'Offline'}
          </div>
        </div>
      </div>
    </header>
  );
}