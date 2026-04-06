import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, RotateCcw, Trophy, ArrowUp, Info } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useGameLoop } from './hooks/useGameLoop';
import { sounds } from './lib/sounds';

type GameState = 'START' | 'PLAYING' | 'GAMEOVER';

interface Obstacle {
  x: number;
  gapTop: number;
  gapBottom: number;
  width: number;
  passed: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const GRAVITY = 0.4;
const LIFT = -7;
const SPEED = 3.5;
const SPAWN_RATE = 1500; // ms
const GAP_SIZE = 180;

export default function App() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('aura-glide-highscore');
    return saved ? parseInt(saved, 10) : 0;
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef({ y: 300, vy: 0, radius: 12 });
  const obstaclesRef = useRef<Obstacle[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const lastSpawnRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const resetGame = useCallback(() => {
    playerRef.current = { y: 300, vy: 0, radius: 12 };
    obstaclesRef.current = [];
    particlesRef.current = [];
    lastSpawnRef.current = performance.now();
    setScore(0);
    setGameState('PLAYING');
  }, []);

  const handleAction = useCallback(() => {
    if (gameState === 'PLAYING') {
      playerRef.current.vy = LIFT;
      sounds.playWhoosh();
      // Add particles on lift
      for (let i = 0; i < 5; i++) {
        particlesRef.current.push({
          x: 100,
          y: playerRef.current.y,
          vx: -Math.random() * 2,
          vy: Math.random() * 2 - 1,
          life: 1,
          color: 'rgba(90, 90, 64, 0.3)'
        });
      }
    } else if (gameState === 'START' || gameState === 'GAMEOVER') {
      resetGame();
    }
  }, [gameState, resetGame]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        handleAction();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleAction]);

  const update = useCallback((delta: number) => {
    if (gameState !== 'PLAYING') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Update player
    playerRef.current.vy += GRAVITY;
    playerRef.current.y += playerRef.current.vy;

    // Bounds check
    if (playerRef.current.y < 0 || playerRef.current.y > canvas.height) {
      setGameState('GAMEOVER');
      sounds.playHit();
    }

    // Spawn obstacles
    const now = performance.now();
    if (now - lastSpawnRef.current > SPAWN_RATE) {
      const gapTop = Math.random() * (canvas.height - GAP_SIZE - 100) + 50;
      obstaclesRef.current.push({
        x: canvas.width,
        gapTop,
        gapBottom: gapTop + GAP_SIZE,
        width: 60,
        passed: false
      });
      lastSpawnRef.current = now;
    }

    // Update obstacles
    obstaclesRef.current.forEach((obs, index) => {
      obs.x -= SPEED;

      // Collision detection
      const px = 100;
      const py = playerRef.current.y;
      const pr = playerRef.current.radius;

      if (
        px + pr > obs.x &&
        px - pr < obs.x + obs.width &&
        (py - pr < obs.gapTop || py + pr > obs.gapBottom)
      ) {
        setGameState('GAMEOVER');
        sounds.playHit();
      }

      // Scoring
      if (!obs.passed && obs.x + obs.width < px) {
        obs.passed = true;
        setScore(s => {
          const newScore = s + 1;
          sounds.playPoint();
          return newScore;
        });
      }
    });

    // Cleanup off-screen obstacles
    obstaclesRef.current = obstaclesRef.current.filter(obs => obs.x + obs.width > -100);

    // Update particles
    particlesRef.current.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
  }, [gameState]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Background Gradient (Subtle)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGrad.addColorStop(0, '#F5F2ED');
    bgGrad.addColorStop(1, '#E6E1D6');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Particles
    particlesRef.current.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = p.color.replace('0.3', p.life.toString());
      ctx.fill();
    });

    // Draw Obstacles
    obstaclesRef.current.forEach(obs => {
      ctx.fillStyle = '#5A5A40';
      ctx.beginPath();
      // Top pillar
      ctx.roundRect(obs.x, -20, obs.width, obs.gapTop + 20, 12);
      // Bottom pillar
      ctx.roundRect(obs.x, obs.gapBottom, obs.width, canvas.height - obs.gapBottom + 20, 12);
      ctx.fill();
    });

    // Draw Player (Aura)
    const { y, radius } = playerRef.current;
    const auraGrad = ctx.createRadialGradient(100, y, 0, 100, y, radius * 2.5);
    auraGrad.addColorStop(0, '#D4AF37');
    auraGrad.addColorStop(0.4, 'rgba(212, 175, 55, 0.4)');
    auraGrad.addColorStop(1, 'rgba(212, 175, 55, 0)');

    ctx.beginPath();
    ctx.arc(100, y, radius * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = auraGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(100, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#D4AF37';
    ctx.fill();
    ctx.strokeStyle = '#FDFCFB';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, []);

  useGameLoop((delta) => {
    update(delta);
    draw();
  }, true);

  useEffect(() => {
    if (gameState === 'GAMEOVER') {
      if (score > highScore) {
        setHighScore(score);
        localStorage.setItem('aura-glide-highscore', score.toString());
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#D4AF37', '#5A5A40', '#FDFCFB']
        });
      }
    }
  }, [gameState, score, highScore]);

  useEffect(() => {
    const resize = () => {
      if (canvasRef.current && containerRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-screen overflow-hidden bg-warm-bg flex items-center justify-center select-none"
      onMouseDown={handleAction}
      onTouchStart={(e) => {
        e.preventDefault();
        handleAction();
      }}
    >
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />

      {/* HUD */}
      {gameState === 'PLAYING' && (
        <div className="absolute top-12 left-0 w-full flex flex-col items-center pointer-events-none">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-6xl font-serif italic text-warm-accent/20"
          >
            {score}
          </motion.div>
        </div>
      )}

      {/* UI Overlays */}
      <AnimatePresence>
        {gameState === 'START' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="z-10 flex flex-col items-center text-center p-8 glass rounded-[40px] apple-shadow max-w-sm"
          >
            <div className="w-20 h-20 bg-warm-gold rounded-full flex items-center justify-center mb-6 apple-shadow">
              <ArrowUp className="text-white w-10 h-10" />
            </div>
            <h1 className="text-4xl font-serif italic mb-2">FlappyBubble</h1>
            <p className="text-warm-accent/60 mb-8 text-sm uppercase tracking-widest font-medium">Minimalist Atmospheric Journey</p>
            
            <button 
              onClick={(e) => { e.stopPropagation(); resetGame(); }}
              className="group relative flex items-center gap-3 bg-warm-accent text-white px-8 py-4 rounded-full font-medium transition-all hover:scale-105 active:scale-95"
            >
              <Play className="w-5 h-5 fill-current" />
              Begin Journey
            </button>

            <div className="mt-8 flex items-center gap-6 text-warm-accent/40">
              <div className="flex flex-col items-center">
                <Info className="w-4 h-4 mb-1" />
                <span className="text-[10px] uppercase tracking-tighter">Space to Lift</span>
              </div>
              <div className="h-4 w-px bg-warm-accent/10" />
              <div className="flex flex-col items-center">
                <Trophy className="w-4 h-4 mb-1" />
                <span className="text-[10px] uppercase tracking-tighter">Best: {highScore}</span>
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'GAMEOVER' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="z-10 flex flex-col items-center text-center p-10 glass rounded-[40px] apple-shadow max-w-sm"
          >
            <h2 className="text-2xl font-serif italic mb-1 text-warm-accent/60">Journey Paused</h2>
            <div className="text-7xl font-serif italic mb-6 text-warm-accent">{score}</div>
            
            <div className="flex flex-col gap-3 w-full">
              <button 
                onClick={(e) => { e.stopPropagation(); resetGame(); }}
                className="flex items-center justify-center gap-3 bg-warm-accent text-white px-8 py-4 rounded-full font-medium transition-all hover:scale-105 active:scale-95"
              >
                <RotateCcw className="w-5 h-5" />
                Try Again
              </button>
              
              <div className="text-xs text-warm-accent/40 mt-4 uppercase tracking-widest">
                Best Distance: {highScore}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Orientation Warning (If needed) */}
      <div className="fixed bottom-4 left-4 text-[10px] text-warm-accent/20 uppercase tracking-[0.2em] font-medium hidden md:block">
        Designed for Focus & Flow
      </div>
    </div>
  );
}
