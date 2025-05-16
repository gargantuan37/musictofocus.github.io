document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const tableElements = [
        document.getElementById('table1'),
        document.getElementById('table2'),
        document.getElementById('table3')
    ];
    const playerSlotTemplate = document.getElementById('player-slot-template');

    // Player Info Area
    const noteChungInput = document.getElementById('note-chung');
    const notePfInput = document.getElementById('note-pf');
    const noteFlopInput = document.getElementById('note-flop');
    const noteTurnInput = document.getElementById('note-turn');
    const noteRiverInput = document.getElementById('note-river');
    const noteBpInput = document.getElementById('note-bp');
    const allNoteTextareas = [noteChungInput, notePfInput, noteFlopInput, noteTurnInput, noteRiverInput, noteBpInput];

    // Actions Area
    const colorPaletteContainer = document.getElementById('color-palette');
    const addNameBtn = document.getElementById('add-name-btn');
    const statusMessageEl = document.getElementById('status-message');

    // --- Constants and State ---
    const POKER_NOTES_DB_KEY = 'pokerNotesDB_v4'; // Version for current data structure
    const SLOT_GRID_POSITIONS = [
        { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 },
        { row: 2, col: 1 }, { row: 2, col: 3 },
        { row: 3, col: 1 }, { row: 3, col: 3 }
    ];
    const COLORS = ["red", "blue", "green", "yellow", "orange", "purple", "pink", "lightblue", "lightgreen", "white"];

    let playersDB = [];
    let activeSlotElement = null;
    let selectedColorForNewPlayer = null;
    let fuseInstance = null;
    let debounceTimer;
    let noteDebounceTimer; // For notes auto-save

    // --- Initialization ---
    function initializeApp() {
        loadPlayersFromLocalStorage();
        initializeFuse();
        createColorPalette();
        createPlayerSlots();
        setupEventListeners();
        updateAddNameButtonState();
        console.log("PokerNotesApp initialized. Players loaded:", playersDB.length);
    }

    function loadPlayersFromLocalStorage() {
        const storedData = localStorage.getItem(POKER_NOTES_DB_KEY);
        if (storedData) {
            try {
                playersDB = JSON.parse(storedData);
                if (!Array.isArray(playersDB)) playersDB = [];
                playersDB.forEach(player => {
                    if (player.vpip === undefined) player.vpip = '';
                    if (player.pfr === undefined) player.pfr = '';
                    if (player.hands === undefined) player.hands = '';
                    if (player.notes === undefined) player.notes = { chung: '', pf: '', flop: '', turn: '', river: '', bp: '' }; // Ensure notes obj exists
                    if (player.tableStats) delete player.tableStats; // Migration from v3
                });
            } catch (error) {
                console.error("Error parsing playersDB from LocalStorage:", error);
                playersDB = [];
            }
        } else {
            playersDB = [];
        }
    }

    function savePlayersToLocalStorage() {
        try {
            localStorage.setItem(POKER_NOTES_DB_KEY, JSON.stringify(playersDB));
        } catch (error) {
            console.error("Error saving to LocalStorage:", error);
            displayStatusMessage("Lỗi: Không thể lưu dữ liệu. LocalStorage có thể đã đầy.", true);
        }
    }

    function initializeFuse() {
        fuseInstance = new Fuse([], {
            keys: ['name'],
            threshold: 0.3,
            includeScore: true,
            minMatchCharLength: 2
        });
        if (playersDB.length > 0) {
            fuseInstance.setCollection(playersDB);
        }
    }

    function createColorPalette() {
        COLORS.forEach(color => {
            const button = document.createElement('button');
            button.classList.add('color-button');
            button.dataset.color = color;
            button.style.backgroundColor = color;
            if (color === "white") button.style.border = "1px solid #ccc";
            button.addEventListener('click', () => handleColorSelection(color, button));
            colorPaletteContainer.appendChild(button);
        });
    }

    function createPlayerSlots() {
        tableElements.forEach((tableEl, tableIndex) => {
            tableEl.innerHTML = '';
            SLOT_GRID_POSITIONS.forEach((pos, slotIndexInArray) => {
                const slotClone = playerSlotTemplate.content.cloneNode(true);
                const playerSlotDiv = slotClone.querySelector('.player-slot');

                playerSlotDiv.dataset.tableIndex = tableIndex;
                playerSlotDiv.dataset.slotIndex = slotIndexInArray;
                playerSlotDiv.style.gridRowStart = pos.row;
                playerSlotDiv.style.gridColumnStart = pos.col;

                const nameInput = playerSlotDiv.querySelector('.player-name-input');
                nameInput.addEventListener('focus', () => setActiveSlot(playerSlotDiv));
                nameInput.addEventListener('input', (e) => handleNameInput(e.target, playerSlotDiv));
                nameInput.addEventListener('blur', (e) => {
                    setTimeout(() => {
                        const searchResultsDropdown = playerSlotDiv.querySelector('.search-results-dropdown');
                        if (searchResultsDropdown && !searchResultsDropdown.matches(':hover')) {
                            hideSearchResults(playerSlotDiv);
                        }
                    }, 150);
                });

                const statInputs = playerSlotDiv.querySelectorAll('.stat-input');
                statInputs.forEach(input => {
                    let statDebounceTimer;
                    input.addEventListener('input', () => {
                        clearTimeout(statDebounceTimer);
                        statDebounceTimer = setTimeout(() => updatePlayerStatsFromSlot(playerSlotDiv), 750);
                    });
                    input.addEventListener('blur', () => updatePlayerStatsFromSlot(playerSlotDiv));
                });
                tableEl.appendChild(slotClone);
            });
        });
    }

    function setActiveSlot(slotElement) {
        if (activeSlotElement) {
            activeSlotElement.classList.remove('active-slot');
            autoSaveNotes(); // Save notes for the player in the previously active slot

            const prevNameInput = activeSlotElement.querySelector('.player-name-input');
            if (prevNameInput && prevNameInput.value.trim() === '' && activeSlotElement.dataset.playerId) {
                clearSlotUIAssociation(activeSlotElement);
            }
        }

        activeSlotElement = slotElement;
        activeSlotElement.classList.add('active-slot');
        const playerId = activeSlotElement.dataset.playerId;

        if (playerId) {
            const player = playersDB.find(p => p.id === playerId);
            if (player) {
                displayPlayerInfo(player);
                highlightPaletteColor(player.color);
                selectedColorForNewPlayer = null;
            } else {
                clearPlayerInfo();
                clearSlotUIAssociation(activeSlotElement);
                highlightPaletteColor(null);
            }
        } else {
            clearPlayerInfo();
            highlightPaletteColor(selectedColorForNewPlayer);
        }
        updateAddNameButtonState();
    }

    function clearSlotUIAssociation(slotElement) {
        delete slotElement.dataset.playerId;
        // Do not clear name input value here, user might be typing
        const nameInput = slotElement.querySelector('.player-name-input');
        nameInput.style.backgroundColor = ''; // Reset background
        nameInput.style.color = ''; // Reset text color

        clearSlotStatsInputs(slotElement);

        if (slotElement === activeSlotElement) {
            const nameVal = nameInput.value.trim();
            if (nameVal === '') { // If name is truly empty, clear main panel
                clearPlayerInfo();
            }
        }
    }

    function handleNameInput(nameInputElement, slotElement) {
        const searchTerm = nameInputElement.value.trim();
        const searchResultsDropdown = slotElement.querySelector('.search-results-dropdown');

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (searchTerm.length >= 2 && fuseInstance) {
                const results = fuseInstance.search(searchTerm);
                displaySearchResults(results.map(r => r.item), searchResultsDropdown, slotElement);
            } else {
                hideSearchResults(slotElement);
            }
            updateAddNameButtonState();
        }, 300);

        if (searchTerm === '' && slotElement.dataset.playerId) {
            clearSlotUIAssociation(slotElement);
            if (slotElement === activeSlotElement) {
                clearPlayerInfo();
                highlightPaletteColor(selectedColorForNewPlayer);
            }
        }
        updateAddNameButtonState();
    }

    function displaySearchResults(results, dropdownElement, slotElement) {
        dropdownElement.innerHTML = '';
        if (results.length > 0) {
            results.slice(0, 10).forEach(player => {
                const item = document.createElement('div');
                item.classList.add('search-result-item');
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
        const dropdownElement = slotElement.querySelector('.search-results-dropdown');
        if (dropdownElement) {
            dropdownElement.style.display = 'none';
            dropdownElement.innerHTML = '';
        }
    }

    function assignPlayerToSlot(player, slotElement) {
        const nameInput = slotElement.querySelector('.player-name-input');
        nameInput.value = player.name;
        nameInput.style.backgroundColor = player.color;
        if (["white", "yellow", "lightgreen", "lightblue"].includes(player.color)) {
            nameInput.style.color = "black";
        } else {
            nameInput.style.color = "white";
        }
        slotElement.dataset.playerId = player.id;

        loadPlayerStatsIntoSlotUI(player, slotElement);

        if (slotElement === activeSlotElement) {
            displayPlayerInfo(player);
            highlightPaletteColor(player.color);
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
        allNoteTextareas.forEach(textarea => textarea.value = '');
        if (activeSlotElement) {
            clearSlotStatsInputs(activeSlotElement);
        }
    }

    function handleColorSelection(color, buttonElement) {
        if (!activeSlotElement) {
            displayStatusMessage("Vui lòng chọn một ô slot trước khi chọn màu.", true);
            return;
        }
        const playerIdInActiveSlot = activeSlotElement.dataset.playerId;

        if (playerIdInActiveSlot) {
            const player = playersDB.find(p => p.id === playerIdInActiveSlot);
            if (player && player.color !== color) {
                player.color = color;
                savePlayersToLocalStorage();
                updatePlayerColorOnAllSlots(player.id, color);
                const activeNameInput = activeSlotElement.querySelector('.player-name-input');
                activeNameInput.style.backgroundColor = color;
                if (["white", "yellow", "lightgreen", "lightblue"].includes(color)) {
                    activeNameInput.style.color = "black";
                } else {
                    activeNameInput.style.color = "white";
                }
                displayStatusMessage(`Đã cập nhật màu cho ${player.name}.`, false);
            }
            selectedColorForNewPlayer = null;
        } else {
            selectedColorForNewPlayer = color;
        }
        highlightPaletteColor(color);
        updateAddNameButtonState();
    }

    function highlightPaletteColor(colorToSelect) {
        document.querySelectorAll('.color-button').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.color === colorToSelect);
        });
    }

    function handleAddName() {
        if (!activeSlotElement) {
            displayStatusMessage("Lỗi: Chưa chọn ô slot hoạt động.", true);
            return;
        }
        const nameInputEl = activeSlotElement.querySelector('.player-name-input');
        const playerName = nameInputEl.value.trim();

        if (!playerName) {
            displayStatusMessage("Lỗi: Tên người chơi không được để trống.", true);
            return;
        }

        const existingPlayerIdInSlot = activeSlotElement.dataset.playerId;
        if (existingPlayerIdInSlot) {
            const existingPlayer = playersDB.find(p => p.id === existingPlayerIdInSlot);
            if (existingPlayer && existingPlayer.name === playerName) {
                displayStatusMessage("Người chơi này đã có trong slot. Để sửa, hãy sửa trực tiếp.", true);
                return;
            }
        }

        if (!selectedColorForNewPlayer) {
            displayStatusMessage("Lỗi: Vui lòng chọn một màu cho người chơi mới.", true);
            return;
        }


        const newPlayer = {
            id: Date.now().toString(),
            name: playerName,
            notes: {
                chung: noteChungInput.value.trim(),
                pf: notePfInput.value.trim(),
                flop: noteFlopInput.value.trim(),
                turn: noteTurnInput.value.trim(),
                river: noteRiverInput.value.trim(),
                bp: noteBpInput.value.trim()
            },
            color: selectedColorForNewPlayer,
            vpip: activeSlotElement.querySelector('.vpip-input').value.trim(),
            pfr: activeSlotElement.querySelector('.pfr-input').value.trim(),
            hands: activeSlotElement.querySelector('.hands-input').value.trim()
        };

        playersDB.push(newPlayer);
        fuseInstance.setCollection(playersDB);
        savePlayersToLocalStorage();

        assignPlayerToSlot(newPlayer, activeSlotElement);
        displayStatusMessage(`Đã thêm người chơi: ${newPlayer.name}.`, false);

        selectedColorForNewPlayer = null;
        // highlightPaletteColor(null); // Debatable: clear selection or keep for next?
        updateAddNameButtonState();
    }

    function updatePlayerColorOnAllSlots(playerId, newColor) {
        document.querySelectorAll(`.player-slot[data-player-id="${playerId}"]`).forEach(slotDiv => {
            const nameInput = slotDiv.querySelector('.player-name-input');
            nameInput.style.backgroundColor = newColor;
            if (["white", "yellow", "lightgreen", "lightblue"].includes(newColor)) {
                nameInput.style.color = "black";
            } else {
                nameInput.style.color = "white";
            }
        });
    }

    function autoSaveNotes() {
        clearTimeout(noteDebounceTimer); // Clear previous timer
        noteDebounceTimer = setTimeout(() => {
            if (!activeSlotElement || !activeSlotElement.dataset.playerId) {
                return;
            }
            const playerId = activeSlotElement.dataset.playerId;
            const player = playersDB.find(p => p.id === playerId);

            if (player) {
                let notesChanged = false;
                const newNotes = {
                    chung: noteChungInput.value.trim(),
                    pf: notePfInput.value.trim(),
                    flop: noteFlopInput.value.trim(),
                    turn: noteTurnInput.value.trim(),
                    river: noteRiverInput.value.trim(),
                    bp: noteBpInput.value.trim()
                };

                for (const key in newNotes) {
                    if (player.notes[key] !== newNotes[key]) {
                        player.notes[key] = newNotes[key];
                        notesChanged = true;
                    }
                }

                if (notesChanged) {
                    savePlayersToLocalStorage();
                    console.log(`Notes saved for ${player.name}`);
                }
            }
        }, 1000); // Debounce time for notes saving
    }


    function updatePlayerStatsFromSlot(slotElement) {
        if (!slotElement) return;
        const playerId = slotElement.dataset.playerId;
        if (!playerId) return;

        const player = playersDB.find(p => p.id === playerId);
        if (!player) {
            console.warn(`Player with ID ${playerId} not found for updating stats.`);
            return;
        }

        const vpipVal = slotElement.querySelector('.vpip-input').value.trim();
        const pfrVal = slotElement.querySelector('.pfr-input').value.trim();
        const handsVal = slotElement.querySelector('.hands-input').value.trim();

        let statsChanged = false;
        if (player.vpip !== vpipVal) { player.vpip = vpipVal; statsChanged = true; }
        if (player.pfr !== pfrVal) { player.pfr = pfrVal; statsChanged = true; }
        if (player.hands !== handsVal) { player.hands = handsVal; statsChanged = true; }

        if (statsChanged) {
            savePlayersToLocalStorage();
            console.log(`Stats updated for player ${player.name}`);
        }
    }

    function loadPlayerStatsIntoSlotUI(player, slotElement) {
        if (!player || !slotElement) return;
        slotElement.querySelector('.vpip-input').value = player.vpip || '';
        slotElement.querySelector('.pfr-input').value = player.pfr || '';
        slotElement.querySelector('.hands-input').value = player.hands || '';
    }

    function clearSlotStatsInputs(slotElement) {
        if (!slotElement) return;
        slotElement.querySelector('.vpip-input').value = '';
        slotElement.querySelector('.pfr-input').value = '';
        slotElement.querySelector('.hands-input').value = '';
    }

    function updateAddNameButtonState() {
        const nameInActiveSlot = activeSlotElement ? activeSlotElement.querySelector('.player-name-input').value.trim() : "";
        const isPlayerAssignedToSlot = activeSlotElement ? !!activeSlotElement.dataset.playerId : false;
        let enableButton = false;

        if (nameInActiveSlot && selectedColorForNewPlayer) {
            if (!isPlayerAssignedToSlot) { // Adding a completely new player to an empty slot
                enableButton = true;
            } else { // Slot has a player, check if typed name is different (intending to add a NEW player)
                const currentPlayerInSlot = playersDB.find(p => p.id === activeSlotElement.dataset.playerId);
                if (currentPlayerInSlot && currentPlayerInSlot.name !== nameInActiveSlot) {
                    enableButton = true;
                }
            }
        }
        addNameBtn.disabled = !enableButton;
    }

    function displayStatusMessage(message, isError = false) {
        statusMessageEl.textContent = message;
        statusMessageEl.className = 'status-message';
        statusMessageEl.classList.add(isError ? 'error' : 'success');
        setTimeout(() => {
            statusMessageEl.textContent = '';
            statusMessageEl.className = 'status-message';
        }, 3000);
    }

    function setupEventListeners() {
        addNameBtn.addEventListener('click', handleAddName);

        allNoteTextareas.forEach(textarea => {
            // Save on input (debounced) and blur
            textarea.addEventListener('input', autoSaveNotes);
            textarea.addEventListener('blur', autoSaveNotes); // Explicit save on blur too
        });

        document.addEventListener('click', function (event) {
            const openDropdowns = document.querySelectorAll('.search-results-dropdown[style*="display: block"]');
            openDropdowns.forEach(dropdown => {
                const slot = dropdown.closest('.player-slot');
                if (slot && !slot.contains(event.target) && activeSlotElement !== slot) {
                    // Only hide if click is outside the slot AND it's not the active slot itself
                    // (to allow interaction with active slot's name input without hiding its own dropdown immediately)
                    // A better check might be if the event.target is NOT the name input of this slot.
                    if (event.target !== slot.querySelector('.player-name-input')) {
                        hideSearchResults(slot);
                    }
                } else if (slot && activeSlotElement === slot && event.target !== slot.querySelector('.player-name-input') && !dropdown.contains(event.target)) {
                    // If it IS the active slot, hide only if click is outside name input and outside dropdown itself
                    hideSearchResults(slot);
                }
            });
        });
    }

    initializeApp();
});