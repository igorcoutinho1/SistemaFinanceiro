import { supabase } from './supabase.js';

const ui = {
    authContainer: document.getElementById('auth-container'), appLayout: document.getElementById('app-layout'),
    loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'),
    forgotForm: document.getElementById('forgot-form'), authMsg: document.getElementById('auth-msg'),
    userName: document.getElementById('user-name'), transactionsList: document.getElementById('transactions-list'), 
    btnAddTrx: document.getElementById('btn-add-trx'), 
    summaryTotal: document.getElementById('summary-total'), summaryPrevious: document.getElementById('summary-previous'),
    summaryIncome: document.getElementById('summary-income'), summaryExpense: document.getElementById('summary-expense'), 
    filterMonth: document.getElementById('filter-month'), categoryCharts: document.getElementById('category-charts-container'),
    btnSaveSettings: document.getElementById('btn-save-settings'), settingsMsg: document.getElementById('settings-msg'),
    setSalary: document.getElementById('set-salary'), setVa: document.getElementById('set-va'), setVaDay: document.getElementById('set-va-day'),
    
    // Modal Comprovante
    receiptModal: document.getElementById('receipt-modal'), receiptFile: document.getElementById('receipt-file'),
    btnCancelReceipt: document.getElementById('btn-cancel-receipt'), btnConfirmReceipt: document.getElementById('btn-confirm-receipt'),
    receiptMsg: document.getElementById('receipt-msg')
};

let currentGroupId = null;
let userMetadata = {};
let pendingTransactionIdToPay = null;

document.getElementById('trx-type').addEventListener('change', (e) => {
    // Agora receitas também usam status
});

const menuItems = document.querySelectorAll('.menu-item');
const views = document.querySelectorAll('.app-view');
menuItems.forEach(item => {
    item.addEventListener('click', () => {
        menuItems.forEach(btn => btn.classList.remove('active')); views.forEach(view => view.style.display = 'none');
        item.classList.add('active'); document.getElementById(item.getAttribute('data-target')).style.display = 'block';
    });
});

const now = new Date();
const localYear = now.getFullYear();
const localMonth = String(now.getMonth() + 1).padStart(2, '0');
ui.filterMonth.value = `${localYear}-${localMonth}`;

ui.filterMonth.addEventListener('change', () => { if(currentGroupId) loadTransactions(); });

function hideAuthForms() { ui.loginForm.style.display = 'none'; ui.registerForm.style.display = 'none'; ui.forgotForm.style.display = 'none'; ui.authMsg.textContent = ''; }
document.getElementById('show-register').addEventListener('click', (e) => { e.preventDefault(); hideAuthForms(); ui.registerForm.style.display = 'block'; });
['show-login-from-reg', 'show-login-from-forgot'].forEach(id => { document.getElementById(id).addEventListener('click', (e) => { e.preventDefault(); hideAuthForms(); ui.loginForm.style.display = 'block'; }); });
document.getElementById('show-forgot').addEventListener('click', (e) => { e.preventDefault(); hideAuthForms(); ui.forgotForm.style.display = 'block'; });

supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
        ui.authContainer.style.display = 'none'; ui.appLayout.style.display = 'flex';
        userMetadata = session.user.user_metadata || {}; ui.userName.textContent = userMetadata.full_name || session.user.email;
        if(ui.setSalary) ui.setSalary.value = userMetadata.fixed_salary || ''; if(ui.setVa) ui.setVa.value = userMetadata.fixed_va || ''; if(ui.setVaDay) ui.setVaDay.value = userMetadata.va_day || '';
        await initDashboard(session.user.id);
    } else { ui.authContainer.style.display = 'flex'; ui.appLayout.style.display = 'none'; currentGroupId = null; }
});

ui.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); ui.authMsg.textContent = 'Entrando...';
    const { error } = await supabase.auth.signInWithPassword({ email: document.getElementById('login-email').value, password: document.getElementById('login-password').value });
    if (error) ui.authMsg.textContent = "Erro: Credenciais inválidas.";
});
document.getElementById('btn-logout').addEventListener('click', () => { if(confirm('Tem a certeza que deseja sair?')) supabase.auth.signOut(); });

ui.btnSaveSettings.addEventListener('click', async () => {
    if(!confirm('Deseja atualizar a inteligência financeira do seu perfil?')) return;
    ui.settingsMsg.textContent = 'Salvando automações...'; ui.settingsMsg.style.color = '#333';
    const { data, error } = await supabase.auth.updateUser({ data: { fixed_salary: parseFloat(ui.setSalary.value)||0, fixed_va: parseFloat(ui.setVa.value)||0, va_day: parseInt(ui.setVaDay.value)||1 } });
    if(error) { ui.settingsMsg.style.color = 'var(--danger)'; ui.settingsMsg.textContent = 'Erro: ' + error.message; }
    else { userMetadata = data.user.user_metadata; ui.settingsMsg.style.color = 'var(--success)'; ui.settingsMsg.textContent = 'Salvo com sucesso!'; await loadTransactions(); }
});

function getFifthBusinessDay(year, month) {
    let count = 0; let day = 1;
    while (count < 5) { const wd = new Date(year, month - 1, day).getDay(); if (wd !== 0 && wd !== 6) count++; if (count < 5) day++; }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function initDashboard(userId) {
    const { data } = await supabase.from('memberships').select('financial_group_id').eq('user_id', userId).single();
    if (data) { currentGroupId = data.financial_group_id; await loadTransactions(); }
}

async function loadTransactions() {
    const [yyyyStr, mmStr] = ui.filterMonth.value.split('-');
    const startDate = `${yyyyStr}-${mmStr}-01`; const maxDays = new Date(yyyyStr, mmStr, 0).getDate(); const endDate = `${yyyyStr}-${mmStr}-${maxDays}`;

    let { data, error } = await supabase.from('transactions').select('*').eq('financial_group_id', currentGroupId).gte('due_date', startDate).lte('due_date', endDate).order('due_date', { ascending: true });
    if (error) return console.error(error);
    
    let needsRefresh = false; 
    const todayReal = new Date();
    const todayStr = `${todayReal.getFullYear()}-${String(todayReal.getMonth() + 1).padStart(2, '0')}-${String(todayReal.getDate()).padStart(2, '0')}`;

    const hasSalary = data.some(t => t.category_name === 'Salário' && t.type === 'income'); 
    const hasVA = data.some(t => t.category_name === 'Vale Alimentação' && t.type === 'income');
    
    // Motor de IA cria como pago apenas se a data de recebimento já passou ou é hoje. Senão, fica pendente!
    if (!hasSalary && userMetadata.fixed_salary > 0) { 
        const date5th = getFifthBusinessDay(parseInt(yyyyStr), parseInt(mmStr));
        const stat = date5th <= todayStr ? 'paid' : 'pending';
        await supabase.from('transactions').insert([{ financial_group_id: currentGroupId, type: 'income', status: stat, due_date: date5th, amount: userMetadata.fixed_salary, title: 'Salário Mensal Automático', category_name: 'Salário', wallet_name: 'Conta Principal' }]); 
        needsRefresh = true; 
    }
    if (!hasVA && userMetadata.fixed_va > 0) { 
        let safeDay = userMetadata.va_day > maxDays ? maxDays : userMetadata.va_day; 
        const dateVA = `${yyyyStr}-${mmStr}-${String(safeDay).padStart(2, '0')}`;
        const stat = dateVA <= todayStr ? 'paid' : 'pending';
        await supabase.from('transactions').insert([{ financial_group_id: currentGroupId, type: 'income', status: stat, due_date: dateVA, amount: userMetadata.fixed_va, title: 'VA Automático', category_name: 'Vale Alimentação', wallet_name: 'Vale Alimentação' }]); 
        needsRefresh = true; 
    }
    
    // Débitos automáticos vencidos
    for (const t of data) { 
        if (t.status === 'pending' && t.auto_debit && t.due_date <= todayStr) { 
            await supabase.from('transactions').update({ status: 'paid' }).eq('id', t.id); 
            needsRefresh = true; 
        } 
    }

    if (needsRefresh) { const res = await supabase.from('transactions').select('*').eq('financial_group_id', currentGroupId).gte('due_date', startDate).lte('due_date', endDate).order('due_date', { ascending: true }); data = res.data; }

    // =========================================================
    // CÁLCULO DO SALDO TRANSITADO (MESES ANTERIORES)
    // =========================================================
    const { data: pastData } = await supabase.from('transactions').select('amount, type').eq('financial_group_id', currentGroupId).lt('due_date', startDate).eq('status', 'paid');
    let previousBalance = 0;
    if (pastData) {
        pastData.forEach(t => {
            if (t.type === 'income') previousBalance += Number(t.amount);
            else previousBalance -= Number(t.amount);
        });
    }

    // =========================================================
    // CÁLCULO DO MÊS ATUAL E RENDERIZAÇÃO
    // =========================================================
    let totalIncome = 0; let totalExpense = 0; const categoryTotals = {}; 

    ui.transactionsList.innerHTML = data.map(t => {
        const isIncome = t.type === 'income';
        
        if (isIncome) { 
            if (t.status === 'paid') totalIncome += Number(t.amount); 
        } else { 
            if (t.status === 'paid') totalExpense += Number(t.amount); 
            const cat = t.category_name || 'Outros'; categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(t.amount); 
        }

        const sign = isIncome ? '+' : '-'; const typeClass = isIncome ? 'type-income' : 'type-expense'; const colorClass = isIncome ? 'val-income' : 'val-expense';
        const statusClass = t.status === 'paid' ? '' : 'status-pending';
        const statusBadge = t.status === 'paid' ? '<span class="badge badge-paid">Pago</span>' : '<span class="badge badge-pending">Pendente</span>';
        const autoDebitBadge = t.auto_debit ? '<span class="badge badge-auto">🔄 Débito Auto</span>' : '';
        const toggleIcon = t.status === 'paid' ? '✅' : '⏳';
        
        const dateObj = new Date(t.due_date + 'T00:00:00'); const dateStr = dateObj.toLocaleDateString('pt-BR').substring(0, 5); 
        const installText = t.installment_info ? ` <i>(${t.installment_info})</i>` : '';
        const receiptHtml = t.receipt_url ? `<a href="${t.receipt_url}" target="_blank" class="receipt-link">📎 Ver Recibo</a>` : '';

        let actionsHtml = `<button class="btn-icon btn-toggle-status" data-id="${t.id}" data-status="${t.status}" data-type="${t.type}" title="Pagar / Receber / Pendente">${toggleIcon}</button>
                           <button class="btn-icon btn-delete" data-id="${t.id}" title="Excluir" style="font-size: 16px;">🗑️</button>`;

        return `<li class="expense-item ${typeClass} ${statusClass} animate-fade-in">
            <div class="item-info">
                <div class="item-header"><strong>${t.title} ${installText}</strong> ${statusBadge} ${autoDebitBadge} ${receiptHtml}</div>
                <div class="item-meta"><span>📅 ${dateStr}</span><span>📂 ${t.category_name}</span><span>💼 ${t.wallet_name}</span></div>
            </div>
            <div class="item-value"><div class="${colorClass}">${sign} R$ ${Number(t.amount).toFixed(2)}</div></div>
            <div class="actions-cell">${actionsHtml}</div>
        </li>`;
    }).join('');

    if(data.length === 0) ui.transactionsList.innerHTML = `<p style="text-align:center; color:#94a3b8; padding: 20px;">Nenhum lançamento neste mês.</p>`;

    const totalDespesasParaGrafico = Object.values(categoryTotals).reduce((a, b) => a + b, 0);
    if (totalDespesasParaGrafico === 0) { ui.categoryCharts.innerHTML = '<p style="color:#94a3b8; font-size: 13px;">Nenhuma despesa registada neste mês.</p>'; } 
    else { ui.categoryCharts.innerHTML = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([cat, val]) => { const pct = (val / totalDespesasParaGrafico) * 100; return `<div class="animate-fade-in"><div class="chart-label"><span>${cat}</span><span class="chart-value">R$ ${val.toFixed(2)} <span style="color:#64748b; font-weight:normal; font-size:12px;">(${pct.toFixed(0)}%)</span></span></div><div class="chart-bar-bg"><div class="chart-bar-fill" style="width: ${pct}%"></div></div></div>`; }).join(''); }

    const currentMonthBalance = totalIncome - totalExpense;
    const finalTotalBalance = previousBalance + currentMonthBalance;

    ui.summaryIncome.textContent = `R$ ${totalIncome.toFixed(2).replace('.', ',')}`; 
    ui.summaryExpense.textContent = `R$ ${totalExpense.toFixed(2).replace('.', ',')}`;
    
    // Atualiza o Saldo Acumulado
    ui.summaryPrevious.textContent = `${previousBalance >= 0 ? '+' : ''} R$ ${previousBalance.toFixed(2).replace('.', ',')}`;
    ui.summaryPrevious.style.color = previousBalance >= 0 ? '#10b981' : '#fca5a5';
    
    ui.summaryTotal.textContent = `R$ ${finalTotalBalance.toFixed(2).replace('.', ',')}`; 
}

ui.btnAddTrx.addEventListener('click', async () => {
    if(!confirm('Deseja gravar este(s) lançamento(s) financeiro(s)? Verifique se os valores estão corretos.')) return;
    
    const type = document.getElementById('trx-type').value;
    const installments = parseInt(document.getElementById('trx-installments').value) || 1;
    const baseTitle = document.getElementById('trx-title').value; 
    const amount = parseFloat(document.getElementById('trx-amount').value); 
    const baseDate = document.getElementById('trx-date').value;
    
    const selectedStatus = document.getElementById('trx-status').value; 
    const isAutoDebit = document.getElementById('trx-autodebit').checked;
    
    if (!baseTitle || isNaN(amount) || !baseDate) return alert("Preencha Data, Valor e Descrição!");
    ui.btnAddTrx.textContent = "Processando..."; ui.btnAddTrx.disabled = true;

    const recordsToInsert = []; let [yyyy, mm, dd] = baseDate.split('-').map(Number);

    for (let i = 0; i < installments; i++) {
        let newM = mm + i; let newY = yyyy + Math.floor((newM - 1) / 12); newM = ((newM - 1) % 12) + 1;
        let maxDays = new Date(newY, newM, 0).getDate(); let newD = dd > maxDays ? maxDays : dd;
        recordsToInsert.push({ financial_group_id: currentGroupId, type: type, status: (i === 0 ? selectedStatus : 'pending'), auto_debit: isAutoDebit, due_date: `${newY}-${String(newM).padStart(2, '0')}-${String(newD).padStart(2, '0')}`, amount: amount, title: baseTitle, category_name: document.getElementById('trx-category').value || 'Geral', wallet_name: document.getElementById('trx-wallet').value || 'Conta Principal', installment_info: installments > 1 ? `${i+1}/${installments}` : null });
    }
    
    const { error } = await supabase.from('transactions').insert(recordsToInsert);
    ui.btnAddTrx.textContent = "Gravar Lançamento"; ui.btnAddTrx.disabled = false;
    
    if (error) alert("Erro: " + error.message);
    else { 
        document.getElementById('trx-title').value = ''; document.getElementById('trx-amount').value = ''; document.getElementById('trx-installments').value = '1'; document.getElementById('trx-autodebit').checked = false;
        document.querySelector('.menu-item[data-target="view-dashboard"]').click(); await loadTransactions(); 
    }
});

const localNow2 = new Date();
document.getElementById('trx-date').value = `${localNow2.getFullYear()}-${String(localNow2.getMonth() + 1).padStart(2, '0')}-${String(localNow2.getDate()).padStart(2, '0')}`;

ui.btnCancelReceipt.addEventListener('click', () => { ui.receiptModal.style.display = 'none'; ui.receiptFile.value = ''; pendingTransactionIdToPay = null; });
ui.btnConfirmReceipt.addEventListener('click', async () => {
    const file = ui.receiptFile.files[0];
    if (!file) { ui.receiptMsg.style.color = 'var(--danger)'; ui.receiptMsg.textContent = "Tem de selecionar um ficheiro para poder pagar!"; return; }
    
    ui.btnConfirmReceipt.textContent = "A carregar..."; ui.btnConfirmReceipt.disabled = true; ui.receiptMsg.textContent = "A fazer upload seguro..."; ui.receiptMsg.style.color = 'var(--primary)';
    
    const fileExt = file.name.split('.').pop(); const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
    const { data: uploadData, error: uploadError } = await supabase.storage.from('receipts').upload(fileName, file);
    if (uploadError) { ui.btnConfirmReceipt.textContent = "Anexar e Pagar"; ui.btnConfirmReceipt.disabled = false; ui.receiptMsg.style.color = 'var(--danger)'; ui.receiptMsg.textContent = "Erro no Upload: Certifique-se que criou o bucket 'receipts'."; return; }
    
    const { data: publicUrlData } = supabase.storage.from('receipts').getPublicUrl(fileName); const receiptUrl = publicUrlData.publicUrl;
    const { error: dbError } = await supabase.from('transactions').update({ status: 'paid', receipt_url: receiptUrl }).eq('id', pendingTransactionIdToPay);
    ui.btnConfirmReceipt.textContent = "Anexar e Pagar"; ui.btnConfirmReceipt.disabled = false;
    
    if (dbError) { ui.receiptMsg.style.color = 'var(--danger)'; ui.receiptMsg.textContent = "Erro ao guardar: " + dbError.message; } 
    else { ui.receiptModal.style.display = 'none'; ui.receiptFile.value = ''; ui.receiptMsg.textContent = ''; pendingTransactionIdToPay = null; await loadTransactions(); }
});

ui.transactionsList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if(!btn) return;
    const id = btn.getAttribute('data-id');

    if (btn.classList.contains('btn-toggle-status')) {
        const currentStatus = btn.getAttribute('data-status');
        const type = btn.getAttribute('data-type');
        
        if (currentStatus === 'pending') {
            if (type === 'expense') {
                pendingTransactionIdToPay = id; ui.receiptModal.style.display = 'flex'; ui.receiptMsg.textContent = ''; return;
            } else {
                if(!confirm('Confirma o recebimento deste valor? O seu saldo será atualizado.')) return;
            }
        } else {
            if(!confirm('Deseja reverter para PENDENTE? O valor sairá do seu saldo e o comprovante continuará salvo.')) return;
        }

        btn.textContent = '...';
        await supabase.from('transactions').update({ status: currentStatus === 'paid' ? 'pending' : 'paid' }).eq('id', id);
        await loadTransactions();
    }

    if (btn.classList.contains('btn-delete')) {
        if (confirm('⚠️ ATENÇÃO: Tem a certeza absoluta que deseja excluir este lançamento de forma permanente?')) {
            await supabase.from('transactions').delete().eq('id', id); await loadTransactions();
        }
    }
});