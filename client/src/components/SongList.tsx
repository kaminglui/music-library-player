import { Box, Checkbox, IconButton, ListItemButton, Typography } from '@mui/material';
import AutoSizer from 'react-virtualized-auto-sizer';
import {
  VariableSizeList,
  type ListChildComponentProps,
  type VariableSizeList as VariableSizeListType,
} from 'react-window';
import {
  forwardRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import type { SongSummary } from '../types';
import { formatSongIdentifier } from '../utils/playlist';

interface SongAction {
  icon: ReactNode;
  label: string;
  onClick: (song: SongSummary) => void;
  disabled?: (song: SongSummary) => boolean;
  hidden?: (song: SongSummary) => boolean;
}

interface SongListProps {
  songs: SongSummary[];
  activeId?: string | null;
  highlightId?: string | null;
  onSelect: (song: SongSummary) => void;
  rowHeight?: number;
  dense?: boolean;
  actions?: SongAction[];
  onReorder?: (fromIds: string[], toIndex: number) => void;
  onMove?: (songId: string, direction: 'up' | 'down') => void;
  reorderDisabled?: boolean;
  disableRowClick?: boolean;
  showCheckboxes?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (song: SongSummary) => void;
}

interface RowData {
  items: RenderItem[];
  activeId?: string | null;
  highlightId?: string | null;
  onSelect: (song: SongSummary) => void;
  dense?: boolean;
  actions?: SongAction[];
  songIndexById?: Map<string, number>;
  songsCount: number;
  rowHeight: number;
  showCheckboxes?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (song: SongSummary) => void;
  disableRowClick?: boolean;
  draggingSet?: Set<string>;
  onReorder?: (fromIds: string[], toIndex: number) => void;
  onMove?: (songId: string, direction: 'up' | 'down') => void;
  reorderDisabled?: boolean;
  onDragStart?: (
    event: ReactPointerEvent<HTMLElement>,
    song: SongSummary,
    rowElement: HTMLDivElement | null,
    isSelected: boolean,
    hasSelection: boolean,
  ) => void;
}

interface DragState {
  draggingIds: string[];
  draggingIdsSorted: string[];
  validOriginalIndices: number[];
  gapHeight: number;
  currPageY: number;
  grabOffsetY: number;
  pointerId: number;
  listLeft: number;
  listWidth: number;
}

type RenderItem = { type: 'song'; song: SongSummary } | { type: 'gap' };

const OuterElement = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function OuterElement(props, ref) {
    const style: CSSProperties = {
      ...props.style,
      overflowX: 'hidden',
      overflowY: 'auto',
    };
    const className = props.className
      ? `song-list-outer ${props.className}`
      : 'song-list-outer';
    return (
      <div
        {...props}
        ref={ref}
        style={style}
        className={className}
        role={props.role ?? 'list'}
      />
    );
  },
);

function Row({ index, style, data }: ListChildComponentProps<RowData>) {
  const entry = data.items[index];
  if (!entry) {
    return null;
  }

  if (entry.type === 'gap') {
    return (
      <div style={style} role="presentation" aria-hidden="true">
        <div
          className="song-drop-gap"
          style={{ height: '100%', pointerEvents: 'none' }}
          aria-hidden="true"
        />
      </div>
    );
  }

  const song = entry.song;
  const subtitle = formatSongIdentifier(song);
  const title = song.titleText || song.id;
  const songIndex = data.songIndexById?.get(song.id);
  const isHighlighted = data.highlightId === song.id;
  const isCurrent = data.activeId === song.id || isHighlighted;
  const rowRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRow = data.draggingSet?.has(song.id);
  const rowClassName = [
    'song-row',
    isHighlighted ? 'song-row-playing' : '',
    isDraggingRow ? 'song-row-dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const visibleActions = data.actions?.filter((action) => !action.hidden?.(song)) ?? [];
  const isSelectable = Boolean(data.showCheckboxes && data.onToggleSelect);
  const isSelected = Boolean(isSelectable && data.selectedIds?.has(song.id));
  const hasSelection = Boolean(data.selectedIds && data.selectedIds.size > 0);
  const canDrag = Boolean(data.onReorder);
  const canMove = Boolean(data.onMove);
  const isReorderDisabled = Boolean(data.reorderDisabled);
  const moveUpDisabled =
    isReorderDisabled || songIndex === undefined || songIndex <= 0;
  const moveDownDisabled =
    isReorderDisabled ||
    songIndex === undefined ||
    songIndex >= data.songsCount - 1;
  const allowClick = !data.disableRowClick;

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!canDrag || isReorderDisabled) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    data.onDragStart?.(event, song, rowRef.current, isSelected, hasSelection);
  };

  return (
    <div
      style={style}
      role="listitem"
      aria-current={isCurrent ? 'true' : undefined}
      aria-posinset={songIndex !== undefined ? songIndex + 1 : undefined}
      aria-setsize={data.songsCount}
    >
      <ListItemButton
        ref={rowRef}
        selected={data.activeId === song.id}
        onClick={() => {
          if (!allowClick) return;
          data.onSelect(song);
        }}
        className={rowClassName}
        sx={{ height: '100%', alignItems: 'center', gap: 1.5 }}
      >
        {data.showCheckboxes && (
          <Box className="song-row-select" onClick={(event) => event.stopPropagation()}>
            <Checkbox
              size="small"
              checked={isSelected}
              onChange={() => data.onToggleSelect?.(song)}
              inputProps={{ 'aria-label': `Select ${title}` }}
            />
          </Box>
        )}
        {canDrag && (
          <IconButton
            className={isReorderDisabled ? 'song-row-handle is-disabled' : 'song-row-handle'}
            size="small"
            aria-label={`Reorder ${title}`}
            disabled={isReorderDisabled}
            sx={{ touchAction: 'none' }}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={handlePointerDown}
          >
            <DragIndicatorIcon fontSize="small" aria-hidden="true" />
          </IconButton>
        )}
        {canMove && (
          <Box className="song-row-move">
            <IconButton
              className="song-row-move-button"
              size="small"
              aria-label={`Move up ${title}`}
              disabled={moveUpDisabled}
              onClick={(event) => {
                event.stopPropagation();
                data.onMove?.(song.id, 'up');
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <KeyboardArrowUpIcon fontSize="small" aria-hidden="true" />
            </IconButton>
            <IconButton
              className="song-row-move-button"
              size="small"
              aria-label={`Move down ${title}`}
              disabled={moveDownDisabled}
              onClick={(event) => {
                event.stopPropagation();
                data.onMove?.(song.id, 'down');
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <KeyboardArrowDownIcon fontSize="small" aria-hidden="true" />
            </IconButton>
          </Box>
        )}
        <Box className="song-row-slot" aria-hidden="true">
          <span
            className={
              isHighlighted ? 'song-row-indicator' : 'song-row-indicator is-placeholder'
            }
          />
        </Box>
        <Box className="song-row-content">
          <Typography
            variant={data.dense ? 'body2' : 'body1'}
            className="song-row-title"
            title={song.titleText}
          >
            {title}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            className="song-row-subtitle"
            title={subtitle}
          >
            {subtitle}
          </Typography>
        </Box>
        {visibleActions.length > 0 && (
          <Box className="song-row-actions">
            {visibleActions.map((action) => (
              <IconButton
                key={action.label}
                size="small"
                aria-label={action.label}
                onClick={(event) => {
                  event.stopPropagation();
                  action.onClick(song);
                }}
                disabled={action.disabled?.(song) ?? false}
              >
                {action.icon}
              </IconButton>
            ))}
          </Box>
        )}
      </ListItemButton>
    </div>
  );
}

export default function SongList({
  songs,
  activeId,
  highlightId,
  onSelect,
  rowHeight = 64,
  dense = false,
  actions,
  onReorder,
  onMove,
  reorderDisabled = false,
  disableRowClick = false,
  showCheckboxes = false,
  selectedIds,
  onToggleSelect,
}: SongListProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [dropVisualIndex, setDropVisualIndex] = useState<number | null>(null);
  const dropOriginalIndexRef = useRef<number | null>(null);
  const latestDropVisualIndexRef = useRef<number | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const pointerMoveFrameRef = useRef<number | null>(null);
  const latestPointerYRef = useRef<number | null>(null);
  const needsListResetRef = useRef(false);
  const listRef = useRef<VariableSizeListType | null>(null);
  const outerRef = useRef<HTMLDivElement | null>(null);

  const draggingSet = useMemo(
    () => new Set(dragState?.draggingIds ?? []),
    [dragState?.draggingIds],
  );
  const isDragging = Boolean(dragState);
  const canReorder = Boolean(onReorder);
  const songIndexById = useMemo(
    () => new Map(songs.map((song, index) => [song.id, index])),
    [songs],
  );

  const visualizationItems = useMemo(
    () => songs.filter((song) => !draggingSet.has(song.id)),
    [draggingSet, songs],
  );

  const renderItems = useMemo<RenderItem[]>(() => {
    if (!dragState || !canReorder || dropVisualIndex === null) {
      return songs.map((song) => ({ type: 'song', song }));
    }
    const before = visualizationItems
      .slice(0, dropVisualIndex)
      .map((song) => ({ type: 'song', song } as RenderItem));
    const after = visualizationItems
      .slice(dropVisualIndex)
      .map((song) => ({ type: 'song', song } as RenderItem));
    return [...before, { type: 'gap' }, ...after];
  }, [canReorder, dragState?.draggingIds, dropVisualIndex, songs, visualizationItems]);

  const gapHeight = dragState?.gapHeight ?? rowHeight;
  const ghostSongs = useMemo(
    () =>
      dragState?.draggingIdsSorted
        .map((id) => songs.find((song) => song.id === id))
        .filter(Boolean) as SongSummary[] | undefined,
    [dragState?.draggingIdsSorted, songs],
  );

  const computeDropPosition = useCallback(
    (
      clientY: number,
      currentGapVisualIndexParam?: number | null,
    ): { visualIndex: number; originalIndex: number } | null => {
      const listEl = outerRef.current;
      const currentDragState = dragStateRef.current;

      if (!listEl || !currentDragState) {
        return null;
      }

      const rect = listEl.getBoundingClientRect();
      const rawY = clientY - rect.top + listEl.scrollTop;
      const { validOriginalIndices, gapHeight: localGapHeight } = currentDragState;

      const currentGapVisualIndex =
        currentGapVisualIndexParam ?? latestDropVisualIndexRef.current ?? 0;

      const gapTop = currentGapVisualIndex * rowHeight;
      const gapBottom = gapTop + localGapHeight;

      let effectiveY = rawY;

      if (rawY >= gapTop && rawY <= gapBottom) {
        const originalIndex = currentGapVisualIndex < validOriginalIndices.length
          ? validOriginalIndices[currentGapVisualIndex]
          : songs.length;
        return { visualIndex: currentGapVisualIndex, originalIndex };
      }

      if (rawY > gapBottom) {
        effectiveY = rawY - localGapHeight;
      }

      const rawRowIndex = Math.floor(effectiveY / rowHeight);
      const rowOffset = effectiveY % rowHeight;

      let targetVisualIndex = rawRowIndex;
      if (rowOffset > rowHeight / 2) {
        targetVisualIndex += 1;
      }

      if (targetVisualIndex < 0) targetVisualIndex = 0;
      if (targetVisualIndex > validOriginalIndices.length) {
        targetVisualIndex = validOriginalIndices.length;
      }

      const originalIndex = targetVisualIndex < validOriginalIndices.length
        ? validOriginalIndices[targetVisualIndex]
        : songs.length;

      return { visualIndex: targetVisualIndex, originalIndex };
    },
    [rowHeight, songs.length],
  );

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    if (!dragState) {
      listRef.current?.resetAfterIndex(0, false);
    }
  }, [dragState]);

  const handleDragStart = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      song: SongSummary,
      rowElement: HTMLDivElement | null,
      isSelected: boolean,
      hasSelection: boolean,
    ) => {
      if (!canReorder) return;
      if (event.button !== 0) return;
      const listEl = outerRef.current;
      if (!listEl) return;
      event.preventDefault();
      event.stopPropagation();

      const dragIds =
        showCheckboxes && hasSelection && isSelected
          ? Array.from(selectedIds ?? [])
          : [song.id];
      const dragIdsSorted = [...dragIds].sort(
        (a, b) =>
          songs.findIndex((item) => item.id === a) - songs.findIndex((item) => item.id === b),
      );
      const dragSet = new Set(dragIds);

      const validOriginalIndices: number[] = [];
      songs.forEach((s, idx) => {
        if (!dragSet.has(s.id)) {
          validOriginalIndices.push(idx);
        }
      });
      const calculatedGapHeight = Math.max(rowHeight, dragIds.length * rowHeight);

      const firstDraggedId = dragIdsSorted[0];
      const firstOriginalIndex = songs.findIndex((item) => item.id === firstDraggedId);

      let visualIndexAtStart = 0;
      if (firstOriginalIndex !== -1) {
        for (let i = 0; i < firstOriginalIndex; i += 1) {
          if (!dragSet.has(songs[i].id)) visualIndexAtStart += 1;
        }
      }

      const rowRect = rowElement?.getBoundingClientRect();
      const listRect = listEl.getBoundingClientRect();

      const nextState: DragState = {
        draggingIds: dragIds,
        draggingIdsSorted: dragIdsSorted,
        validOriginalIndices,
        gapHeight: calculatedGapHeight,
        currPageY: event.clientY,
        grabOffsetY: rowRect ? event.clientY - rowRect.top : rowHeight / 2,
        pointerId: event.pointerId,
        listLeft: rowRect?.left ?? listRect.left,
        listWidth: rowRect?.width ?? listRect.width,
      };
      dragStateRef.current = nextState;
      latestPointerYRef.current = event.clientY;
      needsListResetRef.current = false;
      setDragState(nextState);
      listRef.current?.resetAfterIndex(0, false);
      setDropVisualIndex(visualIndexAtStart);
      latestDropVisualIndexRef.current = visualIndexAtStart;
      dropOriginalIndexRef.current = firstOriginalIndex === -1 ? null : firstOriginalIndex;
    },
    [canReorder, rowHeight, selectedIds, showCheckboxes, songs],
  );

  useEffect(() => {
    if (!isDragging) return;

    const scrollZone = 56;
    const scrollSpeed = 12;

    const cancelAutoScroll = () => {
      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
    };

    const cancelPointerMoveFrame = () => {
      if (pointerMoveFrameRef.current !== null) {
        cancelAnimationFrame(pointerMoveFrameRef.current);
        pointerMoveFrameRef.current = null;
      }
    };

    const stepAutoScroll = () => {
      const current = dragStateRef.current;
      const listEl = outerRef.current;
      if (!current || !listEl) {
        cancelAutoScroll();
        return;
      }

      const rect = listEl.getBoundingClientRect();
      const zoneTop = rect.top + scrollZone;
      const zoneBottom = rect.bottom - scrollZone;
      let delta = 0;
      if (current.currPageY < zoneTop) {
        delta = -scrollSpeed;
      } else if (current.currPageY > zoneBottom) {
        delta = scrollSpeed;
      }

      if (delta === 0) {
        cancelAutoScroll();
        return;
      }

      const maxScrollTop = listEl.scrollHeight - listEl.clientHeight;
      if (maxScrollTop <= 0) {
        cancelAutoScroll();
        return;
      }
      const nextScrollTop = Math.max(0, Math.min(listEl.scrollTop + delta, maxScrollTop));
      if (nextScrollTop === listEl.scrollTop) {
        cancelAutoScroll();
        return;
      }
      listEl.scrollTop = nextScrollTop;

      const drop = computeDropPosition(current.currPageY, latestDropVisualIndexRef.current);
      if (drop) {
        if (drop.visualIndex !== latestDropVisualIndexRef.current) {
          latestDropVisualIndexRef.current = drop.visualIndex;
          listRef.current?.resetAfterIndex(0, false);
        }
        setDropVisualIndex((prev) =>
          prev === drop.visualIndex ? prev : drop.visualIndex,
        );
        dropOriginalIndexRef.current = drop.originalIndex;
      }

      autoScrollFrameRef.current = requestAnimationFrame(stepAutoScroll);
    };

    const updateAutoScroll = (clientY: number) => {
      const listEl = outerRef.current;
      if (!listEl) return;
      const rect = listEl.getBoundingClientRect();
      const inZone = clientY < rect.top + scrollZone || clientY > rect.bottom - scrollZone;
      if (!inZone) {
        cancelAutoScroll();
        return;
      }
      if (autoScrollFrameRef.current === null) {
        autoScrollFrameRef.current = requestAnimationFrame(stepAutoScroll);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const current = dragStateRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const nextState = { ...current, currPageY: event.clientY };
      dragStateRef.current = nextState;
      latestPointerYRef.current = event.clientY;
      const drop = computeDropPosition(event.clientY, latestDropVisualIndexRef.current);
      if (drop) {
        if (drop.visualIndex !== latestDropVisualIndexRef.current) {
          latestDropVisualIndexRef.current = drop.visualIndex;
          needsListResetRef.current = true;
        }
        dropOriginalIndexRef.current = drop.originalIndex;
      }
      updateAutoScroll(event.clientY);
      if (pointerMoveFrameRef.current === null) {
        pointerMoveFrameRef.current = requestAnimationFrame(() => {
          pointerMoveFrameRef.current = null;
          const latest = dragStateRef.current;
          if (!latest) {
            return;
          }
          setDragState((prev) =>
            prev && prev.currPageY === latest.currPageY ? prev : latest,
          );
          if (latestDropVisualIndexRef.current !== null) {
            setDropVisualIndex((prev) =>
              prev === latestDropVisualIndexRef.current
                ? prev
                : latestDropVisualIndexRef.current,
            );
          }
          if (needsListResetRef.current) {
            listRef.current?.resetAfterIndex(0, false);
            needsListResetRef.current = false;
          }
        });
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      const current = dragStateRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      cancelAutoScroll();
      cancelPointerMoveFrame();
      const finalClientY = latestPointerYRef.current ?? current.currPageY;
      const finalDrop = computeDropPosition(finalClientY, latestDropVisualIndexRef.current);
      const targetIndex = finalDrop?.originalIndex ?? dropOriginalIndexRef.current;
      if (targetIndex !== null && targetIndex !== undefined && canReorder) {
        onReorder?.(current.draggingIdsSorted, targetIndex);
      }
      dragStateRef.current = null;
      setDragState(null);
      setDropVisualIndex(null);
      latestDropVisualIndexRef.current = null;
      dropOriginalIndexRef.current = null;
      latestPointerYRef.current = null;
      needsListResetRef.current = false;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      cancelAutoScroll();
      cancelPointerMoveFrame();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [canReorder, computeDropPosition, isDragging, onReorder]);

  const getItemSize = useCallback(
    (index: number) => (renderItems[index]?.type === 'gap' ? gapHeight : rowHeight),
    [gapHeight, renderItems, rowHeight],
  );

  const itemKey = useCallback(
    (index: number) =>
      renderItems[index]?.type === 'gap' ? '__gap__' : renderItems[index]?.song.id ?? index,
    [renderItems],
  );

  const itemCount = renderItems.length;
  const itemData = useMemo(
    () => ({
      items: renderItems,
      activeId,
      highlightId,
      onSelect,
      dense,
      actions,
      songIndexById,
      songsCount: songs.length,
      rowHeight,
      showCheckboxes,
      selectedIds,
      onToggleSelect,
      onReorder,
      onMove,
      reorderDisabled,
      disableRowClick,
      draggingSet,
      onDragStart: handleDragStart,
    }),
    [
      actions,
      activeId,
      dense,
      disableRowClick,
      draggingSet,
      handleDragStart,
      highlightId,
      onMove,
      onReorder,
      onSelect,
      onToggleSelect,
      reorderDisabled,
      renderItems,
      rowHeight,
      songIndexById,
      songs.length,
      selectedIds,
      showCheckboxes,
    ],
  );
  const portalTarget = typeof document === 'undefined' ? null : document.body;
  const dragOverlayOffsetY = dragState
    ? dragState.currPageY - dragState.grabOffsetY
    : 0;

  return (
    <div className={isDragging ? 'song-list-root is-dragging' : 'song-list-root'}>
      <AutoSizer>
        {({ height, width }) => (
          <VariableSizeList
            ref={listRef}
            height={height}
            width={width}
            itemCount={itemCount}
            itemSize={getItemSize}
            itemKey={itemKey}
            outerRef={outerRef}
            itemData={itemData}
            outerElementType={OuterElement}
          >
            {Row}
          </VariableSizeList>
        )}
      </AutoSizer>
      {portalTarget &&
        isDragging &&
        canReorder &&
        dragState &&
        ghostSongs &&
        ghostSongs.length > 0 &&
        createPortal(
          <div
            className="song-drag-overlay"
            style={{
              transform: `translate3d(${dragState.listLeft}px, ${dragOverlayOffsetY}px, 0)`,
              width: dragState.listWidth,
              pointerEvents: 'none',
            }}
          >
            {ghostSongs.slice(0, 4).map((song, index) => (
              <div
                key={song.id}
                className="song-drag-ghost"
                style={{
                  transform: `translate3d(${index * 6}px, ${index * 6}px, 0)`,
                  zIndex: ghostSongs.length - index,
                }}
              >
                <div className="song-drag-ghost-content">
                  <div className="song-drag-ghost-title">{song.titleText || song.id}</div>
                  <div className="song-drag-ghost-subtitle">
                    {formatSongIdentifier(song)}
                  </div>
                </div>
                <DragIndicatorIcon fontSize="small" />
              </div>
            ))}
            {ghostSongs.length > 4 && (
              <div className="song-drag-ghost-badge">+{ghostSongs.length - 4}</div>
            )}
          </div>,
          portalTarget,
        )}
    </div>
  );
}
