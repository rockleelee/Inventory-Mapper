# Inventory Mapper

A React-based web application for field material inventory mapping that behaves like a simplified Excel-style grid, optimized for touch interaction on Android smartphones.

## Features

- **Excel-like Grid Layout**: Canvas-based rendering for smooth performance
- **Touch Gestures**: 
  - Pinch to zoom
  - Pan/scroll across grid
  - Tap to edit cell
  - Long press to drag cell
- **Cell Properties**:
  - Material code (e.g., "S5", "M12")
  - Quantity
  - Color indicator
  - Notes (with visual indicator)
- **Material Aggregation**: Side panel showing total quantities per material type
- **Offline-First**: Data persisted locally using IndexedDB
- **PWA Support**: Installable as a mobile app

## Tech Stack

- **React 18** with TypeScript
- **HTML Canvas** for grid rendering
- **Pointer Events API** for gesture handling
- **IndexedDB** (via idb library) for local persistence
- **Vite** as build tool
- **PWA** with service worker for offline support

## Setup

1. **Install Node.js** (if not already installed):
   - Download from https://nodejs.org/
   - Or use a package manager like nvm, chocolatey, etc.

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`

4. **Build for production**:
   ```bash
   npm run build
   npm run preview
   ```

## Usage

### Basic Operations

- **Tap a cell**: Opens the cell editor to input material code, quantity, and color
- **One-finger drag**: Pan across the grid
- **Pinch (two fingers)**: Zoom in/out
- **Long press on a cell with content**: Pick up the cell for drag-and-drop
- **Drag to another cell**: Move or swap cell data

### Cell Editor

- Enter a material code (auto-capitalized)
- Use +/- buttons or direct input for quantity
- Select a color from the palette
- Optionally add notes

### Summary Panel

- Click the arrow on the right edge to expand/collapse
- Shows all materials with aggregated quantities
- Sort by code, quantity, or cell count

### Data Management

- **Export**: Download all data as JSON file
- **Import**: Load data from a previously exported JSON file
- **Clear All**: Delete all cell data (requires confirmation)

## Mobile Usage

For the best experience on Android:

1. Open the app in Chrome
2. Use "Add to Home Screen" to install as PWA
3. Use in landscape orientation
4. The app works fully offline after first load

## Project Structure

```
src/
├── components/
│   ├── CanvasGrid.tsx    # Main grid with gesture handling
│   ├── CellEditor.tsx    # Modal for editing cell content
│   ├── SummaryPanel.tsx  # Material aggregation panel
│   └── Toolbar.tsx       # App header with menu
├── types.ts              # TypeScript interfaces and utilities
├── storage.ts            # IndexedDB operations
├── App.tsx               # Main application component
├── main.tsx              # React entry point
└── index.css             # Global styles
```

## License

MIT
