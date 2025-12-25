/**
 * Region Editor Module
 * Handles interactive selection, editing, and management of text/image regions
 * Features: create, select, move, resize, type toggle, and bidirectional highlighting
 */

export class RegionEditor {
    constructor(canvas, overlayCanvas) {
        this.canvas = canvas;
        this.overlayCanvas = overlayCanvas;
        this.ctx = overlayCanvas.getContext('2d');

        // Current creation mode: 'text' or 'image'
        this.mode = 'text';

        // Regions per page: { pageNum: [{ type, x, y, width, height, id, number }] }
        this.regions = {};

        // Current page
        this.currentPage = 1;

        // Interaction state
        this.interactionMode = 'create'; // 'create', 'move', 'resize'
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.dragEnd = { x: 0, y: 0 };

        // Selected region for editing
        this.selectedRegionId = null;
        this.resizeHandle = null; // 'nw', 'ne', 'sw', 'se', or null

        // Region counters
        this.regionIdCounter = 0;
        this.textCounter = 0;
        this.imageCounter = 0;

        // Highlighted region (from list click)
        this.highlightedRegionId = null;

        // Callbacks
        this.onRegionChange = null;
        this.onRegionClick = null;
        this.onPageChangeRequest = null;

        // Constants
        this.HANDLE_SIZE = 10;
        this.MIN_REGION_SIZE = 20;

        // Bind event handlers
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);

        this.setupEvents();
    }

    setupEvents() {
        this.overlayCanvas.addEventListener('mousedown', this.handleMouseDown);
        this.overlayCanvas.addEventListener('mousemove', this.handleMouseMove);
        this.overlayCanvas.addEventListener('mouseup', this.handleMouseUp);
        this.overlayCanvas.addEventListener('mouseleave', this.handleMouseUp);

        // Keyboard events (on document to capture Delete key)
        document.addEventListener('keydown', this.handleKeyDown);
    }

    destroy() {
        this.overlayCanvas.removeEventListener('mousedown', this.handleMouseDown);
        this.overlayCanvas.removeEventListener('mousemove', this.handleMouseMove);
        this.overlayCanvas.removeEventListener('mouseup', this.handleMouseUp);
        this.overlayCanvas.removeEventListener('mouseleave', this.handleMouseUp);
        document.removeEventListener('keydown', this.handleKeyDown);
    }

    handleKeyDown(e) {
        // Delete selected region with Delete or Backspace key
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedRegionId) {
            // Prevent browser back navigation on Backspace
            e.preventDefault();

            console.log(`[RegionEditor] Deleting region ${this.selectedRegionId} via keyboard`);
            this.removeRegion(this.selectedRegionId);
        }
    }

    setMode(mode) {
        this.mode = mode;
        console.log(`[RegionEditor] Mode set to: ${mode}`);
    }

    setPage(pageNum) {
        this.currentPage = pageNum;
        this.selectedRegionId = null;
        this.highlightedRegionId = null;
        this.render();
    }

    syncSize() {
        this.overlayCanvas.width = this.canvas.width;
        this.overlayCanvas.height = this.canvas.height;
        this.render();
    }

    // ===== Selection & Highlighting =====

    selectRegion(regionId) {
        this.selectedRegionId = regionId;
        this.highlightedRegionId = regionId;
        this.render();

        if (this.onRegionClick) {
            const region = this.findRegionById(regionId);
            if (region) {
                this.onRegionClick(region);
            }
        }
    }

    highlightRegion(regionId) {
        this.highlightedRegionId = regionId;
        this.selectedRegionId = regionId;

        // Navigate to the page containing this region
        for (const pageNum in this.regions) {
            const region = this.regions[pageNum].find(r => r.id === regionId);
            if (region && parseInt(pageNum) !== this.currentPage) {
                if (this.onPageChangeRequest) {
                    this.onPageChangeRequest(parseInt(pageNum));
                }
                return;
            }
        }

        this.render();

        // Clear highlight after 2 seconds (but keep selection)
        setTimeout(() => {
            if (this.highlightedRegionId === regionId) {
                this.highlightedRegionId = null;
                this.render();
            }
        }, 2000);
    }

    findRegionById(regionId) {
        for (const pageNum in this.regions) {
            const region = this.regions[pageNum].find(r => r.id === regionId);
            if (region) return { ...region, pageNum: parseInt(pageNum) };
        }
        return null;
    }

    // ===== Type Toggle =====

    toggleRegionType(regionId) {
        for (const pageNum in this.regions) {
            const region = this.regions[pageNum].find(r => r.id === regionId);
            if (region) {
                const oldType = region.type;
                region.type = region.type === 'text' ? 'image' : 'text';

                // Update numbering
                if (oldType === 'text') {
                    region.number = ++this.imageCounter;
                } else {
                    region.number = ++this.textCounter;
                }

                console.log(`[RegionEditor] Toggled region ${regionId} from ${oldType} to ${region.type}`);
                this.render();

                if (this.onRegionChange) {
                    this.onRegionChange(this.getAllRegions());
                }
                return;
            }
        }
    }

    // ===== Mouse Event Handlers =====

    handleMouseDown(e) {
        const rect = this.overlayCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.dragStart = { x, y };
        this.dragEnd = { x, y };

        // Check if clicking on resize handle of selected region
        if (this.selectedRegionId) {
            const selectedRegion = this.getCurrentPageRegions().find(r => r.id === this.selectedRegionId);
            if (selectedRegion) {
                const handle = this.getResizeHandle(selectedRegion, x, y);
                if (handle) {
                    this.interactionMode = 'resize';
                    this.resizeHandle = handle;
                    this.isDragging = true;
                    this.overlayCanvas.style.cursor = this.getResizeCursor(handle);
                    return;
                }

                // Check if clicking inside selected region (move)
                if (this.isPointInRegion(x, y, selectedRegion)) {
                    this.interactionMode = 'move';
                    this.isDragging = true;
                    this.overlayCanvas.style.cursor = 'move';
                    return;
                }
            }
        }

        // Check if clicking on any region (select it)
        const clickedRegion = this.getRegionAt(x, y);
        if (clickedRegion) {
            this.selectRegion(clickedRegion.id);
            return;
        }

        // Otherwise, start creating a new region
        this.selectedRegionId = null;
        this.interactionMode = 'create';
        this.isDragging = true;
        this.overlayCanvas.style.cursor = 'crosshair';
    }

    handleMouseMove(e) {
        const rect = this.overlayCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Update cursor based on hover
        if (!this.isDragging) {
            this.updateCursor(x, y);
        }

        if (!this.isDragging) return;

        const dx = x - this.dragEnd.x;
        const dy = y - this.dragEnd.y;
        this.dragEnd = { x, y };

        if (this.interactionMode === 'move' && this.selectedRegionId) {
            this.moveSelectedRegion(dx, dy);
        } else if (this.interactionMode === 'resize' && this.selectedRegionId) {
            this.resizeSelectedRegion(x, y);
        }

        this.render();
    }

    handleMouseUp(e) {
        if (!this.isDragging) return;

        this.isDragging = false;
        this.overlayCanvas.style.cursor = 'default';

        if (this.interactionMode === 'create') {
            const bounds = this.calculateBounds(this.dragStart, this.dragEnd);
            if (bounds.width > this.MIN_REGION_SIZE && bounds.height > this.MIN_REGION_SIZE) {
                this.addRegion(bounds);
            }
        }

        this.interactionMode = 'create';
        this.resizeHandle = null;
        this.render();
    }

    // ===== Cursor Management =====

    updateCursor(x, y) {
        if (this.selectedRegionId) {
            const selectedRegion = this.getCurrentPageRegions().find(r => r.id === this.selectedRegionId);
            if (selectedRegion) {
                const handle = this.getResizeHandle(selectedRegion, x, y);
                if (handle) {
                    this.overlayCanvas.style.cursor = this.getResizeCursor(handle);
                    return;
                }
                if (this.isPointInRegion(x, y, selectedRegion)) {
                    this.overlayCanvas.style.cursor = 'move';
                    return;
                }
            }
        }

        const hoveredRegion = this.getRegionAt(x, y);
        this.overlayCanvas.style.cursor = hoveredRegion ? 'pointer' : 'crosshair';
    }

    getResizeCursor(handle) {
        const cursors = { nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize' };
        return cursors[handle] || 'default';
    }

    // ===== Region Manipulation =====

    moveSelectedRegion(dx, dy) {
        const regions = this.getCurrentPageRegions();
        const region = regions.find(r => r.id === this.selectedRegionId);
        if (region) {
            region.x = Math.max(0, Math.min(this.overlayCanvas.width - region.width, region.x + dx));
            region.y = Math.max(0, Math.min(this.overlayCanvas.height - region.height, region.y + dy));

            if (this.onRegionChange) {
                this.onRegionChange(this.getAllRegions());
            }
        }
    }

    resizeSelectedRegion(mouseX, mouseY) {
        const regions = this.getCurrentPageRegions();
        const region = regions.find(r => r.id === this.selectedRegionId);
        if (!region) return;

        const minSize = this.MIN_REGION_SIZE;

        switch (this.resizeHandle) {
            case 'nw':
                const newWidthNW = region.x + region.width - mouseX;
                const newHeightNW = region.y + region.height - mouseY;
                if (newWidthNW > minSize) {
                    region.width = newWidthNW;
                    region.x = mouseX;
                }
                if (newHeightNW > minSize) {
                    region.height = newHeightNW;
                    region.y = mouseY;
                }
                break;
            case 'ne':
                region.width = Math.max(minSize, mouseX - region.x);
                const newHeightNE = region.y + region.height - mouseY;
                if (newHeightNE > minSize) {
                    region.height = newHeightNE;
                    region.y = mouseY;
                }
                break;
            case 'sw':
                const newWidthSW = region.x + region.width - mouseX;
                if (newWidthSW > minSize) {
                    region.width = newWidthSW;
                    region.x = mouseX;
                }
                region.height = Math.max(minSize, mouseY - region.y);
                break;
            case 'se':
                region.width = Math.max(minSize, mouseX - region.x);
                region.height = Math.max(minSize, mouseY - region.y);
                break;
        }

        if (this.onRegionChange) {
            this.onRegionChange(this.getAllRegions());
        }
    }

    // ===== Hit Testing =====

    isPointInRegion(x, y, region) {
        return x >= region.x && x <= region.x + region.width &&
            y >= region.y && y <= region.y + region.height;
    }

    getRegionAt(x, y) {
        const regions = this.getCurrentPageRegions();
        for (let i = regions.length - 1; i >= 0; i--) {
            if (this.isPointInRegion(x, y, regions[i])) {
                return regions[i];
            }
        }
        return null;
    }

    getResizeHandle(region, x, y) {
        const handles = this.getHandlePositions(region);
        for (const [name, pos] of Object.entries(handles)) {
            if (Math.abs(x - pos.x) < this.HANDLE_SIZE && Math.abs(y - pos.y) < this.HANDLE_SIZE) {
                return name;
            }
        }
        return null;
    }

    getHandlePositions(region) {
        return {
            nw: { x: region.x, y: region.y },
            ne: { x: region.x + region.width, y: region.y },
            sw: { x: region.x, y: region.y + region.height },
            se: { x: region.x + region.width, y: region.y + region.height }
        };
    }

    // ===== Region CRUD =====

    calculateBounds(start, end) {
        return {
            x: Math.min(start.x, end.x),
            y: Math.min(start.y, end.y),
            width: Math.abs(end.x - start.x),
            height: Math.abs(end.y - start.y)
        };
    }

    addRegion(bounds) {
        if (!this.regions[this.currentPage]) {
            this.regions[this.currentPage] = [];
        }

        const number = this.mode === 'text' ? ++this.textCounter : ++this.imageCounter;

        const region = {
            id: ++this.regionIdCounter,
            type: this.mode,
            number: number,
            ...bounds,
            canvasWidth: this.overlayCanvas.width,
            canvasHeight: this.overlayCanvas.height
        };

        this.regions[this.currentPage].push(region);
        this.selectedRegionId = region.id;

        console.log(`[RegionEditor] Added ${this.mode} #${number} on page ${this.currentPage}`);

        if (this.onRegionChange) {
            this.onRegionChange(this.getAllRegions());
        }
    }

    removeRegion(regionId) {
        for (const pageNum in this.regions) {
            this.regions[pageNum] = this.regions[pageNum].filter(r => r.id !== regionId);
        }
        if (this.selectedRegionId === regionId) {
            this.selectedRegionId = null;
        }
        this.render();

        if (this.onRegionChange) {
            this.onRegionChange(this.getAllRegions());
        }
    }

    clearCurrentPage() {
        this.regions[this.currentPage] = [];
        this.selectedRegionId = null;
        this.render();

        if (this.onRegionChange) {
            this.onRegionChange(this.getAllRegions());
        }
    }

    clearAll() {
        this.regions = {};
        this.textCounter = 0;
        this.imageCounter = 0;
        this.selectedRegionId = null;
        this.render();

        if (this.onRegionChange) {
            this.onRegionChange(this.getAllRegions());
        }
    }

    getCurrentPageRegions() {
        return this.regions[this.currentPage] || [];
    }

    getAllRegions() {
        return this.regions;
    }

    hasRegions() {
        return Object.values(this.regions).some(arr => arr.length > 0);
    }

    // ===== Rendering =====

    render() {
        const ctx = this.ctx;
        const width = this.overlayCanvas.width;
        const height = this.overlayCanvas.height;

        ctx.clearRect(0, 0, width, height);

        const pageRegions = this.getCurrentPageRegions();
        for (const region of pageRegions) {
            const isSelected = region.id === this.selectedRegionId;
            const isHighlighted = region.id === this.highlightedRegionId;
            this.drawRegion(region, isSelected, isHighlighted);
        }

        // Draw selection rectangle while creating
        if (this.isDragging && this.interactionMode === 'create') {
            const bounds = this.calculateBounds(this.dragStart, this.dragEnd);
            this.drawSelectionRect(bounds, this.mode);
        }
    }

    drawRegion(region, isSelected = false, isHighlighted = false) {
        const ctx = this.ctx;
        const isText = region.type === 'text';

        // Fill color
        let alpha = 0.15;
        if (isSelected) alpha = 0.35;
        else if (isHighlighted) alpha = 0.25;

        ctx.fillStyle = isText
            ? `rgba(59, 130, 246, ${alpha})`
            : `rgba(34, 197, 94, ${alpha})`;
        ctx.fillRect(region.x, region.y, region.width, region.height);

        // Border
        ctx.strokeStyle = isText ? '#3b82f6' : '#22c55e';
        ctx.lineWidth = isSelected ? 3 : (isHighlighted ? 3 : 2);
        ctx.setLineDash([]);
        ctx.strokeRect(region.x, region.y, region.width, region.height);

        // Draw resize handles if selected
        if (isSelected) {
            this.drawResizeHandles(region);
        }

        // Number badge
        const badgeSize = 22;
        const badgeX = region.x + region.width - badgeSize - 4;
        const badgeY = region.y + 4;

        ctx.fillStyle = isText ? '#3b82f6' : '#22c55e';
        ctx.beginPath();
        ctx.arc(badgeX + badgeSize / 2, badgeY + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'white';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(region.number.toString(), badgeX + badgeSize / 2, badgeY + badgeSize / 2);

        // Type icon (clickable area indicator)
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(isText ? '🔤' : '🖼️', region.x + 4, region.y + 4);
    }

    drawResizeHandles(region) {
        const ctx = this.ctx;
        const handles = this.getHandlePositions(region);
        const size = this.HANDLE_SIZE;

        ctx.fillStyle = 'white';
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;

        for (const pos of Object.values(handles)) {
            ctx.fillRect(pos.x - size / 2, pos.y - size / 2, size, size);
            ctx.strokeRect(pos.x - size / 2, pos.y - size / 2, size, size);
        }
    }

    drawSelectionRect(bounds, type) {
        const ctx = this.ctx;
        const isText = type === 'text';

        ctx.strokeStyle = isText ? '#3b82f6' : '#22c55e';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

        ctx.fillStyle = isText ? 'rgba(59, 130, 246, 0.1)' : 'rgba(34, 197, 94, 0.1)';
        ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }
}
