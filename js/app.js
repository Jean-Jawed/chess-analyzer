/**
 * App.js - Main Application Entry Point
 * Initializes all modules and coordinates interactions
 */

(function () {
    'use strict';

    // Application state
    let isAnalyzing = false;

    /**
     * Initialize the application
     */
    function init() {
        console.log('Chess Analyzer - Initializing...');

        // Initialize UI first
        UI.init();
        UI.showLoading('Chargement de Stockfish...');

        // Initialize the chess board
        Board.init('board', onPositionChange);

        // Initialize Stockfish engine
        Engine.init({
            onReady: onEngineReady,
            onAnalysis: onAnalysisUpdate,
            onError: onEngineError
        });

        // Setup event listeners
        setupEventListeners();

        // Initial UI state
        UI.updateStatus({
            mode: 'Jeu',
            turn: 'w',
            engine: 'Chargement...'
        });
        UI.updateFenInput(Board.getFen());
    }

    /**
     * Engine ready callback
     */
    function onEngineReady() {
        console.log('Stockfish ready');
        UI.hideLoading();
        UI.updateStatus({ engine: 'Prêt' });
    }

    /**
     * Engine error callback
     */
    function onEngineError(message) {
        console.error('Engine error:', message);
        UI.hideLoading();
        UI.showWarning(message);
    }

    /**
     * Analysis update callback
     */
    function onAnalysisUpdate(data) {
        if (!isAnalyzing) return;

        const game = Board.getGame();

        // Update best moves
        UI.updateBestMoves(data.lines, game);

        // Update analysis info
        UI.updateAnalysisInfo({
            depth: data.depth,
            nodes: data.nodes,
            time: data.time
        });

        // Update eval bar with first line score
        if (data.lines[1]) {
            const line = data.lines[1];
            const turn = game.turn();
            let score = line.score;

            // Adjust score for black's turn
            if (turn === 'b') {
                score = -score;
            }

            UI.updateEvalBar(score, line.scoreType);
        }
    }

    /**
     * Position change callback
     */
    function onPositionChange(info) {
        // Update FEN display
        UI.updateFenInput(info.fen);

        // Update turn status
        UI.updateStatus({ turn: info.turn });

        // Check for game over conditions
        if (info.isCheckmate) {
            const winner = info.turn === 'w' ? 'Noirs' : 'Blancs';
            UI.showWarning('Échec et mat ! Les ' + winner + ' gagnent.');
        } else if (info.isStalemate) {
            UI.showWarning('Pat ! La partie est nulle.');
        } else if (info.isDraw) {
            UI.showWarning('Partie nulle.');
        } else if (info.isCheck) {
            UI.showWarning('Échec !');
        } else {
            UI.hideWarning();
        }

        // If analyzing, restart analysis with new position
        if (isAnalyzing) {
            Engine.analyze(info.fen);
        }
    }

    /**
     * Setup event listeners
     */
    function setupEventListeners() {
        const buttons = UI.getButtons();

        // Flip board
        buttons.flip.addEventListener('click', () => {
            Board.flip();
        });

        // Toggle edit mode
        buttons.edit.addEventListener('click', () => {
            const newEditMode = !Board.getEditMode();
            Board.setEditMode(newEditMode);
            UI.setEditMode(newEditMode);

            // Stop analysis when entering edit mode
            if (newEditMode && isAnalyzing) {
                stopAnalysis();
            }
        });

        // Close spare pieces panel
        const btnCloseSparePieces = document.getElementById('btnCloseSparePieces');
        if (btnCloseSparePieces) {
            btnCloseSparePieces.addEventListener('click', () => {
                // Exit edit mode
                Board.setEditMode(false);
                UI.setEditMode(false);
            });
        }

        // Reset board
        buttons.reset.addEventListener('click', () => {
            Board.reset();
            UI.resetAnalysis();
            UI.hideWarning();

            if (isAnalyzing) {
                stopAnalysis();
            }
        });

        // Clear board
        buttons.clear.addEventListener('click', () => {
            Board.clear();
            UI.resetAnalysis();
            UI.hideWarning();

            if (isAnalyzing) {
                stopAnalysis();
            }
        });

        // Toggle analysis
        buttons.analyze.addEventListener('click', () => {
            if (isAnalyzing) {
                stopAnalysis();
            } else {
                startAnalysis();
            }
        });

        // Load FEN
        buttons.loadFen.addEventListener('click', () => {
            const fen = UI.getFenInput();
            if (fen) {
                const valid = Board.loadFen(fen);
                if (!valid) {
                    UI.showWarning('FEN invalide. Vérifiez le format.');
                } else {
                    UI.hideWarning();
                    if (isAnalyzing) {
                        Engine.analyze(fen);
                    }
                }
            }
        });

        // FEN input enter key
        document.getElementById('fenInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                buttons.loadFen.click();
            }
        });

        // Turn selector change (in edit mode)
        const selectTurn = UI.getSelectTurn();
        if (selectTurn) {
            selectTurn.addEventListener('change', () => {
                // Board module handles syncing the game state
                // Just update UI if needed
                const turn = selectTurn.value;
                UI.updateStatus({ turn: turn });
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Don't trigger if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
                return;
            }

            switch (e.key.toLowerCase()) {
                case 'f':
                    // Flip board
                    Board.flip();
                    break;
                case 'e':
                    // Toggle edit mode
                    buttons.edit.click();
                    break;
                case ' ':
                case 'a':
                    // Toggle analysis
                    e.preventDefault();
                    buttons.analyze.click();
                    break;
                case 'r':
                    // Reset
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        buttons.reset.click();
                    }
                    break;
                case 'escape':
                    // Stop analysis / exit edit mode
                    if (isAnalyzing) {
                        stopAnalysis();
                    }
                    if (Board.getEditMode()) {
                        Board.setEditMode(false);
                        UI.setEditMode(false);
                    }
                    break;
            }
        });
    }

    /**
     * Start analysis
     */
    function startAnalysis() {
        // Exit edit mode if active
        if (Board.getEditMode()) {
            Board.setEditMode(false);
            UI.setEditMode(false);
        }

        // Validate position
        const validation = Board.validatePosition();
        if (!validation.valid) {
            UI.showWarning(validation.errors[0]);
            // Continue anyway, just warn
        }

        // Check if engine is ready
        if (!Engine.ready()) {
            UI.showWarning('Stockfish n\'est pas encore prêt. Patientez...');
            return;
        }

        isAnalyzing = true;
        UI.setAnalyzing(true);
        UI.resetAnalysis();

        // Start analysis
        const fen = Board.getFen();
        Engine.analyze(fen);
    }

    /**
     * Stop analysis
     */
    function stopAnalysis() {
        isAnalyzing = false;
        UI.setAnalyzing(false);
        Engine.stop();
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();