/**
 * PPTX Generator Module
 * Creates PowerPoint presentations from user-selected regions
 * With background color extraction and improved text styling
 * Supports both Tesseract OCR and Ollama LLaVA VLM for text extraction
 */

import { cropRegion, ocrRegion, vlmExtractText, isVLMAvailable, getPageDimensions, getPageBackgroundColor } from './pdf-parser.js';

// Text extraction mode: 'vlm' or 'ocr'
let textExtractionMode = 'ocr';

/**
 * Set text extraction mode
 * @param {'vlm'|'ocr'} mode
 */
export function setTextExtractionMode(mode) {
    textExtractionMode = mode;
    console.log(`[PPTX] Text extraction mode set to: ${mode}`);
}

/**
 * Get current text extraction mode
 * @returns {'vlm'|'ocr'}
 */
export function getTextExtractionMode() {
    return textExtractionMode;
}

/**
 * Generate PPTX from user-selected regions
 * @param {File} file - PDF file
 * @param {Object} allRegions - Regions organized by page number
 * @param {number} pageCount - Total number of pages
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Blob>} PPTX file as Blob
 */
export async function generatePPTXFromRegions(file, allRegions, pageCount, onProgress = () => { }) {
    console.log('[PPTX] Starting generation from regions...');

    // Create presentation
    const pptx = new PptxGenJS();
    pptx.author = 'PDF to PPTX Converter';
    pptx.title = file.name.replace('.pdf', '');

    // Get first page dimensions for slide size
    const firstDims = await getPageDimensions(file, 1);
    const slideWidth = firstDims.width / 72; // PDF points to inches
    const slideHeight = firstDims.height / 72;

    pptx.defineLayout({
        name: 'PDF_LAYOUT',
        width: slideWidth,
        height: slideHeight
    });
    pptx.layout = 'PDF_LAYOUT';

    console.log(`[PPTX] Slide size: ${slideWidth.toFixed(2)}" x ${slideHeight.toFixed(2)}"`);

    // Count total regions for progress
    let totalRegions = 0;
    let processedRegions = 0;
    for (const pageNum in allRegions) {
        totalRegions += allRegions[pageNum].length;
    }

    // Process each page
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const pageRegions = allRegions[pageNum] || [];

        // Create slide for this page
        const slide = pptx.addSlide();

        // Get and set background color from PDF
        try {
            onProgress({
                percent: Math.round((processedRegions / Math.max(1, totalRegions)) * 90),
                message: `Page ${pageNum}: 背景色を取得中...`
            });

            const bgColor = await getPageBackgroundColor(file, pageNum);
            slide.background = { color: bgColor };
            console.log(`[PPTX] Page ${pageNum} background: #${bgColor}`);
        } catch (err) {
            console.warn(`[PPTX] Failed to get background color, using white`, err);
            slide.background = { color: 'FFFFFF' };
        }

        // Get page dimensions
        const dims = await getPageDimensions(file, pageNum);
        const pageSlideW = dims.width / 72;
        const pageSlideH = dims.height / 72;

        // Process each region
        for (const region of pageRegions) {
            processedRegions++;
            const percent = Math.round((processedRegions / totalRegions) * 90);

            onProgress({
                percent,
                message: `処理中: Page ${pageNum}, ${region.type === 'text' ? 'テキスト' : '画像'} #${region.number}...`
            });

            try {
                // Crop the region from PDF
                const cropped = await cropRegion(
                    file,
                    pageNum,
                    region,
                    region.canvasWidth,
                    region.canvasHeight
                );

                // Calculate position in inches
                const x = cropped.pdfBounds.x / 72;
                const y = cropped.pdfBounds.y / 72;
                const w = cropped.pdfBounds.width / 72;
                const h = cropped.pdfBounds.height / 72;

                console.log(`[PPTX] Adding ${region.type} #${region.number} at (${x.toFixed(2)}, ${y.toFixed(2)}) ${w.toFixed(2)}x${h.toFixed(2)}"`);

                if (region.type === 'image') {
                    // Add as image
                    slide.addImage({
                        data: cropped.imageData,
                        x: x,
                        y: y,
                        w: w,
                        h: h
                    });
                } else {
                    // Extract text using VLM or OCR based on mode
                    const extractResult = textExtractionMode === 'vlm'
                        ? await vlmExtractText(cropped.imageData)
                        : await ocrRegion(cropped.imageData);

                    if (extractResult.text && (extractResult.lines.length > 0 || extractResult.text.length > 0)) {
                        // Detect text color (default black for now)
                        const textColor = detectTextColor(cropped.imageData);

                        // Use line-level bboxes for accurate placement (OCR mode)
                        // Or simple text block placement (VLM mode)
                        const imageHeight = cropped.height;
                        const imageWidth = cropped.width;

                        // Track quality metrics
                        let totalConf = 0;
                        let lineCount = 0;

                        // Check if we have bbox info (OCR) or just text (VLM)
                        const hasBbox = extractResult.lines.some(l => l.bbox);

                        if (hasBbox) {
                            // OCR mode: place each line at its detected position
                            for (const line of extractResult.lines) {
                                if (!line.bbox || !line.text.trim()) continue;

                                // Convert line bbox (in cropped image pixels) to PPTX coordinates
                                const lineX = x + (line.bbox.x0 / imageWidth) * w;
                                const lineY = y + (line.bbox.y0 / imageHeight) * h;
                                const lineW = ((line.bbox.x1 - line.bbox.x0) / imageWidth) * w;
                                const lineH = ((line.bbox.y1 - line.bbox.y0) / imageHeight) * h;

                                // Calculate font size from line height
                                const lineHeightPx = line.bbox.y1 - line.bbox.y0;
                                const fontSizePoints = (lineHeightPx / imageHeight) * h * 72 * 0.75;
                                const fontSize = Math.max(8, Math.min(72, Math.round(fontSizePoints)));

                                // Normalize the line text
                                const lineText = normalizeOCRText(line.text);

                                slide.addText(lineText, {
                                    x: lineX,
                                    y: lineY,
                                    w: lineW + 0.1,
                                    h: lineH + 0.05,
                                    fontSize: fontSize,
                                    fontFace: 'Arial',
                                    color: textColor,
                                    valign: 'top',
                                    wrap: false
                                });

                                totalConf += line.conf;
                                lineCount++;
                            }
                        } else {
                            // VLM mode: place all text in a single text box
                            const cleanedText = normalizeOCRText(extractResult.text);
                            const lineCountEst = cleanedText.split('\n').filter(l => l.trim()).length || 1;
                            const fontSize = Math.max(8, Math.min(36, Math.round(h * 72 / lineCountEst * 0.6)));

                            slide.addText(cleanedText, {
                                x: x,
                                y: y,
                                w: w,
                                h: h,
                                fontSize: fontSize,
                                fontFace: 'Arial',
                                color: textColor,
                                valign: 'top',
                                wrap: true
                            });

                            lineCount = lineCountEst;
                            totalConf = extractResult.avgConf || 95;
                        }

                        const mode = hasBbox ? 'OCR' : 'VLM';
                        console.log(`[PPTX] Added ${lineCount} text lines (${mode}), avgConf: ${lineCount > 0 ? (totalConf / Math.max(1, lineCount)).toFixed(1) : 0}%`)
                    } else {
                        // Fallback to image if OCR fails
                        console.log('[PPTX] OCR failed, using image fallback');
                        slide.addImage({
                            data: cropped.imageData,
                            x: x,
                            y: y,
                            w: w,
                            h: h
                        });
                    }
                }
            } catch (err) {
                console.error(`[PPTX] Error processing region:`, err);
            }
        }

        // If no regions for this page, leave it blank
        if (pageRegions.length === 0) {
            console.log(`[PPTX] Page ${pageNum}: No regions, creating blank slide`);
        }
    }

    // Generate file
    onProgress({ percent: 95, message: 'PPTXファイルを生成中...' });
    const blob = await pptx.write({ outputType: 'blob' });

    // Quality metrics summary
    console.log('='.repeat(50));
    console.log('[PPTX] Generation Complete - Quality Report');
    console.log(`  Total pages: ${pageCount}`);
    console.log(`  File size: ${(blob.size / 1024).toFixed(1)} KB`);
    console.log(`  Total regions processed: ${Object.values(allRegions).flat().length}`);
    const textRegions = Object.values(allRegions).flat().filter(r => r.type === 'text').length;
    const imageRegions = Object.values(allRegions).flat().filter(r => r.type === 'image').length;
    console.log(`  Text regions: ${textRegions}, Image regions: ${imageRegions}`);
    console.log('='.repeat(50));

    return blob;
}

/**
 * Detect dominant text color from an image
 * Returns hex color (without #)
 * @param {string} imageData - Base64 image data URL
 * @returns {string} Hex color code
 */
function detectTextColor(imageData) {
    // For now, return black as default
    // Future enhancement: analyze image histogram to find text color
    // Dark backgrounds would have light text, light backgrounds have dark text

    // Simple heuristic: check if image is overall dark or light
    // This is a placeholder - true color detection would require canvas analysis

    return '000000'; // Default to black
}

/**
 * Detect font size from image by analyzing character height
 * Uses horizontal projection to find text lines and measure their height
 * @param {string} imageDataUrl - Base64 image data URL
 * @param {number} regionHeightInches - Region height in inches (for PPTX)
 * @returns {Promise<number>} Estimated font size in points
 */
async function detectFontSizeFromImage(imageDataUrl, regionHeightInches) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                const width = canvas.width;
                const height = canvas.height;

                // Calculate background color (most common edge color)
                const bgColor = getBackgroundColor(data, width, height);

                // Create horizontal projection (sum of non-background pixels per row)
                const projection = new Array(height).fill(0);
                const threshold = 50; // Color difference threshold

                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const idx = (y * width + x) * 4;
                        const diff = Math.abs(data[idx] - bgColor.r) +
                            Math.abs(data[idx + 1] - bgColor.g) +
                            Math.abs(data[idx + 2] - bgColor.b);
                        if (diff > threshold) {
                            projection[y]++;
                        }
                    }
                }

                // Find text lines (continuous regions with content)
                const minContent = width * 0.05; // Line must have at least 5% content
                const lines = [];
                let inLine = false;
                let lineStart = 0;

                for (let y = 0; y < height; y++) {
                    if (projection[y] > minContent && !inLine) {
                        inLine = true;
                        lineStart = y;
                    } else if (projection[y] <= minContent && inLine) {
                        inLine = false;
                        const lineHeight = y - lineStart;
                        if (lineHeight > 3) { // Ignore noise
                            lines.push(lineHeight);
                        }
                    }
                }
                if (inLine) {
                    lines.push(height - lineStart);
                }

                if (lines.length === 0) {
                    console.log('[PPTX] No text lines detected, using fallback');
                    resolve(Math.round(regionHeightInches * 72 * 0.5)); // Fallback
                    return;
                }

                // Calculate average line height
                const avgLineHeight = lines.reduce((a, b) => a + b, 0) / lines.length;

                // Convert pixel height to points
                // avgLineHeight (pixels) / height (pixels) * regionHeightInches (inches) * 72 (points/inch)
                const fontSizePoints = (avgLineHeight / height) * regionHeightInches * 72;

                // Adjust for typical line spacing (text is usually 70-80% of line height)
                const adjustedFontSize = Math.round(fontSizePoints * 0.75);

                // Clamp to reasonable range
                const finalFontSize = Math.max(8, Math.min(72, adjustedFontSize));

                console.log(`[PPTX] Detected font size: ${finalFontSize}pt (${lines.length} lines, avg height: ${avgLineHeight.toFixed(1)}px)`);
                resolve(finalFontSize);

            } catch (err) {
                console.error('[PPTX] Font size detection error:', err);
                resolve(Math.round(regionHeightInches * 72 * 0.5)); // Fallback
            }
        };

        img.onerror = () => {
            console.error('[PPTX] Failed to load image for font detection');
            resolve(Math.round(regionHeightInches * 72 * 0.5)); // Fallback
        };

        img.src = imageDataUrl;
    });
}

/**
 * Get background color from image edges
 */
function getBackgroundColor(data, width, height) {
    const samples = [];
    const positions = [
        [2, 2], [width - 3, 2], [2, height - 3], [width - 3, height - 3],
        [width / 2, 2], [width / 2, height - 3]
    ];

    for (const [x, y] of positions) {
        const idx = (Math.floor(y) * width + Math.floor(x)) * 4;
        samples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
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
 * Normalize OCR text by removing unwanted spaces and line breaks
 * @param {string} text - Raw OCR text
 * @returns {string} Cleaned text
 */
function normalizeOCRText(text) {
    if (!text) return '';

    let result = text;

    // Remove multiple spaces (but keep single spaces between English words)
    result = result.replace(/  +/g, ' ');

    // Remove spaces between Japanese characters (OCR often adds unwanted spaces)
    // Japanese character ranges: Hiragana, Katakana, CJK
    result = result.replace(/([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])\s+([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])/g, '$1$2');

    // Remove space after Japanese punctuation
    result = result.replace(/([。、！？）」』])\s+/g, '$1');

    // Remove space before Japanese punctuation
    result = result.replace(/\s+([。、！？（「『])/g, '$1');

    // Normalize line breaks - remove single line breaks within paragraphs
    // Keep double line breaks as paragraph separators
    result = result.replace(/([^\n])\n([^\n])/g, '$1 $2');

    // Remove multiple consecutive line breaks (keep max 2)
    result = result.replace(/\n{3,}/g, '\n\n');

    // Trim each line
    result = result.split('\n').map(line => line.trim()).join('\n');

    // Remove leading/trailing whitespace
    result = result.trim();

    console.log('[PPTX] Text normalized:', result.substring(0, 50) + '...');

    return result;
}
