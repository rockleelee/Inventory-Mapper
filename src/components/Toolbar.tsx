import React, { useRef, useState } from 'react';

interface ToolbarProps {
    onClearAll: () => void;
    onExport: () => void;
    onImport: (data: string) => void;
    isSelectMode: boolean;
    onToggleSelectMode: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
    onClearAll,
    onExport,
    onImport,
    isSelectMode,
    onToggleSelectMode,
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleClearAll = () => {
        if (confirm('Clear all cell data? This cannot be undone.')) {
            onClearAll();
            setShowMenu(false);
        }
    };

    const handleExport = () => {
        onExport();
        setShowMenu(false);
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
        setShowMenu(false);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            onImport(text);
        } catch (error) {
            alert('Failed to read file');
        }

        // Reset input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="toolbar">
            <div className="toolbar-title">
                <span className="app-icon">📦</span>
                Inventory Mapper
            </div>

            <div className="toolbar-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input 
                        type="checkbox" 
                        checked={isSelectMode} 
                        onChange={onToggleSelectMode} 
                        style={{ cursor: 'pointer' }}
                    />
                    Multi-Select
                </label>

                <button
                    className="menu-btn"
                    onClick={() => setShowMenu(!showMenu)}
                >
                    ⋮
                </button>

                {showMenu && (
                    <>
                        <div className="menu-backdrop" onClick={() => setShowMenu(false)} />
                        <div className="dropdown-menu">
                            <button onClick={handleExport}>
                                <span>📤</span> Export Data
                            </button>
                            <button onClick={handleImportClick}>
                                <span>📥</span> Import Data
                            </button>
                            <div className="menu-divider" />
                            <button className="danger" onClick={handleClearAll}>
                                <span>🗑️</span> Clear All
                            </button>
                        </div>
                    </>
                )}

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                />
            </div>
        </div>
    );
};

export default Toolbar;
