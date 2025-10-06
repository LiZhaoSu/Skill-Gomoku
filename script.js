const BOARD_SIZE = 15;
const PLAYERS = {
    HUMAN: 'player',
    AI: 'ai',
};

const SKILL_DEFINITIONS = {
    sandstorm: {
        id: 'sandstorm',
        name: '飞沙走石',
        cooldown: 4,
        description: '选中敌方棋子，使其消失，并封锁该位一回合。',
    },
    stillwater: {
        id: 'stillwater',
        name: '静如止水',
        cooldown: 6,
        description: '冻结敌方一回合，自己连续下两手。',
    },
    mountainBreaker: {
        id: 'mountainBreaker',
        name: '力拔山兮',
        cooldown: 10,
        description: '选定 6x6 区域摧毁，无法落子。',
    },
    rebirth: {
        id: 'rebirth',
        name: '东山再起',
        cooldown: 6,
        description: '牺牲两枚己子，恢复全部摧毁区域。',
    },
    shift: {
        id: 'shift',
        name: '调呈离山',
        cooldown: 5,
        description: '移动敌方棋子到新位置并封锁原点一回合。',
    },
};

const ENEMY_PROFILES = {
    ziqi: {
        id: 'ziqi',
        name: '子棋',
        subtitle: '基础对手',
        skills: ['sandstorm'],
        personality: 'basic',
    },
    jinengwu: {
        id: 'jinengwu',
        name: '技能五',
        subtitle: '怒涛攻势',
        skills: ['sandstorm', 'mountainBreaker', 'shift'],
        personality: 'aggressive',
    },
    wangjinbao: {
        id: 'wangjinbao',
        name: '王金宝',
        subtitle: '稳中求胜',
        skills: ['sandstorm', 'stillwater', 'rebirth'],
        personality: 'defensive',
    },
};

const PLAYER_LOADOUT = ['sandstorm', 'stillwater', 'mountainBreaker', 'rebirth', 'shift'];

const state = {
    board: [],
    destroyedCells: new Set(),
    tempBlocks: [],
    turn: PLAYERS.HUMAN,
    activeSkill: null,
    skillPrompt: '',
    skipTurns: {
        player: 0,
        ai: 0,
    },
    skillUsedThisTurn: {
        player: false,
        ai: false,
    },
    cooldowns: {
        player: {},
        ai: {},
    },
    gameActive: false,
    currentEnemy: ENEMY_PROFILES.ziqi,
    moveHistory: [],
};

const elements = {};

document.addEventListener('DOMContentLoaded', initializeGame);

function initializeGame() {
    cacheElements();
    createBoard();
    buildSkillPanels();
    elements.startButton.addEventListener('click', startGame);
    elements.enemySelect.addEventListener('change', handleEnemyChange);
    startGame();
}

function cacheElements() {
    elements.board = document.getElementById('board');
    elements.overlay = document.getElementById('board-overlay');
    elements.turnIndicator = document.getElementById('turn-indicator');
    elements.statusLog = document.getElementById('status-log');
    elements.cooldownDisplay = document.getElementById('cooldown-display');
    elements.enemyTitle = document.getElementById('enemy-title');
    elements.playerSkills = document.getElementById('player-skills');
    elements.enemySkills = document.getElementById('enemy-skills');
    elements.startButton = document.getElementById('start-button');
    elements.enemySelect = document.getElementById('enemy-select');
}

function handleEnemyChange() {
    const selected = elements.enemySelect.value;
    state.currentEnemy = ENEMY_PROFILES[selected];
    updateEnemySkillPanel();
}

function startGame() {
    resetState();
    renderBoard();
    updateEnemySkillPanel();
    logStatus(`对战开启！张呈挑战 <span>${state.currentEnemy.name}</span>。`);
    beginTurn(PLAYERS.HUMAN);
}

function resetState() {
    state.board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    state.destroyedCells = new Set();
    state.tempBlocks = [];
    state.turn = PLAYERS.HUMAN;
    state.activeSkill = null;
    state.skillPrompt = '';
    state.skipTurns = { player: 0, ai: 0 };
    state.skillUsedThisTurn = { player: false, ai: false };
    state.cooldowns.player = {};
    state.cooldowns.ai = {};
    PLAYER_LOADOUT.forEach((id) => (state.cooldowns.player[id] = 0));
    state.currentEnemy.skills.forEach((id) => (state.cooldowns.ai[id] = 0));
    state.gameActive = true;
    state.moveHistory = [];
    elements.statusLog.innerHTML = '';
    elements.overlay.hidden = true;
    elements.overlay.textContent = '';
    clearBoardClasses();
    updateSkillButtons();
    updateCooldownPanel();
}

function createBoard() {
    elements.board.innerHTML = '';
    for (let y = 0; y < BOARD_SIZE; y += 1) {
        for (let x = 0; x < BOARD_SIZE; x += 1) {
            const cell = document.createElement('button');
            cell.className = 'cell';
            cell.type = 'button';
            cell.dataset.x = x;
            cell.dataset.y = y;
            cell.setAttribute('role', 'gridcell');
            cell.addEventListener('click', handleCellClick);
            elements.board.appendChild(cell);
        }
    }
}

function renderBoard() {
    for (let y = 0; y < BOARD_SIZE; y += 1) {
        for (let x = 0; x < BOARD_SIZE; x += 1) {
            updateCellClasses(x, y);
        }
    }
}

function clearBoardClasses() {
    elements.board.querySelectorAll('.cell').forEach((cell) => {
        cell.classList.remove('player', 'ai', 'destroyed', 'blocked', 'highlight');
    });
}

function handleCellClick(event) {
    if (!state.gameActive) return;
    if (state.turn !== PLAYERS.HUMAN) return;
    const x = Number(event.currentTarget.dataset.x);
    const y = Number(event.currentTarget.dataset.y);

    if (state.activeSkill) {
        handleSkillTarget(x, y);
        return;
    }

    if (!canPlace(x, y, PLAYERS.HUMAN)) {
        flashCell(x, y);
        return;
    }

    placePiece(x, y, PLAYERS.HUMAN);
    logStatus(`张呈落子于 (${x + 1}, ${y + 1})。`);
    if (checkWin(x, y, PLAYERS.HUMAN)) {
        endGame('张呈以绝妙的连线夺冠！');
        return;
    }
    concludeTurn(PLAYERS.HUMAN);
}

function placePiece(x, y, player) {
    state.board[y][x] = player;
    updateCellClasses(x, y);
    state.moveHistory.push({ player, x, y });
}

function setPieceForSkill(x, y, player) {
    state.board[y][x] = player;
    updateCellClasses(x, y);
}

function removePiece(x, y) {
    state.board[y][x] = null;
    updateCellClasses(x, y);
}

function canPlace(x, y, player) {
    const occupant = state.board[y][x];
    if (occupant) return false;
    const key = `${x},${y}`;
    if (state.destroyedCells.has(key)) return false;
    if (isCellBlockedForPlayer(key, player)) return false;
    return true;
}

function isCellBlockedForPlayer(key, player) {
    return state.tempBlocks.some((block) => block.cell === key && block.target === player);
}

function updateCellClasses(x, y) {
    const cell = getCellElement(x, y);
    const key = `${x},${y}`;
    cell.classList.remove('player', 'ai', 'destroyed', 'blocked');
    const occupant = state.board[y][x];
    if (occupant) {
        cell.classList.add(occupant);
    }
    if (state.destroyedCells.has(key)) {
        cell.classList.add('destroyed');
    }
    if (state.tempBlocks.some((block) => block.cell === key)) {
        cell.classList.add('blocked');
    }
}

function getCellElement(x, y) {
    return elements.board.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
}

function flashCell(x, y) {
    const cell = getCellElement(x, y);
    cell.classList.add('highlight');
    setTimeout(() => cell.classList.remove('highlight'), 350);
}

function logStatus(message) {
    const entry = document.createElement('p');
    entry.innerHTML = message;
    elements.statusLog.prepend(entry);
    const entries = elements.statusLog.querySelectorAll('p');
    if (entries.length > 30) {
        elements.statusLog.removeChild(entries[entries.length - 1]);
    }
}

function beginTurn(player) {
    if (!state.gameActive) return;
    state.turn = player;
    state.activeSkill = null;
    state.skillPrompt = '';
    state.skillUsedThisTurn[player] = false;
    tickTempBlocks(player);
    decrementCooldowns(player);
    updateCooldownPanel();
    updateSkillButtons();

    if (player === PLAYERS.HUMAN) {
        elements.turnIndicator.textContent = '张呈思索着下一步…';
        elements.overlay.hidden = true;
    } else {
        elements.turnIndicator.textContent = `${state.currentEnemy.name} 在布局…`;
        elements.overlay.hidden = false;
        elements.overlay.textContent = '敌方行动中';
        setTimeout(runAiTurn, 750);
    }
}

function concludeTurn(player) {
    if (!state.gameActive) return;

    if (player === PLAYERS.HUMAN) {
        if (state.skipTurns.ai > 0) {
            state.skipTurns.ai -= 1;
            logStatus(`<span>${state.currentEnemy.name}</span> 被技能冻结，错失回合！`);
            beginTurn(PLAYERS.HUMAN);
            return;
        }
        beginTurn(PLAYERS.AI);
    } else {
        if (state.skipTurns.player > 0) {
            state.skipTurns.player -= 1;
            logStatus('张呈被静止，错失一手。');
            beginTurn(PLAYERS.AI);
            return;
        }
        beginTurn(PLAYERS.HUMAN);
    }
}

function tickTempBlocks(player) {
    state.tempBlocks = state.tempBlocks
        .map((block) => {
            if (block.target === player) {
                return { ...block, remaining: block.remaining - 1 };
            }
            return block;
        })
        .filter((block) => block.remaining > 0);
    refreshBlockedClasses();
}

function refreshBlockedClasses() {
    elements.board.querySelectorAll('.cell').forEach((cell) => cell.classList.remove('blocked'));
    state.tempBlocks.forEach((block) => {
        const [x, y] = block.cell.split(',').map(Number);
        getCellElement(x, y).classList.add('blocked');
    });
}

function decrementCooldowns(player) {
    const cooldowns = state.cooldowns[player];
    Object.keys(cooldowns || {}).forEach((id) => {
        if (cooldowns[id] > 0) {
            cooldowns[id] -= 1;
        }
    });
}

function updateCooldownPanel() {
    const entries = [];
    Object.entries(state.cooldowns.player).forEach(([id, value]) => {
        const skill = SKILL_DEFINITIONS[id];
        entries.push(`<li><span>${skill.name}</span><span>${value}</span></li>`);
    });
    Object.entries(state.cooldowns.ai).forEach(([id, value]) => {
        const skill = SKILL_DEFINITIONS[id];
        entries.push(`<li><span>${state.currentEnemy.name}：${skill.name}</span><span>${value}</span></li>`);
    });
    elements.cooldownDisplay.innerHTML = entries.join('');
}

function buildSkillPanels() {
    elements.playerSkills.innerHTML = '';
    PLAYER_LOADOUT.forEach((id) => {
        const card = createSkillCard(SKILL_DEFINITIONS[id], 'player');
        elements.playerSkills.appendChild(card);
    });
}

function updateEnemySkillPanel() {
    elements.enemyTitle.textContent = `${state.currentEnemy.name}的秘技`;
    elements.enemySkills.innerHTML = '';
    state.currentEnemy.skills.forEach((id) => {
        const skill = SKILL_DEFINITIONS[id];
        const card = document.createElement('div');
        card.className = 'skill-card';
        const cooldown = state.cooldowns.ai[id] ?? 0;
        card.innerHTML = `
            <h3>${skill.name}</h3>
            <p>${skill.description}</p>
            <p><small>冷却：${cooldown}</small></p>
        `;
        elements.enemySkills.appendChild(card);
    });
    updateSkillButtons();
    updateCooldownPanel();
}

function createSkillCard(skill, owner) {
    const card = document.createElement('div');
    card.className = 'skill-card';
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.skill = skill.id;
    button.textContent = '启用';
    button.addEventListener('click', () => activateSkill(skill.id));

    card.innerHTML = `
        <h3>${skill.name}</h3>
        <p>${skill.description}</p>
    `;
    card.appendChild(button);
    return card;
}

function updateSkillButtons() {
    elements.playerSkills.querySelectorAll('button[data-skill]').forEach((button) => {
        const id = button.dataset.skill;
        const cooldown = state.cooldowns.player[id] ?? 0;
        const disabled =
            state.turn !== PLAYERS.HUMAN || cooldown > 0 || state.skillUsedThisTurn.player || !state.gameActive;
        button.disabled = disabled;
        const card = button.closest('.skill-card');
        if (state.activeSkill && state.activeSkill.id === id) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });
    updateEnemySkillPanelVisuals();
}

function updateEnemySkillPanelVisuals() {
    const cards = elements.enemySkills.querySelectorAll('.skill-card');
    cards.forEach((card, index) => {
        const skillId = state.currentEnemy.skills[index];
        const cooldown = state.cooldowns.ai[skillId] ?? 0;
        const footer = card.querySelector('p:last-child');
        if (footer) {
            footer.innerHTML = `<small>冷却：${cooldown}</small>`;
        }
    });
}

function activateSkill(skillId) {
    if (!state.gameActive) return;
    if (state.turn !== PLAYERS.HUMAN) return;
    if (state.skillUsedThisTurn.player) {
        logStatus('本回合技能已使用。');
        return;
    }
    const cooldown = state.cooldowns.player[skillId] ?? 0;
    if (cooldown > 0) return;

    switch (skillId) {
        case 'sandstorm':
            prepareSkill(skillId, '请选择敌方棋子施放飞沙走石。');
            break;
        case 'stillwater':
            state.skipTurns.ai += 1;
            state.cooldowns.player[skillId] = SKILL_DEFINITIONS[skillId].cooldown;
            state.skillUsedThisTurn.player = true;
            logStatus('张呈施展 <span>静如止水</span>，敌方被定身！');
            updateSkillButtons();
            updateCooldownPanel();
            break;
        case 'mountainBreaker':
            prepareSkill(skillId, '选择 6x6 区域的左上角进行摧毁。');
            break;
        case 'rebirth':
            if (state.destroyedCells.size === 0) {
                logStatus('没有摧毁区域，无法东山再起。');
                return;
            }
            prepareSkill(skillId, '选择两枚己方棋子牺牲以恢复战场。');
            break;
        case 'shift':
            prepareSkill(skillId, '请选择敌方棋子，将其调离战场。');
            break;
        default:
            break;
    }
}

function prepareSkill(id, prompt) {
    state.activeSkill = { id, step: 0, selections: [] };
    state.skillPrompt = prompt;
    elements.turnIndicator.textContent = prompt;
    updateSkillButtons();
}

function handleSkillTarget(x, y) {
    const skill = state.activeSkill;
    if (!skill) return;
    switch (skill.id) {
        case 'sandstorm':
            handleSandstormTarget(x, y);
            break;
        case 'mountainBreaker':
            handleMountainBreakerTarget(x, y);
            break;
        case 'rebirth':
            handleRebirthTarget(x, y);
            break;
        case 'shift':
            handleShiftTarget(x, y);
            break;
        default:
            break;
    }
}

function finalizeSkill(skillId) {
    state.cooldowns.player[skillId] = SKILL_DEFINITIONS[skillId].cooldown;
    state.skillUsedThisTurn.player = true;
    state.activeSkill = null;
    state.skillPrompt = '';
    elements.turnIndicator.textContent = '张呈继续布局…';
    updateSkillButtons();
    updateCooldownPanel();
}

function handleSandstormTarget(x, y) {
    if (!performSandstorm(x, y, PLAYERS.HUMAN)) {
        flashCell(x, y);
        return;
    }
    finalizeSkill('sandstorm');
}

function handleMountainBreakerTarget(x, y) {
    if (!performMountainBreaker(x, y, PLAYERS.HUMAN)) {
        flashCell(x, y);
        return;
    }
    logStatus('力拔山兮！一大片棋盘被摧毁成废墟。');
    finalizeSkill('mountainBreaker');
}

function performSandstorm(x, y, actor) {
    const opponent = actor === PLAYERS.HUMAN ? PLAYERS.AI : PLAYERS.HUMAN;
    if (state.board[y][x] !== opponent) {
        return false;
    }
    removePiece(x, y);
    const key = `${x},${y}`;
    state.tempBlocks = state.tempBlocks.filter((block) => block.cell !== key);
    state.tempBlocks.push({ cell: key, target: opponent, remaining: 2 });
    refreshBlockedClasses();
    if (actor === PLAYERS.HUMAN) {
        logStatus(`飞沙走石击散了 <span>${state.currentEnemy.name}</span> 的棋子！`);
    } else {
        logStatus(`${state.currentEnemy.name} 施放 <span>飞沙走石</span>，张呈损失一子！`);
    }
    return true;
}

function performMountainBreaker(x, y, actor) {
    if (x > BOARD_SIZE - 6 || y > BOARD_SIZE - 6) {
        return false;
    }
    for (let dy = 0; dy < 6; dy += 1) {
        for (let dx = 0; dx < 6; dx += 1) {
            const cx = x + dx;
            const cy = y + dy;
            const key = `${cx},${cy}`;
            if (state.board[cy][cx]) {
                removePiece(cx, cy);
            }
            state.destroyedCells.add(key);
            updateCellClasses(cx, cy);
        }
    }
    if (actor === PLAYERS.AI) {
        logStatus(`${state.currentEnemy.name} 的 <span>力拔山兮</span> 将大片棋格摧毁！`);
    }
    return true;
}

function handleRebirthTarget(x, y) {
    if (state.board[y][x] !== PLAYERS.HUMAN) {
        flashCell(x, y);
        return;
    }
    state.activeSkill.selections.push({ x, y });
    flashCell(x, y);
    if (state.activeSkill.selections.length < 2) {
        elements.turnIndicator.textContent = '再选择一枚己方棋子完成仪式。';
        return;
    }
    state.activeSkill.selections.forEach(({ x: sx, y: sy }) => {
        removePiece(sx, sy);
    });
    state.destroyedCells.clear();
    renderBoard();
    logStatus('东山再起！战场焕然一新，但失去了两枚棋子。');
    finalizeSkill('rebirth');
}

function handleShiftTarget(x, y) {
    if (state.activeSkill.step === 0) {
        if (state.board[y][x] !== PLAYERS.AI) {
            flashCell(x, y);
            return;
        }
        state.activeSkill.origin = { x, y };
        state.activeSkill.step = 1;
        flashCell(x, y);
        elements.turnIndicator.textContent = '选择新的落点放置该棋子。';
        return;
    }

    if (!canPlace(x, y, PLAYERS.HUMAN)) {
        flashCell(x, y);
        return;
    }
    const { origin } = state.activeSkill;
    removePiece(origin.x, origin.y);
    setPieceForSkill(x, y, PLAYERS.AI);
    const key = `${origin.x},${origin.y}`;
    state.tempBlocks.push({ cell: key, target: PLAYERS.AI, remaining: 2 });
    refreshBlockedClasses();
    logStatus(`调呈离山成功，敌方棋子被移至 (${x + 1}, ${y + 1})！`);
    finalizeSkill('shift');
}

function checkWin(x, y, player) {
    const directions = [
        { dx: 1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 1, dy: 1 },
        { dx: 1, dy: -1 },
    ];
    return directions.some(({ dx, dy }) => countInDirection(x, y, dx, dy, player) >= 5);
}

function countInDirection(x, y, dx, dy, player) {
    let count = 1;
    let cx = x + dx;
    let cy = y + dy;
    while (isOnBoard(cx, cy) && state.board[cy][cx] === player) {
        count += 1;
        cx += dx;
        cy += dy;
    }
    cx = x - dx;
    cy = y - dy;
    while (isOnBoard(cx, cy) && state.board[cy][cx] === player) {
        count += 1;
        cx -= dx;
        cy -= dy;
    }
    return count;
}

function isOnBoard(x, y) {
    return x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE;
}

function endGame(message) {
    state.gameActive = false;
    elements.overlay.hidden = false;
    elements.overlay.textContent = message;
    elements.turnIndicator.textContent = message;
    logStatus(`<strong>${message}</strong>`);
    updateSkillButtons();
}

function runAiTurn() {
    if (!state.gameActive || state.turn !== PLAYERS.AI) return;
    maybeUseAiSkill();
    if (!state.gameActive || state.turn !== PLAYERS.AI) return;

    const move = chooseAiMove();
    if (!move) {
        endGame('棋盘陷入僵局，双方和棋。');
        return;
    }

    placePiece(move.x, move.y, PLAYERS.AI);
    logStatus(`${state.currentEnemy.name} 落子于 (${move.x + 1}, ${move.y + 1})。`);
    if (checkWin(move.x, move.y, PLAYERS.AI)) {
        endGame(`${state.currentEnemy.name} 的谋略赢得胜利！`);
        return;
    }
    concludeTurn(PLAYERS.AI);
}

function chooseAiMove() {
    const available = getAvailableCellsFor(PLAYERS.AI);
    if (available.length === 0) return null;
    const personality = state.currentEnemy.personality;

    if (personality === 'basic') {
        return pickBasicMove(available);
    }
    if (personality === 'aggressive') {
        return pickWeightedMove(available, 1.3, 1.0);
    }
    return pickWeightedMove(available, 1.0, 1.3);
}

function getAvailableCellsFor(player) {
    const cells = [];
    for (let y = 0; y < BOARD_SIZE; y += 1) {
        for (let x = 0; x < BOARD_SIZE; x += 1) {
            if (canPlaceForAi(x, y, player)) {
                cells.push({ x, y });
            }
        }
    }
    return cells;
}

function canPlaceForAi(x, y, player) {
    if (state.board[y][x]) return false;
    const key = `${x},${y}`;
    if (state.destroyedCells.has(key)) return false;
    if (isCellBlockedForPlayer(key, player)) return false;
    return true;
}

function pickBasicMove(available) {
    const centerBias = available.filter(({ x, y }) => Math.abs(x - 7) + Math.abs(y - 7) <= 4);
    if (centerBias.length > 0 && Math.random() < 0.6) {
        return centerBias[Math.floor(Math.random() * centerBias.length)];
    }
    return available[Math.floor(Math.random() * available.length)];
}

function pickWeightedMove(available, attackWeight, defenseWeight) {
    let best = null;
    let bestScore = -Infinity;
    available.forEach(({ x, y }) => {
        const attack = evaluatePotential(x, y, PLAYERS.AI);
        const defense = evaluatePotential(x, y, PLAYERS.HUMAN);
        const center = 1 - (Math.abs(x - 7) + Math.abs(y - 7)) / 20;
        const score = attack * attackWeight + defense * defenseWeight + center;
        if (score > bestScore) {
            bestScore = score;
            best = { x, y };
        }
    });
    return best || available[0];
}

function evaluatePotential(x, y, player) {
    const directions = [
        { dx: 1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 1, dy: 1 },
        { dx: 1, dy: -1 },
    ];
    let total = 0;
    directions.forEach(({ dx, dy }) => {
        let count = 1;
        let openEnds = 0;
        count += countLine(x, y, dx, dy, player, 1);
        count += countLine(x, y, -dx, -dy, player, 1);
        if (isOpenEnd(x, y, dx, dy, player)) openEnds += 1;
        if (isOpenEnd(x, y, -dx, -dy, player)) openEnds += 1;
        total += Math.pow(count, 2) * (openEnds + 1);
    });
    return total;
}

function countLine(x, y, dx, dy, player, depth) {
    let cx = x + dx;
    let cy = y + dy;
    let total = 0;
    while (isOnBoard(cx, cy) && state.board[cy][cx] === player) {
        total += 1;
        cx += dx;
        cy += dy;
    }
    return total;
}

function isOpenEnd(x, y, dx, dy, player) {
    let cx = x + dx;
    let cy = y + dy;
    while (isOnBoard(cx, cy) && state.board[cy][cx] === player) {
        cx += dx;
        cy += dy;
    }
    if (!isOnBoard(cx, cy)) return false;
    const key = `${cx},${cy}`;
    if (state.destroyedCells.has(key)) return false;
    if (state.board[cy][cx]) return false;
    if (isCellBlockedForPlayer(key, player)) return false;
    return true;
}

function maybeUseAiSkill() {
    if (state.skillUsedThisTurn.ai) return;
    const availableSkills = state.currentEnemy.skills.filter((id) => (state.cooldowns.ai[id] ?? 0) === 0);
    if (availableSkills.length === 0) return;

    const personality = state.currentEnemy.personality;
    if (personality === 'basic' && Math.random() > 0.35) {
        return;
    }

    for (const skillId of availableSkills) {
        if (attemptAiSkill(skillId)) {
            state.cooldowns.ai[skillId] = SKILL_DEFINITIONS[skillId].cooldown;
            state.skillUsedThisTurn.ai = true;
            updateEnemySkillPanel();
            updateCooldownPanel();
            break;
        }
    }
}

function attemptAiSkill(skillId) {
    switch (skillId) {
        case 'sandstorm':
            return aiSandstorm();
        case 'mountainBreaker':
            return aiMountainBreaker();
        case 'shift':
            return aiShift();
        case 'stillwater':
            return aiStillWater();
        case 'rebirth':
            return aiRebirth();
        default:
            return false;
    }
}

function aiSandstorm() {
    const targets = findThreateningPieces(PLAYERS.HUMAN, 4);
    const target = targets[0] || findAnyPiece(PLAYERS.HUMAN);
    if (!target) return false;
    return performSandstorm(target.x, target.y, PLAYERS.AI);
}

function aiMountainBreaker() {
    let bestArea = null;
    let bestScore = 0;
    for (let y = 0; y <= BOARD_SIZE - 6; y += 1) {
        for (let x = 0; x <= BOARD_SIZE - 6; x += 1) {
            let score = 0;
            for (let dy = 0; dy < 6; dy += 1) {
                for (let dx = 0; dx < 6; dx += 1) {
                    const cx = x + dx;
                    const cy = y + dy;
                    if (state.board[cy][cx] === PLAYERS.HUMAN) score += 2;
                    if (state.board[cy][cx] === PLAYERS.AI) score -= 1;
                }
            }
            if (score > bestScore) {
                bestScore = score;
                bestArea = { x, y };
            }
        }
    }
    if (!bestArea || bestScore < 6) return false;
    return performMountainBreaker(bestArea.x, bestArea.y, PLAYERS.AI);
}

function aiShift() {
    const target = findThreateningPieces(PLAYERS.HUMAN, 3)[0] || findAnyPiece(PLAYERS.HUMAN);
    if (!target) return false;
    const destination = getDistantCell();
    if (!destination) return false;
    removePiece(target.x, target.y);
    setPieceForSkill(destination.x, destination.y, PLAYERS.HUMAN);
    const originKey = `${target.x},${target.y}`;
    state.tempBlocks.push({ cell: originKey, target: PLAYERS.HUMAN, remaining: 2 });
    refreshBlockedClasses();
    logStatus(`${state.currentEnemy.name} 施展 <span>调呈离山</span> 扰乱阵型！`);
    return true;
}

function getDistantCell() {
    const empties = getAvailableCellsFor(PLAYERS.HUMAN).sort((a, b) => {
        const da = Math.abs(a.x - 7) + Math.abs(a.y - 7);
        const db = Math.abs(b.x - 7) + Math.abs(b.y - 7);
        return db - da;
    });
    return empties[0];
}

function aiStillWater() {
    if (state.skipTurns.player > 0) return false;
    const threats = findThreateningPieces(PLAYERS.AI, 3);
    if (threats.length < 1 && Math.random() > 0.55) return false;
    state.skipTurns.player += 1;
    logStatus(`${state.currentEnemy.name} 使出 <span>静如止水</span>，张呈被迫停手。`);
    return true;
}

function aiRebirth() {
    if (state.destroyedCells.size === 0) return false;
    const pieces = collectPieces(PLAYERS.AI);
    if (pieces.length < 2) return false;
    const [first, second] = pieces.slice(0, 2);
    removePiece(first.x, first.y);
    removePiece(second.x, second.y);
    state.destroyedCells.clear();
    renderBoard();
    logStatus(`${state.currentEnemy.name} 牺牲两子，发动 <span>东山再起</span> 恢复地形！`);
    return true;
}

function findThreateningPieces(player, threshold) {
    const results = [];
    for (let y = 0; y < BOARD_SIZE; y += 1) {
        for (let x = 0; x < BOARD_SIZE; x += 1) {
            if (state.board[y][x] !== player) continue;
            const max = maxLineThrough(x, y, player);
            if (max >= threshold) {
                results.push({ x, y, score: max });
            }
        }
    }
    results.sort((a, b) => b.score - a.score);
    return results;
}

function maxLineThrough(x, y, player) {
    const directions = [
        { dx: 1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 1, dy: 1 },
        { dx: 1, dy: -1 },
    ];
    return Math.max(...directions.map(({ dx, dy }) => countInDirection(x, y, dx, dy, player)));
}

function findAnyPiece(player) {
    const pieces = collectPieces(player);
    if (pieces.length === 0) return null;
    return pieces[Math.floor(Math.random() * pieces.length)];
}

function collectPieces(player) {
    const pieces = [];
    for (let y = 0; y < BOARD_SIZE; y += 1) {
        for (let x = 0; x < BOARD_SIZE; x += 1) {
            if (state.board[y][x] === player) {
                pieces.push({ x, y });
            }
        }
    }
    return pieces;
}

function setBoardMessage(message) {
    elements.overlay.hidden = false;
    elements.overlay.textContent = message;
}

function getAvailableCells() {
    return getAvailableCellsFor(PLAYERS.AI);
}
