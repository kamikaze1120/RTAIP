import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import React from 'react';

const navItems = [
  { label: 'Sources', path: '/sources' },
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Intelligence', path: '/intelligence' },
  { label: 'Threat Analysis', path: '/threat-analysis' },
  { label: 'Logistics', path: '/logistics' },
  { label: 'Map', path: '/map' },
  { label: 'Timeline', path: '/timeline' },
  { label: 'Security', path: '/security' },
];

export function NewHeader() {
  const location = useLocation();
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-black/50 backdrop-blur-md">
      <div className="container mx-auto flex items-center justify-between px-6 py-4">
        <Link to="/" className="text-2xl font-bold text-white">
          RTAIP
        </Link>
        <nav className="flex items-center gap-6">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'text-sm font-medium transition-colors',
                  isActive ? 'text-white' : 'text-gray-400 hover:text-white'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}