// ==========================================
// 1. Supabase 配置
// ==========================================
const SUPABASE_URL = 'https://glcqddlmmvqigamcnyhq.supabase.co';  // 替换此处

const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsY3FkZGxtbXZxaWdhbWNueWhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3Mzg2MzAsImV4cCI6MjA4NDMxNDYzMH0.5DYRs9SmEUY1tU0mWfG9WIXwLV0rJeTOatKV_BqRHYI';              // 替换此处

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
    // A. 加载初始数据
    const { data: stats } = await supabaseClient
        .from('vibe_stats')
        .select('*')
        .eq('id', ROW_ID)
        .single();

    if (stats) {
        state.warm = stats.warm;
        state.cool = stats.cool;
        updateUI();
    }

    const { data: messages } = await supabaseClient
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

    if (messages) {
        messages.forEach(msg => createVibe(msg.content, msg.type, true, msg.id));
    }

    // B. 开启全局监听频道 (Broadcast + Postgres Changes)
    const channel = supabaseClient.channel('global-events');

    // --- B1. 监听数值变化 (兜底校准) ---
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vibe_stats', filter: `id=eq.${ROW_ID}` }, 
        (payload) => {
            state.warm = payload.new.warm;
            state.cool = payload.new.cool;
            updateUI();
        }
    );

    // --- B2. 监听新气泡 (别人发布) ---
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, 
        (payload) => {
            const newMsg = payload.new;
            const exists = document.querySelector(`.vibe-wrapper[data-id="${newMsg.id}"]`);
            // 如果本地没有（说明是别人发的），才创建并播放特效
            if (!exists) {
                createVibe(newMsg.content, newMsg.type, false, newMsg.id); // false = 播放气泡出现动画
                
                // 【全球同步特效】别人发了气泡，我这里也能看到按钮冒+1
                const targetBtnId = newMsg.type === 'warm' ? 'btn-warm' : 'btn-cool';
                showFloatingFeedback(newMsg.type, 1, document.getElementById(targetBtnId));
            }
        }
    );

    // --- B3. 监听气泡销毁 (别人删除) ---
    channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, 
        (payload) => {
            const deletedId = payload.old.id;
            const el = document.querySelector(`.vibe-wrapper[data-id="${deletedId}"]`);
            if (el) {
                // 执行销毁动画
                el.querySelector('.vibe-inner').classList.add('shatter');
                setTimeout(() => el.remove(), 500);
            }
        }
    );

    // --- B4. 【核心】监听全球广播 (点击特效同步) ---
    // 监听 'click-effect' 事件，一旦收到，就播放特效
    channel.on('broadcast', { event: 'click-effect' }, ({ payload }) => {
        // payload 包含 { type: 'warm'/'cool', amount: 1/-1 }
        const btnId = payload.type === 'warm' ? 'btn-warm' : 'btn-cool';
        const btn = document.getElementById(btnId);
        
        // 播放别人的点击特效
        showFloatingFeedback(payload.type, payload.amount, btn);
        
        // 稍微缩放一下按钮，增加互动感
        if (btn) {
            btn.style.transform = "scale(0.95)";
            setTimeout(() => btn.style.transform = "scale(1)", 100);
        }
    });

    channel.subscribe();
};

// ==========================================
// 4. 核心交互 (发送广播)
// ==========================================

// --- 辅助函数：发送全球特效广播 ---
async function broadcastEffect(type, amount) {
    // 向 'global-events' 频道发送一条消息
    await supabaseClient.channel('global-events').send({
        type: 'broadcast',
        event: 'click-effect',
        payload: { type: type, amount: amount }
    });
}

// --- A. 点击大能量条 ---
async function manualAddEnergy(type, btn) {
    // 本地立即反馈
    btn.style.transform = "scale(0.9)";
    setTimeout(() => btn.style.transform = "scale(1)", 150);
    showFloatingFeedback(type, 1, btn);
    if (type === 'warm') state.warm++; else state.cool++;
    updateUI();

    // 1. 发送广播 (让全世界看到特效)
    broadcastEffect(type, 1);

    // 2. 更新数据库 (让全世界同步数值)
    const rpcName = type === 'warm' ? 'increment_warm' : 'increment_cool';
    await supabaseClient.rpc(rpcName, { row_id: ROW_ID });
}

// --- B. 发布新气泡 ---
async function submitPost() {
    const input = document.getElementById('post-input');
    const text = input.value.trim();
    if (!text || !postState.side) return;
    
    const type = postState.side;

    // 本地反馈
    if (type === 'warm') state.warm++; else state.cool++;
    updateUI();
    const targetBtnId = type === 'warm' ? 'btn-warm' : 'btn-cool';
    showFloatingFeedback(type, 1, document.getElementById(targetBtnId));

    // 1. 发送广播 (让全世界看到发布特效)
    broadcastEffect(type, 1);

    // 2. 存入数据库
    const { data } = await supabaseClient
        .from('messages')
        .insert({ content: text, type: type })
        .select()
        .single();

    if (data) {
        createVibe(text, type, false, data.id);
    }

    // 3. 更新数值
    const rpcName = type === 'warm' ? 'increment_warm' : 'increment_cool';
    await supabaseClient.rpc(rpcName, { row_id: ROW_ID });
    
    closeModal('post-modal');
}

// --- C. 销毁气泡 ---
async function burnMessage() {
    const modal = document.getElementById('view-modal');
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);

    if (activeViewElement) {
        const type = activeViewElement.dataset.type;
        const msgId = activeViewElement.dataset.id;

        if (type) {
            // 本地反馈
            if (type === 'warm') state.warm = Math.max(0, state.warm - 1);
            else state.cool = Math.max(0, state.cool - 1);
            updateUI();
            
            const targetBtnId = type === 'warm' ? 'btn-warm' : 'btn-cool';
            showFloatingFeedback(type, -1, document.getElementById(targetBtnId));

            // 1. 发送广播 (让全世界看到 -1 特效)
            broadcastEffect(type, -1);

            // 2. 更新数值
            const rpcName = type === 'warm' ? 'decrement_warm_v2' : 'decrement_cool_v2';
            supabaseClient.rpc(rpcName, { row_id: ROW_ID });
        }

        if (msgId) {
            await supabaseClient.from('messages').delete().eq('id', msgId);
        }

        activeViewElement.classList.add('shatter');
        setTimeout(() => {
            if (activeViewElement && activeViewElement.parentNode) {
                activeViewElement.parentNode.removeChild(activeViewElement);
            }
            activeViewElement = null;
        }, 500);
    }
}

// ==========================================
// 5. UI 逻辑 (保持不变)
// ==========================================
function updateUI() {
    const total = state.warm + state.cool;
    document.getElementById('count-warm').innerText = formatCount(state.warm);
    document.getElementById('count-cool').innerText = formatCount(state.cool);

    let warmPct = 50, coolPct = 50;
    if (total > 0) {
        warmPct = (state.warm / total) * 100;
        coolPct = 100 - warmPct;
    }

    const barWarm = document.getElementById('bar-warm');
    const barCool = document.getElementById('bar-cool');
    barWarm.style.width = warmPct + "%"; barCool.style.width = coolPct + "%";
    barWarm.innerText = total === 0 ? "0%" : Math.round(warmPct) + "%";
    barCool.innerText = total === 0 ? "0%" : Math.round(coolPct) + "%";

    const root = document.documentElement;
    const statusText = document.getElementById('status-text');
    const voltageText = document.getElementById('voltage-text');
    const iconWrapper = document.getElementById('main-icon');
    const btnWarm = document.getElementById('btn-warm');
    const btnCool = document.getElementById('btn-cool');

    if (warmPct > 50 && total > 0) {
        root.style.setProperty('--bg-gradient', 'var(--warm-bg-gradient)');
        root.style.setProperty('--glass-bg', 'var(--warm-glass)');
        root.style.setProperty('--card-border', 'var(--warm-border)');
        root.style.setProperty('--primary-color', 'var(--warm-primary)');
        statusText.innerText = "Overheating"; voltageText.innerText = warmPct.toFixed(1) + "°V";
        iconWrapper.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.1.2-2.2.5-3.3a9 9 0 0 0 2.5 2.8z"></path></svg>`;
        btnWarm.classList.add('active-mode'); btnCool.classList.remove('active-mode');
    } else if (coolPct > 50 && total > 0) {
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
        root.style.setProperty('--card-border', 'rgba(255, 255, 255, 0.1)');
        btnWarm.classList.remove('active-mode'); btnCool.classList.remove('active-mode');
    }
}

// ==========================================
// 6. 辅助函数
// ==========================================
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
    } else { 
        el.style.left = '50%'; el.style.top = '50%'; 
    }
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

function createVibe(text, type, isSilent = false, id = null) {
    const container = document.getElementById('floating-area');
    const wrapper = document.createElement('div');
    wrapper.className = 'vibe-wrapper';
    if (id) wrapper.dataset.id = id;
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