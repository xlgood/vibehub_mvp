// ==========================================
// 1. Supabase 配置 (请再次填入你的配置)
// ==========================================
const SUPABASE_URL = 'https://glcqddlmmvqigamcnyhq.supabase.co';  // 替换此处

const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsY3FkZGxtbXZxaWdhbWNueWhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3Mzg2MzAsImV4cCI6MjA4NDMxNDYzMH0.5DYRs9SmEUY1tU0mWfG9WIXwLV0rJeTOatKV_BqRHYI';              // 替换此处

// 【修复点 1】改个名字，叫 supabaseClient，避免和全局变量冲突
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. 全局状态
// ==========================================
let state = { warm: 0, cool: 0 };
let activeViewElement = null;
let postState = { side: null, text: "" };
const MAX_CHARS = 60;
const ROW_ID = 1;

// ==========================================
// 3. 初始化与实时监听
// ==========================================
window.onload = async () => {
    // 【修复点 2】调用时使用 supabaseClient
    const { data } = await supabaseClient
        .from('vibe_stats')
        .select('*')
        .eq('id', ROW_ID)
        .single();

    if (data) {
        state.warm = data.warm; 
        state.cool = data.cool;
        updateUI();
    }

    // 【修复点 3】监听时使用 supabaseClient
    supabaseClient.channel('vibe-updates')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vibe_stats', filter: `id=eq.${ROW_ID}` }, 
        (payload) => {
            state.warm = payload.new.warm;
            state.cool = payload.new.cool;
            updateUI();
        })
        .subscribe();

    // 初始气泡 (静音加载)
    const initials = [
        {t: "Why is it so hot? 🔥", type: 'warm'}, {t: "Just want to sleep 😴", type: 'cool'},
        {t: "Code works! ⚡", type: 'warm'}, {t: "Feeling lonely...", type: 'cool'}
    ];
    initials.forEach(item => createVibe(item.t, item.type, true));
};

// ==========================================
// 4. 用户交互与 RPC 调用
// ==========================================
async function manualAddEnergy(type, btn) {
    btn.style.transform = "scale(0.9)";
    setTimeout(() => btn.style.transform = "scale(1)", 150);
    showFloatingFeedback(type, 1, btn);
    
    const rpcName = type === 'warm' ? 'increment_warm' : 'increment_cool';
    
    // 【修复点 4】RPC 调用使用 supabaseClient
    await supabaseClient.rpc(rpcName, { row_id: ROW_ID });
}

async function submitPost() {
    const input = document.getElementById('post-input');
    const text = input.value.trim();
    if (!text || !postState.side) return;
    
    createVibe(text, postState.side);
    const rpcName = postState.side === 'warm' ? 'increment_warm' : 'increment_cool';
    
    // 【修复点 5】RPC 调用使用 supabaseClient
    await supabaseClient.rpc(rpcName, { row_id: ROW_ID });
    
    closeModal('post-modal');
}

// ==========================================
// 5. UI 逻辑 (保持不变)
// ==========================================
function updateUI() {
    const total = state.warm + state.cool;
    if (total === 0) return;
    const warmPct = (state.warm / total) * 100;
    const coolPct = 100 - warmPct;

    document.getElementById('count-warm').innerText = formatCount(state.warm);
    document.getElementById('count-cool').innerText = formatCount(state.cool);
    
    const barWarm = document.getElementById('bar-warm');
    const barCool = document.getElementById('bar-cool');
    barWarm.style.width = warmPct + "%"; barCool.style.width = coolPct + "%";
    barWarm.innerText = Math.round(warmPct) + "%"; barCool.innerText = Math.round(coolPct) + "%";

    const root = document.documentElement;
    const statusText = document.getElementById('status-text');
    const voltageText = document.getElementById('voltage-text');
    const iconWrapper = document.getElementById('main-icon');
    const btnWarm = document.getElementById('btn-warm');
    const btnCool = document.getElementById('btn-cool');

    if (warmPct > 50) {
        root.style.setProperty('--bg-gradient', 'var(--warm-bg-gradient)');
        root.style.setProperty('--glass-bg', 'var(--warm-glass)');
        root.style.setProperty('--card-border', 'var(--warm-border)');
        root.style.setProperty('--primary-color', 'var(--warm-primary)');
        statusText.innerText = "Overheating"; voltageText.innerText = warmPct.toFixed(1) + "°V";
        iconWrapper.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.1.2-2.2.5-3.3a9 9 0 0 0 2.5 2.8z"></path></svg>`;
        btnWarm.classList.add('active-mode'); btnCool.classList.remove('active-mode');
    } else if (coolPct > 50) {
        root.style.setProperty('--bg-gradient', 'var(--cool-bg-gradient)');
        root.style.setProperty('--glass-bg', 'var(--cool-glass)');
        root.style.setProperty('--card-border', 'var(--cool-border)');
        root.style.setProperty('--primary-color', 'var(--cool-primary)');
        statusText.innerText = "Freezing"; voltageText.innerText = coolPct.toFixed(1) + "°K";
        iconWrapper.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18m9-9H3m15.36-6.36l-12.72 12.72m0-12.72l12.72 12.72"></path></svg>`;
        btnCool.classList.add('active-mode'); btnWarm.classList.remove('active-mode');
    } else {
        statusText.innerText = "Neutral"; voltageText.innerText = "STABLE";
        root.style.setProperty('--bg-gradient', 'radial-gradient(circle at 50% 50%, #1a1a1a 0%, #000 100%)');
        root.style.setProperty('--primary-color', '#888');
        root.style.setProperty('--glass-bg', 'rgba(30,30,30,0.6)');
        btnWarm.classList.remove('active-mode'); btnCool.classList.remove('active-mode');
    }
}

function formatCount(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num;
}

function showFloatingFeedback(type, amount, targetElement) {
    const el = document.createElement('div');
    el.className = 'feedback-float';
    el.innerText = amount > 0 ? `+${amount}` : amount;
    el.style.color = type === 'warm' ? 'var(--warm-primary)' : 'var(--cool-primary)';
    if(targetElement) {
        const rect = targetElement.getBoundingClientRect();
        el.style.left = (rect.left + rect.width / 2 - 15) + 'px';
        el.style.top = (rect.top) + 'px';
    } else { el.style.left = '50%'; el.style.top = '50%'; }
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

function createVibe(text, type, isSilent = false) {
    const container = document.getElementById('floating-area');
    const wrapper = document.createElement('div');
    wrapper.className = 'vibe-wrapper';
    const inner = document.createElement('div');
    inner.className = `vibe-inner ${type}`;
    inner.innerText = text;
    wrapper.dataset.type = type;
    const startX = Math.random() * 80 + 5;
    const startY = Math.random() * 90;
    wrapper.style.left = startX + "%"; wrapper.style.top = startY + "%";
    wrapper.style.animationDuration = (15 + Math.random() * 20) + "s";
    wrapper.style.animationDelay = "-" + (Math.random() * 10) + "s";
    wrapper.onclick = (e) => { e.stopPropagation(); openViewModal(text, wrapper); };
    wrapper.appendChild(inner); container.appendChild(wrapper);
    if (!isSilent) showFloatingFeedback(type, 1, null);
}

function openViewModal(text, element) {
    const modal = document.getElementById('view-modal');
    document.getElementById('view-text').innerText = text;
    activeViewElement = element;
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

function burnMessage() {
    const modal = document.getElementById('view-modal');
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
    if (activeViewElement) {
        activeViewElement.classList.add('shatter');
        setTimeout(() => { if (activeViewElement?.parentNode) activeViewElement.parentNode.removeChild(activeViewElement); activeViewElement = null; }, 500);
    }
}

function openPostModal() {
    const modal = document.getElementById('post-modal');
    modal.style.display = 'flex';
    postState.side = null;
    document.getElementById('post-input').value = "";
    checkInput();
    document.querySelectorAll('.side-option').forEach(el => el.classList.remove('selected'));
    setTimeout(() => modal.classList.add('show'), 10);
    document.getElementById('post-input').focus();
}

function closeModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
}

function checkInput() {
    const input = document.getElementById('post-input');
    const counter = document.getElementById('char-count');
    const btn = document.getElementById('submit-post-btn');
    const len = input.value.length;
    counter.innerText = `${len} / ${MAX_CHARS}`;
    if (len >= MAX_CHARS) counter.classList.add('limit'); else counter.classList.remove('limit');
    if (len > 0 && postState.side) btn.classList.add('ready'); else btn.classList.remove('ready');
}

function addEmoji(emoji) {
    const input = document.getElementById('post-input');
    if(input.value.length < MAX_CHARS) { input.value += emoji; checkInput(); }
}

function selectSide(side) {
    postState.side = side;
    document.querySelectorAll('.side-option').forEach(el => el.classList.remove('selected'));
    document.getElementById(`opt-${side}`).classList.add('selected');
    checkInput();
}