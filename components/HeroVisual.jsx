import React, { useState, useRef, useCallback } from 'react';
import './HeroVisual.css';

const DEFAULT_AVATAR = (
  <svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </svg>
);

// Two interleaved rings - inner 5 (72° apart) + outer 5 (72° apart, offset 36°)
const NODES_DATA = [
  { id: '1',  angle: 0,   r: 260, zOffset: 50,  color: '#3b82f6', msg: 'I built my first app at 14. Never looked back.' },
  { id: '3',  angle: 72,  r: 260, zOffset: 45,  color: '#10b981', msg: 'I solve puzzles for fun, seriously.' },
  { id: '5',  angle: 144, r: 260, zOffset: 65,  color: '#14b8a6', msg: 'I can name every bone in the human body.' },
  { id: '7',  angle: 216, r: 260, zOffset: 80,  color: '#ef4444', msg: 'I turned a lemonade stand into a catering business.' },
  { id: '9',  angle: 288, r: 260, zOffset: 105, color: '#0ea5e9', msg: 'I color code my entire calendar. Every week.' },
  { id: '2',  angle: 36,  r: 400, zOffset: 85,  color: '#ec4899', msg: 'I redesign things in my head before I even sit down.' },
  { id: '4',  angle: 108, r: 400, zOffset: 95,  color: '#f59e0b', msg: 'I give better speeches than most adults I know.' },
  { id: '6',  angle: 180, r: 400, zOffset: 70,  color: '#8b5cf6', msg: 'I started three clubs in high school. All still running.' },
  { id: '8',  angle: 252, r: 400, zOffset: 55,  color: '#eab308', msg: 'I wrote a 10-year plan when I was 15.' },
  { id: '10', angle: 300, r: 400, zOffset: 75,  color: '#f43f5e', msg: 'I took apart my router just to see how it worked.' },
].map(p => ({
  ...p,
  x: p.r * Math.cos(p.angle * (Math.PI / 180)),
  y: p.r * Math.sin(p.angle * (Math.PI / 180)),
}));

export default function HeroVisual() {
  const [hoveredId, setHoveredId] = useState(null);
  const [showMsg, setShowMsg]     = useState(false);
  const timerRef = useRef(null);

  const handleEnter = useCallback((id) => {
    clearTimeout(timerRef.current);
    setHoveredId(id);
    setShowMsg(false);
    timerRef.current = setTimeout(() => setShowMsg(true), 1200);
  }, []);

  const handleLeave = useCallback(() => {
    clearTimeout(timerRef.current);
    setHoveredId(null);
    setShowMsg(false);
  }, []);

  return (
    <div className="hero-visual-wrapper">
      <div className="iso-scene">

        {/* Floor SVG */}
        <svg className="grid-floor-svg" viewBox="-500 -500 1000 1000">
          <defs>
            <pattern id="floor-grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(100, 110, 140, 0.15)" strokeWidth="1.5" />
            </pattern>
          </defs>
          <rect x="-500" y="-500" width="1000" height="1000" fill="url(#floor-grid)" />
          {NODES_DATA.map(p => (
            <path
              key={`path-${p.id}`}
              d={`M 0,0 C ${p.x * 0.4},${p.y * 0.2} ${p.x * 0.6},${p.y * 0.8} ${p.x},${p.y}`}
              fill="none" stroke={p.color} strokeWidth="4" opacity="0.4"
            />
          ))}
        </svg>

        {/* 3D Core Database Node */}
        <div className="core-database preserve-3d">
          <div className="preserve-3d">
            <div style={{
              width: 300, height: 300, borderRadius: '50%', position: 'absolute', left: -150, top: -150,
              background: 'radial-gradient(ellipse, rgba(79, 70, 229, 0.45) 0%, rgba(0,0,0,0) 70%)',
              transform: 'translateZ(-15px)'
            }}/>
            {Array.from({ length: 15 }).map((_, i) => {
              const isTop = i === 14;
              return (
                <div key={`layer-${i}`} className="core-layer" style={{
                  transform: `translateZ(${i * 10}px)`,
                  background: isTop ? 'linear-gradient(135deg, #4f46e5, #8b5cf6)' : `rgba(49, 46, ${100 + i * 10}, 0.95)`,
                  boxShadow: isTop
                    ? 'inset 0 0 30px rgba(255,255,255,0.4), 0 0 30px rgba(139, 92, 246, 0.6)'
                    : 'inset 0 -6px 15px rgba(0,0,0,0.5), inset 0 6px 15px rgba(255,255,255,0.1)'
                }}/>
              );
            })}
          </div>
        </div>

        {/* Profile Nodes */}
        {NODES_DATA.map((p) => {
          const active = hoveredId === p.id;
          return (
            <div
              key={`node-${p.id}`}
              className="profile-node preserve-3d"
              style={{ transform: `translate3d(${p.x}px, ${p.y}px, 0)` }}
            >
              <div style={{
                width: 60, height: 60, position: 'absolute', marginLeft: -30, marginTop: -30,
                background: `radial-gradient(circle, ${p.color}60 0%, rgba(0,0,0,0) 70%)`
              }}/>

              <div className="preserve-3d" style={{ transform: `translateZ(${p.zOffset}px)` }}>
                {/* Billboard: avatar + bubble together face the camera */}
                <div className="hv-billboard">

                  {/* Chat bubble — positioned above avatar in screen space */}
                  <div className={`hv-bubble${active ? ' hv-bubble--on' : ''}`} style={{ width: active && showMsg ? 185 : 68 }}>
                    <div className="hv-bubble-inner">
                      <div className="hv-dots" style={{ opacity: active && !showMsg ? 1 : 0 }}>
                        <span style={{ background: p.color }}/>
                        <span style={{ background: p.color }}/>
                        <span style={{ background: p.color }}/>
                      </div>
                      <span className="hv-msg" style={{ opacity: active && showMsg ? 1 : 0, color: p.color }}>{p.msg}</span>
                    </div>
                  </div>

                  {/* Avatar */}
                  <div
                    className="avatar-standup"
                    style={{ color: p.color, border: `3px solid ${p.color}90`, boxShadow: `0 15px 30px ${p.color}40` }}
                    onMouseEnter={() => handleEnter(p.id)}
                    onMouseLeave={handleLeave}
                  >
                    {DEFAULT_AVATAR}
                  </div>

                </div>
              </div>
            </div>
          );
        })}

      </div>
    </div>
  );
}
