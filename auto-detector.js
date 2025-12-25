/**
 * Auto Region Detector Module
 * Automatically detects text and image regions from PDF pages
 * using Canvas-based image analysis
 */

export class AutoDetector {
    constructor() {
        this.minRegionWidth = 50;
        this.minRegionHeight = 30;
        this.padding = 5;
    }

    /**
     * Detect regions from a rendered PDF page
     * @param {HTMLCanvasElement} canvas - Rendered PDF canvas
     * @returns {Array} Detected regions with type, bounds
     */
    async detectRegions(canvas) {
        console.log('[AutoDetector] Starting detection...');

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const imageData = ctx.getImageData(0, 0, width, height);

        // Step 1: Find background color (most common edge color)
        const bgColor = this.detectBackgroundColor(imageData, width, height);
        console.log('[AutoDetector] Background color:', bgColor);

        // Step 2: Create binary mask (content vs background)
        const mask = this.createContentMask(imageData, bgColor, width, height);

        // Step 3: Find connected components (regions)
        const rawRegions = this.findConnectedRegions(mask, width, height);
        console.log('[AutoDetector] Raw regions found:', rawRegions.length);

        // Step 4: Merge overlapping/adjacent regions
        const mergedRegions = this.mergeAdjacentRegions(rawRegions);
        console.log('[AutoDetector] Merged regions:', mergedRegions.length);

        // Step 5: Filter too small regions
        const filteredRegions = mergedRegions.filter(r =>
            r.width >= this.minRegionWidth && r.height >= this.minRegionHeight
        );
        console.log('[AutoDetector] Filtered regions:', filteredRegions.length);

        // Step 6: Classify each region as text or image
        const classifiedRegions = filteredRegions.map((region, index) => {
            const type = this.classifyRegion(imageData, region, width);
            return {
                ...region,
                type,
                number: index + 1,
                id: Date.now() + index,
                canvasWidth: width,
                canvasHeight: height
            };
        });

        console.log('[AutoDetector] Detection complete:', classifiedRegions);
        return classifiedRegions;
    }

    /**
     * Detect background color by sampling edges
     */
    detectBackgroundColor(imageData, width, height) {
        const samples = [];
        const data = imageData.data;

        // Sample from edges
        const edgePoints = [
            [5, 5], [width - 5, 5], [5, height - 5], [width - 5, height - 5],
            [width / 2, 5], [width / 2, height - 5], [5, height / 2], [width - 5, height / 2]
        ];

        for (const [x, y] of edgePoints) {
            const idx = (Math.floor(y) * width + Math.floor(x)) * 4;
            samples.push({
                r: data[idx],
                g: data[idx + 1],
                b: data[idx + 2]
            });
        }

        // Return most common color
        const colorCounts = {};
        for (const c of samples) {
            const key = `${c.r},${c.g},${c.b}`;
            colorCounts[key] = (colorCounts[key] || 0) + 1;
        }

        let maxCount = 0;
        let bgColor = samples[0];
        for (const [key, count] of Object.entries(colorCounts)) {
            if (count > maxCount) {
                maxCount = count;
                const [r, g, b] = key.split(',').map(Number);
                bgColor = { r, g, b };
            }
        }

        return bgColor;
    }

    /**
     * Create binary mask: true = content, false = background
     */
    createContentMask(imageData, bgColor, width, height) {
        const data = imageData.data;
        const mask = new Uint8Array(width * height);
        const threshold = 30; // Color difference threshold

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                const diff = Math.abs(r - bgColor.r) + Math.abs(g - bgColor.g) + Math.abs(b - bgColor.b);
                mask[y * width + x] = diff > threshold ? 1 : 0;
            }
        }

        return mask;
    }

    /**
     * Find bounding boxes of connected content regions
     * Uses horizontal/vertical projection to find blocks
     */
    findConnectedRegions(mask, width, height) {
        const regions = [];

        // Horizontal projection (row-wise sum)
        const hProj = new Array(height).fill(0);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                hProj[y] += mask[y * width + x];
            }
        }

        // Find horizontal bands with content
        const hBands = this.findBands(hProj, height * 0.01);

        for (const [yStart, yEnd] of hBands) {
            // Vertical projection within this band
            const vProj = new Array(width).fill(0);
            for (let y = yStart; y <= yEnd; y++) {
                for (let x = 0; x < width; x++) {
                    vProj[x] += mask[y * width + x];
                }
            }

            // Find vertical bands with content
            const vBands = this.findBands(vProj, (yEnd - yStart) * 0.02);

            for (const [xStart, xEnd] of vBands) {
                regions.push({
                    x: Math.max(0, xStart - this.padding),
                    y: Math.max(0, yStart - this.padding),
                    width: Math.min(width - xStart, xEnd - xStart + this.padding * 2),
                    height: Math.min(height - yStart, yEnd - yStart + this.padding * 2)
                });
            }
        }

        return regions;
    }

    /**
     * Find continuous bands in projection
     */
    findBands(projection, threshold) {
        const bands = [];
        let inBand = false;
        let start = 0;

        for (let i = 0; i < projection.length; i++) {
            if (projection[i] > threshold && !inBand) {
                inBand = true;
                start = i;
            } else if (projection[i] <= threshold && inBand) {
                inBand = false;
                bands.push([start, i - 1]);
            }
        }

        if (inBand) {
            bands.push([start, projection.length - 1]);
        }

        return bands;
    }

    /**
     * Merge overlapping or adjacent regions
     */
    mergeAdjacentRegions(regions) {
        if (regions.length === 0) return [];

        const merged = [...regions];
        let changed = true;
        const gap = 20; // Max gap to merge

        while (changed) {
            changed = false;
            for (let i = 0; i < merged.length; i++) {
                for (let j = i + 1; j < merged.length; j++) {
                    if (this.shouldMerge(merged[i], merged[j], gap)) {
                        merged[i] = this.mergeTwo(merged[i], merged[j]);
                        merged.splice(j, 1);
                        changed = true;
                        break;
                    }
                }
                if (changed) break;
            }
        }

        return merged;
    }

    shouldMerge(a, b, gap) {
        const aRight = a.x + a.width;
        const aBottom = a.y + a.height;
        const bRight = b.x + b.width;
        const bBottom = b.y + b.height;

        // Check if vertically aligned and horizontally close
        const vOverlap = !(aBottom + gap < b.y || bBottom + gap < a.y);
        const hClose = Math.abs(aRight - b.x) < gap || Math.abs(bRight - a.x) < gap;

        // Check if horizontally aligned and vertically close
        const hOverlap = !(aRight + gap < b.x || bRight + gap < a.x);
        const vClose = Math.abs(aBottom - b.y) < gap || Math.abs(bBottom - a.y) < gap;

        return (vOverlap && hClose) || (hOverlap && vClose);
    }

    mergeTwo(a, b) {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        return {
            x,
            y,
            width: Math.max(a.x + a.width, b.x + b.width) - x,
            height: Math.max(a.y + a.height, b.y + b.height) - y
        };
    }

    /**
     * Classify region as 'text' or 'image'
     * Based on color variance - text has low variance, images have high variance
     */
    classifyRegion(imageData, region, canvasWidth) {
        const data = imageData.data;
        const colors = new Set();
        let sampleCount = 0;

        // Sample pixels from the region
        const step = Math.max(1, Math.floor(Math.min(region.width, region.height) / 20));

        for (let y = region.y; y < region.y + region.height && y < imageData.height; y += step) {
            for (let x = region.x; x < region.x + region.width && x < canvasWidth; x += step) {
                const idx = (Math.floor(y) * canvasWidth + Math.floor(x)) * 4;
                // Quantize colors to reduce noise
                const r = Math.floor(data[idx] / 32) * 32;
                const g = Math.floor(data[idx + 1] / 32) * 32;
                const b = Math.floor(data[idx + 2] / 32) * 32;
                colors.add(`${r},${g},${b}`);
                sampleCount++;
            }
        }

        // Text typically has 2-5 distinct colors (text color + background + anti-aliasing)
        // Images have many more colors
        const colorDiversity = colors.size / sampleCount;

        console.log(`[AutoDetector] Region at (${region.x},${region.y}): ${colors.size} colors, diversity=${colorDiversity.toFixed(3)}`);

        // Threshold: if more than 15% unique colors among samples, it's likely an image
        return colorDiversity > 0.15 ? 'image' : 'text';
    }
}
