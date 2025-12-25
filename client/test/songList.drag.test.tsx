import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SongList from '../src/components/SongList';
import theme from '../src/theme';
import type { SongSummary } from '../src/types';

vi.mock('react-virtualized-auto-sizer', () => ({
  default: ({ children }: { children: (size: { height: number; width: number }) => any }) =>
    children({ height: 600, width: 800 }),
}));

type RenderOptions = {
  disableRowClick?: boolean;
  withReorder?: boolean;
  onSelect?: (song: SongSummary) => void;
};

function song(id: string): SongSummary {
  return { id, titleText: `Song ${id}`, titleLines: [`Song ${id}`] };
}

function setRowRects(container: HTMLElement, rowHeight = 60) {
  const rows = Array.from(container.querySelectorAll('.song-row')) as HTMLElement[];
  rows.forEach((row, index) => {
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(
      ({
        top: index * rowHeight,
        bottom: (index + 1) * rowHeight,
        left: 0,
        right: 400,
        width: 400,
        height: rowHeight,
        x: 0,
        y: index * rowHeight,
        toJSON: () => {},
      }) as DOMRect,
    );
  });
  const list = container.querySelector('.song-list-outer') as HTMLElement | null;
  if (list) {
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(
      ({
        top: 0,
        bottom: rowHeight * rows.length,
        left: 0,
        right: 400,
        width: 400,
        height: rowHeight * rows.length,
        x: 0,
        y: 0,
        toJSON: () => {},
      }) as DOMRect,
    );
    Object.defineProperty(list, 'scrollTop', {
      value: 0,
      writable: true,
    });
    Object.defineProperty(list, 'scrollHeight', {
      value: rowHeight * rows.length,
      writable: true,
    });
    Object.defineProperty(list, 'clientHeight', {
      value: rowHeight * rows.length,
      writable: true,
    });
  }
  return rows;
}

function renderList(options: RenderOptions = {}) {
  const songs = [song('1'), song('2'), song('3'), song('4'), song('5')];
  const onReorder = options.withReorder === false ? undefined : vi.fn();
  const onSelect = options.onSelect ?? vi.fn();
  const utils = render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SongList
        songs={songs}
        activeId={null}
        highlightId={null}
        onSelect={onSelect}
        rowHeight={60}
        onReorder={onReorder}
        disableRowClick={options.disableRowClick}
      />
    </ThemeProvider>,
  );
  const rows = setRowRects(utils.container);
  const handles = utils.container.querySelectorAll('.song-row-handle');
  return { ...utils, rows, handles, onReorder, onSelect };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SongList drag basics', () => {
  it('drops after the row when crossing its midpoint', () => {
    const { rows, handles, onReorder } = renderList();
    const targetRow = rows[1];
    const rect = targetRow.getBoundingClientRect();

    fireEvent.pointerDown(handles[0], {
      button: 0,
      pointerId: 1,
      pageY: 5,
      clientY: 5,
      clientX: 10,
    });
    fireEvent.pointerMove(window, {
      pointerId: 1,
      pageY: rect.top + rect.height * 0.6,
      clientY: rect.top + rect.height * 0.6,
      clientX: 10,
    });
    fireEvent.pointerUp(window, {
      pointerId: 1,
      pageY: rect.top + rect.height * 0.6,
      clientY: rect.top + rect.height * 0.6,
      clientX: 10,
    });

    expect(onReorder).toHaveBeenCalledWith(['1'], 2);
  });

  it('moves the last item above the previous row when hovering its top half', () => {
    const { rows, handles, onReorder } = renderList();
    const targetRow = rows[3]; // row with id 4
    const rect = targetRow.getBoundingClientRect();

    fireEvent.pointerDown(handles[4], {
      button: 0,
      pointerId: 2,
      pageY: 5,
      clientY: 5,
      clientX: 10,
    });
    fireEvent.pointerMove(window, {
      pointerId: 2,
      pageY: rect.top + rect.height * 0.4,
      clientY: rect.top + rect.height * 0.4,
      clientX: 10,
    });
    fireEvent.pointerUp(window, {
      pointerId: 2,
      pageY: rect.top + rect.height * 0.4,
      clientY: rect.top + rect.height * 0.4,
      clientX: 10,
    });

    expect(onReorder).toHaveBeenCalledWith(['5'], 3);
  });

  it('uses the visible gap position when dropping inside the placeholder', () => {
    const { rows, handles, onReorder } = renderList();
    const rowHeight = 60;
    const gapTop = rows[0].getBoundingClientRect().bottom; // gap between first and second rows

    fireEvent.pointerDown(handles[4], {
      button: 0,
      pointerId: 3,
      pageY: 5,
      clientY: 5,
      clientX: 10,
    });
    // Drag into the second row to create a gap before it
    fireEvent.pointerMove(window, {
      pointerId: 3,
      pageY: gapTop + 5,
      clientY: gapTop + 5,
      clientX: 10,
    });
    // Release inside the gap (near its bottom edge)
    fireEvent.pointerMove(window, {
      pointerId: 3,
      pageY: gapTop + rowHeight - 5,
      clientY: gapTop + rowHeight - 5,
      clientX: 10,
    });
    fireEvent.pointerUp(window, {
      pointerId: 3,
      pageY: gapTop + rowHeight - 5,
      clientY: gapTop + rowHeight - 5,
      clientX: 10,
    });

    expect(onReorder).toHaveBeenCalledWith(['5'], 1);
  });

  it('keeps multi-selection ordering and drops at the correct end index', () => {
    const songs = [song('1'), song('2'), song('3'), song('4'), song('5')];
    const onReorder = vi.fn();
    const onToggleSelect = vi.fn();
    const utils = render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SongList
          songs={songs}
          activeId={null}
          highlightId={null}
          onSelect={() => {}}
          rowHeight={60}
          onReorder={onReorder}
          showCheckboxes
          selectedIds={new Set(['2', '3'])}
          onToggleSelect={onToggleSelect}
        />
      </ThemeProvider>,
    );
    const rows = setRowRects(utils.container);
    const handles = utils.container.querySelectorAll('.song-row-handle');

    fireEvent.pointerDown(handles[1], {
      button: 0,
      pointerId: 4,
      pageY: 80,
      clientY: 80,
      clientX: 10,
    });
    fireEvent.pointerMove(window, {
      pointerId: 4,
      pageY: 320,
      clientY: 320,
      clientX: 10,
    });
    fireEvent.pointerUp(window, {
      pointerId: 4,
      pageY: 320,
      clientY: 320,
      clientX: 10,
    });

    expect(onReorder).toHaveBeenCalledWith(['2', '3'], 5);
  });

  it('renders the drag overlay in a portal', () => {
    const { handles } = renderList();

    fireEvent.pointerDown(handles[0], {
      button: 0,
      pointerId: 5,
      pageY: 10,
      clientY: 10,
      clientX: 10,
    });

    const overlay = document.body.querySelector('.song-drag-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('Song 1');
  });
});

describe('SongList edit mode affordances', () => {
  it('hides drag handles when reordering is disabled', () => {
    const { container } = renderList({ withReorder: false });
    expect(container.querySelector('.song-row-handle')).toBeNull();
  });

  it('prevents playing rows when disableRowClick is true', () => {
    const { rows, onSelect } = renderList({ disableRowClick: true });
    fireEvent.click(rows[0]);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
