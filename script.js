document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const tableElements = [
        document.getElementById('table1'),
        document.getElementById('table2'),
        document.getElementById('table3')
    ];
    const playerSlotTemplate = document.getElementById('player-slot-template');
    const noteChungInput = document.getElementById('note-chung');
    const notePfInput = document.getElementById('note-pf');
    const noteFlopInput = document.getElementById('note-flop');
    const noteTurnInput = document.getElementById('note-turn');
    const noteRiverInput = document.getElementById('note-river');
    const noteBpInput = document.getElementById('note-bp');
    const allNoteTextareas = [noteChungInput, notePfInput, noteFlopInput, noteTurnInput, noteRiverInput, noteBpInput];
    const colorSelectDropdown = document.getElementById('color-select'); // UPDATED
    const addNameBtn = document.getElementById('add-name-btn');
    const statusMessageEl = document.getElementById('status-message');

    const setupCropRegionsBtn = document.getElementById('setup-crop-regions-btn');
    const cropSetupModal = document.getElementById('crop-setup-modal');
    const closeModalBtn = cropSetupModal.querySelector('.close-modal-btn');
    const setupImageUpload = document.getElementById('setup-image-upload');
    const setupCanvas = document.getElementById('setup-canvas');
    const setupCtx = setupCanvas.getContext('2d');
    const cropPreviewsContainer = document.getElementById('crop-previews');
    const resetRegionsBtn = document.getElementById('reset-regions-btn');
    const acceptCropRegionsBtn = document.getElementById('accept-crop-regions-btn');
    const setupStatusMessageEl = document.getElementById('setup-status-message');

    const runtimeCroppedOutputContainers = {
        table1: document.getElementById('runtime-cropped-output-table1'),
        table2: document.getElementById('runtime-cropped-output-table2'),
        table3: document.getElementById('runtime-cropped-output-table3'),
    };
    const runtimeCropDisplays = {
        table1: document.getElementById('runtime-crop-display-table1'),
        table2: document.getElementById('runtime-crop-display-table2'),
        table3: document.getElementById('runtime-crop-display-table3'),
    };
    const reprocessOcrBtns = {
        table1: document.getElementById('reprocess-ocr-btn-table1'),
        table2: document.getElementById('reprocess-ocr-btn-table2'),
        table3: document.getElementById('reprocess-ocr-btn-table3'),
    };

    // --- Constants and State ---
    const POKER_NOTES_DB_KEY = 'pokerNotesDB_v4';
    const CROP_CONFIG_KEY = 'pokerCropConfig_v3';
    const OCR_LANGUAGES_FOR_WORKER = 'eng+chi_sim';
    const MAX_CROP_REGIONS = 7;
    const SLOT_GRID_POSITIONS = [
        { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 },
        { row: 2, col: 1 }, { row: 2, col: 2, isPasteTarget: true },
        { row: 2, col: 3 }, { row: 3, col: 1 }, { row: 3, col: 3 }
    ];
    const COLORS = ["red", "blue", "green", "yellow", "orange", "purple", "pink", "lightblue", "lightgreen", "white"];
    const VALID_OCR_CHARS_REGEX = /[^\p{L}\p{N}]/gu;
    const VALID_OCR_CHARS_REGEX_FALLBACK = /[^a-zA-Z0-9\u4e00-\u9fa5]/g;


    let playersDB = [];
    let activeSlotElement = null;
    let selectedColorForNewPlayer = null;
    let fuseInstance = null;
    let debounceTimer;
    let noteDebounceTimer;

    let cropConfig = null;
    let setupImage = null;
    let currentDrawnRegions = [];
    let isDrawingRect = false;
    let rectStartX, rectStartY, tempRectToDraw = null;

    const ocrStates = {
        table1: { currentPastedImage: null, currentCroppedImageDataURLs: [] },
        table2: { currentPastedImage: null, currentCroppedImageDataURLs: [] },
        table3: { currentPastedImage: null, currentCroppedImageDataURLs: [] },
    };

    let tesseractWorker = null;
    let isTesseractInitialized = false;

    // --- Initialization ---
    async function initializeApp() {
        loadPlayersFromLocalStorage();
        loadCropConfigFromLocalStorage();
        initializeFuse();
        createColorDropdownOptions(); // UPDATED
        highlightPaletteColor(null); // ADDED to set initial dropdown state
        createPlayerSlots();
        await initializeTesseract();
        setupEventListeners();
        setupCropEventListeners();
        updateAddNameButtonState();
        console.log("PokerNotesApp initialized.");
    }

    async function initializeTesseract() {
        if (typeof Tesseract === 'undefined') {
            console.error("Tesseract.js not loaded.");
            displayStatusMessage("Lỗi: Không thể tải thư viện OCR.", true);
            isTesseractInitialized = false;
            return;
        }
        try {
            if (!isTesseractInitialized) {
                displayStatusMessage(`Đang khởi tạo OCR (${OCR_LANGUAGES_FOR_WORKER})...`, false);
                tesseractWorker = await Tesseract.createWorker(OCR_LANGUAGES_FOR_WORKER, 1, {
                    // logger: m => console.log(m.status)
                });
                isTesseractInitialized = true;
                displayStatusMessage(`OCR (${OCR_LANGUAGES_FOR_WORKER}) đã sẵn sàng.`, false);
                console.log(`Tesseract worker initialized with: ${OCR_LANGUAGES_FOR_WORKER}.`);
            }
        } catch (error) {
            console.error("Tesseract worker initialization error:", error);
            displayStatusMessage(`Lỗi khởi tạo OCR. Kiểm tra console.`, true);
            isTesseractInitialized = false;
        }
    }

    // --- Data Persistence ---
    function loadPlayersFromLocalStorage() {
        const storedData = localStorage.getItem(POKER_NOTES_DB_KEY);
        if (storedData) {
            try {
                playersDB = JSON.parse(storedData);
                if (!Array.isArray(playersDB)) playersDB = [];
                playersDB.forEach(player => {
                    player.vpip = player.vpip || '';
                    player.pfr = player.pfr || '';
                    player.hands = player.hands || '';
                    player.notes = player.notes || { chung: '', pf: '', flop: '', turn: '', river: '', bp: '' };
                    if (player.tableStats) delete player.tableStats;
                });
            } catch (e) { console.error("Error parsing playersDB:", e); playersDB = []; }
        }
    }
    function savePlayersToLocalStorage() {
        try { localStorage.setItem(POKER_NOTES_DB_KEY, JSON.stringify(playersDB)); }
        catch (e) { console.error("Error saving playersDB:", e); displayStatusMessage("Lỗi lưu dữ liệu.", true); }
    }
    function loadCropConfigFromLocalStorage() {
        const storedConfig = localStorage.getItem(CROP_CONFIG_KEY);
        if (storedConfig) {
            try {
                const parsed = JSON.parse(storedConfig);
                if (parsed.regions && Array.isArray(parsed.regions) &&
                    typeof parsed.setupImageOriginalWidth === 'number' &&
                    typeof parsed.setupImageOriginalHeight === 'number') {
                    cropConfig = parsed;
                    if (cropConfig.regionSettings) delete cropConfig.regionSettings;
                } else { cropConfig = null; }
            } catch (e) { console.error("Error parsing cropConfig:", e); cropConfig = null; }
        }
    }
    function saveCropConfigToLocalStorage() {
        if (cropConfig) {
            const configToSave = { ...cropConfig };
            delete configToSave.regionSettings;
            localStorage.setItem(CROP_CONFIG_KEY, JSON.stringify(configToSave));
            displaySetupStatusMessage("Đã lưu cấu hình vùng cắt!", false);
        }
    }

    // --- Fuse.js Search ---
    function initializeFuse() {
        fuseInstance = new Fuse([], { keys: ['name'], threshold: 0.3, includeScore: true, minMatchCharLength: 1 });
        if (playersDB.length > 0) fuseInstance.setCollection(playersDB);
    }

    // --- UI Creation ---
    // NEW HELPER FUNCTION
    function getTextColorForBackground(bgColor) {
        if (!bgColor) return '#ecf0f1'; // Default text color for default background
        const lightColors = ["white", "yellow", "lightgreen", "lightblue", "pink"];
        return lightColors.includes(bgColor.toLowerCase()) ? "black" : "white";
    }

    // REPLACED createColorPalette with this
    function createColorDropdownOptions() {
        colorSelectDropdown.innerHTML = '';

        const placeholderOption = document.createElement('option');
        placeholderOption.value = "";
        placeholderOption.textContent = "Chọn màu...";
        // Ensure placeholder style matches the dropdown's default
        const dropdownComputedStyle = getComputedStyle(colorSelectDropdown);
        placeholderOption.style.backgroundColor = dropdownComputedStyle.backgroundColor;
        placeholderOption.style.color = dropdownComputedStyle.color;
        colorSelectDropdown.appendChild(placeholderOption);

        COLORS.forEach(color => {
            const option = document.createElement('option');
            option.value = color;
            option.textContent = color.charAt(0).toUpperCase() + color.slice(1);
            option.style.backgroundColor = color;
            option.style.color = getTextColorForBackground(color);
            colorSelectDropdown.appendChild(option);
        });

        colorSelectDropdown.addEventListener('change', (event) => {
            const selectedValue = event.target.value;
            handleColorSelection(selectedValue); // This will update selectedColorForNewPlayer or player's color

            // Update the dropdown's own appearance
            if (selectedValue) {
                event.target.style.backgroundColor = selectedValue;
                event.target.style.color = getTextColorForBackground(selectedValue);
            } else {
                // Reset to placeholder style
                event.target.style.backgroundColor = placeholderOption.style.backgroundColor;
                event.target.style.color = placeholderOption.style.color;
            }
        });
    }


    function createPlayerSlots() {
        tableElements.forEach((tableEl) => {
            const tableId = tableEl.id;
            tableEl.innerHTML = '';
            SLOT_GRID_POSITIONS.forEach((pos, slotIndex) => {
                const slotClone = playerSlotTemplate.content.cloneNode(true);
                const playerSlotDiv = slotClone.querySelector('.player-slot');
                playerSlotDiv.dataset.tableId = tableId;
                playerSlotDiv.dataset.slotIndex = slotIndex;
                playerSlotDiv.style.gridRowStart = pos.row;
                playerSlotDiv.style.gridColumnStart = pos.col;

                if (pos.isPasteTarget) {
                    playerSlotDiv.classList.add('paste-target');
                    playerSlotDiv.querySelector('.player-name-wrapper').style.display = 'none';
                    playerSlotDiv.querySelector('.player-stats-inputs').style.display = 'none';
                    playerSlotDiv.addEventListener('paste', (event) => handleImagePasteFromSlot(event, tableId));
                } else {
                    const nameInput = playerSlotDiv.querySelector('.player-name-input');
                    nameInput.addEventListener('focus', () => setActiveSlot(playerSlotDiv));
                    nameInput.addEventListener('input', (e) => handleNameInput(e.target, playerSlotDiv));
                    nameInput.addEventListener('blur', () => setTimeout(() => {
                        const nameWrapper = nameInput.closest('.player-name-wrapper');
                        if (nameWrapper) {
                            const dropdown = nameWrapper.querySelector('.search-results-dropdown');
                            if (dropdown && !dropdown.contains(document.activeElement)) {
                                hideSearchResults(playerSlotDiv);
                            }
                        }
                    }, 150));
                    nameInput.addEventListener('keydown', (event) => {
                        handleDropdownKeyDown(event, nameInput, playerSlotDiv);
                    });
                    playerSlotDiv.querySelectorAll('.stat-input').forEach(input => {
                        let statDebounce;
                        input.addEventListener('input', () => {
                            clearTimeout(statDebounce);
                            statDebounce = setTimeout(() => updatePlayerStatsFromSlot(playerSlotDiv), 750);
                        });
                        input.addEventListener('blur', () => updatePlayerStatsFromSlot(playerSlotDiv));
                    });
                }
                tableEl.appendChild(slotClone);
            });
        });
        initializeCropPreviewPlaceholders();
    }

    // --- Player Slot Interactions ---
    function setActiveSlot(slotElement) {
        if (activeSlotElement && activeSlotElement !== slotElement) {
            activeSlotElement.classList.remove('active-slot');
            autoSaveNotes();
            const prevNameInput = activeSlotElement.querySelector('.player-name-input');
            if (prevNameInput && prevNameInput.value.trim() === '' && activeSlotElement.dataset.playerId) {
                clearSlotUIAssociation(activeSlotElement);
            }
        }
        if (slotElement.classList.contains('paste-target')) {
            activeSlotElement = null;
            clearPlayerInfo();
            highlightPaletteColor(null); // UPDATED
            updateAddNameButtonState();
            return;
        }
        activeSlotElement = slotElement;
        activeSlotElement.classList.add('active-slot');
        const playerId = activeSlotElement.dataset.playerId;
        if (playerId) {
            const player = playersDB.find(p => p.id === playerId);
            if (player) {
                displayPlayerInfo(player);
                highlightPaletteColor(player.color); // UPDATED
                selectedColorForNewPlayer = null;
            } else {
                clearPlayerInfo(); clearSlotUIAssociation(activeSlotElement);
                highlightPaletteColor(null); // UPDATED
            }
        } else {
            clearPlayerInfo();
            highlightPaletteColor(selectedColorForNewPlayer); // UPDATED
        }
        updateAddNameButtonState();
    }


    function clearSlotUIAssociation(slotElement) {
        if (slotElement.classList.contains('paste-target')) return;
        delete slotElement.dataset.playerId;
        const nameInput = slotElement.querySelector('.player-name-input');
        if (nameInput) { nameInput.style.backgroundColor = ''; nameInput.style.color = ''; }
        clearSlotStatsInputs(slotElement);
        if (slotElement === activeSlotElement && nameInput && nameInput.value.trim() === '') {
            clearPlayerInfo();
        }
    }

    function handleNameInput(nameInputElement, slotElement) {
        if (slotElement.classList.contains('paste-target')) return;
        const searchTerm = nameInputElement.value.trim();
        const nameWrapper = nameInputElement.closest('.player-name-wrapper');
        const searchResultsDropdown = nameWrapper.querySelector('.search-results-dropdown');

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (searchTerm.length >= 1 && fuseInstance) {
                const results = fuseInstance.search(searchTerm).map(r => r.item);
                displaySearchResults(results, searchResultsDropdown, slotElement);
            } else {
                hideSearchResults(slotElement);
            }
            updateAddNameButtonState();
        }, 250);

        if (searchTerm === '' && slotElement.dataset.playerId) {
            clearSlotUIAssociation(slotElement);
            if (slotElement === activeSlotElement) {
                clearPlayerInfo();
                highlightPaletteColor(selectedColorForNewPlayer); // UPDATED
            }
        }
        updateAddNameButtonState();
    }

    function displaySearchResults(results, dropdownElement, slotElement) {
        dropdownElement.innerHTML = '';
        if (results.length > 0) {
            results.slice(0, 10).forEach(player => {
                const item = document.createElement('div');
                item.className = 'search-result-item';
                item.textContent = player.name;
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    assignPlayerToSlot(player, slotElement);
                    hideSearchResults(slotElement);
                });
                dropdownElement.appendChild(item);
            });
            dropdownElement.style.display = 'block';
        } else {
            dropdownElement.style.display = 'none';
        }
    }

    function hideSearchResults(slotElement) {
        if (slotElement.classList.contains('paste-target')) return;
        const nameWrapper = slotElement.querySelector('.player-name-wrapper');
        if (nameWrapper) {
            const dropdown = nameWrapper.querySelector('.search-results-dropdown');
            if (dropdown) { dropdown.style.display = 'none'; dropdown.innerHTML = ''; }
        }
    }

    function assignPlayerToSlot(player, slotElement) {
        if (slotElement.classList.contains('paste-target')) return;
        const nameInput = slotElement.querySelector('.player-name-input');
        nameInput.value = player.name;
        nameInput.style.backgroundColor = player.color;
        nameInput.style.color = getTextColorForBackground(player.color); // UPDATED
        slotElement.dataset.playerId = player.id;
        loadPlayerStatsIntoSlotUI(player, slotElement);
        if (slotElement === activeSlotElement) {
            displayPlayerInfo(player);
            highlightPaletteColor(player.color); // UPDATED
            selectedColorForNewPlayer = null;
        }
        updateAddNameButtonState();
    }

    function displayPlayerInfo(player) {
        noteChungInput.value = player.notes.chung || '';
        notePfInput.value = player.notes.pf || '';
        noteFlopInput.value = player.notes.flop || '';
        noteTurnInput.value = player.notes.turn || '';
        noteRiverInput.value = player.notes.river || '';
        noteBpInput.value = player.notes.bp || '';
        if (activeSlotElement && activeSlotElement.dataset.playerId === player.id) {
            loadPlayerStatsIntoSlotUI(player, activeSlotElement);
        }
    }
    function clearPlayerInfo() {
        allNoteTextareas.forEach(ta => ta.value = '');
        if (activeSlotElement && !activeSlotElement.classList.contains('paste-target')) {
            clearSlotStatsInputs(activeSlotElement);
        }
    }

    // UPDATED handleColorSelection logic
    function handleColorSelection(newlySelectedColorValue) {
        const actualColorSelected = newlySelectedColorValue || null;

        if (!activeSlotElement || activeSlotElement.classList.contains('paste-target')) {
            selectedColorForNewPlayer = actualColorSelected;
            updateAddNameButtonState();
            if (selectedColorForNewPlayer) {
                displayStatusMessage("Đã chọn màu. Nhập tên và nhấn 'Add Name'.", false);
            }
            // Dropdown UI is handled by its own 'change' listener
            return;
        }

        const playerId = activeSlotElement.dataset.playerId;
        if (playerId) {
            const player = playersDB.find(p => p.id === playerId);
            if (player && actualColorSelected && player.color !== actualColorSelected) {
                player.color = actualColorSelected;
                savePlayersToLocalStorage();
                updatePlayerColorOnAllSlots(player.id, actualColorSelected);
                const nameInput = activeSlotElement.querySelector('.player-name-input');
                nameInput.style.backgroundColor = actualColorSelected;
                nameInput.style.color = getTextColorForBackground(actualColorSelected);
                displayStatusMessage(`Cập nhật màu cho ${player.name}.`, false);
            }
            selectedColorForNewPlayer = null; // If a player is active, new player color intent is cleared
        } else {
            selectedColorForNewPlayer = actualColorSelected;
            if (selectedColorForNewPlayer) {
                displayStatusMessage("Đã chọn màu. Nhập tên và nhấn 'Add Name'.", false);
            }
        }
        updateAddNameButtonState();
        // Dropdown UI is handled by its own 'change' listener
    }

    // UPDATED highlightPaletteColor logic
    function highlightPaletteColor(color) {
        colorSelectDropdown.value = color || ""; // Set the <select>'s value

        const currentValue = colorSelectDropdown.value;
        if (currentValue) {
            colorSelectDropdown.style.backgroundColor = currentValue;
            colorSelectDropdown.style.color = getTextColorForBackground(currentValue);
        } else {
            const placeholderOption = colorSelectDropdown.querySelector('option[value=""]');
            if (placeholderOption) {
                colorSelectDropdown.style.backgroundColor = placeholderOption.style.backgroundColor;
                colorSelectDropdown.style.color = placeholderOption.style.color;
            } else { // Fallback just in case
                const dropdownComputedStyle = getComputedStyle(colorSelectDropdown);
                colorSelectDropdown.style.backgroundColor = dropdownComputedStyle.backgroundColor;
                colorSelectDropdown.style.color = dropdownComputedStyle.color;
            }
        }
    }


    function handleAddName() {
        if (!activeSlotElement || activeSlotElement.classList.contains('paste-target')) {
            displayStatusMessage("Lỗi: Chưa chọn ô slot.", true); return;
        }
        const nameInputEl = activeSlotElement.querySelector('.player-name-input');
        const playerName = nameInputEl.value.trim();
        if (!playerName) { displayStatusMessage("Lỗi: Tên không được trống.", true); return; }

        // Kiểm tra xem người chơi với tên này đã tồn tại trong slot hiện tại chưa.
        // Nếu có, không nên tạo mới mà chỉ cần thông báo.
        const existingPlayerInSlot = activeSlotElement.dataset.playerId ? playersDB.find(p => p.id === activeSlotElement.dataset.playerId) : null;
        if (existingPlayerInSlot && existingPlayerInSlot.name === playerName) {
             displayStatusMessage("Người chơi này đã có trong slot. Để đổi màu, chỉ cần chọn màu từ dropdown.", true); return;
        }
        // Nếu tên nhập vào trùng với một người chơi đã có trong DB nhưng *không* phải người trong slot hiện tại,
        // người dùng nên sử dụng chức năng tìm kiếm để gán, thay vì "Add Name" để tránh tạo trùng.
        // Tuy nhiên, để đơn giản, ta vẫn cho phép tạo, nhưng người dùng cần lưu ý.

        if (!selectedColorForNewPlayer) { displayStatusMessage("Lỗi: Chọn màu cho người chơi mới.", true); return; }

        const newPlayer = {
            id: Date.now().toString(),
            name: playerName,
            // QUAN TRỌNG: Khởi tạo notes trống cho người chơi mới
            notes: { chung: '', pf: '', flop: '', turn: '', river: '', bp: '' },
            color: selectedColorForNewPlayer,
            // Lấy giá trị stats từ input trong slot (nếu có, hoặc sẽ là trống)
            vpip: activeSlotElement.querySelector('.vpip-input').value.trim(),
            pfr: activeSlotElement.querySelector('.pfr-input').value.trim(),
            hands: activeSlotElement.querySelector('.hands-input').value.trim()
        };
        playersDB.push(newPlayer);
        fuseInstance.add(newPlayer);
        savePlayersToLocalStorage();

        const currentActiveSlot = activeSlotElement;

        // Gán người chơi mới vào slot. Hàm này sẽ:
        // - Cập nhật tên, màu sắc, player.id cho slot.
        // - Nếu slot này là activeSlotElement, nó sẽ gọi displayPlayerInfo (để hiển thị notes trống của newPlayer)
        //   và highlightPaletteColor (để cập nhật dropdown màu), và selectedColorForNewPlayer = null.
        assignPlayerToSlot(newPlayer, currentActiveSlot);

        // Cập nhật thông báo, chỉ rõ rằng notes đã được làm trống
        displayStatusMessage(`Thêm người chơi: ${newPlayer.name}. Ghi chú đã được làm trống.`, false);
        
        // updateAddNameButtonState() đã được gọi bên trong assignPlayerToSlot hoặc sẽ được gọi bởi setActiveSlot.
        // Gọi lại ở đây không hại nhưng có thể thừa.

        if (currentActiveSlot) {
            // Đảm bảo slot vẫn active và thông tin người chơi mới được tải.
            // setActiveSlot sẽ gọi lại displayPlayerInfo(newPlayer) và highlightPaletteColor(newPlayer.color).
            setActiveSlot(currentActiveSlot);

            // Đoạn setTimeout này chủ yếu để xử lý dropdown tìm kiếm, không quá quan trọng cho yêu cầu hiện tại
            // nhưng giữ lại cũng không sao.
            const updatedNameInputEl = currentActiveSlot.querySelector('.player-name-input');
            if (updatedNameInputEl) {
                setTimeout(() => {
                    handleNameInput(updatedNameInputEl, currentActiveSlot);
                }, 50); // delay nhỏ để đảm bảo DOM cập nhật
            }
            noteChungInput.focus(); // Focus vào ô note đầu tiên để người dùng có thể nhập liệu ngay
        }
    }

    function updatePlayerColorOnAllSlots(playerId, newColor) {
        document.querySelectorAll(`.player-slot[data-player-id="${playerId}"]`).forEach(slot => {
            if (slot.classList.contains('paste-target')) return;
            const nameInput = slot.querySelector('.player-name-input');
            nameInput.style.backgroundColor = newColor;
            nameInput.style.color = getTextColorForBackground(newColor); // UPDATED
        });
    }

    function autoSaveNotes() {
        clearTimeout(noteDebounceTimer);
        noteDebounceTimer = setTimeout(() => {
            if (!activeSlotElement || activeSlotElement.classList.contains('paste-target') || !activeSlotElement.dataset.playerId) return;
            const player = playersDB.find(p => p.id === activeSlotElement.dataset.playerId);
            if (player) {
                let changed = false;
                const newNotes = { chung: noteChungInput.value.trim(), pf: notePfInput.value.trim(), flop: noteFlopInput.value.trim(), turn: noteTurnInput.value.trim(), river: noteRiverInput.value.trim(), bp: noteBpInput.value.trim() };
                for (const key in newNotes) {
                    if (player.notes[key] !== newNotes[key]) { player.notes[key] = newNotes[key]; changed = true; }
                }
                if (changed) { savePlayersToLocalStorage(); console.log(`Notes saved for ${player.name}`); }
            }
        }, 1000);
    }

    function updatePlayerStatsFromSlot(slotElement) {
        if (!slotElement || slotElement.classList.contains('paste-target') || !slotElement.dataset.playerId) return;
        const player = playersDB.find(p => p.id === slotElement.dataset.playerId);
        if (!player) return;
        const vpip = slotElement.querySelector('.vpip-input').value.trim();
        const pfr = slotElement.querySelector('.pfr-input').value.trim();
        const hands = slotElement.querySelector('.hands-input').value.trim();
        let changed = false;
        if (player.vpip !== vpip) { player.vpip = vpip; changed = true; }
        if (player.pfr !== pfr) { player.pfr = pfr; changed = true; }
        if (player.hands !== hands) { player.hands = hands; changed = true; }
        if (changed) { savePlayersToLocalStorage(); console.log(`Stats updated for ${player.name}`); }
    }

    function loadPlayerStatsIntoSlotUI(player, slotElement) {
        if (!player || !slotElement || slotElement.classList.contains('paste-target')) return;
        slotElement.querySelector('.vpip-input').value = player.vpip || '';
        slotElement.querySelector('.pfr-input').value = player.pfr || '';
        slotElement.querySelector('.hands-input').value = player.hands || '';
    }
    function clearSlotStatsInputs(slotElement) {
        if (!slotElement || slotElement.classList.contains('paste-target')) return;
        slotElement.querySelector('.vpip-input').value = '';
        slotElement.querySelector('.pfr-input').value = '';
        slotElement.querySelector('.hands-input').value = '';
    }

    function updateAddNameButtonState() {
        const nameInput = activeSlotElement && !activeSlotElement.classList.contains('paste-target') ? activeSlotElement.querySelector('.player-name-input') : null;
        const nameVal = nameInput ? nameInput.value.trim() : "";
        const playerAssigned = activeSlotElement ? !!activeSlotElement.dataset.playerId : false;
        let enable = false;
        if (nameVal && selectedColorForNewPlayer && activeSlotElement && !activeSlotElement.classList.contains('paste-target')) {
            if (!playerAssigned || (playerAssigned && playersDB.find(p => p.id === activeSlotElement.dataset.playerId)?.name !== nameVal)) {
                enable = true;
            }
        }
        addNameBtn.disabled = !enable;
    }

    function displayStatusMessage(message, isError = false, duration = 3000) {
        statusMessageEl.textContent = message;
        statusMessageEl.className = `status-message ${isError ? 'error' : 'success'}`;
        setTimeout(() => { statusMessageEl.textContent = ''; statusMessageEl.className = 'status-message'; }, duration);
    }

    // --- Crop Setup Modal ---
    function displaySetupStatusMessage(message, isError = false) {
        setupStatusMessageEl.textContent = message;
        setupStatusMessageEl.className = `status-message ${isError ? 'error' : 'success'}`;
        setTimeout(() => { setupStatusMessageEl.textContent = ''; setupStatusMessageEl.className = 'status-message'; }, 4000);
    }
    function openCropSetupModal() {
        cropSetupModal.style.display = 'block';
        resetCropSetupState();
        if (cropConfig && cropConfig.regions.length === MAX_CROP_REGIONS) {
            displaySetupStatusMessage("Đã có cấu hình. Tải ảnh để xem hoặc vẽ lại.", false);
        }
    }
    function closeCropSetupModal() { cropSetupModal.style.display = 'none'; }
    function resetCropSetupState() {
        setupImageUpload.value = '';
        setupCtx.clearRect(0, 0, setupCanvas.width, setupCanvas.height);
        setupCanvas.width = 300; setupCanvas.height = 150;
        setupImage = null; currentDrawnRegions = []; isDrawingRect = false; tempRectToDraw = null;
        acceptCropRegionsBtn.disabled = true; initializeCropPreviewPlaceholders();
        displaySetupStatusMessage("");
    }
    function initializeCropPreviewPlaceholders() {
        cropPreviewsContainer.innerHTML = '';
        for (let i = 0; i < MAX_CROP_REGIONS; i++) {
            const div = document.createElement('div');
            div.className = 'crop-preview-item';
            div.textContent = `Vùng ${i + 1}`;
            div.id = `crop-preview-${i}`;
            cropPreviewsContainer.appendChild(div);
        }
    }
    function handleSetupImageUpload(event) {
        const file = event.target.files[0];
        if (!file || !file.type.startsWith('image/')) {
            displaySetupStatusMessage("Chọn file ảnh hợp lệ.", true); setupImage = null; return;
        }
        const reader = new FileReader();
        reader.onload = e => {
            setupImage = new Image();
            setupImage.onload = () => {
                const MAX_W = setupCanvas.parentElement.clientWidth - 2; const MAX_H = 500;
                let dW = setupImage.naturalWidth, dH = setupImage.naturalHeight;
                if (dW > MAX_W) { const r = MAX_W / dW; dW = MAX_W; dH *= r; }
                if (dH > MAX_H) { const r = MAX_H / dH; dH = MAX_H; dW *= r; }
                setupCanvas.width = dW; setupCanvas.height = dH;
                currentDrawnRegions = []; redrawSetupCanvas();
                acceptCropRegionsBtn.disabled = true; initializeCropPreviewPlaceholders();
                displaySetupStatusMessage(`Ảnh đã tải. Vẽ ${MAX_CROP_REGIONS} vùng.`, false);
            };
            setupImage.onerror = () => { displaySetupStatusMessage("Lỗi tải ảnh.", true); setupImage = null; };
            setupImage.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    function redrawSetupCanvas() {
        if (!setupImage) { setupCtx.clearRect(0, 0, setupCanvas.width, setupCanvas.height); return; }
        setupCtx.clearRect(0, 0, setupCanvas.width, setupCanvas.height);
        setupCtx.drawImage(setupImage, 0, 0, setupCanvas.width, setupCanvas.height);
        setupCtx.strokeStyle = 'rgba(52, 152, 219, 0.8)'; setupCtx.lineWidth = 2;
        setupCtx.font = "bold 14px Arial"; setupCtx.fillStyle = 'rgba(52, 152, 219, 1)';
        currentDrawnRegions.forEach((r, i) => {
            setupCtx.strokeRect(r.x, r.y, r.width, r.height);
            setupCtx.fillText((i + 1).toString(), r.x + 5, r.y + 15);
        });
        if (isDrawingRect && tempRectToDraw) {
            setupCtx.strokeStyle = 'rgba(231, 76, 60, 0.7)'; setupCtx.setLineDash([4, 4]);
            setupCtx.strokeRect(tempRectToDraw.x, tempRectToDraw.y, tempRectToDraw.width, tempRectToDraw.height);
            setupCtx.setLineDash([]);
        }
    }
    function getMousePosOnCanvas(event) {
        const rect = setupCanvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    function setupCanvasMouseDown(event) {
        if (!setupImage || currentDrawnRegions.length >= MAX_CROP_REGIONS) {
            if (setupImage) displaySetupStatusMessage(`Đã đủ ${MAX_CROP_REGIONS} vùng.`, true); return;
        }
        isDrawingRect = true; const pos = getMousePosOnCanvas(event);
        rectStartX = pos.x; rectStartY = pos.y;
        tempRectToDraw = { x: rectStartX, y: rectStartY, width: 0, height: 0 };
    }
    function setupCanvasMouseMove(event) {
        if (!isDrawingRect || !setupImage) return;
        const pos = getMousePosOnCanvas(event);
        tempRectToDraw.width = pos.x - rectStartX; tempRectToDraw.height = pos.y - rectStartY;
        redrawSetupCanvas();
    }
    function setupCanvasMouseUp() {
        if (!isDrawingRect || !setupImage || !tempRectToDraw) return;
        isDrawingRect = false;
        const x = Math.min(rectStartX, rectStartX + tempRectToDraw.width);
        const y = Math.min(rectStartY, rectStartY + tempRectToDraw.height);
        const w = Math.abs(tempRectToDraw.width); const h = Math.abs(tempRectToDraw.height);
        tempRectToDraw = null;
        if (w < 5 || h < 5) { redrawSetupCanvas(); return; }
        currentDrawnRegions.push({ x, y, width: w, height: h });
        updateSingleCropPreview(currentDrawnRegions.length - 1); redrawSetupCanvas();
        if (currentDrawnRegions.length === MAX_CROP_REGIONS) {
            acceptCropRegionsBtn.disabled = false;
            displaySetupStatusMessage(`Đủ ${MAX_CROP_REGIONS} vùng. Nhấn "Chấp Nhận".`, false);
        } else {
            acceptCropRegionsBtn.disabled = true;
            displaySetupStatusMessage(`${currentDrawnRegions.length}/${MAX_CROP_REGIONS} vùng.`, false);
        }
    }
    function updateSingleCropPreview(idx) {
        if (!setupImage || idx < 0 || idx >= currentDrawnRegions.length) return;
        const region = currentDrawnRegions[idx];
        const previewEl = document.getElementById(`crop-preview-${idx}`);
        if (!previewEl) return;
        const tempC = document.createElement('canvas'); const tempCtx = tempC.getContext('2d');
        const sX = setupImage.naturalWidth / setupCanvas.width, sY = setupImage.naturalHeight / setupCanvas.height;
        const srcX = region.x * sX, srcY = region.y * sY, srcW = region.width * sX, srcH = region.height * sY;
        tempC.width = srcW; tempC.height = srcH;
        tempCtx.drawImage(setupImage, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
        previewEl.innerHTML = ''; const img = new Image(); img.src = tempC.toDataURL('image/png');
        previewEl.appendChild(img);
    }
    function handleAcceptAndSaveCropRegions() {
        if (currentDrawnRegions.length !== MAX_CROP_REGIONS || !setupImage) {
            displaySetupStatusMessage(`Cần ${MAX_CROP_REGIONS} vùng.`, true); return;
        }
        const sX = setupImage.naturalWidth / setupCanvas.width, sY = setupImage.naturalHeight / setupCanvas.height;
        cropConfig = {
            setupImageOriginalWidth: setupImage.naturalWidth,
            setupImageOriginalHeight: setupImage.naturalHeight,
            regions: currentDrawnRegions.map(r => ({
                x: Math.round(r.x * sX), y: Math.round(r.y * sY),
                width: Math.round(r.width * sX), height: Math.round(r.height * sY)
            }))
        };
        saveCropConfigToLocalStorage(); closeCropSetupModal();
        displayStatusMessage("Đã lưu cấu hình vùng cắt!", false);
    }
    function handleResetDrawnRegions() {
        currentDrawnRegions = []; initializeCropPreviewPlaceholders(); redrawSetupCanvas();
        acceptCropRegionsBtn.disabled = true; displaySetupStatusMessage("Đã xóa. Vẽ lại.", false);
    }

    // --- Runtime OCR ---
    function handleImagePasteFromSlot(event, tableId) {
        event.preventDefault();
        if (!cropConfig) {
            displayStatusMessage("Chưa setup vùng cắt.", true); hideOcrSectionForTable(tableId); return;
        }
        const items = (event.clipboardData || window.clipboardData).items;
        let file = null;
        for (let i = 0; i < items.length; i++) { if (items[i].type.includes('image')) { file = items[i].getAsFile(); break; } }
        if (file) {
            const reader = new FileReader();
            reader.onload = e => {
                const img = new Image();
                img.onload = () => {
                    ocrStates[tableId].currentPastedImage = img;
                    ocrStates[tableId].currentCroppedImageDataURLs = [];
                    processPastedImageAndDisplay(tableId);
                };
                img.onerror = () => { displayStatusMessage(`Lỗi tải ảnh paste cho ${tableId}.`, true); hideOcrSectionForTable(tableId); };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        } else {
            displayStatusMessage(`Không có ảnh trong clipboard cho ${tableId}.`, true); hideOcrSectionForTable(tableId);
        }
    }

    function hideOcrSectionForTable(tableId) {
        if (runtimeCroppedOutputContainers[tableId]) runtimeCroppedOutputContainers[tableId].style.display = 'none';
        if (reprocessOcrBtns[tableId]) reprocessOcrBtns[tableId].style.display = 'none';
    }

    function processPastedImageAndDisplay(tableId) {
        const pastedImg = ocrStates[tableId].currentPastedImage;
        if (!pastedImg || !cropConfig || !cropConfig.regions || cropConfig.regions.length !== MAX_CROP_REGIONS) {
            displayStatusMessage(`Lỗi ảnh/cấu hình cho ${tableId}.`, true); return;
        }
        const displayCont = runtimeCropDisplays[tableId];
        const outputCont = runtimeCroppedOutputContainers[tableId];
        const reprocessBtn = reprocessOcrBtns[tableId];

        displayCont.innerHTML = ''; ocrStates[tableId].currentCroppedImageDataURLs = [];
        outputCont.style.display = 'block'; reprocessBtn.style.display = 'block'; reprocessBtn.disabled = false;

        displayStatusMessage(`Cắt ${MAX_CROP_REGIONS} vùng cho ${tableId}. Chọn và nhấn "Xử lý OCR".`, false, 4000);

        if (pastedImg.naturalWidth !== cropConfig.setupImageOriginalWidth || pastedImg.naturalHeight !== cropConfig.setupImageOriginalHeight) {
            displayStatusMessage(`CẢNH BÁO (${tableId}): Kích thước ảnh paste khác ảnh mẫu!`, true, 7000);
        }

        for (let i = 0; i < MAX_CROP_REGIONS; i++) {
            const region = cropConfig.regions[i];
            const tempC = document.createElement('canvas'); const tempCtx = tempC.getContext('2d');
            tempC.width = region.width; tempC.height = region.height;

            const itemDiv = document.createElement('div'); itemDiv.className = 'runtime-crop-item'; itemDiv.dataset.regionIndex = i;
            const imgEl = document.createElement('img');
            const controlsDiv = document.createElement('div'); controlsDiv.className = 'controls';
            const resultTextDiv = document.createElement('div'); resultTextDiv.className = 'ocr-result-text';
            resultTextDiv.id = `ocr-result-${tableId}-${i}`; resultTextDiv.textContent = '(chưa OCR)';

            try {
                tempCtx.drawImage(pastedImg, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
                const dataUrl = tempC.toDataURL('image/png');
                imgEl.src = dataUrl; ocrStates[tableId].currentCroppedImageDataURLs.push(dataUrl);

                const cbEnableLabel = document.createElement('label');
                const cbEnable = document.createElement('input'); cbEnable.type = 'checkbox'; cbEnable.id = `enable-ocr-${tableId}-${i}`; cbEnable.checked = true;
                cbEnableLabel.append(cbEnable, ` OCR vùng ${i + 1}`);

                const cbLangLabel = document.createElement('label');
                const cbLang = document.createElement('input'); cbLang.type = 'checkbox'; cbLang.id = `lang-chinese-${tableId}-${i}`; cbLang.checked = false;
                cbLangLabel.append(cbLang, ' Tiếng Trung'); cbLangLabel.style.display = 'flex';

                cbEnable.addEventListener('change', e => {
                    cbLangLabel.style.display = e.target.checked ? 'flex' : 'none';
                    const resDiv = document.getElementById(`ocr-result-${tableId}-${i}`);
                    if (!e.target.checked) { resDiv.textContent = 'Bỏ qua'; resDiv.className = 'ocr-result-text skipped'; }
                    else { resDiv.textContent = '(chưa OCR)'; resDiv.className = 'ocr-result-text'; }
                });
                controlsDiv.append(cbEnableLabel, cbLangLabel);
            } catch (cropErr) {
                console.error(`Lỗi cắt vùng ${i + 1} cho ${tableId}:`, cropErr);
                imgEl.alt = `Lỗi Cắt ${i + 1}`; resultTextDiv.textContent = `Lỗi Cắt`; resultTextDiv.classList.add('error');
                ocrStates[tableId].currentCroppedImageDataURLs.push(null);
            }
            itemDiv.append(imgEl, controlsDiv, resultTextDiv);
            displayCont.appendChild(itemDiv);
        }
    }

    async function performOcrOnDisplayedRegions(tableId) {
        const croppedURLs = ocrStates[tableId].currentCroppedImageDataURLs;
        if (!isTesseractInitialized || !tesseractWorker || croppedURLs.length !== MAX_CROP_REGIONS) {
            displayStatusMessage(`OCR chưa sẵn sàng/chưa có ảnh cho ${tableId}.`, true);
            if (reprocessOcrBtns[tableId]) reprocessOcrBtns[tableId].disabled = true; return;
        }
        const reprocessBtn = reprocessOcrBtns[tableId];
        if (reprocessBtn) reprocessBtn.disabled = true;

        let opsCount = 0; const promises = []; const resultsToFill = Array(MAX_CROP_REGIONS).fill(null);

        for (let i = 0; i < MAX_CROP_REGIONS; i++) {
            const dataUrl = croppedURLs[i];
            const cbEnable = document.getElementById(`enable-ocr-${tableId}-${i}`);
            const cbLang = document.getElementById(`lang-chinese-${tableId}-${i}`);
            const resDiv = document.getElementById(`ocr-result-${tableId}-${i}`);

            if (!dataUrl || !cbEnable || !cbLang || !resDiv) {
                resultsToFill[i] = { index: i, text: '', ocrPerformed: false, error: true }; continue;
            }
            resDiv.textContent = '...'; resDiv.className = 'ocr-result-text';

            if (cbEnable.checked) {
                opsCount++; const lang = cbLang.checked ? 'chi_sim' : 'eng';
                resDiv.textContent = `OCR (${lang})...`;
                promises.push(
                    tesseractWorker.recognize(dataUrl, {}, { lang })
                        .then(result => {
                            let text = result.data.text.trim().replace(/\s+/g, '');
                            try { text = text.replace(VALID_OCR_CHARS_REGEX, ''); }
                            catch (e) { text = text.replace(VALID_OCR_CHARS_REGEX_FALLBACK, ''); }
                            console.log(`OCR V${i + 1} (${tableId}, ${lang}): "${text}"`);
                            resDiv.textContent = text || '(trống)';
                            resultsToFill[i] = { index: i, text, ocrPerformed: true, languageUsed: lang };
                        })
                        .catch(err => {
                            console.error(`Lỗi OCR V${i + 1} (${tableId}, ${lang}):`, err);
                            resDiv.textContent = `Lỗi OCR`; resDiv.classList.add('error');
                            resultsToFill[i] = { index: i, text: '', error: true, ocrPerformed: true, languageUsed: lang };
                        })
                );
            } else {
                resDiv.textContent = `Bỏ qua`; resDiv.classList.add('skipped');
                resultsToFill[i] = { index: i, text: '', ocrPerformed: false, languageUsed: null };
            }
        }
        if (opsCount > 0) {
            displayStatusMessage(`OCR ${opsCount} vùng cho ${tableId}...`, false);
            await Promise.all(promises);
            displayStatusMessage(`OCR xong cho ${tableId}. Điền vào bảng...`, false);
        } else {
            displayStatusMessage(`Không vùng nào OCR cho ${tableId}.`, false);
        }
        fillOcrResultsIntoTable(resultsToFill.filter(r => r), tableId);
        if (reprocessBtn) reprocessBtn.disabled = false;

        hideOcrSectionForTable(tableId);
    }

    function getSlotElementByRowCol(targetRow, targetCol, tableId) {
        const tableEl = document.getElementById(tableId);
        if (!tableEl) return null;
        const slots = tableEl.querySelectorAll('.player-slot:not(.paste-target)');
        for (const slot of slots) {
            if (parseInt(slot.style.gridRowStart) === targetRow && parseInt(slot.style.gridColumnStart) === targetCol) {
                return slot;
            }
        }
        return null;
    }

    function fillOcrResultsIntoTable(ocrResults, tableId) {
        const mapping = [
            { r: 3, c: 1 }, { r: 2, c: 1 }, { r: 1, c: 1 }, { r: 1, c: 2 },
            { r: 1, c: 3 }, { r: 2, c: 3 }, { r: 3, c: 3 }
        ];
        ocrResults.forEach(res => {
            if (!res || res.index === undefined || res.index >= mapping.length || !res.ocrPerformed) return;
            const pos = mapping[res.index];
            const slot = getSlotElementByRowCol(pos.r, pos.c, tableId);
            if (slot) {
                const nameInput = slot.querySelector('.player-name-input');
                nameInput.value = res.text;
                nameInput.dispatchEvent(new Event('input', { bubbles: true }));
                console.log(`Điền "${res.text}" vào slot R${pos.r}C${pos.c} của ${tableId}`);
            }
        });
        displayStatusMessage(`Hoàn tất điền OCR cho ${tableId}.`, false);
    }

    // --- Event Listeners Setup ---
    function setupEventListeners() {
        addNameBtn.addEventListener('click', handleAddName);
        allNoteTextareas.forEach(ta => {
            ta.addEventListener('input', autoSaveNotes);
            ta.addEventListener('blur', autoSaveNotes);
        });
        Object.keys(reprocessOcrBtns).forEach(tableKey => {
            if (reprocessOcrBtns[tableKey]) {
                reprocessOcrBtns[tableKey].addEventListener('click', () => performOcrOnDisplayedRegions(tableKey));
            }
        });
        document.addEventListener('click', (event) => {
            document.querySelectorAll('.search-results-dropdown[style*="display: block"]').forEach(dropdown => {
                const wrapper = dropdown.closest('.player-name-wrapper');
                if (wrapper && !wrapper.contains(event.target)) {
                    const slot = wrapper.closest('.player-slot');
                    if (slot) hideSearchResults(slot);
                }
            });
        });
    }
    function setupCropEventListeners() {
        setupCropRegionsBtn.addEventListener('click', openCropSetupModal);
        closeModalBtn.addEventListener('click', closeCropSetupModal);
        window.addEventListener('click', e => { if (e.target === cropSetupModal) closeCropSetupModal(); });
        setupImageUpload.addEventListener('change', handleSetupImageUpload);
        setupCanvas.addEventListener('mousedown', setupCanvasMouseDown);
        setupCanvas.addEventListener('mousemove', setupCanvasMouseMove);
        setupCanvas.addEventListener('mouseup', setupCanvasMouseUp);
        setupCanvas.addEventListener('mouseleave', () => { if (isDrawingRect) setupCanvasMouseUp(); });
        resetRegionsBtn.addEventListener('click', handleResetDrawnRegions);
        acceptCropRegionsBtn.addEventListener('click', handleAcceptAndSaveCropRegions);
    }

    function handleDropdownKeyDown(event, nameInputElement, slotElement) {
        const nameWrapper = nameInputElement.closest('.player-name-wrapper');
        const dropdown = nameWrapper.querySelector('.search-results-dropdown');

        if (!dropdown || !slotElement) return;

        if (dropdown.style.display === 'none') {
            if (event.key === 'Enter' && activeSlotElement === slotElement && addNameBtn && !addNameBtn.disabled) {
                event.preventDefault();
                handleAddName();
            }
            return;
        }

        const items = Array.from(dropdown.querySelectorAll('.search-result-item'));

        if (items.length === 0 && event.key !== 'Escape') return;

        let currentIndex = items.findIndex(item => item.classList.contains('highlighted'));

        const updateHighlight = (newIndex) => {
            items.forEach((item, idx) => {
                if (idx === newIndex) {
                    item.classList.add('highlighted');
                    item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                } else {
                    item.classList.remove('highlighted');
                }
            });
        };

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (items.length === 0) return;
            if (currentIndex === -1 || currentIndex === items.length - 1) {
                currentIndex = 0;
            } else {
                currentIndex++;
            }
            updateHighlight(currentIndex);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (items.length === 0) return;
            if (currentIndex === -1 || currentIndex === 0) {
                currentIndex = items.length - 1;
            } else {
                currentIndex--;
            }
            updateHighlight(currentIndex);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (currentIndex !== -1 && items[currentIndex]) {
                items[currentIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            } else {
                hideSearchResults(slotElement);
                if (activeSlotElement === slotElement && addNameBtn && !addNameBtn.disabled) {
                    handleAddName();
                }
            }
            nameInputElement.focus();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            hideSearchResults(slotElement);
            nameInputElement.focus();
        }
    }

    initializeApp();
});