import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Target, Award, Sparkles, TrendingUp, Compass } from "lucide-react";

interface MetaProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  dailyMetaGoal: number;
  todayNetProfitLive: number;
}

export function MetaProgressModal({
  isOpen,
  onClose,
  dailyMetaGoal,
  todayNetProfitLive,
}: MetaProgressModalProps) {
  if (!isOpen) return null;

  const current = Math.max(0, todayNetProfitLive);
  const target = Math.max(0, dailyMetaGoal);
  const missing = Math.max(0, target - current);
  const progressPercent = target > 0 ? (current / target) * 100 : 0;
  const isGoalReached = target > 0 && current >= target;

  // Circumference calculation for SVG circle (r = 38 => circumference = 238.76)
  const radius = 38;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, progressPercent) / 100) * circumference;

  // Determine motivational message based on percentage
  const getMotivationalMessage = () => {
    if (target === 0) return {
      title: "Defina uma Meta!",
      text: "Defina uma meta diária nas configurações para começar a acompanhar seu progresso diário! 📈",
      color: "text-slate-400"
    };
    if (isGoalReached) {
      return {
        title: "META ATINGIDA! 🏆",
        text: "Incrível! Meta do dia batida com muito sucesso! Parabéns a toda a equipe pelo empenho de hoje! 🎉",
        color: "text-emerald-400"
      };
    }
    if (progressPercent >= 80) {
      return {
        title: "Quase lá! 🏁",
        text: "A meta está extremamente perto! Só mais um pequeno esforço e o dia estará ganho. Vamos acelerar! 🔥",
        color: "text-sky-400"
      };
    }
    if (progressPercent >= 50) {
      return {
        title: "Metade já foi! 💪",
        text: "Passamos de 50%! O dia está fluindo muito bem. Mantenha o ritmo que a vitória é logo ali! 🚀",
        color: "text-yellow-400"
      };
    }
    if (progressPercent >= 20) {
      return {
        title: "Belo progresso! 🌟",
        text: "Excelente início de dia! Estamos avançando firme e as vendas estão decolando. Bora continuar! ⚡",
        color: "text-amber-400"
      };
    }
    return {
      title: "Primeiro passo! 🌱",
      text: "Cada grande jornada começa com uma atitude. Vamos com foco, determinação e excelência hoje! 🎯",
      color: "text-slate-300"
    };
  };

  const motivation = getMotivationalMessage();

  const formatBRL = (val: number) => {
    return val.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop glass */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/85 backdrop-blur-md"
        />

        {/* Modal Card container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", damping: 25, stiffness: 220 }}
          className="relative w-full max-w-md overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl shadow-slate-950/60"
        >
          {/* Subtle neon glow backdrops */}
          <div className="absolute -top-12 -left-12 w-36 h-36 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -right-12 w-36 h-36 bg-brand-cyan/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="relative flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-amber-400 animate-spin" style={{ animationDuration: "12s" }} />
              <h3 className="text-sm font-black text-slate-100 uppercase tracking-widest font-sans">
                Progresso da Meta Diária
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="relative py-6 flex flex-col items-center">
            {/* SVG Circular Chart */}
            <div className="relative w-48 h-48 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                {/* Background circle track */}
                <circle
                  cx="96"
                  cy="96"
                  r={radius}
                  className="stroke-slate-800 fill-none"
                  strokeWidth={strokeWidth}
                />
                {/* Animated progress circle */}
                <motion.circle
                  cx="96"
                  cy="96"
                  r={radius}
                  className={`fill-none ${
                    isGoalReached 
                      ? "stroke-emerald-500" 
                      : progressPercent >= 80 
                        ? "stroke-sky-400" 
                        : "stroke-amber-500"
                  }`}
                  strokeWidth={strokeWidth}
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                  strokeLinecap="round"
                />
              </svg>

              {/* Central Text overlay */}
              <div className="absolute flex flex-col items-center text-center">
                <motion.span
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-4xl font-black font-sans tracking-tight text-white"
                >
                  {Math.round(progressPercent)}%
                </motion.span>
                <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mt-1">
                  concluído
                </span>
              </div>
            </div>

            {/* Numbers Summary Bento Box */}
            <div className="mt-6 w-full grid grid-cols-2 gap-3">
              {/* Card 1: Achieved */}
              <div className="bg-slate-950/40 border border-slate-850/60 p-3.5 rounded-2xl flex flex-col">
                <span className="text-[10px] text-slate-450 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">
                  <Award className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  Alcançado
                </span>
                <span className="text-sm font-extrabold text-slate-100 font-mono">
                  {formatBRL(current)}
                </span>
              </div>

              {/* Card 2: Goal target */}
              <div className="bg-slate-950/40 border border-slate-850/60 p-3.5 rounded-2xl flex flex-col">
                <span className="text-[10px] text-slate-450 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">
                  <Target className="h-3.5 w-3.5 text-brand-cyan shrink-0" />
                  Meta Fixada
                </span>
                <span className="text-sm font-extrabold text-slate-100 font-mono">
                  {formatBRL(target)}
                </span>
              </div>
            </div>

            {/* Target missing value highlighted banner */}
            <div className={`mt-3 w-full p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
              isGoalReached 
                ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" 
                : "bg-amber-500/5 border-amber-500/10 text-amber-500"
            }`}>
              <div className="flex items-center gap-2">
                <Sparkles className={`h-4 w-4 ${isGoalReached ? "text-emerald-400 animate-pulse" : "text-amber-400 animate-bounce"}`} />
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  {isGoalReached ? "Superávit da Meta" : "Falta para a Meta"}
                </span>
              </div>
              <span className="text-sm font-black font-mono">
                {isGoalReached 
                  ? `+ ${formatBRL(current - target)}` 
                  : formatBRL(missing)}
              </span>
            </div>

            {/* Animated Motivational Message Area */}
            <motion.div
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, type: "spring", stiffness: 100 }}
              className="mt-6 w-full p-4 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-850 relative overflow-hidden text-center"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-2xl pointer-events-none" />
              
              <h4 className={`text-xs font-black uppercase tracking-wider mb-1.5 font-sans ${motivation.color}`}>
                {motivation.title}
              </h4>
              <p className="text-xs text-slate-350 font-medium leading-relaxed">
                {motivation.text}
              </p>
            </motion.div>
          </div>

          {/* Footer close button */}
          <div className="mt-2 flex items-center justify-end">
            <button
              onClick={onClose}
              className="w-full bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold uppercase tracking-wider py-2.5 rounded-xl border border-slate-700/60 hover:border-slate-700 transition-all text-center text-xs cursor-pointer shadow-sm active:scale-98"
            >
              Fechar Painel
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
