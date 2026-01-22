/**
 * UI.js - User Interface Module
 * Handles all UI updates and user interactions
 */

const UI = (function() {
    // DOM elements cache
    const elements = {};

    /**
     * Initialize UI elements
     */
    function init() {
        // Cache DOM elements
        elements.evalBarWhite = document.getElementById('evalBarWhite');
        elements.evalBarBlack = document.getElementById('evalBarBlack');
        elements.evalScore = document.getElementById('evalScore');
        elements.bestMoves = document.getElementById('bestMoves');
        elements.infoDepth = document.getElementById('infoDepth');
        elements.infoNodes = document.getElementById('infoNodes');
        elements.infoTime = document.getElementById('infoTime');
        elements.statusMode = document.getElementById('statusMode');
        elements.statusTurn = document.getElementById('statusTurn');
        elements.statusEngine = document.getElementById('statusEngine');
        elements.warningBox = document.getElementById('warningBox');
        elements.warningText = document.getElementById('warningText');
        elements.fenInput = document.getElementById('fenInput');
        elements.sparePieces = document.getElementById('sparePieces');
        elements.loadingOverlay = document.getElementById('loadingOverlay');
        elements.selectTurn = document.getElementById('selectTurn');

        // Buttons
        elements.btnFlip = document.getElementById('btnFlip');
        elements.btnEdit = document.getElementById('btnEdit');
        elements.btnReset = document.getElementById('btnReset');
        elements.btnClear = document.getElementById('btnClear');
        elements.btnAnalyze = document.getElementById('btnAnalyze');
        elements.btnLoadFen = document.getElementById('btnLoadFen');
    }

    /**
     * Update evaluation bar
     * @param {number} score - Evaluation score from white's perspective
     * @param {string} scoreType - 'cp' or 'mate'
     */
    function updateEvalBar(score, scoreType = 'cp') {
        let whitePercentage;

        if (scoreType === 'mate') {
            // Mate score: 100% for winning side
            whitePercentage = score > 0 ? 100 : 0;
        } else {
            // Convert centipawn score to percentage
            // Use sigmoid-like function for smooth scaling
            // Score of +/- 5 pawns = roughly 90%/10%
            const maxScore = 5;
            const clampedScore = Math.max(-maxScore, Math.min(maxScore, score));
            whitePercentage = 50 + (clampedScore / maxScore) * 45;
        }

        // Update bar heights
        elements.evalBarWhite.style.height = whitePercentage + '%';
        elements.evalBarBlack.style.height = (100 - whitePercentage) + '%';

        // Update score display
        const formatted = Engine.formatScore(score, scoreType, 'w');
        elements.evalScore.textContent = formatted.text;
        elements.evalScore.className = 'eval-score ' + formatted.className;
    }

    /**
     * Update best moves display
     * @param {Object} lines - Analysis lines from engine { 1: {...}, 2: {...}, 3: {...} }
     * @param {Chess} game - Chess.js instance for move conversion
     */
    function updateBestMoves(lines, game) {
        let html = '';

        for (let i = 1; i <= 3; i++) {
            const line = lines[i];
            
            if (line && line.pv && line.pv.length > 0) {
                // Convert first move to SAN
                const uciMove = line.pv[0];
                const sanMove = Engine.uciToSan(uciMove, game);
                
                // Format score
                const turn = game.turn();
                const formatted = Engine.formatScore(line.score, line.scoreType, turn);
                
                html += `
                    <div class="move-item" data-uci="${uciMove}">
                        <span class="move-rank">${i}.</span>
                        <span class="move-notation">${sanMove}</span>
                        <span class="move-eval ${formatted.className}">${formatted.text}</span>
                    </div>
                `;
            } else {
                html += `
                    <div class="move-item placeholder">
                        <span class="move-rank">${i}.</span>
                        <span class="move-notation">—</span>
                        <span class="move-eval">—</span>
                    </div>
                `;
            }
        }

        elements.bestMoves.innerHTML = html;

        // Add click handlers to highlight moves
        elements.bestMoves.querySelectorAll('.move-item[data-uci]').forEach(item => {
            item.addEventListener('mouseenter', () => {
                const uci = item.dataset.uci;
                if (uci && uci.length >= 4) {
                    const from = uci.slice(0, 2);
                    const to = uci.slice(2, 4);
                    Board.highlightMove(from, to);
                }
            });
            
            item.addEventListener('mouseleave', () => {
                Board.removeHighlights();
            });
        });
    }

    /**
     * Update analysis info display
     * @param {Object} info - { depth, nodes, time }
     */
    function updateAnalysisInfo(info) {
        if (info.depth !== undefined) {
            elements.infoDepth.textContent = info.depth;
        }
        
        if (info.nodes !== undefined) {
            elements.infoNodes.textContent = formatNodes(info.nodes);
        }
        
        if (info.time !== undefined) {
            elements.infoTime.textContent = formatTime(info.time);
        }
    }

    /**
     * Format node count for display
     */
    function formatNodes(nodes) {
        if (nodes >= 1000000000) {
            return (nodes / 1000000000).toFixed(1) + 'B';
        } else if (nodes >= 1000000) {
            return (nodes / 1000000).toFixed(1) + 'M';
        } else if (nodes >= 1000) {
            return (nodes / 1000).toFixed(1) + 'K';
        }
        return nodes.toString();
    }

    /**
     * Format time for display
     */
    function formatTime(ms) {
        if (ms >= 60000) {
            const minutes = Math.floor(ms / 60000);
            const seconds = ((ms % 60000) / 1000).toFixed(0);
            return minutes + ':' + seconds.padStart(2, '0');
        } else if (ms >= 1000) {
            return (ms / 1000).toFixed(1) + 's';
        }
        return ms + 'ms';
    }

    /**
     * Update status bar
     * @param {Object} status - { mode, turn, engine }
     */
    function updateStatus(status) {
        if (status.mode !== undefined) {
            elements.statusMode.textContent = 'Mode: ' + status.mode;
        }
        
        if (status.turn !== undefined) {
            const turnText = status.turn === 'w' ? 'Blancs' : 'Noirs';
            elements.statusTurn.textContent = 'Trait aux ' + turnText;
        }
        
        if (status.engine !== undefined) {
            elements.statusEngine.textContent = 'Stockfish: ' + status.engine;
            elements.statusEngine.className = 'status-engine ' + 
                (status.engine === 'Analyse...' ? 'analyzing' : 
                 status.engine === 'Prêt' ? 'ready' : '');
        }
    }

    /**
     * Show warning message
     * @param {string} message - Warning text
     */
    function showWarning(message) {
        elements.warningText.textContent = message;
        elements.warningBox.classList.remove('hidden');
    }

    /**
     * Hide warning message
     */
    function hideWarning() {
        elements.warningBox.classList.add('hidden');
    }

    /**
     * Update FEN input
     * @param {string} fen - Current FEN string
     */
    function updateFenInput(fen) {
        elements.fenInput.value = fen;
    }

    /**
     * Get FEN from input
     */
    function getFenInput() {
        return elements.fenInput.value.trim();
    }

    /**
     * Set edit mode UI state
     * @param {boolean} enabled - Edit mode enabled
     */
    function setEditMode(enabled) {
        elements.btnEdit.classList.toggle('active', enabled);
        elements.btnEdit.textContent = enabled ? '✓ Édition' : '✎ Éditer';
        elements.sparePieces.classList.toggle('hidden', !enabled);
        updateStatus({ mode: enabled ? 'Édition' : 'Jeu' });
    }

    /**
     * Set analyzing UI state
     * @param {boolean} analyzing - Currently analyzing
     */
    function setAnalyzing(analyzing) {
        elements.btnAnalyze.classList.toggle('analyzing', analyzing);
        elements.btnAnalyze.textContent = analyzing ? '⏹ Stop' : '▶ Analyser';
        updateStatus({ engine: analyzing ? 'Analyse...' : 'Prêt' });
    }

    /**
     * Show loading overlay
     * @param {string} text - Loading message
     */
    function showLoading(text) {
        const loadingText = elements.loadingOverlay.querySelector('.loading-text');
        if (loadingText && text) {
            loadingText.textContent = text;
        }
        elements.loadingOverlay.classList.remove('hidden');
    }

    /**
     * Hide loading overlay
     */
    function hideLoading() {
        elements.loadingOverlay.classList.add('hidden');
    }

    /**
     * Reset analysis display
     */
    function resetAnalysis() {
        elements.infoDepth.textContent = '—';
        elements.infoNodes.textContent = '—';
        elements.infoTime.textContent = '—';
        
        elements.bestMoves.innerHTML = `
            <div class="move-item placeholder">
                <span class="move-rank">1.</span>
                <span class="move-notation">—</span>
                <span class="move-eval">—</span>
            </div>
            <div class="move-item placeholder">
                <span class="move-rank">2.</span>
                <span class="move-notation">—</span>
                <span class="move-eval">—</span>
            </div>
            <div class="move-item placeholder">
                <span class="move-rank">3.</span>
                <span class="move-notation">—</span>
                <span class="move-eval">—</span>
            </div>
        `;
        
        updateEvalBar(0, 'cp');
    }

    /**
     * Get button elements for event binding
     */
    function getButtons() {
        return {
            flip: elements.btnFlip,
            edit: elements.btnEdit,
            reset: elements.btnReset,
            clear: elements.btnClear,
            analyze: elements.btnAnalyze,
            loadFen: elements.btnLoadFen
        };
    }

    /**
     * Get select turn element
     */
    function getSelectTurn() {
        return elements.selectTurn;
    }

    // Public API
    return {
        init,
        updateEvalBar,
        updateBestMoves,
        updateAnalysisInfo,
        updateStatus,
        showWarning,
        hideWarning,
        updateFenInput,
        getFenInput,
        setEditMode,
        setAnalyzing,
        showLoading,
        hideLoading,
        resetAnalysis,
        getButtons,
        getSelectTurn
    };
})();
