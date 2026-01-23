/**
 * Board.js - Chessboard Management Module
 * Wraps Chessboard.js and Chess.js for board display and game logic
 */

const Board = (function () {
    // Private variables
    let board = null;
    let game = null;
    let isEditMode = false;
    let onPositionChangeCallback = null;
    let selectedPiece = null;
    let selectedSquare = null;

    // Board configuration
    const config = {
        draggable: true,
        position: 'start',
        pieceTheme: 'assets/pieces/{piece}.svg',
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd,
        onMouseoutSquare: onMouseoutSquare,
        onMouseoverSquare: onMouseoverSquare
    };

    /**
     * Initialize the board
     * @param {string} elementId - DOM element ID for the board
     * @param {Function} onPositionChange - Callback when position changes
     */
    function init(elementId, onPositionChange) {
        onPositionChangeCallback = onPositionChange || function () { };

        // Initialize Chess.js
        game = new Chess();

        // Initialize Chessboard.js
        board = Chessboard(elementId, config);

        // Handle window resize
        window.addEventListener('resize', () => {
            board.resize();
        });

        // Setup spare pieces drag and drop
        setupSparePieces();

        // Bind clicks/taps for Tap-to-Move
        // We use mousedown/touchstart because chessboard.js might prevent default on child elements,
        // which can stop the 'click' event from firing, especially on pieces.
        const boardEl = document.getElementById('board');
        const handleInteraction = (e) => {
            const square = getSquareFromEvent(e);
            if (square) {
                onSquareClick(square);
            }
        };

        boardEl.addEventListener('mousedown', handleInteraction);
        boardEl.addEventListener('touchstart', (e) => {
            // Only handle if it's a single touch to avoid interfering with zoom/scroll
            if (e.touches.length === 1) {
                // Prevent mouse events from firing after touch
                e.preventDefault();
                handleInteraction(e);
            }
        }, { passive: false });

        return board;
    }

    /**
     * Handle drag start
     */
    function onDragStart(source, piece, position, orientation) {
        // In edit mode, allow any piece to be moved
        if (isEditMode) {
            selectedSquare = null;
            removeHighlights();
            return true;
        }

        // In play mode, only allow moves for the side to move
        if (game.game_over()) return false;

        // If it's a piece of the current turn starting a drag
        const isCurrentTurnPiece = (game.turn() === 'w' && piece.search(/^w/) !== -1) ||
            (game.turn() === 'b' && piece.search(/^b/) !== -1);

        if (isCurrentTurnPiece) {
            // Only clear selection if we are starting a NEW drag with a valid piece
            // This allows us to keep the selection if we just clicked an opponent's piece for a tap-to-move capture
            selectedSquare = null;
            removeHighlights();
            return true;
        }

        // For opponent's pieces, we return false to prevent dragging,
        // but we DON'T clear selectedSquare here because onSquareClick will need it
        // for tap-to-move capture.
        return false;
    }

    /**
     * Handle piece drop
     */
    function onDrop(source, target, piece, newPos, oldPos, orientation) {
        // In edit mode, allow any move
        if (isEditMode) {
            // If dropped off board, remove the piece
            if (target === 'offboard') {
                return 'trash';
            }

            // Update internal position after snapback animation
            setTimeout(() => {
                syncGameFromBoard();
                notifyPositionChange();
            }, 0);

            return;
        }

        // In play mode, validate moves with Chess.js
        const move = game.move({
            from: source,
            to: target,
            promotion: 'q' // Always promote to queen for simplicity
        });

        // Illegal move
        if (move === null) {
            return 'snapback';
        }

        notifyPositionChange();
    }

    /**
     * Handle snap end (piece finished moving)
     */
    function onSnapEnd() {
        // Update board position to match game state
        if (!isEditMode) {
            board.position(game.fen());
        }
    }

    /**
     * Handle mouse over square (for highlighting)
     */
    function onMouseoverSquare(square, piece) {
        if (isEditMode) return;

        // Get legal moves for this square
        const moves = game.moves({
            square: square,
            verbose: true
        });

        if (moves.length === 0) return;

        // Highlight the square
        highlightSquare(square);

        // Highlight possible moves
        moves.forEach(move => {
            highlightSquare(move.to);
        });
    }

    /**
     * Handle mouse out square
     */
    function onMouseoutSquare(square, piece) {
        // Only remove highlights if no square is currently selected for Tap-to-Move
        if (!selectedSquare) {
            removeHighlights();
        }
    }

    /**
     * Handle click on square (Tap-to-Move)
     */
    function onSquareClick(square) {
        if (isEditMode) return;
        console.log('Processing click on:', square, 'Current selection:', selectedSquare);

        // If a piece is already selected, try to move there
        if (selectedSquare) {
            // Attempt to make move
            const move = game.move({
                from: selectedSquare,
                to: square,
                promotion: 'q'
            });

            if (move) {
                // Move was legal
                board.position(game.fen());
                selectedSquare = null;
                removeHighlights();
                notifyPositionChange();
                return;
            }

            // If move was illegal, check if they clicked another of their own pieces
            const piece = game.get(square);
            if (piece && piece.color === game.turn()) {
                // Switch selection to new piece
                selectedSquare = square;
                removeHighlights();
                highlightSelected(square);
                showLegalMoves(square);
            } else {
                // Cancel selection
                selectedSquare = null;
                removeHighlights();
            }
        } else {
            // No piece selected, try to select one
            const piece = game.get(square);
            if (piece && piece.color === game.turn()) {
                selectedSquare = square;
                highlightSelected(square);
                showLegalMoves(square);
            }
        }
    }

    /**
     * Highlight selected square
     */
    function highlightSelected(square) {
        $('#board .square-' + square).addClass('highlight-selected');
    }

    /**
     * Show legal moves for a square
     */
    function showLegalMoves(square) {
        const moves = game.moves({
            square: square,
            verbose: true
        });

        moves.forEach(move => {
            highlightSquare(move.to);
        });
    }

    /**
     * Highlight a square
     */
    function highlightSquare(square) {
        const $square = $('#board .square-' + square);
        $square.addClass('highlight-' + ($square.hasClass('black-3c85d') ? 'black' : 'white'));
    }

    /**
     * Remove all highlights
     */
    function removeHighlights() {
        $('#board .square-55d63').removeClass('highlight-white highlight-black highlight-selected');
    }

    /**
     * Setup spare pieces for edit mode
     */
    function setupSparePieces() {
        const sparePieces = document.querySelectorAll('.spare-piece');

        sparePieces.forEach(piece => {
            piece.draggable = true;

            piece.addEventListener('dragstart', (e) => {
                if (!isEditMode) {
                    e.preventDefault();
                    return;
                }
                selectedPiece = e.target.dataset.piece;
                e.dataTransfer.setData('text/plain', selectedPiece);
                e.dataTransfer.effectAllowed = 'copy';
            });
        });

        // Setup drop zones on board squares
        const boardEl = document.getElementById('board');

        boardEl.addEventListener('dragover', (e) => {
            if (isEditMode && selectedPiece) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            }
        });

        boardEl.addEventListener('drop', (e) => {
            if (!isEditMode || !selectedPiece) return;

            e.preventDefault();

            // Get the square from the drop position
            const square = getSquareFromEvent(e);
            if (square) {
                // Get current position and add the piece
                const position = board.position();
                position[square] = selectedPiece;
                board.position(position);

                syncGameFromBoard();
                notifyPositionChange();
            }

            selectedPiece = null;
        });
    }

    /**
     * Get square from mouse event
     */
    function getSquareFromEvent(e) {
        const boardEl = document.getElementById('board');
        const rect = boardEl.getBoundingClientRect();

        // Handle both mouse and touch events
        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const squareSize = rect.width / 8;

        const file = Math.floor(x / squareSize);
        const rank = 7 - Math.floor(y / squareSize);

        if (file >= 0 && file <= 7 && rank >= 0 && rank <= 7) {
            const files = 'abcdefgh';
            const orientation = board.orientation();

            if (orientation === 'white') {
                return files[file] + (rank + 1);
            } else {
                return files[7 - file] + (8 - rank);
            }
        }

        return null;
    }

    /**
     * Sync Chess.js game state from board position
     */
    function syncGameFromBoard() {
        const position = board.position();
        const turn = document.getElementById('selectTurn')?.value || 'w';
        const fen = positionToFen(position, turn);

        // Try to load the FEN, may fail if position is invalid
        const valid = game.load(fen);

        return valid;
    }

    /**
     * Convert board position object to FEN string
     */
    function positionToFen(position, turn = 'w') {
        let fen = '';

        for (let rank = 8; rank >= 1; rank--) {
            let empty = 0;

            for (let fileIdx = 0; fileIdx < 8; fileIdx++) {
                const file = 'abcdefgh'[fileIdx];
                const square = file + rank;
                const piece = position[square];

                if (piece) {
                    if (empty > 0) {
                        fen += empty;
                        empty = 0;
                    }
                    // Convert piece format: wK -> K, bK -> k
                    const pieceChar = piece[1];
                    fen += piece[0] === 'w' ? pieceChar.toUpperCase() : pieceChar.toLowerCase();
                } else {
                    empty++;
                }
            }

            if (empty > 0) {
                fen += empty;
            }

            if (rank > 1) {
                fen += '/';
            }
        }

        // Add turn and default castling/en passant/move counters
        fen += ' ' + turn + ' KQkq - 0 1';

        return fen;
    }

    /**
     * Notify position change
     */
    function notifyPositionChange() {
        if (onPositionChangeCallback) {
            // Using old Chess.js API
            onPositionChangeCallback({
                fen: game.fen(),
                turn: game.turn(),
                isCheck: game.in_check(),
                isCheckmate: game.in_checkmate(),
                isStalemate: game.in_stalemate(),
                isDraw: game.in_draw(),
                isGameOver: game.game_over()
            });
        }
    }

    /**
     * Set edit mode
     */
    function setEditMode(enabled) {
        isEditMode = enabled;

        if (enabled) {
            // In edit mode, update game from board on turn change
            document.getElementById('selectTurn')?.addEventListener('change', () => {
                syncGameFromBoard();
                notifyPositionChange();
            });
        }
    }

    /**
     * Get edit mode status
     */
    function getEditMode() {
        return isEditMode;
    }

    /**
     * Flip the board
     */
    function flip() {
        board.flip();
    }

    /**
     * Reset to starting position
     */
    function reset() {
        game.reset();
        board.position('start');
        selectedSquare = null;
        removeHighlights();
        notifyPositionChange();
    }

    /**
     * Clear the board
     */
    function clear() {
        game.clear();
        board.clear();
        selectedSquare = null;
        removeHighlights();
        notifyPositionChange();
    }

    /**
     * Load a FEN position
     * @param {string} fen - Position in FEN notation
     * @returns {boolean} Whether the FEN was valid
     */
    function loadFen(fen) {
        const valid = game.load(fen);

        if (valid) {
            board.position(game.fen());
            notifyPositionChange();
        }

        return valid;
    }

    /**
     * Get current FEN
     */
    function getFen() {
        return game.fen();
    }

    /**
     * Get current turn
     */
    function getTurn() {
        return game.turn();
    }

    /**
     * Get Chess.js instance (for move conversion etc.)
     */
    function getGame() {
        return game;
    }

    /**
     * Validate current position
     * @returns {Object} { valid, errors }
     */
    function validatePosition() {
        const errors = [];
        const position = board.position();

        // Count pieces
        let whiteKings = 0;
        let blackKings = 0;
        let whitePawnsOnEdge = 0;
        let blackPawnsOnEdge = 0;

        for (const square in position) {
            const piece = position[square];
            const rank = square[1];

            if (piece === 'wK') whiteKings++;
            if (piece === 'bK') blackKings++;

            if (piece === 'wP' && (rank === '1' || rank === '8')) whitePawnsOnEdge++;
            if (piece === 'bP' && (rank === '1' || rank === '8')) blackPawnsOnEdge++;
        }

        if (whiteKings !== 1) {
            errors.push('Les Blancs doivent avoir exactement un Roi');
        }
        if (blackKings !== 1) {
            errors.push('Les Noirs doivent avoir exactement un Roi');
        }
        if (whitePawnsOnEdge > 0 || blackPawnsOnEdge > 0) {
            errors.push('Les pions ne peuvent pas être sur la 1ère ou 8ème rangée');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Highlight best move on board
     */
    function highlightMove(from, to) {
        removeHighlights();
        highlightSquare(from);
        highlightSquare(to);
    }

    // Public API
    return {
        init,
        setEditMode,
        getEditMode,
        flip,
        reset,
        clear,
        loadFen,
        getFen,
        getTurn,
        getGame,
        validatePosition,
        highlightMove,
        removeHighlights
    };
})();