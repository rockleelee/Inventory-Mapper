import React, { useMemo, useState } from 'react';
import {
    CellData,
    MaterialSummary,
    cellHasContent,
    getMaterialColor,
    getCombinedCode,
} from '../types';

interface SummaryPanelProps {
    cells: Map<string, CellData>;
    isExpanded: boolean;
    onToggle: () => void;
}

export const SummaryPanel: React.FC<SummaryPanelProps> = ({
    cells,
    isExpanded,
    onToggle,
}) => {
    const [sortBy, setSortBy] = useState<'code' | 'quantity' | 'count'>('code');
    const [sortAsc, setSortAsc] = useState(true);

    // Aggregate materials from all cells (synchronous, pure function)
    const summaries = useMemo(() => {
        const materialMap = new Map<string, MaterialSummary>();

        cells.forEach((cell) => {
            if (!cellHasContent(cell) || !cell.code1) return;

            const combinedCode = getCombinedCode(cell);
            const existing = materialMap.get(combinedCode);

            if (existing) {
                existing.totalQuantity += cell.quantity;
                existing.cellCount += 1;
            } else {
                materialMap.set(combinedCode, {
                    code1: cell.code1,
                    code2: cell.code2,
                    code3: cell.code3,
                    combinedCode,
                    totalQuantity: cell.quantity,
                    cellCount: 1,
                });
            }
        });

        let result = Array.from(materialMap.values());

        // Sort
        result.sort((a, b) => {
            let comparison = 0;
            switch (sortBy) {
                case 'code':
                    comparison = a.combinedCode.localeCompare(b.combinedCode);
                    break;
                case 'quantity':
                    comparison = a.totalQuantity - b.totalQuantity;
                    break;
                case 'count':
                    comparison = a.cellCount - b.cellCount;
                    break;
            }
            return sortAsc ? comparison : -comparison;
        });

        return result;
    }, [cells, sortBy, sortAsc]);

    const totalQuantity = useMemo(() => {
        return summaries.reduce((sum, s) => sum + s.totalQuantity, 0);
    }, [summaries]);

    const handleSort = (newSortBy: 'code' | 'quantity' | 'count') => {
        if (sortBy === newSortBy) {
            setSortAsc(!sortAsc);
        } else {
            setSortBy(newSortBy);
            setSortAsc(true);
        }
    };

    return (
        <div className={`summary-panel ${isExpanded ? 'expanded' : 'collapsed'}`}>
            <button className="summary-toggle" onClick={onToggle}>
                {isExpanded ? '▶' : '◀'}
                <span className="toggle-label">
                    {isExpanded ? '' : `${summaries.length} materials`}
                </span>
            </button>

            {isExpanded && (
                <div className="summary-content">
                    <div className="summary-header">
                        <h3>Material Summary</h3>
                        <div className="summary-stats">
                            <span>{summaries.length} types</span>
                            <span>•</span>
                            <span>{totalQuantity} total</span>
                        </div>
                    </div>

                    <div className="summary-sort">
                        <button
                            className={sortBy === 'code' ? 'active' : ''}
                            onClick={() => handleSort('code')}
                        >
                            Code {sortBy === 'code' && (sortAsc ? '↑' : '↓')}
                        </button>
                        <button
                            className={sortBy === 'quantity' ? 'active' : ''}
                            onClick={() => handleSort('quantity')}
                        >
                            Qty {sortBy === 'quantity' && (sortAsc ? '↑' : '↓')}
                        </button>
                        <button
                            className={sortBy === 'count' ? 'active' : ''}
                            onClick={() => handleSort('count')}
                        >
                            Cells {sortBy === 'count' && (sortAsc ? '↑' : '↓')}
                        </button>
                    </div>

                    <div className="summary-list">
                        {summaries.length === 0 ? (
                            <div className="empty-summary">
                                No materials recorded yet
                            </div>
                        ) : (
                            summaries.map((summary) => {
                                // Get color dynamically from code1
                                const materialColor = getMaterialColor(summary.code1);
                                return (
                                    <div key={summary.combinedCode} className="summary-item">
                                        <div
                                            className="material-indicator"
                                            style={{ backgroundColor: materialColor.primary }}
                                        />
                                        <div className="material-info">
                                            <span
                                                className="material-code"
                                                style={{ color: materialColor.primary }}
                                            >
                                                {summary.combinedCode}
                                            </span>
                                            <span className="cell-count">
                                                {summary.cellCount} cell{summary.cellCount > 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        <div className="material-quantity">
                                            {summary.totalQuantity}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SummaryPanel;
