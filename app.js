/**
 * PDF to PPTX Converter - Main Application
 * With interactive region selection editor
 */

import { renderPagePreview, getPageCount, cropRegion } from './pdf-parser.js';
import { generatePPTXFromRegions } from './pptx-generator.js';
import { formatFileSize, downloadBlob, isValidPDF, generateOutputFileName, showError } from './utils.js';
import { RegionEditor } from './region-editor.js';

// ===== State =====
const state = {
    file: null,
    pageCount: 0,
    currentPage: 1,
    regionEditor: null,
    pptxBlob: null,
    isProcessing: false
};

// ===== DOM Elements =====
const elements = {
    // Upload
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    uploadSection: document.getElementById('uploadSection'),

    // Editor
    editorSection: document.getElementById('editorSection'),
    pdfCanvas: document.getElementById('pdfCanvas'),
    overlayCanvas: document.getElementById('overlayCanvas'),
    canvasContainer: document.getElementById('canvasContainer'),

    // Toolbar
    btnBack: document.getElementById('btnBack'),
    btnTextMode: document.getElementById('btnTextMode'),
    btnImageMode: document.getElementById('btnImageMode'),
    btnClearPage: document.getElementById('btnClearPage'),

    // Navigation
    currentPage: document.getElementById('currentPage'),
    totalPages: document.getElementById('totalPages'),
    prevPage: document.getElementById('prevPage'),
    nextPage: document.getElementById('nextPage'),

    // Region Panel
    regionList: document.getElementById('regionList'),
    btnClearAll: document.getElementById('btnClearAll'),

    // Generate
    btnGenerate: document.getElementById('btnGenerate'),

    // Progress
    progressSection: document.getElementById('progressSection'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    progressPercent: document.getElementById('progressPercent'),

    // Download
    downloadSection: document.getElementById('downloadSection'),
    downloadBtn: document.getElementById('downloadBtn'),
    resetBtn: document.getElementById('resetBtn')
};

// ===== Initialize =====
function init() {
    setupEventListeners();
    console.log('[App] PDF to PPTX Converter initialized');
}

// ===== Event Listeners =====
function setupEventListeners() {
    // Drop zone
    elements.dropZone.addEventListener('click', () => elements.fileInput.click());
    elements.dropZone.addEventListener('dragover', handleDragOver);
    elements.dropZone.addEventListener('dragleave', handleDragLeave);
    elements.dropZone.addEventListener('drop', handleDrop);
    elements.fileInput.addEventListener('change', handleFileInput);

    // Toolbar
    elements.btnBack.addEventListener('click', resetApp);
    elements.btnTextMode.addEventListener('click', () => setMode('text'));
    elements.btnImageMode.addEventListener('click', () => setMode('image'));
    elements.btnClearPage.addEventListener('click', clearCurrentPage);

    // Navigation
    elements.prevPage.addEventListener('click', () => navigatePage(-1));
    elements.nextPage.addEventListener('click', () => navigatePage(1));

    // Region panel
    elements.btnClearAll.addEventListener('click', clearAllRegions);

    // Generate
    elements.btnGenerate.addEventListener('click', generatePPTX);

    // Download
    elements.downloadBtn.addEventListener('click', downloadPPTX);
    elements.resetBtn.addEventListener('click', resetApp);
}

// ===== File Handling =====
function handleDragOver(e) {
    e.preventDefault();
    elements.dropZone.classList.add('drag-over');
}

function handleDragLeave() {
    elements.dropZone.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    elements.dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
    }
}

function handleFileInput(e) {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
}

async function handleFileSelect(file) {
    if (!isValidPDF(file)) {
        showError('PDFファイルを選択してください');
        return;
    }

    state.file = file;

    try {
        // Get page count
        state.pageCount = await getPageCount(file);
        state.currentPage = 1;

        // Show editor
        elements.uploadSection.classList.add('hidden');
        elements.editorSection.classList.remove('hidden');

        // Initialize region editor
        state.regionEditor = new RegionEditor(elements.pdfCanvas, elements.overlayCanvas);
        state.regionEditor.onRegionChange = updateRegionList;

        // Render first page
        await renderCurrentPage();
        updatePageInfo();

        console.log(`[App] Loaded PDF: ${file.name}, ${state.pageCount} pages`);
    } catch (err) {
        console.error('[App] Failed to load PDF:', err);
        showError('PDFの読み込みに失敗しました');
    }
}

// ===== Page Rendering =====
async function renderCurrentPage() {
    if (!state.file) return;

    try {
        await renderPagePreview(state.file, state.currentPage, elements.pdfCanvas, 1100);

        // Sync overlay canvas size
        if (state.regionEditor) {
            state.regionEditor.setPage(state.currentPage);
            syncOverlayCanvas();
        }
    } catch (err) {
        console.error('[App] Failed to render page:', err);
    }
}

function syncOverlayCanvas() {
    // Position overlay canvas exactly over the PDF canvas
    const container = elements.canvasContainer;
    const pdfCanvas = elements.pdfCanvas;
    const overlay = elements.overlayCanvas;

    overlay.width = pdfCanvas.width;
    overlay.height = pdfCanvas.height;
    overlay.style.width = pdfCanvas.style.width || `${pdfCanvas.width}px`;
    overlay.style.height = pdfCanvas.style.height || `${pdfCanvas.height}px`;

    // Center both canvases
    const left = (container.clientWidth - pdfCanvas.width) / 2;
    const top = (container.clientHeight - pdfCanvas.height) / 2;

    overlay.style.left = `${Math.max(0, left)}px`;
    overlay.style.top = `${Math.max(0, top)}px`;

    if (state.regionEditor) {
        state.regionEditor.syncSize();
    }
}

// ===== Navigation =====
function updatePageInfo() {
    elements.currentPage.textContent = state.currentPage;
    elements.totalPages.textContent = state.pageCount;
    elements.prevPage.disabled = state.currentPage <= 1;
    elements.nextPage.disabled = state.currentPage >= state.pageCount;
}

async function navigatePage(delta) {
    const newPage = state.currentPage + delta;
    if (newPage < 1 || newPage > state.pageCount) return;

    state.currentPage = newPage;
    updatePageInfo();
    await renderCurrentPage();
}

// ===== Mode Switching =====
function setMode(mode) {
    if (state.regionEditor) {
        state.regionEditor.setMode(mode);
    }

    // Update UI
    elements.btnTextMode.classList.toggle('active', mode === 'text');
    elements.btnImageMode.classList.toggle('active', mode === 'image');
}

// ===== Region Management =====
function updateRegionList(allRegions) {
    const list = elements.regionList;
    list.innerHTML = '';

    let hasRegions = false;

    // Group by page
    for (let page = 1; page <= state.pageCount; page++) {
        const pageRegions = allRegions[page] || [];
        if (pageRegions.length === 0) continue;

        hasRegions = true;

        // Page header
        const pageHeader = document.createElement('div');
        pageHeader.className = 'region-page-header';
        pageHeader.textContent = `Page ${page}`;
        pageHeader.style.cssText = 'font-size: 0.75rem; color: #606070; margin-top: 12px; margin-bottom: 6px; font-weight: 600;';
        list.appendChild(pageHeader);

        // Region items
        for (const region of pageRegions) {
            const item = document.createElement('div');
            item.className = `region-item ${region.type}`;
            item.dataset.regionId = region.id;
            item.dataset.page = page;

            const icon = region.type === 'text' ? '🔤' : '🖼️';
            const typeLabel = region.type === 'text' ? 'テキスト' : '画像';
            const number = region.number || '?';

            item.innerHTML = `
                <span class="region-label">
                    <span class="region-number">${number}</span>
                    ${icon} ${typeLabel}
                </span>
                <button class="region-delete" data-id="${region.id}" title="削除">✕</button>
            `;

            // Click item to highlight on canvas
            item.addEventListener('click', async (e) => {
                // Don't trigger if clicking delete button
                if (e.target.classList.contains('region-delete')) return;

                // Navigate to page if needed
                if (parseInt(page) !== state.currentPage) {
                    state.currentPage = parseInt(page);
                    updatePageInfo();
                    await renderCurrentPage();
                }

                // Highlight region
                if (state.regionEditor) {
                    state.regionEditor.highlightRegion(region.id);
                }

                // Highlight list item
                highlightListItem(item);
            });

            // Delete button handler
            item.querySelector('.region-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                if (state.regionEditor) {
                    state.regionEditor.removeRegion(region.id);
                }
            });

            list.appendChild(item);
        }
    }

    if (!hasRegions) {
        list.innerHTML = '<p class="empty-message">領域が選択されていません。<br>左のプレビューでドラッグして選択してください。</p>';
    }

    // Update generate button
    elements.btnGenerate.disabled = !hasRegions;
}

function highlightListItem(item) {
    // Remove highlight from all items
    document.querySelectorAll('.region-item').forEach(el => {
        el.classList.remove('highlighted');
    });

    // Add highlight to clicked item
    item.classList.add('highlighted');

    // Remove after 2 seconds
    setTimeout(() => {
        item.classList.remove('highlighted');
    }, 2000);
}

function clearCurrentPage() {
    if (state.regionEditor) {
        state.regionEditor.clearCurrentPage();
    }
}

function clearAllRegions() {
    if (state.regionEditor) {
        state.regionEditor.clearAll();
    }
}

// ===== PPTX Generation =====
async function generatePPTX() {
    if (state.isProcessing || !state.file || !state.regionEditor) return;

    const allRegions = state.regionEditor.getAllRegions();
    if (!state.regionEditor.hasRegions()) {
        showError('領域を選択してください');
        return;
    }

    state.isProcessing = true;
    elements.btnGenerate.disabled = true;

    // Show progress
    elements.progressSection.classList.remove('hidden');
    updateProgress(0, '処理を開始...');

    try {
        state.pptxBlob = await generatePPTXFromRegions(
            state.file,
            allRegions,
            state.pageCount,
            (progress) => {
                updateProgress(progress.percent, progress.message);
            }
        );

        updateProgress(100, '完了！');

        // Show download
        setTimeout(() => {
            elements.editorSection.classList.add('hidden');
            elements.downloadSection.classList.remove('hidden');
        }, 500);

    } catch (err) {
        console.error('[App] Generation failed:', err);
        showError(`生成に失敗しました: ${err.message}`);
        elements.progressSection.classList.add('hidden');
    } finally {
        state.isProcessing = false;
        elements.btnGenerate.disabled = false;
    }
}

function updateProgress(percent, message) {
    elements.progressFill.style.width = `${percent}%`;
    elements.progressPercent.textContent = `${percent}%`;
    elements.progressText.textContent = message;
}

function downloadPPTX() {
    if (!state.pptxBlob || !state.file) return;
    downloadBlob(state.pptxBlob, generateOutputFileName(state.file.name));
}

// ===== Reset =====
function resetApp() {
    // Cleanup
    if (state.regionEditor) {
        state.regionEditor.destroy();
        state.regionEditor = null;
    }

    // Reset state
    state.file = null;
    state.pageCount = 0;
    state.currentPage = 1;
    state.pptxBlob = null;
    state.isProcessing = false;

    // Reset UI
    elements.fileInput.value = '';
    elements.uploadSection.classList.remove('hidden');
    elements.editorSection.classList.add('hidden');
    elements.downloadSection.classList.add('hidden');
    elements.progressSection.classList.add('hidden');

    // Reset mode buttons
    setMode('text');

    // Reset region list
    updateRegionList({});
}

// ===== Start =====
init();
