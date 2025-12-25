import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GripVertical, Plus, Music, Trash2 } from 'lucide-react';

const ITEM_HEIGHT = 64; // Height of each row in pixels
const GAP = 8; // Gap between items

// Procedural names for the "Game" aspect
const ADJECTIVES = ['Cosmic', 'Neon', 'Deep', 'Liquid', 'Astral', 'Midnight', 'Electric', 'Solar', 'Velvet', 'Cyber', 'Lost', 'Hidden'];
const NOUNS = ['Groove', 'Horizon', 'Voyage', 'Dreams', 'Memories', 'Static', 'Pulse', 'Waves', 'Echoes', 'Vibes', 'Signal', 'Frequency'];

const generateName = () => {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj} ${noun}`;
};

export default function PlaylistGame() {
  const [items, setItems] = useState([
    { id: '1', title: 'Cosmic Voyage', artist: 'Star Traveler', duration: '3:45' },
    { id: '2', title: 'Neon Pulse', artist: 'Synthwave Boy', duration: '2:20' },
    { id: '3', title: 'Midnight Echoes', artist: 'The Night Owls', duration: '4:12' },
  ]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  
  // Drag State
  const [dragState, setDragState] = useState(null); 
  // dragState structure: { 
  //   activeId: string, 
  //   startPageY: number, 
  //   currPageY: number, 
  //   draggingIds: string[], 
  //   originalIndices: number[] 
  // }

  const listRef = useRef(null);

  // --- Actions ---

  const addItem = () => {
    const newItem = {
      id: crypto.randomUUID(),
      title: generateName(),
      artist: 'Unknown Artist',
      duration: `${Math.floor(Math.random() * 3) + 2}:${Math.floor(Math.random() * 59).toString().padStart(2, '0')}`
    };
    setItems(prev => [newItem, ...prev]);
    // Scroll to top smoothly
    if (listRef.current) listRef.current.scrollTop = 0;
  };

  const deleteSelected = () => {
    if (selectedIds.size === 0) return;
    setItems(prev => prev.filter(item => !selectedIds.has(item.id)));
    setSelectedIds(new Set());
  };

  const toggleSelection = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // --- Drag & Drop Logic ---

  const handlePointerDown = (e, item) => {
    e.preventDefault();
    e.stopPropagation();

    const targetIsSelected = selectedIds.has(item.id);
    
    let draggingIds;
    // Create a new array to avoid mutating state indirectly via sort later
    if (targetIsSelected) {
      draggingIds = Array.from(selectedIds);
    } else {
      setSelectedIds(new Set([item.id]));
      draggingIds = [item.id];
    }

    // Capture initial state
    setDragState({
      activeId: item.id,
      startPageY: e.pageY,
      currPageY: e.pageY,
      draggingIds: draggingIds,
      // We sort dragged IDs by their current index to keep them in relative order
      // We clone draggingIds first to be safe
      draggingIdsSorted: [...draggingIds].sort((a, b) => {
        return items.findIndex(i => i.id === a) - items.findIndex(i => i.id === b);
      }),
      itemHeight: ITEM_HEIGHT + GAP
    });
  };

  // Global Pointer Events for Dragging
  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (e) => {
      setDragState(prev => ({ ...prev, currPageY: e.pageY }));
    };

    const handlePointerUp = (e) => {
      finishDrop();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragState]); // Removed 'items' dependency to prevent re-binding during drag which could cause jitters, though items shouldn't change during drag usually

  
  // Calculate the "Visual" state of the list during drag
  const { visualizationItems, dropIndex } = useMemo(() => {
    if (!dragState || !listRef.current) {
      return { visualizationItems: items, dropIndex: -1 };
    }

    const { currPageY, draggingIdsSorted, itemHeight } = dragState;
    const listRect = listRef.current.getBoundingClientRect();
    
    // Calculate where in the list we are hovering (relative to top of list container)
    // We adjust for scroll position
    const relativeY = currPageY - listRect.top + listRef.current.scrollTop;
    
    // Determine the index we are hovering over
    // We clamp it between 0 and (items.length - draggingIds.length)
    const remainingItemsCount = items.length - draggingIdsSorted.length;
    let hoverIndex = Math.floor(relativeY / itemHeight);
    
    // Clamp index
    if (hoverIndex < 0) hoverIndex = 0;
    if (hoverIndex > remainingItemsCount) hoverIndex = remainingItemsCount;

    // Construct the visual list:
    const remainingItems = items.filter(item => !dragState.draggingIds.includes(item.id));
    
    return { 
      visualizationItems: remainingItems, 
      dropIndex: hoverIndex 
    };

  }, [dragState, items]);


  const finishDrop = () => {
    if (!dragState) return;

    const { draggingIdsSorted } = dragState;
    
    // Re-calculate logic to be safe and deterministic on drop
    const listRect = listRef.current.getBoundingClientRect();
    const relativeY = dragState.currPageY - listRect.top + listRef.current.scrollTop;
    const itemHeight = dragState.itemHeight;
    const remainingItems = items.filter(item => !dragState.draggingIds.includes(item.id));
    
    let finalIndex = Math.floor(relativeY / itemHeight);
    if (finalIndex < 0) finalIndex = 0;
    if (finalIndex > remainingItems.length) finalIndex = remainingItems.length;

    // Reconstruct new array
    const newItems = [...remainingItems];
    
    // Get the actual item objects for the IDs being dragged
    const draggedItems = draggingIdsSorted.map(id => items.find(i => i.id === id)).filter(Boolean);
    
    // Splice them in
    newItems.splice(finalIndex, 0, ...draggedItems);

    setItems(newItems);
    setDragState(null);
  };


  // --- Render Helpers ---

  // Returns the visual list with a gap inserted for the items being dragged
  const getRenderList = () => {
    // FIX: Standardize return format so entry.data matches render expectations
    if (!dragState) {
      return items.map(item => ({ type: 'item', data: item }));
    }

    const list = [];
    
    // Use the memoized visualizationItems and dropIndex
    
    // Add items before drop index
    for (let i = 0; i < dropIndex; i++) {
      list.push({ type: 'item', data: visualizationItems[i] });
    }
    
    // Add Gap
    list.push({ type: 'gap', height: dragState.draggingIds.length * (ITEM_HEIGHT + GAP) });
    
    // Add items after drop index
    for (let i = dropIndex; i < visualizationItems.length; i++) {
      list.push({ type: 'item', data: visualizationItems[i] });
    }

    return list;
  };

  const renderList = getRenderList();


  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden select-none">
      
      {/* Header */}
      <div className="flex-none p-6 bg-slate-950 border-b border-slate-800 shadow-xl z-20">
        <div className="flex items-center justify-between max-w-2xl mx-auto w-full">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent flex items-center gap-2">
              <Music className="w-6 h-6 text-purple-400" />
              Sonic Stack
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {items.length} tracks • {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Drag handles to reorder'}
            </p>
          </div>
          
          <div className="flex gap-3">
             {selectedIds.size > 0 && (
              <button 
                onClick={deleteSelected}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 rounded-full hover:bg-red-500/20 transition-all active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}

            <button 
              onClick={addItem}
              className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-full font-semibold shadow-lg shadow-purple-500/20 transition-all active:scale-95"
            >
              <Plus className="w-5 h-5" />
              <span>Add Track</span>
            </button>
          </div>
        </div>
      </div>

      {/* List Container */}
      <div 
        ref={listRef}
        className="flex-1 overflow-y-auto overflow-x-hidden relative scroll-smooth"
      >
        <div className="max-w-2xl mx-auto w-full py-8 px-4 min-h-full">
          
          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-slate-600 border-2 border-dashed border-slate-800 rounded-2xl">
              <Music className="w-12 h-12 mb-4 opacity-20" />
              <p>Your playlist is empty.</p>
              <button onClick={addItem} className="text-purple-400 hover:underline mt-2">Add some tracks</button>
            </div>
          )}

          <div className="space-y-2 relative" style={{ paddingBottom: '100px' }}>
            {renderList.map((entry, index) => {
              if (entry.type === 'gap') {
                return (
                  <div 
                    key="gap" 
                    className="transition-all duration-200 ease-out border-2 border-dashed border-purple-500/30 rounded-xl bg-purple-500/5"
                    style={{ height: entry.height - GAP, marginBottom: GAP }}
                  />
                );
              }

              const item = entry.data;
              const isSelected = selectedIds.has(item.id);

              return (
                <div
                  key={item.id}
                  onClick={() => toggleSelection(item.id)}
                  className={`
                    group relative flex items-center justify-between p-4 rounded-xl border transition-all duration-200
                    ${isSelected 
                      ? 'bg-purple-900/20 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.1)] z-10' 
                      : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'
                    }
                  `}
                  style={{ 
                    height: ITEM_HEIGHT,
                    marginBottom: GAP
                  }}
                >
                  {/* Left: Checkbox/Icon & Info */}
                  <div className="flex items-center gap-4 flex-1 overflow-hidden">
                    <div 
                      className={`
                        w-5 h-5 rounded-full border flex items-center justify-center transition-colors
                        ${isSelected ? 'bg-purple-500 border-purple-500' : 'border-slate-600 group-hover:border-slate-400'}
                      `}
                    >
                      {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                    
                    <div className="flex flex-col overflow-hidden">
                      <span className={`font-medium truncate ${isSelected ? 'text-purple-200' : 'text-slate-200'}`}>
                        {item.title}
                      </span>
                      <span className="text-xs text-slate-500 truncate">{item.artist}</span>
                    </div>
                  </div>

                  {/* Right: Duration & Handle */}
                  <div className="flex items-center gap-4 pl-4">
                    <span className="text-sm text-slate-600 font-mono hidden sm:block">{item.duration}</span>
                    
                    <div 
                      onPointerDown={(e) => handlePointerDown(e, item)}
                      className={`
                        p-2 rounded-lg cursor-grab touch-none transition-colors
                        ${isSelected ? 'text-purple-300 hover:bg-purple-500/20' : 'text-slate-500 hover:bg-slate-700 hover:text-slate-300'}
                      `}
                    >
                      <GripVertical className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* DRAG OVERLAY (Ghost) 
        This is what follows the mouse cursor.
        It renders ALL selected items stacked.
      */}
      {dragState && (
        <div 
          className="fixed pointer-events-none z-50 flex flex-col gap-2"
          style={{
            top: 0,
            left: 0,
            width: listRef.current ? listRef.current.clientWidth - 32 : 300, // Match width mostly
            // We position the top-left of the ghost stack relative to the cursor
            // A simple approach is to center it vertically on the cursor, or keep the offset.
            // Let's keep the handle under the cursor. The handle is roughly at the right side.
            // To make it feel natural, we position the "active" item under the cursor.
            transform: `translate(${
              // Center horizontally in the list container for aesthetics
              (listRef.current?.getBoundingClientRect().left || 0) + 16
            }px, ${
              dragState.currPageY - (ITEM_HEIGHT / 2) // Center the active item on the cursor Y
            }px)`
          }}
        >
          {dragState.draggingIdsSorted.map((id, index) => {
             const item = items.find(i => i.id === id);
             if (!item) return null;
             
             // Stack effect: visual offset for multiple items
             // If dragging many, maybe only show first few?
             if (index > 4) return null; // Limit ghost size
             
             return (
               <div 
                 key={id}
                 className="flex items-center justify-between p-4 rounded-xl bg-slate-800 border border-purple-500 shadow-2xl shadow-purple-900/50 opacity-90 backdrop-blur-sm"
                 style={{ 
                   height: ITEM_HEIGHT,
                   // Stack them slightly if multiple
                   transform: index === 0 ? 'scale(1.05)' : `translateY(-${(ITEM_HEIGHT + GAP - 5) * index}px) scale(${1 - index * 0.02})`,
                   zIndex: 100 - index,
                 }}
               >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-5 h-5 rounded-full border bg-purple-500 border-purple-500 flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium text-purple-200">{item.title}</span>
                      <span className="text-xs text-slate-400">{item.artist}</span>
                    </div>
                  </div>
                  <GripVertical className="w-5 h-5 text-purple-300" />
               </div>
             );
          })}
          
          {/* Badge if dragging many */}
          {dragState.draggingIdsSorted.length > 5 && (
            <div className="absolute -right-4 -top-4 bg-purple-500 text-white font-bold rounded-full w-8 h-8 flex items-center justify-center shadow-lg animate-bounce">
              +{dragState.draggingIdsSorted.length - 5}
            </div>
          )}
        </div>
      )}
    </div>
  );
}