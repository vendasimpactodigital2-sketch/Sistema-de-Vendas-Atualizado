import React, { useState, useMemo } from "react";
import { X, Wallet, ShieldAlert, CheckCircle, Info, Calculator, FileText, ArrowRightLeft, Landmark } from "lucide-react";
import { CashRegisterState, Sale, CashRegisterSession, Expense, getSaleOperationCost, getSaleOrderDate } from "../types";

interface CashRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  cashRegister: CashRegisterState;
  sales: Sale[];
  expenses: Expense[];
  activeOperatorName: string;
  onOpenRegister: (valorAbertura: number, operador: string) => void;
  onCloseRegister: (valorFechamentoReal: number, observacoes: string) => void;
}

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
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch (e) {
    return clean.substring(0, 10);
  }
};

export function CashRegisterModal({
  isOpen,
  onClose,
  cashRegister,
  sales,
  expenses,
  activeOperatorName,
  onOpenRegister,
  onCloseRegister
}: CashRegisterModalProps) {
  // Opening states
  const [openCashInput, setOpenCashInput] = useState<string>("100.00");
  const [operatorInput, setOperatorInput] = useState<string>(activeOperatorName || "");

  // Closing states
  const [observedCashInput, setObservedCashInput] = useState<string>("");
  const [notesInput, setNotesInput] = useState<string>("");
  const [showHistory, setShowHistory] = useState<boolean>(false);

  const isClosed = !cashRegister.currentSession;

  const dailyMetaGoal = useMemo(() => {
    try {
      const savedBills = localStorage.getItem("NUCLEO_MONTHLY_BILLS");
      const savedDays = localStorage.getItem("NUCLEO_MONTHLY_WORKDAYS");
      const bills = savedBills ? JSON.parse(savedBills) : [];
      const days = savedDays ? parseInt(savedDays, 10) : 26;
      const totalBillsValue = bills.reduce((sum: number, b: any) => sum + (Number(b.value) || 0), 0);
      return days > 0 ? totalBillsValue / days : 0;
    } catch (e) {
      return 0;
    }
  }, []);

  // Helper to check if a transaction date falls precisely inside the session time range
  const isDateInSession = (dateStr: string, session: any): boolean => {
    if (!session) return false;
    if (!dateStr) return false;
    
    // Calendar day check fallback: if it's the same local calendar day as the session's opening day
    const cleanDate = getLocalDateFromISO(dateStr);
    const startLocalDate = getLocalDateFromISO(session.dataAbertura);
    const endLocalDate = getLocalDateFromISO(session.dataFechamento || new Date().toISOString());
    
    if (cleanDate === startLocalDate) {
      return true;
    }

    const openTime = new Date(session.dataAbertura).getTime();
    const closeTime = session.dataFechamento ? new Date(session.dataFechamento).getTime() : Date.now();
    
    // Check if dateStr contains hours/time (is a full ISO or timestamp)
    const isFullISO = dateStr.includes("T") || (dateStr.includes("-") && dateStr.includes(":"));
    if (isFullISO) {
      try {
        const t = new Date(dateStr).getTime();
        if (!isNaN(t)) {
          if (t >= openTime && t <= (closeTime + 2000)) {
            return true;
          }
        }
      } catch (e) {}
    }
    
    return cleanDate >= startLocalDate && cleanDate <= endLocalDate;
  };

  // Calculate live stats for the current session if open
  const sessionStats = useMemo(() => {
    if (!cashRegister.currentSession) {
      return { 
        count: 0, 
        totalSales: 0, 
        cashInflow: 0, 
        pixInflow: 0, 
        cardInflow: 0, 
        totalEntradas: 0,
        operationCosts: 0,
        expensesTotal: 0,
        totalMotoboy: 0,
        totalCustos: 0,
        lucroLiquido: 0,
        entradasServico: 0,
        expectedInDrawer: 0 
      };
    }

    const session = cashRegister.currentSession;
    const startingCash = session.valorAbertura;

    let count = 0;
    let totalSales = 0;
    let cashInflow = 0;
    let pixInflow = 0;
    let cardInflow = 0;
    let operationCosts = 0;
    let totalMotoboy = 0;
    let entradasServico = 0;

    const serviceKeywords = [
      "servico", "serviço", "arte", "impressao", "impressão", "criacao", "criação", 
      "design", "mao de obra", "mão de obra", "recarregar", "plotagem", "xerox", 
      "copia", "cópia", "taxa", "encadernacao", "encadernação", "adesivo", 
      "panfleto", "cartao", "cartão", "banner", "corte", "placa", "encadernar",
      "personaliz", "estamp"
    ];

    sales.forEach((sale) => {
      if (sale.isBudget) return;
      
      const orderDateStr = getSaleOrderDate(sale);
      if (isDateInSession(orderDateStr, session)) {
        count++;
        totalSales += sale.totalValue;
        operationCosts += getSaleOperationCost(sale);
        if (sale.useMotoboy) {
          totalMotoboy += sale.motoboyCost || 0;
        }

        // Sum individual items that qualify as services
        if (sale.items && sale.items.length > 0) {
          sale.items.forEach(item => {
            const desc = (item.description || "").toLowerCase().trim();
            const isService = serviceKeywords.some(keyword => desc.includes(keyword));
            if (isService) {
              entradasServico += Number(item.totalValue) || 0;
            }
          });
        }
      }

      // Sum payment methods by the actual time of payment!
      if (sale.payments && sale.payments.length > 0) {
        sale.payments.forEach((p) => {
          const amt = Number(p.amount) || 0;
          const method = String(p.method || "dinheiro").toLowerCase();
          const pDateStr = p.date || sale.date;
          
          if (isDateInSession(pDateStr, session)) {
            if (method === "dinheiro") {
              cashInflow += amt;
            } else if (method === "pix") {
              pixInflow += amt;
            } else {
              cardInflow += amt;
            }
          }
        });
      } else {
        const sDateStr = sale.date;
        if (isDateInSession(sDateStr, session)) {
          const meth = String(sale.paymentMethod || "dinheiro").toLowerCase();
          const amt = sale.balanceDue === 0 ? sale.totalValue : (sale.downPayment || 0);
          if (meth === "dinheiro") {
            cashInflow += amt;
          } else if (meth === "pix") {
            pixInflow += amt;
          } else {
            cardInflow += amt;
          }
        }
      }
    });

    // Sum standalone expenses created on the same local date as the active session
    let expensesTotal = 0;
    expenses.forEach((expense) => {
      if (!expense.date) return;
      if (isDateInSession(expense.date, session)) {
        expensesTotal += Number(expense.value) || 0;
      }
    });

    const totalEntradas = cashInflow + pixInflow + cardInflow;
    const totalCustos = operationCosts + expensesTotal + totalMotoboy;
    const lucroLiquido = totalEntradas - totalCustos;
    const expectedInDrawer = startingCash + cashInflow - totalCustos;

    return {
      count,
      totalSales,
      cashInflow,
      pixInflow,
      cardInflow,
      totalEntradas,
      operationCosts,
      expensesTotal,
      totalMotoboy,
      totalCustos,
      lucroLiquido,
      entradasServico,
      expectedInDrawer
    };
  }, [cashRegister.currentSession, sales, expenses]);

  const renderHistorySection = () => {
    const history = cashRegister.history || [];
    if (history.length === 0) return null;

    return (
      <div className="mt-4 pt-4 border-t border-slate-800">
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          className="w-full flex items-center justify-between text-xs font-bold text-slate-400 hover:text-slate-200 uppercase tracking-wider py-1.5 select-none"
        >
          <span className="flex items-center gap-1.5">
            <Calculator className="h-4 w-4 text-brand-cyan shrink-0" />
            Histórico e Contabilidade de Turnos ({history.length})
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            {showHistory ? "▲ Ocultar" : "▼ Visualizar"}
          </span>
        </button>

        {showHistory && (
          <div className="mt-3 space-y-3 max-h-56 overflow-y-auto pr-1">
            {history.map((session, idx) => {
              const diff = (session.valorFechamentoReal ?? 0) - (session.valorFechamentoEsperado ?? 0);
              const isAuto = session.observacoes?.includes("FECHAMENTO AUTOMÁTICO") || false;
              
              return (
                <div key={session.id || idx} className="p-3 bg-slate-950 border border-slate-850 rounded-xl space-y-2 text-[11px] text-slate-300">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-bold text-slate-200 block">
                        👤 Operador: {session.operador}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(session.dataAbertura).toLocaleDateString("pt-BR")} às {new Date(session.dataAbertura).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                      isAuto 
                        ? "bg-amber-950/45 text-amber-400 border-amber-500/20" 
                        : "bg-emerald-950/45 text-emerald-400 border-emerald-500/20"
                    }`}>
                      {isAuto ? "Automático" : "Manual"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-2 bg-slate-900 rounded border border-slate-850/60 font-mono text-slate-350">
                    <div>
                      Abertura: <strong className="text-white">R$ {session.valorAbertura.toFixed(2)}</strong>
                    </div>
                    <div>
                      Fechamento: <strong className="text-white">R$ {(session.valorFechamentoReal ?? 0).toFixed(2)}</strong>
                    </div>
                    <div className="col-span-2 text-[10px] text-slate-450 border-t border-slate-800/85 pt-1 mt-1 flex justify-between">
                      <span>Diferença / Quebra:</span>
                      <strong className={diff === 0 ? "text-emerald-400" : diff > 0 ? "text-blue-400" : "text-rose-500"}>
                        {diff === 0 ? "R$ 0,00" : diff > 0 ? `+ R$ ${diff.toFixed(2)}` : `- R$ ${Math.abs(diff).toFixed(2)}`}
                      </strong>
                    </div>
                  </div>

                  {session.observacoes && (
                    <div className="p-2.5 bg-slate-900/60 rounded border border-slate-850/60 text-[10px] font-mono text-slate-400 whitespace-pre-line leading-relaxed">
                      {session.observacoes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  const handleOpenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Math.max(0, Number(openCashInput) || 0);
    const op = operatorInput.trim() || activeOperatorName || "Operador Principal";
    onOpenRegister(val, op);
  };

  const handleCloseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const observed = Math.max(0, Number(observedCashInput) || 0);
    onCloseRegister(observed, notesInput);
    // Reset inputs
    setObservedCashInput("");
    setNotesInput("");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 bg-slate-950/85 backdrop-blur-sm overflow-y-auto animate-fade-in font-sans">
      <div 
        id="cash-register-modal-container"
        className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[96vh] sm:max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-slate-805 bg-slate-905 shrink-0">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${isClosed ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
              <Wallet className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-xs font-black text-slate-100 uppercase tracking-wider">
                {isClosed ? "Abertura de Caixa" : "Fechamento de Caixa"}
              </h3>
              <p className="text-[10px] text-slate-450 font-mono mt-0.5 leading-none">
                {isClosed ? "Inicie a sessão de hojediária" : "Relatório resumido com conciliação física"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        {isClosed ? (
          // OPEN CASHER FORM
          <form onSubmit={handleOpenSubmit} className="flex flex-col flex-grow overflow-hidden">
            <div className="flex-grow overflow-y-auto p-3 space-y-3">
              <div className="p-2.5 bg-red-950/15 border border-red-900/15 rounded-xl text-xs text-red-200 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-red-500 animate-pulse" />
                <div>
                  <span className="font-extrabold block uppercase tracking-wider text-[9px]">CAIXA FECHADO HOJE</span>
                  <span className="opacity-80 block mt-0.5 text-[11px] leading-relaxed">
                    Você precisa iniciar um novo turno de caixa digitando o valor inicial (Fundo de troco).
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Operador do Caixa 👤
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nome do operador"
                    value={operatorInput}
                    onChange={(e) => setOperatorInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg py-1.5 px-2.5 text-xs text-white focus:outline-none focus:border-brand-cyan transition-all font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Troco Inicial (Abertura) 💵
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold font-mono">
                      R$
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={openCashInput}
                      onChange={(e) => setOpenCashInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-lg py-1.5 pl-7 pr-2.5 text-xs text-brand-cyan font-mono font-bold focus:outline-none focus:border-brand-cyan transition-all"
                      placeholder="0,00"
                    />
                  </div>
                </div>
              </div>
              <span className="text-[9px] text-slate-455 block leading-tight">
                ℹ️ Dinheiro físico inicial na gaveta usado como fundo para trocos iniciais.
              </span>
              {renderHistorySection()}
            </div>

            <div className="p-3 border-t border-slate-805 bg-slate-905 flex gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-1.5 px-3 bg-slate-950 hover:bg-slate-855 border border-slate-855 text-slate-400 hover:text-white rounded-lg cursor-pointer text-xs font-bold transition-all uppercase tracking-wider"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-1.5 px-3 bg-brand-cyan hover:bg-cyan-405 text-slate-950 rounded-lg cursor-pointer text-xs font-black uppercase text-center tracking-wider transition-all"
              >
                Abrir Caixa 🚀
              </button>
            </div>
          </form>
        ) : (
          // CLOSE CASHIER FORM
          <form onSubmit={handleCloseSubmit} className="flex flex-col flex-grow overflow-hidden">
            <div className="flex-grow overflow-y-auto p-3 space-y-3">
              {/* Operator details information indicator */}
              <div className="p-2.5 bg-emerald-950/15 border border-emerald-910/25 rounded-xl text-xs text-emerald-250 flex items-start gap-2">
                <CheckCircle className="h-4.5 w-4.5 shrink-0 mt-0.5 text-emerald-400" />
                <div>
                  <span className="font-extrabold block uppercase text-[10px] tracking-wider font-mono">Sessão de Caixa Ativa</span>
                  <span className="opacity-85 block mt-0.5 text-xs text-slate-350">
                    Operador: <strong className="text-white font-bold">{cashRegister.currentSession.operador}</strong>
                  </span>
                  <span className="opacity-75 block text-[10px] mt-0.5 font-mono">
                    Aberto em: {new Date(cashRegister.currentSession.dataAbertura).toLocaleDateString("pt-BR")} às {new Date(cashRegister.currentSession.dataAbertura).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider font-mono">
                  📊 RESUMO DO EXPEDIENTE (Turno Atual)
                </span>
                
                <div className="grid grid-cols-2 gap-2">
                  {/* CARD 1: ENTRADAS */}
                  <div className="p-2 bg-slate-950 border border-slate-850 rounded-xl">
                    <span className="text-[9px] text-slate-450 uppercase tracking-widest font-black block">Entradas / Sinais</span>
                    <strong className="text-emerald-400 font-mono text-xs sm:text-sm block">
                      R$ {sessionStats.totalEntradas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                    <div className="text-[8px] sm:text-[9px] text-slate-500 font-mono space-y-0.5 mt-1 border-t border-slate-900 pt-1">
                      <div className="flex justify-between">
                        <span>Dinheiro:</span> 
                        <span className="text-slate-300">R$ {sessionStats.cashInflow.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Pix:</span> 
                        <span className="text-slate-300">R$ {sessionStats.pixInflow.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cartão:</span> 
                        <span className="text-slate-300">R$ {sessionStats.cardInflow.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* CARD 2: CUSTOS */}
                  <div className="p-2 bg-slate-950 border border-slate-850 rounded-xl">
                    <span className="text-[9px] text-slate-455 uppercase tracking-widest font-black block">Custos / Despesas</span>
                    <strong className="text-rose-450 font-mono text-xs sm:text-sm block">
                      R$ {sessionStats.totalCustos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                    <div className="text-[8px] sm:text-[9px] text-slate-500 font-mono space-y-0.5 mt-1 border-t border-slate-900 pt-1">
                      <div className="flex justify-between">
                        <span>Custo Oper.:</span> 
                        <span className="text-slate-300">R$ {sessionStats.operationCosts.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Despesas:</span> 
                        <span className="text-slate-300">R$ {sessionStats.expensesTotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Motoboy:</span> 
                        <span className="text-slate-300">R$ {sessionStats.totalMotoboy.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-900 pt-0.5 mt-0.5">
                        <span className="text-rose-450 font-bold">Meta Diária:</span> 
                        <strong className="text-rose-400">R$ {dailyMetaGoal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </div>
                    </div>
                  </div>

                  {/* CARD 3: LUCRO LIQUIDO */}
                  <div className={`p-2 border rounded-xl ${
                    sessionStats.lucroLiquido >= 0 
                      ? "bg-emerald-950/10 border-emerald-900/20" 
                      : "bg-rose-955/10 border-rose-910/20"
                  }`}>
                    <span className="text-[9px] text-slate-450 uppercase tracking-widest font-black block">Lucro Real</span>
                    <strong className={`font-mono text-xs sm:text-sm block ${sessionStats.lucroLiquido >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                      R$ {sessionStats.lucroLiquido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                    <span className="text-[8px] text-slate-500 leading-tight block pt-0.5 truncate">
                      Recebimentos - custos totais
                    </span>
                  </div>

                  {/* CARD 4: ENTRADA DE SERVICO */}
                  <div className="p-2 bg-slate-950 border border-slate-850 rounded-xl">
                    <span className="text-[9px] text-slate-450 uppercase tracking-widest font-black block">Entrada de Serviços</span>
                    <strong className="text-brand-cyan font-mono text-xs sm:text-sm block">
                      R$ {sessionStats.totalSales.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                    <span className="text-[8px] text-slate-500 leading-tight block pt-0.5 truncate">
                      Valor bruto total dos serviços
                    </span>
                  </div>
                </div>

                {/* Cash flow reconciliation details */}
                <div className="p-2 bg-slate-950 rounded-xl border border-slate-850/65 text-xs text-slate-400 space-y-1">
                  <div className="flex justify-between items-center text-slate-500 font-mono text-[9px] pb-1 border-b border-slate-900">
                    <span>Sessão:</span>
                    <span>{sessionStats.count} vendas registradas</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span>Troco Inicial de Abertura:</span>
                    <strong className="text-slate-200 font-mono">
                      R$ {cashRegister.currentSession.valorAbertura.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span>(+) Recebimento Dinheiro (Entradas Totais):</span>
                    <strong className="text-emerald-400 font-mono">
                      + R$ {sessionStats.totalEntradas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span>(-) Total em Despesa (Custos):</span>
                    <strong className="text-rose-400 font-mono">
                      - R$ {sessionStats.totalCustos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-bold border-t border-slate-900/60 pt-1 mt-1">
                    <span className="text-emerald-400">(=) Dinheiro Lucro (Lucro Real):</span>
                    <strong className="text-emerald-400 font-mono">
                      R$ {sessionStats.lucroLiquido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center pt-1.5 border-t border-slate-900 font-bold text-[11px]">
                    <span className="text-slate-300">Dinheiro Líquido Esperado na Gaveta:</span>
                    <span className="text-brand-cyan font-mono text-xs bg-slate-900 px-1.5 py-0.5 rounded leading-none font-bold">
                      R$ {sessionStats.expectedInDrawer.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Reconciliation physics counts */}
              <div className="space-y-2 pt-1.5 border-t border-slate-805/40">
                <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider font-mono">CONCILIAÇÃO FÍSICA E DIFERENÇAS</span>
                
                <div>
                  <label className="text-[10px] font-black text-brand-cyan uppercase tracking-wider block mb-1">
                    💰 VALOR FÍSICO CONTADO NA GAVETA (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold font-mono">
                      R$
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={observedCashInput}
                      onChange={(e) => setObservedCashInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-lg py-1.5 pl-7 pr-2.5 text-xs text-white font-mono font-bold focus:outline-none focus:border-brand-cyan transition-all"
                      placeholder="Dinheiro do dia + Fundo de troco"
                    />
                  </div>
                </div>

                {/* Live difference calculation indicator */}
                {observedCashInput && (
                  (() => {
                    const val = Number(observedCashInput) || 0;
                    const diff = val - sessionStats.expectedInDrawer;

                    return (
                      <div className={`p-2 rounded-lg border text-xs flex justify-between items-center ${
                        diff === 0 
                          ? "bg-emerald-950/10 border-emerald-900/30 text-emerald-400" 
                          : diff > 0 
                            ? "bg-blue-950/10 border-blue-900/30 text-blue-400" 
                            : "bg-rose-955/15 border-rose-910/25 text-rose-500"
                      }`}>
                        <span>Diferença / Quebra do Caixa:</span>
                        <strong className="font-mono font-black text-xs">
                          {diff === 0 
                            ? "✅ Caixa Perfeito" 
                            : diff > 0 
                              ? `📈 Sobra R$ ${diff.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` 
                              : `📉 Falta R$ ${Math.abs(diff).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                          }
                        </strong>
                      </div>
                    );
                  })()
                )}

                {/* Remarks observations */}
                <div>
                  <label className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Observações / Justificativas (Opcional)
                  </label>
                  <textarea
                    rows={1}
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="Se houver diferenças na contagem, justifique aqui..."
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg py-1 px-2 text-xs text-white focus:outline-none focus:border-brand-cyan transition-all resize-none font-mono"
                  />
                </div>
              </div>
              {renderHistorySection()}
            </div>

            {/* Control buttons */}
            <div className="p-3 border-t border-slate-850 bg-slate-905 flex gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-1.5 px-3 bg-slate-950 hover:bg-slate-855 border border-slate-855 text-slate-400 hover:text-white rounded-lg cursor-pointer text-xs font-bold transition-all uppercase tracking-wider"
              >
                Voltar
              </button>
              <button
                type="submit"
                className="flex-1 py-1.5 px-3 bg-rose-600 hover:bg-rose-500 text-white rounded-lg cursor-pointer text-xs font-black uppercase text-center tracking-wider transition-all"
              >
                Fechar Caixa 🔒
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
