import { Box, Button, IconButton, Slider, Typography } from '@mui/material';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import QueueMusicIcon from '@mui/icons-material/QueueMusic';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { SongDetail } from '../types';

interface PlayerBarProps {
  song: SongDetail | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  queueCount: number;
  isScoreOpen: boolean;
  isQueueOpen: boolean;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onToggleScore: () => void;
  onToggleQueue: () => void;
  onToggleLoopMode: () => void;
  loopLabel: string;
  loopIcon: ReactNode;
  identifier?: string;
  analysisLabel?: string;
  pulse?: { token: number; decayMs: number } | null;
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return '0:00';
  }
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function PlayerBar({
  song,
  isPlaying,
  currentTime,
  duration,
  queueCount,
  isScoreOpen,
  isQueueOpen,
  onPlayPause,
  onPrev,
  onNext,
  onSeek,
  onToggleScore,
  onToggleQueue,
  onToggleLoopMode,
  loopLabel,
  loopIcon,
  identifier,
  analysisLabel,
  pulse,
}: PlayerBarProps) {
  const hasAudio = song?.hasAudio ?? false;
  const title = song?.titleText || 'Select a song';
  const subtitle = song ? (song.hasAudio ? '' : 'Audio missing') : '';
  const titleRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [marquee, setMarquee] = useState({ enabled: false, distance: 0, duration: 16 });
  const [pulseStyle, setPulseStyle] = useState<CSSProperties>({
    transform: 'scale(1)',
    transitionDuration: '300ms',
  });
  const pulseTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const update = () => {
      const container = titleRef.current;
      const text = textRef.current;
      if (!container || !text) {
        return;
      }
      const distance = Math.max(text.scrollWidth - container.clientWidth, 0);
      if (distance > 8) {
        const duration = Math.min(26, Math.max(14, distance / 18));
        setMarquee({ enabled: true, distance, duration });
      } else {
        setMarquee({ enabled: false, distance: 0, duration: 16 });
      }
    };

    update();
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(update);
      if (titleRef.current) {
        resizeObserver.observe(titleRef.current);
      }
      if (textRef.current) {
        resizeObserver.observe(textRef.current);
      }
    }

    window.addEventListener('resize', update);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [title]);

  useEffect(() => {
    if (!pulse) {
      return undefined;
    }
    if (pulseTimeoutRef.current) {
      window.clearTimeout(pulseTimeoutRef.current);
    }
    setPulseStyle({
      transform: 'scale(1.1)',
      transitionDuration: '50ms',
      boxShadow: '0 0 16px rgba(212, 106, 31, 0.35)',
    });
    pulseTimeoutRef.current = window.setTimeout(() => {
      setPulseStyle({
        transform: 'scale(1)',
        transitionDuration: `${Math.max(120, pulse.decayMs)}ms`,
        boxShadow: '0 0 0 rgba(212, 106, 31, 0)',
      });
    }, 50);
    return () => {
      if (pulseTimeoutRef.current) {
        window.clearTimeout(pulseTimeoutRef.current);
      }
    };
  }, [pulse?.token, pulse?.decayMs]);

  const marqueeStyle = marquee.enabled
    ? ({
        '--marquee-distance': `${marquee.distance}px`,
        animationDuration: `${marquee.duration}s`,
      } as React.CSSProperties)
    : undefined;

  return (
    <Box className="player-bar">
      <Box className="player-left">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={onPrev} disabled={!song} aria-label="Previous">
            <SkipPreviousIcon />
          </IconButton>
          <Box className="player-pulse" style={pulseStyle}>
            <IconButton onClick={onPlayPause} disabled={!song || !hasAudio} aria-label="Play">
              {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
            </IconButton>
          </Box>
          <IconButton onClick={onNext} disabled={!song} aria-label="Next">
            <SkipNextIcon />
          </IconButton>
        </Box>

        <Box className="player-title" ref={titleRef} onClick={song ? onToggleScore : undefined}>
          <Typography
            variant="subtitle1"
            component="span"
            className={marquee.enabled ? 'player-title-text marquee' : 'player-title-text'}
            ref={textRef}
            style={marqueeStyle}
            title={title}
          >
            {title}
          </Typography>
          {identifier && (
            <Typography variant="caption" className="player-title-id" color="text.secondary">
              {identifier}
            </Typography>
          )}
          {analysisLabel && (
            <Typography variant="caption" color="text.secondary">
              {analysisLabel}
            </Typography>
          )}
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>

      <Box className="player-slider">
        <Slider
          value={Math.min(currentTime, duration || 0)}
          min={0}
          max={duration || 0}
          step={1}
          onChange={(_, value) => onSeek(Array.isArray(value) ? value[0] : value)}
          disabled={!song || !hasAudio}
          aria-label="Seek"
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="caption">{formatTime(currentTime)}</Typography>
          <Typography variant="caption">{formatTime(duration)}</Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={loopIcon}
          onClick={onToggleLoopMode}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {loopLabel}
        </Button>
        <Button
          variant={isQueueOpen ? 'contained' : 'outlined'}
          startIcon={<QueueMusicIcon />}
          onClick={onToggleQueue}
        >
          Queue ({queueCount})
        </Button>
        <Button
          variant={isScoreOpen ? 'contained' : 'outlined'}
          startIcon={<ImageOutlinedIcon />}
          onClick={onToggleScore}
          disabled={!song}
        >
          Score
        </Button>
      </Box>
    </Box>
  );
}
