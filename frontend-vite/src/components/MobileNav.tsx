import React, { useState, useEffect } from 'react';
import { Menu, X, Home, Map, BarChart3, Settings, Shield, Globe, AlertTriangle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const MobileNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isAdmin = (() => { try { return window.localStorage.getItem('isAdmin') === 'true' } catch { return false } })();
  const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/map', icon: Map, label: 'Map' },
    { path: '/dashboard', icon: BarChart3, label: 'Dashboard' },
    { path: '/intelligence', icon: Globe, label: 'Intel' },
    { path: '/threat-analysis', icon: AlertTriangle, label: 'Threats' },
    { path: '/logistics', icon: Shield, label: 'Logistics' },
    ...(isAdmin ? [{ path: '/settings', icon: Settings, label: 'Settings' }] : []),
  ];


  const handleNavClick = (path: string) => {
    navigate(path);
    setIsMenuOpen(false);
  };

  if (!isMobile) return null;

  return (
    <>
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-violet-500 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-black" />
            </div>
            <span className="font-orbitron font-bold text-lg">RTAIP</span>
          </div>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors touch-target"
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="absolute top-full left-0 right-0 bg-background border-b border-border shadow-lg">
            <div className="p-4 space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => handleNavClick(item.path)}
                    className={`w-full flex items-center space-x-3 p-3 rounded-lg transition-colors touch-target ${
                      isActive 
                        ? 'bg-primary/20 text-primary border border-primary/30' 
                        : 'hover:bg-secondary/50 text-foreground'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border z-40">
        <div className="flex justify-around items-center py-2">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => handleNavClick(item.path)}
                className={`flex flex-col items-center space-y-1 p-2 rounded-lg transition-colors touch-target min-w-[60px] ${
                  isActive 
                    ? 'text-primary' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content padding to account for fixed header and bottom nav */}
      <div className="md:hidden pt-16 pb-20" />
    </>
  );
};

export default MobileNav;