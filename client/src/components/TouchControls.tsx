import React, { useEffect, useState, useRef } from 'react';
import { Zap, Crosshair } from 'lucide-react';

interface Props {
  onMoveChange: (x: number, y: number) => void;
  onAttackChange: (isAttacking: boolean, angle: number) => void;
  onDash: () => void;
}

export const TouchControls: React.FC<Props> = ({ onMoveChange, onAttackChange, onDash }) => {
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const leftStickRef = useRef<HTMLDivElement>(null);
  const [leftThumb, setLeftThumb] = useState({ x: 0, y: 0, active: false });

  useEffect(() => {
    if (typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
      setIsTouchDevice(true);
    }
  }, []);

  if (!isTouchDevice) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const rect = leftStickRef.current?.getBoundingClientRect();
    if (!rect) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = touch.clientX - centerX;
    const dy = touch.clientY - centerY;
    const dist = Math.hypot(dx, dy);
    const maxRadius = 40;

    const clampedX = dist > maxRadius ? (dx / dist) * maxRadius : dx;
    const clampedY = dist > maxRadius ? (dy / dist) * maxRadius : dy;

    setLeftThumb({ x: clampedX, y: clampedY, active: true });
    onMoveChange(clampedX / maxRadius, clampedY / maxRadius);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!leftThumb.active) return;
    const touch = e.touches[0];
    const rect = leftStickRef.current?.getBoundingClientRect();
    if (!rect) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = touch.clientX - centerX;
    const dy = touch.clientY - centerY;
    const dist = Math.hypot(dx, dy);
    const maxRadius = 40;

    const clampedX = dist > maxRadius ? (dx / dist) * maxRadius : dx;
    const clampedY = dist > maxRadius ? (dy / dist) * maxRadius : dy;

    setLeftThumb({ x: clampedX, y: clampedY, active: true });
    onMoveChange(clampedX / maxRadius, clampedY / maxRadius);
  };

  const handleTouchEnd = () => {
    setLeftThumb({ x: 0, y: 0, active: false });
    onMoveChange(0, 0);
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-30 flex justify-between items-end p-6 select-none">
      {/* Left Joystick: Movement */}
      <div
        ref={leftStickRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="w-28 h-28 rounded-full bg-gray-900/60 border-2 border-gray-600/60 backdrop-blur-sm pointer-events-auto flex items-center justify-center relative touch-none"
      >
        <div
          className="w-12 h-12 rounded-full bg-cyan-500/80 shadow-md shadow-cyan-500/40 pointer-events-none absolute transition-transform duration-75"
          style={{ transform: `translate(${leftThumb.x}px, ${leftThumb.y}px)` }}
        ></div>
      </div>

      {/* Right Action Buttons */}
      <div className="flex flex-col gap-4 pointer-events-auto">
        {/* Dash Button */}
        <button
          onTouchStart={onDash}
          className="w-16 h-16 rounded-full bg-cyan-600 active:bg-cyan-400 border-2 border-cyan-400 text-white flex items-center justify-center shadow-lg active:scale-95 transition"
        >
          <Zap size={24} className="fill-white" />
        </button>

        {/* Attack Button */}
        <button
          onTouchStart={() => onAttackChange(true, 0)}
          onTouchEnd={() => onAttackChange(false, 0)}
          className="w-20 h-20 rounded-full bg-red-600 active:bg-red-500 border-2 border-red-400 text-white flex items-center justify-center shadow-lg active:scale-95 transition"
        >
          <Crosshair size={32} />
        </button>
      </div>
    </div>
  );
};
