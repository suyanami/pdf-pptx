/**
 * Region Editor Module
 * Handles interactive selection of text and image regions on PDF pages
 * With numbered regions and click-to-highlight functionality
 */

export class RegionEditor {
    constructor(canvas, overlayCanvas) {
        this.canvas = canvas;
        this.overlayCanvas = overlayCanvas;
        this.ctx = overlayCanvas.getContext('2d');

        // Current selection mode: 'text' or 'image'
        this.mode = 'text';

        // Regions per page: { pageNum: [{ type, x, y, width, height, id, number }] }
        this.regions = {};

        // Current page
        this.currentPage = 1;

        // Drag state
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.dragEnd = { x: 0, y: 0 };

        // Region counter for IDs and display numbers
        this.regionIdCounter = 0;
        this.textCounter = 0;
        this.imageCounter = 0;

        // Highlighted region
        this.highlightedRegionId = null;

        // Callbacks
        this.onRegionChange = null;
        this.onRegionClick = null;

        // Bind event handlers
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleClick = this.handleClick.bind(this);

        // Setup events
        this.setupEvents();
    }

    setupEvents() {
        this.overlayCanvas.addEventListener('mousedown', this.handleMouseDown);
        this.overlayCanvas.addEventListener('mousemove', this.handleMouseMove);
        this.overlayCanvas.addEventListener('mouseup', this.handleMouseUp);
        this.overlayCanvas.addEventListener('mouseleave', this.handleMouseUp);
        this.overlayCanvas.addEventListener('click', this.handleClick);
    }

    destroy() {
        this.overlayCanvas.removeEventListener('mousedown', this.handleMouseDown);
        this.overlayCanvas.removeEventListener('mousemove', this.handleMouseMove);
        this.overlayCanvas.removeEventListener('mouseup', this.handleMouseUp);
        this.overlayCanvas.removeEventListener('mouseleave', this.handleMouseUp);
        this.overlayCanvas.removeEventListener('click', this.handleClick);
    }

    setMode(mode) {
        this.mode = mode;
        console.log(`[RegionEditor] Mode set to: ${mode}`);
    }

    setPage(pageNum) {
        this.currentPage = pageNum;
        this.highlightedRegionId = null;
        this.render();
    }

    syncSize() {
        this.overlayCanvas.width = this.canvas.width;
        this.overlayCanvas.height = this.canvas.height;
        this.render();
    }

    /**
     * Highlight a region by ID (called from list click)
     */
    highlightRegion(regionId) {
        this.highlightedRegionId = regionId;

        // Find which page this region is on and navigate to it
        for (const pageNum in this.regions) {
            const region = this.regions[pageNum].find(r => r.id === regionId);
            if (region) {
                // If on different page, notify to change page
                if (parseInt(pageNum) !== this.currentPage) {
                    if (this.onPageChangeRequest) {
                        this.onPageChangeRequest(parseInt(pageNum));
                    }
                }
                break;
            }
        }

        this.render();

        // Clear highlight after 2 seconds
        setTimeout(() => {
            if (this.highlightedRegionId === regionId) {
                this.highlightedRegionId = null;
                this.render();
            }
        }, 2000);
    }

    /**
     * Handle click on canvas - check if clicking on existing region
     */
    handleClick(e) {
        const rect = this.overlayCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if click is inside any region
        const pageRegions = this.getCurrentPageRegions();
        for (const region of pageRegions) {
            if (x >= region.x && x <= region.x + region.width &&
                y >= region.y && y <= region.y + region.height) {
                this.highlightRegion(region.id);
                if (this.onRegionClick) {
                    this.onRegionClick(region);
                }
                return;
            }
        }
    }

    handleMouseDown(e) {
        const rect = this.overlayCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.isDragging = true;
        this.dragStart = { x, y };
        this.dragEnd = { x, y };

        this.overlayCanvas.style.cursor = 'crosshair';
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;

        const rect = this.overlayCanvas.getBoundingClientRect();
        this.dragEnd = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        this.render();
    }

    handleMouseUp(e) {
        if (!this.isDragging) return;

        this.isDragging = false;
        this.overlayCanvas.style.cursor = 'default';

        const bounds = this.calculateBounds(this.dragStart, this.dragEnd);

        // Only add if region is large enough (min 20x20)
        if (bounds.width > 20 && bounds.height > 20) {
            this.addRegion(bounds);
        }

        this.render();
    }

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

        // Increment type-specific counter
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

        console.log(`[RegionEditor] Added ${this.mode} #${number} on page ${this.currentPage}`);

        if (this.onRegionChange) {
            this.onRegionChange(this.getAllRegions());
        }
    }

    removeRegion(regionId) {
        for (const pageNum in this.regions) {
            this.regions[pageNum] = this.regions[pageNum].filter(r => r.id !== regionId);
        }
        this.render();

        if (this.onRegionChange) {
            this.onRegionChange(this.getAllRegions());
        }
    }

    clearCurrentPage() {
        this.regions[this.currentPage] = [];
        this.render();

        if (this.onRegionChange) {
            this.onRegionChange(this.getAllRegions());
        }
    }

    clearAll() {
        this.regions = {};
        this.textCounter = 0;
        this.imageCounter = 0;
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

    render() {
        const ctx = this.ctx;
        const width = this.overlayCanvas.width;
        const height = this.overlayCanvas.height;

        ctx.clearRect(0, 0, width, height);

        const pageRegions = this.getCurrentPageRegions();
        for (const region of pageRegions) {
            this.drawRegion(region, region.id === this.highlightedRegionId);
        }

        if (this.isDragging) {
            const bounds = this.calculateBounds(this.dragStart, this.dragEnd);
            this.drawSelectionRect(bounds, this.mode);
        }
    }

    drawRegion(region, isHighlighted = false) {
        const ctx = this.ctx;
        const isText = region.type === 'text';

        // Fill color - brighter if highlighted
        if (isHighlighted) {
            ctx.fillStyle = isText ? 'rgba(59, 130, 246, 0.4)' : 'rgba(34, 197, 94, 0.4)';
        } else {
            ctx.fillStyle = isText ? 'rgba(59, 130, 246, 0.15)' : 'rgba(34, 197, 94, 0.15)';
        }
        ctx.fillRect(region.x, region.y, region.width, region.height);

        // Border - thicker if highlighted
        ctx.strokeStyle = isText ? '#3b82f6' : '#22c55e';
        ctx.lineWidth = isHighlighted ? 4 : 2;
        ctx.setLineDash([]);
        ctx.strokeRect(region.x, region.y, region.width, region.height);

        // Number badge
        const badgeText = region.number.toString();
        const badgeSize = 24;
        const badgeX = region.x + region.width - badgeSize - 4;
        const badgeY = region.y + 4;

        // Badge background
        ctx.fillStyle = isText ? '#3b82f6' : '#22c55e';
        ctx.beginPath();
        ctx.arc(badgeX + badgeSize / 2, badgeY + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
        ctx.fill();

        // Badge text
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, badgeX + badgeSize / 2, badgeY + badgeSize / 2);

        // Type icon
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const icon = isText ? '🔤' : '🖼️';
        ctx.fillText(icon, region.x + 4, region.y + 4);
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
