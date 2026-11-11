import React, { useEffect, useState, useRef } from 'react';
import { Zap, Crosshair, Sparkles } from 'lucide-react';

interface Props {
  onMoveChange: (x: number, y: number) => void;
  onAttackChange: (isAttacking: boolean, angle: number) => void;
  onDash: () => void;
  onSkill: () => void;
}

export const TouchControls: React.FC<Props> = ({ onMoveChange, onAttackChange, onDash, onSkill }) => {
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
    const maxRadius = 38;

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
    const maxRadius = 38;

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
        className="w-28 h-28 rounded-full bg-[#141210]/80 border-2 border-[#44403c] shadow-2xl pointer-events-auto flex items-center justify-center relative touch-none"
      >
        <div
          className="w-12 h-12 rounded-full bg-[#78350f] border-2 border-[#d97706] shadow-md pointer-events-none absolute transition-transform duration-75"
          style={{ transform: `translate(${leftThumb.x}px, ${leftThumb.y}px)` }}
        ></div>
      </div>

      {/* Right Action Buttons: Active Skill, Dash & Attack */}
      <div className="flex flex-col gap-3 pointer-events-auto items-center">
        <div className="flex gap-3">
          {/* Active Class Skill Button */}
          <button
            onTouchStart={onSkill}
            className="w-14 h-14 rounded-full bg-purple-950 active:bg-purple-900 border-2 border-purple-400 text-purple-200 flex items-center justify-center shadow-lg active:scale-95 transition"
          >
            <Sparkles size={22} className="text-purple-300" />
          </button>

          {/* Dash Button */}
          <button
            onTouchStart={onDash}
            className="w-14 h-14 rounded-full bg-[#1c1917] active:bg-[#292524] border-2 border-[#d97706] text-[#fef3c7] flex items-center justify-center shadow-lg active:scale-95 transition"
          >
            <Zap size={22} className="fill-[#d97706] text-[#d97706]" />
          </button>
        </div>

        {/* Attack Button */}
        <button
          onTouchStart={() => onAttackChange(true, 0)}
          onTouchEnd={() => onAttackChange(false, 0)}
          className="w-20 h-20 rounded-full bg-[#991b1b] active:bg-[#7f1d1d] border-2 border-[#ef4444] text-white flex items-center justify-center shadow-2xl active:scale-95 transition"
        >
          <Crosshair size={30} />
        </button>
      </div>
    </div>
  );
};
