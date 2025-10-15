"use strict";

let TIRE_DATA = [];
let BAY_LENGTH_MM = 0;
let BAY_WIDTH_MM = 2400;
let SCALE_FACTOR = 10;
let BAY_WIDTH_PX = BAY_WIDTH_MM / SCALE_FACTOR;
let BAY_LENGTH_PX = 0;
let tireCounter = 0;
let history = [];
let historyIndex = -1;
let currentProductData = null;
let isScaledDown = false;
let activeTire = null;

async function loadCsvData() {
    try {
        console.log('Loading tire-data.csv at', new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
        const response = await fetch('tire-data.csv');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const csvString = await response.text();
        TIRE_DATA = parseCsvData(csvString);
        console.log('CSV data loaded:', TIRE_DATA.length, 'entries');
    } catch (error) {
        console.error('Error loading CSV data:', error);
        alert('タイヤデータの読み込みに失敗しました。サーバー接続を確認してください。');
    }
}

function parseCsvData(csvString) {
    console.log('Parsing CSV data...');
    const lines = csvString.trim().split('\n');
    if (lines.length <= 1) {
        console.warn('CSV is empty or invalid.');
        return [];
    }

    const rawHeaders = lines[0].split(',').map(h => h.trim().toLowerCase());
    const requiredHeaders = {
        'code': 'code', 'size': 'size', 'diameter': 'diameter',
        'width': 'width', 'pallet': 'pallet', 'note': 'note'
    };
    const headerMapping = {};
    for (const required in requiredHeaders) {
        const index = rawHeaders.indexOf(required);
        if (index !== -1) {
            headerMapping[index] = requiredHeaders[required];
        }
    }

    const dataArray = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const item = {};
        let isValid = true;

        for (const index in headerMapping) {
            const key = headerMapping[index];
            let value = values[index];

            if (key === 'diameter' || key === 'width' || key === 'pallet') {
                value = parseInt(value, 10);
                if (isNaN(value) && (key === 'diameter' || key === 'width')) {
                    console.warn(`CSV Parse Error: Line ${i+1} has non-numeric value for ${key}. Skipping.`);
                    isValid = false;
                    break;
                }
            }
            item[key] = value;
        }

        if (isValid && item.code) {
            item.code = String(item.code).padStart(4, '0');
            dataArray.push(item);
        }
    }
    return dataArray;
}

function initializeBay(lengthMM) {
    console.log(`initializeBay called with lengthMM: ${lengthMM}`);
    const loadingBay = document.getElementById('loading-bay');
    const bayLengthInfo = document.getElementById('bay-length-info');
    const startupDialog = document.getElementById('startup-dialog');

    BAY_LENGTH_MM = lengthMM;
    BAY_LENGTH_PX = BAY_LENGTH_MM / SCALE_FACTOR;

    loadingBay.style.height = `${BAY_LENGTH_PX}px`;
    loadingBay.style.width = `${BAY_WIDTH_PX}px`;

    bayLengthInfo.textContent = `${BAY_LENGTH_MM}`;

    document.querySelectorAll('.tire').forEach(tire => tire.remove());
    tireCounter = 0;
    history = [];
    historyIndex = -1;

    drawGuides();
    saveState();
    updateTireCount();
    updateDistanceInfo();

    startupDialog.style.display = 'none';
    adjustResponsive();
}

function resetSimulation() {
    console.log('resetSimulation called');
    BAY_LENGTH_MM = 0;
    BAY_LENGTH_PX = 0;
    tireCounter = 0;
    history = [];
    historyIndex = -1;
    currentProductData = null;
    isScaledDown = false;
    activeTire = null;

    document.querySelectorAll('.tire').forEach(tire => tire.remove());
    document.getElementById('loading-bay').querySelectorAll('.guide-line').forEach(line => line.remove());
    document.getElementById('loading-bay').style.height = '0px';

    document.getElementById('bay-length-info').textContent = '';

    resetProductInfo();
    updateTireCount();
    updateDistanceInfo();
    updateHistoryButtons();

    document.getElementById('startup-dialog').style.display = 'flex';
    document.querySelector('.truck-container').style.transform = 'scale(1)';
    updateToggleButtonText();
}

// 初期設定とDOM要素の取得
const createTireBtn = document.getElementById('create-tire-btn');
const tireDiameterSelect = document.getElementById('tire-diameter');
const controlsPanel = document.getElementById('controls-panel');
const resetBtn = document.getElementById('reset-btn');
const productCodeInput = document.getElementById('product-code-input');
const searchCodeBtn = document.getElementById('search-code-btn');
const resetItemBtn = document.getElementById('reset-item-btn');
const dataSizeSpan = document.getElementById('data-size');
const dataDiameterCsvSpan = document.getElementById('data-diameter-csv');
const dataWidthSpan = document.getElementById('data-width');
const dataPalletSpan = document.getElementById('data-pallet');
const dataNoteSpan = document.getElementById('data-note');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const contextMenu = document.getElementById('tire-context-menu');
const menuDeleteBtn = document.getElementById('menu-delete-btn');
const menuReplicateBtn = document.getElementById('menu-replicate-btn');
const replicationCountSelect = document.getElementById('replication-count');
const replicationSpacingSelect = document.getElementById('replication-spacing');
const toggleScaleBtn = document.getElementById('toggle-scale-btn');
const setBayBtn = document.getElementById('set-bay-btn');
const bayLengthInput = document.getElementById('bay-length-input');

function handleSetBay(event) {
    event.stopPropagation();
    event.preventDefault();
    const lengthMM = parseInt(bayLengthInput.value, 10);
    console.log(`setBayBtn triggered, input value: ${bayLengthInput.value}, parsed: ${lengthMM}`);
    if (!bayLengthInput.value || isNaN(lengthMM) || lengthMM < 5000 || lengthMM > 15000) {
        alert('有効な荷台長 (5000-15000mm) を入力してください。');
        return;
    }
    initializeBay(lengthMM);
}

setBayBtn.removeEventListener('click', handleSetBay);
setBayBtn.removeEventListener('touchend', handleSetBay);
setBayBtn.addEventListener('click', handleSetBay);
setBayBtn.addEventListener('touchend', handleSetBay, { passive: false });
bayLengthInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleSetBay(e);
    }
});

document.getElementById('startup-dialog').addEventListener('touchstart', (e) => {
    e.stopPropagation();
}, { passive: false });

function searchProductCode() {
    console.log('searchProductCode called');
    if (!TIRE_DATA.length) {
        console.warn('TIRE_DATA is not loaded yet.');
        alert('データが読み込まれていません。ページをリロードしてください。');
        return;
    }
    const rawCode = productCodeInput.value.trim();
    const paddedCode = rawCode.padStart(4, '0');

    if (!rawCode) {
        alert("品番を入力してください。");
        resetProductInfo();
        return;
    }

    const data = TIRE_DATA.find(item => item.code === paddedCode);

    if (data) {
        currentProductData = data;
        productCodeInput.value = paddedCode;

        dataSizeSpan.textContent = data.size;
        dataDiameterCsvSpan.textContent = `${data.diameter}`;
        dataWidthSpan.textContent = `${data.width}`;
        dataPalletSpan.textContent = data.pallet;
        dataNoteSpan.textContent = data.note;
    } else {
        alert(`品番「${rawCode}」のデータは見つかりませんでした。`);
        resetProductInfo();
    }
}

function resetProductInfo() {
    console.log('resetProductInfo called');
    currentProductData = null;
    productCodeInput.value = '';

    dataSizeSpan.textContent = '';
    dataDiameterCsvSpan.textContent = '';
    dataWidthSpan.textContent = '';
    dataPalletSpan.textContent = '';
    dataNoteSpan.textContent = '';
}

function loadProductInfoFromTire(tire) {
    console.log('loadProductInfoFromTire called', tire);
    const code = tire?.dataset?.productCode;
    if (code) {
        productCodeInput.value = code;
        searchProductCode();
    } else {
        resetProductInfo();
    }
}

searchCodeBtn.addEventListener('click', searchProductCode);
productCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        searchProductCode();
    }
});
productCodeInput.addEventListener('focus', resetProductInfo);
resetItemBtn.addEventListener('click', resetProductInfo);
tireDiameterSelect.addEventListener('change', () => {
    if (currentProductData) {
        resetProductInfo();
    }
});
createTireBtn.addEventListener('click', () => {
    if (BAY_LENGTH_MM === 0) {
        alert('先に荷台を選択してください。');
        return;
    }
    createTire(null, null, null, currentProductData);
    saveState();
});
resetBtn.addEventListener('click', () => {
    if (confirm('リセットしますか？')) {
        resetSimulation();
    }
});
undoBtn.addEventListener('click', () => loadState(historyIndex - 1));
redoBtn.addEventListener('click', () => loadState(historyIndex + 1));
toggleScaleBtn.addEventListener('click', toggleScale);

function createTire(initialX = null, initialY = null, diameterMM = null, productData = null) {
    console.log('createTire called', { initialX, initialY, diameterMM, productData });
    const selectedDiameterMM = parseFloat(tireDiameterSelect.value);
    diameterMM = diameterMM || (productData ? productData.diameter : selectedDiameterMM);

    const diameterPX = diameterMM / SCALE_FACTOR;
    const radiusPX = diameterPX / 2;

    if (diameterPX > BAY_WIDTH_PX) {
        if (initialX !== null) {
            console.warn(`Tire diameter (${diameterMM}mm) exceeds bay width.`);
        } else {
            alert(`選択されたタイヤ (${diameterMM}) は荷台の幅 (${BAY_WIDTH_MM}) を超えているため配置できません。`);
            return null;
        }
    }

    tireCounter++;

    const tire = document.createElement('div');
    tire.classList.add('tire');
    tire.id = `tire-${tireCounter}`;

    tire.style.width = `${diameterPX}px`;
    tire.style.height = `${diameterPX}px`;

    const label = document.createElement('span');
    label.classList.add('tire-label');
    label.textContent = `${diameterMM}`;
    tire.appendChild(label);

    const finalProductData = productData || (currentProductData && currentProductData.diameter === diameterMM ? currentProductData : null);

    if (finalProductData && finalProductData.code) {
        const codeSpan = document.createElement('span');
        codeSpan.classList.add('tire-product-code');
        codeSpan.textContent = finalProductData.code;
        tire.appendChild(codeSpan);
    }

    adjustTireLabelSizes(tire, diameterPX);

    tire.dataset.diameterPx = diameterPX;
    tire.dataset.radiusPx = radiusPX;
    tire.dataset.diameterMm = diameterMM;

    if (finalProductData) {
        tire.dataset.productCode = finalProductData.code;
    }

    const loadingBay = document.getElementById('loading-bay');

    if (initialX !== null && initialY !== null) {
        const clampedPos = clampToBay(initialX, initialY, diameterPX);

        tire.style.position = 'absolute';
        tire.style.left = `${clampedPos.x}px`;
        tire.style.top = `${clampedPos.y}px`;
        tire.dataset.inBay = "true";

        loadingBay.appendChild(tire);
    } else {
        const padding = 10;
        let newX = BAY_WIDTH_PX - diameterPX - padding;
        let newY = BAY_LENGTH_PX - diameterPX - padding;

        const clampedPos = clampToBay(newX, newY, diameterPX);

        tire.style.position = 'absolute';
        tire.style.left = `${clampedPos.x}px`;
        tire.style.top = `${clampedPos.y}px`;
        tire.dataset.inBay = "true";

        loadingBay.appendChild(tire);
    }

    makeDraggable(tire);
    setupContextMenu(tire);

    updateTireCount();
    updateDistanceInfo();
    return tire;
}

function adjustTireLabelSizes(tire, diameterPX) {
    const label = tire.querySelector('.tire-label');
    const codeSpan = tire.querySelector('.tire-product-code');

    const labelSize = Math.max(12, diameterPX * 0.15);
    if (label) {
        label.style.fontSize = `${labelSize}px`;
    }

    const codeSize = Math.max(10, diameterPX * 0.12);
    if (codeSpan) {
        codeSpan.style.fontSize = `${codeSize}px`;
    }
}

function updateTireCount() {
    const count = document.querySelectorAll('.tire').length;
    document.getElementById('tire-count-info').textContent = count;
}

function updateDistanceInfo() {
    const loadingBay = document.getElementById('loading-bay');
    const tires = loadingBay.querySelectorAll('.tire[data-in-bay="true"]');
    let maxBottomY_PX = 0;

    tires.forEach(tire => {
        const topY = parseFloat(tire.style.top);
        const diameter = parseFloat(tire.dataset.diameterPx);
        const bottomY = topY + diameter;

        if (bottomY > maxBottomY_PX) {
            maxBottomY_PX = bottomY;
        }
    });

    if (tires.length === 0) {
        document.getElementById('distance-info').textContent = '';
        return;
    }

    const maxBottomY_MM = Math.round(maxBottomY_PX * SCALE_FACTOR);
    document.getElementById('distance-info').textContent = `${maxBottomY_MM}`;
}

function deleteTire(tire) {
    console.log('deleteTire called', tire);
    if (tire) {
        tire.remove();
        hideContextMenu();
        updateTireCount();
        updateDistanceInfo();
        saveState();
    }
}

function replicateTire(baseTire) {
    console.log('replicateTire called', baseTire);
    if (!baseTire || baseTire.dataset.inBay !== "true") {
        alert("荷台内のタイヤのみ複製可能です。");
        hideContextMenu();
        return;
    }

    const count = parseInt(replicationCountSelect.value, 10);
    const spacingMM = parseInt(replicationSpacingSelect.value, 10);
    const spacingPX = spacingMM / SCALE_FACTOR;

    const diameterPX = parseFloat(baseTire.dataset.diameterPx);
    const startX = parseFloat(baseTire.style.left);
    let currentY = parseFloat(baseTire.style.top);

    let productData = null;
    if (baseTire.dataset.productCode) {
        const code = baseTire.dataset.productCode;
        productData = TIRE_DATA.find(item => item.code === code) || null;
    }

    for (let i = 0; i < count; i++) {
        const newY = currentY + diameterPX + spacingPX;

        if (newY + diameterPX > BAY_LENGTH_PX) {
            if (i === 0) {
                alert("複製数が多すぎるため、荷台からはみ出します。");
            } else {
                alert(`${i+1}個以降は荷台からはみ出すため、複製を中断しました。`);
            }
            break;
        }

        const newTire = createTire(startX, newY, parseFloat(baseTire.dataset.diameterMm), productData);

        if (newTire) {
            const { x: finalX, y: finalY } = resolveCollisions(startX, newY, diameterPX, newTire);
            newTire.style.left = `${finalX}px`;
            newTire.style.top = `${finalY}px`;
            currentY = finalY;
        } else {
            break;
        }
    }

    hideContextMenu();
    saveState();
    updateTireCount();
    updateDistanceInfo();
}

function initializeContextMenuListeners() {
    menuDeleteBtn.onclick = () => {
        deleteTire(activeTire);
    };

    menuReplicateBtn.onclick = () => {
        replicateTire(activeTire);
    };

    replicationCountSelect.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    replicationSpacingSelect.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    contextMenu.querySelectorAll('.replication-options label').forEach(label => {
        label.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });
}

function setupContextMenu(element) {
    element.addEventListener('contextmenu', (e) => showContextMenu(e, element));
}

function showContextMenu(e, element) {
    e.preventDefault();

    activeTire = element;

    contextMenu.style.display = 'block';
    let clientX = e.clientX;
    let clientY = e.clientY;

    if (e.changedTouches && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
    } else if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    }

    contextMenu.style.left = `${clientX + window.scrollX + 5}px`;
    contextMenu.style.top = `${clientY + window.scrollY + 5}px`;

    document.addEventListener('click', hideContextMenu, { once: true });
}

function hideContextMenu() {
    contextMenu.style.display = 'none';
    activeTire = null;
}

function makeDraggable(element) {
    let isDragging = false;
    let offsetX, offsetY;
    let initialPosition = {};
    const loadingBay = document.getElementById('loading-bay');

    let dragStarted = false;
    let startClientX, startClientY;

    const DOUBLE_TAP_THRESHOLD = 300;
    let lastTapTime = 0;

    function getBayRect() {
        const rect = loadingBay.getBoundingClientRect();
        const truckContainer = document.querySelector('.truck-container');
        const scale = parseFloat(truckContainer.style.transform.match(/scale\(([^)]+)\)/)?.[1] || 1);
        return {
            left: rect.left,
            top: rect.top,
            width: rect.width / scale,
            height: rect.height / scale,
            scale: scale
        };
    }

    element.addEventListener('mousedown', startDrag);
    element.addEventListener('touchstart', startDragTouch, { passive: false });

    function startDrag(e) {
        if (e.button === 2) {
            return;
        }

        if (isDragging) return;

        hideContextMenu();

        startClientX = e.clientX;
        startClientY = e.clientY;

        isDragging = true;
        dragStarted = false;

        element.dataset.isDragging = 'true';
        element.style.cursor = 'grabbing';

        const clientX = e.clientX;
        const clientY = e.clientY;

        const bayRect = getBayRect();
        const elementRect = element.getBoundingClientRect();

        initialPosition.left = element.style.left;
        initialPosition.top = element.style.top;
        initialPosition.parent = element.parentNode.id;

        offsetX = (clientX - elementRect.left) / bayRect.scale;
        offsetY = (clientY - elementRect.top) / bayRect.scale;

        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);
    }

    function startDragTouch(e) {
        if (isDragging) return;

        hideContextMenu();

        const clientX = e.touches[0].clientX;
        const clientY = e.touches[0].clientY;

        startClientX = clientX;
        startClientY = clientY;

        isDragging = true;
        dragStarted = false;

        element.dataset.isDragging = 'true';
        element.style.cursor = 'grabbing';

        const bayRect = getBayRect();
        const elementRect = element.getBoundingClientRect();

        initialPosition.left = element.style.left;
        initialPosition.top = element.style.top;
        initialPosition.parent = element.parentNode.id;

        offsetX = (clientX - elementRect.left) / bayRect.scale;
        offsetY = (clientY - elementRect.top) / bayRect.scale;

        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', stopDrag);
    }

    function drag(e) {
        if (!isDragging) return;

        dragStarted = true;

        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;
        const bayRect = getBayRect(); // 1回だけ取得
        const isOutsideBay = clientX < bayRect.left || clientX > bayRect.left + bayRect.width * bayRect.scale ||
                             clientY < bayRect.top || clientY > bayRect.top + bayRect.height * bayRect.scale;
        if (isOutsideBay) {
            return;
        }
        if (e.cancelable) {
            e.preventDefault();
        }

        let newBodyX = (clientX + window.scrollX - offsetX * bayRect.scale - bayRect.left) / bayRect.scale + bayRect.left / bayRect.scale;
        let newBodyY = (clientY + window.scrollY - offsetY * bayRect.scale - bayRect.top) / bayRect.scale + bayRect.top / bayRect.scale;

        const bayAbsLeft = bayRect.left;
        const bayAbsTop = bayRect.top;
        const bayAbsRight = bayAbsLeft + bayRect.width * bayRect.scale;
        const bayAbsBottom = bayAbsTop + bayRect.height * bayRect.scale;

        const diameter = parseFloat(element.dataset.diameterPx);
        const scaledDiameter = diameter * bayRect.scale;

        const tireCenterAbsX = clientX - offsetX * bayRect.scale + scaledDiameter / 2;
        const tireCenterAbsY = clientY - offsetY * bayRect.scale + scaledDiameter / 2;

        const inBayArea = tireCenterAbsX > bayAbsLeft && tireCenterAbsX < bayAbsRight &&
                          tireCenterAbsY > bayAbsTop && tireCenterAbsY < bayAbsBottom;

        element.dataset.inBay = inBayArea ? "true" : "false";

        if (inBayArea) {
            let relX = (clientX - bayAbsLeft - offsetX * bayRect.scale) / bayRect.scale;
            let relY = (clientY - bayAbsTop - offsetY * bayRect.scale) / bayRect.scale;

            if (element.parentNode !== loadingBay) {
                if (element.parentNode === document.body) document.body.removeChild(element);
                loadingBay.appendChild(element);
                element.style.position = 'absolute';
            }

            const { x: finalX, y: finalY } = resolveCollisions(relX, relY, diameter, element);

            const clampedPos = clampToBay(finalX, finalY, diameter);
            element.style.left = `${clampedPos.x}px`;
            element.style.top = `${clampedPos.y}px`;
        } else {
            if (element.parentNode !== document.body) {
                if (element.parentNode === loadingBay) loadingBay.removeChild(element);
                document.body.appendChild(element);
                element.style.position = 'absolute';
            }

            element.style.left = `${newBodyX * bayRect.scale}px`;
            element.style.top = `${newBodyY * bayRect.scale}px`;
        }

        updateDistanceInfo();
    }

    function stopDrag(e) {
        if (!isDragging) return;

        const isTouchEvent = e.type.startsWith('touch');
        const endClientX = isTouchEvent ? e.changedTouches[0].clientX : e.clientX;
        const endClientY = isTouchEvent ? e.changedTouches[0].clientY : e.clientY;

        const movedDistance = Math.sqrt(
            Math.pow(endClientX - startClientX, 2) +
            Math.pow(endClientY - startClientY, 2)
        );

        const isTap = movedDistance < 5 && !dragStarted;

        if (isTouchEvent && isTap) {
            const currentTime = new Date().getTime();
            if (currentTime - lastTapTime < DOUBLE_TAP_THRESHOLD) {
                showContextMenu(e, element);
                lastTapTime = 0;
            } else {
                lastTapTime = currentTime;
                if (element.dataset.inBay === "true") {
                    loadProductInfoFromTire(element);
                }
            }
        } else if (!isTouchEvent && isTap) {
            if (element.dataset.inBay === "true") {
                loadProductInfoFromTire(element);
            }
        }

        isDragging = false;
        dragStarted = false;
        element.dataset.isDragging = 'false';
        element.style.cursor = 'grab';

        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchmove', drag);
        document.removeEventListener('touchend', stopDrag);

        if (element.style.left !== initialPosition.left ||
            element.style.top !== initialPosition.top ||
            (element.parentNode.id === 'loading-bay' ? initialPosition.parent !== 'loading-bay' : initialPosition.parent === 'loading-bay')) {
            saveState();
        }

        updateDistanceInfo();
    }
}

function updateHistoryButtons() {
    undoBtn.disabled = historyIndex <= 0;
    redoBtn.disabled = historyIndex >= history.length - 1;
}

function saveState(isInit = false) {
    if (historyIndex < history.length - 1) {
        history = history.slice(0, historyIndex + 1);
    }

    const state = {
        tires: [],
        bayLength: BAY_LENGTH_MM,
        tireCounter: tireCounter
    };

    document.querySelectorAll('.tire').forEach(tire => {
        const inBay = tire.dataset.inBay === "true";

        state.tires.push({
            id: tire.id,
            x: parseFloat(tire.style.left),
            y: parseFloat(tire.style.top),
            diameterMM: parseFloat(tire.dataset.diameterMm),
            productCode: tire.dataset.productCode || '',
            inBay: inBay
        });
    });

    history.push(JSON.stringify(state));
    historyIndex++;
    updateHistoryButtons();
}

function loadState(index) {
    if (index < 0 || index >= history.length) return;

    historyIndex = index;
    const stateString = history[historyIndex];
    const state = JSON.parse(stateString);

    document.querySelectorAll('.tire').forEach(tire => tire.remove());

    let maxTireId = 0;

    const loadingBay = document.getElementById('loading-bay');

    state.tires.forEach(tireData => {
        const idNum = parseInt(tireData.id.split('-')[1], 10);
        if (idNum > maxTireId) maxTireId = idNum;

        const productData = TIRE_DATA.find(item => item.code === tireData.productCode) || null;

        const newTire = createTire(tireData.x, tireData.y, tireData.diameterMM, productData);

        if (newTire) {
            newTire.id = tireData.id;

            if (tireData.inBay) {
                newTire.dataset.inBay = "true";
                loadingBay.appendChild(newTire);
            } else {
                newTire.dataset.inBay = "false";
                document.body.appendChild(newTire);
            }
        }
    });

    tireCounter = maxTireId;

    updateTireCount();
    updateDistanceInfo();
    updateHistoryButtons();
}

function drawGuides() {
    const loadingBay = document.getElementById('loading-bay');
    loadingBay.querySelectorAll('.guide-line').forEach(line => line.remove());
    const SNAP_GRID_MM = 1000;
    for (let mm = 0; mm <= BAY_LENGTH_MM; mm += SNAP_GRID_MM) {
        const px = mm / SCALE_FACTOR;
        if (mm > 0 && mm < BAY_LENGTH_MM) {
            const line = document.createElement('div');
            line.classList.add('guide-line');
            line.style.top = `${px}px`;
            loadingBay.appendChild(line);
        }
    }
}

function resolveCollisions(relX, relY, diameter, currentTire) {
    const loadingBay = document.getElementById('loading-bay');
    const radius = diameter / 2;
    let currentCenter = { x: relX + radius, y: relY + radius };
    let currentPos = clampToBay(relX, relY, diameter);
    currentCenter = { x: currentPos.x + radius, y: currentPos.y + radius };
    const ITERATIONS = 3;
    for (let i = 0; i < ITERATIONS; i++) {
        let hasCollided = false;
        loadingBay.querySelectorAll('.tire[data-in-bay="true"]').forEach(otherTire => {
            if (otherTire.id === currentTire.id) return;
            const otherRadius = parseFloat(otherTire.dataset.radiusPx);
            const otherX = parseFloat(otherTire.style.left);
            const otherY = parseFloat(otherTire.style.top);
            const otherCenter = { x: otherX + otherRadius, y: otherY + otherRadius };
            const requiredDistance = radius + otherRadius;
            let dx = currentCenter.x - otherCenter.x;
            let dy = currentCenter.y - otherCenter.y;
            const actualDistance = Math.sqrt(dx * dx + dy * dy);
            if (actualDistance < requiredDistance) {
                const overlap = requiredDistance - actualDistance;
                hasCollided = true;
                if (actualDistance < 0.001) {
                    dx = 0.001 * Math.random();
                    dy = 0.001 * Math.random();
                    const newDistance = Math.sqrt(dx * dx + dy * dy);
                    const moveX = dx / newDistance * overlap;
                    const moveY = dy / newDistance * overlap;
                    currentCenter.x += moveX;
                    currentCenter.y += moveY;
                } else {
                    const moveX = dx / actualDistance * overlap;
                    const moveY = dy / actualDistance * overlap;
                    currentCenter.x += moveX;
                    currentCenter.y += moveY;
                }
            }
        });
        currentPos = clampToBay(currentCenter.x - radius, currentCenter.y - radius, diameter);
        currentCenter = { x: currentPos.x + radius, y: currentPos.y + radius };
        if (!hasCollided && i > 0) break;
    }
    return { x: currentPos.x, y: currentPos.y };
}

function clampToBay(x, y, diameter) {
    const radius = diameter / 2;
    let centerX = x + radius;
    let centerY = y + radius;

    if (centerX < radius) centerX = radius;
    if (centerX > BAY_WIDTH_PX - radius) centerX = BAY_WIDTH_PX - radius;
    if (centerY < radius) centerY = radius;
    if (centerY > BAY_LENGTH_PX - radius) centerY = BAY_LENGTH_PX - radius;

    const clampedX = centerX - radius;
    const clampedY = centerY - radius;

    return { x: clampedX, y: clampedY };
}

function adjustResponsive() {
    const loadingBay = document.getElementById('loading-bay');
    const originalScaleFactor = 10;
    const originalBayWidthPx = 2400 / originalScaleFactor;
    const originalBayWidthMm = 2400;

    if (window.innerWidth <= 600) {
        BAY_WIDTH_PX = 190;
        SCALE_FACTOR = originalBayWidthMm / BAY_WIDTH_PX;
    } else {
        BAY_WIDTH_PX = originalBayWidthPx;
        SCALE_FACTOR = originalScaleFactor;
    }

    if (BAY_LENGTH_MM > 0) {
        BAY_LENGTH_PX = BAY_LENGTH_MM / SCALE_FACTOR;
        loadingBay.style.height = `${BAY_LENGTH_PX}px`;
        loadingBay.style.width = `${BAY_WIDTH_PX}px`;
        drawGuides();
        document.querySelectorAll('.tire').forEach(tire => {
            const diameterMM = parseFloat(tire.dataset.diameterMm);
            const newDiameterPx = diameterMM / SCALE_FACTOR;
            tire.style.width = `${newDiameterPx}px`;
            tire.style.height = `${newDiameterPx}px`;
            tire.dataset.diameterPx = newDiameterPx;
            tire.dataset.radiusPx = newDiameterPx / 2;
            adjustTireLabelSizes(tire, newDiameterPx);
            const clampedPos = clampToBay(parseFloat(tire.style.left), parseFloat(tire.style.top), newDiameterPx);
            tire.style.left = `${clampedPos.x}px`;
            tire.style.top = `${clampedPos.y}px`;
        });
    }
    updateDistanceInfo();
}

function toggleScale() {
    const truckContainer = document.querySelector('.truck-container');
    if (isScaledDown) {
        truckContainer.style.transform = 'scale(1)';
        isScaledDown = false;
    } else {
        const viewportHeight = window.innerHeight * 0.95;
        const scaleFactor = viewportHeight / BAY_LENGTH_PX;
        truckContainer.style.transform = `scale(${scaleFactor})`;
        isScaledDown = true;
    }
    updateToggleButtonText();
}

function updateToggleButtonText() {
    toggleScaleBtn.textContent = isScaledDown ? '通常表示' : '全体表示';
}

window.addEventListener('resize', adjustResponsive);

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded, initializing...');
    initializeContextMenuListeners();
    document.getElementById('startup-dialog').style.display = 'flex';
    updateToggleButtonText();
    loadCsvData().then(() => console.log('Initialization complete'));
});