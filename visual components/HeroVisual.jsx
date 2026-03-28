import React from 'react';
import './HeroVisual.css';

const DEFAULT_AVATAR = (
  <svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </svg>
);

// Two interleaved rings - inner 5 (72° apart) + outer 5 (72° apart, offset 36°)
// This geometry guarantees NO two nodes are adjacent at the same radius, zero overlap.
const NODES_DATA = [
  // Inner ring — 5 nodes, every 72°
  { id: '1', angle: 0,   r: 260, zOffset: 50,  color: '#3b82f6', word: 'Technology' },
  { id: '3', angle: 72,  r: 260, zOffset: 45,  color: '#10b981', word: 'Logic' },
  { id: '5', angle: 144, r: 260, zOffset: 65,  color: '#14b8a6', word: 'Biology' },
  { id: '7', angle: 216, r: 260, zOffset: 80,  color: '#ef4444', word: 'Scale' },
  { id: '9', angle: 288, r: 260, zOffset: 105, color: '#0ea5e9', word: 'Systems' },
  // Outer ring — 5 nodes, every 72°, offset by 36° from inner
  { id: '2', angle: 36,  r: 400, zOffset: 85,  color: '#ec4899', word: 'Creativity' },
  { id: '4', angle: 108, r: 400, zOffset: 95,  color: '#f59e0b', word: 'Communication' },
  { id: '6', angle: 180, r: 400, zOffset: 70,  color: '#8b5cf6', word: 'Leadership' },
  { id: '8', angle: 252, r: 400, zOffset: 55,  color: '#eab308', word: 'Vision' },
  { id: '10', angle: 300, r: 400, zOffset: 75, color: '#f43f5e', word: 'Engineering' }
].map(p => ({
  ...p,
  x: p.r * Math.cos(p.angle * (Math.PI / 180)),
  y: p.r * Math.sin(p.angle * (Math.PI / 180))
}));

// Core database has 15 layers of 10px slices = 150px height tall stack.
export default function HeroVisual() {
  return (
    <div className="hero-visual-wrapper">
      <div className="iso-scene">
        
        {/* Floor SVG scaled to 1000px */}
        <svg className="grid-floor-svg" viewBox="-500 -500 1000 1000">
           <defs>
             <pattern id="floor-grid" width="60" height="60" patternUnits="userSpaceOnUse">
               <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(100, 110, 140, 0.15)" strokeWidth="1.5" />
             </pattern>
           </defs>
           <rect x="-500" y="-500" width="1000" height="1000" fill="url(#floor-grid)" />
           
           {/* Completely static, heavy drawn blueprint paths connecting core to nodes */}
           {NODES_DATA.map(p => {
             const pathData = `M 0,0 C ${p.x * 0.4},${p.y * 0.2} ${p.x * 0.6},${p.y * 0.8} ${p.x},${p.y}`;
             return (
               <path
                key={`path-${p.id}`}
                d={pathData}
                fill="none"
                stroke={p.color}
                strokeWidth="4"
                opacity="0.4"
                style={{ filter: `drop-shadow(0 0 6px ${p.color}80)` }}
               />
             );
           })}
        </svg>

        {/* Thick, powerful 3D Core Database Node (Static) */}
        <div className="core-database preserve-3d">
          <div className="preserve-3d">
            {/* Thick static floor shadow */}
            <div 
              style={{
                width: 300, height: 300, borderRadius: '50%', position: 'absolute', left: -150, top: -150,
                background: 'radial-gradient(ellipse, rgba(79, 70, 229, 0.45) 0%, rgba(0,0,0,0) 70%)',
                filter: 'blur(15px)', transform: 'translateZ(-15px)'
              }}
            />
            {/* 15 stacked layered thicker discs */}
            {Array.from({ length: 15 }).map((_, i) => {
               const isTop = i === 14;
               return (
                 <div
                   key={`layer-${i}`}
                   className="core-layer"
                   style={{
                     transform: `translateZ(${i * 10}px)`,
                     background: isTop ? 'linear-gradient(135deg, #4f46e5, #8b5cf6)' : `rgba(49, 46, ${100 + i*10}, 0.95)`,
                     boxShadow: isTop 
                       ? 'inset 0 0 30px rgba(255,255,255,0.4), 0 0 30px rgba(139, 92, 246, 0.6)'
                       : `inset 0 -6px 15px rgba(0,0,0,0.5), inset 0 6px 15px rgba(255,255,255,0.1)`
                   }}
                 />
               );
            })}
          </div>
        </div>

        {/* High-visibility Static Profile Nodes */}
        {NODES_DATA.map((p) => (
          <div 
            key={`node-${p.id}`} 
            className="profile-node preserve-3d"
            style={{ transform: `translate3d(${p.x}px, ${p.y}px, 0)` }}
          >
            {/* Simple static floor drop shadow */}
            <div 
              style={{ 
                width: 60, height: 60, position: 'absolute', marginLeft: -30, marginTop: -30, filter: 'blur(6px)',
                background: `radial-gradient(circle, ${p.color}60 0%, rgba(0,0,0,0) 70%)`
              }}
            />

            {/* Entity strictly fixed in Z-space */}
            <div 
              className="preserve-3d"
              style={{ transform: `translateZ(${p.zOffset}px)` }}
            >
              {/* Actual Avatar Billboarding exactly to camera */}
              <div 
                className="avatar-standup" 
                style={{ color: p.color, border: `3px solid ${p.color}90`, boxShadow: `0 15px 30px ${p.color}40` }}
              >
                {DEFAULT_AVATAR}
              </div>


            </div>
          </div>
        ))}

      </div>
    </div>
  );
}
