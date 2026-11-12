import React, { useEffect, useState, useRef } from 'react';
import { Zap, Crosshair, Sparkles } from 'lucide-react';

interface Props {
  onMoveChange: (x: number, y: number) => void;
  onAttackChange: (isAttacking: boolean, explicitAngle?: number) => void;
  onDash: () => void;
  onSkill: () => void;
}

export const TouchControls: React.FC<Props> = React.memo(({ onMoveChange, onAttackChange, onDash, onSkill }) => {
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const leftStickRef = useRef<HTMLDivElement>(null);
  const rightStickRef = useRef<HTMLDivElement>(null);

  const [leftThumb, setLeftThumb] = useState({ x: 0, y: 0, active: false });
  const [rightThumb, setRightThumb] = useState({ x: 0, y: 0, active: false });

  useEffect(() => {
    if (typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
      setIsTouchDevice(true);
    }
  }, []);

  if (!isTouchDevice) return null;

  // Left Joystick (Movement)
  const handleMoveStart = (e: React.TouchEvent) => {
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

  const handleMoveChange = (e: React.TouchEvent) => {
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

  const handleMoveEnd = () => {
    setLeftThumb({ x: 0, y: 0, active: false });
    onMoveChange(0, 0);
  };

  // Right Twin-Stick / Tap Attack Button
  const handleAttackStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const rect = rightStickRef.current?.getBoundingClientRect();
    if (!rect) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = touch.clientX - centerX;
    const dy = touch.clientY - centerY;
    const dist = Math.hypot(dx, dy);

    if (dist > 12) {
      const angle = Math.atan2(dy, dx);
      setRightThumb({ x: (dx / dist) * Math.min(30, dist), y: (dy / dist) * Math.min(30, dist), active: true });
      onAttackChange(true, angle);
    } else {
      // Direct tap without drag => Smart Auto-Aim to closest enemy
      setRightThumb({ x: 0, y: 0, active: true });
      onAttackChange(true, undefined);
    }
  };

  const handleAttackMove = (e: React.TouchEvent) => {
    if (!rightThumb.active) return;
    const touch = e.touches[0];
    const rect = rightStickRef.current?.getBoundingClientRect();
    if (!rect) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = touch.clientX - centerX;
    const dy = touch.clientY - centerY;
    const dist = Math.hypot(dx, dy);
    const maxRadius = 32;

    if (dist > 8) {
      const angle = Math.atan2(dy, dx);
      const clampedX = dist > maxRadius ? (dx / dist) * maxRadius : dx;
      const clampedY = dist > maxRadius ? (dy / dist) * maxRadius : dy;
      setRightThumb({ x: clampedX, y: clampedY, active: true });
      onAttackChange(true, angle);
    }
  };

  const handleAttackEnd = () => {
    setRightThumb({ x: 0, y: 0, active: false });
    onAttackChange(false, undefined);
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-30 flex justify-between items-end p-6 select-none">
      {/* Left Joystick: Movement */}
      <div
        ref={leftStickRef}
        onTouchStart={handleMoveStart}
        onTouchMove={handleMoveChange}
        onTouchEnd={handleMoveEnd}
        className="w-28 h-28 rounded-full bg-[#141210]/85 border-2 border-[#57534e] shadow-2xl pointer-events-auto flex items-center justify-center relative touch-none backdrop-blur-sm"
      >
        <div
          className="w-12 h-12 rounded-full bg-[#78350f] border-2 border-[#d97706] shadow-md pointer-events-none absolute transition-transform duration-75"
          style={{ transform: `translate(${leftThumb.x}px, ${leftThumb.y}px)` }}
        ></div>
        {!leftThumb.active && <span className="text-[10px] text-stone-500 font-cinzel font-bold">MOVER</span>}
      </div>

      {/* Right Action Buttons: Active Skill, Dash & Twin-Stick Attack */}
      <div className="flex flex-col gap-3 pointer-events-auto items-center">
        <div className="flex gap-3">
          {/* Active Class Skill Button */}
          <button
            onTouchStart={(e) => {
              e.preventDefault();
              onSkill();
            }}
            className="w-14 h-14 rounded-full bg-purple-950 active:bg-purple-900 border-2 border-purple-400 text-purple-200 flex items-center justify-center shadow-lg active:scale-95 transition"
            aria-label="Habilidad Especial"
          >
            <Sparkles size={22} className="text-purple-300" />
          </button>

          {/* Dash Button */}
          <button
            onTouchStart={(e) => {
              e.preventDefault();
              onDash();
            }}
            className="w-14 h-14 rounded-full bg-[#1c1917] active:bg-[#292524] border-2 border-[#d97706] text-[#fef3c7] flex items-center justify-center shadow-lg active:scale-95 transition"
            aria-label="Dash Evasivo"
          >
            <Zap size={22} className="fill-[#d97706] text-[#d97706]" />
          </button>
        </div>

        {/* Attack Button / Twin-Stick Aim Pad */}
        <div
          ref={rightStickRef}
          onTouchStart={handleAttackStart}
          onTouchMove={handleAttackMove}
          onTouchEnd={handleAttackEnd}
          className="w-24 h-24 rounded-full bg-[#7f1d1d]/85 active:bg-[#991b1b] border-2 border-[#ef4444] shadow-2xl flex items-center justify-center relative touch-none backdrop-blur-sm cursor-pointer"
        >
          <div
            className="w-10 h-10 rounded-full bg-[#dc2626] border-2 border-amber-400 shadow-lg pointer-events-none absolute transition-transform duration-75 flex items-center justify-center"
            style={{ transform: `translate(${rightThumb.x}px, ${rightThumb.y}px)` }}
          >
            <Crosshair size={22} className="text-white" />
          </div>
          {!rightThumb.active && (
            <span className="text-[9px] text-red-200 font-cinzel font-black absolute bottom-2 tracking-wider">
              AUTO / MIRA
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
