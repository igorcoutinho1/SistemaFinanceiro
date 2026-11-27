import { supabase } from './supabase.js';

const ui = {
    authContainer: document.getElementById('auth-container'), appLayout: document.getElementById('app-layout'),
    loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'),
    forgotForm: document.getElementById('forgot-form'), authMsg: document.getElementById('auth-msg'),
    userName: document.getElementById('user-name'), userRoleBadge: document.getElementById('user-role-badge'),
    transactionsList: document.getElementById('transactions-list'), btnAddTrx: document.getElementById('btn-add-trx'),
    summaryTotal: document.getElementById('summary-total'), summaryPrevious: document.getElementById('summary-previous'),
    summaryIncome: document.getElementById('summary-income'), summaryExpense: document.getElementById('summary-expense'),
    walletBalancesContainer: document.getElementById('wallet-balances-container'),
    filterMonth: document.getElementById('filter-month'), filterWallet: document.getElementById('filter-wallet'),
    categoryCharts: document.getElementById('category-charts-container'),
    btnSaveSettings: document.getElementById('btn-save-settings'), settingsMsg: document.getElementById('settings-msg'),
    setSalary: document.getElementById('set-salary'), setVa: document.getElementById('set-va'), setVaDay: document.getElementById('set-va-day'),
    adminBudgetsPanel: document.getElementById('admin-budgets-panel'), budgetCategory: document.getElementById('budget-category'),
    budgetLimit: document.getElementById('budget-limit'), btnSaveBudget: document.getElementById('btn-save-budget'),
    budgetMsg: document.getElementById('budget-msg'), budgetsList: document.getElementById('budgets-list'),
    adminFamilyPanel: document.getElementById('admin-family-panel'), memberFamilyPanel: document.getElementById('member-family-panel'),
    btnGenerateInvite: document.getElementById('btn-generate-invite'), inviteCodeBox: document.getElementById('invite-code-box'),
    generatedInviteCode: document.getElementById('generated-invite-code'), btnCopyInvite: document.getElementById('btn-copy-invite'),
    familyMsg: document.getElementById('family-msg'), familyMembersList: document.getElementById('family-members-list'),
    inviteCodeInput: document.getElementById('invite-code-input'), btnRedeemInvite: document.getElementById('btn-redeem-invite'),
    joinFamilyMsg: document.getElementById('join-family-msg'),
    receiptModal: document.getElementById('receipt-modal'), receiptFile: document.getElementById('receipt-file'),
    btnCancelReceipt: document.getElementById('btn-cancel-receipt'), btnConfirmReceipt: document.getElementById('btn-confirm-receipt'),
    receiptMsg: document.getElementById('receipt-msg')
};

let currentGroupId = null;
let currentUserId = null;
let currentUserRole = 'member';
let userMetadata = {};
let pendingTransactionIdToPay = null;
let currentMonthTransactions = [];
let groupBudgets = [];
let activeStatusFilter = 'all';
let activeWalletFilter = 'all';

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getFirstName() {
    return (userMetadata.full_name || ui.userName.textContent || 'Titular').trim().split(' ')[0];
}

const menuItems = document.querySelectorAll('.menu-item');
const views = document.querySelectorAll('.app-view');
menuItems.forEach(item => {
    item.addEventListener('click', () => {
        menuItems.forEach(btn => btn.classList.remove('active'));
        views.forEach(view => view.style.display = 'none');
        item.classList.add('active');
        document.getElementById(item.getAttribute('data-target')).style.display = 'block';
    });
});

const now = new Date();
ui.filterMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
document.getElementById('trx-date').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
ui.filterMonth.addEventListener('change', () => { if (currentGroupId) loadTransactions(); });

document.querySelectorAll('.status-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.status-filter-btn').forEach(b => {
            b.classList.remove('primary');
            b.classList.add('outline');
        });
        btn.classList.remove('outline');
        btn.classList.add('primary');
        activeStatusFilter = btn.getAttribute('data-status');
        renderTransactionsList();
    });
});

ui.filterWallet.addEventListener('change', (e) => {
    activeWalletFilter = e.target.value;
    renderTransactionsList();
});

function hideAuthForms() {
    ui.loginForm.style.display = 'none';
    ui.registerForm.style.display = 'none';
    ui.forgotForm.style.display = 'none';
    ui.authMsg.textContent = '';
}
document.getElementById('show-register').addEventListener('click', (e) => { e.preventDefault(); hideAuthForms(); ui.registerForm.style.display = 'block'; });
['show-login-from-reg', 'show-login-from-forgot'].forEach(id => {
    document.getElementById(id).addEventListener('click', (e) => { e.preventDefault(); hideAuthForms(); ui.loginForm.style.display = 'block'; });
});
document.getElementById('show-forgot').addEventListener('click', (e) => { e.preventDefault(); hideAuthForms(); ui.forgotForm.style.display = 'block'; });

supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
        ui.authContainer.style.display = 'none';
        ui.appLayout.style.display = 'flex';
        currentUserId = session.user.id;
        userMetadata = session.user.user_metadata || {};
        ui.userName.textContent = userMetadata.full_name || session.user.email;
        if (ui.setSalary) ui.setSalary.value = userMetadata.fixed_salary || '';
        if (ui.setVa) ui.setVa.value = userMetadata.fixed_va || '';
        if (ui.setVaDay) ui.setVaDay.value = userMetadata.va_day || '';
        await initDashboard(session.user);
    } else {
        ui.authContainer.style.display = 'flex';
        ui.appLayout.style.display = 'none';
        currentGroupId = null;
        currentUserId = null;
    }
});

ui.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    ui.authMsg.style.color = '#333';
    ui.authMsg.textContent = 'Entrando...';
    const { error } = await supabase.auth.signInWithPassword({
        email: document.getElementById('login-email').value,
        password: document.getElementById('login-password').value
    });
    if (error) { ui.authMsg.style.color = 'var(--danger)'; ui.authMsg.textContent = 'Erro: Credenciais inválidas.'; }
});

ui.registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    ui.authMsg.style.color = '#333';
    ui.authMsg.textContent = 'Criando conta...';
    const fullName = document.getElementById('reg-name').value.trim();
    const { error } = await supabase.auth.signUp({
        email: document.getElementById('reg-email').value,
        password: document.getElementById('reg-password').value,
        options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/success.html` }
    });
    if (error) { ui.authMsg.style.color = 'var(--danger)'; ui.authMsg.textContent = 'Erro: ' + error.message; }
    else { ui.authMsg.style.color = 'var(--success)'; ui.authMsg.textContent = 'Cadastro realizado! Verifique o seu e-mail para confirmar.'; }
});

ui.forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    ui.authMsg.style.color = '#333';
    ui.authMsg.textContent = 'Enviando link...';
    const { error } = await supabase.auth.resetPasswordForEmail(
        document.getElementById('forgot-email').value,
        { redirectTo: `${window.location.origin}/success.html` }
    );
    if (error) { ui.authMsg.style.color = 'var(--danger)'; ui.authMsg.textContent = 'Erro: ' + error.message; }
    else { ui.authMsg.style.color = 'var(--success)'; ui.authMsg.textContent = 'Link de recuperação enviado para o seu e-mail!'; }
});

document.getElementById('btn-logout').addEventListener('click', () => {
    if (confirm('Tem a certeza que deseja sair?')) supabase.auth.signOut();
});

ui.btnSaveSettings.addEventListener('click', async () => {
    if (!confirm('Deseja atualizar a inteligência financeira do seu perfil?')) return;
    ui.settingsMsg.textContent = 'Salvando automações...';
    ui.settingsMsg.style.color = '#333';
    const { data, error } = await supabase.auth.updateUser({
        data: {
            fixed_salary: parseFloat(ui.setSalary.value) || 0,
            fixed_va: parseFloat(ui.setVa.value) || 0,
            va_day: parseInt(ui.setVaDay.value) || 1
        }
    });
    if (error) { ui.settingsMsg.style.color = 'var(--danger)'; ui.settingsMsg.textContent = 'Erro: ' + error.message; }
    else {
        userMetadata = data.user.user_metadata;
        ui.settingsMsg.style.color = 'var(--success)';
        ui.settingsMsg.textContent = 'Salvo com sucesso!';
        await loadTransactions();
    }
});

function applyRoleUI() {
    const isAdmin = currentUserRole === 'admin';
    ui.userRoleBadge.textContent = isAdmin ? '👑 Administrador' : '👤 Membro';
    ui.userRoleBadge.className = isAdmin ? 'badge badge-paid' : 'badge badge-auto';
    ui.adminBudgetsPanel.style.display = isAdmin ? 'block' : 'none';
    ui.adminFamilyPanel.style.display = isAdmin ? 'block' : 'none';
    ui.memberFamilyPanel.style.display = isAdmin ? 'none' : 'block';
}

async function initDashboard(user) {
    const displayName = (user.user_metadata && user.user_metadata.full_name) || user.email;
    let { data } = await supabase.from('memberships').select('financial_group_id, role, member_label').eq('user_id', user.id).maybeSingle();

    if (!data) {
        const newGroupId = crypto.randomUUID();
        const { data: created } = await supabase.from('memberships')
            .insert([{ user_id: user.id, financial_group_id: newGroupId, role: 'admin', member_label: displayName }])
            .select('financial_group_id, role, member_label').single();
        data = created;
    } else if (!data.member_label) {
        await supabase.from('memberships').update({ member_label: displayName }).eq('user_id', user.id);
    }

    if (data) {
        currentGroupId = data.financial_group_id;
        currentUserRole = data.role || 'admin';
        applyRoleUI();
        if (currentUserRole === 'admin') await loadFamilyMembers();
        await loadTransactions();
    }
}

async function loadBudgets() {
    const { data } = await supabase.from('category_budgets').select('*').eq('financial_group_id', currentGroupId).order('category_name', { ascending: true });
    groupBudgets = data || [];
    if (currentUserRole === 'admin' && ui.budgetsList) {
        if (groupBudgets.length === 0) {
            ui.budgetsList.innerHTML = '<li style="color:#94a3b8; font-size:13px;">Nenhuma meta cadastrada.</li>';
        } else {
            ui.budgetsList.innerHTML = groupBudgets.map(b => `
                <li class="expense-item type-expense" style="padding: 10px 14px;">
                    <div class="item-info"><strong>📂 ${escapeHtml(b.category_name)}</strong></div>
                    <div class="item-value"><div style="font-weight:700; color:#d97706;">Teto: R$ ${Number(b.monthly_limit).toFixed(2).replace('.', ',')}</div></div>
                    <div class="actions-cell"><button class="btn-icon btn-delete-budget" data-id="${b.id}" title="Excluir meta">🗑️</button></div>
                </li>
            `).join('');
        }
    }
}

ui.btnSaveBudget.addEventListener('click', async () => {
    if (currentUserRole !== 'admin') return;
    const cat = ui.budgetCategory.value.trim();
    const limit = parseFloat(ui.budgetLimit.value);
    if (!cat || isNaN(limit) || limit <= 0) {
        ui.budgetMsg.style.color = 'var(--danger)';
        ui.budgetMsg.textContent = 'Informe uma categoria válida e um limite maior que zero.';
        return;
    }
    if (!confirm(`Definir teto mensal de R$ ${limit.toFixed(2)} para a categoria "${cat}"?`)) return;

    ui.btnSaveBudget.disabled = true;
    const { error } = await supabase.from('category_budgets').upsert(
        { financial_group_id: currentGroupId, category_name: cat, monthly_limit: limit },
        { onConflict: 'financial_group_id,category_name' }
    );
    ui.btnSaveBudget.disabled = false;

    if (error) {
        ui.budgetMsg.style.color = 'var(--danger)';
        ui.budgetMsg.textContent = 'Erro ao salvar meta: ' + error.message;
    } else {
        ui.budgetCategory.value = '';
        ui.budgetLimit.value = '';
        ui.budgetMsg.style.color = 'var(--success)';
        ui.budgetMsg.textContent = 'Meta salva com sucesso!';
        await loadTransactions();
    }
});

ui.budgetsList.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-delete-budget');
    if (!btn || currentUserRole !== 'admin') return;
    if (confirm('Deseja remover este limite de categoria?')) {
        await supabase.from('category_budgets').delete().eq('id', btn.getAttribute('data-id'));
        await loadTransactions();
    }
});

async function loadFamilyMembers() {
    const { data } = await supabase.from('memberships').select('user_id, role, member_label').eq('financial_group_id', currentGroupId);
    if (!data || data.length === 0) {
        ui.familyMembersList.innerHTML = '<li style="color:#94a3b8; font-size:13px;">Nenhum membro adicional vinculado.</li>';
        return;
    }
    ui.familyMembersList.innerHTML = data.map(m => {
        const roleTag = m.role === 'admin' ? '<span class="badge badge-paid">👑 Admin</span>' : '<span class="badge badge-auto">👤 Membro</span>';
        const removeBtn = (m.role !== 'admin' && m.user_id !== currentUserId)
            ? `<button class="btn-icon btn-remove-member" data-uid="${m.user_id}" title="Remover do grupo">🗑️</button>` : '';
        return `<li class="expense-item type-income" style="padding: 10px 14px;">
            <div class="item-info"><strong>${escapeHtml(m.member_label || 'Integrante')}</strong> ${roleTag}</div>
            <div class="actions-cell">${removeBtn}</div>
        </li>`;
    }).join('');
}

ui.familyMembersList.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-remove-member');
    if (!btn) return;
    if (confirm('Deseja desvincular este membro do grupo familiar?')) {
        await supabase.from('memberships').delete().eq('user_id', btn.getAttribute('data-uid')).eq('financial_group_id', currentGroupId);
        await loadFamilyMembers();
    }
});

ui.btnGenerateInvite.addEventListener('click', async () => {
    ui.familyMsg.textContent = 'Gerando código...';
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    const inviteCode = `FAM-${randomPart}`;
    const { error } = await supabase.from('family_invites').insert([{
        financial_group_id: currentGroupId,
        invite_code: inviteCode,
        created_by: currentUserId
    }]);
    if (error) {
        ui.familyMsg.style.color = 'var(--danger)';
        ui.familyMsg.textContent = 'Erro ao gerar convite: ' + error.message;
    } else {
        ui.familyMsg.textContent = '';
        ui.generatedInviteCode.textContent = inviteCode;
        ui.inviteCodeBox.style.display = 'block';
    }
});

ui.btnCopyInvite.addEventListener('click', () => {
    navigator.clipboard.writeText(ui.generatedInviteCode.textContent);
    ui.btnCopyInvite.textContent = '✅ Copiado!';
    setTimeout(() => { ui.btnCopyInvite.textContent = '📋 Copiar'; }, 2000);
});

ui.btnRedeemInvite.addEventListener('click', async () => {
    const code = ui.inviteCodeInput.value.trim().toUpperCase();
    if (!code) { ui.joinFamilyMsg.style.color = 'var(--danger)'; ui.joinFamilyMsg.textContent = 'Digite o código de convite.'; return; }
    if (!confirm('Ao vincular-se a um grupo familiar, sua visualização passará a exibir o painel compartilhado. Deseja continuar?')) return;

    ui.btnRedeemInvite.disabled = true;
    ui.joinFamilyMsg.style.color = '#333';
    ui.joinFamilyMsg.textContent = 'Validando código...';

    const label = userMetadata.full_name || ui.userName.textContent || 'Membro';
    const { data, error } = await supabase.rpc('redeem_family_invite', { p_code: code, p_name: label });
    ui.btnRedeemInvite.disabled = false;

    if (error || !data || !data.success) {
        ui.joinFamilyMsg.style.color = 'var(--danger)';
        ui.joinFamilyMsg.textContent = (data && data.message) || (error && error.message) || 'Código inválido.';
    } else {
        ui.joinFamilyMsg.style.color = 'var(--success)';
        ui.joinFamilyMsg.textContent = data.message;
        ui.inviteCodeInput.value = '';
        const { data: userData } = await supabase.auth.getUser();
        if (userData && userData.user) await initDashboard(userData.user);
    }
});

function getFifthBusinessDay(year, month) {
    let count = 0; let day = 1;
    while (count < 5) {
        const wd = new Date(year, month - 1, day).getDay();
        if (wd !== 0 && wd !== 6) count++;
        if (count < 5) day++;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function renderWalletBalances(walletTotals) {
    const walletMeta = {
        'Conta Principal': { icon: '🏦', bg: '#f0f9ff', border: '#bae6fd' },
        'Vale Alimentação': { icon: '🛒', bg: '#f0fdf4', border: '#bbf7d0' },
        'Cartão de Crédito': { icon: '💳', bg: '#fef2f2', border: '#fecaca' }
    };

    ui.walletBalancesContainer.innerHTML = Object.entries(walletTotals).map(([wallet, val]) => {
        const meta = walletMeta[wallet] || { icon: '💼', bg: '#f8fafc', border: '#e2e8f0' };
        const color = val >= 0 ? 'var(--success)' : 'var(--danger)';
        return `<div style="background:${meta.bg}; border:1px solid ${meta.border}; border-radius:8px; padding:12px 14px;">
            <div style="font-size:12px; color:#475569; font-weight:600;">${meta.icon} ${escapeHtml(wallet)}</div>
            <div style="font-size:18px; font-weight:700; color:${color}; margin-top:4px;">R$ ${val.toFixed(2).replace('.', ',')}</div>
        </div>`;
    }).join('');
}

function renderCategoryCharts(categoryTotals) {
    const budgetMap = {};
    groupBudgets.forEach(b => {
        budgetMap[b.category_name.trim().toLowerCase()] = { label: b.category_name.trim(), limit: Number(b.monthly_limit) };
    });

    const mergedCategories = {};
    Object.entries(budgetMap).forEach(([key, info]) => {
        mergedCategories[key] = { label: info.label, spent: 0, limit: info.limit };
    });

    Object.entries(categoryTotals).forEach(([cat, val]) => {
        const key = cat.trim().toLowerCase();
        if (mergedCategories[key]) {
            mergedCategories[key].spent += val;
        } else {
            mergedCategories[key] = { label: cat.trim(), spent: val, limit: null };
        }
    });

    const entries = Object.values(mergedCategories);
    const totalDespesasGeral = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

    if (entries.length === 0) {
        ui.categoryCharts.innerHTML = '<p style="color:#94a3b8; font-size: 13px;">Nenhuma despesa ou meta registada neste mês.</p>';
        return;
    }

    ui.categoryCharts.innerHTML = entries.sort((a, b) => b.spent - a.spent).map(item => {
        if (item.limit && item.limit > 0) {
            const rawPct = (item.spent / item.limit) * 100;
            const barWidth = Math.min(rawPct, 100);
            let barColor = 'var(--success)';
            let alertBadge = '';

            if (rawPct >= 100) {
                barColor = 'var(--danger)';
                alertBadge = '<span class="badge badge-pending" style="background:#fee2e2; color:#b91c1c; margin-left:6px;">🚨 Limite Excedido</span>';
            } else if (rawPct >= 80) {
                barColor = '#f59e0b';
                alertBadge = '<span class="badge badge-pending" style="margin-left:6px;">⚠️ Próximo do Teto</span>';
            }

            return `<div class="animate-fade-in" style="margin-bottom: 12px;">
                <div class="chart-label">
                    <span>${escapeHtml(item.label)} ${alertBadge}</span>
                    <span class="chart-value">R$ ${item.spent.toFixed(2)} <span style="color:#64748b; font-weight:normal; font-size:12px;">/ R$ ${item.limit.toFixed(2)} (${rawPct.toFixed(0)}%)</span></span>
                </div>
                <div class="chart-bar-bg"><div class="chart-bar-fill" style="width: ${barWidth}%; background-color: ${barColor};"></div></div>
            </div>`;
        } else {
            const pct = totalDespesasGeral > 0 ? (item.spent / totalDespesasGeral) * 100 : 0;
            return `<div class="animate-fade-in" style="margin-bottom: 12px;">
                <div class="chart-label">
                    <span>${escapeHtml(item.label)} <span style="font-size:11px; color:#94a3b8; font-weight:normal;">(sem meta)</span></span>
                    <span class="chart-value">R$ ${item.spent.toFixed(2)} <span style="color:#64748b; font-weight:normal; font-size:12px;">(${pct.toFixed(0)}%)</span></span>
                </div>
                <div class="chart-bar-bg"><div class="chart-bar-fill" style="width: ${pct}%;"></div></div>
            </div>`;
        }
    }).join('');
}

function renderTransactionsList() {
    const isAdmin = currentUserRole === 'admin';
    const filtered = currentMonthTransactions.filter(t => {
        const matchStatus = activeStatusFilter === 'all' || t.status === activeStatusFilter;
        const matchWallet = activeWalletFilter === 'all' || (t.wallet_name || 'Conta Principal') === activeWalletFilter;
        return matchStatus && matchWallet;
    });

    if (filtered.length === 0) {
        ui.transactionsList.innerHTML = '<p style="text-align:center; color:#94a3b8; padding: 20px;">Nenhum lançamento encontrado para os filtros selecionados.</p>';
        return;
    }

    ui.transactionsList.innerHTML = filtered.map(t => {
        const isIncome = t.type === 'income';
        const sign = isIncome ? '+' : '-';
        const typeClass = isIncome ? 'type-income' : 'type-expense';
        const colorClass = isIncome ? 'val-income' : 'val-expense';
        const statusClass = t.status === 'paid' ? '' : 'status-pending';
        const statusBadge = t.status === 'paid' ? '<span class="badge badge-paid">Pago</span>' : '<span class="badge badge-pending">Pendente</span>';
        const autoDebitBadge = t.auto_debit ? '<span class="badge badge-auto">🔄 Débito Auto</span>' : '';
        const toggleIcon = t.status === 'paid' ? '✅' : '⏳';
        const dateObj = new Date(t.due_date + 'T00:00:00');
        const dateStr = dateObj.toLocaleDateString('pt-BR').substring(0, 5);
        const installText = t.installment_info ? ` <i>(${escapeHtml(t.installment_info)})</i>` : '';
        const receiptHtml = t.receipt_url ? `<a href="${escapeHtml(t.receipt_url)}" target="_blank" rel="noopener noreferrer" class="receipt-link">📎 Ver Recibo</a>` : '';
        const authorTag = t.created_by_name ? `<span style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:11px; color:#475569;">👤 ${escapeHtml(t.created_by_name)}</span>` : '';
        const deleteBtnHtml = isAdmin ? `<button class="btn-icon btn-delete" data-id="${t.id}" title="Excluir" style="font-size: 16px;">🗑️</button>` : '';

        return `<li class="expense-item ${typeClass} ${statusClass} animate-fade-in">
            <div class="item-info">
                <div class="item-header"><strong>${escapeHtml(t.title)} ${installText}</strong> ${statusBadge} ${autoDebitBadge} ${receiptHtml}</div>
                <div class="item-meta"><span>📅 ${dateStr}</span><span>📂 ${escapeHtml(t.category_name)}</span><span>💼 ${escapeHtml(t.wallet_name)}</span>${authorTag}</div>
            </div>
            <div class="item-value"><div class="${colorClass}">${sign} R$ ${Number(t.amount).toFixed(2)}</div></div>
            <div class="actions-cell">
                <button class="btn-icon btn-toggle-status" data-id="${t.id}" data-status="${t.status}" data-type="${t.type}" title="Pagar / Receber / Pendente">${toggleIcon}</button>
                ${deleteBtnHtml}
            </div>
        </li>`;
    }).join('');
}

async function loadTransactions() {
    await loadBudgets();

    const [yyyyStr, mmStr] = ui.filterMonth.value.split('-');
    const startDate = `${yyyyStr}-${mmStr}-01`;
    const maxDays = new Date(yyyyStr, mmStr, 0).getDate();
    const endDate = `${yyyyStr}-${mmStr}-${maxDays}`;

    let { data, error } = await supabase.from('transactions').select('*').eq('financial_group_id', currentGroupId).gte('due_date', startDate).lte('due_date', endDate).order('due_date', { ascending: true });
    if (error) return console.error(error);

    let needsRefresh = false;
    const todayReal = new Date();
    const todayStr = `${todayReal.getFullYear()}-${String(todayReal.getMonth() + 1).padStart(2, '0')}-${String(todayReal.getDate()).padStart(2, '0')}`;

    const firstName = getFirstName();
    const salaryTitle = `Salário Automático - ${firstName}`;
    const vaTitle = `VA Automático - ${firstName}`;

    const hasSalary = data.some(t => t.type === 'income' && t.category_name === 'Salário' && (t.title === salaryTitle || t.title === 'Salário Mensal Automático'));
    const hasVA = data.some(t => t.type === 'income' && t.category_name === 'Vale Alimentação' && (t.title === vaTitle || t.title === 'VA Automático'));

    if (!hasSalary && userMetadata.fixed_salary > 0) {
        const date5th = getFifthBusinessDay(parseInt(yyyyStr), parseInt(mmStr));
        const stat = date5th <= todayStr ? 'paid' : 'pending';
        await supabase.from('transactions').insert([{
            financial_group_id: currentGroupId, type: 'income', status: stat, due_date: date5th,
            amount: userMetadata.fixed_salary, title: salaryTitle, category_name: 'Salário',
            wallet_name: 'Conta Principal', created_by: currentUserId, created_by_name: firstName
        }]);
        needsRefresh = true;
    }

    if (!hasVA && userMetadata.fixed_va > 0) {
        const safeDay = userMetadata.va_day > maxDays ? maxDays : userMetadata.va_day;
        const dateVA = `${yyyyStr}-${mmStr}-${String(safeDay).padStart(2, '0')}`;
        const stat = dateVA <= todayStr ? 'paid' : 'pending';
        await supabase.from('transactions').insert([{
            financial_group_id: currentGroupId, type: 'income', status: stat, due_date: dateVA,
            amount: userMetadata.fixed_va, title: vaTitle, category_name: 'Vale Alimentação',
            wallet_name: 'Vale Alimentação', created_by: currentUserId, created_by_name: firstName
        }]);
        needsRefresh = true;
    }

    for (const t of data) {
        if (t.status === 'pending' && t.auto_debit && t.due_date <= todayStr) {
            await supabase.from('transactions').update({ status: 'paid' }).eq('id', t.id);
            needsRefresh = true;
        }
    }

    if (needsRefresh) {
        const res = await supabase.from('transactions').select('*').eq('financial_group_id', currentGroupId).gte('due_date', startDate).lte('due_date', endDate).order('due_date', { ascending: true });
        data = res.data || [];
    }

    currentMonthTransactions = data;

    const { data: pastData } = await supabase.from('transactions').select('amount, type, wallet_name').eq('financial_group_id', currentGroupId).lt('due_date', startDate).eq('status', 'paid');
    let previousBalance = 0;
    const walletTotals = { 'Conta Principal': 0, 'Vale Alimentação': 0, 'Cartão de Crédito': 0 };

    if (pastData) {
        pastData.forEach(t => {
            const delta = t.type === 'income' ? Number(t.amount) : -Number(t.amount);
            previousBalance += delta;
            const w = t.wallet_name || 'Conta Principal';
            walletTotals[w] = (walletTotals[w] || 0) + delta;
        });
    }

    let totalIncome = 0; let totalExpense = 0; const categoryTotals = {};
    data.forEach(t => {
        const isIncome = t.type === 'income';
        const amt = Number(t.amount);
        if (t.status === 'paid') {
            const w = t.wallet_name || 'Conta Principal';
            walletTotals[w] = (walletTotals[w] || 0) + (isIncome ? amt : -amt);
        }
        if (isIncome) {
            if (t.status === 'paid') totalIncome += amt;
        } else {
            if (t.status === 'paid') totalExpense += amt;
            const cat = (t.category_name || 'Outros').trim();
            categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
        }
    });

    renderWalletBalances(walletTotals);
    renderCategoryCharts(categoryTotals);
    renderTransactionsList();

    const finalTotalBalance = previousBalance + (totalIncome - totalExpense);
    ui.summaryIncome.textContent = `R$ ${totalIncome.toFixed(2).replace('.', ',')}`;
    ui.summaryExpense.textContent = `R$ ${totalExpense.toFixed(2).replace('.', ',')}`;
    ui.summaryPrevious.textContent = `${previousBalance >= 0 ? '+' : ''} R$ ${previousBalance.toFixed(2).replace('.', ',')}`;
    ui.summaryPrevious.style.color = previousBalance >= 0 ? '#10b981' : '#fca5a5';
    ui.summaryTotal.textContent = `R$ ${finalTotalBalance.toFixed(2).replace('.', ',')}`;
}

ui.btnAddTrx.addEventListener('click', async () => {
    if (!confirm('Deseja gravar este(s) lançamento(s) financeiro(s)? Verifique se os valores estão corretos.')) return;
    const type = document.getElementById('trx-type').value;
    const installments = parseInt(document.getElementById('trx-installments').value) || 1;
    const baseTitle = document.getElementById('trx-title').value;
    const amount = parseFloat(document.getElementById('trx-amount').value);
    const baseDate = document.getElementById('trx-date').value;
    const selectedStatus = document.getElementById('trx-status').value;
    const isAutoDebit = document.getElementById('trx-autodebit').checked;

    if (!baseTitle || isNaN(amount) || !baseDate) return alert('Preencha Data, Valor e Descrição!');
    ui.btnAddTrx.textContent = 'Processando...';
    ui.btnAddTrx.disabled = true;

    const recordsToInsert = [];
    const [yyyy, mm, dd] = baseDate.split('-').map(Number);
    const authorName = getFirstName();
    const catName = (document.getElementById('trx-category').value || 'Geral').trim();

    for (let i = 0; i < installments; i++) {
        let newM = mm + i;
        const newY = yyyy + Math.floor((newM - 1) / 12);
        newM = ((newM - 1) % 12) + 1;
        const maxDays = new Date(newY, newM, 0).getDate();
        const newD = dd > maxDays ? maxDays : dd;
        recordsToInsert.push({
            financial_group_id: currentGroupId, type, status: (i === 0 ? selectedStatus : 'pending'),
            auto_debit: isAutoDebit, due_date: `${newY}-${String(newM).padStart(2, '0')}-${String(newD).padStart(2, '0')}`,
            amount, title: baseTitle, category_name: catName,
            wallet_name: document.getElementById('trx-wallet').value || 'Conta Principal',
            installment_info: installments > 1 ? `${i + 1}/${installments}` : null,
            created_by: currentUserId, created_by_name: authorName
        });
    }

    const { error } = await supabase.from('transactions').insert(recordsToInsert);
    ui.btnAddTrx.textContent = 'Gravar Lançamento';
    ui.btnAddTrx.disabled = false;

    if (error) alert('Erro: ' + error.message);
    else {
        document.getElementById('trx-title').value = '';
        document.getElementById('trx-amount').value = '';
        document.getElementById('trx-installments').value = '1';
        document.getElementById('trx-autodebit').checked = false;
        document.querySelector('.menu-item[data-target="view-dashboard"]').click();
        await loadTransactions();
    }
});

ui.btnCancelReceipt.addEventListener('click', () => {
    ui.receiptModal.style.display = 'none';
    ui.receiptFile.value = '';
    pendingTransactionIdToPay = null;
});

ui.btnConfirmReceipt.addEventListener('click', async () => {
    const file = ui.receiptFile.files[0];
    if (!file) { ui.receiptMsg.style.color = 'var(--danger)'; ui.receiptMsg.textContent = 'Selecione um ficheiro para poder pagar!'; return; }

    ui.btnConfirmReceipt.textContent = 'A carregar...';
    ui.btnConfirmReceipt.disabled = true;
    ui.receiptMsg.textContent = 'A fazer upload seguro...';
    ui.receiptMsg.style.color = 'var(--primary)';

    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('receipts').upload(fileName, file);
    if (uploadError) {
        ui.btnConfirmReceipt.textContent = 'Anexar e Pagar';
        ui.btnConfirmReceipt.disabled = false;
        ui.receiptMsg.style.color = 'var(--danger)';
        ui.receiptMsg.textContent = "Erro no Upload: Certifique-se que criou o bucket 'receipts'.";
        return;
    }

    const { data: publicUrlData } = supabase.storage.from('receipts').getPublicUrl(fileName);
    const { error: dbError } = await supabase.from('transactions').update({ status: 'paid', receipt_url: publicUrlData.publicUrl }).eq('id', pendingTransactionIdToPay);
    ui.btnConfirmReceipt.textContent = 'Anexar e Pagar';
    ui.btnConfirmReceipt.disabled = false;

    if (dbError) { ui.receiptMsg.style.color = 'var(--danger)'; ui.receiptMsg.textContent = 'Erro ao guardar: ' + dbError.message; }
    else {
        ui.receiptModal.style.display = 'none';
        ui.receiptFile.value = '';
        ui.receiptMsg.textContent = '';
        pendingTransactionIdToPay = null;
        await loadTransactions();
    }
});

ui.transactionsList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.getAttribute('data-id');

    if (btn.classList.contains('btn-toggle-status')) {
        const currentStatus = btn.getAttribute('data-status');
        const type = btn.getAttribute('data-type');
        if (currentStatus === 'pending') {
            if (type === 'expense') {
                pendingTransactionIdToPay = id;
                ui.receiptModal.style.display = 'flex';
                ui.receiptMsg.textContent = '';
                return;
            } else if (!confirm('Confirma o recebimento deste valor? O seu saldo será atualizado.')) return;
        } else if (!confirm('Deseja reverter para PENDENTE? O valor sairá do seu saldo e o comprovante continuará salvo.')) return;

        btn.textContent = '...';
        await supabase.from('transactions').update({ status: currentStatus === 'paid' ? 'pending' : 'paid' }).eq('id', id);
        await loadTransactions();
    }

    if (btn.classList.contains('btn-delete') && currentUserRole === 'admin') {
        if (confirm('⚠️ ATENÇÃO: Tem a certeza absoluta que deseja excluir este lançamento de forma permanente?')) {
            await supabase.from('transactions').delete().eq('id', id);
            await loadTransactions();
        }
    }
});
