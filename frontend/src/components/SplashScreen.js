import React from 'react';

const SplashScreen = () => {
  return (
    <div className="splash-screen">
      <div className="splash-overlay" />
      <div className="splash-content">
        <div className="logo-pulse">RTAIP</div>
        <div className="subtitle">Access Protocol Initialized</div>
        <div className="scanlines" />
      </div>
    </div>
  );
};

export default SplashScreen;