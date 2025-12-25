import { Box, Button, ButtonGroup, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useMemo, useState } from 'react';
import type { SongDetail } from '../types';

interface ScoreViewProps {
  song: SongDetail | null;
  onBack: () => void;
}

export default function ScoreView({ song, onBack }: ScoreViewProps) {
  const [zoom, setZoom] = useState(1);
  const scoreUrl = useMemo(() => {
    if (!song) {
      return '';
    }
    return `/api/songs/${encodeURIComponent(song.id)}/score`;
  }, [song]);

  const handleZoom = (delta: number) => {
    setZoom((prev) => Math.min(2, Math.max(0.6, Number((prev + delta).toFixed(2)))));
  };

  return (
    <Box className="score-view">
      <Box className="score-toolbar">
        <Button startIcon={<ArrowBackIcon />} onClick={onBack}>
          Back to list
        </Button>
        <ButtonGroup variant="outlined">
          <Button onClick={() => handleZoom(-0.1)}>
            <RemoveIcon fontSize="small" />
          </Button>
          <Button onClick={() => setZoom(1)}>Reset</Button>
          <Button onClick={() => handleZoom(0.1)}>
            <AddIcon fontSize="small" />
          </Button>
        </ButtonGroup>
        <Button
          variant="outlined"
          startIcon={<OpenInNewIcon />}
          onClick={() => window.open(scoreUrl, '_blank', 'noopener')}
          disabled={!song || !song.hasScore}
        >
          Open image
        </Button>
      </Box>

      <Box className="score-body">
        {!song && <div className="empty-state">Select a song to view its score.</div>}
        {song && !song.hasScore && (
          <div className="empty-state">Score not available for this song.</div>
        )}
        {song && song.hasScore && (
          <Box
            className="score-image-wrap"
            sx={{ transform: `scale(${zoom})` }}
          >
            <img
              className="score-image"
              src={scoreUrl}
              alt={song.titleText}
            />
          </Box>
        )}
        {song && song.hasScore && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
            Zoom: {Math.round(zoom * 100)}%
          </Typography>
        )}
      </Box>
    </Box>
  );
}
