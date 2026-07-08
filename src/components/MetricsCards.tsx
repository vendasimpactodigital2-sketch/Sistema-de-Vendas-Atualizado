import { DollarSign, ShieldAlert, BadgePercent, TrendingUp, HandCoins, Truck, LayoutDashboard, Trophy } from "lucide-react";
import React from "react";
import { Sale, Expense, getSaleOrderDate, getSaleOperationCost } from "../types";

interface MetricsCardsProps {
  sales: Sale[];
  expenses?: Expense[];
  filterPeriod?: "all" | "today" | "week" | "custom";
  customDate?: string;
  customStartDate?: string;
  customEndDate?: string;
  onPendingClick?: () => void;
  onWeeklyGoalClick?: () => void;
  onCardClick?: (cardType: "faturamento" | "entradas" | "pendentes" | "custos" | "lucro") => void;
}

export function MetricsCards({ 
  sales, 
  expenses = [], 
  filterPeriod = "today",
  customDate = "",
  customStartDate = "",
  customEndDate = "",
  onPendingClick,
  onWeeklyGoalClick,
  onCardClick
}: MetricsCardsProps) {
  
  // Local timezone safe date utility helper
  const getLocalDateFromISO = (isoStr: string): string => {
    if (!isoStr) return "";
    const clean = isoStr.replace(/['"]/g, "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      return clean;
    }
    if (clean.includes("T00:00:00") || clean.includes(" 00:00:00") || clean.includes("T03:00:00")) {
      return clean.substring(0, 10);
    }
    const isUtcMidnight = (clean.endsWith("Z") || clean.includes("+00")) && (clean.includes("T00:00:00") || clean.includes(" 00:00:00"));
    if (isUtcMidnight) {
      return clean.substring(0, 10);
    }
    try {
      const d = new Date(clean);
      if (isNaN(d.getTime())) return clean.substring(0, 10);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (e) {
      return clean.substring(0, 10);
    }
  };

  // Target local dates matching user system timezone
  const localDate = new Date();
  const todayStr = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
  const targetDateStr = filterPeriod === "custom" && customDate ? customDate : todayStr;

  const oneWeekAgo = new Date();
  oneWeekAgo.setHours(0, 0, 0, 0);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  // Check if date falls in selected period
  const isDateInPeriod = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const itemLocalDate = getLocalDateFromISO(dateStr);
    
    if (filterPeriod === "today") {
      return itemLocalDate === todayStr;
    }
    if (filterPeriod === "custom") {
      if (customStartDate && customEndDate) {
        return itemLocalDate >= customStartDate && itemLocalDate <= customEndDate;
      }
      return itemLocalDate === targetDateStr;
    }
    if (filterPeriod === "week") {
      try {
        return new Date(dateStr) >= oneWeekAgo;
      } catch (e) {
        return false;
      }
    }
    return true; // "all"
  };

  // 2. Entradas do Período (O que entrou de CAIXA real no período: downPayments + parciais/baixas no período!)
  let totalRevenuePaid = 0;
  sales.forEach(sale => {
    if (sale.isBudget) return;
    if (sale.payments && sale.payments.length > 0) {
      sale.payments.forEach(payment => {
        if (isDateInPeriod(payment.date)) {
          totalRevenuePaid += payment.amount;
        }
      });
    } else {
      // Legacy fallback
      if (sale.downPayment > 0 && isDateInPeriod(sale.date)) {
        totalRevenuePaid += sale.downPayment;
      }
    }
  });

  // 1. Faturamento Total (Soma de todos os serviços/vendas fechados na data/período selecionada - Bruto Gerado)
  const salesInPeriod = sales.filter((s) => !s.isBudget && isDateInPeriod(getSaleOrderDate(s)));
  const totalSalesValue = salesInPeriod.reduce((sum, s) => sum + s.totalValue, 0);

  // 3. Pendentes de Caixa (Saldo devedor total acumulado geral não pago - Backlog)
  const totalPending = sales.filter(s => !s.isBudget).reduce((sum, sale) => sum + sale.balanceDue, 0);
  const activePendingCount = sales.filter((s) => !s.isBudget && s.balanceDue > 0).length;

  // Extra indicators (Discounts and motoboy costs are part of the order date setup)
  const totalMotoboy = sales
    .filter((s) => !s.isBudget)
    .reduce((sum, sale) => {
      const orderDate = getSaleOrderDate(sale);
      if (isDateInPeriod(orderDate) && sale.useMotoboy) {
        return sum + sale.motoboyCost;
      }
      return sum;
    }, 0);

  // 4. Custos Operacionais do período (standalone expenses + custos diretos de vendas do período + motoboy)
  const expensesInPeriod = expenses.filter((e) => {
    const isInPeriod = isDateInPeriod(e.date);
    const isWithdrawal = e.description && /retirada|sangria/i.test(e.description);
    return isInPeriod && !isWithdrawal;
  });
  const totalStandaloneExpenses = expensesInPeriod.reduce((sum, exp) => sum + exp.value, 0);
  const totalSaleOperationCost = sales
    .filter((s) => !s.isBudget)
    .reduce((sum, sale) => {
      const orderDate = getSaleOrderDate(sale);
      if (isDateInPeriod(orderDate)) {
        return sum + getSaleOperationCost(sale);
      }
      return sum;
    }, 0);
  const totalOperationCost = totalSaleOperationCost + totalStandaloneExpenses + totalMotoboy;

  // 5. Lucro Líquido Real do Período (Recebimentos do período - Custos operacionais do período)
  const totalNetProfit = totalRevenuePaid - totalOperationCost;

  const totalDiscount = sales
    .filter((s) => !s.isBudget)
    .reduce((sum, sale) => {
      const orderDate = getSaleOrderDate(sale);
      if (isDateInPeriod(orderDate)) {
        return sum + sale.discount;
      }
      return sum;
    }, 0);

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);
  };

  const periodLabelStr = 
    filterPeriod === "today" ? "hoje" : 
    filterPeriod === "week" ? "na semana" : 
    filterPeriod === "custom" ? `em ${targetDateStr.split("-").reverse().join("/")}` : 
    "acumulado";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {/* 1. Sinais Recebidos (Dinheiro de Entrada) */}
      <button
        type="button"
        id="card-entradas"
        onClick={() => onCardClick?.("entradas")}
        className="relative text-left group overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-3.5 xs:p-4 sm:p-5 hover:border-brand-cyan/40 hover:bg-slate-900/90 transition-all duration-300 cursor-pointer select-none active:scale-[0.99]"
      >
        <div className="absolute top-0 right-0 w-24 h-24 bg-brand-cyan/5 rounded-full blur-2xl group-hover:bg-brand-cyan/10 transition-all"></div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] xs:text-xs font-medium text-slate-400 uppercase tracking-wider flex flex-wrap items-center gap-1.5 leading-none">
              <span>Entradas / Sinais</span>
              <span className="text-[8px] xs:text-[9px] bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-brand-cyan font-mono tracking-tight font-bold uppercase whitespace-nowrap">
                {periodLabelStr}
              </span>
            </p>
            <h3 className="mt-1 sm:mt-2 text-lg xs:text-xl sm:text-2xl font-bold font-mono text-brand-cyan tracking-tight truncate">
              {formatBRL(totalRevenuePaid)}
            </h3>
            <p className="mt-1 sm:mt-1.5 text-[10px] xs:text-xs text-slate-400 flex flex-wrap items-center gap-1 leading-normal">
              <span className="truncate">Inflow real de caixa {filterPeriod === "today" ? "(hoje)" : filterPeriod === "week" ? "(semana)" : filterPeriod === "custom" ? "(período)" : "(acumulado)"}</span>
              <span className="text-brand-cyan font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-[9px] sm:text-[11px]">→ ver baixas</span>
            </p>
          </div>
          <div className="p-2.5 xs:p-3 bg-brand-cyan/10 rounded-xl border border-brand-cyan/20 text-brand-cyan shadow-inner group-hover:bg-brand-cyan/20 transition-colors shrink-0">
            <HandCoins className="h-4 w-4 xs:h-5 xs:w-5" />
          </div>
        </div>
      </button>

      {/* 2. Custos Operacionais (Gastos) */}
      <button
        type="button"
        id="card-custos"
        onClick={() => onCardClick?.("custos")}
        className="relative text-left group overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-3.5 xs:p-4 sm:p-5 hover:border-red-500/40 hover:bg-slate-900/90 transition-all duration-300 cursor-pointer select-none active:scale-[0.99]"
      >
        <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-all"></div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] xs:text-xs font-medium text-slate-400 uppercase tracking-wider flex flex-wrap items-center gap-1.5 leading-none">
              <span>Custos Operacionais</span>
              <span className="text-[8px] xs:text-[9px] bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-red-400 font-mono tracking-tight lowercase whitespace-nowrap">
                {periodLabelStr}
              </span>
            </p>
            <h3 className="mt-1 sm:mt-2 text-lg xs:text-xl sm:text-2xl font-bold font-mono text-red-400 tracking-tight truncate">
              {formatBRL(totalOperationCost)}
            </h3>
            <p className="mt-1 sm:mt-1.5 text-[10px] xs:text-xs text-slate-400 flex flex-wrap items-center gap-1 leading-normal">
              <span className="truncate">Gastos e insumos vinculados</span>
              <span className="text-red-400 font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-[9px] sm:text-[11px]">→ gerenciar</span>
            </p>
          </div>
          <div className="p-2.5 xs:p-3 bg-red-500/10 rounded-xl border border-red-500/20 text-red-500 shadow-inner group-hover:bg-red-500/20 transition-colors shrink-0">
            <BadgePercent className="h-4 w-4 xs:h-5 xs:w-5" />
          </div>
        </div>
      </button>

      {/* 3. Lucro Líquido Total - PROEMINENT CARD with a gorgeous dual gradient border */}
      <button
        type="button"
        id="card-lucro"
        onClick={() => onCardClick?.("lucro")}
        className="relative text-left group overflow-hidden rounded-2xl bg-gradient-to-br from-brand-card to-slate-900 border-2 border-brand-cyan/30 p-3.5 xs:p-4 sm:p-5 shadow-lg shadow-brand-cyan/5 lg:col-span-1 hover:border-brand-cyan/60 hover:bg-slate-900/90 transition-all duration-300 cursor-pointer select-none active:scale-[0.99]"
      >
        <div className="absolute -right-4 -top-4 w-32 h-32 bg-gradient-to-br from-brand-cyan to-brand-magenta opacity-10 rounded-full blur-2xl group-hover:opacity-20 transition-all"></div>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5 sm:space-y-1 min-w-0 flex-1">
            <p className="text-[9px] xs:text-[10px] font-bold text-brand-cyan uppercase tracking-wider flex flex-wrap items-center gap-1.5 leading-none">
              <span>✨ LUCRO REAL DO PERÍODO</span>
              <span className="text-[7.5px] xs:text-[8px] bg-brand-cyan/10 px-1 py-0.2 rounded border border-brand-cyan/20 text-brand-cyan font-mono lowercase tracking-normal whitespace-nowrap">
                {periodLabelStr}
              </span>
            </p>
            <h3 className="text-lg xs:text-xl sm:text-2xl font-extrabold font-mono text-transparent bg-clip-text bg-gradient-to-r from-brand-cyan via-emerald-400 to-brand-magenta tracking-tight truncate">
              {formatBRL(totalNetProfit)}
            </h3>
            <p className="text-[10px] xs:text-[11px] text-slate-300 leading-normal truncate">
              Recebimentos reais - Custos operacionais do período
            </p>
            <p className="text-[9px] xs:text-[10px] text-slate-450 italic leading-none truncate">
              (Ganhos livres no período considerado)
            </p>
          </div>
          <div className="p-2 xs:p-2.5 bg-gradient-to-r from-brand-cyan to-brand-magenta rounded-xl text-white shadow-xl shadow-brand-cyan/20 group-hover:scale-105 transition-transform duration-300 shrink-0">
            <TrendingUp className="h-3.5 w-3.5 xs:h-4 xs:w-4" />
          </div>
        </div>
      </button>

      {/* 4. Faturamento Bruto (Total Vendas) */}
      <button
        type="button"
        id="card-faturamento"
        onClick={() => onCardClick?.("faturamento")}
        className="relative text-left group overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-3.5 xs:p-4 sm:p-5 hover:border-brand-magenta/40 hover:bg-slate-900/90 transition-all duration-300 cursor-pointer select-none active:scale-[0.99]"
      >
        <div className="absolute top-0 right-0 w-24 h-24 bg-brand-magenta/5 rounded-full blur-2xl group-hover:bg-brand-magenta/10 transition-all"></div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] xs:text-xs font-medium text-slate-400 uppercase tracking-wider flex flex-wrap items-center gap-1.5 leading-none">
              <span>Entrada de Serviços</span>
              <span className="text-[8px] xs:text-[9px] bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-slate-400 font-mono tracking-tight lowercase whitespace-nowrap">
                {periodLabelStr}
              </span>
            </p>
            <h3 className="mt-1 sm:mt-2 text-lg xs:text-xl sm:text-2xl font-bold font-mono text-white tracking-tight truncate">
              {formatBRL(totalSalesValue)}
            </h3>
            <p className="mt-1 sm:mt-1.5 text-[10px] xs:text-xs text-slate-400 flex flex-wrap items-center gap-1 leading-normal">
              <span className="truncate">Valor bruto total dos serviços fechados</span>
              <span className="text-brand-magenta font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-[9px] sm:text-[11px]">→ ver lista</span>
            </p>
          </div>
          <div className="p-2.5 xs:p-3 bg-brand-magenta/10 rounded-xl border border-brand-magenta/20 text-brand-magenta shadow-inner group-hover:bg-brand-magenta/20 transition-colors shrink-0">
            <DollarSign className="h-4 w-4 xs:h-5 xs:w-5" />
          </div>
        </div>
      </button>

      {/* 5. Valores Pendentes (Clicável para controle de retiradas) */}
      <button
        type="button"
        id="card-pendentes"
        onClick={() => {
          onPendingClick?.();
          onCardClick?.("pendentes");
        }}
        className={`relative text-left group overflow-hidden rounded-2xl bg-slate-900 border p-3.5 xs:p-4 sm:p-5 transition-all duration-300 cursor-pointer select-none active:scale-[0.99] ${
          totalPending > 0
            ? "border-yellow-600/60 hover:border-yellow-500 hover:bg-slate-900/80 hover:shadow-xl hover:shadow-yellow-500/5 hover:-translate-y-0.5"
            : "border-slate-800"
        }`}
      >
        <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/5 rounded-full blur-2xl group-hover:bg-yellow-500/10 transition-all"></div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] xs:text-xs font-medium text-slate-400 uppercase tracking-wider flex flex-wrap items-center gap-1.5 leading-none">
              <span>Pendentes a Receber</span>
              {activePendingCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-yellow-500 text-slate-950 font-bold font-mono text-[8px] xs:text-[9px] scale-95 origin-left whitespace-nowrap">
                  {activePendingCount}
                </span>
              )}
            </p>
            <h3 className="mt-1 sm:mt-2 text-lg xs:text-xl sm:text-2xl font-bold font-mono text-yellow-500 tracking-tight truncate">
              {formatBRL(totalPending)}
            </h3>
            <p className="mt-1 sm:mt-1.5 text-[10px] xs:text-xs text-slate-400 truncate">
              {activePendingCount > 0 ? "👉 Clique para controlar" : "Nenhuma pendência"}
            </p>
          </div>
          <div className="p-2.5 xs:p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/20 text-yellow-500 shadow-inner group-hover:bg-yellow-400 group-hover:text-slate-950 hover:scale-105 transition-all duration-300 shrink-0">
            <ShieldAlert className="h-4 w-4 xs:h-5 xs:w-5" />
          </div>
        </div>
      </button>

      {/* 6. Acompanhamento de Metas Semanais (Clicável para abrir calendário/metas) */}
      <button
        type="button"
        id="card-metas-semanais"
        onClick={() => onWeeklyGoalClick?.()}
        className="relative text-left group overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-3.5 xs:p-4 sm:p-5 hover:border-emerald-500/40 hover:bg-slate-900/90 transition-all duration-300 cursor-pointer select-none active:scale-[0.99]"
      >
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all"></div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] xs:text-xs font-medium text-slate-400 uppercase tracking-wider flex flex-wrap items-center gap-1.5 leading-none">
              <span>Metas da Semana</span>
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold font-mono text-[8px] xs:text-[9px] uppercase whitespace-nowrap">
                7 dias
              </span>
            </p>
            <h3 className="mt-1 sm:mt-2 text-lg xs:text-xl sm:text-2xl font-bold font-mono text-emerald-400 tracking-tight truncate">
              Desempenho 🏆
            </h3>
            <p className="mt-1 sm:mt-1.5 text-[10px] xs:text-xs text-slate-400 truncate">
              👉 Ver quem bateu a meta
            </p>
          </div>
          <div className="p-2.5 xs:p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400 shadow-inner group-hover:bg-emerald-500 group-hover:text-slate-950 hover:scale-105 transition-all duration-300 shrink-0">
            <Trophy className="h-4 w-4 xs:h-5 xs:w-5" />
          </div>
        </div>
      </button>

      {/* Extra helper stats */}
      <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 bg-slate-900/60 p-2.5 xs:p-3 rounded-xl border border-slate-800 text-[11px] xs:text-xs text-slate-400 font-mono">
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-500 flex items-center gap-1 truncate"><Truck className="h-3.5 w-3.5" /> Motoboys:</span>
          <span className="text-brand-cyan font-bold whitespace-nowrap">{formatBRL(totalMotoboy)}</span>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-500 flex items-center gap-1 truncate">🏷️ Descontos:</span>
          <span className="text-brand-magenta font-bold whitespace-nowrap">{formatBRL(totalDiscount)}</span>
        </div>
        <div className="xs:col-span-2 md:col-span-1 flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-500 flex items-center gap-1 truncate"><LayoutDashboard className="h-3.5 w-3.5" /> Pedidos:</span>
          <span className="text-slate-200 font-bold whitespace-nowrap">{salesInPeriod.length}</span>
        </div>
      </div>
    </div>
  );
}
