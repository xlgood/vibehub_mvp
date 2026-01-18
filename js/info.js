function switchTab(tabId) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    
    const buttons = document.querySelectorAll('.tab-btn');
    if(tabId === 'about') buttons[0].classList.add('active');
    if(tabId === 'privacy') buttons[1].classList.add('active');
    if(tabId === 'contact') buttons[2].classList.add('active');
}