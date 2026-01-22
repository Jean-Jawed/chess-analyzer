/**
 * Engine.js - Stockfish WASM Communication Module
 * Handles all interaction with the Stockfish chess engine
 */

const Engine = (function() {
    // Private variables
    let worker = null;
    let isReady = false;
    let isAnalyzing = false;
    let currentCallback = null;
    let analysisLines = {};
    let onReadyCallback = null;
    let onAnalysisCallback = null;
    let onErrorCallback = null;

    // Stockfish file path (adjust hash if needed)
    const STOCKFISH_PATH = 'lib/stockfish/stockfish-17.1-lite-single-03e3232.js';

    /**
     * Initialize the Stockfish engine
     * @param {Object} callbacks - { onReady, onAnalysis, onError }
     */
    function init(callbacks = {}) {
        onReadyCallback = callbacks.onReady || function() {};
        onAnalysisCallback = callbacks.onAnalysis || function() {};
        onErrorCallback = callbacks.onError || function() {};

        try {
            worker = new Worker(STOCKFISH_PATH);
            worker.onmessage = handleMessage;
            worker.onerror = handleError;

            // Initialize UCI protocol
            send('uci');
        } catch (error) {
            console.error('Failed to initialize Stockfish:', error);
            onErrorCallback('Impossible de charger Stockfish: ' + error.message);
        }
    }

    /**
     * Handle messages from Stockfish
     */
    function handleMessage(event) {
        const line = event.data;
        
        // Debug logging (comment out in production)
        // console.log('Stockfish:', line);

        // UCI initialization complete
        if (line === 'uciok') {
            // Configure engine options
            send('setoption name MultiPV value 3');
            send('setoption name Threads value 1');
            send('isready');
        }

        // Engine is ready
        if (line === 'readyok') {
            isReady = true;
            onReadyCallback();
        }

        // Parse analysis info
        if (line.startsWith('info') && line.includes('score') && line.includes('pv')) {
            parseAnalysisInfo(line);
        }

        // Best move found (analysis complete for this depth)
        if (line.startsWith('bestmove')) {
            // Analysis continues until stopped, bestmove is sent when stopped
        }
    }

    /**
     * Handle worker errors
     */
    function handleError(error) {
        console.error('Stockfish worker error:', error);
        onErrorCallback('Erreur Stockfish: ' + error.message);
    }

    /**
     * Send command to Stockfish
     */
    function send(command) {
        if (worker) {
            worker.postMessage(command);
        }
    }

    /**
     * Parse analysis info line from Stockfish
     * Example: info depth 20 seldepth 30 multipv 1 score cp 35 nodes 1234567 nps 1000000 time 1234 pv e2e4 e7e5 ...
     */
    function parseAnalysisInfo(line) {
        const info = {};
        const parts = line.split(' ');

        for (let i = 0; i < parts.length; i++) {
            switch (parts[i]) {
                case 'depth':
                    info.depth = parseInt(parts[++i]);
                    break;
                case 'seldepth':
                    info.seldepth = parseInt(parts[++i]);
                    break;
                case 'multipv':
                    info.multipv = parseInt(parts[++i]);
                    break;
                case 'score':
                    const scoreType = parts[++i];
                    const scoreValue = parseInt(parts[++i]);
                    if (scoreType === 'cp') {
                        info.score = scoreValue / 100; // Convert centipawns to pawns
                        info.scoreType = 'cp';
                    } else if (scoreType === 'mate') {
                        info.score = scoreValue;
                        info.scoreType = 'mate';
                    }
                    break;
                case 'nodes':
                    info.nodes = parseInt(parts[++i]);
                    break;
                case 'nps':
                    info.nps = parseInt(parts[++i]);
                    break;
                case 'time':
                    info.time = parseInt(parts[++i]);
                    break;
                case 'pv':
                    // Rest of line is the principal variation
                    info.pv = parts.slice(i + 1);
                    i = parts.length; // Exit loop
                    break;
            }
        }

        // Store by multipv line number
        if (info.multipv && info.pv && info.pv.length > 0) {
            analysisLines[info.multipv] = info;
            
            // Send update callback with all current lines
            if (onAnalysisCallback) {
                onAnalysisCallback({
                    lines: { ...analysisLines },
                    depth: info.depth,
                    nodes: info.nodes,
                    time: info.time
                });
            }
        }
    }

    /**
     * Start analyzing a position
     * @param {string} fen - Position in FEN notation
     */
    function analyze(fen) {
        if (!isReady) {
            console.warn('Engine not ready');
            return;
        }

        // Stop any current analysis
        if (isAnalyzing) {
            stop();
        }

        // Clear previous analysis
        analysisLines = {};
        isAnalyzing = true;

        // Set position and start infinite analysis
        send('position fen ' + fen);
        send('go infinite');
    }

    /**
     * Stop current analysis
     */
    function stop() {
        if (isAnalyzing) {
            send('stop');
            isAnalyzing = false;
        }
    }

    /**
     * Check if engine is ready
     */
    function ready() {
        return isReady;
    }

    /**
     * Check if engine is currently analyzing
     */
    function analyzing() {
        return isAnalyzing;
    }

    /**
     * Destroy the engine worker
     */
    function destroy() {
        if (worker) {
            stop();
            worker.terminate();
            worker = null;
            isReady = false;
        }
    }

    /**
     * Convert UCI move to SAN notation
     * @param {string} uciMove - Move in UCI format (e.g., "e2e4")
     * @param {Chess} chess - Chess.js instance with current position
     * @returns {string} Move in SAN format (e.g., "e4")
     */
    function uciToSan(uciMove, chess) {
        if (!uciMove || !chess) return uciMove;

        const from = uciMove.slice(0, 2);
        const to = uciMove.slice(2, 4);
        const promotion = uciMove.length > 4 ? uciMove[4] : undefined;

        const move = chess.move({
            from: from,
            to: to,
            promotion: promotion
        });

        if (move) {
            const san = move.san;
            chess.undo(); // Restore position
            return san;
        }

        return uciMove;
    }

    /**
     * Format score for display
     * @param {number} score - Score value
     * @param {string} scoreType - 'cp' or 'mate'
     * @param {string} turn - 'w' or 'b' (whose turn it is)
     * @returns {Object} { text, value, className }
     */
    function formatScore(score, scoreType, turn) {
        let displayScore = score;
        
        // Negate score if it's black's turn (Stockfish always reports from engine's perspective)
        if (turn === 'b') {
            displayScore = -score;
        }

        if (scoreType === 'mate') {
            const mateIn = Math.abs(displayScore);
            const winning = displayScore > 0;
            return {
                text: (winning ? '+' : '-') + 'M' + mateIn,
                value: winning ? 100 : -100,
                className: winning ? 'positive' : 'negative'
            };
        }

        // Centipawn score
        const sign = displayScore >= 0 ? '+' : '';
        return {
            text: sign + displayScore.toFixed(1),
            value: displayScore,
            className: displayScore >= 0.2 ? 'positive' : (displayScore <= -0.2 ? 'negative' : '')
        };
    }

    // Public API
    return {
        init,
        analyze,
        stop,
        ready,
        analyzing,
        destroy,
        uciToSan,
        formatScore
    };
})();
